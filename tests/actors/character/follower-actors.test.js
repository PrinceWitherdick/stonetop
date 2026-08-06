import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	createFollowerActor, ensureFollowerActors, followerActorFromLink,
} from "../../../module/actors/character/follower-actors.js";

// Every follower on a character sheet gets an `npc` Actor made for it, once, the first time the
// sheet renders after they are added. The guards are what this file is about: the sweep must be
// free in the steady state, must not make a second copy of a creature that already exists, and
// must not resurrect one somebody deliberately deleted.

const snapshot = (slug, follower = {}) => ({
	ftype: "custom",
	slug,
	detailBase: `customFollowers.${slug}`,
	follower: { name: `Follower ${slug}`, hp: { value: 3, max: 3 }, ...follower },
});

let created, docs, character;

/** A character whose followers' stored links are whatever `links` says. */
function makeCharacter(links = {}, extra = {}) {
	const customFollowers = {};
	for (const [slug, actorUuid] of Object.entries(links)) customFollowers[slug] = { actorUuid };
	return {
		id: "pc1",
		uuid: "Actor.pc1",
		isOwner: true,
		ownership: { default: 0, user1: 3 },
		flags: { "stonetop-pwd": { customFollowers } },
		update: vi.fn(async () => {}),
		testUserPermission: () => true,
		...extra,
	};
}

beforeEach(() => {
	created = [];
	docs = new Map();

	globalThis.CONST = { TOKEN_DISPLAY_MODES: { HOVER: 30 }, TOKEN_DISPOSITIONS: { FRIENDLY: 1 } };
	globalThis.game = {
		user: { id: "user1" },
		users: { contents: [{ id: "user1", active: true }] },
		folders: [{ type: "Actor", name: "Followers", id: "fold1" }],
	};
	globalThis.fromUuidSync = vi.fn((uuid) => docs.get(uuid) ?? null);
	globalThis.Folder = { canUserCreate: () => true, create: vi.fn(async () => ({ id: "fold1" })) };
	globalThis.Actor = {
		canUserCreate: vi.fn(() => true),
		create: vi.fn(async (data) => {
			const actor = { ...data, documentName: "Actor", uuid: `Actor.new${created.length}` };
			created.push(actor);
			return actor;
		}),
	};
});

describe("followerActorFromLink", () => {
	it("prefers the actor already made for this card", () => {
		docs.set("Actor.mine", { documentName: "Actor", type: "npc", uuid: "Actor.mine" });
		docs.set("Actor.src", { documentName: "Actor", type: "npc", uuid: "Actor.src" });

		expect(followerActorFromLink({ actorUuid: "Actor.mine", sourceUuid: "Actor.src" }).uuid)
			.toBe("Actor.mine");
	});

	it("falls back to the NPC they were recruited from, who IS them", () => {
		docs.set("Actor.src", { documentName: "Actor", type: "npc", uuid: "Actor.src" });

		expect(followerActorFromLink({ sourceUuid: "Actor.src" }).uuid).toBe("Actor.src");
	});

	it("treats a monster or a compendium entry as provenance, not identity", () => {
		// A bestiary monster is a template for its KIND; this follower is one individual.
		docs.set("Actor.beast", { documentName: "Actor", type: "monster", uuid: "Actor.beast" });
		// A pack uuid resolves synchronously only to an index stub, which is not a document.
		docs.set("Compendium.x.actors.y", { documentName: "Actor", type: "npc", pack: "x.actors" });

		expect(followerActorFromLink({ sourceUuid: "Actor.beast" })).toBeNull();
		expect(followerActorFromLink({ actorUuid: "Compendium.x.actors.y" })).toBeNull();
	});

	it("is null for a follower with no links at all", () => {
		expect(followerActorFromLink()).toBeNull();
		expect(followerActorFromLink({ actorUuid: "" })).toBeNull();
	});
});

describe("createFollowerActor", () => {
	it("gives the new NPC the CHARACTER's ownership, not the creator's", async () => {
		// Otherwise a GM tidying a player's sheet makes an NPC that player cannot open — and the
		// follower they were ordering about a moment ago stops being theirs.
		character = makeCharacter();

		await createFollowerActor(snapshot("f1"), character, { folder: "fold1" });

		expect(created[0].ownership).toEqual({ default: 0, user1: 3 });
		expect(created[0].flags["stonetop-pwd"].followerOrigin)
			.toEqual({ characterUuid: "Actor.pc1", ftype: "custom", slug: "f1" });
	});

	it("reports a refused creation rather than throwing at its caller", async () => {
		globalThis.Actor.create = vi.fn(async () => { throw new Error("nope"); });
		const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(createFollowerActor(snapshot("f1"), makeCharacter())).resolves.toBeNull();
		quiet.mockRestore();
	});
});

