import { describe, it, expect } from "vitest";
import { describeRebuild } from "../../module/book2-art/run-rebuild.js";

// The one sentence every entry point shows after a rebuild — the chat card, the Welcome guide's
// Book Art step and game.stonetop.rebuildPortraits all report through this, so they cannot drift
// into saying different things about the same run.

describe("describing a rebuild", () => {
	it("reports a normal run", () => {
		expect(describeRebuild({ written: 153, failed: 0, repointed: 0 }))
			.toBe("Rebuilt 153 portraits from art already on disk.");
	});

	it("mentions art already in play that moved to its close-up", () => {
		expect(describeRebuild({ written: 153, failed: 0, repointed: 12 }))
			.toBe("Rebuilt 153 portraits from art already on disk. "
				+ "12 portraits already in play now use their close-up.");
	});

	it("agrees in the singular, verb and possessive alike", () => {
		expect(describeRebuild({ written: 1, failed: 0, repointed: 1 }))
			.toBe("Rebuilt 1 portrait from art already on disk. "
				+ "1 portrait already in play now uses its close-up.");
	});

	it("owns up to a partial run", () => {
		// A partial run must say so: the entry points keep offering the remainder, and a message
		// that read like success would make that look like a bug.
		expect(describeRebuild({ written: 140, failed: 13, repointed: 0 }))
			.toBe("Rebuilt 140 portraits from art already on disk. 13 could not be read (see the console).");
	});

	it("says nothing about re-pointing when nothing moved", () => {
		expect(describeRebuild({ written: 5, failed: 0, repointed: 0 })).not.toMatch(/close-up/);
	});

	it("survives a malformed result rather than printing undefined at a GM", () => {
		expect(describeRebuild({})).toBe("Rebuilt 0 portraits from art already on disk.");
		expect(describeRebuild(null)).toBe("Rebuilt 0 portraits from art already on disk.");
	});
});
