import { SYSTEM_ID } from "../system-id.js";
import { SUPPLY_PURPOSE, campUsesNeeded, supplyPurseSlugsFor, supplyPursesFor } from "../actors/character/supply-cost.js";

/**
 * MAKE CAMP, AS A PARTY (Book I p.334).
 *
 * "Each member of the party must consume 1 use of supplies or provisions; if you use a mess kit
 * (requires fire & water), then 1 use can provide for up to four people." The bill is the whole
 * party's, and anyone carrying food can pay it. What the night buys is each person's own: "If you
 * eat and drink your fill, and get at least a few hours of sleep, pick 1", and a rest that was
 * peaceful, comfortable or enjoyable adds advantage on the next roll.
 *
 * So a camp is shared state with one writer per character. Each player keeps their own part on
 * their own character: what they offer from their pack, who else eats with them, what they take
 * from the night. That is the one document a player can always write, and it means nobody's pack
 * is opened by anyone but its owner. The character who opened the camp (its host) holds the rest:
 * whether the camp is still open and, once it is settled, the plan every share is paid from.
 *
 * This file is the arithmetic. It never reaches for Foundry, so the rules can be tested as rules;
 * camp-store.js reads the documents and lands the writes.
 */

/** The flag, on each character at the fire, holding their part of the camp. */
export const CAMP_FLAG = "camp";

/**
 * The flag, on a character who hosted a settled camp, keeping that camp's plan while somebody's
 * share of it is still unpaid, as `[{id, plan}]`. The plan lives on the host's camp record, and
 * that record is replaced the next time the host sits down at any camp; a share owed to a player
 * who was away when the camp settled would otherwise go with it.
 */
export const CAMP_OWED_FLAG = "campOwed";

/** What a host's record can say about its camp. Only the host's record carries one. */
export const CAMP_STATUS = Object.freeze({
	OPEN:      "open",
	SETTLED:   "settled",
	CANCELLED: "cancelled",
});

/**
 * How a camp reads from outside: its host's status, or one of the two ways a camp stops being
 * joinable without anybody settling or breaking it. COLD is a camp left open past CAMP_STALE_MS.
 * GONE is a camp whose host has since opened another, left it, or been deleted.
 */
export const CAMP_STATE = Object.freeze({
	...CAMP_STATUS,
	COLD: "cold",
	GONE: "gone",
});

/** The night's pick (p.334), and the night that bought nothing because nobody really slept. */
export const CAMP_BENEFIT = Object.freeze({
	HP:       "hp",
	DEBILITY: "debility",
	NONE:     "none",
});

/**
 * How long an unsettled camp stays joinable. A camp is minutes of table time. One still open the
 * next evening was abandoned when a session ended, and treating it as live would fold a new
 * night's camp into it.
 */
export const CAMP_STALE_MS = 8 * 60 * 60 * 1000;

/** The most extra mouths one character can bring to the fire. */
export const CAMP_FOLLOWERS_MAX = 20;

/** How many camps a character remembers breaking up, latest kept. Older ones read as simply gone. */
export const CAMP_LEFT_MAX = 10;

/** The held advantage a peaceful night leaves, named the way the sheet's chip shows it. */
export const PEACEFUL_NIGHT = "A peaceful night's rest";

/** Why a press of Make Camp did not settle the camp. */
export const SETTLE_REFUSAL = Object.freeze({
	CLOSED:    "closed",
	NOT_YOURS: "not-yours",
	SHORT:     "short",
});

/**
 * The post-death inserts whose Unliving move reads "You need not eat nor drink nor sleep ... You
 * gain no benefit from ... Make Camp". They can still sit at the fire and share out their food;
 * they are simply not a mouth, and the night buys them nothing. A Thrall eats and sleeps like
 * anyone else.
 */
export const UNLIVING_KINDS = Object.freeze(["ghost", "revenant"]);

/** Every purse a camp can be fed from, in the order a spend drains them. */
const CAMP_PURSE_SLUGS = supplyPurseSlugsFor(SUPPLY_PURPOSE.CAMP);

/** A whole number from 0 to `max`; anything that is not a number reads as 0. */
export function count(value, max = Infinity) {
	return Math.min(max, Math.max(0, Math.trunc(Number(value) || 0)));
}

/** An offer of nothing, with a zero for every purse so a write of it clears an old offer. */
export function blankOffer() {
	return Object.fromEntries(CAMP_PURSE_SLUGS.map(slug => [slug, 0]));
}

