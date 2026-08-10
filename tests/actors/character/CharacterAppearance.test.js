import { describe, it, expect, vi } from "vitest";
import { CharacterAppearance } from "../../../module/actors/character/CharacterAppearance.js";
import { StonetopFlags } from "../../../module/actors/character/StonetopFlags.js";
import { SYSTEM_ID } from "../../../module/system-id.js";

// An appearance line holds ONE string, and it is not always one of the playbook's four
// suggestions — the onboarding wizard and the Details tab both let a line be written in.
// So this writer takes any text, and clearing a line has to DROP the key: setFlag
// deep-merges, so writing "" would leave an empty line sitting on the actor forever.

function makeActor(selected = {}) {
	const flags = { [SYSTEM_ID]: { appearance: { selected } } };
	return {
		flags,
		getFlag: (scope, path) => foundry.utils.getProperty(flags[scope] ?? {}, path),
		// tests/setup.js fakes foundry.utils without setProperty, so walk the path here.
		setFlag: vi.fn(async (scope, path, value) => {
			const parts = path.split(".");
			const leaf  = parts.pop();
			let node = (flags[scope] ??= {});
			for (const part of parts) node = (node[part] ??= {});
			node[leaf] = value;
		}),
		update: vi.fn(async () => {}),
	};
}

const makeAppearance = (actor) => new CharacterAppearance(new StonetopFlags(actor, "appearance"));

describe("CharacterAppearance", () => {
	// The line's own sub-key, NOT a rewrite of the whole map: all four lines are on screen at
	// once, so a `{ ...saved }` spread lets a second line's write undo the first.
	it("writes only the line it was given", async () => {
		const actor = makeActor({ 1: "well-spoken" });
		await makeAppearance(actor).select(0, "built like a barn door");
		expect(actor.update).toHaveBeenCalledWith(
			{ [`flags.${SYSTEM_ID}.appearance.selected.0`]: "built like a barn door" }, undefined);
	});

	it("does not clobber a sibling line written from a stale read", async () => {
		const actor = makeActor();
		const appearance = makeAppearance(actor);
		// Both composed before either lands — the shape a fast blur-then-click produces.
		await Promise.all([appearance.select(0, "wiry"), appearance.select(1, "well-spoken")]);
		const paths = actor.update.mock.calls.map(([changes]) => Object.keys(changes)[0]);
		expect(paths).toEqual([
			`flags.${SYSTEM_ID}.appearance.selected.0`,
			`flags.${SYSTEM_ID}.appearance.selected.1`,
		]);
	});

	it("trims the written-in text", async () => {
		const actor = makeActor();
		await makeAppearance(actor).select(2, "   lean and wiry   ");
		expect(actor.update).toHaveBeenCalledWith(
			{ [`flags.${SYSTEM_ID}.appearance.selected.2`]: "lean and wiry" }, undefined);
	});

	it("drops the key when a line is cleared, rather than storing an empty string", async () => {
		const actor = makeActor({ 0: "built like a barn door", 1: "well-spoken" });
		await makeAppearance(actor).select(0, "");
		expect(actor.setFlag).not.toHaveBeenCalled();
		// Whichever deletion form this core applies, it targets THIS line and no other.
		const [changes] = actor.update.mock.calls[0];
		const [path]    = Object.keys(changes);
		expect(path).toMatch(/^flags\..+\.appearance\.selected\..*0$/);
		expect(path).not.toContain("1");
	});

	it("treats whitespace-only as a clear", async () => {
		const actor = makeActor({ 3: "a light step" });
		await makeAppearance(actor).select(3, "   ");
		expect(actor.setFlag).not.toHaveBeenCalled();
		expect(actor.update).toHaveBeenCalled();
	});

	it("reads back what was saved", () => {
		const actor = makeActor({ 0: "TEST", 1: "well-spoken" });
		expect(makeAppearance(actor).saved).toEqual({ 0: "TEST", 1: "well-spoken" });
	});

	it("reads an unset appearance as an empty map", () => {
		const actor = { flags: {}, getFlag: () => undefined, setFlag: vi.fn(), update: vi.fn() };
		expect(makeAppearance(actor).saved).toEqual({});
	});
});
