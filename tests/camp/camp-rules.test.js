import { describe, expect, it } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import {
	CAMP_BENEFIT, CAMP_FOLLOWERS_MAX, CAMP_LEFT_MAX, CAMP_STALE_MS, CAMP_STATE, CAMP_STATUS, PEACEFUL_NIGHT,
	blankOffer, breakBreadOffered, campLedger, campShareUpdate, campState, coverTheRest, freezeCampPlan,
	homeFiresHp, homeFiresKeeper, homeFiresOffered, newCampRecord, planExtra, planExtras, CAMP_EXTRA, offerStep, readCampRecord, readOwedCamps, rollsBedroll, rollsBreakBread, spareUses,
} from "../../module/camp/camp-rules.js";
import { seat } from "../fakes/camp.js";

/**
 * MAKE CAMP AS A PARTY (Book I p.334), as arithmetic: who eats, what the meal costs, whose food
 * pays for it, and what the night buys each person. Reading and writing the actors is
 * camp-store.test.js's business, and the words are camp-view.test.js's.
 */

const host = (over = {}) => seat({ id: "aeliana", name: "Aeliana", isHost: true, joinedAt: 1, ...over });
const bram = (over = {}) => seat({ id: "bram", name: "Bram", joinedAt: 2, carried: {}, ...over });
const cora = (over = {}) => seat({ id: "cora", name: "Cora", joinedAt: 3, carried: {}, ...over });

/** The host, paying for their own supper out of four supplies unless told otherwise. */
const paying = (choices = {}, over = {}) => host({ ...over, choices: { offer: { supplies: 1 }, ...choices } });

// ── the record ───────────────────────────────────────────────────────────────

describe("a camp record", () => {
	it("is nothing without a camp id", () => {
		expect(readCampRecord(null)).toBeNull();
		expect(readCampRecord({ offer: { supplies: 2 } })).toBeNull();
	});

	it("reads a sparse record as the defaults", () => {
		const record = readCampRecord({ id: "camp-1" });
		expect(record).toMatchObject({ eats: true, benefit: CAMP_BENEFIT.HP, followers: 0, ready: false, applied: false, plan: null });
		expect(record.offer).toEqual(blankOffer());
	});

	// Twisting Pine sap closes wounds, but it is not food (Book II p.462).
	it("offers from the supplies rows and the larder, and never the sap", () => {
		expect(Object.keys(blankOffer())).toEqual(["supplies", "more-supplies", "even-more-supplies", "provisions"]);
		expect(readCampRecord({ id: "camp-1", offer: { "twisting-pine": 3 } }).offer).not.toHaveProperty(["twisting-pine"]);
	});

	it("keeps its counts whole and inside their bounds", () => {
		const record = readCampRecord({ id: "camp-1", followers: 99, offer: { supplies: -2, provisions: 2.7 }, benefit: "feast" });
		expect(record.followers).toBe(CAMP_FOLLOWERS_MAX);
		expect(record.offer.supplies).toBe(0);
		expect(record.offer.provisions).toBe(2);
		expect(record.benefit).toBe(CAMP_BENEFIT.HP);
	});

	it("reads a host's owed camps as a list, whatever was stored", () => {
		expect(readOwedCamps(undefined)).toEqual([]);
		expect(readOwedCamps([{ id: "camp-1", plan: [{ actorId: "bram" }] }, { id: "", plan: [] }, { id: "camp-2" }, null]))
			.toEqual([{ id: "camp-1", plan: [{ actorId: "bram" }] }]);
	});
});

