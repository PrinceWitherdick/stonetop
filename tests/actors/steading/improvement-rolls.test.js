import { describe, expect, it } from "vitest";
import {
	STEADING_MOVE, improvementQuestions, netRollMode, rollAdjustments, rollConditionNotes,
} from "../../../module/actors/steading/improvement-rolls.js";

/**
 * What the steading's improvements do to a homefront move at the moment it is rolled (the
 * Stonetop Steading playbook, and Book I's Deploy). The season-change effects are
 * season-effects.test.js's; these are the ones that change a MOVE.
 */

const built = (...slugs) => slug => slugs.includes(slug);
const TACTICS = [
	{ index: 1, label: "Archery: barrages, ranged ambushes, sniping, etc." },
	{ index: 3, label: "Formations: shield walls, wedges, phalanx, etc." },
];
const names = questions => questions.map(q => q.name);

describe("the questions a move's window asks", () => {
	it("asks every Deploy about a position of strength, since the move itself turns on it", () => {
		expect(names(improvementQuestions(STEADING_MOVE.DEPLOY, "defenses"))).toEqual(["strength"]);
	});

	it("offers the militia's trained tactics, the wall to take advantage of, and the watch", () => {
		const asks = improvementQuestions(STEADING_MOVE.DEPLOY, "defenses", {
			has: built("wellTrainedMilitia", "palisade", "standingWatch"), tactics: TACTICS,
		});
		expect(names(asks)).toEqual(["strength", "tactic", "wall", "watch"]);
		expect(asks.find(q => q.name === "tactic").options.map(o => o.value)).toEqual(["", "1", "3"]);
		expect(asks.find(q => q.name === "wall").label).toMatch(/palisade/);
	});

	it("names the stone wall once it has replaced the palisade", () => {
		const wall = improvementQuestions(STEADING_MOVE.DEPLOY, "defenses", { has: built("palisade", "stoneWall") })
			.find(q => q.name === "wall");
		expect(wall.label).toMatch(/stone wall/);
	});

	it("asks nothing about a militia with no tactics trained, or improvements not built", () => {
		expect(names(improvementQuestions(STEADING_MOVE.DEPLOY, "defenses", { has: built("wellTrainedMilitia") }))).toEqual(["strength"]);
		expect(improvementQuestions(STEADING_MOVE.MUSTER, "population")).toEqual([]);
	});

	it("asks about the watch on any +Defenses roll, and the herd on Pull Together and Requisition", () => {
		expect(names(improvementQuestions(STEADING_MOVE.AUROCHS_HUNT, "defenses", { has: built("standingWatch") }))).toEqual(["watch"]);
		expect(names(improvementQuestions(STEADING_MOVE.PULL_TOGETHER, "population", { has: built("herdOfHorses") }))).toEqual(["herd"]);
		expect(names(improvementQuestions(STEADING_MOVE.REQUISITION, "fortunes", { has: built("herdOfHorses") }))).toEqual(["herdShare"]);
	});
});

describe("what the improvements do to the roll", () => {
	it("gives a Township advantage to Muster, Pull Together and Trade & Barter, and nothing else", () => {
		for (const move of [STEADING_MOVE.MUSTER, STEADING_MOVE.PULL_TOGETHER, STEADING_MOVE.TRADE_BARTER]) {
			expect(rollAdjustments({ moveName: move, statKey: "x", has: built("township") }).adv, move).toEqual(["Township"]);
		}
		expect(rollAdjustments({ moveName: STEADING_MOVE.DEPLOY, statKey: "defenses", has: built("township") }).adv).toEqual([]);
	});

	it("gives a Deploy advantage only when it takes advantage of the wall", () => {
		const deploy = answers => rollAdjustments({ moveName: STEADING_MOVE.DEPLOY, statKey: "defenses", has: built("stoneWall"), answers });
		expect(deploy({ wall: "yes" }).adv).toEqual(["Stone Wall"]);
		expect(deploy({}).adv).toEqual([]);
	});

	it("treats Defenses as 1 higher when the standing watch is involved", () => {
		const adj = rollAdjustments({ moveName: STEADING_MOVE.DEPLOY, statKey: "defenses", has: built("standingWatch"), answers: { watch: "yes" } });
		expect(adj.statBonus).toBe(1);
		expect(adj.notes).toContain("Standing watch: Defenses +1");
	});

	it("puts a Deploy in a position of strength by the table's say, or by a trained tactic", () => {
		const deploy = answers => rollAdjustments({
			moveName: STEADING_MOVE.DEPLOY, statKey: "defenses", has: built("wellTrainedMilitia"), tactics: TACTICS, answers,
		});
		expect(deploy({}).strength).toBe(false);
		expect(deploy({ strength: "yes" }).strength).toBe(true);
		const tactic = deploy({ tactic: "3" });
		expect(tactic.strength).toBe(true);
		expect(tactic.notes).toContain("Trained tactic: Formations");
	});

	it("counts a Requisition of half the herd or less as a 7-9 on a 6-", () => {
		const req = answers => rollAdjustments({ moveName: STEADING_MOVE.REQUISITION, statKey: "fortunes", has: built("herdOfHorses"), answers });
		expect(req({ herdShare: true }).missAsPartial).toMatch(/half the herd/i);
		expect(req({}).missAsPartial).toBe("");
	});

	it("collects Diminished, winter and a held advantage as sources", () => {
		const muster = rollAdjustments({ moveName: STEADING_MOVE.MUSTER, statKey: "population", has: built("township"), diminished: true });
		expect(muster).toMatchObject({ adv: ["Township"], dis: ["Diminished"] });
		expect(rollAdjustments({ moveName: STEADING_MOVE.TRADE_BARTER, statKey: "prosperity", winter: true }).dis).toEqual(["Winter"]);
		expect(rollAdjustments({ moveName: "Persuade", statKey: "fortunes", held: "A sacrifice" }).adv).toEqual(["A sacrifice"]);
		// Diminished touches only Deploy, Muster and Pull Together.
		expect(rollAdjustments({ moveName: "Persuade", statKey: "fortunes", diminished: true }).dis).toEqual([]);
	});
});

describe("advantage and disadvantage", () => {
	// Book I: "If you have advantage and disadvantage on the same roll, they cancel each other out."
	it("cancel each other out, the player's own choice included", () => {
		expect(netRollMode("normal", ["Township"], ["Diminished"])).toBe("normal");
		expect(netRollMode("adv", [], ["Winter"])).toBe("normal");
		expect(netRollMode("dis", ["Township"], [])).toBe("normal");
		expect(netRollMode("normal", ["Township"], [])).toBe("adv");
		expect(netRollMode("normal", [], ["Diminished"])).toBe("dis");
		expect(netRollMode("normal")).toBe("normal");
	});

	it("say on the card where each came from, leaving Diminished to its debility pill", () => {
		expect(rollConditionNotes({ adv: ["Township"], dis: ["Diminished", "Winter"], notes: ["Standing watch: Defenses +1"] }))
			.toEqual(["Township: advantage", "Winter: disadvantage", "Standing watch: Defenses +1"]);
	});
});
