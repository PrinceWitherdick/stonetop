// MAKE CAMP for the followers fed at the fire (Book I p.248: "A PC or follower regains HP when ...
// they Make Camp, and choose to regain HP"). The user's ruling: when a camp settles, each follower who
// was fed regains half their max HP, rounded up, capped at their max, and a note says who regained
// what. The followers a camp feeds are the ones travelling with the party, of every kind
// (follower-party.js, the one reading of that toggle): the animal companion, the crew, initiates,
// beasts, and custom followers.
//
// Written where the Followers tab's HP boxes write, the same places Bath of Healing Light heals: one
// follower's box at follower-fate.js#followerFateHpPath with the revive followerReviveUpdate pairs it
// with (as invocation-apply.js#restoreFollowerCardHp writes it), and a group's members, the crew's
// roster or a custom group's, through group-hits.js#rosterHpUpdate, member by member (p.473). A
// follower or member at 0 HP is not raised: what happens to them is the GM's call (p.469, the fate
// dialog), not a night's sleep, so they are left as they are and the note says so. One marked dead,
// or a group member marked fallen, never ate and is never touched.

import { groupFollowerMembers } from "../utils/crew.js";
import { rosterHpUpdate, rosterMemberHp } from "../fight/group-hits.js";
import { followerFateHpPath, followerReviveUpdate } from "../actors/character/follower-fate.js";
import { readableFlags, STONETOP_SCOPE } from "../actors/character/StonetopFlags.js";
import { partyFollowers } from "../actors/character/follower-party.js";
import { count, healTo } from "./camp-rules.js";

/** A group: the crew, or a custom follower fought and counted as a group. */
function isGroup(follower, flags) {
	return follower.ftype === "crew" || (follower.ftype === "custom" && !!flags?.customFollowers?.[follower.slug]?.isGroup);
}

/** One member's max HP in a group: the crew's per-member HP, a custom group's member HP. */
function memberMax(follower) {
	return count(follower.ftype === "crew" ? (follower.memberHp ?? follower.hpMax) : (follower.groupMemberHp ?? follower.hpMax));
}

/**
 * What a settled camp does for one character's fed followers. PURE.
 *
 * @param {object} flags  the character's resolved system flags
 * @param {object[]} followers  the character's follower records (follower-roster.js#followerRoster);
 *   only the ones travelling with the party, alive, are healed (partyFollowers)
 * @returns {{update: object, healed: Array<{name: string, from: number, to: number}>, down: string[]}}
 */
export function campFollowerHeals(flags, followers = []) {
	const update = {};
	const healed = [];
	const down = [];
	for (const fol of partyFollowers(followers)) {
		const slug = fol.slug ?? "";
		const name = String(fol.name ?? "").trim() || "A follower";
		if (!isGroup(fol, flags)) {
			const path = followerFateHpPath(fol.ftype, slug);
			const max = count(fol.hpMax);
			if (!path || !max || typeof fol.hpMax !== "number") continue;
			const from = Math.min(max, count(fol.hpCurrent));
			if (from <= 0) { down.push(name); continue; }
			const to = healTo(from, Math.ceil(max / 2), max);
			if (to > from) {
				Object.assign(update, { [`flags.${STONETOP_SCOPE}.${path}`]: to }, followerReviveUpdate(fol.ftype, slug, to, flags) ?? {});
				healed.push({ name, from, to });
			}
			continue;
		}
		const max = memberMax(fol);
		if (!max) continue;
		const roster = { ftype: fol.ftype, slug };
		const hpByKey = {};
		for (const member of groupFollowerMembers(flags, roster, { down: true }).filter(m => !m.dead)) {
			const who = `${name}: ${member.name}`;
			const from = rosterMemberHp(flags, roster, member.key, max);
			if (from <= 0) { down.push(who); continue; }
			const to = healTo(from, Math.ceil(max / 2), max);
			if (to > from) {
				hpByKey[member.key] = to;
				healed.push({ name: who, from, to });
			}
		}
		if (Object.keys(hpByKey).length) Object.assign(update, rosterHpUpdate(flags, roster, hpByKey));
	}
	return { update, healed, down };
}

/** The note's rows for a camp's follower heals (campFollowerHeals' answer, or a shortfall's). */
export function campFollowerRows({ healed = [], down = [] } = {}, { fed = 0, party = 0 } = {}) {
	if (fed > 0 && fed < party) {
		return [{
			label: "Followers",
			value: `Only ${fed} of ${party} followers were fed at the fire, so none regained HP here: the table says who ate, and their HP goes on by hand (half their max, rounded up).`,
		}];
	}
	const rows = [];
	if (healed.length) {
		rows.push({ label: "Followers", value: `Half their max HP, rounded up: ${healed.map(h => `${h.name} ${h.from} → ${h.to}`).join("; ")}.` });
	}
	if (down.length) {
		rows.push({ label: "Still down", value: `${down.join(", ")} at 0 HP: the night does not raise them, and what happens to them is the GM's call.` });
	}
	return rows;
}

/**
 * One character's fed followers, settled: the HP update to fold into their share's write, and the
 * note's rows. `entry.followersFed` is how many mouths beside their own the camp fed (camp-rules.js
 * #freezeCampPlan); `partyMouths` is how many of theirs travel with them (partyFollowerMouths), and
 * `followers` their party followers (follower-roster.js#partyFollowersOf), null when not read. When
 * fewer were fed than travel with them, nobody can say which went hungry, so none are healed and the
 * note says so.
 */
export async function campFollowerShare(actor, entry, { partyMouths = 0, followers = null } = {}) {
	const fed = count(entry?.followersFed);
	if (!fed || !actor) return { update: {}, rows: [] };
	const party = count(partyMouths);
	if (fed < party) return { update: {}, rows: campFollowerRows({}, { fed, party }) };
	if (!Array.isArray(followers)) return { update: {}, rows: [] };
	const heals = campFollowerHeals(readableFlags(actor), followers);
	return { update: heals.update, rows: campFollowerRows(heals) };
}
