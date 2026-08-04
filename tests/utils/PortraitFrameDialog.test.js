import { afterEach, describe, expect, it, vi } from "vitest";
import { PortraitFrameDialog } from "../../module/utils/PortraitFrameDialog.js";
import { actorFrameHandle, followerFrameHandle } from "../../module/utils/portrait-frame-handles.js";

// The rail's "this is not Tokenizer" note.
//
// Two tools sit a few pixels apart on a sheet header and do different jobs: this dialog chooses
// the SQUARE of a portrait the sheets show, Tokenizer makes the pog that goes on the MAP. The note
// says so, and it appears only when both are genuinely on offer — otherwise it introduces a tool
// the reader has not got and cannot act on.

// getData routes its paths through Foundry's own helper, which the shared setup has no need of.
globalThis.foundry.utils.getRoute = (path) => `/${path}`;

afterEach(() => { delete globalThis.game.modules; });

/** A `game.modules` registry answering the way Foundry's does. */
function installTokenizer({ active = true, api = { launch: vi.fn() } } = {}) {
	globalThis.game.modules = { get: (id) => (id === "vtta-tokenizer" ? { active, api } : undefined) };
}

const ACTOR = { id: "abc", name: "Bryn", img: "worlds/w/bryn.webp", isOwner: true, flags: {} };

/** The dialog as every caller builds it: a handle, and the picture to frame. */
const dialogFor = (handle) =>
	new PortraitFrameDialog({ handle, img: handle?.img ?? "" });

describe("the frame dialog's Tokenizer note", () => {
	it("is shown when Tokenizer is installed and an actor is being framed", () => {
		installTokenizer();
		expect(dialogFor(actorFrameHandle(ACTOR)).getData().showTokenizerNote).toBe(true);
	});

	it("is hidden when Tokenizer is not installed", () => {
		// The whole point of the note is to tell two available things apart. With one of them
		// absent it is a paragraph about a button the reader cannot see.
		globalThis.game.modules = { get: () => undefined };
		expect(dialogFor(actorFrameHandle(ACTOR)).getData().showTokenizerNote).toBe(false);
	});

	it("is hidden when the module is installed but disabled", () => {
		installTokenizer({ active: false });
		expect(dialogFor(actorFrameHandle(ACTOR)).getData().showTokenizerNote).toBe(false);
	});

	it("is hidden for a follower card, which has no token in its story at all", () => {
		// A follower is a flag rather than a document: Tokenizer has nothing to tokenize, so the
		// contrast the note draws would raise a question instead of answering one. Same gate the
		// tokenize pip uses, so the note and the button cannot come to disagree.
		installTokenizer();
		const follower = followerFrameHandle(
			{ ...ACTOR, flags: { "stonetop-pwd": { "crew.details": { img: "worlds/w/crew.webp" } } } },
			"crew.details", { editable: true });
		// Asserted, so this cannot pass merely because the handle came back null.
		expect(follower, "no follower handle to frame with").toBeTruthy();
		expect(follower.actor).toBeUndefined();
		expect(dialogFor(follower).getData().showTokenizerNote).toBe(false);
	});

	it("still answers the stage paths it has always answered", () => {
		// The note rides along in the same payload; a thrown getData is a dialog that opens empty.
		installTokenizer();
		const data = dialogFor(actorFrameHandle(ACTOR)).getData();
		expect(data.stageSrc).toContain("bryn.webp");
		expect(data.fallbackSrc).toContain("bryn.webp");
	});
});
