import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	THRALL_MARK, UNLIVING_KINDS, hasThrallMark, isUnliving, recoveredHpTo, slowToHeal,
} from "../../../module/actors/character/deaths-door-actor.js";
import { UNLIVING_KINDS as CAMP_UNLIVING_KINDS } from "../../../module/camp/camp-rules.js";
import { isUnliving as campIsUnliving } from "../../../module/camp/camp-store.js";
import { applyBath, bathResultHtml } from "../../../module/actors/character/invocation-apply.js";
import { recoverBreakdown, recoverHeal } from "../../../module/actors/character/healers-arts.js";
import { buildLiveCharacter } from "../../fakes/LiveCharacter.js";

// Post-death audit (2026-09-27), B1 and R-AUTO: the Unliving (Ghost, Revenant) "gain no benefit from
// magical healing, Make Camp, Recover or Convalesce", and a Thrall's Torment's Blessing ("When you
// recover HP, recover only half the amount that you should") halves every way HP comes back.

const SCOPE = "stonetop_pwd";

/** A bare actor wearing `insert`, with `marks` ticked in its Marks section. */
function wearing(insert, marks = []) {
	const flags = { [SCOPE]: {
		postDeathInsert: { slug: insert },
		postDeathLore: { counts: Object.fromEntries(marks.map(slug => [`marks:${slug}`, 1])) },
	} };
	return { type: "character", flags, getFlag: (_s, key) => foundry.utils.getProperty(flags[SCOPE], key) };
}

/** Seed flags for buildLiveCharacter: a Thrall with Torment's Blessing marked. */
const TORMENTED = { "postDeathInsert.slug": "thrall", "postDeathLore.counts": { [`marks:${THRALL_MARK.TORMENTS_BLESSING}`]: 1 } };

describe("who is Unliving", () => {
	it("is a Ghost or a Revenant, never a Thrall or the living", () => {
		expect(isUnliving(wearing("ghost"))).toBe(true);
		expect(isUnliving(wearing("revenant"))).toBe(true);
		expect(isUnliving(wearing("thrall"))).toBe(false);
		expect(isUnliving(wearing(null))).toBe(false);
	});

	it("is the same rule the camp has always asked, named from Death's Door", () => {
		expect(CAMP_UNLIVING_KINDS).toBe(UNLIVING_KINDS);
		expect(campIsUnliving).toBe(isUnliving);
	});
});

describe("a Thrall's Marks", () => {
	it("counts a Mark only while the Thrall insert is worn", () => {
		expect(hasThrallMark(wearing("thrall", ["ravenous"]), THRALL_MARK.RAVENOUS)).toBe(true);
		expect(hasThrallMark(wearing("thrall", []), THRALL_MARK.RAVENOUS)).toBe(false);
		// Removal prunes nothing (so it can be undone); a left-over Mark is not worn.
		expect(hasThrallMark(wearing(null, ["ravenous"]), THRALL_MARK.RAVENOUS)).toBe(false);
		expect(slowToHeal(wearing("thrall", ["torments-blessing"]))).toBe(true);
		expect(slowToHeal(wearing("thrall", ["ravenous"]))).toBe(false);
	});
});

describe("recoveredHpTo (Torment's Blessing)", () => {
	it("halves the gain, rounding up, and leaves everyone else's alone", () => {
		expect(recoveredHpTo(4, 10, true)).toBe(7);
		expect(recoveredHpTo(4, 9, true)).toBe(7);
		expect(recoveredHpTo(0, 1, true)).toBe(1);
		expect(recoveredHpTo(4, 10, false)).toBe(10);
	});

	it("never touches damage or no change", () => {
		expect(recoveredHpTo(10, 4, true)).toBe(4);
		expect(recoveredHpTo(6, 6, true)).toBe(6);
	});
});

