import { describe, expect, it } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import {
	CAMP_BENEFIT, CAMP_FOLLOWERS_MAX, CAMP_STALE_MS, CAMP_STATE, CAMP_STATUS, PEACEFUL_NIGHT,
	blankOffer, campLedger, campShareUpdate, campState, coverTheRest, freezeCampPlan,
	newCampRecord, offerStep, readCampRecord, readOwedCamps, rollsBedroll, spareUses,
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
		expect(freezeCampPlan(ledger, { bedrolls: { aeliana: 2 } })[0]).toMatchObject({ bedroll: 2, hpAfterPick: 12, hpAfter: 14 });
	});

	it("rolls no bedroll that is not carried, or for a night without sleep", () => {
		const notCarried = campLedger([paying({ bedroll: true })]);
		expect(rollsBedroll(notCarried.rows[0], notCarried)).toBe(false);
		const sleepless = campLedger([paying({ bedroll: true, benefit: "none" }, { carriesBedroll: true })]);
		expect(rollsBedroll(sleepless.rows[0], sleepless)).toBe(false);
		expect(freezeCampPlan(sleepless, { bedrolls: { aeliana: 6 } })[0].bedroll).toBe(0);
	});

	it("holds a peaceful night's advantage only for someone who rested", () => {
		expect(freezeCampPlan(campLedger([paying({ peaceful: true })]))[0].peaceful).toBe(true);
		expect(freezeCampPlan(campLedger([paying({ peaceful: true, eats: false, followers: 1 })]))[0].peaceful).toBe(false);
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

	it("marks the share paid in the same update", () => {
		expect(share().update[APPLIED]).toBe(true);
	});

	it("heals nothing when the max could not be read, rather than capping anyone down to 0", () => {
		expect(Object.keys(share({ maxHp: 0, halfMax: 0 }).update)).not.toContain(HP);
	});
});