/**
 * The derived numbers a character publishes when they join, because another client cannot work
 * them out: max HP is COMPUTED by the character model (the stored field lags it), and whether a
 * bedroll or a mess kit is actually carried is an outfit question. Debility names ride along so a
 * row can name one; whether it is marked is read live off the actor.
 */
function readVitals(raw) {
	return {
		maxHp:      count(raw?.maxHp),
		bedroll:    !!raw?.bedroll,
		messKit:    !!raw?.messKit,
		debilities: (Array.isArray(raw?.debilities) ? raw.debilities : [])
			.filter(d => d?.key)
			.map(d => ({ key: String(d.key), name: String(d.name ?? d.key) })),
	};
}

/**
 * A stored camp flag in one dependable shape, or null for a character at no camp.
 *
 * Every read goes through here, so a record written by an older build, or half-written by a merge,
 * reads as defaults rather than as `undefined` arithmetic.
 */
export function readCampRecord(raw) {
	if (!raw || typeof raw !== "object" || !raw.id) return null;
	const offer = blankOffer();
	for (const slug of CAMP_PURSE_SLUGS) offer[slug] = count(raw.offer?.[slug]);
	return {
		id:        String(raw.id),
		host:      String(raw.host ?? ""),
		status:    Object.values(CAMP_STATUS).includes(raw.status) ? raw.status : null,
		openedAt:  count(raw.openedAt),
		joinedAt:  count(raw.joinedAt),
		offer,
		followers: count(raw.followers, CAMP_FOLLOWERS_MAX),
		eats:      raw.eats !== false,
		messKit:   !!raw.messKit,
		benefit:   Object.values(CAMP_BENEFIT).includes(raw.benefit) ? raw.benefit : CAMP_BENEFIT.HP,
		debility:  String(raw.debility ?? ""),
		bedroll:   !!raw.bedroll,
		peaceful:  !!raw.peaceful,
		ready:     !!raw.ready,
		vitals:    readVitals(raw.vitals),
		plan:      Array.isArray(raw.plan) ? raw.plan : null,
		settledAt: count(raw.settledAt),
		// On a host: the latest press of Make Camp by someone whose client does not settle this camp,
		// as a fresh token each time (camp-store.js#settleCamp).
		settleAsk: String(raw.settleAsk ?? ""),
		applied:   !!raw.applied,
		// The unsettled camps this character was hosting when they sat down somewhere else instead,
		// which those moves broke up (campState). Carried from record to record, latest last.
		leftCamps: readLeftCamps(raw.leftCamps),
	};
}

/** A host's owed camps (CAMP_OWED_FLAG) in one dependable shape: `[{id, plan}]`, never null. */
export function readOwedCamps(raw) {
	return (Array.isArray(raw) ? raw : [])
		.filter(camp => camp?.id && Array.isArray(camp.plan))
		.map(camp => ({ id: String(camp.id), plan: camp.plan }));
}

/**
 * The record a character writes on hosting or joining a camp.
 *
 * EVERY FIELD, always. Foundry merges a flag write into what is already there, so a record that
 * left one out would inherit it from whatever camp this character sat at last: last week's ready
 * tick, or a settled plan. Writing all of them makes one write a clean slate without an unset
 * first.
 */
export function newCampRecord({
	id, hostId, actorId, now = 0, vitals = {}, followers = 0,
	hpValue = 0, activeDebilityKeys = [], unliving = false, leftCamps = [],
}) {
	const read    = readVitals(vitals);
	const hosting = actorId === hostId;
	const hurt    = read.maxHp > 0 && count(hpValue) < read.maxHp;
	return {
		id:        String(id),
		host:      String(hostId),
		status:    hosting ? CAMP_STATUS.OPEN : null,
		openedAt:  hosting ? count(now) : 0,
		joinedAt:  count(now),
		offer:     blankOffer(),
		followers: count(followers, CAMP_FOLLOWERS_MAX),
		eats:      !unliving,
		messKit:   read.messKit,
		// Healing is the pick unless there is nothing to heal and a debility to clear instead.
		benefit:   !hurt && activeDebilityKeys.length ? CAMP_BENEFIT.DEBILITY : CAMP_BENEFIT.HP,
		debility:  activeDebilityKeys[0] ?? "",
		bedroll:   read.bedroll,
		peaceful:  false,
		ready:     false,
		vitals:    read,
		plan:      null,
		settledAt: 0,
		settleAsk: "",
		applied:   false,
		leftCamps: readLeftCamps(leftCamps),
	};
}

