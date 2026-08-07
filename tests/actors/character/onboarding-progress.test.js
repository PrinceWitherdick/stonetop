import { describe, expect, it } from "vitest";
import { progressLabel, progressFor, isMidCreation } from "../../../module/actors/character/onboarding-progress.js";

// A character as these helpers read one: the progress flag, plus the committed playbook.
const actorWith = (flag, playbook = null) => ({
	getFlag: (_scope, key) => (key === "onboardingProgress" ? flag : undefined),
	system:  { playbook },
});

describe("progressLabel", () => {
	it("reads Finished once a playbook is committed, whatever the flag says", () => {
		// A mid-creation "Save & close" or an edit pass can leave a stale flag behind; the
		// committed playbook is the authority, so the roster must not contradict it.
		const stale = progressLabel({ state: "exited", playbook: "The Judge" }, { slug: "the-blessed", name: "The Blessed" });
		expect(stale.status).toBe("finished");
		expect(stale.text).toBe("Finished");
		expect(stale.playbook).toBe("The Blessed");
	});

	it("reads not-started with no flag and no playbook", () => {
		expect(progressLabel(undefined, null)).toMatchObject({ status: "not-started", playbook: "" });
	});

	it("names the in-progress playbook the flow stamped, which the GM can't read otherwise", () => {
		const p = progressLabel({ state: "onboarding", step: 4, total: 9, playbook: "The Marshal" }, null);
		expect(p.status).toBe("onboarding");
		expect(p.text).toBe("on page 4 of 9");
		expect(p.playbook).toBe("The Marshal");
	});

	it("distinguishes the picker and an explicit exit", () => {
		expect(progressLabel({ state: "picker" }, null).status).toBe("picker");
		expect(progressLabel({ state: "exited" }, null).status).toBe("exited");
	});

	it("still shows a legacy/partial flag as mid-creation rather than dropping the player", () => {
		expect(progressLabel({ step: 2 }, null)).toMatchObject({ status: "onboarding", text: "in character creation" });
		// A legacy flag with a usable count keeps its page reading.
		expect(progressLabel({ step: 2, total: 7 }, null).text).toBe("on page 2 of 7");
	});
});

describe("isMidCreation", () => {
	it("is true for every live creation state — work exists that a delete would destroy", () => {
		for (const flag of [{ state: "picker" }, { state: "onboarding", step: 3, total: 9 }, { state: "exited" }]) {
			expect(isMidCreation(actorWith(flag))).toBe(true);
		}
	});

	it("is false for an untouched character and for a finished one", () => {
		expect(isMidCreation(actorWith(undefined))).toBe(false);
		expect(isMidCreation(actorWith({ state: "onboarding", step: 9, total: 9 }, { slug: "the-heavy", name: "The Heavy" }))).toBe(false);
	});

	it("survives an actor that can't answer (a bare object, a missing document)", () => {
		expect(isMidCreation(undefined)).toBe(false);
		expect(isMidCreation({})).toBe(false);
	});
});

describe("progressFor", () => {
	it("reads the flag straight off the actor", () => {
		expect(progressFor(actorWith({ state: "onboarding", step: 1, total: 5 })).text).toBe("on page 1 of 5");
	});
});