describe("ensureFollowerActors", () => {
	it("costs nothing once every follower has one", async () => {
		character = makeCharacter({ f1: "Actor.a", f2: "Actor.b" });
		const snaps = [snapshot("f1", { actorUuid: "Actor.a" }), snapshot("f2", { actorUuid: "Actor.b" })];

		expect(await ensureFollowerActors(character, snaps)).toBe(0);
		expect(globalThis.Actor.create).not.toHaveBeenCalled();
		expect(character.update).not.toHaveBeenCalled();
	});

	it("makes one for every unlinked follower and writes them all back in ONE update", async () => {
		character = makeCharacter();

		expect(await ensureFollowerActors(character, [snapshot("f1"), snapshot("f2")])).toBe(2);

		expect(globalThis.Actor.create).toHaveBeenCalledTimes(2);
		expect(character.update).toHaveBeenCalledTimes(1);
		expect(character.update).toHaveBeenCalledWith({
			"flags.stonetop-pwd.customFollowers.f1.actorUuid": "Actor.new0",
			"flags.stonetop-pwd.customFollowers.f2.actorUuid": "Actor.new1",
		});
	});

	it("leaves a follower whose actor was DELETED alone, so deleting one sticks", async () => {
		// The stored link is what answers "have they been made"; whether it still resolves is a
		// different question. A sweep that asked the second one would undo the deletion on the
		// very next render, and the NPC could never be got rid of.
		character = makeCharacter({ f1: "Actor.gone" });

		expect(await ensureFollowerActors(character, [snapshot("f1", { actorUuid: "Actor.gone" })])).toBe(0);
		expect(globalThis.Actor.create).not.toHaveBeenCalled();
	});

	it("does not clone the NPC a follower was recruited from", async () => {
		docs.set("Actor.src", { documentName: "Actor", type: "npc", uuid: "Actor.src" });
		character = makeCharacter();

		expect(await ensureFollowerActors(character, [snapshot("f1", { sourceUuid: "Actor.src" })])).toBe(0);
		expect(globalThis.Actor.create).not.toHaveBeenCalled();
	});

	it("stands down for a viewer who does not own the character", async () => {
		character = makeCharacter({}, { isOwner: false });

		expect(await ensureFollowerActors(character, [snapshot("f1")])).toBe(0);
		expect(globalThis.Actor.create).not.toHaveBeenCalled();
	});

	it("stands down, silently, where the GM has revoked actor creation", async () => {
		globalThis.Actor.canUserCreate = vi.fn(() => false);
		character = makeCharacter();

		expect(await ensureFollowerActors(character, [snapshot("f1")])).toBe(0);
		expect(globalThis.Actor.create).not.toHaveBeenCalled();
	});

	it("re-reads the card before creating, so a client that lost the race makes nothing", async () => {
		// Two people with the same sheet open both see every write to it. The later client waits
		// its turn and then looks again — by which time the link is there and there is no work.
		character = makeCharacter();
		globalThis.Actor.create = vi.fn(async (data) => {
			// The other client's write lands while this one is mid-create.
			character.flags["stonetop-pwd"].customFollowers.f2 = { actorUuid: "Actor.theirs" };
			const actor = { ...data, documentName: "Actor", uuid: `Actor.new${created.length}` };
			created.push(actor);
			return actor;
		});

		expect(await ensureFollowerActors(character, [snapshot("f1"), snapshot("f2")])).toBe(1);
		expect(character.update).toHaveBeenCalledWith({
			"flags.stonetop-pwd.customFollowers.f1.actorUuid": "Actor.new0",
		});
	});

	it("takes its own copy back out when the other client claimed the slot mid-sweep", async () => {
		// The re-read before each create cannot cover the ones already made, so a slot can be
		// claimed after ours exists. Keeping it would leave an NPC nothing points at, growing the
		// sidebar quietly — exactly the duplicate the stagger is there to prevent.
		character = makeCharacter();
		const deleted = [];
		globalThis.Actor.create = vi.fn(async (data) => {
			const actor = {
				...data, documentName: "Actor", uuid: `Actor.new${created.length}`,
				delete: vi.fn(async function () { deleted.push(this.uuid); }),
			};
			created.push(actor);
			// Their write for THIS follower lands just after ours was made.
			if (created.length === 1) character.flags["stonetop-pwd"].customFollowers.f1 = { actorUuid: "Actor.theirs" };
			return actor;
		});

		expect(await ensureFollowerActors(character, [snapshot("f1"), snapshot("f2")])).toBe(1);
		expect(deleted).toEqual(["Actor.new0"]);
		expect(character.update).toHaveBeenCalledWith({
			"flags.stonetop-pwd.customFollowers.f2.actorUuid": "Actor.new1",
		});
	});

	it("ignores a snapshot with no flag namespace to write back to", async () => {
		character = makeCharacter();

		expect(await ensureFollowerActors(character, [{ ftype: "custom", slug: "f1", follower: {} }])).toBe(0);
		expect(globalThis.Actor.create).not.toHaveBeenCalled();
	});
});
