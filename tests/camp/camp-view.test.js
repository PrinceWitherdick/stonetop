import { describe, expect, it } from "vitest";
import { CAMP_STATE, SETTLE_REFUSAL, campLedger, freezeCampPlan } from "../../module/camp/camp-rules.js";
import {
	campCardClosedText, campJoinCardBody, campSummaryRows, campWindowView, closedCampNotice, settleRefusalText,
} from "../../module/camp/camp-view.js";
import { seat } from "../fakes/camp.js";

/**
 * What a camp says: to the table on its cards, and to each reader in its window. The arithmetic
 * underneath is camp-rules.test.js's; these check the sentences it turns into and who gets
 * controls rather than sentences.
 */

const aeliana = (over = {}) => seat({ id: "aeliana", name: "Aeliana", isHost: true, joinedAt: 1, ...over });
const bram    = (over = {}) => seat({ id: "bram", name: "Bram", joinedAt: 2, carried: {}, ...over });
const cora    = (over = {}) => seat({ id: "cora", name: "Cora", joinedAt: 3, carried: {}, ...over });

const view = (members, over = {}) => campWindowView({
	state: CAMP_STATE.OPEN, hostName: "Aeliana", ledger: campLedger(members), manages: true,
	editable: ["aeliana"], mine: ["aeliana"], ...over,
});

// ── the cards ────────────────────────────────────────────────────────────────

describe("the join card", () => {
	it("names the host, safely", () => {
		expect(campJoinCardBody("<b>Aeliana</b>")).toContain("<strong>&lt;b&gt;Aeliana&lt;/b&gt;</strong> is making camp.");
	});

	// Foundry's sanitizer strips a bare `data-camp-join`, and the wiring would never find the slot.
	it("marks its button's slot with a valued attribute the sanitizer keeps", () => {
		const body = campJoinCardBody("Aeliana");
		expect(body).toMatch(/data-camp-join="1"/);
		expect(body).toContain('class="stonetop-camp-join"');
	});

	it("says how the camp ended once it is over", () => {
		expect(campCardClosedText(CAMP_STATE.SETTLED, "Aeliana")).toBe("Aeliana's camp ate and settled in for the night.");
		expect(campCardClosedText(CAMP_STATE.CANCELLED, "Aeliana")).toBe("Aeliana's camp broke up before anyone ate.");
		expect(campCardClosedText(CAMP_STATE.COLD, "Aeliana")).toBe("Aeliana's camp was left without anyone eating.");
		expect(campCardClosedText(CAMP_STATE.GONE, undefined)).toBe("This camp is over.");
	});

	// The summary card has just told everyone how the night went.
	it("closes a settled camp's window without a second telling", () => {
		expect(closedCampNotice(CAMP_STATE.SETTLED, "Aeliana")).toBeNull();
		expect(closedCampNotice(CAMP_STATE.CANCELLED, "Aeliana")).toBe("Aeliana's camp broke up. Nothing was eaten or spent.");
	});

	it("tells whoever pressed Make Camp too early what the camp is waiting for", () => {
		expect(settleRefusalText(SETTLE_REFUSAL.SHORT)).toBe("Not everyone eating has food yet. Share more, or mark who goes without.");
	});
});