describe("sitting down at a camp", () => {
	const sitting = (over = {}) => newCampRecord({
		id: "camp-1", hostId: "aeliana", actorId: "bram", now: 500, vitals: { maxHp: 15 }, hpValue: 4, ...over,
	});

	// Foundry merges a flag write into what is already there, so a record that left a field out
	// would keep the last camp's value for it: a ready tick, an applied mark, a settled plan.
	it("writes every field a camp record has, so one write clears the last camp", () => {
		expect(Object.keys(sitting()).sort()).toEqual(Object.keys(readCampRecord({ id: "x" })).sort());
		expect(sitting()).toMatchObject({ plan: null, applied: false, ready: false, settledAt: 0, offer: blankOffer() });
	});

	it("opens the camp for its host, and only for its host", () => {
		expect(sitting({ actorId: "aeliana" })).toMatchObject({ status: CAMP_STATUS.OPEN, openedAt: 500, joinedAt: 500 });
		expect(sitting()).toMatchObject({ status: null, openedAt: 0, joinedAt: 500 });
	});

	it("starts on healing, or on a debility when there is nothing to heal", () => {
		expect(sitting({ activeDebilityKeys: ["dazed"] })).toMatchObject({ benefit: CAMP_BENEFIT.HP, debility: "dazed" });
		expect(sitting({ hpValue: 15, activeDebilityKeys: ["dazed"] })).toMatchObject({ benefit: CAMP_BENEFIT.DEBILITY, debility: "dazed" });
		expect(sitting({ hpValue: 15 })).toMatchObject({ benefit: CAMP_BENEFIT.HP, debility: "" });
	});

	it("brings the bedroll and the mess kit that are actually carried", () => {
		expect(sitting({ vitals: { maxHp: 15, bedroll: true, messKit: true } })).toMatchObject({ bedroll: true, messKit: true });
		expect(sitting()).toMatchObject({ bedroll: false, messKit: false });
	});

	it("does not sit a Ghost or a Revenant down to eat", () => {
		expect(sitting({ unliving: true }).eats).toBe(false);
	});
});

describe("where a camp stands", () => {
	const camp = { campId: "camp-1", hostId: "aeliana" };
	const hostRecord = (over = {}) => readCampRecord({ id: "camp-1", host: "aeliana", status: "open", openedAt: 1000, ...over });

	it("is open while its host keeps it open", () => {
		expect(campState(hostRecord(), camp, 2000)).toBe(CAMP_STATE.OPEN);
	});

	it("goes cold when nobody settles it", () => {
		expect(campState(hostRecord(), camp, 1000 + CAMP_STALE_MS + 1)).toBe(CAMP_STATE.COLD);
	});

	it("is settled or broken up when its host says so", () => {
		expect(campState(hostRecord({ status: "settled" }), camp, 2000)).toBe(CAMP_STATE.SETTLED);
		expect(campState(hostRecord({ status: "cancelled" }), camp, 2000)).toBe(CAMP_STATE.CANCELLED);
	});

	// Only the host can say. A member's record goes on naming the camp they sat at long after it
	// is over.
	it("is gone once its host is at some other camp, or at none", () => {
		expect(campState(hostRecord({ id: "camp-2" }), camp, 2000)).toBe(CAMP_STATE.GONE);
		expect(campState(hostRecord({ host: "bram", status: null }), camp, 2000)).toBe(CAMP_STATE.GONE);
		expect(campState(null, camp, 2000)).toBe(CAMP_STATE.GONE);
	});

	// Walking over to another fire breaks the host's own camp up, and the record that said so is gone.
	it("is broken up when its host left it for another camp", () => {
		expect(campState(hostRecord({ id: "camp-2", status: null, leftCamps: ["camp-1"] }), camp, 2000)).toBe(CAMP_STATE.CANCELLED);
		expect(campState(hostRecord({ id: "camp-3", status: null, leftCamps: ["camp-1", "camp-2"] }), camp, 2000)).toBe(CAMP_STATE.CANCELLED);
		expect(campState(hostRecord({ id: "camp-2", status: null, leftCamps: ["camp-9"] }), camp, 2000)).toBe(CAMP_STATE.GONE);
	});

	it("remembers only the latest camps a character broke up", () => {
		const ids = Array.from({ length: CAMP_LEFT_MAX + 2 }, (_, i) => `camp-${i}`);
		expect(readCampRecord({ id: "x", leftCamps: ids }).leftCamps).toEqual(ids.slice(-CAMP_LEFT_MAX));
		expect(readCampRecord({ id: "x", leftCamps: "camp-1" }).leftCamps).toEqual([]);
	});
});

