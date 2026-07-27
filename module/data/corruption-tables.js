// The corruption "gifts" and "marks" tables (Stonetop Book II, "The Things Below",
// pp. 432 & 436) and a pure calculator that folds a set of picks onto an existing
// monster's stats to produce a corrupted being (or an emanation).
//
// A corrupted being starts with the original NPC/monster's stats, then gains up to 3
// gifts and up to 3 marks and the "corrupted" tag (p. 432). Gifts are mostly mechanical
// (extra HP/armor, harder attacks, granted moves); marks are mostly narrative (added
// tags, special qualities, behavior notes). Kept Foundry-free so applyCorruption() is
// unit-testable in isolation, like computeMonster() in monster-builder.js.

import { stepDie } from "../utils/damage-die.js";
import { normalizeTags } from "./follower-build.js";
import { byId as _byId, signedBonus } from "./table-utils.js";

// ── Gifts (1d12) — p. 432 ─────────────────────────────────────────────────────
// Pick or roll up to 3. Mechanical deltas: hpDelta / armorSet / dieSteps / damageBonus /
// addTags (attack tags); flavor: tag (a monster tag), quality (a special quality line),
// move (a granted monsterMove).
export const GIFTS = [
	{ id: 1,  label: "A terrifying presence / aura / gaze", tag: "terrifying",
	  move: { name: "Loose its terrible presence", description: "Its aura, gaze, or presence is disturbing enough that facing it can require steeling yourself." } },
	{ id: 2,  label: "An ability to pass unnoticed (in certain conditions)", tag: "stealthy",
	  move: { name: "Pass unnoticed", description: "Go unseen and unheard, at least in certain conditions." } },
	{ id: 3,  label: "Immunity to certain harms (poison, disease, fire, cold, drowning…)",
	  quality: "immune to certain harms (poison, disease, fire, cold, drowning, etc.)" },
	{ id: 4,  label: "Mind games / false sensations, inflicted on others",
	  move: { name: "Play mind games", description: "Inflict false sensations, illusions, or confusion on others." } },
	{ id: 5,  label: "Minion(s) / spirit(s) / creature(s), always lurking or called up",
	  move: { name: "Call up its minions", description: "Lesser creatures or spirits are always lurking, or can be called up as needed." } },
	{ id: 6,  label: "Regeneration / rejuvenation / immortality", tag: "hardy",
	  move: { name: "Refuse to die", description: "Regenerate, rejuvenate, heal its wounds, and get back up." } },
	{ id: 7,  label: "Serendipity / luck / hexes / misfortune, bestowed on others",
	  move: { name: "Bestow luck or misfortune", description: "Grant serendipity and luck, or lay hexes and misfortune, on others." } },
	{ id: 8,  label: "Some power to torment / bind / harm at range",
	  move: { name: "Reach out to torment", description: "Torment, bind, or harm a victim from a distance." } },
	{ id: 9,  label: "Transformation / mutation / growth",
	  move: { name: "Transform and grow", description: "Transform, mutate, or grow, reshaping itself or its victims." } },
	{ id: 10, label: "Uncanny insight / inexplicable knowledge",
	  move: { name: "Reveal uncanny insight", description: "Show inexplicable knowledge or uncanny insight into someone or something." } },
	{ id: 11, label: "Unnatural resilience (Armor 4 except vs. bronze, +4 HP)", tag: "hardy",
	  armorSet: 4, hpDelta: 4, quality: "unnatural resilience: Armor 4, but 0 vs. bronze" },
	{ id: 12, label: "Vicious / terrible / mighty physical attacks", tag: "vicious",
	  damageBonus: 2, addTags: ["forceful"] },
];