describe("the settled camp's card", () => {
	it("says what the meal cost, whose food paid, and what each person took from the night", () => {
		const ledger = campLedger([
			aeliana({ choices: { offer: { supplies: 1 } } }),
			bram({ carried: { provisions: 3 }, hp: 10, maxHp: 10, marked: ["dazed"], choices: { offer: { provisions: 1 }, benefit: "debility", debility: "dazed" } }),
			cora({ choices: { eats: false } }),
		]);
		expect(campSummaryRows(ledger, freezeCampPlan(ledger))).toEqual([
			{ label: "The meal", value: "2 fed on 2 uses of food." },
			{ label: "From Aeliana's pack", value: "1 use of supplies" },
			{ label: "From Bram's pack", value: "1 use of provisions" },
			{ label: "Aeliana", value: "HP 4 → 12 (half max)." },
			{ label: "Bram", value: "Cleared Dazed." },
			{ label: "Cora", value: "Went without food, so took no pick tonight." },
		]);
	});

	it("names the mess kit that stretched the meal", () => {
		const ledger = campLedger([aeliana({ carriesMessKit: true, choices: { messKit: true, followers: 4, offer: { supplies: 2 } } })]);
		expect(campSummaryRows(ledger, freezeCampPlan(ledger))[0].value).toBe("5 fed on 2 uses of food, cooked in Aeliana's mess kit.");
	});

	it("adds the bedroll and the peaceful night to the pick", () => {
		const ledger = campLedger([aeliana({ carriesBedroll: true, choices: { offer: { supplies: 1 }, bedroll: true, peaceful: true } })]);
		const plan = freezeCampPlan(ledger, { bedrolls: { aeliana: 5 } });
		expect(campSummaryRows(ledger, plan).at(-1).value)
			.toBe("HP 4 → 12 (half max); bedroll rolled 5, HP 12 → 15; a peaceful night, so advantage is held for the next roll.");
	});

	it("says so when there was no healing left to do", () => {
		const ledger = campLedger([aeliana({ hp: 15, choices: { offer: { supplies: 1 } } })]);
		expect(campSummaryRows(ledger, freezeCampPlan(ledger)).at(-1).value).toBe("HP already full at 15.");
	});

	it("tells a sleepless night and an Unliving guest apart from going hungry", () => {
		const ledger = campLedger([
			aeliana({ choices: { offer: { supplies: 1 }, benefit: "none" } }),
			bram({ unliving: true }),
		]);
		const rows = campSummaryRows(ledger, freezeCampPlan(ledger));
		expect(rows.find(r => r.label === "Aeliana").value).toBe("Ate, but got no real sleep, so took no pick tonight.");
		expect(rows.find(r => r.label === "Bram").value).toBe("Needs no food or sleep, and took nothing from the night.");
	});
});

// ── the window ───────────────────────────────────────────────────────────────

describe("the camp window's rows", () => {
	it("gives the reader controls on their own row and sentences on everyone else's", () => {
		const rows = view([
			aeliana({ choices: { offer: { supplies: 1 } } }),
			bram({ carried: { provisions: 3 }, marked: ["dazed"], choices: { offer: { provisions: 1 }, benefit: "debility", debility: "dazed" } }),
		]).rows;
		expect(rows[0]).toMatchObject({ canEdit: true, isMine: true, says: [] });
		expect(rows[1]).toMatchObject({ canEdit: false, isMine: false });
		expect(rows[1].says).toEqual(["Sharing 1 use of provisions.", "Eating tonight.", "Clearing Dazed."]);
	});

	it("stops offering more food once the meal is paid for", () => {
		const [row] = view([aeliana({ choices: { offer: { supplies: 1 } } })]).rows;
		expect(row.purses[0]).toMatchObject({ n: 1, canAdd: false, canTake: true });
	});

	it("has nothing to take back from a purse nothing was shared from", () => {
		const [row] = view([aeliana()]).rows;
		expect(row.purses[0]).toMatchObject({ n: 0, canAdd: true, canTake: false });
	});

	it("offers to cover the rest of the meal, or as much of it as the pack can", () => {
		expect(view([aeliana({ carried: { supplies: 5 } }), bram(), cora()]).rows[0].cover)
			.toEqual({ show: true, label: "Cover the last 3 uses" });
		expect(view([aeliana({ carried: { supplies: 1 } }), bram(), cora()]).rows[0].cover)
			.toEqual({ show: true, label: "Share the 1 use still in this pack" });
	});

	it("says when some of what a row shared will go back into the pack", () => {
		expect(view([aeliana({ choices: { offer: { supplies: 3 } } })]).rows[0].givesBackText)
			.toBe("2 uses shared here stay in the pack: the meal is already paid for.");
	});

	it("heads the host's row with the camp, and every other row with whether they are ready", () => {
		const rows = view([aeliana(), bram({ choices: { ready: true } }), cora()]).rows;
		expect(rows.map(r => r.stateText)).toEqual(["Making camp", "Ready", "Still choosing"]);
		expect(rows[0]).toMatchObject({ showFoot: false });
		expect(rows[1]).toMatchObject({ showFoot: true, stateClass: "is-ready" });
	});

	it("picks healing when the debility the row chose is no longer marked", () => {
		const [row] = view([aeliana({ choices: { benefit: "debility", debility: "dazed" } })]).rows;
		expect(row.night).toMatchObject({ hp: true, debility: false, hasDebilities: false, hpBefore: 4, hpAfter: 12 });
	});

	// Settling clears whichever one this names (camp-rules.js#debilityToClear), so no row may say another.
	it("names the first marked debility when the row's choice names none still marked", () => {
		const rows = view([
			aeliana({ marked: ["weakened"], choices: { benefit: "debility", debility: "" } }),
			bram({ marked: ["weakened"], choices: { benefit: "debility", debility: "dazed" } }),
		]).rows;
		expect(rows[0].night.debilities).toEqual([{ key: "weakened", name: "Weakened", selected: true }]);
		expect(rows[1].says).toContain("Clearing Weakened.");
	});

	it("gives each row its own set of night radios", () => {
		const rows = view([aeliana(), bram()], { editable: ["aeliana", "bram"] }).rows;
		expect(rows.map(r => r.night.radioName)).toEqual(["campBenefit-aeliana", "campBenefit-bram"]);
	});
});

