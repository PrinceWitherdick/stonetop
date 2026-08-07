import { CatalogBrowserDialog } from "./CatalogBrowserDialog.js";
import { openOrFocus } from "../utils/open-or-focus.js";
import { facetChipsFromRows } from "../utils/catalog-filters.js";
import { packId } from "../system-id.js";
import { CREATURE_TYPES, creatureTypeIcon, creatureTypeLabel } from "../bestiary/creature-types.js";
import { isBestiaryPlaceholderImg } from "../bestiary/monster-portrait.js";
import { BESTIARY_SECTIONS, MONSTER_ORGANIZATIONS, bestiarySectionForFolder } from "../bestiary/bestiary-sections.js";
import { NPC_STATUSES, npcStatusMeta } from "../data-models/npc-status.js";
import { PERSON_DEFAULT_IMG } from "../utils/person-portrait.js";
import { isDefaultImg } from "../utils/strings.js";
// The village-is-the-default rule belongs to the module that writes the field, not to a reader.
import { HOME_STONETOP, npcHome } from "../actors/steading/steading-people.js";

const BESTIARY_PACK = packId("stonetop-bestiary");


/**
 * The two lists this browser holds, and everything that differs between them: what the tab is
 * called, what the count line calls an entry, what the search box says, and what the empty state
 * says. One row per source, so adding a third list is one entry here rather than an edit to five
 * parallel ternaries — where a missed one shows up only as the wrong noun under the wrong tab.
 *
 * What each source LOADS stays in _loadRows/_facetGroups: those bind to instance methods, and a
 * closure per row would be rebuilt on every render just to be read twice.
 */
const BESTIARY_SOURCES = [
	{
		key: "monsters", label: "Monsters", icon: "fas fa-dragon", noun: "monsters",
		search: { title: "Search monsters", placeholder: "Filter monsters…" },
		empty:  "No monsters match those filters.",
	},
	{
		key: "people", label: "People", icon: "fas fa-user-group", noun: "people",
		search: { title: "Search people", placeholder: "Filter people…" },
		empty:  "No one matches those filters. (People are the world's NPC actors — a fresh world has none until the steading roster is filled in.)",
	},
];

/**
 * Icons for the NPC lifecycle statuses. Kept here rather than in npc-status.js because they
 * are this browser's chip vocabulary, not part of what a status IS — the sheet and the
 * steading roster render the same statuses without any of these.
 *
 * `""` (the active default) is remapped to the key "active": an empty chip key is how the
 * filter layer spells "nothing lit", so a chip keyed "" could never light (see
 * utils/catalog-filters.js).
 */
const NPC_STATUS_ICONS = {
	active:  "fas fa-circle",
	away:    "fas fa-route",
	missing: "fas fa-question",
	retired: "fas fa-mug-hot",
	dead:    "fas fa-skull",
};

/** The chip key for a stored status value; "" (active) becomes "active". */
function statusKey(value) {
	return npcStatusMeta(value).value || "active";
}

/**
 * A read-only browser over everything in the world that has a face: the 212-monster bestiary
 * compendium and every NPC the world holds, in one window with a tab each.
 *
 * The compendium lists monsters as bare names in four folders, and NPCs are scattered down
 * the Actors sidebar among the PCs and followers, so neither could be looked THROUGH — you
 * could only look something up once you already knew what you wanted. This is the other
 * view: what have I got, and which of it fits the scene I'm about to run.
 *
 * GM PREP. The bestiary pack is GM/Assistant-owned (see system.json), and an NPC list is the
 * GM's own notes — status, home, who's dead — so open() refuses anyone else, and it is reached
 * only from the "Browse the Bestiary" hotbar macro and `game.stonetop.openBestiaryBrowser()`.
 *
 * The shell — search, chips, count, empty state, opening a row — is CatalogBrowserDialog,
 * shared with the Arcana browser so the two read as one tool. This class says what's in each
 * list. Its chip groups, all single-select:
 *
 *  MONSTERS  • Section — the book's own four divisions, off the pack folder
 *            • Type — the 12 creature types from Book I p.392, as their own circular art
 *            • Numbers — Solitary / Group / Horde, the tag that drives HP and damage
 *  PEOPLE    • Status — Active / Away / Missing / Retired / Dead
 *            • Home — Stonetop and every steading the NPCs actually come from
 */
