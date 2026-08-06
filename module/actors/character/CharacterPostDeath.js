import {
	PostDeathInsertSnapshotBuilder,
	PostDeathSectionSnapshotBuilder,
} from "../../model/PostDeathInsertSnapshot.js";
import { hasFillBlank } from "../../utils/fill-blanks.js";
import {
	LoreOptionSnapshotBuilder,
	LoreEntrySnapshotBuilder,
	LoreSection,
	InstinctOptionSnapshotBuilder,
	InstinctSection,
	MoveSnapshotBuilder,
} from "../../model/CharacterSnapshot.js";
import { composeInstinct, stripHtmlToText } from "../../utils/strings.js";
import { clampInt } from "../../utils/custom-move-data.js";
import { zeroHpResolution } from "./deaths-door.js";

export class CharacterPostDeath {
	constructor(insertFlags, instinct, lore, insertRepo, moveRepo) {
		this._insertFlags = insertFlags;
		this._instinct    = instinct;
		this._lore        = lore;
		this._insertRepo  = insertRepo;
		this._moveRepo    = moveRepo;
	}

	get activeSlug()       { return this._insertFlags.getFlag("slug") ?? null; }
	async setActiveSlug(s) { await this._insertFlags.setFlag("slug", s); }
	get instinct()         { return this._instinct; }
	get lore()             { return this._lore; }

	// ── The 0-HP moves' bookkeeping (Undying / Tethered / Dark Succor) ─────────
	// Consequences, Marks and Favor are all lore options on the insert, so marking one is a
	// lore count. Two things have no lore option to live in and are stored beside the slug:
	// the Marks a Thrall has crossed off (a permanent "you can never gain this", which is not
	// the same as simply not having it) and the task their master set them.

	/** Mark slugs the Thrall can never gain — Dark Succor's "cross off a Mark that you don't have". */
	get crossedOffMarks() {
		const stored = this._insertFlags.getFlag("crossedOff");
		return Array.isArray(stored) ? stored : [];
	}

	async crossOffMark(slug) {
		if (!slug || this.crossedOffMarks.includes(slug)) return false;
		// Written as a whole array: object flags merge, arrays replace, and this is a set.
		await this._insertFlags.setFlag("crossedOff", [...this.crossedOffMarks, slug]);
		return true;
	}

	/** "Your master gives you a task; until you complete it, your Favor stays at 0." */
	get masterTask()          { return this._insertFlags.getFlag("task") ?? ""; }
	async setMasterTask(text) { await this._insertFlags.setFlag("task", String(text ?? "").trim()); }

	/**
	 * The Ghost's tether: "Choose something to which you are bound: your mortal remains, the
	 * place where you died, an object of personal significance, etc." The insert prints no box
	 * for it, but Tethered turns on it every time the Ghost drops to 0 HP — it's where they
	 * reform, and losing it is the Final Consequence — so it's recorded here.
	 */
	get tether()          { return this._insertFlags.getFlag("tether") ?? ""; }
	async setTether(text) { await this._insertFlags.setFlag("tether", String(text ?? "").trim()); }

	/**
	 * One lore section's options with their current state, for a move that says "mark a
	 * consequence" or "gain a Mark" and needs to offer the ones still available.
	 *
	 * `requires` is honoured (the Revenant's Unstable needs Breakdown first), as is a crossed-off
	 * Mark, which is gone for good.
	 */
	async sectionOptions(sectionSlug) {
		const data = this.activeSlug ? await this._insertRepo.findBySlug(this.activeSlug) : null;
		const section = (data?.lore ?? []).find(e => e.slug === sectionSlug);
		if (!section) return [];

		const crossed = this.crossedOffMarks;
		return (section.options ?? [])
			.filter(o => (o.type ?? "checkbox") !== "text")
			.map(o => {
				const marked = this._lore.getCount(sectionSlug, o.slug) > 0;
				const blocked = !!o.requires && this._lore.getCount(sectionSlug, o.requires) <= 0;
				return {
					slug:        o.slug,
					label:       optionLabel(o.description),
					description: o.description ?? "",
					marked,
					crossedOff:  crossed.includes(o.slug),
					// Can't be taken now: already held, crossed off for good, or its prerequisite
					// option isn't marked yet.
					blocked:     marked || crossed.includes(o.slug) || blocked,
					requires:    o.requires ?? null,
				};
			});
	}

