import { CatalogBrowserDialog } from "./CatalogBrowserDialog.js";
import { openOrFocus } from "../utils/open-or-focus.js";
import { stripHtmlToText } from "../utils/strings.js";
import { MinorArcanum } from "../model/MinorArcanum.js";
import { ITEM_FLAG_SCOPE, ARCANA_PACK } from "../actors/character/StonetopFlags.js";
import { isMajorArcanumItem, arcanumCardImg } from "../arcana-icons.js";
import { STONETOP_ITEM_ICONS } from "../utils/item-icon.js";
import { ARCANUM_KINDS, ARCANUM_TIERS, arcanumKinds, arcanumTier } from "../data/arcana-facets.js";
import { CURSE_FILTERS, arcanumCurse } from "../data/arcana-curses.js";

/**
 * A read-only browser over every arcanum in the world: the shipped compendium plus any
 * homebrew cards authored as world Items, in one filterable list.
 *
 * The tab on a character sheet only ever shows the cards that character holds, and the
 * compendium lists 82 bare item names, so there was nowhere to simply LOOK at the arcana —
 * to find the ones that summon something, or the ones whose curse you'd regret. This is
 * that view. It writes nothing: filtering is one viewer's lens, and clicking a row opens
 * the card's own sheet.
 *
 * GM PREP, not a player tool. Half of what it's for is reading the curses on cards the
 * players haven't found yet, so it is reached from the "Browse the Arcana" hotbar macro
 * (seeded GM-only in hooks/Ready.js) and from `game.stonetop.openArcanaBrowser()`, and
 * there is deliberately no button for it anywhere on a character sheet. See open().
 *
 * Everything about how it LOOKS and FILTERS lives in CatalogBrowserDialog, which the
 * Bestiary & People browser shares; this class only says what's in the list. Its three
 * chip groups, all single-select:
 *
 *  • TIER — Major / Minor. The only group that truly partitions the list.
 *  • GRANTS — Relic / Power / Conduit, derived per card by arcanumKinds(). These OVERLAP
 *    (most relics also grant a move), so the chips read as "show me the cards that do
 *    this", not as buckets that partition the list.
 *  • CURSES — Ruinous / Grim / Mild, the graded Consequences tracks, plus Ungraded for a
 *    homebrew major whose track this system has not presumed to rank (see arcana-curses.js;
 *    the chips come from there, so a grading can never exist without a chip to find it by).
 *    Only Major arcana have those, so lighting a curse chip necessarily narrows to majors —
 *    and Minor + any curse is legitimately empty, which the empty state says out loud.
 */