/** A list of broken-up camp ids in one dependable shape: strings, no repeats, the latest CAMP_LEFT_MAX. */
function readLeftCamps(raw) {
	const ids = (Array.isArray(raw) ? raw : []).filter(Boolean).map(String);
	return [...new Set(ids)].slice(-CAMP_LEFT_MAX);
}

/**
 * Where the camp `campId`, hosted by `hostId`, stands, read off its host's record.
 *
 * The host is the only authority on this. A member's record names the camp they joined, and that
 * stays true after the camp is long over, so asking the member would keep a broken-up camp alive.
 *
 * A host who walked over to another fire replaced the record this camp was read from, and named
 * this camp among the ones they left: it broke up, it did not simply end.
 */
export function campState(hostRecord, { campId, hostId }, now = 0) {
	if (hostRecord?.leftCamps?.includes(campId)) return CAMP_STATE.CANCELLED;
	if (!hostRecord || hostRecord.id !== campId || hostRecord.host !== hostId) return CAMP_STATE.GONE;
	if (hostRecord.status === CAMP_STATUS.OPEN) {
		return now - hostRecord.openedAt > CAMP_STALE_MS ? CAMP_STATE.COLD : CAMP_STATE.OPEN;
	}
	return hostRecord.status ?? CAMP_STATE.GONE;
}

/** Host first, then in the order people sat down, so the rows (and the trimming) never reshuffle. */
function byJoinOrder(a, b) {
	return (b.isHost - a.isHost) || (a.record.joinedAt - b.record.joinedAt)
		|| String(a.name).localeCompare(String(b.name));
}

/** Whether this member is one of the mouths the meal has to feed. */
export function eatsTonight(member) {
	return member.record.eats && !member.unliving;
}

/** What a member has offered, clamped purse by purse to what that purse still holds. */
function offerFrom(member) {
	const { eligible } = supplyPursesFor(member.resources, SUPPLY_PURPOSE.CAMP);
	const purses = eligible.map(p => ({
		slug: p.slug, label: p.label, remaining: p.remaining,
		n: Math.min(member.record.offer[p.slug] ?? 0, p.remaining),
	}));
	return { actorId: member.actorId, purses, total: purses.reduce((sum, p) => sum + p.n, 0) };
}

/**
 * What each offer actually pays once the bill is met.
 *
 * Two people reaching for the same last use at once is ordinary, and so is a bill that shrinks
 * after the offers are in (somebody decides to go without), so offers can come to more than the
 * camp eats. Only the bill is spent. The latest to sit down gives back first, and within one pack
 * the larder goes back before the printed supplies rows: the same order a spend drains them, run
 * backwards, so what stays spent is what a single character's spend would have taken.
 */
function trimToBill(offers, bill) {
	let excess = Math.max(0, offers.reduce((sum, o) => sum + o.total, 0) - bill);
	const spends = offers.map(o => ({
		actorId: o.actorId,
		spend:   o.purses.filter(p => p.n > 0).map(p => ({ slug: p.slug, label: p.label, n: p.n })),
	}));
	for (let i = spends.length - 1; i >= 0 && excess > 0; i--) {
		const spend = spends[i].spend;
		for (let j = spend.length - 1; j >= 0 && excess > 0; j--) {
			const back = Math.min(spend[j].n, excess);
			spend[j].n -= back;
			excess -= back;
		}
		spends[i].spend = spend.filter(s => s.n > 0);
	}
	for (const s of spends) s.total = s.spend.reduce((sum, x) => sum + x.n, 0);
	return spends;
}

/**
 * @typedef {object} CampMember  One character at the fire, as camp-store.js reads them.
 * @property {string}  actorId
 * @property {string}  name
 * @property {boolean} isHost
 * @property {object}  record     readCampRecord's shape
 * @property {object}  resources  the character's inventory.resources, read live
 * @property {number}  hpValue    read live
 * @property {number}  maxHp      the COMPUTED max
 * @property {Array<{key: string, name: string}>} activeDebilities  read live
 * @property {boolean} unliving
 */

