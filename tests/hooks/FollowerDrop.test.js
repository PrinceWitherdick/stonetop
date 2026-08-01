import { describe, it, expect, vi, beforeEach } from "vitest";
import { FOLLOWER_DRAG_TYPE } from "../../module/data/follower-actor.js";
import { onDropFollower, placeFollowerToken } from "../../module/hooks/FollowerDrop.js";

// Dragging a follower card onto the canvas: the card becomes (or re-uses) an Actor, and
// core places its token. See module/hooks/FollowerDrop.js for the resolution order.

const DROP = {
	type: FOLLOWER_DRAG_TYPE,
	x: 100,
	y: 200,
	characterUuid: "Actor.pc1",
	characterName: "Hafr",
	ftype: "custom",
	slug: "f1",
	detailBase: "customFollowers.f1",
	follower: { name: "Old Bess", hp: { value: 4, max: 6 }, tags: ["stubborn"] },
};

let uuids, layer, scene, character, created;

function makeCanvas() {
	return { scene, tokens: layer };
}

beforeEach(() => {
	created = [];
	uuids = new Map();
	layer = { _onDropActorData: vi.fn(async () => ({})) };
	scene = { name: "The Steplands" };
	character = { isOwner: true, update: vi.fn(async () => {}) };
	uuids.set("Actor.pc1", character);

	globalThis.CONST = { TOKEN_DISPLAY_MODES: { HOVER: 30 }, TOKEN_DISPOSITIONS: { FRIENDLY: 1 } };
	globalThis.game = {
		user: { can: vi.fn(() => true) },
		folders: [{ type: "Actor", name: "Followers", id: "fold1" }],
	};
	globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
	globalThis.fromUuid = vi.fn(async (uuid) => uuids.get(uuid) ?? null);
	globalThis.Folder = { canUserCreate: vi.fn(() => true), create: vi.fn(async () => ({ id: "fold1" })) };
	globalThis.Actor = {
		canUserCreate: vi.fn(() => true),
		create: vi.fn(async (data) => {
			const actor = { ...data, documentName: "Actor", uuid: `Actor.new${created.length}` };
			created.push(actor);
			return actor;
		}),
	};
});

describe("onDropFollower", () => {
	it("claims a follower payload", () => {
		expect(onDropFollower(makeCanvas(), { ...DROP }, {})).toBe(false);
	});

	it("leaves every other canvas drop to core", () => {
		expect(onDropFollower(makeCanvas(), { type: "Actor", uuid: "Actor.x" }, {})).toBeUndefined();
		expect(layer._onDropActorData).not.toHaveBeenCalled();
	});
});

