import { describe, it, expect } from "vitest";
import {
	renderThreatSeedCardHtml,
	readThreatSeedCard,
	STONETOP_THREAT_SEED_DRAG_TYPE,
} from "../../module/threats/threat-seed-cards.js";

// The browser decodes an attribute's HTML entities exactly once when read via
// element.dataset. In the node test env there's no DOM, so replicate that single
// decode pass over the characters escHtml emits, to prove the render -> read round-trip.
function decodeEntitiesOnce(s) {
	return s
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

/** Pull the data-stonetop-threat payload out of card HTML as dataset would expose it. */
function fakeCardFrom(html) {
	const m = html.match(/data-stonetop-threat="([^"]*)"/);
	return { dataset: { stonetopThreat: m ? decodeEntitiesOnce(m[1]) : undefined } };
}

describe("threat-seed cards", () => {
	const seed = {
		name: 'Bandit "King" & his crew',
		type: "villain",
		instinct: "to seize power",
		proximity: "nearby",
		gmMoves: ["Make threats, veiled or not", "Take a prisoner"],
	};

	it("round-trips a seed through the card payload", () => {
		const html = renderThreatSeedCardHtml(seed);
		const parsed = readThreatSeedCard(fakeCardFrom(html));
		expect(parsed).toEqual(seed);
	});

	it("shows the type, proximity, instinct, and suggested moves in the card body", () => {
		const html = renderThreatSeedCardHtml(seed);
		expect(html).toContain("Villain");
		expect(html).toContain("Nearby");
		expect(html).toContain("to seize power");
		expect(html).toContain("Take a prisoner");
		// Draggable wrapper carries the threat class + its own drag attribute, and NOT the
		// improvement drag attribute (so the improvement drag binder ignores it).
		expect(html).toContain('class="stonetop-journal-improvement stonetop-journal-threat"');
		expect(html).not.toContain("data-steading-improvement");
	});

	it("falls back to defaults for an unknown type/proximity", () => {
		const html = renderThreatSeedCardHtml({ name: "Mystery" });
		const parsed = readThreatSeedCard(fakeCardFrom(html));
		expect(parsed.type).toBe("villain"); // DEFAULT_THREAT_TYPE
		expect(parsed.proximity).toBe("nearby"); // DEFAULT_PROXIMITY
		expect(parsed.gmMoves).toEqual([]);
	});

	it("readThreatSeedCard returns null on a malformed / empty card", () => {
		expect(readThreatSeedCard({ dataset: {} })).toBeNull();
		expect(readThreatSeedCard({ dataset: { stonetopThreat: "{not json" } })).toBeNull();
		expect(readThreatSeedCard({ dataset: { stonetopThreat: '{"type":"villain"}' } })).toBeNull(); // no name
	});

	it("exposes a stable drag type", () => {
		expect(STONETOP_THREAT_SEED_DRAG_TYPE).toBe("StonetopThreatSeed");
	});
});