export class BestiaryBrowserDialog extends CatalogBrowserDialog {
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-bestiary-browser",
			title: "Bestiary & People",
			template: "systems/stonetop_pwd/templates/dialogs/bestiary-browser.hbs",
			// Wider than the Arcana browser: the monsters carry three chip groups and one of
			// them is twelve pills long.
			width: 820,
			height: 640,
			resizable: true,
			classes: ["stonetop", "stonetop-catalog-app", "stonetop-bestiary-browser-app"],
		});
	}

	/**
	 * Open the browser, focusing an existing one rather than stacking a second copy.
	 *
	 * GM-only, and refused rather than quietly emptied — for the same reason the Arcana
	 * browser refuses: a player would get a window that looked broken instead of one that
	 * was closed. `isGM` covers Assistants, who can read the pack too.
	 *
	 * @param {string} [source] Which tab to open on ("monsters" / "people").
	 */
	static open({ source } = {}) {
		if (!game.user.isGM) {
			ui.notifications.warn("Only the GM can browse the bestiary.");
			return null;
		}
		// openOrFocus looks in BOTH window registries; a raw ui.windows scan would quietly
		// start stacking duplicates the day this dialog moves to ApplicationV2 — and a second
		// copy means a second hook trio and a second full pull of the pack.
		const dialog = openOrFocus("stonetop-bestiary-browser", () => {
			const app = new BestiaryBrowserDialog();
			if (source) app._source = source;
			return app.render(true);
		});
		// Asked for a tab the already-open window isn't on: switch it rather than leave the
		// caller looking at the other list.
		if (source && dialog && dialog._source !== source) {
			dialog._source = source;
			dialog.render(false);
		}
		return dialog;
	}

	// ---------------------------------------------------------------- staying current

	/**
	 * Both lists are live world data — a GM marks an NPC dead, renames a monster, drags a
	 * stat block out of the pack to edit — and this window is a session-long singleton, so
	 * without this it would quietly go stale under exactly the GM who was changing things.
	 *
	 * Throttled (StonetopDialog.renderThrottled) because a single edit can land as a burst of
	 * updates, and narrowed to the two Actor types this browser lists — plus, separately, to
	 * WORLD actors, since a token's synthetic copy wears its base actor's type and would sail
	 * through the type test while being in neither list.
	 *
	 * Narrowed again to the ONE list the edited actor belongs to: renaming an NPC must not
	 * throw away the monster rows, and it must not re-render at all while the monsters tab is
	 * the one on screen — the people count refreshes when that tab is next opened.
	 */
	activateListeners(html) {
		super.activateListeners(html);
		if (this._worldHook) return;
		this._worldHook = (doc) => {
			if (doc?.documentName !== "Actor") return;
			// A SYNTHETIC token actor is an ActorDelta copy and is in neither list — both are
			// built from `game.actors`. It shares its base actor's type, so the narrowing below
			// let it straight through: a follower's token taking a hit in combat re-rendered the
			// window, and a re-render rebuilds the DOM, throwing away the GM's half-typed search
			// term and their place in a 200-row list. A compendium actor is out for the same
			// reason — the monster list caches its pack rows deliberately.
			if (doc.isToken || doc.pack) return;
			if (doc.type !== "npc" && doc.type !== "monster") return;
			const source = doc.type === "npc" ? "people" : "monsters";
			this.invalidateRows(source);
			if (this.rendered && this._source === source) this.renderThrottled();
		};
		for (const hook of ["createActor", "updateActor", "deleteActor"]) Hooks.on(hook, this._worldHook);
	}

	async close(options = {}) {
		if (this._worldHook) {
			for (const hook of ["createActor", "updateActor", "deleteActor"]) Hooks.off(hook, this._worldHook);
			this._worldHook = null;
		}
		return super.close(options);
	}

	// ---------------------------------------------------------------- shell contract

	_catalogSources() {
		// Only what the tab strip renders. The rest of each row is this class's own copy and has
		// no business in the template context.
		return BESTIARY_SOURCES.map(({ key, label, icon }) => ({ key, label, icon }));
	}

	/** A source's own row, falling back to the first so an unknown key still reads sanely. */
	_sourceDef(source) {
		return BESTIARY_SOURCES.find(s => s.key === source) ?? BESTIARY_SOURCES[0];
	}

	_countNoun()          { return this._sourceDef(this._source).noun; }
	_searchLabels(source) { return this._sourceDef(source).search; }
	_emptyMessage(source) { return this._sourceDef(source).empty; }

	async _loadRows(source) {
		return source === "people" ? this._loadPeople() : this._loadMonsters();
	}

	_facetGroups(source, rows) {
		return source === "people" ? this._peopleFacets(rows) : this._monsterFacets();
	}

	// ---------------------------------------------------------------- monsters

	_monsterFacets() {
		return [
			{
				key:   "section",
				label: "Section",
				chips: BESTIARY_SECTIONS.map(s => ({ key: s.key, label: s.label, icon: s.icon, hint: s.hint })),
			},
			{
				key:      "type",
				label:    "Type",
				// A dropdown rather than chips: thirteen of them, and several ("Spirit /
				// Construct", "Corrupted / Fomoraij") have names no pill can carry. The list
				// spells each one out with its count, which the icon chips could only manage in
				// a tooltip. Each row still wears its type's disc as a badge, so the art the
				// taxonomy is taught by hasn't gone anywhere.
				control:  "select",
				allLabel: "Any type",
				chips:    CREATURE_TYPES.map(t => ({ key: t.slug, label: t.label })),
			},
			{
				key:   "organization",
				label: "Numbers",
				chips: MONSTER_ORGANIZATIONS.map(o => ({ key: o.key, label: o.label, icon: o.icon, hint: o.hint })),
			},
		];
	}

	/**
	 * Every monster stat block the world can reach: the compendium, plus any world monster
	 * actors (a GM's own creations, and the copies dragged out of the pack to be edited).
	 *
	 * A world actor with the same name as a compendium one wins and the pack copy is dropped
	 * — the same precedence the bestiary cross-reference index uses, and for the same reason:
	 * when a GM has made their own version, that is the one they mean.
	 */
	async _loadMonsters() {
		const world = [...(game.actors ?? [])].filter(a => a.type === "monster");
		const taken = new Set(world.map(a => a.name));
		const rows  = world.map(doc => this._monsterRow(doc, /* homebrew */ true));
		rows.push(...(await this._packMonsterRows()).filter(row => !taken.has(row.title)));
		rows.sort((a, b) => a.title.localeCompare(b.title));
		return rows;
	}

	/**
	 * The compendium half of the monster list, built once per window.
	 *
	 * Memoised separately from the row cache because it costs 212 document reads and a
	 * compendium cannot change under us — while the world half is re-read on every actor
	 * edit. Without the split, a GM renaming one NPC would re-pull the whole bestiary.
	 */
	async _packMonsterRows() {
		if (this._packRows) return this._packRows;
		this._packRows = (async () => {
			const pack = game.packs.get(BESTIARY_PACK);
			if (!pack) return [];
			// One query for the lot. getDocument() falls through to a getDocuments({_id}) per
			// uncached id, so asking per index entry is 212 server round-trips for the same data.
			const docs = (await pack.getDocuments()).filter(d => d.type === "monster");
			return docs.map(doc => this._monsterRow(doc, false));
		})();
		return this._packRows;
	}

	_monsterRow(doc, homebrew) {
		const sys     = doc.system ?? {};
		const type    = sys.creatureType ?? "";
		const org     = sys.organization ?? "";
		const section = bestiarySectionForFolder(doc.folder?.name);
		const concept = BestiaryBrowserDialog.summarize(sys.concept ?? "");
		const hp      = sys.attributes?.hp?.max ?? 0;
		const armor   = sys.attributes?.armor?.value ?? 0;
		// Every stat block ships wearing its creature-type disc, so "has no art" is a real
		// state for most of the pack until a GM imports the book illustrations.
		const placeholder = isBestiaryPlaceholderImg(doc.img);

		const flags = [];
		const sectionDef = BESTIARY_SECTIONS.find(s => s.key === section);
		if (sectionDef) flags.push({ label: sectionDef.label, mod: "strong" });
		if (homebrew)   flags.push({ label: "World" });

		const badges = [];
		if (type) badges.push({ label: creatureTypeLabel(type), img: creatureTypeIcon(type), hint: "Creature type" });
		if (org)  badges.push({ label: MONSTER_ORGANIZATIONS.find(o => o.key === org)?.label ?? org, hint: "How many of them there are" });
		if (hp)   badges.push({ label: `${hp} HP`, hint: armor ? `${armor} armor — ${sys.attributes?.armor?.source || "armor"}` : "Hit points" });
		if (sys.size) badges.push({ label: sys.size, hint: "Size" });

		return {
			key:   doc.uuid,
			uuid:  doc.uuid,
			title: doc.name,
			img:   placeholder ? (creatureTypeIcon(type) ?? doc.img ?? PERSON_DEFAULT_IMG) : doc.img,
			placeholderImg: placeholder,
			summary: concept,
			// The monster's own tag line, which is prose on the stat block and reads as prose
			// here — and is the thing a GM actually searches ("something stealthy and hardy").
			note:  sys.tags ?? "",
			flags,
			badges,
			facets: { section, type, organization: org },
			// `attributes.instinct.value`, not the NPC's flat `system.instinct` — a monster keeps
			// its instinct inside `attributes` (MonsterModel), so the NPC row's expression read
			// undefined here and no monster's instinct was searchable at all.
			search: BestiaryBrowserDialog.searchIndex(
				doc.name, concept, sys.tags, sys.attributes?.instinct?.value,
				creatureTypeLabel(type), org, sys.size, sectionDef?.label,
			),
		};
	}

	// ---------------------------------------------------------------- people

	_peopleFacets(rows) {
		return [
			{
				key:   "status",
				label: "Status",
				chips: NPC_STATUSES.map(s => ({
					key:   statusKey(s.value),
					label: s.label,
					icon:  NPC_STATUS_ICONS[statusKey(s.value)],
					hint:  s.inactive ? `${s.label} — no longer an active presence` : s.label,
				})),
			},
			{
				key:   "home",
				label: "Home",
				// Built from the world rather than a fixed list: which steadings the NPCs come
				// from is a fact about this campaign. Stonetop leads, being where it happens.
				chips: facetChipsFromRows(rows, "home", { first: HOME_STONETOP })
					.map(chip => ({ ...chip, hint: chip.key === HOME_STONETOP ? "Lives in Stonetop itself" : `Lives in ${chip.label}` })),
			},
		];
	}

	/** Every NPC actor in the world. Sorted by name; the status chips do the triage. */
	async _loadPeople() {
		return [...(game.actors ?? [])]
			.filter(a => a.type === "npc")
			.map(doc => this._personRow(doc))
			.sort((a, b) => a.title.localeCompare(b.title));
	}

	_personRow(doc) {
		const sys    = doc.system ?? {};
		const status = npcStatusMeta(sys.status);
		// A blank `home` means a resident of Stonetop itself — the steading sheet's Neighbors
		// column only fills it in for people from somewhere else. Normalised to a real name so
		// it can be a chip key at all (see the empty-key rule in utils/catalog-filters.js).
		const home   = npcHome(doc);
		const placeholder = isDefaultImg(doc.img);

		const flags = [{ label: status.label, mod: status.inactive ? "bad" : "" }];
		if (home !== HOME_STONETOP) flags.push({ label: home });

		const badges = [];
		if (sys.pronouns)  badges.push({ label: sys.pronouns, hint: "Pronouns" });
		if (sys.occupation) badges.push({ label: sys.occupation, hint: "What they do" });
		if (sys.hasStats)  badges.push({ label: "Has stats", icon: "fas fa-shield-halved", hint: "Carries the optional combat overlay — HP, armor, damage, GM moves" });

		// Their instinct is the anchor field the book tells a GM to look at when they don't
		// know what an NPC would do (p.457), so it leads; relations answer "who is this to
		// anyone?", which is the other thing you scan a list of people for.
		const summary = [sys.instinct, sys.relations].map(s => (s ?? "").trim()).filter(Boolean).join(" · ");

		return {
			key:   doc.uuid,
			uuid:  doc.uuid,
			title: doc.name,
			img:   placeholder ? PERSON_DEFAULT_IMG : doc.img,
			placeholderImg: placeholder,
			inactive: status.inactive,
			summary,
			note:  (sys.traits ?? "").trim(),
			flags,
			badges,
			facets: { status: statusKey(sys.status), home },
			search: BestiaryBrowserDialog.searchIndex(
				doc.name, sys.occupation, sys.traits, sys.instinct, sys.relations,
				sys.pronouns, home, status.label,
			),
		};
	}
}