// ── the bill ─────────────────────────────────────────────────────────────────

describe("the meal's bill", () => {
	// "Each member of the party must consume 1 use of supplies or provisions."
	it("costs one use a mouth", () => {
		expect(campLedger([host(), bram(), cora()])).toMatchObject({ mouths: 3, bill: 3 });
	});

	it("feeds the followers too", () => {
		expect(campLedger([host({ choices: { followers: 2 } })])).toMatchObject({ mouths: 3, bill: 3 });
	});

	it("does not feed whoever goes without, or the Unliving", () => {
		expect(campLedger([host(), bram({ choices: { eats: false } }), cora({ unliving: true })]).mouths).toBe(1);
	});

	// "If you use a mess kit (requires fire & water), then 1 use can provide for up to four people."
	it("stretches each use over four with a mess kit, rounding up", () => {
		const cook = host({ carriesMessKit: true, choices: { messKit: true, followers: 4 } });
		expect(campLedger([cook])).toMatchObject({ mouths: 5, bill: 2, messKit: true, cooks: ["Aeliana"] });
	});

	it("needs the kit both carried and put to use", () => {
		expect(campLedger([host({ carriesMessKit: true, choices: { followers: 4 } })]).bill).toBe(5);
		expect(campLedger([host({ choices: { messKit: true, followers: 4 } })]).bill).toBe(5);
	});

	it("settles once everyone eating has food, and not before", () => {
		const fed = campLedger([host({ choices: { offer: { supplies: 2 } } }), bram(), cora({ choices: { eats: false } })]);
		expect(fed).toMatchObject({ bill: 2, offered: 2, short: 0, canSettle: true });
		const hungry = campLedger([host({ choices: { offer: { supplies: 1 } } }), bram()]);
		expect(hungry).toMatchObject({ bill: 2, offered: 1, short: 1, canSettle: false });
	});

	it("has nothing to settle with nobody at the fire", () => {
		expect(campLedger([]).canSettle).toBe(false);
	});

	it("waits on everyone but the host to say they are ready", () => {
		expect(campLedger([host(), bram({ choices: { ready: true } }), cora()]).waitingOn).toEqual(["Cora"]);
	});
});

describe("the food shared", () => {
	it("counts only what the pack still holds", () => {
		expect(campLedger([host({ carried: { supplies: 2 }, choices: { offer: { supplies: 4 } } })]).offered).toBe(2);
	});

	it("counts nothing from a purse emptied since it was offered", () => {
		const ledger = campLedger([host({ carried: { supplies: 1 }, choices: { offer: { provisions: 3 } } })]);
		expect(ledger.offered).toBe(0);
		expect(ledger.offers[0].purses.map(p => p.slug)).toEqual(["supplies"]);
	});

	it("never offers the sap, however much of it is carried", () => {
		expect(campLedger([host({ carried: { "twisting-pine": 3 } })]).offers[0].purses).toEqual([]);
	});

	// Two people reaching for the same last use at once. Only the bill is eaten.
	it("spends only the bill, giving back from whoever sat down last", () => {
		const ledger = campLedger([
			host({ choices: { offer: { supplies: 2 }, followers: 1 } }),
			bram({ carried: { supplies: 3 }, choices: { offer: { supplies: 2 } } }),
		]);
		expect(ledger).toMatchObject({ bill: 3, offered: 4, over: 1 });
		expect(ledger.spends.map(s => s.total)).toEqual([2, 1]);
	});

	// The order a spend drains a pack, run backwards: the larder goes back before the printed rows.
	it("gives the larder back before the supplies rows", () => {
		const ledger = campLedger([host({
			carried: { supplies: 4, provisions: 5 },
			choices: { offer: { supplies: 2, provisions: 1 }, followers: 1 },
		})]);
		expect(ledger.spends[0].spend).toEqual([{ slug: "supplies", label: "Supplies", n: 2 }]);
	});
});

