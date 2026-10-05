import { describe, expect, it, vi } from "vitest";
import { settleSteadingRoll } from "../../../module/actors/steading/steading-roll.js";
import { STEADING_MOVE } from "../../../module/actors/steading/improvement-rolls.js";
import { builtInImprovementRules } from "../../../module/actors/steading/StonetopSteading.js";

// Every door to a steading roll settles its terms here: the sheet's rolls, the Seasons Change
// hand-off, the walkthrough's Requisition, a character's Requisition window. The rules each
// improvement adds are improvement-rolls.test.js's; this is the netting and the held promise.

function steading({ built = [], diminished = false, held = null, clearFails = false, size, herd } = {}) {
	const s = {
		held,
		...(size ? { steadingSize: () => size } : {}),
		...(herd ? { getHerd: () => herd } : {}),
		improvementCompleted: slug => built.includes(slug),
		// The rules list the roll reads (improvement-rules.js): these book improvements, built.
		improvementRules: () => builtInImprovementRules(built),
		getSystemValue: path => (path.includes("diminished") ? diminished : false),
		fortunesAdvantage: () => s.held,
		clearFortunesAdvantage: vi.fn(async () => {
			if (clearFails) throw new Error("refused");
			s.held = null;
		}),
	};
	return s;
}

const RITES = { source: "A sacrifice at the sacred rites" };

describe("settling a steading roll", () => {
	it("nets every rule's advantage and disadvantage against the chosen mode", async () => {
		const township = steading({ built: ["township"] });
		expect((await settleSteadingRoll(township, { moveName: STEADING_MOVE.MUSTER, statKey: "population" })).rollMode).toBe("adv");
		const both = await settleSteadingRoll(steading({ built: ["township"], diminished: true }), {
			moveName: STEADING_MOVE.MUSTER, statKey: "population",
		});
		expect(both.rollMode).toBe("normal");
		expect((await settleSteadingRoll(township, { moveName: STEADING_MOVE.MUSTER, statKey: "population", chosenMode: "dis" })).rollMode).toBe("normal");
	});

	it("applies a held advantage to a +Fortunes roll, names it, and spends it when told", async () => {
		const s = steading({ held: RITES });
		const terms = await settleSteadingRoll(s, { moveName: STEADING_MOVE.REQUISITION, statKey: "fortunes" });
		expect(terms.rollMode).toBe("adv");
		expect(terms.held).toEqual(RITES);
		expect(terms.conditionNotes).toEqual(["A sacrifice at the sacred rites: advantage"]);
		// Still held until the roll is made: anything failing before the dice keeps the promise.
		expect(s.held).toEqual(RITES);
		await terms.spend();
		expect(s.held).toBeNull();
	});

	// Advantage and disadvantage cancel (Book I): the hold outranks the sticky selector as a SOURCE
	// of advantage, but never beats a disadvantage. It is still spent, because this was its roll.
	it("nets the held advantage against a chosen disadvantage, and still spends it", async () => {
		const s = steading({ held: RITES });
		const terms = await settleSteadingRoll(s, { moveName: "Seasons Change", statKey: "fortunes", chosenMode: "dis" });
		expect(terms.rollMode).toBe("normal");
		await terms.spend();
		expect(s.held).toBeNull();
	});

	it("leaves the hold alone on a roll that is not +Fortunes", async () => {
		const s = steading({ held: RITES });
		const terms = await settleSteadingRoll(s, { moveName: STEADING_MOVE.MUSTER, statKey: "population" });
		expect(terms.held).toBeNull();
		await terms.spend();
		expect(s.clearFortunesAdvantage).not.toHaveBeenCalled();
	});

	// A player who cannot write the steading could not clear it, and would leave the promise to
	// be spent again by the next roll. It waits for someone who can.
	it("neither applies nor spends the hold for someone who cannot write the steading", async () => {
		const s = steading({ held: RITES });
		const terms = await settleSteadingRoll(s, { moveName: STEADING_MOVE.REQUISITION, statKey: "fortunes", canSpend: false });
		expect(terms.rollMode).toBe("normal");
		await terms.spend();
		expect(s.clearFortunesAdvantage).not.toHaveBeenCalled();
		expect(s.held).toEqual(RITES);
	});

	it("still rolls when the spend cannot be written", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const terms = await settleSteadingRoll(steading({ held: RITES, clearFails: true }), {
			moveName: STEADING_MOVE.REQUISITION, statKey: "fortunes",
		});
		expect(terms.rollMode).toBe("adv");
		await expect(terms.spend()).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("passes the herd's Requisition rule through", async () => {
		const terms = await settleSteadingRoll(steading({ built: ["herdOfHorses"] }), {
			moveName: STEADING_MOVE.REQUISITION, statKey: "fortunes", answers: { herdShare: true },
		});
		expect(terms.missAsPartial).toMatch(/half the herd/i);
	});

	// Book I p. 509: "Hamlet ... Muster, Pull Together, and Trade & Barter with disadvantage";
	// a town or a city does them "with advantage". The Size is read off the steading itself.
	it("reads the steading's Size: a hamlet at disadvantage, a town at advantage", async () => {
		const hamlet = await settleSteadingRoll(steading({ size: "hamlet" }), { moveName: STEADING_MOVE.PULL_TOGETHER, statKey: "population" });
		expect(hamlet.rollMode).toBe("dis");
		expect(hamlet.conditionNotes).toContain("A hamlet: disadvantage");
		const town = await settleSteadingRoll(steading({ size: "town" }), { moveName: STEADING_MOVE.TRADE_BARTER, statKey: "prosperity" });
		expect(town.rollMode).toBe("adv");
		const village = await settleSteadingRoll(steading({ size: "village" }), { moveName: STEADING_MOVE.MUSTER, statKey: "population" });
		expect(village.rollMode).toBe("normal");
		// Not a move the Size names.
		const deploy = await settleSteadingRoll(steading({ size: "hamlet" }), { moveName: STEADING_MOVE.DEPLOY, statKey: "defenses" });
		expect(deploy.rollMode).toBe("normal");
	});

	// The herd's rule reads the NUMBER taken against the herd's size.
	it("judges half the herd from the count asked for", async () => {
		const herd = { grown: 10, yearlings: 0, foals: 2, total: 12 };
		const half = await settleSteadingRoll(steading({ built: ["herdOfHorses"], herd }), {
			moveName: STEADING_MOVE.REQUISITION, statKey: "fortunes", answers: { herdCount: "6" },
		});
		expect(half.missAsPartial).toMatch(/half the herd/i);
		const more = await settleSteadingRoll(steading({ built: ["herdOfHorses"], herd }), {
			moveName: STEADING_MOVE.REQUISITION, statKey: "fortunes", answers: { herdCount: "7" },
		});
		expect(more.missAsPartial).toBe("");
		const none = await settleSteadingRoll(steading({ built: ["herdOfHorses"], herd }), {
			moveName: STEADING_MOVE.REQUISITION, statKey: "fortunes", answers: { herdCount: "0" },
		});
		expect(none.missAsPartial).toBe("");
	});
});
