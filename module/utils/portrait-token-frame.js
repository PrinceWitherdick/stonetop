// Make a chosen portrait frame visible on the MAP.
//
// The frame is stored as a rect and painted by an inline style, which is what lets a player crop
// their own portrait without the upload rights baking a file would need (see portrait-frame.js).
// The cost of that choice is that only surfaces which KNOW about the rect apply it — and the
// canvas is not one of them. A token is drawn straight from `prototypeToken.texture.src`, and
// Foundry's token texture carries scale, offset and fit but no crop rect, so there is no
// arrangement of those fields that means "show this square of the picture". The only way a token
// can show the face somebody framed is for that square to exist as a file.
//
// So: on save, cut it. The rect stays the source of truth — this is a one-way export, taken at
// the moment the frame is written, and re-framing overwrites the same file rather than piling up
// one per crop.
//
// WHOSE TOKEN IS TOUCHED. `tokenFollowsPortrait` below is where that rule is written down, for
// this side and for the portrait side (StonetopActor#_syncPrototypeTokenImage, which calls it):
//   • the token is still a stock placeholder — nothing to lose;
//   • the token is showing the portrait — it was following, so it goes on following; or
//   • the token is one of our own bakes — it is following the FRAME, and this is the re-frame.
// A token anyone chose, or Tokenizer cut, is never touched.

import { documentPortraitFrame, isPortraitFrameBake, isValidFrame, sameSrc } from "./portrait-frame.js";
import { isDefaultImg } from "./strings.js";

/**
 * May this user bake at all? Cutting a square writes a file, which needs FILES_UPLOAD — a right
 * most worlds keep to the GM. Everything else about framing works without it, so this is a
 * capability to check rather than an error to raise.
 */
export function canBakePortraitFrame() {
	return !!game.user?.can?.("FILES_UPLOAD");
}

/** Is this token image ours to move, under the three-state rule above? */
export function tokenFollowsPortrait(actor) {
	const current = actor?.prototypeToken?.texture?.src;
	if (current === undefined) return false;
	return isDefaultImg(current) || isPortraitFrameBake(current) || sameSrc(current, actor.img);
}

/**
 * Point the prototype token at a freshly baked square of `frame`.
 *
 * Best-effort by design: the frame itself is already saved by the time this runs, and a world
 * without upload rights (or a portrait the canvas cannot read, e.g. an external URL with no CORS
 * headers) must still keep the crop everywhere else. Failures are logged, never thrown.
 *
 * Returns the stored token path, or null when nothing was written.
 */
export async function syncPrototypeTokenToFrame(actor, frame = undefined) {
	if (!actor?.isOwner) return null;
	const rect = (frame === undefined ? documentPortraitFrame(actor) : frame);
	if (!isValidFrame(rect)) return null;
	if (!canBakePortraitFrame() || !tokenFollowsPortrait(actor)) return null;
	try {
		const { bakeFrameToFile } = await import("./portrait-tokenizer.js");
		const path = await bakeFrameToFile(rect.src, rect.rect, { name: actor.name, id: actor.id });
		if (!path) return null;
		// One file per person, overwritten on every re-frame — so the URL is unchanged and the
		// browser (and PIXI's texture cache) would happily paint the PREVIOUS crop. The stamp is
		// what makes a re-frame visible. Every comparison this module makes strips it.
		const busted = `${path}?${Date.now()}`;
		await actor.update({ "prototypeToken.texture.src": busted });
		return busted;
	} catch (err) {
		console.warn("stonetop | could not bake the portrait frame for this token", err);
		return null;
	}
}

/**
 * Put the token back on the whole portrait when a frame is cleared.
 *
 * Only when the token is currently one of our bakes: clearing a frame should undo what framing
 * did and nothing else, so a token that was already showing the portrait (or a placeholder, or a
 * chosen image) is left exactly where it is. The baked file is left on disk — Foundry exposes no
 * delete — but nothing points at it, and the next frame overwrites it.
 */
export async function revertPrototypeTokenFrame(actor) {
	if (!actor?.isOwner) return null;
	const current = actor.prototypeToken?.texture?.src;
	if (!isPortraitFrameBake(current)) return null;
	// Nothing to fall back TO is not a reason to blank the token: an empty texture draws nothing
	// at all, which is worse than the crop we were undoing.
	const portrait = actor.img ?? "";
	if (!portrait) return null;
	await actor.update({ "prototypeToken.texture.src": portrait });
	return portrait;
}