describe("sharing food from a row", () => {
	it("steps an offer up and down inside what the purse holds", () => {
		const aeliana = host({ carried: { supplies: 2 }, choices: { offer: { supplies: 1 } } });
		expect(offerStep(aeliana, "supplies", 1)).toBe(2);
		expect(offerStep(host({ carried: { supplies: 2 }, choices: { offer: { supplies: 2 } } }), "supplies", 1)).toBe(2);
		expect(offerStep(host({ carried: { supplies: 2 } }), "supplies", -1)).toBe(0);
		expect(offerStep(aeliana, "provisions", 1)).toBe(0);
	});

	it("covers what the meal is short, printed rows first", () => {
		const aeliana = host({ carried: { supplies: 1, provisions: 5 } });
		const ledger = campLedger([aeliana, bram({ carried: { supplies: 1 }, choices: { offer: { supplies: 1 } } }), cora()]);
		expect(ledger.short).toBe(2);
		expect(coverTheRest(ledger, aeliana)).toEqual({ ...blankOffer(), supplies: 1, provisions: 1 });
	});

	it("covers as much as a light pack can", () => {
		const aeliana = host({ carried: { supplies: 1 } });
		expect(coverTheRest(campLedger([aeliana, bram(), cora()]), aeliana)).toEqual({ ...blankOffer(), supplies: 1 });
	});

	it("counts the food in a pack not yet shared", () => {
		const aeliana = host({ carried: { supplies: 4, provisions: 2 }, choices: { offer: { supplies: 1 } } });
		expect(spareUses(campLedger([aeliana]), aeliana)).toBe(5);
	});
});

// ── the plan ─────────────────────────────────────────────────────────────────

describe("the frozen plan", () => {
	// "Regain HP equal to ½ your max." Halves round up: 15 gives 8, not 7.
	it("heals half the max, rounded up", () => {
		expect(freezeCampPlan(campLedger([paying()]))[0]).toMatchObject({
			rests: true, benefit: CAMP_BENEFIT.HP, halfMax: 8, hpBefore: 4, hpAfterPick: 12, hpAfter: 12,
		});
	});

	it("never heals past the max", () => {
		expect(freezeCampPlan(campLedger([paying({}, { hp: 14 })]))[0].hpAfter).toBe(15);
	});

	// Book I p.335: going without food is going without the pick. What they shared is still eaten.
	it("gives whoever went without no pick, and still spends what they shared", () => {
		const [aeliana] = freezeCampPlan(campLedger([paying({ eats: false, followers: 1 })]));
		expect(aeliana).toMatchObject({ eats: false, rests: false, benefit: null });
		expect(aeliana.spend).toEqual([{ slug: "supplies", label: "Supplies", n: 1 }]);
	});

	it("gives the Unliving nothing from the night", () => {
		const plan = freezeCampPlan(campLedger([paying(), bram({ unliving: true })]));
		expect(plan[1]).toMatchObject({ unliving: true, eats: false, rests: false, benefit: null });
	});

	it("gives a night without real sleep no pick", () => {
		expect(freezeCampPlan(campLedger([paying({ benefit: "none" })]))[0]).toMatchObject({ rests: false, benefit: null });
	});

	it("clears the chosen debility instead, while it is still marked", () => {
		const [aeliana] = freezeCampPlan(campLedger([paying({ benefit: "debility", debility: "dazed" }, { marked: ["weakened", "dazed"] })]));
		expect(aeliana).toMatchObject({ benefit: CAMP_BENEFIT.DEBILITY, debility: { key: "dazed", name: "Dazed" }, hpAfter: 4 });
	});

	it("heals instead when the chosen debility was cleared some other way", () => {
		const [aeliana] = freezeCampPlan(campLedger([paying({ benefit: "debility", debility: "dazed" })]));
		expect(aeliana).toMatchObject({ benefit: CAMP_BENEFIT.HP, debility: null, hpAfter: 12 });
	});

	// The window shows such a row the first marked debility, selected, and the plan must clear that
	// one rather than quietly healing instead.
	it("clears the first marked debility when the row's choice names none still marked", () => {
		const joinedWithNone = freezeCampPlan(campLedger([paying({ benefit: "debility", debility: "" }, { marked: ["weakened"] })]))[0];
		expect(joinedWithNone).toMatchObject({ benefit: CAMP_BENEFIT.DEBILITY, debility: { key: "weakened", name: "Weakened" }, hpAfter: 4 });
		const choiceCleared = freezeCampPlan(campLedger([paying({ benefit: "debility", debility: "dazed" }, { marked: ["weakened"] })]))[0];
		expect(choiceCleared.debility).toEqual({ key: "weakened", name: "Weakened" });
	});

	// The bedroll's printed "recover 1d6 extra HP when you Make Camp": extra, so it stacks.
	it("adds a carried bedroll's die to the pick", () => {
		const ledger = campLedger([paying({ bedroll: true }, { carriesBedroll: true })]);
		expect(rollsBedroll(ledger.rows[0], ledger)).toBe(true);
		expect(freezeCampPlan(ledger, { bedrolls: { aeliana: 2 } })[0]).toMatchObject({
			hpAfterPick: 12, extras: [{ source: "bedroll", amount: 2, from: 12, to: 14 }], hpAfter: 14,
		});
	});

	it("rolls no bedroll that is not carried, or for a night without sleep", () => {
		const notCarried = campLedger([paying({ bedroll: true })]);
		expect(rollsBedroll(notCarried.rows[0], notCarried)).toBe(false);
		const sleepless = campLedger([paying({ bedroll: true, benefit: "none" }, { carriesBedroll: true })]);
		expect(rollsBedroll(sleepless.rows[0], sleepless)).toBe(false);
		expect(planExtra(freezeCampPlan(sleepless, { bedrolls: { aeliana: 6 } })[0], CAMP_EXTRA.BEDROLL)).toBe(0);
	});

	it("holds a peaceful night's advantage only for someone who rested", () => {
		expect(freezeCampPlan(campLedger([paying({ peaceful: true })]))[0].peaceful).toBe(true);
		expect(freezeCampPlan(campLedger([paying({ peaceful: true, eats: false, followers: 1 })]))[0].peaceful).toBe(false);
	});
});

