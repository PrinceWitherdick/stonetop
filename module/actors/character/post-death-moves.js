// ── The moves of a post-death insert's Consequences and Marks ──────────────
// Most Consequences and Marks are prose: a Ghost who takes QUARRY has nothing to press. A few of them
// ROLL or HOLD something, and those are moves in all but name: Poltergeist's Fury, spent on a +DEX or
// +INT roll; Bodysnatcher's +CHA; a Thrall's Red Wrath and Torment's Blessing, rolled +Favor spent.
// Each of those ships as a real move Item beside the insert's own (packs/src/stonetop-items/
// post-death-moves/<insert>/), naming the lore option it belongs to in `system.loreOption`, and the
// character owns it exactly while that option is marked. It then lands in the Post-Death tab's move
// group like the insert's own moves, with the same card, dice, track and hotbar drag.
//
// WHO KEEPS IT IN STEP. A Consequence is marked from half a dozen places: Death's Door's choices step,
// the Undeath walkthrough's one folded write, the tab's edit-mode boxes, the Purpose buttons. Rather than
// teach each of them, a lore write is watched (registerPostDeathMoveHooks) and the moves re-synced on the
// ONE client that made it, as vitals-mirror.js keeps the stored armor: that client had the right to make
// the change, so it has the right to follow it. The sync itself is StonetopCharacter#syncPostDeathLoreMoves,
// queued behind any insert swap, and it is idempotent: however often it runs, one copy per marked option.
//
// And one Consequence that is not a move at all but a follower: Home to Vermin's "Treat them as
// followers". Marking it offers to put them on the Followers tab (offerLoreFollowers), once.

import { SYSTEM_ID } from "../../system-id.js";
import { isPrimaryGM } from "../../utils/primary-gm.js";
import { confirmOutcome } from "../../utils/ask-with-buttons.js";
import { localize, format } from "../../utils/i18n.js";
import { escHtml } from "../../utils/strings.js";
import { buildCustomFollower, nextFollowerOrder } from "../../data/follower-build.js";
import { readableFlags } from "./StonetopFlags.js";

/**
 * What to create and delete so a character owns the move of every marked Consequence or Mark of their
 * insert and no other. PURE.
 *
 * @param {object} p
 * @param {Array<{name: string, loreOption?: string|null}>} p.entries  the worn insert's moves
 *   (MoveDefinition), the insert's own among them; only those naming a `loreOption` are this sync's
 * @param {Array<{_id: string, system?: object}>} p.owned  the character's post-death move Items
 * @param {(key: string) => boolean} p.isMarked  whether a lore option ("consequences:poltergeist") is marked
 * @returns {{create: object[], remove: string[]}}  Item data to create, Item ids to delete
 */
export function planLoreMoveSync({ entries = [], owned = [], isMarked }) {
	const wanted = entries.filter(m => m?.loreOption && isMarked(m.loreOption));
	const wantedKeys = new Set(wanted.map(m => m.loreOption));
	const remove = [];
	const held = new Set();
	for (const item of owned) {
		const key = item?.system?.loreOption;
		// The insert's own moves (Unliving, Tethered) carry no lore option and are not this sync's to touch.
		if (!key) continue;
		// A second copy of one option goes too: two clients that marked it a moment apart both synced.
		if (!wantedKeys.has(key) || held.has(key)) remove.push(item._id ?? item.id);
		else held.add(key);
	}
	const create = wanted.filter(m => !held.has(m.loreOption)).map(loreMoveItemData);
	return { create, remove };
}

/**
 * The Item a lore option's move is created as: the pack move whole (its roll, its outcomes, its track),
 * as the post-death move it is, with the lore option it belongs to so the sync can find it again.
 */
export function loreMoveItemData(def) {
	const res = def.resource;
	return {
		name: def.name,
		type: "move",
		system: {
			moveType:    "post-death",
			rollType:    def.rollType ?? "",
			description: def.description ?? "",
			loreOption:  def.loreOption,
			...(def.moveResults ? { moveResults: def.moveResults } : {}),
			// Written back out of the ResourceDef as the plain record a pack move stores, so the owned
			// copy's track is the pack's (Poltergeist's four Fury and its "Spend 1 to" hover).
			...(res?.max ? { resource: {
				max: res.max,
				...(res.title ? { title: res.title } : {}),
				...(res.labels?.length ? { labels: [...res.labels] } : {}),
				...(res.spendOptions?.length ? { spendOptions: [...res.spendOptions] } : {}),
			} } : {}),
		},
	};
}

// ── Home to Vermin ─────────────────────────────────────────────────────────

/**
 * "Bugs, moths, and other vermin have taken up residence in your corpse. They will do you favors if you
 * ask. Treat them as followers: group, tiny, gross, meek, stealthy; HP 1 each; Instinct to get
 * distracted; Cost: genuine affection." (Revenant, Book I p.151.) The follower card that sentence
 * describes, keyed by the lore option that grants it. `sourceUuid` is how a card already made is found
 * again, as an arcanum's summons are (data/arcana-summons.js).
 */
export const LORE_FOLLOWERS = {
	"consequences:home-to-vermin": {
		sourceUuid: "post-death:home-to-vermin",
		nameKey:    "stonetop.postDeathMoves.vermin.name",
		follower: {
			typeLabel:    "vermin",
			portraitIcon: "fas fa-bug",
			isGroup:      true,
			tags:         ["tiny", "gross", "meek", "stealthy"],
			hp:           1,
			instinct:     "to get distracted",
			cost:         "genuine affection",
		},
	},
};

