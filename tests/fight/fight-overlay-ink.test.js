import { describe, it, expect } from "vitest";
import { FIGHT_INK_FALLBACK } from "../../module/fight/fight-overlay.js";
import { readRepo } from "../fakes/css.js";
import { contrastRatio, ratioText } from "../fakes/contrast.js";

// The fight overlay's ink: the painter's fallbacks equal the stylesheet's tokens, the marks stand out
// from their halo and the badge's number from its disc, in the shipped palette and in high contrast.

const css = readRepo("styles/stonetop.css");
const hex = n => `#${n.toString(16).padStart(6, "0")}`;

/** The value of `--stonetop-fight-<name>` inside the first rule starting at `from`. */
function token(name, from = 0) {
	const key = `--stonetop-fight-${name}:`;
	const at = css.indexOf(key, from);
	return at < 0 ? null : css.slice(at + key.length, css.indexOf(";", at)).trim();
}

const rootAt = css.indexOf(":root {");
const highContrastAt = css.indexOf(":root.stonetop-high-contrast {");
const palettes = {
	shipped: name => token(name, rootAt),
	"high contrast": name => token(name, highContrastAt),
};

describe("the fight overlay's ink", () => {
	it("keeps the painter's fallbacks equal to the shipped tokens", () => {
		expect(token("melee", rootAt)).toBe(hex(FIGHT_INK_FALLBACK.melee));
		expect(token("ranged", rootAt)).toBe(hex(FIGHT_INK_FALLBACK.ranged));
		expect(token("halo", rootAt)).toBe(hex(FIGHT_INK_FALLBACK.halo));
		expect(Number(token("halo-alpha", rootAt))).toBe(FIGHT_INK_FALLBACK.haloAlpha);
		expect(token("badge", rootAt)).toBe(hex(FIGHT_INK_FALLBACK.badge));
		expect(token("badge-glyph", rootAt)).toBe(hex(FIGHT_INK_FALLBACK.badgeGlyph));
		expect(Number(token("weight", rootAt))).toBe(FIGHT_INK_FALLBACK.weight);
	});

	it("declares every colour as six-digit hex, the only form the painter reads", () => {
		for (const [palette, read] of Object.entries(palettes)) {
			for (const name of ["melee", "ranged", "halo", "badge", "badge-glyph"]) {
				expect(read(name), `${palette} ${name}`).toMatch(/^#[0-9a-f]{6}$/i);
			}
		}
	});

	it("re-points every token in the high-contrast rule, inside that rule", () => {
		const end = css.indexOf("}", highContrastAt);
		for (const name of ["melee", "ranged", "halo", "halo-alpha", "badge", "badge-glyph", "weight"]) {
			const at = css.indexOf(`--stonetop-fight-${name}:`, highContrastAt);
			expect(at, name).toBeGreaterThan(highContrastAt);
			expect(at, name).toBeLessThan(end);
		}
		expect(Number(palettes["high contrast"]("weight"))).toBeGreaterThan(1);
	});

	it("keeps each line at least 3:1 against its halo", () => {
		for (const [palette, read] of Object.entries(palettes)) {
			for (const line of ["melee", "ranged"]) {
				const ratio = contrastRatio(read(line), read("halo"));
				expect(ratio, `${palette} ${line} on halo: ${ratioText(read(line), read("halo"))}`).toBeGreaterThanOrEqual(3);
			}
		}
	});

	it("keeps the badge's number at least 7:1 on its disc", () => {
		for (const [palette, read] of Object.entries(palettes)) {
			const ratio = contrastRatio(read("badge-glyph"), read("badge"));
			expect(ratio, `${palette}: ${ratioText(read("badge-glyph"), read("badge"))}`).toBeGreaterThanOrEqual(7);
		}
	});
});
