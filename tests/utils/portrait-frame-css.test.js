import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Source scan over the real stylesheet, guarding the parts of the portrait-frame feature that
// live in CSS and fail SILENTLY when they regress.
//
// Two distinct hazards:
//  1. a clipping box that lost `position: relative`, which lets a framed image (sized to several
//     hundred percent) position itself against the sheet window instead. The follower card is the
//     nastiest: it already had `overflow: hidden` and a radius, so it looks finished, and it
//     appears to work on a FALLEN card because `.is-dead` sets a `filter`, which creates a
//     containing block by accident.
//  2. a selector still naming the element the class used to sit on. When the surface class moved
//     from the <img> to a wrapping <span>, `img.steading-player-portrait` and
//     `.stonetop-rel-portrait[data-name]` stopped matching anything at all. Nothing throws; the
//     hover preview and the GM's only route to re-pick a resident's photo just stop working.

// Comments are stripped first. This file's comments are long and full of commas, and a selector
// list read straight out of the raw text would swallow the paragraph above the rule.
const CSS = fs.readFileSync(path.join(process.cwd(), "styles", "stonetop.css"), "utf8")
	.replace(/\/\*[\s\S]*?\*\//g, "");

/** The declaration block for an exact selector, so a rule can be asserted on in isolation. */
function block(selector) {
	// Match the selector as a whole comma-separated entry, then take up to the closing brace.
	const rx = new RegExp(`(^|[,}])\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m");
	const m = CSS.match(rx);
	return m ? m[2] : null;
}

describe("the clipping boxes a chosen frame paints inside", () => {
	// Guard the scan itself: the day the CSS is reshuffled, a lookup that quietly returns null
	// would make every assertion below pass vacuously.
	it("finds every surface rule it is about to assert on", () => {
		for (const sel of [".stonetop-rel-portrait", ".stonetop-follower-portrait",
			".steading-member-avatar", ".steading-player-portrait", ".stonetop-follower-portrait-img",
			".stonetop-npc-portrait"]) {
			expect(block(sel), `no declaration block found for ${sel}`).toBeTruthy();
		}
	});

	it.each([
		[".stonetop-rel-portrait"],
		[".steading-member-avatar"],
		[".steading-player-portrait"],
		// The NPC sheet header. The class it clips under is the WRAPPER's, not .stonetop-portrait,
		// which the no-art placeholder also wears and which must stay a flex centring box.
		[".stonetop-npc-portrait"],
	])("%s establishes a containing block and clips", (sel) => {
		const b = block(sel);
		expect(b).toMatch(/position:\s*relative/);
		expect(b).toMatch(/overflow:\s*hidden/);
	});

	it("keeps the follower portrait positioned but UNCLIPPED, with the mask on its inner span", () => {
		// The odd one out, deliberately: the crop pip hangs 1px past the padding box to sit flush
		// with the border-box corner, and overflow clips at the PADDING edge, so this box must not
		// clip. The mask moved to .stonetop-follower-portrait-clip. Getting this wrong is not
		// subtle — an unclipped framed portrait is several hundred percent of its box and paints
		// over whatever is above it.
		const box = block(".stonetop-follower-portrait");
		expect(box).toMatch(/position:\s*relative/);
		expect(box).not.toMatch(/overflow:\s*hidden/);
		const clip = block(".stonetop-follower-portrait-clip");
		expect(clip, "the follower's mask is gone").toBeTruthy();
		expect(clip).toMatch(/overflow:\s*hidden/);
		expect(clip).toMatch(/border-radius:/);
		expect(clip).toMatch(/position:\s*absolute/);
	});

	it("keeps the follower portrait SQUARE, matching the character sheet's own avatar", () => {
		// A hand-framed face is a square rect (portrait-frame.js suggestSquare), so a square box
		// shows all of it while a circle mask discards the ~21% outside the inscribed disc. Both
		// the box and its mask have to agree, or the ring and the picture disagree at the corners.
		// The small roster avatars stay round on purpose, so this is asserted per-surface.
		for (const sel of [".stonetop-follower-portrait", ".stonetop-follower-portrait-clip"]) {
			expect(block(sel), `${sel} went back to a circle`).not.toMatch(/border-radius:\s*50%/);
			expect(block(sel)).toMatch(/border-radius:\s*calc\(|border-radius:\s*var\(--st-radius\)/);
		}
		for (const sel of [".stonetop-rel-portrait", ".steading-member-avatar", ".steading-player-portrait"]) {
			expect(block(sel), `${sel} is meant to stay circular`).toMatch(/border-radius:\s*50%/);
		}
	});

	it("pins the crop pip's own box against core's button rule", () => {
		// Core styles a bare `button` with `height: var(--button-size)` AND
		// `min-height: var(--button-size)` (28px), plus padding and a gap. min-height BEATS
		// height, so a 20px pip renders 20x28: an ellipse, with its glyph centred in a box
		// taller than the circle that is actually visible. Verified against the real
		// foundry2.css, where a plain 20x20 button measures 20x28.
		const b = block(".stonetop-follower-portrait-frame");
		expect(b, "the crop pip rule is gone").toBeTruthy();
		expect(b).toMatch(/min-height:\s*0/);
		expect(b).toMatch(/padding:\s*0/);
	});

	it("does not round the follower's inner image, which would clip the face on a framed portrait", () => {
		// At 250% of its box a 50% radius is a huge ellipse whose curve cuts through pixels well
		// inside the visible circle. The wrapper's own radius already masks it.
		expect(block(".stonetop-follower-portrait-img")).not.toMatch(/border-radius/);
	});
});

describe("the follower portrait's markup contract", () => {
	const HBS = fs.readFileSync(
		path.join(process.cwd(), "templates", "actor", "partials", "tab-followers.hbs"), "utf8");

	it("wraps the portrait image in the clip span", () => {
		// The box deliberately does not clip, so this span is the only thing keeping a framed
		// portrait inside its circle. Losing it does not degrade quietly: the image is sized to
		// several hundred percent and paints across the sheet.
		expect(HBS).toMatch(/<span class="stonetop-follower-portrait-clip"><img class="stonetop-follower-portrait-img"/);
	});

	it("keeps the crop pip a sibling of the clip, not inside it", () => {
		// Inside the clip the pip would be masked to the circle again, which is the whole thing
		// the restructure was for.
		const clipEnd = HBS.indexOf("</span>", HBS.indexOf("stonetop-follower-portrait-clip"));
		const pipAt = HBS.indexOf("stonetop-follower-portrait-frame");
		expect(clipEnd).toBeGreaterThan(-1);
		expect(pipAt).toBeGreaterThan(clipEnd);
	});
});

describe("the NPC header portrait's markup contract", () => {
	const HBS = fs.readFileSync(path.join(process.cwd(), "templates", "actor", "npc.hbs"), "utf8");

	it("puts .stonetop-portrait on the clipping box, not on the image", () => {
		// Three things find the slot by that class and would break quietly if it moved to the
		// <img>: the play-mode popout and the edit-mode framer button (utils/stat-block-edit.js),
		// and the broken-art guard (utils/sheet-chrome.js), which removes the whole slot.
		// The image inside carries its own class so it can join the shared crop rule.
		const boxes = HBS.match(/class="stonetop-portrait stonetop-npc-portrait stonetop-portrait-box"/g);
		expect(boxes, "the play-mode and edit-mode portrait boxes").toHaveLength(2);
		expect(HBS).toMatch(/<img class="stonetop-npc-portrait-img"/);
		// The no-art placeholder is the third .stonetop-portrait slot, and is a span too.
		expect(HBS).toMatch(/<span class="stonetop-portrait stonetop-npc-portrait-placeholder"/);
	});

	it("keeps data-edit on the image, which is what Foundry's file picker binds", () => {
		// ActorSheet.activateListeners binds img[data-edit]; on the wrapping span it would bind
		// nothing and edit mode would lose its only route to choose art.
		expect(HBS).toMatch(/<img class="stonetop-npc-portrait-img"[^>]*\sdata-edit="img"/);
	});
});

describe("selectors that would break silently", () => {
	it("no longer qualifies the PC portrait as an img", () => {
		expect(CSS).not.toMatch(/img\.steading-player-portrait\b/);
	});

	it("no longer selects the relationship portrait by [data-name]", () => {
		// data-name stays on the inner image, so a class-on-span selector matches nothing.
		expect(CSS).not.toMatch(/\.stonetop-rel-portrait\[data-name\]/);
	});

	// The rule is identified by its opening declarations, then read back — so this still finds it
	// if the block moves, and fails loudly if it stops existing. The tail is captured separately
	// rather than anchored to `}`, so a declaration added to the rule does not silently unmatch it.
	const sharedCropRule = () =>
		CSS.match(/([^{}]+)\{\s*object-fit:\s*cover;\s*object-position:\s*center top;([^{}]*)\}/);

	it("keeps the shared crop rule pointed at the five inner images", () => {
		const m = sharedCropRule();
		expect(m, "the shared cover/center-top rule is gone").toBeTruthy();
		const selectors = m[1].split(",").map((s) => s.trim()).filter(Boolean);
		expect(selectors).toHaveLength(6);
		for (const sel of [".steading-member-avatar-img", ".steading-player-portrait-img",
			".stonetop-follower-portrait-img", ".stonetop-npc-portrait-img", ".stonetop-rel-portrait-img"]) {
			expect(selectors, `${sel} missing from the shared crop rule`).toContain(sel);
		}
		// The gallery tile is NOT a frame site (a tile shows source art, not a person's
		// portrait), so its selector is deliberately unchanged.
		expect(selectors.some((s) => s.includes("stonetop-people-pick"))).toBe(true);
	});

	it("kills core's black image border on every portrait inside a clipping box", () => {
		// Core v13 ships `body.game .app img { border: 1px solid var(--color-border-dark);
		// border-radius: 2px }` in @layer compatibility. Without these two declarations the
		// 20px inner image draws a black SQUARE inside the 22px round avatar — the middle of
		// each of its four edges falls inside the circle, the corners get masked — and the
		// image also loses 2px of box to a border it never wanted, exposing the wrapper's pale
		// plate as a second ring. Reproduced against the real foundry2.css.
		const m = sharedCropRule();
		expect(m, "the shared cover/center-top rule is gone").toBeTruthy();
		expect(m[2], "core's img border is back inside every portrait circle").toMatch(/border:\s*none/);
		expect(m[2], "core's 2px img radius is back").toMatch(/border-radius:\s*0/);
	});
});