/** The key in the insert's flags recording which lore followers have been offered already. */
const OFFERED_FLAG = "postDeathInsert.offered";

/** Whether this character already has the follower card `sourceUuid` names. */
function hasLoreFollower(actor, sourceUuid) {
	return Object.values(readableFlags(actor).customFollowers ?? {}).some(f => f?.sourceUuid === sourceUuid);
}

/**
 * Offer the follower each marked lore option describes (Home to Vermin), on this client.
 *
 * ONCE PER MARKING. The offer is recorded when it is made, whichever way it is answered, so the lore
 * writes that follow (another Consequence, the Favor track) do not ask again; the record is dropped
 * when the option is unmarked, so a Consequence cleared and later taken again asks afresh. A character
 * who already has the card is never asked.
 *
 * @param {Actor} actor
 * @param {object} [deps]
 * @param {(o: object) => Promise<boolean|null>} [deps.confirm]  confirmOutcome, for a test
 * @returns {Promise<string[]>}  the lore options whose follower was added
 */
export async function offerLoreFollowers(actor, { confirm = confirmOutcome } = {}) {
	if (actor?.type !== "character" || !actor.isOwner) return [];
	const flags = readableFlags(actor);
	const counts = flags.postDeathLore?.counts ?? {};
	const insert = flags.postDeathInsert?.slug ?? null;
	const stored = flags.postDeathInsert?.offered;
	const offered = new Set(Array.isArray(stored) ? stored : []);
	const before = offered.size;
	const toAsk = [];
	for (const [key, spec] of Object.entries(LORE_FOLLOWERS)) {
		const marked = !!insert && Number(counts[key]) > 0;
		if (!marked) { offered.delete(key); continue; }
		if (offered.has(key) || hasLoreFollower(actor, spec.sourceUuid)) continue;
		offered.add(key);
		toAsk.push([key, spec]);
	}
	// Recorded BEFORE asking: the window waits on a person, and every lore write in the meantime would
	// otherwise find the offer still unmade and open a second one.
	if (offered.size !== before || toAsk.length) await actor.setFlag(SYSTEM_ID, OFFERED_FLAG, [...offered]);

	const added = [];
	for (const [key, spec] of toAsk) {
		const name = localize(spec.nameKey);
		const yes = await confirm({
			title:   localize("stonetop.postDeathMoves.vermin.title"),
			content: `<p>${escHtml(format("stonetop.postDeathMoves.vermin.ask", { name: actor.name ?? "" }))}</p>`,
			yes:     { label: localize("stonetop.postDeathMoves.vermin.yes"), icon: "fa-bug" },
			no:      { label: localize("stonetop.postDeathMoves.vermin.no") },
			defaultYes: true,
		});
		if (!yes || hasLoreFollower(actor, spec.sourceUuid)) continue;
		const existing = readableFlags(actor).customFollowers ?? {};
		const id = globalThis.foundry?.utils?.randomID?.(16) ?? `vermin${Date.now()}`;
		await actor.update({
			[`flags.${SYSTEM_ID}.customFollowers.${id}`]: {
				...buildCustomFollower({ ...spec.follower, name, sourceUuid: spec.sourceUuid }),
				order: nextFollowerOrder(existing),
			},
		});
		added.push(key);
	}
	return added;
}

// ── The hooks ──────────────────────────────────────────────────────────────

// The insert's own flags and its lore: the slug a swap moves, and the counts a mark or an unmark writes.
const LORE_INPUT = /^flags\.[^.]+\.(postDeathLore|postDeathInsert)(\.|$)/;
const SETTLE_MS = 250;
const pending = new Map();

/** Whether an actor update could change which lore moves a character should own. */
export function mayMoveLoreMoves(changed) {
	const flat = globalThis.foundry?.utils?.flattenObject?.(changed ?? {}) ?? {};
	return Object.keys(flat).some(key => LORE_INPUT.test(key));
}

function isWorldCharacter(actor) {
	return actor?.type === "character" && !actor.pack && !actor.isToken;
}

async function settle(actor, { offer = true } = {}) {
	try {
		await actor.typedActor?.syncPostDeathLoreMoves?.();
		if (offer) await offerLoreFollowers(actor);
	} catch (err) {
		console.error(`Stonetop | could not bring ${actor.name}'s post-death moves into step`, err);
	}
}

/** Re-sync once the lore writes arriving now have settled (a swap is a prune, a delete and a slug). */
function schedule(actor) {
	clearTimeout(pending.get(actor.id));
	pending.set(actor.id, setTimeout(() => {
		pending.delete(actor.id);
		settle(actor);
	}, SETTLE_MS));
}

function onUpdateActor(actor, changed, _options, userId) {
	if (!isWorldCharacter(actor) || userId !== globalThis.game?.user?.id || !actor.isOwner) return;
	if (mayMoveLoreMoves(changed)) schedule(actor);
}

/** Registered once, at module scope in stonetop.js. */
export function registerPostDeathMoveHooks() {
	Hooks.on("updateActor", onUpdateActor);
	// A character who marked one of these before the moves shipped: the primary GM settles every
	// character wearing an insert once on load, one at a time. Most need nothing, which costs a pack read
	// (cached per insert) and no write. No follower offers here: a load is nobody's marking.
	Hooks.once("ready", async () => {
		if (!isPrimaryGM()) return;
		for (const actor of globalThis.game?.actors ?? []) {
			if (!isWorldCharacter(actor) || !actor.isOwner || !readableFlags(actor).postDeathInsert?.slug) continue;
			await settle(actor, { offer: false });
		}
	});
}
