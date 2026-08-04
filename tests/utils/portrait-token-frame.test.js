import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	canBakePortraitFrame, revertPrototypeTokenFrame, syncPrototypeTokenToFrame, tokenFollowsPortrait,
} from "../../module/utils/portrait-token-frame.js";
import { PORTRAIT_FRAME_BAKE_DIR, isPortraitFrameBake } from "../../module/utils/portrait-frame.js";
import { PERSON_DEFAULT_IMG } from "../../module/utils/person-portrait.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const ART = "worlds/mine/art/bryn.webp";
const BAKE = `worlds/mine/${PORTRAIT_FRAME_BAKE_DIR}/bryn-abc-frame.webp`;
const FRAME = { src: ART, rect: [0.2, 0.05, 0.7, 0.55] };

/** The bake is a canvas + upload round trip, stubbed at the module boundary. */
const baker = vi.hoisted(() => ({ bake: vi.fn() }));
vi.mock("../../module/utils/portrait-tokenizer.js", () => ({ bakeFrameToFile: baker.bake }));

// `noToken` rather than `token: undefined`, which the default below would swallow.
function makeActor({ img = ART, token = PERSON_DEFAULT_IMG, noToken = false, isOwner = true, frame } = {}) {
	return {
		id: "abc", name: "Bryn", img, isOwner,
		prototypeToken: noToken ? undefined : { texture: { src: token } },
		flags: frame ? { [SYSTEM_ID]: { portraitFrame: frame } } : {},
		update: vi.fn(async function (data) {
			if ("prototypeToken.texture.src" in data) this.prototypeToken.texture.src = data["prototypeToken.texture.src"];
		}),
	};
}

const tokenSrc = (actor) => actor.prototypeToken?.texture?.src;

beforeEach(() => {
	baker.bake.mockReset().mockResolvedValue(BAKE);
	globalThis.game = { ...(globalThis.game ?? {}), user: { can: () => true } };
});
afterEach(() => { delete globalThis.game.user; });

describe("isPortraitFrameBake", () => {
	it("recognises our own bakes, cache-buster and all", () => {
		expect(isPortraitFrameBake(BAKE)).toBe(true);
		expect(isPortraitFrameBake(`${BAKE}?1699999999`)).toBe(true);
	});

	it("does not claim a portrait, a token somebody chose, or nothing", () => {
		expect(isPortraitFrameBake(ART)).toBe(false);
		expect(isPortraitFrameBake("worlds/mine/tokens/bryn.webp")).toBe(false);
		expect(isPortraitFrameBake(PERSON_DEFAULT_IMG)).toBe(false);
		expect(isPortraitFrameBake("")).toBe(false);
		expect(isPortraitFrameBake(undefined)).toBe(false);
	});
});

describe("tokenFollowsPortrait", () => {
	it("claims a placeholder, the portrait itself, and one of our bakes", () => {
		expect(tokenFollowsPortrait(makeActor({ token: PERSON_DEFAULT_IMG }))).toBe(true);
		expect(tokenFollowsPortrait(makeActor({ token: "icons/svg/mystery-man.svg" }))).toBe(true);
		expect(tokenFollowsPortrait(makeActor({ token: ART }))).toBe(true);
		expect(tokenFollowsPortrait(makeActor({ token: `${BAKE}?123` }))).toBe(true);
	});

	it("leaves a token somebody chose alone", () => {
		expect(tokenFollowsPortrait(makeActor({ token: "worlds/mine/tokens/bryn-pog.webp" }))).toBe(false);
	});

	it("has nothing to say about an actor with no prototype token", () => {
		expect(tokenFollowsPortrait(makeActor({ noToken: true }))).toBe(false);
		expect(tokenFollowsPortrait(null)).toBe(false);
	});
});

