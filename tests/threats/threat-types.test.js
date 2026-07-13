import { describe, it, expect } from "vitest";
import {
	THREAT_TYPES, THREAT_TYPE_IDS, THREAT_PROXIMITIES, THREAT_PROXIMITY_IDS,
	threatType, threatProximity,
} from "../../module/threats/threat-types.js";

describe("threat types catalog (Book I, Threats)", () => {
	it("has the eight threat types in a stable id order", () => {
		expect(THREAT_TYPES).toHaveLength(8);
		expect(THREAT_TYPE_IDS).toEqual([
			"affliction", "beast", "institution", "macguffin",
			"magicalEntity", "rabble", "villain", "wildcard",
		]);
	});

	it("gives every type a label, blurb, hex accent, and non-empty suggested moves", () => {
		for (const t of THREAT_TYPES) {
			expect(t.label, t.id).toBeTruthy();
			expect(t.blurb, t.id).toBeTruthy();
			expect(t.accent, t.id).toMatch(/^#[0-9a-f]{6}$/i);
			expect(Array.isArray(t.suggestedMoves), t.id).toBe(true);
			expect(t.suggestedMoves.length, t.id).toBeGreaterThanOrEqual(9);
			expect(t.suggestedMoves.every(m => typeof m === "string" && m.trim().length), t.id).toBe(true);
			// No em dashes in the shipped move copy (project style rule).
			expect(t.suggestedMoves.some(m => m.includes("—")), t.id).toBe(false);
		}
	});

	it("resolves types by id and falls back to villain (the model default)", () => {
		expect(threatType("beast").id).toBe("beast");
		expect(threatType("nonsense").id).toBe("villain");
		expect(threatType(undefined).id).toBe("villain");
	});

	it("has the three proximity trackers and falls back to nearby", () => {
		expect(THREAT_PROXIMITY_IDS).toEqual(["homefront", "nearby", "distant"]);
		expect(THREAT_PROXIMITIES.every(p => p.label && p.hint)).toBe(true);
		expect(threatProximity("bogus").id).toBe("nearby");
	});
});