/**
 * The camp's whole account: who eats, what that costs, what has been offered, and whether it can
 * be settled.
 *
 * A camp that cannot feed everyone eating tonight does not settle. That is not the old solo
 * dialog's refusal to let a hungry camp happen: going hungry is still one tick away on any row.
 * It is the move asking who. "Each member of the party must consume 1 use", and deprivation
 * (p.335) lands on a person, so the button waits until the table has said which one.
 *
 * @param {CampMember[]} members
 */
export function campLedger(members = []) {
	const rows    = [...members].sort(byJoinOrder);
	const cooks   = rows.filter(m => m.record.messKit && m.record.vitals.messKit);
	const messKit = cooks.length > 0;
	const mouths  = rows.reduce((sum, m) => sum + (eatsTonight(m) ? 1 : 0) + m.record.followers, 0);
	const bill    = campUsesNeeded(mouths, messKit);
	const offers  = rows.map(offerFrom);
	const offered = offers.reduce((sum, o) => sum + o.total, 0);
	const short   = Math.max(0, bill - offered);
	return {
		rows,
		offers,
		spends:    trimToBill(offers, bill),
		messKit,
		cooks:     cooks.map(m => m.name),
		mouths,
		bill,
		offered,
		short,
		over:      Math.max(0, offered - bill),
		canSettle: rows.length > 0 && short === 0,
		// The host settles the camp, so the host is never waited on.
		waitingOn: rows.filter(m => !m.isHost && !m.record.ready).map(m => m.name),
	};
}

/** Where a member sits in the ledger's rows, or -1. */
function rowOf(ledger, member) {
	return ledger.rows.findIndex(m => m.actorId === member.actorId);
}

/**
 * A member's offer from one purse after a press of + or -, clamped to what the purse holds so a
 * stepper can never promise food that is not in the pack.
 */
export function offerStep(member, slug, delta) {
	const purse   = supplyPursesFor(member.resources, SUPPLY_PURPOSE.CAMP).eligible.find(p => p.slug === slug);
	const holds   = purse?.remaining ?? 0;
	const current = Math.min(member.record.offer[slug] ?? 0, holds);
	return Math.max(0, Math.min(holds, current + Math.trunc(Number(delta) || 0)));
}

/** How many more uses this member could still offer on top of what they already have. */
export function spareUses(ledger, member) {
	const at = rowOf(ledger, member);
	if (at < 0) return 0;
	return ledger.offers[at].purses.reduce((sum, p) => sum + p.remaining - p.n, 0);
}

/**
 * The offer that covers whatever the camp is still short, out of this member's pack, draining it
 * in the usual order. Covers as much as the pack can when it cannot cover all of it.
 */
export function coverTheRest(ledger, member) {
	const next = { ...member.record.offer };
	const at   = rowOf(ledger, member);
	if (at < 0) return next;
	let need = ledger.short;
	for (const purse of ledger.offers[at].purses) {
		if (need <= 0) break;
		const add = Math.min(need, purse.remaining - purse.n);
		if (add <= 0) continue;
		next[purse.slug] = purse.n + add;
		need -= add;
	}
	return next;
}

/** Whether this member eats, sleeps, and so takes a pick from the night. */
export function restsTonight(member, ledger) {
	return ledger.short === 0 && eatsTonight(member) && member.record.benefit !== CAMP_BENEFIT.NONE;
}

/** Whether a bedroll's "recover 1d6 extra HP when you Make Camp" is owed to this member. */
export function rollsBedroll(member, ledger) {
	return restsTonight(member, ledger) && member.record.bedroll && member.record.vitals.bedroll;
}

/** HP after healing `gain`, capped at `max`. */
export function healTo(hp, gain, max) {
	// Never below where they started: a max that could not be read (0) heals nothing rather than
	// "capping" somebody down to it.
	return Math.max(hp, Math.min(hp + count(gain), count(max)));
}

/**
 * The debility a member's night clears when that is their pick: the one their row chose while it is
 * still marked, or else the first one that is, or null when nothing is marked.
 *
 * A row's choice can name nothing marked: somebody who sat down with no debility and has gained one
 * since, or whose chosen one Recover cleared while another stays marked. The window shows that row
 * the first marked one, selected; the plan clears this same one, so what the table read at the fire
 * is what settling does.
 */
export function debilityToClear(member) {
	const marked = member?.activeDebilities ?? [];
	return marked.find(d => d.key === member.record.debility) ?? marked[0] ?? null;
}