	/** Tick one lore option (a consequence, a Mark). Returns false if it was already marked. */
	async markSectionOption(sectionSlug, optionSlug) {
		if (!optionSlug) return false;
		if (this._lore.getCount(sectionSlug, optionSlug) > 0) return false;
		await this._lore.setCount(sectionSlug, optionSlug, 1);
		return true;
	}

	/**
	 * Where this insert's roll track lives in its lore, if it has one — the Thrall's Favor is
	 * the only such track today, and its coordinates are the resolution table's to state (see
	 * deaths-door.js), not this file's to retype.
	 */
	_rollTrack() {
		return zeroHpResolution(this.activeSlug)?.roll?.loreCount ?? { entry: "favor", option: "favor-track" };
	}

	/** The Thrall's current Favor (0-3), read from its own track. */
	favor() {
		const { entry, option } = this._rollTrack();
		return this._lore.getCount(entry, option);
	}

	async setFavor(value) {
		const { entry, option } = this._rollTrack();
		await this._lore.setCount(entry, option, clampInt(value, 0, 3));
	}

	async buildSnapshot() {
		const slug       = this.activeSlug;
		const allEntries = await this._insertRepo.getAll();

		let activeInsert = null;
		if (slug) {
			const data = await this._insertRepo.findBySlug(slug);
			if (data) {
				const moves   = await this._moveRepo.getPostDeathMoves(slug);
				const crossed = this.crossedOffMarks;
				// An insert whose 0-HP move disperses them binds them to a tether: it's what
				// they reform beside. The resolution table says which insert that is (the
				// Ghost's Tethered), on the same terms the walkthrough reads it.
				const boundToTether = !!zeroHpResolution(slug)?.disperses;
				activeInsert = new PostDeathInsertSnapshotBuilder()
					.withSlug(data.slug)
					.withName(data.name)
					.withImg(data.img)
					.withDescription(data.description)
					.withInstinct(_buildInstinctSection(data.instincts, this._instinct.selectedValue))
					.withLore(buildLoreSection(data.lore, this._lore, null, crossed))
					.withMoves(_buildMoveSnapshots(moves))
					// Three records the printed insert has no box for, but whose moves depend on
					// them: Dark Succor's crossed-off Marks and master's task, and the Ghost's tether.
					.withCrossedOffMarks(_crossedOffLabels(data.lore, crossed))
					.withMasterTask(this.masterTask)
					.withTether(boundToTether ? this.tether : "")
					.withNeedsTether(boundToTether && !this.tether)
					.build();
			}
		}
		return new PostDeathSectionSnapshotBuilder()
			.withActiveSlug(slug)
			.withActiveInsert(activeInsert)
			.withAvailableInserts(allEntries)
			.build();
	}
}

/**
 * How much an insert's marked options take off the character's max HP.
 *
 * Six of the Thrall's nine Marks open with "Reduce your max HP by 2", and a Thrall accumulates
 * them, so the penalty has to be live rather than a one-off write — un-marking a Mark has to give
 * the hit points back, and there is nowhere on the sheet to park a manual adjustment that would.
 *
 * Read from the printed text rather than a hand-maintained slug list: the phrase is fixed and
 * appears verbatim on every Mark that carries it, so a homebrew Mark written the same way is
 * honoured for free and no pack rebuild is needed to teach the system a new one.
 */
const _HP_PENALTY_RE = /reduce your max\.?\s*hp by (\d+)/i;

export function insertHpPenalty(loreSection) {
	let total = 0;
	for (const entry of loreSection?.entries ?? []) {
		for (const opt of entry.options ?? []) {
			if (!opt.count) continue;
			const n = Number(stripHtmlToText(opt.description).match(_HP_PENALTY_RE)?.[1]);
			if (Number.isFinite(n)) total += n;
		}
	}
	return total;
}

/** Display labels for the crossed-off Mark slugs, resolved against the insert's own Marks list. */
function _crossedOffLabels(loreData, slugs) {
	if (!slugs.length) return [];
	const marks = (loreData ?? []).find(e => e.slug === "marks")?.options ?? [];
	return slugs.map(slug => ({
		slug,
		label: optionLabel(marks.find(o => o.slug === slug)?.description) || slug,
	}));
}