// The Judge's "When you share a proper meal with someone and each of you eats their fill, each of
// you recovers 1d8 (extra) HP."
describe("Break Bread at the fire", () => {
	/** Aeliana paying for two, Bram eating with her. */
	const supper = (hostOver = {}, bramOver = {}, hostChoices = {}) =>
		campLedger([paying({ offer: { supplies: 2 }, ...hostChoices }, hostOver), bram(bramOver)]);

	it("is on the table only when someone eating holds it and the meal is paid", () => {
		expect(breakBreadOffered(supper({ breaksBread: true }))).toBe(true);
		expect(breakBreadOffered(supper({}, { breaksBread: true }))).toBe(true);
		expect(breakBreadOffered(supper())).toBe(false);
		// Short a use: Bram has nothing, and Aeliana shares only her own.
		expect(breakBreadOffered(campLedger([paying({}, { breaksBread: true }), bram()]))).toBe(false);
	});

	it("is not on the table when the only holder goes without", () => {
		expect(breakBreadOffered(supper({}, { breaksBread: true, choices: { eats: false } }))).toBe(false);
	});

	it("reads the host's proper-meal box, ticked unless the host unticked it", () => {
		expect(supper().properMeal).toBe(true);
		expect(supper({}, {}, { properMeal: false }).properMeal).toBe(false);
	});

	it("gives everyone who eats a 1d8 of extra HP, stacked beside the bedroll", () => {
		const ledger = supper({ breaksBread: true, carriesBedroll: true }, {}, { bedroll: true });
		expect(ledger.rows.map(m => rollsBreakBread(m, ledger))).toEqual([true, true]);
		const [aeliana, bramEntry] = freezeCampPlan(ledger, { bedrolls: { aeliana: 1 }, breads: { aeliana: 2, bram: 5 } });
		expect(aeliana).toMatchObject({ hpAfterPick: 12, extras: [{ source: "bedroll", amount: 1, from: 12, to: 13 }, { source: "breakBread", amount: 2, from: 13, to: 15 }], hpAfter: 15 });
		expect(bramEntry).toMatchObject({ hpAfterPick: 12, extras: [{ source: "breakBread", amount: 5, from: 12, to: 15 }], hpAfter: 15 });
	});

	it("rolls nothing when the host unticks the proper meal", () => {
		const ledger = supper({ breaksBread: true }, {}, { properMeal: false });
		expect(ledger.rows.map(m => rollsBreakBread(m, ledger))).toEqual([false, false]);
		expect(freezeCampPlan(ledger, { breads: { aeliana: 6, bram: 6 } }).map(e => planExtra(e, CAMP_EXTRA.BREAK_BREAD))).toEqual([0, 0]);
	});

	it("gives nothing to whoever does not eat", () => {
		const ledger = campLedger([paying({ offer: { supplies: 1 } }, { breaksBread: true }), bram({ choices: { eats: false } })]);
		expect(ledger.rows.map(m => rollsBreakBread(m, ledger))).toEqual([true, false]);
		const unliving = campLedger([paying({}, { breaksBread: true }), bram({ unliving: true })]);
		expect(rollsBreakBread(unliving.rows[1], unliving)).toBe(false);
	});

	// It is the meal's, not the night's.
	it("still reaches someone who ate but got no real sleep", () => {
		const ledger = supper({ breaksBread: true }, { choices: { benefit: "none" } });
		expect(freezeCampPlan(ledger, { breads: { aeliana: 3, bram: 3 } })[1]).toMatchObject({ rests: false, extras: [{ source: "breakBread", amount: 3, from: 4, to: 7 }], hpAfter: 7 });
	});

	it("is one meal, so two holders at the fire still give one 1d8 each", () => {
		const ledger = supper({ breaksBread: true }, { breaksBread: true });
		expect(ledger.breadBreakers).toEqual(["Aeliana", "Bram"]);
		expect(freezeCampPlan(ledger, { breads: { aeliana: 1, bram: 1 } }).map(e => [planExtra(e, CAMP_EXTRA.BREAK_BREAD), e.hpAfter])).toEqual([[1, 13], [1, 13]]);
	});
});

