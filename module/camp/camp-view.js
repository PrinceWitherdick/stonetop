import { escHtml, joinNames } from "../utils/strings.js";
import {
	CAMP_BENEFIT, CAMP_FOLLOWERS_MAX, CAMP_STATE, SETTLE_REFUSAL, debilityToClear, eatsTonight, healTo, spareUses,
} from "./camp-rules.js";

/**
 * WHAT THE CAMP SAYS: the shared window's rows, the card that invites the table to the fire, and
 * the card that says how the night went. Pure, like camp-rules.js, so every sentence a player
 * reads can be tested without Foundry.
 *
 * The sentences name characters and never give them pronouns. A row's name heads it, and what is
 * said under the name reads the same whoever is behind it.
 */

function uses(n) {
	return n === 1 ? "use" : "uses";
}

function plural(n, one, many) {
	return n === 1 ? one : many;
}

function campOf(hostName) {
	return hostName ? `${hostName}'s camp` : "This camp";
}

/** "2 uses of supplies, 1 of provisions": what one pack gives. */
function shareLine(purses) {
	return purses
		.filter(p => p.n > 0)
		.map((p, i) => `${p.n} ${i === 0 ? `${uses(p.n)} of ` : "of "}${p.label.toLowerCase()}`)
		.join(", ");
}

// ── The cards ────────────────────────────────────────────────────────────────

/**
 * The body of the card a new camp posts. The button is stored in the card so it shows the moment
 * the card lands; camp-flow.js#wireCampCard decides at every render whether it still should.
 *
 * The slot's marker carries a VALUE. Foundry's HTML sanitizer drops a valueless attribute unless
 * it is a boolean it knows, and a bare `data-camp-join` would reach the log as a plain div the
 * wiring could never find.
 */
export function campJoinCardBody(hostName) {
	return `<div class="card-content stonetop-camp-card">
		<p class="stonetop-camp-card-text"><strong>${escHtml(hostName)}</strong> is making camp. Everyone settling in for the night can share food from their pack and take their rest.</p>
		<div class="card-buttons stonetop-card-buttons stonetop-camp-card-actions" data-camp-join="1">
			<button type="button" class="stonetop-camp-join"><i class="fas fa-campground"></i> Join the camp</button>
		</div>
	</div>`;
}

/** What a join card says in place of its button, once its camp is over. */
export function campCardClosedText(state, hostName) {
	const camp = campOf(hostName);
	switch (state) {
		case CAMP_STATE.SETTLED:   return `${camp} ate and settled in for the night.`;
		case CAMP_STATE.CANCELLED: return `${camp} broke up before anyone ate.`;
		case CAMP_STATE.COLD:      return `${camp} was left without anyone eating.`;
		default:                   return `${camp} is over.`;
	}
}

/**
 * What an open camp window says as it closes because the camp ended, or null to close quietly. A
 * settled camp closes quietly: its card has just said how the night went, and saying it twice
 * would bury that under a toast.
 */
export function closedCampNotice(state, hostName) {
	if (state === CAMP_STATE.SETTLED) return null;
	if (state === CAMP_STATE.CANCELLED) return `${campOf(hostName)} broke up. Nothing was eaten or spent.`;
	return `${campOf(hostName)} is over.`;
}

const SETTLE_REFUSAL_TEXT = {
	[SETTLE_REFUSAL.CLOSED]:    "That camp is no longer open.",
	[SETTLE_REFUSAL.NOT_YOURS]: "Only the player whose character opened the camp, or the GM, can make camp.",
	[SETTLE_REFUSAL.SHORT]:     "Not everyone eating has food yet. Share more, or mark who goes without.",
};

/** Why pressing Make Camp did nothing, in words a player can act on. */
export function settleRefusalText(reason) {
	return SETTLE_REFUSAL_TEXT[reason] ?? "The camp could not be made.";
}

function mealLine({ mouths, bill, messKit, cooks }) {
	if (!mouths) return "Nobody needed feeding.";
	return `${mouths} fed on ${bill} ${uses(bill)} of food${messKit ? `, cooked in ${cooks[0]}'s mess kit` : ""}.`;
}