describe("syncPrototypeTokenToFrame", () => {
	it("bakes the square and points the token at it", async () => {
		const actor = makeActor();
		const written = await syncPrototypeTokenToFrame(actor, FRAME);
		expect(baker.bake).toHaveBeenCalledWith(ART, FRAME.rect, { name: "Bryn", id: "abc" });
		expect(written.split("?")[0]).toBe(BAKE);
		expect(tokenSrc(actor).split("?")[0]).toBe(BAKE);
	});

	it("cache-busts, because the file is overwritten under one name", async () => {
		// Without the stamp a re-frame paints the PREVIOUS crop out of the browser's cache: same
		// URL, new bytes.
		const actor = makeActor();
		const written = await syncPrototypeTokenToFrame(actor, FRAME);
		expect(written).toMatch(/\?\d+$/);
	});

	it("re-points a token that is already showing an older bake", async () => {
		const actor = makeActor({ token: `${BAKE}?111` });
		await syncPrototypeTokenToFrame(actor, FRAME);
		expect(actor.update).toHaveBeenCalled();
	});

	it("never touches a token somebody chose", async () => {
		const chosen = "worlds/mine/tokens/bryn-pog.webp";
		const actor = makeActor({ token: chosen });
		expect(await syncPrototypeTokenToFrame(actor, FRAME)).toBeNull();
		expect(baker.bake).not.toHaveBeenCalled();
		expect(tokenSrc(actor)).toBe(chosen);
	});

	it("does nothing without upload rights, rather than failing the frame that was just saved", async () => {
		globalThis.game.user = { can: () => false };
		const actor = makeActor();
		expect(await syncPrototypeTokenToFrame(actor, FRAME)).toBeNull();
		expect(baker.bake).not.toHaveBeenCalled();
		expect(canBakePortraitFrame()).toBe(false);
	});

	it("swallows a bake that fails, leaving the token where it was", async () => {
		// An external URL with no CORS headers taints the canvas and throws at toBlob — after all
		// the work. The frame is already saved by then and every other surface is correct.
		baker.bake.mockRejectedValue(new Error("tainted canvas"));
		const actor = makeActor();
		await expect(syncPrototypeTokenToFrame(actor, FRAME)).resolves.toBeNull();
		expect(tokenSrc(actor)).toBe(PERSON_DEFAULT_IMG);

		baker.bake.mockReset().mockResolvedValue(null);
		expect(await syncPrototypeTokenToFrame(makeActor(), FRAME)).toBeNull();
	});

	it("reads the actor's own frame when handed none", async () => {
		const actor = makeActor({ frame: FRAME });
		await syncPrototypeTokenToFrame(actor);
		expect(baker.bake).toHaveBeenCalledWith(ART, FRAME.rect, { name: "Bryn", id: "abc" });
	});

	it("refuses an unusable frame and a document this user does not own", async () => {
		expect(await syncPrototypeTokenToFrame(makeActor(), { src: "", rect: FRAME.rect })).toBeNull();
		expect(await syncPrototypeTokenToFrame(makeActor(), null)).toBeNull();
		expect(await syncPrototypeTokenToFrame(makeActor({ isOwner: false }), FRAME)).toBeNull();
		expect(await syncPrototypeTokenToFrame(null, FRAME)).toBeNull();
		expect(baker.bake).not.toHaveBeenCalled();
	});
});

describe("revertPrototypeTokenFrame", () => {
	it("puts a baked token back on the whole portrait", async () => {
		const actor = makeActor({ token: `${BAKE}?111` });
		expect(await revertPrototypeTokenFrame(actor)).toBe(ART);
		expect(tokenSrc(actor)).toBe(ART);
	});

	it("undoes what framing did and nothing else", async () => {
		// A token already showing the portrait, a placeholder, or a chosen image was not put
		// there by framing, so clearing a frame has no business moving it.
		for (const token of [ART, PERSON_DEFAULT_IMG, "worlds/mine/tokens/bryn-pog.webp"]) {
			const actor = makeActor({ token });
			expect(await revertPrototypeTokenFrame(actor)).toBeNull();
			expect(tokenSrc(actor)).toBe(token);
		}
	});

	it("does nothing on a document this user does not own", async () => {
		const actor = makeActor({ token: BAKE, isOwner: false });
		expect(await revertPrototypeTokenFrame(actor)).toBeNull();
		expect(actor.update).not.toHaveBeenCalled();
	});
});