export class ArcanaBrowserDialog extends CatalogBrowserDialog {
	constructor({ ownedSlugs = [] } = {}, options = {}) {
		super(options);
		// Which cards the character who opened this already holds, for the "held" badge.
		// Passed in rather than read off an actor so the browser works with no actor at all
		// (a GM opening it from a macro), and so it never has to know how a sheet stores it.
		this._ownedSlugs = new Set(ownedSlugs);
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-arcana-browser",
			title: "Arcana",
			template: "systems/stonetop_pwd/templates/dialogs/arcana-browser.hbs",
			// Wide enough for the three chip groups and their labels to sit on one line at the
			// default UI font; the bar wraps rather than clipping when they don't.
			width: 780,
			height: 620,
			resizable: true,
			classes: ["stonetop", "stonetop-catalog-app", "stonetop-arcana-browser-app"],
		});
	}

	/**
	 * Open the browser, focusing an existing one rather than stacking a second copy —
	 * it's a reference window, and two of them filtered differently is just confusing.
	 *
	 * GM-only, and refused rather than quietly emptied. The arcana compendium is already
	 * GM/Assistant-owned (see the pack ownership in system.json), so a player who reached
	 * this would get a window listing nothing but the world's homebrew cards — which reads
	 * as a bug rather than as a door that isn't theirs. `isGM` is true for Assistants too,
	 * which is exactly who else can read the pack.
	 */
	static open({ ownedSlugs = [] } = {}) {
		if (!game.user.isGM) {
			ui.notifications.warn("Only the GM can browse the arcana.");
			return null;
		}
		// openOrFocus looks in BOTH window registries; a raw ui.windows scan would quietly
		// start stacking duplicates the day this dialog moves to ApplicationV2.
		return openOrFocus("stonetop-arcana-browser",
			() => new ArcanaBrowserDialog({ ownedSlugs }).render(true));
	}

	_countNoun() { return "arcana"; }

	_searchLabels() {
		return { title: "Search arcana", placeholder: "Filter arcana…" };
	}

	_emptyMessage() {
		// Minor + any curse chip is a real, reachable, empty combination — only majors carry
		// a Consequences track — so the line says why rather than leaving it a mystery.
		return "No arcana match those filters. (Only Major arcana carry a Consequences track.)";
	}

	// ---------------------------------------------------------------- facets

	_facetGroups() {
		return [
			{ key: "tier",  label: "Tier",   chips: ARCANUM_TIERS.map(t => ({ key: t.key, label: t.label, icon: t.icon, hint: t.hint })) },
			{ key: "kind",  label: "Grants", chips: ARCANUM_KINDS.map(k => ({ key: k.key, label: k.label, icon: k.icon, hint: k.hint })) },
			// Every grading arcanumCurse can hand back, chip list and all, straight from the module
			// that does the grading — including "Ungraded", the homebrew majors. A facet value with
			// no chip is HIDDEN by every chip in its group rather than merely unfilterable, so the
			// two lists have to be one (see arcana-curses.js#CURSE_FILTERS).
			{
				key:   "curse",
				label: "Curses",
				chips: CURSE_FILTERS.map(c => ({ key: c.key, label: c.label, icon: c.icon, hint: c.hint, mod: c.key })),
			},
		];
	}

	// ---------------------------------------------------------------- loading

	/**
	 * Every arcanum available in this world: the compendium first, then homebrew world
	 * Items. A homebrew card that reuses a shipped slug is skipped rather than listed
	 * twice — the shipped card wins on slug, matching FoundryArcanaRepository's precedence.
	 */
	async _loadRows() {
		const docs = [...await this._packDocs(), ...this._worldDocs()];
		const seen = new Set();
		const rows = [];
		for (const doc of docs) {
			const flags = doc.flags?.[ITEM_FLAG_SCOPE] ?? {};
			if (!flags.slug || seen.has(flags.slug)) continue;
			seen.add(flags.slug);
			rows.push(this._buildRow(doc, flags));
		}
		// Majors first (there are 18 of them and they're what people come looking for),
		// then alphabetical within each tier.
		rows.sort((a, b) => (b.isMajor - a.isMajor) || a.title.localeCompare(b.title));
		return rows;
	}

	async _packDocs() {
		const pack = game.packs.get(ARCANA_PACK);
		if (!pack) return [];
		// One query for the lot. getDocument() falls through to a getDocuments({_id}) per
		// uncached id, so asking per index entry is 82 server round-trips for the same data.
		return (await pack.getDocuments()).filter(doc => doc.system?.moveType === "arcanum");
	}

	_worldDocs() {
		return [...(game.items ?? [])].filter(i => i.type === "move" && i.system?.moveType === "arcanum");
	}

	/** One browser row from an arcanum Item document. */
	_buildRow(doc, flags) {
		// Rebuild the model so kinds / curses are read through exactly the same accessors
		// the sheet uses. Front and back are defaulted because a half-authored homebrew
		// card can be missing one, and a browser that throws on it would be useless.
		const arc   = new MinorArcanum({ ...flags, front: flags.front ?? {}, back: flags.back ?? {}, img: doc.img });
		const kinds = arcanumKinds(arc);
		const curse = arcanumCurse(arc);
		const tier  = arcanumTier(arc);
		const title = arc.front?.title || doc.name || arc.slug;
		const note  = stripHtmlToText(arc.front?.item?.note ?? "");
		const held  = this._ownedSlugs.has(arc.slug);
		// Only the majors have card art; all 64 minors fall back to the books' triple-spiral
		// arcanum mark — the same marker an un-illustrated arcanum Item already wears in the
		// sidebar, so the browser and the item directory agree on what "no art" looks like.
		// It's a CATEGORY marker, not a picture of any one card, which is why it can head 64
		// different rows without claiming anything about them.
		const cardImg = arcanumCardImg(arc);
		// Hoisted: the row shows it and the search index covers it, and it is the longest
		// field on the card — summarising it twice per row parses the same prose twice.
		const summary = ArcanaBrowserDialog.summarize(arc.front?.description ?? "");

		const flagChips = [{ label: tier === "major" ? "Major" : "Minor", mod: tier === "major" ? "strong" : "" }];
		if (held)      flagChips.push({ label: "Held", mod: "good" });
		if (!doc.pack) flagChips.push({ label: "Homebrew" });

		const badges = kinds.map(key => {
			const kind = ARCANUM_KINDS.find(k => k.key === key);
			return { label: kind.label, icon: kind.icon, hint: kind.hint };
		});
		if (curse) badges.push({ label: curse.label, icon: curse.icon, hint: curse.cost, mod: curse.key });

		return {
			key:      arc.slug,
			uuid:     doc.uuid,
			title,
			isMajor:  isMajorArcanumItem(arc),
			img:      cardImg ?? STONETOP_ITEM_ICONS.arcanum,
			// Dims the mark so the 18 cards with real art still lead the eye down the list.
			placeholderImg: !cardImg,
			marked:   held,
			summary,
			note,
			flags:    flagChips,
			badges,
			facets:   { tier, kind: kinds, curse: curse?.key ?? "" },
			// Built here rather than walked out of the DOM at search time so the search covers
			// the curse's cost line, which the row shows only as a tooltip.
			search:   ArcanaBrowserDialog.searchIndex(
				title, tier, summary, note,
				arc.back?.move?.name, arc.back?.resource?.title,
				badges.map(b => b.label), curse?.cost,
			),
		};
	}
}
