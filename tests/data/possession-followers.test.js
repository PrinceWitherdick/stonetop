import { describe, it, expect, vi } from "vitest";
import {
	possessionFollower, possessionFollowerSizeChoices, availablePossessionFollowers, POSSESSION_FOLLOWER_CATALOG,
} from "../../module/data/possession-followers.js";
import { buildCustomFollower } from "../../module/data/follower-build.js";
import { stubAsk } from "../fakes/confirm.js";

// Playbook possession-followers (the Would-be Hero's dog, the Ranger's Hounds, the
// Blessed's Mastiffs): mirrored as buildCustomFollower inputs so the Followers tab
// can offer a one-click "Add as follower".

describe("possessionFollower", () => {
	it("returns the dog as a single follower with a stable source", () => {
		const dog = possessionFollower("a-good-dog");
		expect(dog.name).toBe("Good dog");
		expect(dog.isGroup).toBeFalsy();
		expect(dog.sourceUuid).toBe("possession:a-good-dog");
	});

	// "follower (☐ retriever or ☐ herder, keen-nosed, clever)": the pick is the player's.
	it("leads the dog's tags with the retriever or herder the player picked", () => {
		expect(possessionFollower("a-good-dog", ["retriever"]).tags).toEqual(["retriever", "keen-nosed", "clever"]);
		expect(possessionFollower("a-good-dog", ["herder"]).tags).toEqual(["herder", "keen-nosed", "clever"]);
	});

	it("leaves the dog's choice off, rather than guessing, when nothing is picked", () => {
		const dog = possessionFollower("a-good-dog");
		expect(dog.tags).toEqual(["keen-nosed", "clever"]);
		expect(dog.choiceTags).toBeUndefined();
	});

	it("returns the Ranger's Hounds and Blessed's Mastiffs as groups", () => {
		expect(possessionFollower("hounds").isGroup).toBe(true);
		expect(possessionFollower("hounds").size).toBe(2);
		expect(possessionFollower("mastiffs").isGroup).toBe(true);
	});

	it("returns null for a non-follower possession", () => {
		expect(possessionFollower("a-sturdy-sword")).toBeNull();
		expect(possessionFollower(undefined)).toBeNull();
	});

	it("every catalog entry carries a possession:<slug> source", () => {
		for (const [slug, entry] of Object.entries(POSSESSION_FOLLOWER_CATALOG)) {
			expect(entry.sourceUuid).toBe(`possession:${slug}`);
		}
	});
});

describe("availablePossessionFollowers", () => {
	it("offers the follower-granting possessions the character holds", () => {
		const offers = availablePossessionFollowers(["a-good-dog", "a-sturdy-sword", "hounds"]);
		expect(offers.map(o => o.slug)).toEqual(["a-good-dog", "hounds"]);
	});

	it("skips ones already materialized (deduped by sourceUuid)", () => {
		const present = new Set(["possession:hounds"]);
		const offers = availablePossessionFollowers(["a-good-dog", "hounds"], present);
		expect(offers.map(o => o.slug)).toEqual(["a-good-dog"]);
	});

	it("returns nothing when the character holds no follower possessions", () => {
		expect(availablePossessionFollowers(["a-sturdy-sword", "an-old-map"])).toEqual([]);
		expect(availablePossessionFollowers([])).toEqual([]);
	});
});

// "Hounds, 2-3 followers" (the Ranger), "Mastiffs, 2-3 followers" (the Blessed): the headcount is
// the player's, asked when the group is added.
describe("a possession-follower group's headcount", () => {
	it("lists the printed range to ask between, and nothing for a single follower", () => {
		expect(possessionFollowerSizeChoices("hounds")).toEqual([2, 3]);
		expect(possessionFollowerSizeChoices("mastiffs")).toEqual([2, 3]);
		expect(possessionFollowerSizeChoices("a-good-dog")).toEqual([]);
		expect(possessionFollowerSizeChoices("a-sturdy-sword")).toEqual([]);
	});

	it("takes the chosen size into the group, and 2 when none or an unlisted one is given", () => {
		expect(possessionFollower("hounds", [], { size: 3 }).size).toBe(3);
		expect(buildCustomFollower(possessionFollower("hounds", [], { size: 3 })).size).toBe(3);
		expect(possessionFollower("hounds", [], { size: null }).size).toBe(2);
		expect(possessionFollower("hounds", [], { size: 7 }).size).toBe(2);
		expect(POSSESSION_FOLLOWER_CATALOG.hounds.size).toBe(2);
	});
});

const { createStonetopCharacterSheetClass } = await import("../../module/actors/character/StonetopCharacterSheet.js");

describe("adding the Hounds from the Followers tab", () => {
	function sheetWithHounds() {
		const flags = { possessions: { selected: ["hounds"] }, customFollowers: {} };
		const actor = {
			flags: { "stonetop-pwd": flags },
			getFlag: (_scope, key) => key.split(".").reduce((o, k) => o?.[k], flags),
			update: vi.fn(async upd => {
				for (const [k, v] of Object.entries(upd)) flags.customFollowers[k.split(".").at(-1)] = v;
			}),
		};
		const Sheet = createStonetopCharacterSheetClass(class {
			get actor() { return actor; }
			get isEditable() { return true; }
			render() {}
		});
		return { sheet: new Sheet(), flags };
	}
	const added = flags => Object.values(flags.customFollowers);

	it("asks how many, naming each answer, and files the group at the size picked", async () => {
		const ask = stubAsk("3");
		const { sheet, flags } = sheetWithHounds();

		await sheet._onAddPossessionFollower("hounds");

		const { content, buttons } = ask.mock.calls[0][0];
		expect(content).toContain("How many hounds?");
		expect(buttons.map(b => b.label)).toEqual(["2 hounds", "3 hounds"]);
		expect(added(flags)).toHaveLength(1);
		expect(added(flags)[0]).toMatchObject({ name: "Hounds", isGroup: true, size: 3 });
	});

	it("files 2 when the ask is closed", async () => {
		stubAsk(null);
		const { sheet, flags } = sheetWithHounds();
		await sheet._onAddPossessionFollower("hounds");
		expect(added(flags)[0].size).toBe(2);
	});

	it("asks nothing for the Would-be Hero's single dog", async () => {
		const ask = stubAsk("3");
		const { sheet, flags } = sheetWithHounds();
		await sheet._onAddPossessionFollower("a-good-dog");
		expect(ask).not.toHaveBeenCalled();
		expect(added(flags)[0]).toMatchObject({ name: "Good dog", isGroup: false });
	});
});
