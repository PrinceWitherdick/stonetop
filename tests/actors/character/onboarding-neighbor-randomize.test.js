import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The roll-a-trait die beside each background neighbor's trait field (the Ranger's Wide
// Wanderer names five neighbors, so typing all five by hand is a slog). Three pieces have
// to stay in step, and two of them fail SILENTLY:
//  1. the button in the template, whose class the click handler binds by name;
//  2. the grid, which needs a THIRD column — with two, the die lands on top of the field
//     it belongs to (the input is width:100% of a column it now shares);
//  3. the width pin, because core's `.app button { width: 100% }` stretches any button in
//     a Foundry window across its whole column.

const ROOT = process.cwd();
const HBS = fs.readFileSync(path.join(ROOT, "templates", "dialogs", "character-onboarding.hbs"), "utf8");
const DIALOG = fs.readFileSync(
	path.join(ROOT, "module", "actors", "character", "dialogs", "CharacterOnboardingDialog.js"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "styles", "stonetop.css"), "utf8")
	.replace(/\/\*[\s\S]*?\*\//g, "");

/** The declaration block for an exact selector, so one rule can be asserted on in isolation. */
function block(selector) {
	const rx = new RegExp(`(^|[,}])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m");
	return CSS.match(rx)?.[2] ?? null;
}

describe("the background neighbor's roll-a-trait button", () => {
	it("sits in the neighbor row, right after the trait field", () => {
		const row = HBS.match(/<label class="stonetop-onboarding-background-neighbor">[\s\S]*?<\/label>/)?.[0];
		expect(row, "the neighbor row is gone from the onboarding template").toBeTruthy();
		expect(row.indexOf("onboard-background-neighbor-trait")).toBeGreaterThan(-1);
		expect(row.indexOf("onboard-background-neighbor-random"))
			.toBeGreaterThan(row.indexOf("onboard-background-neighbor-trait"));
		// type="button" — the row lives inside a <form>, and a bare button submits it.
		expect(row).toMatch(/<button type="button"\s+class="onboard-background-neighbor-random"/);
	});

	it("is bound by the class the template actually renders", () => {
		expect(DIALOG).toContain('html.find(".onboard-background-neighbor-random").on("click"');
	});

	it("has a column of its own, so it never covers the trait field", () => {
		const row = block(".stonetop-onboarding-background-neighbor");
		expect(row, "no declaration block for .stonetop-onboarding-background-neighbor").toBeTruthy();
		const columns = row.match(/grid-template-columns:\s*([^;]+);/)?.[1];
		expect(columns).toBeTruthy();
		// name | field | die
		expect(columns.split(/\s+(?![^(]*\))/).length).toBe(3);
	});

	it("keeps its box against core's `.app button { width: 100% }`", () => {
		const button = block(".stonetop-onboarding-background-neighbor .onboard-background-neighbor-random");
		expect(button, "the die's own rule is gone — core would stretch it across the column").toBeTruthy();
		expect(button).toMatch(/width:\s*28px/);
		expect(button).toMatch(/height:\s*28px/);
	});
});