// ── Marks (1d12) — p. 436 (the corrupted-being table) ─────────────────────────
// Pick or roll up to 3. Mostly narrative: added tags, special qualities, and notes on
// how the being has changed. Two are mechanical enough to be qualities (contagion, bronze).
export const MARKS = [
	{ id: 1,  label: "Contagion / pollution / transmission of their corruption",
	  quality: "its corruption is contagious, spread by touch, blood, or proximity" },
	{ id: 2,  label: "Compulsions (per whispers and visions)",
	  note: "subject to compulsions, per whispers and visions" },
	{ id: 3,  label: "Intolerance (to something natural / pure / sacred)",
	  note: "intolerant of something natural, pure, or sacred" },
	{ id: 4,  label: "Nightmares / visions / hallucinations",
	  note: "plagued by nightmares, visions, or hallucinations" },
	{ id: 5,  label: "Physical mutations (scales, reptilian eyes, claws, warped limbs…)",
	  note: "physically mutated: scales, reptilian eyes, claws, warped limbs, etc." },
	{ id: 6,  label: "Some sort of taboo (can't cross a line of salt, can't lie…)",
	  note: "bound by a taboo (can't cross a line of salt, can't lie, etc.)" },
	{ id: 7,  label: "Strange appetites / needs / fascinations",
	  note: "driven by strange appetites, needs, or fascinations" },
	{ id: 8,  label: "Unhealthy / unnatural appearance",
	  note: "an unhealthy, unnatural appearance" },
	{ id: 9,  label: "Unwholesome presence (puts children / natural beasts on edge)",
	  note: "an unwholesome presence that puts children and natural beasts on edge" },
	{ id: 10, label: "Unnatural signs (no shadow, no reflection, aura of cold…)",
	  note: "marked by unnatural signs: no shadow, no reflection, an aura of cold, etc." },
	{ id: 11, label: "Vulnerability to bronze (its touch burns, its presence distracts)",
	  quality: "vulnerable to bronze: its touch burns, its presence distracts" },
	{ id: 12, label: "Wounds that heal slowly (but they regain HP normally)",
	  note: "its wounds heal slowly, though it regains HP normally" },
];

// A sensible default stat block for an emanation created from scratch (no source monster),
// modeled on the book's examples (Hand of Daagon, Voice of the Eternal Maw, p. 437):
// solitary, terrifying, Armor 4 (resilience) 0 vs. bronze, a d10 attack that ignores armor.
export const EMANATION_BASE = {
	hp: 19,
	armorValue: 4,
	armorSource: "resilience",
	damageValue: "d10 (ignores armor)",
	rollFormula: "d10",
	tags: ["solitary", "terrifying"],
	qualities: "0 vs. bronze",
	instinct: "",
};


/** Append attack tags into a damage line's trailing "(…)" parenthetical (or add one),
 *  de-duping case-insensitively. */
function _appendTags(prose, addTags) {
	const tags = (addTags ?? []).map(t => String(t).trim()).filter(Boolean);
	if (!tags.length) return String(prose ?? "");
	const p = String(prose ?? "").trim();
	const paren = /\(([^)]*)\)\s*$/;
	const m = p.match(paren);
	if (m) {
		const existing = m[1].split(",").map(s => s.trim()).filter(Boolean);
		for (const t of tags) if (!existing.some(e => e.toLowerCase() === t.toLowerCase())) existing.push(t);
		return p.replace(paren, `(${existing.join(", ")})`);
	}
	return p ? `${p} (${tags.join(", ")})` : `(${tags.join(", ")})`;
}

/** Format a damage bonus as a signed suffix ("+2", "-1", or "" for zero). */

/**
 * Step a damage line's die and/or bonus and splice in extra attack tags. Operates on the
 * clean `rollFormula` for the mechanical result and best-effort rewrites the prose
 * `damageValue` (which may carry a verb + tags, e.g. "gore d8+2 (hand, forceful)").
 * @returns {{ damageValue: string, rollFormula: string }}
 */
export function bumpDamage(damageValue = "", rollFormula = "", { dieSteps = 0, damageBonus = 0, addTags = [] } = {}) {
	const rf = String(rollFormula ?? "").trim();
	const dv = String(damageValue ?? "").trim();
	const dieToken = /d(12|10|8|6|4)/i;

	// The mechanical die normally lives in the clean rollFormula, but some stat blocks carry
	// the die only in the prose damage line (rollFormula blank). Fall back to the prose die so
	// a gift's die-step / bonus still lands instead of being silently dropped.
	const dieSource = rf.match(dieToken) ? rf : dv;
	const dieMatch = dieSource.match(dieToken);
	if (!dieMatch) {
		// No recognizable die anywhere — nothing to step; only annotate tags on the prose.
		return { damageValue: _appendTags(dv, addTags), rollFormula: rf };
	}

	const oldDie = "d" + dieMatch[1];
	const bonusMatch = dieSource.match(/([+-]\d+)/);
	const oldBonus = bonusMatch ? parseInt(bonusMatch[1], 10) : 0;
	const newDie = stepDie(oldDie, dieSteps);
	const newBonus = oldBonus + damageBonus;
	const newFormula = `${newDie}${signedBonus(newBonus)}`;

	const oldFormula = `${oldDie}${signedBonus(oldBonus)}`;

	let prose;
	if (dv.includes(oldFormula)) {
		prose = dv.replace(oldFormula, newFormula);
	} else if (dieToken.test(dv)) {
		// Prose die differs from the formula's: rewrite the prose die token (and any stray
		// adjacent bonus) to the stepped result so the shown die always matches the rolled die.
		prose = dv.replace(/d(12|10|8|6|4)([+-]\d+)?/i, newFormula);
	} else {
		prose = dv ? `${dv} ${newFormula}` : newFormula;
	}
	return { damageValue: _appendTags(prose, addTags), rollFormula: newFormula };
}

