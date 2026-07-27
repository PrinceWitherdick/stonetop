import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GLYPH_TEXT_CONTAINERS } from "../../module/utils/glyphs.js";

// The suite runs on `environment: "node"` with no jsdom, so these are static guards on the
// shared list rather than a render test — which is the part that actually drifted: every
// surface used to keep its own copy of these selectors, so a container added to one was
// missing from the others and rendered raw fallback-font ◇/○ instead of the styled glyph.
const ROOT = path.resolve(__dirname, "../..");
const CLASSES = GLYPH_TEXT_CONTAINERS.split(",").map(s => s.trim());

const readTemplates = () => {
	const out = [];
	const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e =>
		e.isDirectory() ? walk(path.join(dir, e.name))
			: e.name.endsWith(".hbs") && out.push(fs.readFileSync(path.join(dir, e.name), "utf8")));
	walk(path.join(ROOT, "templates"));
	return out.join("\n");
};

describe("GLYPH_TEXT_CONTAINERS", () => {
	it("names every container the surfaces used to list separately", () => {
		for (const cls of [
			// character sheet
			".stonetop-item-description", ".stonetop-arcanum-body", ".stonetop-invocation-desc",
			".stonetop-lore-description", ".stonetop-lore-option-desc",
			".stonetop-sub-choice-text", ".stonetop-possession-choice-gear .stonetop-inv-label",
			".stonetop-crew-gear-label", ".stonetop-follower-gear-name",
			// onboarding
			".stonetop-onboarding-card-desc", ".stonetop-onboarding-card-inline-desc",
			".stonetop-onboarding-lore-desc", ".stonetop-onboarding-lore-pick-text",
			".stonetop-onboarding-lore-text-label", ".stonetop-onboarding-suboption-label",
			".stonetop-onboarding-arcana-front-body",
			// dialogs + chat
			".stonetop-special-pick-traits", ".stonetop-chat-move-description",
			".stonetop-roll-card-description", ".stonetop-arcanum-chat-card",
		]) {
			expect(CLASSES).toContain(cls);
		}
	});

	// A <textarea>'s value is a text node, so wrapping one would rewrite the player's saved
	// answer. Every entry has to resolve to a display-only element.
	it("never names a textarea or a rich-text editor", () => {
		const templates = readTemplates();
		for (const sel of CLASSES) {
			const cls = sel.split(/\s+/).pop().slice(1); // last simple selector, minus the dot
			const tags = [...templates.matchAll(
				new RegExp(`<([a-zA-Z-]+)\\b[^>]*class="[^"]*\\b${cls}\\b`, "g"))].map(m => m[1]);
			expect(tags, `${sel} renders as <${tags.join("/")}>`).not.toContain("textarea");
			expect(tags, `${sel} renders as <${tags.join("/")}>`).not.toContain("prose-mirror");
		}
	});

	it("has no duplicate entries", () => {
		expect(CLASSES).toHaveLength(new Set(CLASSES).size);
	});
});
