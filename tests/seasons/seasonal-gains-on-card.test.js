import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeActorBuilder } from "../fakes/FakeActorBuilder.js";
import { readRepo as read } from "../fakes/css.js";
import {
	pickListsHtml, pickReferenceHtml, normalizePickPools, rollSeasonsCard, rollStat, seasonsRollPicks,
	seasonsRollTable, SEASONAL_GAIN_LIST,
} from "../../module/utils/roll-engine.js";
import { SEASONAL_GAINS } from "../../module/dialogs/spring-burst-data.js";
import { escHtml } from "../../module/utils/strings.js";
import { moveTiersHtml } from "../../module/utils/move-tiers.js";

// ── The seasonal gains, on the Seasons Change result card ───────────────────────
// A 10+ or 7-9 on the Seasons Change says "pick 1 seasonal gain" (2 on a summer 10+), and the
// card used to stop there: the six gains lived only in the GM's window, so the players reading
// the result could not see what they were choosing from. Both cards that carry that result now
// list them:
//   - spring's, which a player rolls from the hand-off card (rollSeasonsCard);
//   - summer's and autumn's, which the GM rolls from the window (rollStat, via the steading).
//
// A list to READ, not tick. The players say what they choose and the GM enters it in the Seasons
// Change window, whose Done applies and records the gains; boxes on the card would be a second
// place to make the same choice, and one Done never reads. So: spiral bullets, no checkboxes.

let rollMessages;
let rollTotal;

beforeEach(() => {
	rollMessages = [];
	rollTotal = 8;
	global.game.settings = { get: vi.fn(() => "publicroll") };
	global.ChatMessage = {
		getSpeaker: vi.fn(({ actor } = {}) => ({ alias: actor?.name ?? "Speaker" })),
		create: vi.fn(),
	};
	global.Roll = class {
		constructor(formula) {
			this.formula = formula;
			this.total = rollTotal;
			this.dice = [{ results: [{ result: 3, active: true }, { result: 4, active: true }] }];
		}
		async evaluate() { return this; }
		async toMessage(message) { rollMessages.push(message); }
	};
});

// The per-tier gains boxes on a card, each with whether it is showing.
function tierBoxes(flavor) {
	return [...flavor.matchAll(/<div class="stonetop-roll-tier-picklist" data-tier="(\w+)"( hidden="hidden")?><div class="stonetop-homestead-reference stonetop-roll-reference">/g)]
		.map(([, tier, hidden]) => ({ tier, shown: !hidden }));
}

function expectReadOnlyGains(flavor) {
	for (const g of SEASONAL_GAINS) expect(flavor).toContain(`<li><strong>${escHtml(g.name)}:</strong> ${escHtml(g.text)}</li>`);
	expect(flavor).toContain("<strong>Seasonal gains</strong>");
	expect(flavor).toContain("(tell the GM what you choose)");
	// Nothing to tick, and so nothing for the pick wiring (tally, cap, saved ticks) to bind.
	expect(flavor).not.toContain("stonetop-picklist-check");
	expect(flavor).not.toContain(`class="stonetop-picklist"`);
	expect(flavor).not.toContain("data-pick-max");
}

async function springCard(table) {
	await rollSeasonsCard({
		formula: "2d6 + 1",
		title: "Seasons Change: Spring",
		resultTable: seasonsRollTable(table),
		...seasonsRollPicks(table),
	});
	return rollMessages[0].flavor;
}

describe("the spring hand-off card", () => {
	it("lists all six gains to read, names in bold, with no checkboxes", async () => {
		rollTotal = 8;
		expectReadOnlyGains(await springCard("spring"));
	});

	it("sits in the legend area, under the result and the ladder above it", async () => {
		rollTotal = 8;
		const flavor = await springCard("spring");
		const legend = flavor.indexOf(`<div class="stonetop-roll-card-results">`);
		expect(legend).toBeGreaterThan(flavor.indexOf("stonetop-move-tiers"));
		expect(legend).toBeGreaterThan(flavor.indexOf("stonetop-roll-result "));
		expect(flavor.indexOf("<strong>Seasonal gains</strong>")).toBeGreaterThan(legend);
	});

	it("shows only the rolled tier's list", async () => {
		rollTotal = 8;
		expect(tierBoxes(await springCard("spring"))).toEqual([
			{ tier: "success", shown: false },
			{ tier: "partial", shown: true },
		]);
	});

	it("shows no gains on a 6-", async () => {
		rollTotal = 5;
		const boxes = tierBoxes(await springCard("spring"));
		expect(boxes.length).toBeGreaterThan(0);
		expect(boxes.every(b => !b.shown)).toBe(true);
	});

	// Cards posted before the Inn's roll existed carry no table id, and they are all spring's.
	it("lists them on an old card that names no table", () => {
		expect(seasonsRollPicks(undefined)).toBe(SEASONAL_GAIN_LIST);
	});

	it("lists nothing on the Inn's card, whose questions are not a list", async () => {
		expect(seasonsRollPicks("inn")).toEqual({});
		const flavor = await springCard("inn");
		expect(flavor).not.toContain("stonetop-roll-reference");
		expect(flavor).not.toContain("stonetop-picklist");
	});
});

