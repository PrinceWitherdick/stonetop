import { replaceTextMatches } from "./text-nodes.js";

const _GLYPH_RE = /[○●◇◆□☐■☑▶]+/g;

/**
 * Wrap standalone mark/charge tracks (runs of ◇ or ○) in a block span so CSS can drop
 * them onto their own centered line, matching the printed cards. Only two shapes count
 * as tracks: a run trailing a sentence at the end of a paragraph (e.g. "…maximum of 3):
 * ◇◇◇</p>") and a run leading the text (e.g. the unlock line "○○○○ When you make the
 * last mark…"). Runs sitting inline with a label — "(Loyalty ○○○)", "□ STORM'S FURY
 * ○○○○", "Casting penalty ○○○○○", "(it's ○○ at most)" — are followed by ), </strong>,
 * <br>, or more text, never </p>, so they are left untouched.
 *
 * Call this on raw description HTML BEFORE any per-glyph processing (checkbox markers,
 * wrapStonetopGlyphsInEl) so the glyphs end up inside the centered wrapper.
 */
export function centerArcanumTracks(html) {
	if (!html) return html;
	return html
		.replace(/\s([◇○]{2,})\s*(<\/p>)/g, ' <span class="stonetop-arcanum-track">$1</span>$2')
		.replace(/^(\s*)([◇○]{2,})\s+/, '$1<span class="stonetop-arcanum-track">$2</span> ');
}

export function wrapStonetopGlyphsInEl(container) {
	replaceTextMatches(container, {
		skip:  ".stonetop-glyph, .stonetop-move-ref",
		regex: _GLYPH_RE,
		// A run like "◇◇○" becomes one span per glyph.
		render: (match) => {
			const runGlyphs = [...match[0]];
			return runGlyphs.map((glyph, gi) => {
				const span = document.createElement("span");
				span.className = "stonetop-glyph";
				if (glyph === "◇") span.classList.add("stonetop-glyph--diamond");
				else if (glyph === "◆") span.classList.add("stonetop-glyph--diamond-selected");
				else if (glyph === "▶") span.classList.add("stonetop-glyph--arrow");
				else if (glyph === "□" || glyph === "☐") span.classList.add("stonetop-glyph--checkbox");
				else if (glyph === "■" || glyph === "☑") span.classList.add("stonetop-glyph--checkbox-checked");
				else if (glyph === "○") span.classList.add("stonetop-glyph--circle");
				else if (glyph === "●") span.classList.add("stonetop-glyph--circle-filled");
				// A diamond directly followed by another diamond in the same run is
				// "joined": the journal CSS drops its trailing gap so a "◇◇" load track
				// reads as one unit — the gap only opens up before the following text.
				const isDiamond     = glyph === "◇" || glyph === "◆";
				const nextIsDiamond = runGlyphs[gi + 1] === "◇" || runGlyphs[gi + 1] === "◆";
				if (isDiamond && nextIsDiamond) span.classList.add("stonetop-glyph--joined");
				span.textContent = glyph;
				return span;
			});
		},
	});
}
