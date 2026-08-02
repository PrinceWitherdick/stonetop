import { loadImage, cropToCanvas } from "../book2-art/rebuild-crops.js";
import { normalizeRect } from "./portrait-frame.js";
import { filePicker } from "./foundry-compat.js";

/**
 * Hand a chosen portrait frame to the Tokenizer module (`vtta-tokenizer`), which turns it into a
 * masked, framed token.
 *
 * Tokenizer's own workflow asks for two pictures: a big one shown on hover, and a portrait it
 * applies a token mask to. That is exactly the split this feature already makes, so the mapping is
 * direct — the whole illustration becomes the avatar, and the square the user framed becomes the
 * token source. Choosing that square well is the one thing Tokenizer cannot do for you.
 *
 * WHY A FILE HAS TO BE BAKED. Tokenizer takes image PATHS, so a rect on a flag is invisible to it,
 * and a data: URL is not a way around that: its `Utils.download` does
 * `img.src = url.split("?")[0] + "?" + Date.now()`, appending a cache-buster that corrupts a data
 * URL's payload. So the square is cut to a real .webp first, by the same canvas path the book-art
 * rebuild uses.
 *
 * The rect stays the source of truth. This bake is a one-way export taken at the moment it is
 * asked for, and it writes ONE file per person, overwritten every time: re-framing and sending
 * again replaces it rather than piling up a file per crop. See bakeFileName.
 *
 * ⚠ Tokenizer rewrites `actor.img` to `<path>?<timestamp>` afterwards. Everything here compares
 * paths through helpers that strip query strings for exactly that reason.
 */

const MODULE_ID = "vtta-tokenizer";
const WEBP_QUALITY = 0.9;   // a face at token size, so slightly above the bulk-rebuild's 0.85

/** The module's API, or null when it is not installed or not enabled. */
export function tokenizerApi() {
	const mod = game.modules?.get(MODULE_ID);
	if (!mod?.active) return null;
	return mod.api ?? globalThis.Tokenizer ?? null;
}

/**
 * Can this user actually complete a send?
 *
 * `autoToken` does NOT check permissions — only Tokenizer's interactive `launchTokenizer` does —
 * so an unprivileged user would get all the way to the upload before failing. Gate here instead.
 */
export function canSendToTokenizer(actor) {
	return !!(actor && tokenizerApi() && game.user?.can?.("FILES_UPLOAD"));
}

/** Where baked squares go. Beside the world's own data, not inside the system folder, which a
 *  system update would overwrite. */
function bakeDir() {
	return `worlds/${game.world?.id ?? "world"}/stonetop-portrait-frames`;
}

const FP = filePicker;

/**
 * ONE baked file per person, overwritten on every send. Deliberately carries no rect in its name.
 *
 * An earlier version stamped the crop into the filename so a re-frame could not disturb a file
 * something already pointed at. Nothing does: this bake is a transient INPUT to Tokenizer, which
 * masks it into a pog, uploads that under its own name, and points `prototypeToken.texture.src`
 * at ITS file (`updateToken` reassigns `tokenOptions.tokenFilename` before the actor is updated).
 * So the rect in the name bought nothing and cost a new file per crop, forever, with no way to
 * clean them up — Foundry exposes no delete.
 *
 * The actor id is in the name because the display name is not unique: two NPCs called "Guard"
 * would otherwise overwrite each other's bake.
 */
export function bakeFileName(name, id) {
	const slug = String(name ?? "").trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
	const suffix = String(id ?? "").replace(/[^\w-]+/g, "").slice(0, 16);
	return `${slug || "portrait"}${suffix ? `-${suffix}` : ""}-frame.webp`;
}

/** Create the target folder if it is missing. A folder that already exists throws; that is fine. */
async function ensureDir(dir) {
	try { await FP().createDirectory("data", dir, {}); } catch { /* already there */ }
}

/**
 * Cut `rect` out of `src` and upload it as a square .webp. Returns the stored path.
 *
 * crossOrigin stays "anonymous" here — unlike the editor, this DOES touch a canvas, and a tainted
 * one throws only at toBlob, i.e. after all the work. The practical effect is that an external
 * URL without CORS headers cannot be baked; the caller reports that rather than half-failing.
 */
export async function bakeFrameToFile(src, rect, { name = "portrait", id = "" } = {}) {
	const r = normalizeRect(rect);
	if (!src || !r) return null;
	const path = String(src).split("#")[0].split("?")[0].replace(/^\/+/, "");
	const img = await loadImage(encodeURI(foundry.utils.getRoute(path)));
	if (!(img.naturalWidth > 0) || !(img.naturalHeight > 0)) return null;

	const canvas = cropToCanvas(img, r);
	const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
	if (!blob) return null;

	const dir = bakeDir();
	await ensureDir(dir);
	const file = new File([blob], bakeFileName(name, id), { type: "image/webp" });
	const result = await FP().upload("data", dir, file, { overwrite: true }, { notify: false });
	return result?.path ?? `${dir}/${file.name}`;
}

/**
 * Bake the frame and hand it to Tokenizer, headless.
 *
 * `autoToken` never renders its window: it builds an offscreen view, applies the configured frame
 * to the token source, uploads the result and updates the actor. Because it merges our options
 * over its defaults, supplying `tokenFilename` is all it takes to make OUR square the face it
 * masks — and `avatarFilename` passes straight through to the actor update, so the whole
 * illustration becomes the big image in the same call.
 *
 * Returns the token path, or null if nothing was sent.
 */
export async function sendPortraitToTokenizer(actor, { src, rect, avatarSrc = null } = {}) {
	const api = tokenizerApi();
	if (!api?.autoToken || !canSendToTokenizer(actor)) return null;
	const token = await bakeFrameToFile(src, rect, { name: actor.name, id: actor.id });
	if (!token) return null;
	return api.autoToken(actor, {
		tokenFilename: token,
		// Only override the avatar when we have a better one to offer (the whole illustration
		// behind a shipped square). Otherwise leave Tokenizer's default, which is the actor's
		// current img — passing our own would be a no-op at best and a surprise at worst.
		...(avatarSrc ? { avatarFilename: avatarSrc } : {}),
		// A wildcard token path would send the upload somewhere else entirely and leave
		// prototypeToken untouched; this is a deliberate single image.
		isWildCard: false,
		updateActor: true
	});
}
