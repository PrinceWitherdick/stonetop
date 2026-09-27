// The Marshal's personal symbol: "when you display or reveal it in a dramatic fashion, your crew
// holds +1 Loyalty (max 3)". A button on the possession's row, never automatic.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	personalSymbolAction, displayPersonalSymbol, PERSONAL_SYMBOL, PERSONAL_SYMBOL_SLUG,
} from "../../../module/actors/character/personal-symbol.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = rel => fs.readFileSync(path.resolve(HERE, "../../..", rel), "utf8");

/** A Marshal with the possession chosen or not, a crew or not, and the crew's Loyalty. */
function marshal({ chosen = true, crew = { name: "The Iron Wolves" }, loyalty = 0 } = {}) {
	const flags = {
		possessions: { selected: chosen ? [PERSONAL_SYMBOL_SLUG] : ["scribes-tools"] },
		...(crew ? { crew: { ...crew, loyalty } } : {}),
	};
	const actor = {
		name: "Ser Brannoc",
		flags: { "stonetop-pwd": flags },
		getFlag: (_scope, key) => key.split(".").reduce((node, part) => node?.[part], flags),
		update: vi.fn(async changes => {
			if ("flags.stonetop-pwd.crew.loyalty" in changes) flags.crew.loyalty = changes["flags.stonetop-pwd.crew.loyalty"];
		}),
	};
	return actor;
}

let posted;
beforeEach(() => {
	posted = [];
	globalThis.ChatMessage = { create: vi.fn(async data => posted.push(data)), getSpeaker: () => ({}) };
	globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
});
afterEach(() => {
	delete globalThis.ChatMessage;
	delete globalThis.ui;
});

describe("the personal symbol's button", () => {
	it("shows only while the possession is chosen and there is a crew", () => {
		expect(personalSymbolAction(marshal())).toMatchObject({ slug: PERSONAL_SYMBOL_SLUG, loyalty: 0, max: 3, atMax: false });
		expect(personalSymbolAction(marshal({ chosen: false }))).toBeNull();
		expect(personalSymbolAction(marshal({ crew: null }))).toBeNull();
		// A crew record with nothing defining it is no crew (utils/crew.js#crewExists).
		expect(personalSymbolAction(marshal({ crew: {} }))).toBeNull();
	});

	it("is disabled at 3 Loyalty, saying why", () => {
		const action = personalSymbolAction(marshal({ loyalty: 3 }));
		expect(action.atMax).toBe(true);
		expect(action.tooltip).toBe("The Iron Wolves already holds 3 Loyalty, the most your personal symbol gives.");
		expect(personalSymbolAction(marshal({ loyalty: 2 })).tooltip).toMatch(/^When you display or reveal your personal symbol/);
	});

	it("sits on the possession row, in the template, off the sheet's context", () => {
		const hbs = read("templates/actor/partials/tab-equipment.hbs");
		expect(hbs).toContain('{{#if (and checked (eq slug @root.stonetop.personalSymbol.slug))}}');
		expect(hbs).toMatch(/class="stonetop-personal-symbol-btn stonetop-inline-btn"\s+\{\{#if @root\.stonetop\.personalSymbol\.atMax\}\}disabled\{\{\/if\}\}/);
		const sheet = read("module/actors/character/StonetopCharacterSheet.js");
		expect(sheet).toContain("context.stonetop.personalSymbol  = personalSymbolAction(this.actor);");
		expect(sheet).toContain('html.find(".stonetop-personal-symbol-btn").on("click"');
	});
});

describe("displaying the personal symbol", () => {
	it("gives the crew +1 Loyalty, names the possession to the ledger, and says so in chat", async () => {
		const actor = marshal({ loyalty: 1 });
		expect(await displayPersonalSymbol(actor)).toEqual({ applied: true, loyalty: 2 });
		expect(actor.update).toHaveBeenCalledWith({ "flags.stonetop-pwd.crew.loyalty": 2 }, { stonetopMove: PERSONAL_SYMBOL });
		expect(posted).toHaveLength(1);
		expect(posted[0].content).toContain("Ser Brannoc displays their personal symbol: The Iron Wolves holds +1 Loyalty (now 2 of 3).");
	});

	it("stops at 3, writing nothing", async () => {
		const actor = marshal({ loyalty: 3 });
		expect(await displayPersonalSymbol(actor)).toEqual({ applied: false, loyalty: 3 });
		expect(actor.update).not.toHaveBeenCalled();
		expect(posted).toHaveLength(0);
		expect(globalThis.ui.notifications.info).toHaveBeenCalled();
	});

	it("reads the live value, so two presses from 2 reach 3 and no further", async () => {
		const actor = marshal({ loyalty: 2 });
		await displayPersonalSymbol(actor);
		await displayPersonalSymbol(actor);
		expect(actor.update).toHaveBeenCalledTimes(1);
		expect(actor.getFlag("stonetop-pwd", "crew.loyalty")).toBe(3);
	});

	it("does nothing without a crew, and calls an unnamed crew theirs", async () => {
		expect((await displayPersonalSymbol(marshal({ crew: null }))).applied).toBe(false);
		await displayPersonalSymbol(marshal({ crew: { tags: ["loyal"] } }));
		expect(posted[0].content).toContain("their crew holds +1 Loyalty (now 1 of 3)");
	});
});
