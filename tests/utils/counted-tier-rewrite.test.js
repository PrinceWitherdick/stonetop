// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FakeActorBuilder } from "../fakes/FakeActorBuilder.js";
import { countedResult, rolledRecord } from "../../module/utils/counted-tier.js";

// A roll card rolled with a bend ("treat a 7-9 as a 10+", Let's Make a Deal; "treat a 6- as a 7-9", Destined)
// and then rewritten (a Shift, a +1, Burn Brightly, Impetuous Youth) reads the tier it COUNTS as, and names
// the rule while it fires, as rollStat's own card did. stonetop.js#_shiftRollCardFlavor is not importable
// (the entry point registers every hook), so this drives its three steps as it runs them: read the bends
// off the result block, classify, put the pill in step.

const remind = vi.hoisted(() => vi.fn(async () => false));
vi.mock("../../module/actors/character/WouldBeHeroAsterisk.js", () => ({ maybeRemindPotentialForGreatness: remind }));

const { rollStat, syncCountedNotePill } = await import("../../module/utils/roll-engine.js");

let posted;
let total;

beforeEach(() => {
	posted = [];
	total = 8;
	global.game.settings = { get: vi.fn(() => "publicroll") };
	global.ChatMessage = { getSpeaker: vi.fn(() => ({ alias: "Maelis" })), create: vi.fn() };
	global.Roll = class {
		constructor(formula) { this.formula = formula; this.total = total; this.dice = [{ results: [{ result: 4 }, { result: 4 }] }]; }
		async evaluate() { return this; }
		async toMessage(data) { posted.push(data); return { id: "card" }; }
	};
});

const actor = () => new FakeActorBuilder().withXp(0, 8).withLevel(1).build();

/** The rewrite's tier steps, as _shiftRollCardFlavor takes them, on a posted card's flavor. */
function rewrite(flavor, to) {
	const wrapper = document.createElement("div");
	wrapper.innerHTML = flavor;
	const resultEl = wrapper.querySelector(".stonetop-roll-result");
	const result = countedResult(to, rolledRecord("", resultEl.dataset));
	syncCountedNotePill(wrapper, result.note);
	return { result, wrapper, pills: [...wrapper.querySelectorAll(".stonetop-condition-counted")].map(p => p.textContent) };
}

describe("a bent roll card, rewritten", () => {
	it("stamps each carried bend on the result block by the rule's name, fired or not", async () => {
		total = 5;
		await rollStat("cha", actor(), { moveName: "Persuade", partialCountsAsSuccess: "Let's Make a Deal" });
		const wrapper = document.createElement("div");
		wrapper.innerHTML = posted[0].flavor;
		const resultEl = wrapper.querySelector(".stonetop-roll-result");
		expect(resultEl.dataset.partialCountsAsSuccess).toBe("Let's Make a Deal");
		expect(resultEl.dataset.missCountsAsPartial).toBeUndefined();
	});

	it("keeps a lifted 7-9 on a Let's Make a Deal roll a Strong Hit, still naming the rule", async () => {
		total = 7;
		await rollStat("cha", actor(), { moveName: "Persuade", partialCountsAsSuccess: "Let's Make a Deal" });
		const { result, pills } = rewrite(posted[0].flavor, 8);
		expect(result).toMatchObject({ key: "success", label: "Strong Hit" });
		expect(pills).toEqual(["Rolled a 7-9, counted as a 10+ (Let's Make a Deal)"]);
	});

	it("adds the rule's pill, and the row, when a 6- is lifted into the bent tier", async () => {
		total = 6;
		await rollStat("cha", actor(), { moveName: "Persuade", partialCountsAsSuccess: "Let's Make a Deal" });
		expect(posted[0].flavor).not.toContain("stonetop-roll-conditions");
		const { result, wrapper, pills } = rewrite(posted[0].flavor, 7);
		expect(result.key).toBe("success");
		expect(pills).toEqual(["Rolled a 7-9, counted as a 10+ (Let's Make a Deal)"]);
		// Where rollStat draws the row: above the Shift buttons.
		const cell = wrapper.querySelector(".cell--chat");
		const kids = [...cell.children].map(el => el.className);
		expect(kids.indexOf(kids.find(c => c.includes("stonetop-roll-conditions"))))
			.toBeLessThan(kids.indexOf(kids.find(c => c.includes("stonetop-card-buttons"))));
	});

	it("takes the pill and its emptied row off once the total counts as itself", async () => {
		total = 8;
		await rollStat("cha", actor(), { moveName: "Persuade", partialCountsAsSuccess: "Let's Make a Deal" });
		const up = rewrite(posted[0].flavor, 10);
		expect(up.result).toMatchObject({ key: "success", note: "" });
		expect(up.pills).toEqual([]);
		expect(up.wrapper.querySelector(".stonetop-roll-conditions")).toBeNull();
		const down = rewrite(posted[0].flavor, 6);
		expect(down.result).toMatchObject({ key: "failure", label: "Miss" });
		expect(down.pills).toEqual([]);
	});

	it("keeps the caller's own pills when the bend's comes off", async () => {
		total = 8;
		await rollStat("cha", actor(), { moveName: "Persuade", partialCountsAsSuccess: "Let's Make a Deal", conditionNotes: ["Offered gold"] });
		const { wrapper, pills } = rewrite(posted[0].flavor, 11);
		expect(pills).toEqual([]);
		expect(wrapper.querySelector(".stonetop-roll-conditions").textContent).toContain("Offered gold");
	});

	it("reads a Destined 6- lifted within the miss as the 7-9 it counts as", async () => {
		total = 3;
		await rollStat("", actor(), { moveName: "Death's Door", missCountsAsPartial: "Destined", partialCountsAsSuccess: "Destined" });
		const { result, pills } = rewrite(posted[0].flavor, 5);
		expect(result).toMatchObject({ key: "partial", label: "Weak Hit" });
		expect(pills).toEqual(["Rolled a 6-, counted as a 7-9 (Destined)"]);
	});
});

describe("stonetop.js#_shiftRollCardFlavor", () => {
	const STONETOP_JS = fs.readFileSync(path.resolve(__dirname, "../../stonetop.js"), "utf8");
	const shiftAt = STONETOP_JS.indexOf("function _shiftRollCardFlavor");
	const shift = STONETOP_JS.slice(shiftAt, STONETOP_JS.indexOf("\n}\n", shiftAt));

	it("labels the card from the COUNTED tier and keeps the bend's pill in step", () => {
		expect(shift).toContain('countedResult(total, rolledRecord("", resultEl.dataset))');
		expect(shift).toContain("syncCountedNotePill(wrapper, result.note)");
		expect(shift).not.toContain("_classifyShiftedTotal(total)");
	});

	// And what the rewritten total owes: an arcanum or an artifact being identified follows the counted tier
	// too, so a Let's Make a Deal-style 6- lifted to a 7 hands over what a 10+ does.
	it("identifies by the COUNTED tier after a rewrite", () => {
		const body = name => STONETOP_JS.slice(STONETOP_JS.indexOf(`async function ${name}(`),
			STONETOP_JS.indexOf("\n}\n", STONETOP_JS.indexOf(`async function ${name}(`)));
		for (const name of ["_syncArcanumIdentification", "_syncArtifactIdentification"]) {
			expect(body(name)).toContain("cardCountedTier(message, Number(total) || 0, SYSTEM_ID)");
			expect(body(name)).not.toContain("_classifyShiftedTotal");
		}
	});
});