/**
 * Freeze the camp into the plan every share is paid from.
 *
 * Frozen, because the shares are written on several machines: each character's own player lands
 * their own part. If each of those clients worked the camp out again from the flags it could see,
 * an offer changed a heartbeat after the host pressed the button would settle one pack against
 * one version of the bill and the next pack against another. The plan is the one version.
 *
 * @param {object} ledger  campLedger's result
 * @param {object} [o]
 * @param {Object<string, number>} [o.bedrolls]  each bedroll's 1d6, by actor id
 */
export function freezeCampPlan(ledger, { bedrolls = {} } = {}) {
	return ledger.rows.map((m, at) => {
		const rests   = restsTonight(m, ledger);
		const cleared = rests && m.record.benefit === CAMP_BENEFIT.DEBILITY ? debilityToClear(m) : null;
		// With no debility marked any more there is nothing to pick but the HP, and the night still
		// buys a pick.
		const benefit  = !rests ? null : cleared ? CAMP_BENEFIT.DEBILITY : CAMP_BENEFIT.HP;
		const maxHp    = count(m.maxHp);
		const halfMax  = Math.ceil(maxHp / 2);
		const bedroll  = rollsBedroll(m, ledger) ? count(bedrolls[m.actorId]) : 0;
		const hpBefore = count(m.hpValue);
		const picked   = benefit === CAMP_BENEFIT.HP ? healTo(hpBefore, halfMax, maxHp) : hpBefore;
		return {
			actorId:  m.actorId,
			name:     m.name,
			spend:    ledger.spends[at].spend,
			unliving: m.unliving,
			eats:     eatsTonight(m),
			rests,
			benefit,
			debility: cleared ? { key: cleared.key, name: cleared.name } : null,
			maxHp,
			halfMax,
			bedroll,
			hpBefore,
			hpAfterPick: picked,
			hpAfter:  healTo(picked, bedroll, maxHp),
			peaceful: rests && m.record.peaceful,
		};
	});
}

/**
 * One character's share of a settled camp, as a single update: the food out of their pack, then
 * the night's pick, the bedroll and the peaceful night, and the mark that says it is done.
 *
 * What is carried and the current HP are read LIVE, by the caller, at the moment of writing, and
 * what lands is still an absolute count and an absolute HP. So the plan says how many uses and how
 * much healing, never "leave 2 in the pack" or "set HP to 12": a Forage payout or a blow landing
 * between the button and this write would otherwise be silently undone.
 *
 * @param {object} entry  one freezeCampPlan entry
 * @param {object} live
 * @param {object} live.resources  the character's inventory.resources now
 * @param {number} live.hpValue    their HP now
 * @param {(slug: string, count: number) => object} live.resourceData  StonetopCharacter#inventoryResourceData
 * @param {(source: string) => object} live.advantageData             StonetopCharacter#heldAdvantageData
 * @returns {{update: object, shortfall: number}}  `shortfall` counts uses the pack no longer had
 */
export function campShareUpdate(entry, { resources = {}, hpValue = 0, resourceData, advantageData }) {
	const update = {};
	let shortfall = 0;
	for (const s of entry.spend ?? []) {
		const have = count(resources?.[s.slug]);
		const paid = Math.min(have, count(s.n));
		shortfall += count(s.n) - paid;
		Object.assign(update, resourceData(s.slug, have - paid));
	}
	if (entry.rests) {
		const before = count(hpValue);
		let hp = before;
		if (entry.benefit === CAMP_BENEFIT.DEBILITY && entry.debility?.key) {
			update[`system.attributes.debilities.options.${entry.debility.key}.value`] = false;
		} else if (entry.benefit === CAMP_BENEFIT.HP) {
			hp = healTo(hp, entry.halfMax, entry.maxHp);
		}
		// The bedroll's text is "extra HP when you Make Camp", not "instead of", so it stacks on
		// whichever pick was taken.
		if (entry.bedroll) hp = healTo(hp, entry.bedroll, entry.maxHp);
		if (hp !== before) update["system.attributes.hp.value"] = hp;
		// Held, not the sticky roll-modifier selector: "advantage on your next roll" is a promise
		// about one roll. See StonetopCharacter#heldAdvantage.
		if (entry.peaceful) Object.assign(update, advantageData(PEACEFUL_NIGHT));
	}
	update[`flags.${SYSTEM_ID}.${CAMP_FLAG}.applied`] = true;
	return { update, shortfall };
}