describe("StonetopCharacter's heals, for a Thrall with Torment's Blessing", () => {
	it("receiveHealing brings back half the HP, rounded up, and says it was halved", async () => {
		const { char, actor } = buildLiveCharacter({ slug: "the-heavy", name: "The Heavy", flags: TORMENTED });
		char.computedMaxHp = vi.fn(async () => 18);
		actor.system.attributes.hp.value = 4;
		const out = await char.receiveHealing({ hp: 5, moveName: "Bath of Healing Light" });
		expect(actor.system.attributes.hp.value).toBe(7);
		expect(out.hp).toEqual({ gain: 5, from: 4, to: 7, halved: true });
	});

	it("receiveHealing halves only what the max lets through", async () => {
		const { char, actor } = buildLiveCharacter({ slug: "the-heavy", name: "The Heavy", flags: TORMENTED });
		char.computedMaxHp = vi.fn(async () => 10);
		actor.system.attributes.hp.value = 8;
		await char.receiveHealing({ hp: 10 });
		// Should have recovered 2 (to the max), so recovers 1.
		expect(actor.system.attributes.hp.value).toBe(9);
	});

	it("restoreHp halves what it restores, and still brings a Thrall back from 0 with 1", async () => {
		const { char, actor } = buildLiveCharacter({ slug: "the-heavy", name: "The Heavy", flags: TORMENTED });
		actor.system.attributes.hp.value = 2;
		await char.restoreHp(10, "Dark Succor");
		expect(actor.system.attributes.hp.value).toBe(6);
		actor.system.attributes.hp.value = 0;
		await char.restoreHp(1, "Death's Door");
		expect(actor.system.attributes.hp.value).toBe(1);
	});

	// Back on their feet from out of the action is a return, not a heal (the user's ruling, 2026-09-30).
	it("restoreHp leaves an unhalved return whole", async () => {
		const { char, actor } = buildLiveCharacter({ slug: "the-heavy", name: "The Heavy", flags: TORMENTED });
		actor.system.attributes.hp.value = 0;
		await char.restoreHp(8, "Dark Succor", { clearsDeathsDoor: true, unhalved: true });
		expect(actor.system.attributes.hp.value).toBe(8);
	});

	it("restoreHp gives anyone else the whole amount", async () => {
		const { char, actor } = buildLiveCharacter({ slug: "the-heavy", name: "The Heavy" });
		actor.system.attributes.hp.value = 2;
		await char.restoreHp(10, "Battle Joy");
		expect(actor.system.attributes.hp.value).toBe(10);
	});
});

describe("Recover's arithmetic, slow to heal", () => {
	it("halves the whole Recover, care included, and the breakdown says why", () => {
		const heal = recoverHeal({ base: 4, hp: 2, max: 20, wis: 2, slow: true });
		// Should be 2 + 6 = 8; recovers 3.
		expect(heal).toMatchObject({ newHp: 5, gained: 3, halved: true });
		expect(recoverBreakdown(heal, "Gwynn")).toContain("halved, rounded up (Torment's Blessing)");
		expect(recoverHeal({ base: 4, hp: 2, max: 20 }).halved).toBe(false);
	});
});

describe("Bath of Healing Light on the Unliving", () => {
	let saved;
	beforeEach(() => { saved = globalThis.ui; globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn() } }; });
	afterEach(() => { globalThis.ui = saved; });

	it("does nothing for a Ghost, and the card says why", async () => {
		const ghost = Object.assign(wearing("ghost"), {
			name: "Wyn", system: { attributes: { hp: { value: 2, max: 10 } } },
			typedActor: { receiveHealing: vi.fn() },
		});
		const out = await applyBath(ghost, [{ key: "hp5" }, { key: "minor" }]);
		expect(ghost.typedActor.receiveHealing).not.toHaveBeenCalled();
		expect(out).toMatchObject({ patient: "Wyn", hp: null, cleared: [], minor: false, unliving: true });
		const html = bathResultHtml({ name: "Seren" }, out);
		expect(html).toContain("Wyn is Unliving and gains no benefit from magical healing");
		expect(html).not.toContain("minor condition");
	});

	it("tells the table when Torment's Blessing halved the light's HP", () => {
		const html = bathResultHtml({ name: "Seren" }, { patient: "Rook", hp: { gain: 5, from: 4, to: 7, halved: true } });
		expect(html).toContain("Rook regains HP: 4 → 7.");
		expect(html).toContain("slow to heal (Torment&#x27;s Blessing)");
	});
});