function outcomeLine(entry) {
	if (entry.unliving) return "Needs no food or sleep, and took nothing from the night.";
	if (!entry.eats) return "Went without food, so took no pick tonight.";
	if (!entry.rests) return "Ate, but got no real sleep, so took no pick tonight.";
	const parts = [];
	if (entry.benefit === CAMP_BENEFIT.DEBILITY) parts.push(`Cleared ${entry.debility?.name ?? "a debility"}`);
	else if (entry.hpAfterPick > entry.hpBefore) parts.push(`HP ${entry.hpBefore} → ${entry.hpAfterPick} (half max)`);
	else parts.push(`HP already full at ${entry.hpBefore}`);
	if (entry.bedroll) {
		parts.push(entry.hpAfter > entry.hpAfterPick
			? `bedroll rolled ${entry.bedroll}, HP ${entry.hpAfterPick} → ${entry.hpAfter}`
			: `bedroll rolled ${entry.bedroll}, but HP was already full`);
	}
	if (entry.peaceful) parts.push("a peaceful night, so advantage is held for the next roll");
	return `${parts.join("; ")}.`;
}

/**
 * The settled camp's card, as label and value rows: the meal, whose food paid for it, then what
 * the night bought each person. Told from the plan, so it says what every share was told to do.
 */
export function campSummaryRows(ledger, plan) {
	const rows = [{ label: "The meal", value: mealLine(ledger) }];
	for (const entry of plan) {
		const shared = shareLine(entry.spend ?? []);
		if (shared) rows.push({ label: `From ${entry.name}'s pack`, value: shared });
	}
	for (const entry of plan) rows.push({ label: entry.name, value: outcomeLine(entry) });
	return rows;
}

// ── The window ───────────────────────────────────────────────────────────────

function mealView(ledger) {
	const { mouths, bill, offered, short, over, messKit, cooks } = ledger;
	const atFire    = ledger.rows.filter(eatsTonight).length;
	const followers = mouths - atFire;
	const followerWord = plural(followers, "follower", "followers");
	let mouthsText;
	if (!mouths) mouthsText = "Nobody here needs feeding.";
	else if (!followers) mouthsText = `${mouths} to feed.`;
	else if (!atFire) mouthsText = `${mouths} ${followerWord} to feed.`;
	else mouthsText = `${mouths} to feed: ${atFire} at the fire and ${followers} ${followerWord}.`;

	let statusText = "";
	if (short) statusText = `${short} more ${uses(short)} needed. Share more food, or mark who goes without.`;
	else if (over) statusText = `Paid for, with ${over} to spare. Only what the meal needs is eaten, and the rest stays in the packs.`;
	else if (mouths) statusText = "Paid for.";

	return {
		mouthsText,
		cookText: !mouths ? "" : messKit
			? `${cooks[0]}'s mess kit stretches each use to feed 4.`
			: "With no mess kit, each use feeds 1.",
		costText: !mouths ? "" : `The meal costs ${bill} ${uses(bill)} of food, and ${offered} ${plural(offered, "has", "have")} been shared.`,
		statusText,
		isShort: short > 0,
		isPaid:  mouths > 0 && short === 0,
	};
}

/** What a row the reader cannot change says instead of its controls. */
function rowSentences(member, offer, { eats, benefit, clearing, hpAfter }) {
	const { record } = member;
	const says = [offer.total ? `Sharing ${shareLine(offer.purses)}.` : "Sharing no food yet."];
	const others = record.followers
		? `${record.followers} ${plural(record.followers, "follower eats", "followers eat")}`
		: "";
	if (member.unliving) says.push(`Needs no food or sleep (Unliving)${others ? `, but ${others}` : ""}.`);
	else if (!record.eats) says.push(`Going without food tonight${others ? `, though ${others}` : ""}.`);
	else says.push(others ? `Eating tonight, and ${others} too.` : "Eating tonight.");
	if (record.messKit && record.vitals.messKit) says.push("Cooking with a mess kit.");
	if (!eats) return says;
	if (benefit === CAMP_BENEFIT.NONE) {
		says.push("Getting no real sleep, so no pick.");
		return says;
	}
	says.push(benefit === CAMP_BENEFIT.DEBILITY
		? `Clearing ${clearing?.name ?? "a debility"}.`
		: `Regaining HP: ${member.hpValue} → ${hpAfter}.`);
	if (record.bedroll && record.vitals.bedroll) says.push("Sleeping in a bedroll for 1d6 extra HP.");
	if (record.peaceful) says.push("Found the rest peaceful.");
	return says;
}

