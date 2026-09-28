import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeActorBuilder } from "../fakes/FakeActorBuilder.js";

// What rollStat leaves on its card for a reader after a rewrite (utils/counted-tier.js), and what it hands
// the Potential for Greatness reminder: the COUNTED tier, the whisper, the chat mode and the card.

const remind = vi.hoisted(() => vi.fn(async () => false));
vi.mock("../../module/actors/character/WouldBeHeroAsterisk.js", () => ({ maybeRemindPotentialForGreatness: remind }));

const { rollStat } = await import("../../module/utils/roll-engine.js");

let calls;
let total;
const posted = { id: "card-1" };

beforeEach(() => {
	calls = [];
	total = 8;
	remind.mockClear();
	global.game.settings = { get: vi.fn(() => "publicroll") };
	global.ChatMessage = { getSpeaker: vi.fn(() => ({ alias: "Wren" })), create: vi.fn() };
	global.Roll = class {
		constructor(formula) { this.formula = formula; this.total = total; this.dice = [{ results: [{ result: 4 }, { result: 4 }] }]; }
		async evaluate() { return this; }
		async toMessage(data, options) { calls.push({ data, options }); return posted; }
	};
});

const actor = () => new FakeActorBuilder().withXp(0, 8).withLevel(1).build();
const SCOPE = "stonetop-pwd";

describe("rollStat's record of what was rolled", () => {
	it("stamps the stat, the heading and the bends beside a producer's own flags", async () => {
		await rollStat("cha", actor(), {
			moveName: "Persuade", partialCountsAsSuccess: "Let's Make a Deal",
			messageFlags: { [SCOPE]: { move: "Persuade" }, other: { kept: true } },
		});
		const flags = calls[0].data.flags;
		expect(flags.other).toEqual({ kept: true });
		expect(flags[SCOPE].move).toBe("Persuade");
		expect(flags[SCOPE].rolled).toEqual({
			stat: "cha", move: "Persuade", missCountsAsPartial: false, partialCountsAsSuccess: true,
			missCountsAsPartialWhy: "", partialCountsAsSuccessWhy: "Let's Make a Deal",
		});
	});

	it("hands the reminder the COUNTED tier, the whisper, the chat mode and the card", async () => {
		await rollStat("cha", actor(), { partialCountsAsSuccess: "Let's Make a Deal", whisper: ["gm"] });
		expect(remind).toHaveBeenCalledWith(expect.anything(), "cha", 8,
			{ tier: "success", whisper: ["gm"], rollMode: "publicroll", message: posted });
	});

	it("hands it the total's own tier on an ordinary roll", async () => {
		total = 9;
		await rollStat("str", actor());
		expect(remind.mock.calls[0][3].tier).toBe("partial");
	});
});
