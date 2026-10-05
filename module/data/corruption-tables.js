// The corruption "gifts" and "marks" tables (Stonetop Book II, "The Things Below",
// p. 432, both on the "Corrupted being" page) and a pure calculator that folds a set of picks onto an existing
// monster's stats to produce a corrupted being (or an emanation).
//
// A corrupted being starts with the original NPC/monster's stats, then gains up to 3
// gifts and up to 3 marks and the "corrupted" tag (p. 432). Gifts are mostly mechanical
// (extra HP/armor, harder attacks, granted moves); marks are mostly narrative (added
// tags, special qualities, behavior notes). Kept Foundry-free so applyCorruption() is
// unit-testable in isolation, like computeMonster() in monster-builder.js.

import { stepDie, DAMAGE_DIE_RE } from "../utils/damage-die.js";
import { splitMonsterAttackProse } from "../utils/damage.js";
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
	  armorSet: 4, hpDelta: 4, quality: "unnatural resilience: Armor 4, but 0 vs. bronze",
	  // A being already above Armor 4 keeps its own armor, so its line must not claim Armor 4.
	  qualityIfArmorKept: "unnatural resilience: 0 vs. bronze" },
	{ id: 12, label: "Vicious / terrible / mighty physical attacks", tag: "vicious",
	  damageBonus: 2, addTags: ["forceful"] },
];

// ── Marks (1d12), p. 432 (beside the gifts on the corrupted-being page) ─────────
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
	qualities: "Armor 0 vs. bronze",
	instinct: "",
};

// The bronze clause the resilience gift and the emanation base both carry. A stat block says it
// once: the base already IS that resilience, so taking the gift on top must not print it twice.
const _BRONZE_ARMOR = /\b0 vs\.? bronze\b/i;


/** Append attack tags into an attack's LAST "(...)" tag list (or add one), de-duping
 *  case-insensitively both against the list and among the new tags themselves. The last list
 *  rather than a trailing one, so "d8 (hand) w/advantage" keeps a single list. */
function _appendTags(prose, addTags) {
	const tags = normalizeTags(addTags ?? []);
	const p = String(prose ?? "").trim();
	if (!tags.length) return p;
	const lists = [...p.matchAll(/\(([^)]*)\)/g)];
	const last = lists[lists.length - 1];
	if (last) {
		const merged = normalizeTags([...last[1].split(","), ...tags]);
		return `${p.slice(0, last.index)}(${merged.join(", ")})${p.slice(last.index + last[0].length)}`;
	}
	return p ? `${p} (${tags.join(", ")})` : `(${tags.join(", ")})`;
}

/** A die expression's parts: count ("" or "2"), size, and a signed bonus that may be spaced. */
const _DIE_PARTS_RE = /^(\d*)d(\d+)(?:\s*([+-])\s*(\d+))?$/i;

/** Step one die expression ("2d6", "d8 - 1", "d10+5") and add to its bonus. The dice count is
 *  kept, the bonus is read only from the expression itself, and the result is printed unspaced. */
function _stepFormula(token, dieSteps, damageBonus) {
	const m = _DIE_PARTS_RE.exec(String(token ?? "").trim());
	if (!m) return String(token ?? "");
	const oldBonus = m[3] ? (m[3] === "-" ? -1 : 1) * parseInt(m[4], 10) : 0;
	return `${m[1]}${stepDie(`d${m[2]}`, dieSteps)}${signedBonus(oldBonus + damageBonus)}`;
}

/**
 * Step a damage line's die and/or bonus and splice in extra attack tags, for EVERY attack the
 * line prints ("trample d10+5 (...), crushing hands d10+5 (...), or hurled object d10+5 (...)"
 * all gain the gift). The line is split with the same reader the stat-block sheet uses
 * (splitMonsterAttackProse), and each attack is rewritten in place, so the book's own separators
 * survive. `rollFormula` is stepped on its own; when it is blank it takes the first printed
 * attack's stepped die. A line with one printed die and a formula beside it is redrawn from the
 * formula, so the shown die always matches the rolled one.
 * @returns {{ damageValue: string, rollFormula: string }}
 */
export function bumpDamage(damageValue = "", rollFormula = "", { dieSteps = 0, damageBonus = 0, addTags = [] } = {}) {
	const rf = String(rollFormula ?? "").trim();
	const dv = String(damageValue ?? "").trim();
	const step = token => _stepFormula(token, dieSteps, damageBonus);
	const rfDie = rf.match(DAMAGE_DIE_RE)?.[0] ?? "";
	const steppedRf = rfDie ? rf.replace(rfDie, step(rfDie)) : rf;

	const attacks = splitMonsterAttackProse(dv);
	const armed = attacks.filter(a => DAMAGE_DIE_RE.test(a));
	if (!armed.length) {
		// No die printed: nothing in the prose to step. A formula-only die is stepped and printed
		// after the words, so the line still says what is rolled; the tags go on the line.
		const prose = rfDie ? (dv ? `${dv} ${steppedRf}` : steppedRf) : dv;
		return { damageValue: _appendTags(prose, addTags), rollFormula: steppedRf };
	}

	const lone = armed.length === 1 && rfDie;
	let out = "";
	let cursor = 0;
	for (const attack of attacks) {
		const at = dv.indexOf(attack, cursor);
		if (at < 0) continue;
		const token = attack.match(DAMAGE_DIE_RE)?.[0];
		let bumped = token ? attack.replace(token, step(lone ? rfDie : token)) : attack;
		// A die-less name ("none", "by weapon") is not an attack and takes no tags; one with its
		// own tag list is.
		if (token || /\([^)]*\)/.test(attack)) bumped = _appendTags(bumped, addTags);
		out += dv.slice(cursor, at) + bumped;
		cursor = at + attack.length;
	}
	out += dv.slice(cursor);
	const newFormula = rfDie ? steppedRf : step(armed[0].match(DAMAGE_DIE_RE)[0]);
	return { damageValue: out, rollFormula: newFormula };
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
	// Each gift or mark counts once however often its id is passed ("11" and 11 are one pick),
	// so a repeated id can't stack +4 HP or +2 damage twice.
	const defs = (table, ids) => [...new Set([...(ids ?? [])].map(String))].map(id => _byId(table, id)).filter(Boolean);
	const giftDefs = defs(GIFTS, picks.gifts);
	const markDefs = defs(MARKS, picks.marks);

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
		let quality = g.quality;
		if (typeof g.armorSet === "number") {
			if (g.armorSet > armorValue) {
				armorValue = g.armorSet;
				if (!/resil/i.test(armorSource)) armorSource = armorSource ? `${armorSource}, resilience` : "resilience";
			} else if (g.qualityIfArmorKept) {
				// The being's own armor already meets the gift's: only the bronze clause is new.
				quality = g.qualityIfArmorKept;
			}
		}
		if (g.dieSteps) dieSteps += g.dieSteps;
		if (g.damageBonus) damageBonus += g.damageBonus;
		if (Array.isArray(g.addTags)) addTags.push(...g.addTags);
		if (g.tag) extraTags.push(g.tag);
		if (quality) qualities.push(quality);
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
	for (const q of qualities) {
		if (allQualities.some(x => x.toLowerCase() === q.toLowerCase())) continue;
		if (_BRONZE_ARMOR.test(q) && allQualities.some(x => _BRONZE_ARMOR.test(x))) continue;
		allQualities.push(q);
	}

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