// The Lightbearer's "When you build a camp fire and sprinkle it with ash from your own hearth,
// anyone who Makes Camp with you is free from nightmares or bad dreams and recovers (extra) HP equal
// to your CHA."
describe("Keep the Home-Fires Burning at the fire", () => {
	/** Aeliana paying for two, Bram eating with her. */
	const supper = (hostOver = {}, bramOver = {}, hostChoices = {}) =>
		campLedger([paying({ offer: { supplies: 2 }, ...hostChoices }, hostOver), bram(bramOver)]);

	it("is on offer whenever someone at the fire has it learned, ticked unless the host unticks it", () => {
		expect(homeFiresOffered(supper({}, { hearthCha: 2 }))).toBe(true);
		expect(homeFiresOffered(supper())).toBe(false);
		expect(supper().hearthAsh).toBe(true);
		expect(homeFiresHp(supper({}, { hearthCha: 2 }))).toBe(2);
		expect(homeFiresHp(supper({}, { hearthCha: 2 }, { hearthAsh: false }))).toBe(0);
	});

	it("gives everyone making camp the holder's CHA, the holder too, eating or not", () => {
		const ledger = supper({}, { hearthCha: 2, choices: { eats: false } });
		const [aeliana, bramEntry] = freezeCampPlan(ledger);
		expect(aeliana).toMatchObject({ hpAfterPick: 12, extras: [{ source: "homeFires", amount: 2, from: 12, to: 14 }], hpAfter: 14 });
		expect(bramEntry).toMatchObject({ rests: false, hpBefore: 4, extras: [{ source: "homeFires", amount: 2, from: 4, to: 6 }], hpAfter: 6 });
	});

	it("never takes HP away for a negative CHA, and two holders give the higher CHA once", () => {
		expect(homeFiresHp(supper({ hearthCha: -1 }))).toBe(0);
		const two = supper({ hearthCha: 1 }, { hearthCha: 3 });
		expect(homeFiresHp(two)).toBe(3);
		expect(homeFiresKeeper(two).name).toBe("Bram");
		expect(freezeCampPlan(two).map(e => planExtra(e, CAMP_EXTRA.HOME_FIRES))).toEqual([3, 3]);
	});

	it("gives the Unliving nothing", () => {
		const ledger = campLedger([paying({}, { hearthCha: 2 }), bram({ unliving: true })]);
		expect(freezeCampPlan(ledger).map(e => planExtra(e, CAMP_EXTRA.HOME_FIRES))).toEqual([2, 0]);
	});

	it("comes on top of Break Bread, and stops at max HP", () => {
		const ledger = supper({ breaksBread: true, hearthCha: 3 });
		const [aeliana] = freezeCampPlan(ledger, { breads: { aeliana: 2, bram: 2 } });
		expect(aeliana).toMatchObject({ hpAfterPick: 12, extras: [{ source: "breakBread", amount: 2, from: 12, to: 14 }, { source: "homeFires", amount: 3, from: 14, to: 15 }], hpAfter: 15 });
	});
});

