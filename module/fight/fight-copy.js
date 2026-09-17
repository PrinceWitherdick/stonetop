// The Fight tab's own words: the short lines it computes, beside the book's (fight-rules.js).
//
// PURE. Every function takes the localizer as `format(key, data)` so it can be tested against the
// real language file without Foundry. The strings live under `stonetop.fight.*` in languages/en.json.
//
// OUR LINES SAY NUMBERS, THE BOOK SAYS RULES. A computed line names who and how much ("+1 damage on
// Crinwin (2 attackers)"); the rule that makes it so is quoted underneath in the book's words. A
// paraphrase of a rule is how a sheet ends up teaching the table something the book never said.

import { joinNames } from "../utils/strings.js";
import { HEROES, FOES } from "./engagements.js";

const KEY = "stonetop.fight";

/**
 * A list of names for a sentence: "Bram", "Bram & Aeliana", "Bram, Aeliana & Cadi", and past `max`
 * names "Bram, Aeliana & 3 others", so a crowd does not turn one line into a paragraph.
 */
export function namesPhrase(names, format, { max = 3 } = {}) {
	const list = (Array.isArray(names) ? names : []).filter(Boolean);
	if (list.length <= max) return joinNames(list);
	const shown = list.slice(0, Math.max(1, max - 1));
	return format(`${KEY}.names.andOthers`, { names: shown.join(", "), count: list.length - shown.length });
}

/**
 * What a fighter's row says they are doing: "fighting Crinwin; shooting at the Wolf", or, for a foe,
 * "fought by Bram & Aeliana; shot at by Cadi". Empty when they are not engaged.
 *
 * @param {{melee: string[], shootingAt: string[], shotBy: string[]}} entry  engage().byFighter[id]
 * @param {"heroes"|"foes"} side
 * @param {(id: string) => string} nameOf
 */
export function fighterReadout(entry, side, nameOf, format) {
	if (!entry) return "";
	const names = ids => namesPhrase(ids.map(nameOf), format);
	const parts = [];
	if (entry.melee?.length) parts.push(format(`${KEY}.readout.${side === FOES ? "foughtBy" : "fighting"}`, { names: names(entry.melee) }));
	if (entry.shootingAt?.length) parts.push(format(`${KEY}.readout.shootingAt`, { names: names(entry.shootingAt) }));
	if (entry.shotBy?.length) parts.push(format(`${KEY}.readout.shotBy`, { names: names(entry.shotBy) }));
	return parts.join(format(`${KEY}.readout.joiner`, {}));
}

/**
 * The count badge on a fighter being ganged up on, or null. A foe counts everyone attacking it; a
 * hero counts the foes in contact with them (foes do not target, so contact is all there is to go on).
 *
 * @returns {{count: number, label: string}|null}
 */
export function gangedBadge(entry, side, format) {
	if (!entry?.ganged) return null;
	const count = entry.attackerBodies;
	return { count, label: format(`${KEY}.badge.${side === FOES ? "foughtBy" : "facing"}`, { count }) };
}

/**
 * The computed lines for one engagement: the damage bonus on each fighter being ganged up on
 * (p.414), and the group-against-group numbers when both sides bring a group (p.416).
 *
 * @param {object} cluster                       engage().clusters[i]
 * @param {object} byFighter                      engage().byFighter
 * @param {(id: string) => string} nameOf
 * @returns {string[]}
 */
export function clusterFacts(cluster, byFighter, nameOf, format) {
	if (!cluster) return [];
	const facts = [];
	for (const [ids, key] of [[cluster.foeIds, "onFoe"], [cluster.heroIds, "onHero"]]) {
		for (const id of ids ?? []) {
			const entry = byFighter?.[id];
			if (entry?.ganged) facts.push(format(`${KEY}.fact.${key}`, { bonus: entry.pileOn, name: nameOf(id), count: entry.attackerBodies }));
		}
	}
	const groups = cluster.groups;
	if (groups) {
		const data = { heroes: groups.heroGroupBodies, foes: groups.foeGroupBodies, bonus: groups.bonus };
		facts.push(groups.bonus > 0
			? format(`${KEY}.fact.groups`, { ...data, side: format(`${KEY}.fact.${groups.bigger === HEROES ? "sideHeroes" : "sideFoes"}`, {}) })
			: format(`${KEY}.fact.groupsEven`, data));
	}
	return facts;
}

/**
 * Which of the book's passages (fight-rules.js) speak to this engagement, in reading order.
 * Duplicates are fine: fightRuleQuotes keeps the first.
 */
export function clusterRuleKeys(cluster, byFighter) {
	if (!cluster) return [];
	const keys = [];
	if ((cluster.foeIds ?? []).some(id => byFighter?.[id]?.ganged)) keys.push("oneRollsOthersAid", "pileOnDamage");
	if ((cluster.heroIds ?? []).some(id => byFighter?.[id]?.ganged)) keys.push("engagesMultiple", "pileOnDamage", "hurtMultiple");
	const groups = cluster.groups;
	if (groups) {
		keys.push("groupAsOne");
		if (groups.bonus > 0) keys.push("groupOutnumbers");
		keys.push("groupCasualties");
		if (groups.individuals) keys.push("engagedByPcs");
		keys.push("routed");
	}
	return keys;
}
