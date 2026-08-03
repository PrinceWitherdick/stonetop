import { describe, expect, it, beforeEach } from "vitest";
import { wrapLoreTerms, LORE_TERM_TOOLTIPS } from "../../module/utils/lore-terms.js";

// Bare god names in the authored Introductions prompts get a player-safe hover summary.
// That is a hover description, so it answers to the "On Hover Info" menu
// (`hoverDescriptionsLoreTerms`, under the `hoverDescriptionsEnabled` master) — it used
// to be ungated, which is part of what made the master switch a lie.

let settings;

beforeEach(() => {
	settings = { hoverDescriptionsEnabled: true, hoverDescriptionsLoreTerms: true };
	global.game = { settings: { get: (_ns, key) => settings[key] } };
});

describe("wrapLoreTerms", () => {
	it("wraps a god's name with its summary", () => {
		const out = wrapLoreTerms("You were raised to serve Danu.");
		expect(out).toContain('class="stonetop-lore-term"');
		expect(out).toContain(LORE_TERM_TOOLTIPS.danu.slice(0, 40));
		expect(out).toContain(">Danu<");
	});

	it("matches the longest term first, so 'the goddess' beats any substring", () => {
		const out = wrapLoreTerms("a servant of the goddess");
		expect(out).toContain(">the goddess<");
	});

	it("leaves prose untouched when the lore-term toggle is off", () => {
		settings.hoverDescriptionsLoreTerms = false;
		const src = "You were raised to serve Danu.";
		// Not a stripped-tooltip span but the authored string, byte for byte — a span
		// that shows nothing on hover is worse than no span.
		expect(wrapLoreTerms(src)).toBe(src);
	});

	it("obeys the master switch too", () => {
		settings.hoverDescriptionsEnabled = false;
		const src = "You were raised to serve Danu.";
		expect(wrapLoreTerms(src)).toBe(src);
	});

	it("passes empty input straight through", () => {
		expect(wrapLoreTerms("")).toBe("");
		expect(wrapLoreTerms(undefined)).toBeUndefined();
	});

	it("only wraps curated terms, not every glossary key", () => {
		// "Tor" has a summary but is deliberately absent from the wrap list (too short
		// and ambiguous to auto-match in prose).
		expect(LORE_TERM_TOOLTIPS.tor).toBeTruthy();
		expect(wrapLoreTerms("a road to Tor")).toBe("a road to Tor");
	});
});
