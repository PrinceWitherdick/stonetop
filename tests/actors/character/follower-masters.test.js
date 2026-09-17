import { describe, it, expect } from "vitest";
import { followerMasterIndex } from "../../../module/actors/character/follower-masters.js";
import { SYSTEM_ID } from "../../../module/system-id.js";

// Whose follower an NPC is: the provenance on an actor made for a card, or the link on the character's
// own follower records for one recruited from an NPC who already existed.

const actor = (id, type, flags = {}) => ({ id, uuid: `Actor.${id}`, name: id, type, flags: { [SYSTEM_ID]: flags } });

describe("followerMasterIndex", () => {
	it("finds an actor made for a follower card by the character it records", () => {
		const bram = actor("bram", "character");
		const hound = actor("hound", "npc", { followerOrigin: { characterUuid: "Actor.bram", ftype: "animal-companion", slug: "" } });
		expect(followerMasterIndex({ characters: [bram], actors: [bram, hound] }).get("hound")).toBe(bram);
	});

	it("finds a recruited NPC, and a made one, by the links on the character's followers", () => {
		const cadi = actor("cadi", "character", {
			customFollowers: { abc: { sourceUuid: "Actor.maeve", name: "Maeve" } },
			crew: { details: { actorUuid: "Actor.crew" } },
			initiateDetails: { enfys: { actorUuid: "Actor.enfys" } },
		});
		const actors = [cadi, actor("maeve", "npc"), actor("crew", "npc"), actor("enfys", "npc"), actor("tovia", "npc")];
		const masters = followerMasterIndex({ characters: [cadi], actors });
		expect([...masters.keys()].sort()).toEqual(["crew", "enfys", "maeve"]);
		expect(masters.get("maeve")).toBe(cadi);
	});

	it("never counts the monster a follower was converted from, or anything outside the follower records", () => {
		const cadi = actor("cadi", "character", {
			customFollowers: { wolf: { sourceUuid: "Actor.wolf" } },
			relationships: { actorUuid: "Actor.quill" },
		});
		const actors = [cadi, actor("wolf", "monster"), actor("quill", "npc")];
		expect(followerMasterIndex({ characters: [cadi], actors }).size).toBe(0);
	});
});
