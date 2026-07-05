import { describe, it, expect } from "vitest";
import {
	DEFEND_READINESS_BASE_CAP,
	defendReadinessHold,
	defendReadinessCap,
} from "../../module/combat/defend-readiness.js";

describe("defendReadinessHold", () => {
	it("holds 3 on a 10+, 1 on a 7-9, 0 on a miss (no shield / Guardian)", () => {
		expect(defendReadinessHold("success")).toBe(3);
		expect(defendReadinessHold("partial")).toBe(1);
		expect(defendReadinessHold("failure")).toBe(0);
	});

	it("a borne shield adds +1 to a hit but never to a miss", () => {
		const opts = { hasShield: true };
		expect(defendReadinessHold("success", opts)).toBe(4);
		expect(defendReadinessHold("partial", opts)).toBe(2);
		expect(defendReadinessHold("failure", opts)).toBe(0);
	});

	it("Guardian holds 1 extra at every tier, including 1 on a 6-", () => {
		const opts = { hasGuardian: true };
		expect(defendReadinessHold("success", opts)).toBe(4);
		expect(defendReadinessHold("partial", opts)).toBe(2);
		expect(defendReadinessHold("failure", opts)).toBe(1);
	});

	it("stacks a shield and Guardian on a hit", () => {
		const opts = { hasShield: true, hasGuardian: true };
		expect(defendReadinessHold("success", opts)).toBe(5);
		expect(defendReadinessHold("partial", opts)).toBe(3);
		// The shield stays a hit-only bonus: a miss with Guardian still holds only 1.
		expect(defendReadinessHold("failure", opts)).toBe(1);
	});
});

describe("defendReadinessCap", () => {
	it("is 3 by default, 4 with a shield, 4 with Guardian, 5 with both", () => {
		expect(defendReadinessCap()).toBe(DEFEND_READINESS_BASE_CAP);
		expect(defendReadinessCap({ hasShield: true })).toBe(4);
		expect(defendReadinessCap({ hasGuardian: true })).toBe(4);
		expect(defendReadinessCap({ hasShield: true, hasGuardian: true })).toBe(5);
	});
});
