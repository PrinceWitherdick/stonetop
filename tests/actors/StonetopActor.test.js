import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStonetopActorClass } from "../../module/actors/StonetopActor.js";
import { PERSON_DEFAULT_IMG } from "../../module/utils/person-portrait.js";

const HOVER = 2;
const FOUNDRY_DEFAULT = "icons/svg/mystery-man.svg";

/** The barest Actor base the mixin needs: it only calls super._preCreate and updateSource. */
class FakeBaseActor {
	constructor(data = {}) {
		this.type = data.type;
		this.img  = data.img;
		this.applied = [];
	}
	async _preCreate() { return undefined; }
	updateSource(changes) {
		this.applied.push(changes);
		Object.assign(this, changes);
	}
}

const StonetopActor = createStonetopActorClass(FakeBaseActor);

/** Run _preCreate the way Foundry does: the document already holds the creation data. */
async function precreate({ type = "npc", img = FOUNDRY_DEFAULT }, data = {}) {
	const actor = new StonetopActor({ type, img });
	await actor._preCreate(data, {}, {});
	return actor;
}

beforeEach(() => {
	global.CONST = { ...(global.CONST ?? {}), TOKEN_DISPLAY_MODES: { NONE: 0, HOVER: HOVER } };
});
afterEach(() => { delete global.CONST; });

describe("StonetopActor#_preCreate", () => {
	it("gives an NPC with no portrait the people silhouette, not Foundry's mystery-man", async () => {
		const actor = await precreate({ img: FOUNDRY_DEFAULT });
		expect(actor.img).toBe(PERSON_DEFAULT_IMG);
	});

	it("fills in a blank portrait too", async () => {
		expect((await precreate({ img: "" })).img).toBe(PERSON_DEFAULT_IMG);
	});

	it("never touches a portrait somebody chose", async () => {
		const chosen = "worlds/mine/art/aderyn.webp";
		expect((await precreate({ img: chosen })).img).toBe(chosen);
	});

	// A duplicate, or an import of an NPC this system already stamped: re-writing the same
	// path would be a pointless change in the creation data.
	it("leaves an NPC already wearing the placeholder alone", async () => {
		const actor = await precreate({ img: PERSON_DEFAULT_IMG });
		expect(actor.applied.some(change => "img" in change)).toBe(false);
	});

	it("does not portrait other actor types", async () => {
		for (const type of ["character", "monster", "stonetop"]) {
			expect((await precreate({ type, img: FOUNDRY_DEFAULT })).img).toBe(FOUNDRY_DEFAULT);
		}
	});

	it("still defaults an NPC's token to name-on-hover", async () => {
		const actor = await precreate({});
		expect(actor["prototypeToken.displayName"]).toBe(HOVER);
	});

	it("keeps a display mode the creation data chose", async () => {
		const actor = await precreate({}, { prototypeToken: { displayName: 0 } });
		expect(actor.applied.some(change => "prototypeToken.displayName" in change)).toBe(false);
	});
});