describe("placeFollowerToken", () => {
	it("creates an npc from the card, files it, and hands it to core to place", async () => {
		const event = {};
		await placeFollowerToken(makeCanvas(), DROP, event);

		expect(globalThis.Actor.create).toHaveBeenCalledTimes(1);
		const data = globalThis.Actor.create.mock.calls[0][0];
		expect(data.type).toBe("npc");
		expect(data.name).toBe("Old Bess");
		expect(data.folder).toBe("fold1");
		expect(data.flags["stonetop-pwd"].followerOrigin)
			.toEqual({ characterUuid: "Actor.pc1", ftype: "custom", slug: "f1" });
		expect(layer._onDropActorData).toHaveBeenCalledWith(event, {
			type: "Actor", uuid: "Actor.new0", x: 100, y: 200,
		});
	});

	it("remembers the new actor on the follower card, so a second drop re-uses it", async () => {
		await placeFollowerToken(makeCanvas(), DROP, {});

		expect(character.update).toHaveBeenCalledWith({
			"flags.stonetop-pwd.customFollowers.f1.actorUuid": "Actor.new0",
		});
	});

	it("re-uses the actor a previous drop made instead of cloning the follower", async () => {
		uuids.set("Actor.old", { documentName: "Actor", type: "npc", uuid: "Actor.old" });
		const data = { ...DROP, follower: { ...DROP.follower, actorUuid: "Actor.old" } };

		await placeFollowerToken(makeCanvas(), data, {});

		expect(globalThis.Actor.create).not.toHaveBeenCalled();
		expect(layer._onDropActorData).toHaveBeenCalledWith({}, expect.objectContaining({ uuid: "Actor.old" }));
	});

	it("places the NPC a follower was recruited from — that person already exists", async () => {
		uuids.set("Actor.elios", { documentName: "Actor", type: "npc", uuid: "Actor.elios" });
		const data = { ...DROP, follower: { ...DROP.follower, sourceUuid: "Actor.elios" } };

		await placeFollowerToken(makeCanvas(), data, {});

		expect(globalThis.Actor.create).not.toHaveBeenCalled();
		expect(layer._onDropActorData).toHaveBeenCalledWith({}, expect.objectContaining({ uuid: "Actor.elios" }));
	});

	it("builds its own actor for a follower converted from a bestiary monster", async () => {
		// The monster entry is a template for its kind; this follower is one individual.
		uuids.set("Actor.wolf", { documentName: "Actor", type: "monster", uuid: "Actor.wolf" });
		const data = { ...DROP, follower: { ...DROP.follower, sourceUuid: "Actor.wolf" } };

		await placeFollowerToken(makeCanvas(), data, {});

		expect(globalThis.Actor.create).toHaveBeenCalledTimes(1);
		expect(layer._onDropActorData).toHaveBeenCalledWith({}, expect.objectContaining({ uuid: "Actor.new0" }));
	});

	it("ignores a stale actorUuid rather than failing the drop", async () => {
		const data = { ...DROP, follower: { ...DROP.follower, actorUuid: "Actor.deleted" } };

		await placeFollowerToken(makeCanvas(), data, {});

		expect(globalThis.Actor.create).toHaveBeenCalledTimes(1);
	});

	it("warns instead of placing when the user can't create tokens here", async () => {
		globalThis.game.user.can = vi.fn(() => false);

		await placeFollowerToken(makeCanvas(), DROP, {});

		expect(globalThis.ui.notifications.warn).toHaveBeenCalled();
		expect(globalThis.Actor.create).not.toHaveBeenCalled();
		expect(layer._onDropActorData).not.toHaveBeenCalled();
	});

	// Core's own drop path refuses a point outside the scene rect before it so much as
	// looks at the actor, so the same check has to happen ahead of resolving one here —
	// resolving CREATES. Without it a drop in the padding around a scene left a new NPC
	// in the sidebar, an actorUuid written back onto the card claiming they were placed,
	// and no token anywhere.
	const rectCanvas = (contains) => ({
		scene, tokens: layer, dimensions: { rect: { contains: () => contains } },
	});

	it("refuses a drop outside the scene rect rather than leaving an orphan actor", async () => {
		await placeFollowerToken(rectCanvas(false), DROP, {});

		expect(globalThis.Actor.create).not.toHaveBeenCalled();
		expect(character.update).not.toHaveBeenCalled();
		expect(layer._onDropActorData).not.toHaveBeenCalled();
	});

	it("places as usual when the drop lands inside the scene rect", async () => {
		await placeFollowerToken(rectCanvas(true), DROP, {});

		expect(globalThis.Actor.create).toHaveBeenCalledTimes(1);
		expect(layer._onDropActorData).toHaveBeenCalled();
	});

	it("warns instead of placing when the user can't create actors", async () => {
		globalThis.Actor.canUserCreate = vi.fn(() => false);

		await placeFollowerToken(makeCanvas(), DROP, {});

		expect(globalThis.ui.notifications.warn).toHaveBeenCalled();
		expect(layer._onDropActorData).not.toHaveBeenCalled();
	});

	it("still places the follower when it can't be linked back to the card", async () => {
		character.isOwner = false;

		await placeFollowerToken(makeCanvas(), DROP, {});

		expect(character.update).not.toHaveBeenCalled();
		expect(layer._onDropActorData).toHaveBeenCalled();
	});

	it("falls back to placing the token itself if core's drop path is gone", async () => {
		const create = vi.fn(async () => ({}));
		const token = { constructor: { create } };
		uuids.set("Actor.old", {
			documentName: "Actor", type: "npc", uuid: "Actor.old",
			getTokenDocument: vi.fn(async () => token),
		});
		layer = {};   // no _onDropActorData

		await placeFollowerToken(makeCanvas(), { ...DROP, follower: { ...DROP.follower, actorUuid: "Actor.old" } }, {});

		expect(create).toHaveBeenCalledWith(token, { parent: scene });
	});
});