/** Split a tag line (array or comma string) into a clean, lowercased, de-duped list.
 *  Reuses the shared normalizeTags (trim + case-insensitive de-dup) and lowercases the
 *  result, since corrupted-being tags are matched and stored lowercase. */
const _normTags = (tags) => normalizeTags(tags).map(t => t.toLowerCase());

/**
 * Fold corruption picks onto a base stat block, producing the corrupted being's stats.
 *
 * @param {object} base  the source monster's stats: { hp, armorValue, armorSource,
 *   damageValue, rollFormula, tags (array|string), qualities (string), instinct }
 * @param {object} picks { gifts: number[], marks: number[], addEmanation?: boolean }
 * @returns {{
 *   hp:number, armorValue:number, armorSource:string,
 *   damageValue:string, rollFormula:string,
 *   tags:string[], qualities:string[], notes:string[],
 *   moves:{name:string, description:string}[]
 * }}
 */
export function applyCorruption(base = {}, picks = {}) {
	const giftDefs = (picks.gifts ?? []).map(id => _byId(GIFTS, id)).filter(Boolean);
	const markDefs = (picks.marks ?? []).map(id => _byId(MARKS, id)).filter(Boolean);

	let hp = Number(base.hp) || 0;
	let armorValue = Number(base.armorValue) || 0;
	let armorSource = String(base.armorSource ?? "");
	let dieSteps = 0;
	let damageBonus = 0;
	const addTags = [];
	const extraTags = [];
	const qualities = [];
	const notes = [];
	const moves = [];

	for (const g of giftDefs) {
		if (g.hpDelta) hp += g.hpDelta;
		if (typeof g.armorSet === "number" && g.armorSet > armorValue) {
			armorValue = g.armorSet;
			if (!/resil/i.test(armorSource)) armorSource = armorSource ? `${armorSource}, resilience` : "resilience";
		}
		if (g.dieSteps) dieSteps += g.dieSteps;
		if (g.damageBonus) damageBonus += g.damageBonus;
		if (Array.isArray(g.addTags)) addTags.push(...g.addTags);
		if (g.tag) extraTags.push(g.tag);
		if (g.quality) qualities.push(g.quality);
		if (g.move) moves.push(g.move);
	}
	for (const m of markDefs) {
		if (m.tag) extraTags.push(m.tag);
		if (m.quality) qualities.push(m.quality);
		if (m.note) notes.push(m.note);
		if (m.move) moves.push(m.move);
	}

	const dmg = bumpDamage(base.damageValue, base.rollFormula, { dieSteps, damageBonus, addTags });

	// Tag line: base tags + gift/mark tags + always "corrupted" (+ "emanation" when asked).
	const tags = _normTags([
		..._normTags(base.tags),
		...extraTags,
		"corrupted",
		...(picks.addEmanation ? ["emanation"] : []),
	]);

	// Qualities: base quality lines (split on ; or newline) + gift/mark quality lines.
	const allQualities = String(base.qualities ?? "").split(/[;\n]/).map(s => s.trim()).filter(Boolean);
	for (const q of qualities) if (!allQualities.some(x => x.toLowerCase() === q.toLowerCase())) allQualities.push(q);

	return {
		hp: Math.max(1, hp),
		armorValue,
		armorSource,
		damageValue: dmg.damageValue,
		rollFormula: dmg.rollFormula,
		tags,
		qualities: allQualities,
		notes,
		moves,
	};
}