function rowView(member, at, ledger, { canEdit, isMine }) {
	const { record } = member;
	const offer   = ledger.offers[at];
	const kept    = ledger.spends[at];
	const eats    = eatsTonight(member);
	const marked  = member.activeDebilities;
	const hpAfter = healTo(member.hpValue, Math.ceil(member.maxHp / 2), member.maxHp);
	// A debility pick with nothing marked any more has only healing left to mean.
	const benefit  = record.benefit === CAMP_BENEFIT.DEBILITY && !marked.length ? CAMP_BENEFIT.HP : record.benefit;
	const clearing = debilityToClear(member);
	const spare    = spareUses(ledger, member);
	const returned = offer.total - kept.total;
	return {
		actorId:    member.actorId,
		name:       member.name,
		img:        member.img ?? "",
		isMine,
		canEdit,
		unliving:   member.unliving,
		stateText:  member.isHost ? "Making camp" : record.ready ? "Ready" : "Still choosing",
		stateClass: member.isHost ? "is-host" : record.ready ? "is-ready" : "is-choosing",
		purses: offer.purses.map(p => ({
			slug:      p.slug,
			label:     p.label,
			remaining: p.remaining,
			n:         p.n,
			canTake:   p.n > 0,
			// Once the meal is paid for, more food is only more to give back.
			canAdd:    p.n < p.remaining && ledger.short > 0,
		})),
		cover: {
			show:  ledger.short > 0 && spare > 0,
			label: spare >= ledger.short
				? `Cover the last ${ledger.short} ${uses(ledger.short)}`
				: `Share the ${spare} ${uses(spare)} still in this pack`,
		},
		givesBackText: returned > 0
			? `${returned} ${uses(returned)} shared here ${plural(returned, "stays", "stay")} in the pack: the meal is already paid for.`
			: "",
		eats:            record.eats,
		followers:       record.followers,
		canTakeFollower: record.followers > 0,
		canAddFollower:  record.followers < CAMP_FOLLOWERS_MAX,
		messKit:         { carries: record.vitals.messKit, uses: record.messKit },
		night: {
			show:          eats,
			radioName:     `campBenefit-${member.actorId}`,
			hp:            benefit === CAMP_BENEFIT.HP,
			debility:      benefit === CAMP_BENEFIT.DEBILITY,
			none:          benefit === CAMP_BENEFIT.NONE,
			hpBefore:      member.hpValue,
			hpAfter,
			hasDebilities: marked.length > 0,
			debilities:    marked.map(d => ({ key: d.key, name: d.name, selected: d.key === clearing?.key })),
		},
		bedroll:   { carries: record.vitals.bedroll, uses: record.bedroll },
		peaceful:  record.peaceful,
		ready:     record.ready,
		// The foot holds the ready tick and Leave. The host settles the camp, so the host has no
		// ready tick to give and cannot walk out of it (breaking it up is the footer's).
		showFoot:  !member.isHost,
		says:      canEdit ? [] : rowSentences(member, offer, { eats, benefit, clearing, hpAfter }),
	};
}

function navView({ isOpen, manages, ledger, hostName }) {
	if (!isOpen) return { manages, canSettle: false, hint: "" };
	if (!manages) {
		return { manages, canSettle: false, hint: `${hostName || "Whoever opened the camp"} makes camp once everyone is ready.` };
	}
	let hint = "Everyone is ready.";
	if (!ledger.canSettle) hint = "Make Camp waits until everyone eating has food.";
	else if (ledger.waitingOn.length) hint = `Still choosing: ${joinNames(ledger.waitingOn)}.`;
	return { manages, canSettle: ledger.canSettle, hint };
}

/**
 * Everything the camp window draws, for one reader.
 *
 * @param {object}   o
 * @param {string}   o.state     CAMP_STATE
 * @param {string}   o.hostName
 * @param {object}   o.ledger    camp-rules.js#campLedger
 * @param {boolean}  o.manages   the reader can settle the camp or break it up
 * @param {string[]} o.editable  actor ids of the rows the reader can change
 * @param {string[]} o.mine      actor ids of the characters the reader plays
 * @param {Array<{id: string, name: string}>} o.addable  who a GM could still bring to the fire
 */
export function campWindowView({ state, hostName = "", ledger, manages = false, editable = [], mine = [], addable = [] }) {
	const isOpen  = state === CAMP_STATE.OPEN;
	const canEdit = new Set(editable);
	const plays   = new Set(mine);
	return {
		isOpen,
		closedText: isOpen ? "" : campCardClosedText(state, hostName),
		title:      hostName ? `${hostName}'s camp` : "Make Camp",
		meal:       mealView(ledger),
		rows:       ledger.rows.map((member, at) => rowView(member, at, ledger, {
			canEdit: isOpen && canEdit.has(member.actorId),
			isMine:  plays.has(member.actorId),
		})),
		add:        { show: isOpen && addable.length > 0, options: addable },
		nav:        navView({ isOpen, manages, ledger, hostName }),
	};
}
