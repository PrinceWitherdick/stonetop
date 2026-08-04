import { afterEach, describe, expect, it, vi } from "vitest";
import {
	tokenizerApi, canOpenTokenizer, openTokenizer, tokenizerAvatarSource
} from "../../module/utils/portrait-tokenizer.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// The handoff to the Tokenizer module, behind the pip that sits beside the crop pip on a sheet
// header (templates/actor/partials/portrait-frame-pip.hbs).
//
// Two things here carry real weight. `canOpenTokenizer` decides whether that pip exists at all.
// And `tokenizerAvatarSource` decides which picture Tokenizer's Avatar pane opens on — which must
// be the full illustration a crop was measured against, never the shipped square `actor.img`
// usually points at, whose own crop is baked into its filename and is routinely out of date.

afterEach(() => { delete globalThis.game; delete globalThis.Tokenizer; });

/** A `game` whose module registry answers the way Foundry's does. */
function stubGame({ active = true, api = { launch: vi.fn(), updateSceneTokenImg: vi.fn() } } = {}) {
	globalThis.game = {
		modules: { get: (id) => (id === "vtta-tokenizer" ? { active, api } : undefined) },
		// Tokenizer settings openTokenizer mirrors when rebuilding the launch options.
		settings: { get: () => undefined }
	};
	return api;
}

const ACTOR = { id: "abc", name: "Bryn" };

describe("tokenizerApi", () => {
	it("is null when the module is absent or disabled", () => {
		globalThis.game = { modules: { get: () => undefined } };
		expect(tokenizerApi()).toBeNull();
		stubGame({ active: false });
		expect(tokenizerApi()).toBeNull();
	});

	it("falls back to the global the module also exposes", () => {
		// Tokenizer publishes its API twice — on the module and on `window.Tokenizer`. Older
		// versions only did the latter, and a world running one of those must still work.
		// `null`, not `undefined` — undefined would fall into stubGame's own default and hand the
		// module an api after all, so the fallback would never be exercised.
		stubGame({ api: null });
		globalThis.Tokenizer = { launch: vi.fn() };
		expect(tokenizerApi()).toBe(globalThis.Tokenizer);
	});
});

describe("canOpenTokenizer", () => {
	it("is true for an actor when the module is installed and enabled", () => {
		stubGame();
		expect(canOpenTokenizer(ACTOR)).toBe(true);
	});

	it("is false with no actor, which is what keeps follower cards on our own editor", () => {
		// A follower card and a legacy steading row are FLAGS, not documents. Tokenizer has
		// nothing to tokenize for them, so the routing must not divert them.
		stubGame();
		expect(canOpenTokenizer(null)).toBe(false);
		expect(canOpenTokenizer(undefined)).toBe(false);
	});

	it("is false when the module is missing, disabled, or too old to expose launch", () => {
		globalThis.game = { modules: { get: () => undefined } };
		expect(canOpenTokenizer(ACTOR)).toBe(false);
		stubGame({ active: false });
		expect(canOpenTokenizer(ACTOR)).toBe(false);
		stubGame({ api: {} });
		expect(canOpenTokenizer(ACTOR)).toBe(false);
	});

	it("does NOT require upload rights", () => {
		// Tokenizer warns about those itself and its own `disable-player` setting decides whether
		// to open anyway. Gating here would hide a window the module is willing to show.
		stubGame();
		globalThis.game.user = { can: () => false };
		expect(canOpenTokenizer(ACTOR)).toBe(true);
	});
});

const PARENT = "stonetop-book-art/assets/people/b1-p089-x368-c000-293-221-1000.webp";
const SQUARE = "stonetop-book-art/assets/people/b1-p089-x368-c000-293-221-1000-q449-083-846-475.webp";
const RECT = [0.331, 0.601, 0.735, 1];

/** An actor carrying a saved frame, as a framed person really looks on disk. */
const framedActor = ({ img = SQUARE, frame = { src: PARENT, rect: RECT } } = {}) => ({
	id: "abc", name: "Bryn", type: "character", img,
	flags: frame ? { [SYSTEM_ID]: { portraitFrame: frame } } : {},
	prototypeToken: { texture: { src: "worlds/w/stonetop-portrait-frames/bryn-abc-frame.webp" }, disposition: 1 },
});

describe("tokenizerAvatarSource", () => {
	it("opens on the picture the crop was measured against, not on the stale square", () => {
		// THE BUG THIS EXISTS FOR: actor.img is a shipped square whose OLD crop is baked into its
		// filename, and our framer never rewrites it. Handing that to Tokenizer showed a crop the
		// user had already replaced — and ticking the Avatar pane's MODIFY box would have baked it
		// in for good.
		expect(tokenizerAvatarSource(framedActor())).toBe(PARENT);
	});

	it("leaves an unframed actor on its own portrait", () => {
		expect(tokenizerAvatarSource(framedActor({ frame: null }))).toBe(SQUARE);
	});

	it("ignores a frame that is not storable, rather than handing Tokenizer junk", () => {
		expect(tokenizerAvatarSource(framedActor({ frame: { src: "", rect: RECT } }))).toBe(SQUARE);
		expect(tokenizerAvatarSource(framedActor({ frame: { img: PARENT, rect: RECT } }))).toBe(SQUARE);
	});

	it("never throws on a document with nothing on it", () => {
		expect(tokenizerAvatarSource(null)).toBe("");
		expect(tokenizerAvatarSource({})).toBe("");
	});
});

