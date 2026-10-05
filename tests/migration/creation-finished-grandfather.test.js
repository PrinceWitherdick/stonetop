import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	unstampedFinishedCharacters, grandfatherCreationFinished, CREATION_FINISHED_SWEEP,
} from "../../module/migration/creation-finished-grandfather.js";
import { oncePerVersion } from "../../module/migration/once-per-version.js";

// A character reads as finished only once its Finish stamps `creationFinished`. Characters made
// before the stamp existed all read as finished under the old rule, so each one with a playbook is
// stamped ONCE PER WORLD: a re-run under a later version would reach characters saved and closed
// part-way under the new code, and wrongly mark them finished.

const SCOPE = "stonetop-pwd";
const SETTING = "repairSweepVersions";

let stored;
beforeEach(() => {
	stored = {};
	globalThis.game = {
		system: { version: "1.7.1" },
		settings: {
			get: (_ns, key) => (key === SETTING ? stored : undefined),
			set: (_ns, key, value) => { if (key === SETTING) stored = value; return Promise.resolve(value); },
		},
	};
});

const pc = (id, { slug = "heavy", flags = {}, type = "character" } = {}) => {
	const a = {
		id, type,
		system: { playbook: slug ? { slug, name: slug } : {} },
		flags: { [SCOPE]: { ...flags } },
		setFlag: vi.fn(async (_scope, key, value) => { a.flags[SCOPE][key] = value; }),
	};
	return a;
};

describe("which characters predate the stamp", () => {
	it("is every character with a playbook and no stamp, stale progress flag or not", () => {
		const clean = pc("a");
		const stale = pc("b", { flags: { onboardingProgress: { state: "exited", step: 3, total: 9 } } });
		expect(unstampedFinishedCharacters([clean, stale])).toEqual([clean, stale]);
	});

	it("leaves one already stamped, one with no playbook, and non-characters", () => {
		expect(unstampedFinishedCharacters([
			pc("a", { flags: { creationFinished: true } }),
			pc("b", { slug: null }),
			pc("c", { type: "npc" }),
		])).toEqual([]);
	});
});

describe("grandfatherCreationFinished", () => {
	it("stamps each pre-stamp character once", async () => {
		const a = pc("a");
		const b = pc("b", { slug: null });
		await expect(grandfatherCreationFinished({ actors: [a, b] })).resolves.toBe(1);
		expect(a.setFlag).toHaveBeenCalledWith(SCOPE, "creationFinished", true);
		expect(b.setFlag).not.toHaveBeenCalled();
	});

	it("never runs again in a world that has run it, even under a later version", async () => {
		await oncePerVersion(CREATION_FINISHED_SWEEP, () => grandfatherCreationFinished({ actors: [] }));
		game.system.version = "1.7.2";
		// Saved and closed part-way under the new code: a playbook, no stamp. Not finished.
		const midway = pc("m", { flags: { onboardingProgress: { state: "exited" } } });
		await oncePerVersion(CREATION_FINISHED_SWEEP, () => grandfatherCreationFinished({ actors: [midway] }));
		expect(midway.setFlag).not.toHaveBeenCalled();
	});
});