describe("the camp window's meal", () => {
	it("says how short the meal is and what to do about it", () => {
		expect(view([aeliana()]).meal).toEqual({
			mouthsText: "1 to feed.",
			cookText:   "With no mess kit, each use feeds 1.",
			costText:   "The meal costs 1 use of food, and 0 have been shared.",
			statusText: "1 more use needed. Share more food, or mark who goes without.",
			isShort:    true,
			isPaid:     false,
		});
	});

	it("counts the followers apart from the people at the fire", () => {
		expect(view([aeliana({ choices: { followers: 2 } })]).meal.mouthsText).toBe("3 to feed: 1 at the fire and 2 followers.");
	});

	it("says a meal with food to spare is paid for, and that the spare is kept", () => {
		expect(view([aeliana({ choices: { offer: { supplies: 3 } } })]).meal)
			.toMatchObject({ statusText: "Paid for, with 2 to spare. Only what the meal needs is eaten, and the rest stays in the packs.", isPaid: true });
	});
});

describe("the camp window's footer", () => {
	it("holds Make Camp while anyone eating has no food", () => {
		expect(view([aeliana()]).nav).toEqual({ manages: true, canSettle: false, hint: "Make Camp waits until everyone eating has food." });
	});

	it("names who is still choosing", () => {
		const nav = view([aeliana({ choices: { offer: { supplies: 3 } } }), bram(), cora()]).nav;
		expect(nav).toEqual({ manages: true, canSettle: true, hint: "Still choosing: Bram & Cora." });
	});

	it("tells a player who cannot settle the camp who will", () => {
		expect(view([aeliana(), bram()], { manages: false, editable: ["bram"], mine: ["bram"] }).nav)
			.toEqual({ manages: false, canSettle: false, hint: "Aeliana makes camp once everyone is ready." });
	});

	it("draws a camp that is over as over", () => {
		const closed = view([aeliana()], { state: CAMP_STATE.SETTLED, addable: [{ id: "cora", name: "Cora" }] });
		expect(closed).toMatchObject({ isOpen: false, closedText: "Aeliana's camp ate and settled in for the night.", add: { show: false } });
		expect(closed.rows[0].canEdit).toBe(false);
		expect(closed.nav.canSettle).toBe(false);
	});
});