describe("openTokenizer", () => {
	it("launches with the full illustration as the avatar and the current token", () => {
		const api = stubGame();
		const actor = framedActor();
		expect(openTokenizer(actor)).toBe(true);
		const [options, callback] = api.launch.mock.calls[0];
		expect(options).toMatchObject({
			actor,
			name: "Bryn",
			avatarFilename: PARENT,
			tokenFilename: "worlds/w/stonetop-portrait-frames/bryn-abc-frame.webp",
			disposition: 1,
			isWildCard: false,
		});
		expect(typeof callback).toBe("function");
	});

	it("says pc only for a character, because that picks Tokenizer's default frame", () => {
		const api = stubGame();
		openTokenizer(framedActor());
		expect(api.launch.mock.calls[0][0].type).toBe("pc");
		api.launch.mockClear();
		openTokenizer({ ...framedActor(), type: "npc" });
		expect(api.launch.mock.calls[0][0].type).toBe("npc");
	});

	it("only calls a token a wildcard when the flag is actually set", () => {
		const api = stubGame();
		const actor = framedActor();
		actor.prototypeToken.randomImg = true;
		openTokenizer(actor);
		expect(api.launch.mock.calls[0][0].isWildCard).toBe(true);
	});

	it("reports false rather than throwing when there is nothing to open", () => {
		// The caller falls back to a warning on false; an exception here would surface as a pip
		// that appears to do nothing.
		globalThis.game = { modules: { get: () => undefined } };
		expect(openTokenizer(ACTOR)).toBe(false);
		stubGame();
		expect(openTokenizer(null)).toBe(false);
	});
});

describe("the result callback", () => {
	/** Run openTokenizer, then hand its callback whatever Tokenizer would have returned. */
	async function apply(response, { actor = framedActor() } = {}) {
		const api = stubGame();
		actor.update = vi.fn(async () => {});
		openTokenizer(actor);
		const [options, callback] = api.launch.mock.calls[0];
		await callback({ actor, isWildCard: false, ...options, ...response });
		return { actor, api };
	}

	it("writes the new token", async () => {
		const { actor } = await apply({ tokenFilename: "worlds/w/tokenizer/bryn.Token.webp" });
		const update = actor.update.mock.calls[0][0];
		expect(update["prototypeToken.texture.src"].split("?")[0])
			.toBe("worlds/w/tokenizer/bryn.Token.webp");
	});

	it("LEAVES actor.img ALONE when the avatar pane was not modified", async () => {
		// Tokenizer's own updateActor rewrites img on every Apply with a fresh cache-buster, even
		// untouched. Doing that here would repoint a framed character's portrait at the full
		// illustration we only opened the pane ON — silently changing what every surface shows.
		const { actor } = await apply({ tokenFilename: "worlds/w/tokenizer/bryn.Token.webp" });
		expect(actor.update.mock.calls[0][0].img).toBeUndefined();
	});

	it("writes actor.img when Tokenizer really did produce a new avatar", async () => {
		const { actor } = await apply({
			avatarFilename: "worlds/w/tokenizer/bryn.Avatar.webp",
			tokenFilename: "worlds/w/tokenizer/bryn.Token.webp",
		});
		expect(actor.update.mock.calls[0][0].img.split("?")[0])
			.toBe("worlds/w/tokenizer/bryn.Avatar.webp");
	});

	it("is not fooled by the cache-buster Tokenizer appends", async () => {
		// Same file, new query string, is not a change.
		const { actor } = await apply({
			avatarFilename: `${PARENT}?1699999999`,
			tokenFilename: "worlds/w/tokenizer/bryn.Token.webp",
		});
		expect(actor.update.mock.calls[0][0].img).toBeUndefined();
	});

	it("skips the prototype token for a wildcard, as Tokenizer's own update does", async () => {
		const { actor } = await apply({ isWildCard: true, tokenFilename: "worlds/w/tokenizer/bryn.Token.webp" });
		expect(actor.update).not.toHaveBeenCalled();
	});

	it("carries the new token onto scenes through Tokenizer's own exported helper", async () => {
		const { actor, api } = await apply({ tokenFilename: "worlds/w/tokenizer/bryn.Token.webp" });
		expect(api.updateSceneTokenImg).toHaveBeenCalledWith(actor);
	});
});
