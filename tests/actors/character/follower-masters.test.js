import { describe, it, expect } from "vitest";
import { followerMasterIndex, followerCardFor } from "../../../module/actors/character/follower-masters.js";
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

describe("followerCardFor", () => {
	it("reads the stamp an actor made for a card carries: the character and the card both", () => {
		const bram = actor("bram", "character");
		const hound = actor("hound", "npc", { followerOrigin: { characterUuid: "Actor.bram", ftype: "animal-companion", slug: "" } });
		expect(followerCardFor(hound, { characters: [bram] })).toEqual({ character: bram, ftype: "animal-companion", slug: "" });
	});

	it("names the card a recruited NPC's link sits on, slug and all", () => {
		const cadi = actor("cadi", "character", {
			customFollowers: { abc123: { sourceUuid: "Actor.maeve" } },
			initiateDetails: { enfys: { actorUuid: "Actor.enfys" } },
			beastDetails: { "dog-follower": { actorUuid: "Actor.dog" } },
			crew: { details: { actorUuid: "Actor.crew" } },
		});
		const card = uuid => followerCardFor({ ...actor("x", "npc"), uuid }, { characters: [cadi] });
		expect(card("Actor.maeve")).toMatchObject({ ftype: "custom", slug: "abc123" });
		expect(card("Actor.enfys")).toMatchObject({ ftype: "initiate", slug: "enfys" });
		expect(card("Actor.dog")).toMatchObject({ ftype: "beast", slug: "dog-follower" });
		// A root that keeps one card has no slug to find, however deep the link sits under it.
		expect(card("Actor.crew")).toMatchObject({ ftype: "crew", slug: "" });
	});

	it("falls back to the links when the stamp names a character who is gone", () => {
		const cadi = actor("cadi", "character", { customFollowers: { abc: { actorUuid: "Actor.maeve" } } });
		const maeve = { ...actor("maeve", "npc", { followerOrigin: { characterUuid: "Actor.deleted", ftype: "custom", slug: "abc" } }) };
		expect(followerCardFor(maeve, { characters: [cadi], resolve: () => null })).toMatchObject({ character: cadi, ftype: "custom", slug: "abc" });
	});

	it("traces an unlinked token on the map back to the card that names the actor it came from", () => {
		const cadi = actor("cadi", "character", { customFollowers: { abc: { sourceUuid: "Actor.maeve" } } });
		// An unlinked token's actor is a copy with a uuid of its own; only the Actor behind it is on the card.
		const onTheMap = {
			...actor("maeve", "npc"),
			uuid: "Scene.hall.Token.t1.Actor.maeve",
			isToken: true,
			token: { actorId: "maeve", baseActor: { uuid: "Actor.maeve" } },
		};
		expect(followerCardFor(onTheMap, { characters: [cadi] })).toMatchObject({ character: cadi, ftype: "custom", slug: "abc" });
	});

	it("is nobody's card for a plain NPC, a monster, or nothing at all", () => {
		const cadi = actor("cadi", "character");
		expect(followerCardFor(actor("stranger", "npc"), { characters: [cadi] })).toBe(null);
		expect(followerCardFor(actor("wolf", "monster"), { characters: [cadi] })).toBe(null);
		expect(followerCardFor(null, { characters: [cadi] })).toBe(null);
	});
});