/**
 * A short name for a lore option, for a picker that can't afford the option's full prose.
 * The book prints these as "**BREAKDOWN** — You lash out in…", so the leading bold word(s) are
 * the name; anything else falls back to the first clause of the stripped text.
 */
export function optionLabel(description) {
	const html = String(description ?? "");
	const bold = html.match(/<strong>(.*?)<\/strong>/i)?.[1];
	const plain = stripHtmlToText(bold ?? html);
	if (bold) return plain;
	// No bold lead (the Thrall's Impulse lines, say): take up to the first dash or full stop.
	return plain.split(/\s+—\s+|\.\s/)[0].slice(0, 60).trim();
}

// Exported so StonetopCharacter can reuse it for the playbook lore section.
// `arcanaDisplay` (Seeker only) carries the chosen major arcanum and the drawn
// minor cards. Lore entries/options opt in via the data flags `arcanaImage`
// (entry) and `arcanaRole` (option), so this stays playbook-agnostic.
export function buildLoreSection(loreData, loreState, arcanaDisplay = null, crossedOff = []) {
	const crossed = new Set(crossedOff);
	const entries = loreData.map(entry => {
		const options = (entry.options ?? []).map(opt => {
			const isText = (opt.type ?? "checkbox") === "text";
			// A pick option may carry an inline fill-in blank (e.g. "… running for your
			// life from ___"). Its written value shares the lore.texts store, so load it as
			// the option's textValue even though the option is a checkbox, not a text field.
			const hasBlank = !isText && hasFillBlank(opt.description);
			const builder = new LoreOptionSnapshotBuilder()
				.withSlug(opt.slug)
				.withDescription(opt.description)
				.withType(opt.type ?? "checkbox")
				.withMax(isText ? 0 : (opt.max ?? 1))
				.withCount(isText ? 0 : loreState.getCount(entry.slug, opt.slug))
				.withCrossedOff(crossed.has(opt.slug))
				.withTextValue((isText || hasBlank) ? loreState.getText(entry.slug, opt.slug) : null);
			if (arcanaDisplay && opt.arcanaRole) {
				const selectedSlug = arcanaDisplay.roles?.[opt.arcanaRole] ?? "";
				builder.withArcanaPicker({
					role:         opt.arcanaRole,
					options:      arcanaDisplay.minorOptions,
					selectedSlug,
					selectedName: arcanaDisplay.minorOptions.find(o => o.slug === selectedSlug)?.name ?? "",
					muted:        opt.arcanaRole === "lead",
				});
			}
			return builder.build();
		});
		const builder = new LoreEntrySnapshotBuilder()
			.withSlug(entry.slug)
			.withTitle(entry.title)
			.withDescription(entry.description ?? "")
			.withOptions(options)
			.withColumnBreak(entry.columnBreak)
			.withReadonlyMerge(entry.readonlyMerge)
			.withContinuation(entry.continuation)
			.withSubheader(entry.subheader);
		if (arcanaDisplay?.major && entry.arcanaImage) {
			builder.withArcanaImage(arcanaDisplay.major);
		}
		return builder.build();
	});
	return new LoreSection(entries);
}

function _buildInstinctSection(instincts, selectedValue) {
	const options = (instincts ?? []).map(({ word, description }) => {
		const value = composeInstinct(word, description);
		return new InstinctOptionSnapshotBuilder()
			.withWord(word)
			.withDescription(description)
			.withValue(value)
			.withSelected(selectedValue === value)
			.build();
	});
	return new InstinctSection(selectedValue || null, options);
}

function _buildMoveSnapshots(entries) {
	return entries.map(e => new MoveSnapshotBuilder()
		.withId(e.id)
		.withCompendiumId(e.id)
		.withOwnedId(null)
		.withName(e.name)
		.withDescription(e.description ?? "")
		.withRollType(e.rollType)
		.withIsStarting(false)
		.withSource({ type: "post-death" })
		.withSourceLabel(null)
		.withOwned(false)
		.withOwnedIds([])
		.withLocked(false)
		.withRequirement(null)
		.withRequiresLabel(null)
		.withResource(null)
		.withRepeat(null)
		.withRepeatable(false)
		.build()
	);
}
