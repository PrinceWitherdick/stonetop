import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Character Introductions must never create or touch a Combat.
//
// It used to: opening the window created a Combat when there was none and added every player
// character to WHATEVER `game.combat` was, and Randomize wrote their initiative. With fights on a
// tab of their own that would drop the whole party into a fight running on the scene, so the
// order moved to a setting of its own (utils/introductions-order.js). This scans the code, not
// the comments, which still explain the history.

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");

/** The source with comments removed, so the history they explain does not trip the scan. */
const code = p => read(p)
	.replace(/\/\*[\s\S]*?\*\//g, "")
	.replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

describe("Character Introductions and the Combat tracker", () => {
	const dialog = code("module/dialogs/IntroductionsDialog.js");

	it("never creates, reads or writes a Combat", () => {
		expect(dialog).not.toMatch(/game\.combats?\b/);
		expect(dialog).not.toMatch(/getDocumentClass\(\s*["']Combat/);
		expect(dialog).not.toMatch(/["']Combatant["']/);
		expect(dialog).not.toMatch(/\binitiative\b/);
		expect(dialog).not.toMatch(/(create|update|delete)Combat(ant)?["']/);
	});

	it("works the same whether or not the Fight tab is on", () => {
		expect(dialog).not.toContain("fightTab");
		expect(code("module/utils/introductions-order.js")).not.toContain("fightTab");
	});

	it("reads the order from its own setting everywhere it needs one", () => {
		expect(dialog).toContain("introductionsRoster()");
		expect(dialog).toContain("adoptLegacyIntroOrder()");
		expect(code("module/utils/chronicle.js")).toContain("introductionsRoster()");
	});

	it("leaves no caller of the old tracker-order helper", () => {
		const scan = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
			const rel = path.join(dir, entry.name);
			if (entry.isDirectory()) return scan(rel);
			return entry.name.endsWith(".js") ? [rel] : [];
		});
		const offenders = [...scan("module"), "stonetop.js"].filter(file => read(file).includes("orderByCombatTurns"));
		expect(offenders).toEqual([]);
	});
});
