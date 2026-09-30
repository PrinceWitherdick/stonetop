// What a post-death Consequence brings to a roll (the user's ruling R-AUTO and B14, 2026-09-27):
//  - DISTURBING (Ghost) and DEATHLY VISAGE (Revenant): "When you use intimidation and your disturbing
//    presence [sinister appearance] to Persuade, you have advantage." An unticked line in Persuade's roll
//    window, as Intimidating's is: the fiction decides.
//  - UNSTABLE (Ghost, Revenant): "When you roll a 6-, the GM can choose to have you enter such a rage." A
//    reminder on the 6- row of every roll card, whatever the move.

import { describe, it, expect, vi } from "vitest";
import { buildLiveCharacter } from "../../fakes/LiveCharacter.js";

function dead({ slug = "ghost", counts = {} } = {}) {
	const rolled = name => ({ _id: `${name}-1`, name, type: "move", system: { rollType: "cha" }, roll: vi.fn(async () => ({ total: 5 })) });
	const persuade = rolled("Persuade (vs. NPCs)");
	const persuadePcs = rolled("Persuade (vs. PCs)");
	const defy = rolled("Defy Danger");
	const made = buildLiveCharacter({
		slug: "the-heavy", name: "The Heavy", seedStartingMoves: false,
		flags: { "postDeathInsert.slug": slug, "postDeathLore.counts": counts },
	});
	const items = [...made.actor.items, persuade, persuadePcs, defy];
	items.get = id => items.find(i => i._id === id) ?? null;
	made.actor.items = items;
	const roll = (item, prompted) => made.char.onRoll({
		currentTarget: { closest: sel => (sel === ".item" ? { dataset: { itemId: item._id } } : null), getAttribute: () => null },
	}, prompted);
	return { ...made, persuade, persuadePcs, defy, roll };
}
const keysOf = async (char, item) => (await char.rollOffers(item)).map(o => o.key);
const rolledWith = item => item.roll.mock.calls[0][0];

describe("Disturbing and Deathly Visage on Persuade", () => {
	it("offers a Ghost's Disturbing on either Persuade, unticked, and on nothing else", async () => {
		const { char, persuade, persuadePcs, defy } = dead({ counts: { "consequences:disturbing": 1 } });
		const [line] = await char.rollOffers(persuade);
		expect(line).toMatchObject({ key: "disturbing", applied: false, source: "Disturbing" });
		expect(line.label).toContain("disturbing presence");
		expect(await keysOf(char, persuadePcs)).toEqual(["disturbing"]);
		expect(await keysOf(char, defy)).toEqual([]);
	});

	it("offers a Revenant's Deathly Visage, and taken it is advantage named on the card", async () => {
		const { char, persuade, roll } = dead({ slug: "revenant", counts: { "consequences:deathly-visage": 1 } });
		expect(await keysOf(char, persuade)).toEqual(["deathly-visage"]);
		await roll(persuade, { takenOffers: ["deathly-visage"] });
		expect(rolledWith(persuade).rollMode).toBe("adv");
		expect(rolledWith(persuade).conditionNotes).toContain("Deathly Visage");
	});

	it("offers neither while it is unmarked, or once the insert is gone", async () => {
		expect(await keysOf(dead().char, dead().persuade)).toEqual([]);
		const removed = dead({ slug: null, counts: { "consequences:disturbing": 1 } });
		expect(await keysOf(removed.char, removed.persuade)).toEqual([]);
	});
});

describe("Unstable's reminder on a 6-", () => {
	it("rides the 6- row of a move roll, and only that row", async () => {
		const { defy, roll } = dead({ counts: { "consequences:breakdown": 1, "consequences:unstable": 1 } });
		await roll(defy, {});
		const { tierActions } = rolledWith(defy);
		expect(tierActions.failure).toContain("Unstable:");
		expect(tierActions.failure).toContain("the GM can choose to have you enter");
		expect(tierActions.success ?? "").not.toContain("Unstable");
		expect(tierActions.partial ?? "").not.toContain("Unstable");
	});

	it("rides a roll with no move item behind it too", async () => {
		const { char } = dead({ slug: "revenant", counts: { "consequences:unstable": 1 } });
		const folded = char._foldStandingNotes({ tierActions: { failure: "<p>before</p>" } });
		expect(folded.tierActions.failure).toMatch(/^<p>before<\/p>.*Unstable/);
	});

	it("is not on the card of someone who is not Unstable", async () => {
		const { defy, roll } = dead({ counts: { "consequences:breakdown": 1 } });
		await roll(defy, {});
		expect(rolledWith(defy).tierActions?.failure ?? "").not.toContain("Unstable");
	});
});
