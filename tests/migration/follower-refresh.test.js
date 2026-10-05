import { describe, it, expect, vi } from "vitest";
import { followerRefresh, refreshCatalogFollowers, FOLLOWER_SUPERSEDED } from "../../module/migration/follower-refresh.js";
import { possessionFollower } from "../../module/data/possession-followers.js";
import { summonEntryFor } from "../../module/data/arcana-summons.js";

// Follower cards made from the system's own lists, put right where they still hold a value an older
// release wrote: the good dog's herder default, and two summons' notes.

const SCOPE = "stonetop-pwd";
const OLD_DOG = { sourceUuid: "possession:a-good-dog", name: "Rex", tags: ["herder", "keen-nosed", "clever"], notes: FOLLOWER_SUPERSEDED["possession:a-good-dog"].notes[0] };

describe("followerRefresh", () => {
	it("makes an old herder-by-default dog the retriever its player picked, and drops the old note", () => {
		expect(followerRefresh(OLD_DOG, ["retriever"])).toEqual({ tags: ["retriever", "keen-nosed", "clever"], notes: "" });
	});

	it("only drops the note from a dog whose player picked herder", () => {
		expect(followerRefresh(OLD_DOG, ["herder"])).toEqual({ notes: "" });
	});

	it("leaves a dog whose player has not picked, and one whose tags or note they wrote", () => {
		expect(followerRefresh(OLD_DOG, [])).toBeNull();
		expect(followerRefresh({ ...OLD_DOG, tags: ["herder", "loyal"], notes: "Our dog." }, ["retriever"])).toBeNull();
	});

	it("corrects a summon's note an older release wrote, and leaves one the player wrote", () => {
		for (const uuid of ["stone-idol:thistlewik", "ring-of-daagon:servant-of-daagon"]) {
			const card = { sourceUuid: uuid, notes: FOLLOWER_SUPERSEDED[uuid].notes[0] };
			expect(followerRefresh(card)).toEqual({ notes: summonEntryFor(card).notes });
			expect(followerRefresh({ sourceUuid: uuid, notes: "Mine." })).toBeNull();
		}
	});

	it("never lists a value the lists still ship as an old one", () => {
		expect(FOLLOWER_SUPERSEDED["possession:a-good-dog"].notes).not.toContain(possessionFollower("a-good-dog", ["herder"]).notes ?? "");
		for (const uuid of ["stone-idol:thistlewik", "ring-of-daagon:servant-of-daagon"]) {
			expect(FOLLOWER_SUPERSEDED[uuid].notes).not.toContain(summonEntryFor({ sourceUuid: uuid }).notes);
		}
	});
});

describe("refreshCatalogFollowers", () => {
	it("writes each character's stale cards in one update, reading the dog's pick off the possession", async () => {
		const flags = {
			customFollowers: { d1: OLD_DOG, x: { sourceUuid: "custom", notes: "n" } },
			possessions: { subChoices: { "a-good-dog": ["retriever"] } },
		};
		const pc = {
			type: "character",
			flags: { [SCOPE]: flags },
			getFlag: (scope, key) => (scope === SCOPE ? flags[key] : undefined),
			update: vi.fn(async () => {}),
		};
		expect(await refreshCatalogFollowers({ actors: [pc, { type: "npc" }] })).toBe(1);
		expect(pc.update).toHaveBeenCalledWith({
			[`flags.${SCOPE}.customFollowers.d1.tags`]: ["retriever", "keen-nosed", "clever"],
			[`flags.${SCOPE}.customFollowers.d1.notes`]: "",
		}, { stonetopLedger: true });
	});
});
