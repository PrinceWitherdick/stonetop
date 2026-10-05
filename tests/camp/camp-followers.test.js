import { afterEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { campFollowerHeals, campFollowerRows, campFollowerShare } from "../../module/camp/camp-followers.js";
import { applyCampShares, hostCamp, joinCamp, partyFollowerMouths, setCampChoices, settleCamp } from "../../module/camp/camp-store.js";
import { campParty, restoreCampWorld } from "../fakes/camp.js";
import { partyFollowersOf } from "../../module/actors/character/follower-roster.js";

// Who travels with a character is read from their flags and playbook (follower-roster.js); here each
// test says who directly. Unset, nobody.
vi.mock("../../module/actors/character/follower-roster.js", async importOriginal => ({
	...(await importOriginal()),
	partyFollowersOf: vi.fn(async () => []),
}));

/**
 * MAKE CAMP for the followers the meal fed, and for a character dying at the fire (wounds audit
 * #9 and #10, and the follow-up that brought the built-in followers in; the user's rulings of
 * 2026-10-02):
 *  - Book I p.79: "Each member of the party must consume 1 use", and p.248: "A PC or follower
 *    regains HP when ... they Make Camp". Every follower travelling with the party (follower-party.js)
 *    is a mouth, and each one fed regains half their max HP, rounded up, capped at their max; a note
 *    says who regained what. A group is healed member by member (p.473). A follower at 0 HP is left
 *    to the GM's call (the fate dialog, p.469), and a dead one, or a group member marked fallen,
 *    never ate.
 *  - p.240 and p.245: a PC at Death's Door "can't save themselves"; whoever tends them Aids the roll.
 *    So the night restores a dying character no HP.
 */

afterEach(restoreCampWorld);

const CUSTOM_HP = slug => `flags.${SYSTEM_ID}.customFollowers.${slug}.hpCurrent`;
const card = (over) => ({ slug: "", party: true, ...over });

describe("the followers a camp fed", () => {
	it("gives each half their max HP, rounded up, and never past it", () => {
		const cards = [
			card({ ftype: "custom", slug: "hound", name: "Hound", hpMax: 7, hpCurrent: 1 }),
			card({ ftype: "custom", slug: "mule", name: "Mule", hpMax: 6, hpCurrent: 5 }),
		];
		const { update, healed } = campFollowerHeals({ customFollowers: { hound: {}, mule: {} } }, cards);
		expect(update).toEqual({ [CUSTOM_HP("hound")]: 5, [CUSTOM_HP("mule")]: 6 });
		expect(healed).toEqual([{ name: "Hound", from: 1, to: 5 }, { name: "Mule", from: 5, to: 6 }]);
	});

	// The built-in followers heal where their HP boxes write, as Bath of Healing Light heals them.
	it("heals an animal companion, an initiate and a beast in their own HP boxes", () => {
		const cards = [
			card({ ftype: "animal-companion", name: "Wolf", hpMax: 10, hpCurrent: 2 }),
			card({ ftype: "initiate", slug: "enfys", name: "Enfys", hpMax: 6, hpCurrent: 1 }),
			card({ ftype: "beast", slug: "ox", name: "Ox", hpMax: 9, hpCurrent: 3 }),
		];
		expect(campFollowerHeals({}, cards).update).toEqual({
			[`flags.${SYSTEM_ID}.animalCompanion.hpCurrent`]: 7,
			[`flags.${SYSTEM_ID}.initiatesHp.enfys`]: 4,
			[`flags.${SYSTEM_ID}.beastHp.ox`]: 8,
		});
	});

	it("heals the crew member by member on its roster, past the down", () => {
		const flags = { crew: { name: "The Wolves", size: 3, individuals: [{ name: "Bryn" }], individualsHp: { 0: 1 }, memberHp: [0, null] } };
		const { update, healed, down } = campFollowerHeals(flags, [card({ ftype: "crew", name: "The Wolves", memberHp: 6, hpMax: 6 })]);
		// Bryn at 1 gains 3; the first anonymous member is down; the second is unset (full).
		expect(update).toEqual({ [`flags.${SYSTEM_ID}.crew.individualsHp.0`]: 4 });
		expect(healed).toEqual([{ name: "The Wolves: Bryn", from: 1, to: 4 }]);
		expect(down).toHaveLength(1);
	});

	it("leaves out a follower not with the party, one marked dead, and one already whole", () => {
		const cards = [
			card({ ftype: "custom", slug: "home", party: false, hpMax: 6, hpCurrent: 1 }),
			card({ ftype: "custom", slug: "lost", dead: true, hpMax: 6, hpCurrent: 1 }),
			card({ ftype: "custom", slug: "whole", hpMax: 6, hpCurrent: 6 }),
		];
		expect(campFollowerHeals({}, cards)).toEqual({ update: {}, healed: [], down: [] });
	});

	it("does not raise a follower at 0 HP, and says so", () => {
		const heals = campFollowerHeals({}, [card({ ftype: "animal-companion", name: "Wolf", hpMax: 6, hpCurrent: 0 })]);
		expect(heals.update).toEqual({});
		expect(heals.down).toEqual(["Wolf"]);
		expect(campFollowerRows(heals)[0]).toMatchObject({ label: "Still down" });
		expect(campFollowerRows(heals)[0].value).toContain("the GM's call");
	});

	it("heals a custom group member by member on the roster, past the fallen and the down", () => {
		const flags = { customFollowers: {
			band: { isGroup: true, size: 4, memberHp: [1, null, 0, 2], memberDead: [null, null, null, true] },
		} };
		const { update, healed, down } = campFollowerHeals(flags, [card({ ftype: "custom", slug: "band", name: "The Band", groupMemberHp: 5, hpMax: 5 })]);
		// Member 1 at 1 gains 3; member 2 is unset (full); member 3 is down; member 4 fell and is skipped.
		expect(update).toEqual({ [`flags.${SYSTEM_ID}.customFollowers.band.memberHp`]: [4, null, 0, 2] });
		expect(healed.map(h => [h.from, h.to])).toEqual([[1, 4]]);
		expect(down).toHaveLength(1);
	});

	it("names who regained what on the note", () => {
		const rows = campFollowerRows({ healed: [{ name: "Hound", from: 1, to: 5 }] });
		expect(rows).toEqual([{ label: "Followers", value: "Half their max HP, rounded up: Hound 1 → 5." }]);
	});

	// Nobody can say which followers went hungry, so none is healed, and the note asks the table.
	it("heals nobody when fewer were fed than travel with them, and says why", async () => {
		const share = await campFollowerShare({ flags: {} }, { followersFed: 1 }, { partyMouths: 2, followers: [card({ ftype: "crew" })] });
		expect(share.update).toEqual({});
		expect(share.rows[0].value).toContain("Only 1 of 2 followers were fed");
	});

	it("does nothing for a plan that fed no followers, one frozen before this, or with no followers read", async () => {
		expect(await campFollowerShare({}, { followersFed: 0 }, { partyMouths: 1, followers: [] })).toEqual({ update: {}, rows: [] });
		expect(await campFollowerShare({}, {}, { partyMouths: 1, followers: [] })).toEqual({ update: {}, rows: [] });
		expect(await campFollowerShare({ flags: {} }, { followersFed: 1 }, { partyMouths: 1, followers: null })).toEqual({ update: {}, rows: [] });
	});
});

describe("a character's mouths at the fire", () => {
	it("counts every party follower, built-in and custom alike", () => {
		const { aeliana } = campParty({ aeliana: { followers: { band: { party: true, isGroup: true, size: 3 } } } });
		aeliana.flags[SYSTEM_ID].crew = { name: "The Wolves", size: 4 };
		const cards = [
			card({ ftype: "animal-companion" }),
			card({ ftype: "crew" }),
			card({ ftype: "initiate", slug: "enfys" }),
			card({ ftype: "custom", slug: "band" }),
			card({ ftype: "beast", slug: "ox", party: false }),
		];
		expect(partyFollowerMouths(aeliana, cards)).toBe(1 + 4 + 1 + 3);
	});

	// No sheet to read: the flags still know a crew (in by default) and the custom followers.
	it("falls back on a crew and the custom followers when none were read", () => {
		const { aeliana } = campParty({ aeliana: { followers: { hound: { party: true } } } });
		aeliana.flags[SYSTEM_ID].crew = { name: "The Wolves", size: 4 };
		expect(partyFollowerMouths(aeliana)).toBe(5);
		aeliana.flags[SYSTEM_ID].crew.party = false;
		expect(partyFollowerMouths(aeliana)).toBe(1);
	});
});

describe("a settled camp, paid", () => {
	/** Aeliana hosting with her companion, Bram beside her, and Aeliana paying for all three mouths. */
	async function settledWith(cards) {
		const party = campParty();
		partyFollowersOf.mockImplementation(async actor => actor === party.aeliana ? cards : []);
		const camp = await hostCamp(party.aeliana);
		await joinCamp(party.bram, camp);
		await setCampChoices(party.aeliana, { "offer.supplies": 3 });
		await settleCamp(camp);
		party.aeliana.update.mockClear();
		globalThis.ChatMessage.create.mockClear();
		return party;
	}

	it("feeds the companion at the fire, heals it in the character's own share, and posts the note", async () => {
		const { aeliana } = await settledWith([card({ ftype: "animal-companion", name: "Wolf", hpMax: 8, hpCurrent: 1 })]);
		expect(aeliana.flags[SYSTEM_ID].camp.followers).toBe(1);
		await applyCampShares(aeliana);
		expect(aeliana.update).toHaveBeenCalledTimes(1);
		expect(aeliana.update).toHaveBeenCalledWith(
			expect.objectContaining({ [`flags.${SYSTEM_ID}.animalCompanion.hpCurrent`]: 5 }), { stonetopMove: "Make Camp" });
		const note = globalThis.ChatMessage.create.mock.calls.map(c => c[0].content).join("");
		expect(note).toContain("Wolf 1 → 5");
	});

	it("restores no HP to a character dying at the fire, and says why on the card", async () => {
		const party = campParty();
		party.aeliana.typedActor.canFaceDeathsDoor = true;
		party.aeliana.system.attributes.hp.value = 0;
		const camp = await hostCamp(party.aeliana);
		await joinCamp(party.bram, camp);
		await setCampChoices(party.aeliana, { "offer.supplies": 2 });
		await settleCamp(camp);
		const summary = globalThis.ChatMessage.create.mock.calls.map(c => c[0].content).join("");
		expect(summary).toContain("Dying, so the night restores no HP");
		await applyCampShares(party.aeliana);
		expect(party.aeliana.system.attributes.hp.value).toBe(0);
	});
});