describe("the GM's summer and autumn roll card", () => {
	const actor = () => new FakeActorBuilder().withXp(2, 8).withLevel(1).build();
	// Summer's ladder, as _seasonFortunesResultRows words it: the 10+ picks TWO.
	const SUMMER = {
		success: { value: "pick 2 seasonal gains." },
		partial: { value: "pick 1 seasonal gain." },
		failure: { value: "a threat makes itself known or gets worse; don't mark XP." },
	};

	async function summerCard(total) {
		rollTotal = total;
		await rollStat("fortunes", actor(), {
			moveName: "Seasons Change", statValue: 1, noXpOnMiss: true,
			moveResults: SUMMER, resultLegend: "<div>legend</div>", ...SEASONAL_GAIN_LIST,
		});
		return rollMessages[0].flavor;
	}

	it("lists the gains to read under a summer 10+, after the legend", async () => {
		const flavor = await summerCard(11);
		expectReadOnlyGains(flavor);
		expect(tierBoxes(flavor)).toEqual([
			{ tier: "success", shown: true },
			{ tier: "partial", shown: false },
		]);
		expect(flavor).toContain(`<div class="stonetop-roll-card-results"><div>legend</div><div class="stonetop-roll-tier-picklists"`);
		// The result line still says how many, once.
		expect(flavor).toContain("pick 2 seasonal gains.");
		// And no empty checklist block is left behind.
		expect(flavor).not.toContain("stonetop-roll-card-picklist");
	});

	const SHEET = read("module/actors/steading/StonetopSteadingSheet.js");

	it("is handed the gains by every season but winter", () => {
		const at = SHEET.indexOf("function _seasonRollOptions(");
		expect(at).toBeGreaterThan(-1);
		expect(SHEET.slice(at, at + 900)).toContain(`seasonId === "winter" ? {} : SEASONAL_GAIN_LIST`);
	});

	// As a move card: the ladder rides as the description (rollStat marks its landed rung), with no
	// boxed Results legend under the result.
	it("carries its ladder as the card's description, not a legend", () => {
		const at = SHEET.indexOf("function _seasonRollOptions(");
		const body = SHEET.slice(at, SHEET.indexOf("\n}\n", at));
		expect(body).toContain("moveDescription: moveTiersHtml(moveResults)");
		expect(body).not.toContain("resultLegend");
	});

	it("draws the ladder above the result, with the rolled rung marked", async () => {
		rollTotal = 11;
		await rollStat("fortunes", actor(), {
			moveName: "Seasons Change", statValue: 1, noXpOnMiss: true,
			moveResults: SUMMER, moveDescription: moveTiersHtml(SUMMER), ...SEASONAL_GAIN_LIST,
		});
		const flavor = rollMessages[0].flavor;
		expect(flavor).toContain(`data-rolled-tier="success"`);
		expect(flavor.indexOf("stonetop-move-tiers")).toBeLessThan(flavor.indexOf("stonetop-roll-result "));
		expect(flavor).not.toContain("<strong>Results</strong>");
	});
});

describe("the chat button that rolls a handed-over roll", () => {
	it("passes the table's gains to the result card", () => {
		const src = read("stonetop.js");
		const at = src.indexOf("function _chatWireSeasonsRoll(");
		expect(at).toBeGreaterThan(-1);
		const body = src.slice(at, at + 2600);
		expect(body).toContain("seasonsRollPicks(btn.dataset.table)");
		expect(body).toContain("...picks");
	});
});

describe("pick options that are already markup", () => {
	it("are emitted as is, where plain strings are escaped, in both kinds of list", () => {
		const pools = normalizePickPools(["<b>plain</b>", { html: "<strong>bold</strong>" }]);
		for (const html of [pickListsHtml(pools, "success"), pickReferenceHtml(pools, "success")]) {
			expect(html).toContain("&lt;b&gt;plain&lt;/b&gt;");
			expect(html).toContain("<strong>bold</strong>");
		}
	});
});
