import { afterEach, describe, expect, it } from "vitest";
import { usedActorPortraits } from "../../module/utils/actor-portrait-picker.js";

const ART = "worlds/mine/stonetop-art/people";

/** Stand in for game.actors, which the sweep walks. */
function withActors(actors) {
	global.game.actors = { contents: actors };
}

/** A character carrying followers, shaped like the flag bag resolvedFlags reads. */
function pcWith(name, followerFlags, img = "") {
	return { id: name.toLowerCase(), type: "character", name, img, flags: { "stonetop_pwd": followerFlags } };
}

afterEach(() => { delete global.game.actors; });

describe("usedActorPortraits", () => {
	it("reports every actor's own portrait, named by the actor", () => {
		withActors([
			{ id: "n1", type: "npc",       name: "Bryn",  img: `${ART}/b.webp` },
			{ id: "c1", type: "character", name: "Aderyn", img: `${ART}/a.webp` },
			{ id: "m1", type: "monster",   name: "Gorger", img: `${ART}/g.webp` },
		]);
		expect(usedActorPortraits()).toEqual({
			[`${ART}/b.webp`]: "Bryn",
			[`${ART}/a.webp`]: "Aderyn",
			[`${ART}/g.webp`]: "Gorger",
		});
	});

	it("leaves out the actor being edited, so their own portrait is not 'taken'", () => {
		const mine = { id: "n1", type: "npc", name: "Bryn", img: `${ART}/b.webp` };
		withActors([mine, { id: "n2", type: "npc", name: "Maren", img: `${ART}/m.webp` }]);
		expect(usedActorPortraits(mine)).toEqual({ [`${ART}/m.webp`]: "Maren" });
	});

	it("does not count the placeholders every unportraited actor shares", () => {
		withActors([
			{ id: "a", type: "npc", name: "Nobody", img: "" },
			{ id: "b", type: "npc", name: "Also nobody", img: "icons/svg/mystery-man.svg" },
			{ id: "c", type: "npc", name: "Still nobody", img: "systems/stonetop_pwd/assets/icons/people/default_profile.svg" },
		]);
		expect(usedActorPortraits()).toEqual({});
	});

	it("names the first holder when two actors share one portrait", () => {
		withActors([
			{ id: "a", type: "npc", name: "Aderyn", img: `${ART}/a.webp` },
			{ id: "b", type: "npc", name: "Gethin", img: `${ART}/a.webp` },
		]);
		expect(usedActorPortraits()).toEqual({ [`${ART}/a.webp`]: "Aderyn" });
	});

	it("still marks a portrait taken when the actor has no name to blame it on", () => {
		withActors([{ id: "a", type: "npc", name: "", img: `${ART}/a.webp` }]);
		expect(usedActorPortraits()).toEqual({ [`${ART}/a.webp`]: "someone else" });
	});

	it("reaches the follower cards a character keeps in flags, which are not documents", () => {
		withActors([pcWith("Mara", {
			animalCompanion: { name: "Fen",  details: { img: `${ART}/fen.webp` } },
			crew:            { name: "Kest", details: { img: `${ART}/kest.webp` } },
			initiateDetails: { acolyte: { img: `${ART}/acolyte.webp` } },
			beastDetails:    { hound:   { img: `${ART}/hound.webp` } },
			customFollowers: { xyz123:  { name: "Idris", img: `${ART}/idris.webp` } },
		})]);
		expect(usedActorPortraits()).toEqual({
			[`${ART}/fen.webp`]:     "Fen",
			[`${ART}/kest.webp`]:    "Kest",
			// An initiate and a beast take their names from pack data by slug rather than
			// carrying one, so they are named by the character who keeps them.
			[`${ART}/acolyte.webp`]: "Mara's follower",
			[`${ART}/hound.webp`]:   "Mara's follower",
			[`${ART}/idris.webp`]:   "Idris",
		});
	});

	it("skips a follower with no portrait, and a store that was never written", () => {
		withActors([pcWith("Mara", {
			crew: { name: "Kest", details: {} },
			customFollowers: { xyz123: { name: "Idris", img: "" } },
		})]);
		expect(usedActorPortraits()).toEqual({});
	});

	it("does not go looking for followers on an NPC or a monster", () => {
		// The stores only exist on a character; walking them elsewhere would be reading a
		// namespace that means something else there.
		withActors([{
			id: "n1", type: "npc", name: "Bryn", img: "",
			flags: { "stonetop_pwd": { customFollowers: { x: { img: `${ART}/x.webp` } } } },
		}]);
		expect(usedActorPortraits()).toEqual({});
	});

	it("leaves the steading out, whose portrait is a picture of the place, not a face", () => {
		withActors([
			{ id: "s1", type: "stonetop", name: "Stonetop", img: `${ART}/the-vale.webp` },
			{ id: "n1", type: "npc",      name: "Bryn",     img: `${ART}/b.webp` },
		]);
		expect(usedActorPortraits()).toEqual({ [`${ART}/b.webp`]: "Bryn" });
	});

	it("yields nothing rather than throwing when there is no actor directory", () => {
		expect(usedActorPortraits()).toEqual({});
	});
});