// Auspicious Birth: "Clear it when you Make Camp or Convalesce."
describe("a background track a camp clears", () => {
	const circle = [{ key: "auspicious-birth", name: "Auspicious Birth's background circle" }];

	it("is cleared for anyone making camp, eating or not, and never for the Unliving", () => {
		const ledger = campLedger([
			paying({}, { clearsTonight: circle }),
			bram({ clearsTonight: circle, choices: { eats: false } }),
			cora({ clearsTonight: circle, unliving: true }),
		]);
		expect(freezeCampPlan(ledger).map(e => e.clears)).toEqual([circle, circle, []]);
	});

	it("names nothing for someone with no marked track", () => {
		expect(freezeCampPlan(campLedger([paying()]))[0].clears).toEqual([]);
	});
});

// ── one share ────────────────────────────────────────────────────────────────

describe("one character's share", () => {
	const resourcePath = slug => `flags.${SYSTEM_ID}.inventory.resources.${slug}`;
	const APPLIED = `flags.${SYSTEM_ID}.camp.applied`;
	const HELD    = `flags.${SYSTEM_ID}.heldAdvantage`;
	const HP      = "system.attributes.hp.value";

	const entry = (over = {}) => ({
		spend: [{ slug: "supplies", label: "Supplies", n: 2 }],
		eats: true, rests: true, benefit: CAMP_BENEFIT.HP, debility: null,
		maxHp: 15, halfMax: 8, bedroll: 0, peaceful: false,
		...over,
	});
	// These mirror StonetopCharacter's own fragment builders, so the paths asserted are the ones
	// that actually land.
	const live = (over = {}) => ({
		resources:     { supplies: 4 },
		hpValue:       4,
		resourceData:  (slug, count) => ({ [resourcePath(slug)]: count }),
		advantageData: source => ({ [HELD]: { source } }),
		...over,
	});
	const share = (e, l) => campShareUpdate(entry(e), live(l));

	// What lands is an absolute count, so it is worked from the pack as it is when the share is
	// paid: a Forage payout between the settle and the write must not be undone.
	it("spends the planned uses from what the pack holds when the share is paid", () => {
		expect(share({}, { resources: { supplies: 6 } }).update[resourcePath("supplies")]).toBe(4);
	});

	it("spends from every purse the plan names, in one update", () => {
		const { update } = share({ spend: [{ slug: "supplies", n: 1 }, { slug: "provisions", n: 2 }] }, { resources: { supplies: 1, provisions: 5 } });
		expect(update[resourcePath("supplies")]).toBe(0);
		expect(update[resourcePath("provisions")]).toBe(3);
	});

	it("says how much a pack emptied since the settle could not pay", () => {
		const { update, shortfall } = share({}, { resources: { supplies: 1 } });
		expect(update[resourcePath("supplies")]).toBe(0);
		expect(shortfall).toBe(1);
	});

	// They took 3 harm while the camp sat open, so the night is 1 + 8 = 9, not 12.
	it("heals from the HP the character has when the share is paid", () => {
		expect(share({}, { hpValue: 1 }).update[HP]).toBe(9);
	});

	it("never heals past the max", () => {
		expect(share({}, { hpValue: 14 }).update[HP]).toBe(15);
	});

	it("clears the debility instead, when that was the pick", () => {
		const { update } = share({ benefit: CAMP_BENEFIT.DEBILITY, debility: { key: "dazed", name: "Dazed" } });
		expect(update["system.attributes.debilities.options.dazed.value"]).toBe(false);
		expect(Object.keys(update)).not.toContain(HP);
	});

	it("adds the bedroll's roll on top of either pick", () => {
		expect(share({ bedroll: 3 }).update[HP]).toBe(15);
		const cleared = share({ benefit: CAMP_BENEFIT.DEBILITY, debility: { key: "dazed" }, bedroll: 3 }, { hpValue: 10 }).update;
		expect(cleared[HP]).toBe(13);
	});

	// A HELD advantage, not the sticky roll-modifier selector: see StonetopCharacter#heldAdvantage.
	it("holds the peaceful night's advantage for the next roll", () => {
		expect(share({ peaceful: true }).update[HELD]).toEqual({ source: PEACEFUL_NIGHT });
	});

	it("gives someone who did not rest nothing but their part of the bill", () => {
		const { update } = share({ rests: false, benefit: null, bedroll: 3, peaceful: true });
		expect(Object.keys(update)).toEqual([resourcePath("supplies"), APPLIED]);
	});

	it("adds Break Bread's roll beside the bedroll, and to an eater who got no real sleep", () => {
		expect(share({ bedroll: 1, breakBread: 2 }).update[HP]).toBe(15);
		expect(share({ breakBread: 2 }, { hpValue: 1 }).update[HP]).toBe(11);
		expect(share({ rests: false, benefit: null, breakBread: 4 }).update[HP]).toBe(8);
	});

	it("adds the home fires' HP to anyone who made camp, rested or not", () => {
		expect(share({ homeFires: 2 }).update[HP]).toBe(14);
		expect(share({ rests: false, benefit: null, homeFires: 2 }).update[HP]).toBe(6);
	});

	it("empties the background tracks the plan names, in the same update", () => {
		const { update } = share({ rests: false, benefit: null, clears: [{ key: "auspicious-birth", name: "Auspicious Birth's background circle" }] });
		expect(update[`flags.${SYSTEM_ID}.background.setupResources.auspicious-birth`]).toBe(0);
	});

	it("marks the share paid in the same update", () => {
		expect(share().update[APPLIED]).toBe(true);
	});

	it("heals nothing when the max could not be read, rather than capping anyone down to 0", () => {
		expect(Object.keys(share({ maxHp: 0, halfMax: 0 }).update)).not.toContain(HP);
	});
});

// An owed camp frozen by an earlier version carries the old separate fields, not `extras`: it is read
// the same way, replayed from the pick, so it still pays and still says what it did.
describe("a plan frozen before the extras list", () => {
	const legacy = { rests: true, maxHp: 15, hpBefore: 4, hpAfterPick: 12, bedroll: 1, breakBread: 2, homeFires: 3, hpAfter: 15 };

	it("reads the old fields in the order they landed", () => {
		expect(planExtras(legacy)).toEqual([
			{ source: CAMP_EXTRA.BEDROLL, amount: 1, from: 12, to: 13 },
			{ source: CAMP_EXTRA.BREAK_BREAD, amount: 2, from: 13, to: 15 },
			{ source: CAMP_EXTRA.HOME_FIRES, amount: 3, from: 15, to: 15 },
		]);
	});

	it("gives no bedroll to a night without sleep", () => {
		expect(planExtras({ ...legacy, rests: false, hpAfterPick: 4 }).map(x => x.source))
			.toEqual([CAMP_EXTRA.BREAK_BREAD, CAMP_EXTRA.HOME_FIRES]);
	});
});
