// ── The buttons on a post-death move's card, and on the cards they post ─────
// A post-death move whose rule is a COST ("lose 1d4 HP"), a HOLD (Poltergeist's Fury) or a roll with
// a number of its own (Red Wrath's "roll +Favor spent") gets buttons on its move card that do it
// (move-group.hbs, `stonetop.moveActions`), and the roll cards those post get buttons for what their
// tiers owe: your damage, a move's printed damage, the HP a 7-9 costs. The move Items themselves, and
// why a Consequence or Mark becomes one, are post-death-moves.js.
//
// HP LOST IS NOT DAMAGE. Nothing stands between a Ghost and the price of their own anger, so the total
// comes off through the plain HP writer (utils/damage.js#applyDamageToActor, as a Vessel's Stock does,
// provisions.js#loseHpForStock), attributed to the move for the ledger. That write is also what a fall to
// 0 HP is noticed on, so the insert's own 0-HP move follows as it does after any other blow.

import { SYSTEM_ID } from "../../system-id.js";
import { localize, format } from "../../utils/i18n.js";
import { escHtml, stripHtmlToText } from "../../utils/strings.js";
import { applyDamageToActor, readOptionDamage } from "../../utils/damage.js";
import { askWithButtons } from "../../utils/ask-with-buttons.js";
import { firstOptionList, postMoveNote, canRewriteCard } from "../../utils/chat.js";
import { moveCardBody } from "../../utils/move-tiers.js";
import { withCardLatch } from "../../utils/card-latch.js";
import { belongsToMessage } from "../../utils/picked-option-button.js";
import { speakerActor } from "../../utils/speaker-actor.js";
import { rollDamageAt, rollOptionDamage, pcDamageDie } from "../../combat/attack-flow.js";
import { haulCard } from "./provisions.js";
import { heldOnTrack, takeBackHeld } from "./MoveResources.js";
import { isPostDeathMove } from "./post-death-moves.js";

export const POLTERGEIST        = "Poltergeist";
export const BODYSNATCHER       = "Bodysnatcher";
export const RED_WRATH          = "Red Wrath";
export const TORMENTS_BLESSING  = "Torment's Blessing";
export const DISEMBODIED        = "Disembodied";
export const IMPLACABLE         = "Implacable";

const KEY = "stonetop.postDeathMoves";

/** Poltergeist's Fury track, when the move has one: `{held, max}`. Its max is the owned copy's own. */
function furyTrack(actor) {
	const item = postDeathMove(actor, POLTERGEIST);
	const max = Math.trunc(Number(item?.system?.resource?.max) || 0);
	if (!max) return null;
	return { held: heldOnTrack(actor.typedActor?.moveResources, POLTERGEIST, max), max };
}

/** The character's post-death move of that name, or null. */
function postDeathMove(actor, name) {
	return (actor?.items ?? []).find(i => isPostDeathMove(i) && i.name === name) ?? null;
}

/** A post-death move's own printed options ("pick 1", "choose 1"), as plain text. */
function printedOptions(actor, name) {
	const list = firstOptionList(postDeathMove(actor, name)?.system?.description ?? "");
	return (list?.items ?? []).map(stripHtmlToText).filter(Boolean);
}

/** The Thrall's Favor held, 0 to 3. */
function favorHeld(actor) {
	return Math.max(0, Math.trunc(Number(actor?.typedActor?.favor?.()) || 0));
}

const hasFury  = actor => furyTrack(actor)?.held > 0;
const hasFavor = actor => favorHeld(actor) > 0;

/**
 * The buttons each move's card carries, keyed by move name, and what each does: `run(actor, prompt)`
 * (runPostDeathAction). `enabled(actor)` answers whether there is anything to spend: a spend with
 * nothing held is a missing choice, not a button that fails.
 */
const MOVE_ACTIONS = {
	[POLTERGEIST]: [
		{ key: "getAngry", icon: "fa-face-angry",   run: getAngry },
		{ key: "shatter",  icon: "fa-burst",         enabled: hasFury, run: shatter },
		{ key: "hurl",     icon: "fa-meteor",        enabled: hasFury, run: (actor, prompt) => spendFuryAndRoll(actor, HURL, prompt) },
		{ key: "fling",    icon: "fa-hand-sparkles", enabled: hasFury, run: (actor, prompt) => spendFuryAndRoll(actor, FLING, prompt) },
	],
	[BODYSNATCHER]:      [{ key: "possess",  icon: "fa-person-rays",     run: possess }],
	[DISEMBODIED]:       [{ key: "manifest", icon: "fa-ghost",           run: manifest }],
	[IMPLACABLE]:        [{ key: "push",     icon: "fa-person-running",  run: pushTheLimits }],
	[RED_WRATH]:         [{ key: "lashOut",  icon: "fa-fire",  enabled: hasFavor, run: (actor, prompt) => spendFavorAndRoll(actor, RED_WRATH, prompt) }],
	[TORMENTS_BLESSING]: [{ key: "torment",  icon: "fa-skull", enabled: hasFavor, run: (actor, prompt) => spendFavorAndRoll(actor, TORMENTS_BLESSING, prompt) }],
};

/** The same actions by key, as a card's button names them. */
const ACTION_BY_KEY = Object.fromEntries(Object.values(MOVE_ACTIONS).flat().map(a => [a.key, a]));

/**
 * The buttons for the move cards on this character's sheet, keyed by move name as move-group.hbs looks
 * them up: `{ label, icon, action, disabled, tooltip }` each. Only for the post-death moves they own.
 */
export function moveActionsFor(actor) {
	const owned = new Set((actor?.items ?? []).filter(isPostDeathMove).map(i => i.name));
	const out = {};
	for (const [name, actions] of Object.entries(MOVE_ACTIONS)) {
		if (!owned.has(name)) continue;
		out[name] = actions.map(a => {
			const disabled = a.enabled ? !a.enabled(actor) : false;
			return {
				action:   a.key,
				icon:     `fas ${a.icon}`,
				label:    localize(`${KEY}.actions.${a.key}.label`),
				tooltip:  localize(`${KEY}.actions.${a.key}.${disabled ? "empty" : "tooltip"}`),
				disabled,
			};
		});
	}
	return out;
}

// ── HP lost ────────────────────────────────────────────────────────────────

/**
 * Throw `formula`, take that much HP off `actor`, and post the throw with where HP ended up.
 *
 * `alongside(lost)` answers what the loss bought (Poltergeist's Fury) as `{update, line}`: the update
 * lands in the HP's own write, and the line goes on the card. A loss that takes them to 0 HP opens
 * Death's Door on this client, and what the anger bought is on the sheet behind it.
 *
 * @returns {Promise<{lost: number, oldHp: number, newHp: number}>}
 */
export async function loseHp(actor, formula, { moveName, detail = "", alongside = null } = {}) {
	const roll = await new Roll(formula).evaluate();
	const lost = Math.max(0, Math.trunc(Number(roll.total) || 0));
	const bought = alongside?.(lost) ?? {};
	const hp = await applyDamageToActor(actor, lost, moveName ? { stonetopMove: moveName } : {}, bought.update);
	const oldHp = hp?.oldHp ?? 0;
	const newHp = hp?.newHp ?? 0;
	await roll.toMessage({
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor:  haulCard(roll, moveName || localize(`${KEY}.hpLost`), localize(`${KEY}.hpLost`),
			[detail, bought.line, format(`${KEY}.hpLine`, { from: oldHp, to: newHp })].filter(Boolean)),
	});
	return { lost, oldHp, newHp };
}

// ── The actions ────────────────────────────────────────────────────────────

/**
 * Do what a move card's button says. `prompt` is the sheet's pre-roll window
 * (StonetopCharacterSheet#_promptRollOptions), for the actions that roll. Answers whether it happened.
 *
 * @param {Actor} actor
 * @param {string} action  a MOVE_ACTIONS key
 * @param {object} deps
 * @param {(o: {title: string, offersFor: string}) => Promise<object|null>} deps.prompt
 */
export async function runPostDeathAction(actor, action, { prompt = async () => ({}) } = {}) {
	if (!actor?.isOwner) return false;
	const run = ACTION_BY_KEY[action]?.run;
	return run ? run(actor, prompt) : false;
}

/** "When you get angry, lose 1d4 HP and hold that much Fury." Held to the track's max, 4. */
async function getAngry(actor) {
	const track = furyTrack(actor);
	if (!track) return false;
	await loseHp(actor, "1d4", {
		moveName: POLTERGEIST,
		alongside: lost => {
			// Re-read: a pip ticked by hand since the button was drawn is kept.
			const now = furyTrack(actor) ?? track;
			const held = Math.min(now.max, now.held + lost);
			return {
				update: actor.typedActor.moveResources.usesUpdate(POLTERGEIST, held),
				line:   format(`${KEY}.furyHeld`, { held, max: now.max }),
			};
		},
	});
	return true;
}

/** Bodysnatcher: "When you possess a body, lose 1d4 HP." */
async function possess(actor) {
	await loseHp(actor, "1d4", { moveName: BODYSNATCHER, detail: localize(`${KEY}.possessDetail`) });
	return true;
}

/** Spend 1 Fury, the note that says so. Nothing held, nothing spent. */
async function spendFury(actor) {
	const spent = await takeBackHeld(actor, POLTERGEIST, 1);
	if (!spent) globalThis.ui?.notifications?.warn?.(localize(`${KEY}.noFury`));
	return spent > 0;
}

async function shatter(actor) {
	if (!(await spendFury(actor))) return false;
	await postMoveNote(actor, POLTERGEIST, format(`${KEY}.shattered`, {
		name: actor.name ?? "", held: furyTrack(actor)?.held ?? 0,
	}));
	return true;
}

// The two Fury spends that roll. Their outcomes are the bullet's own words, split per tier for the card;
// `actions` are the buttons each tier's row carries.
const HURL = {
	stat: "dex", key: "hurl",
	actions: { success: ["own-damage"], partial: ["own-damage", "lose-1d4"] },
};
const FLING = {
	stat: "int", key: "fling",
	actions: { success: ["pin"], partial: ["pin", "lose-1d4"] },
};

/** A Fury spend's roll: asked first (a closed window spends nothing), then paid, then rolled. */
async function spendFuryAndRoll(actor, spend, prompt) {
	const moveName = localize(`${KEY}.actions.${spend.key}.card`);
	const prompted = await prompt({ title: moveName, offersFor: moveName });
	if (!prompted) return false;
	if (!(await spendFury(actor))) return false;
	const moveResults = {
		success: { label: "10+", value: localize(`${KEY}.actions.${spend.key}.success`) },
		partial: { label: "7-9", value: localize(`${KEY}.actions.${spend.key}.partial`) },
	};
	await actor.typedActor.onDirectStatRoll(spend.stat, {
		moveName,
		moveResults,
		moveDescription: `<p>${escHtml(localize(`${KEY}.actions.${spend.key}.rule`))}</p>`,
		tierActions: tierButtons(spend.actions, { move: moveName }),
		...prompted,
	});
	return true;
}

/**
 * "Spend 1-3 Favor, and roll +Favor spent" (Red Wrath, Torment's Blessing). How much is asked with a
 * button per amount the Thrall can pay, capped at what they hold; the pre-roll window next (a closed
 * one spends nothing); then the Favor comes off and the dice go with that as the number added.
 */
async function spendFavorAndRoll(actor, moveName, prompt) {
	const item = postDeathMove(actor, moveName);
	const character = actor.typedActor;
	const held = favorHeld(actor);
	if (!item || !character) return false;
	if (held < 1) {
		globalThis.ui?.notifications?.warn?.(localize(`${KEY}.noFavor`));
		return false;
	}
	const amounts = Array.from({ length: Math.min(3, held) }, (_, i) => i + 1);
	const spend = await askWithButtons({
		title:   moveName,
		content: `<p>${escHtml(format(`${KEY}.favorAsk`, { held }))}</p>`,
		buttons: amounts.map(n => ({ key: `spend-${n}`, label: format(`${KEY}.favorSpend`, { n }), icon: "fa-coins", value: n })),
	});
	if (!spend) return false;
	const prompted = await prompt({ title: moveName, offersFor: moveName });
	if (!prompted) return false;
	// Re-read: Favor spent elsewhere while the windows were open cannot be spent twice.
	const now = favorHeld(actor);
	if (now < spend) {
		globalThis.ui?.notifications?.warn?.(localize(`${KEY}.noFavor`));
		return false;
	}
	await character.setFavor(now - spend);
	const moveResults = item.system?.moveResults ?? null;
	await character.onDirectStatRoll("", {
		statValue: spend,
		moveName,
		moveResults,
		moveDescription: moveCardBody(item.system?.description ?? "", moveResults),
		conditionNotes: [format(`${KEY}.favorSpent`, { n: spend })],
		tierActions: tierDamageButtons(moveResults, { move: moveName }),
		...prompted,
	});
	return true;
}

/**
 * Disembodied: "When you manifest a ghostly presence in shadows or darkness, the world becomes clear and
 * pick 1. For each additional option you pick, lose 1d4 HP." The move's own printed options, as boxes;
 * the first is free and each one after it costs a d4.
 */
async function manifest(actor) {
	const options = printedOptions(actor, DISEMBODIED);
	if (!options.length) return false;
	const boxes = options.map((text, i) =>
		// `stonetop-check`: the shared spiral skin (stonetop.css), not a native box.
		`<label class="stonetop-pd-manifest-option"><input type="checkbox" class="stonetop-check" name="manifest-${i}"> ${escHtml(text)}</label>`).join("");
	const picked = await askWithButtons({
		title:   DISEMBODIED,
		content: `<p>${escHtml(localize(`${KEY}.manifestAsk`))}</p><div class="stonetop-pd-manifest">${boxes}</div>`,
		buttons: [{
			key: "manifest", label: localize(`${KEY}.manifestButton`), icon: "fa-ghost",
			value: form => options.filter((_, i) => form?.elements?.namedItem?.(`manifest-${i}`)?.checked),
		}],
		// "Pick 1": the button waits for the first box.
		render: root => {
			const button = root?.querySelector?.('button[data-action="manifest"]');
			const inputs = [...(root?.querySelectorAll?.(".stonetop-pd-manifest input") ?? [])];
			if (!button) return;
			const paint = () => { button.disabled = !inputs.some(input => input.checked); };
			for (const input of inputs) input.addEventListener("change", paint);
			paint();
		},
	});
	if (!Array.isArray(picked) || !picked.length) return false;
	const list = picked.join("; ");
	if (picked.length === 1) {
		await postMoveNote(actor, DISEMBODIED, format(`${KEY}.manifestNote`, { name: actor.name ?? "", list }));
		return true;
	}
	await loseHp(actor, `${picked.length - 1}d4`, { moveName: DISEMBODIED, detail: format(`${KEY}.manifested`, { list }) });
	return true;
}

/**
 * Implacable: "When you push the limits of your undead body, lose 1d4 HP and choose 1". The choice is the
 * question's buttons, each the printed option it takes; closing the window pushes nothing.
 */
async function pushTheLimits(actor) {
	const options = printedOptions(actor, IMPLACABLE);
	if (!options.length) return false;
	const chosen = await askWithButtons({
		title:   IMPLACABLE,
		content: `<p>${escHtml(localize(`${KEY}.pushAsk`))}</p>`,
		buttons: options.map((text, i) => ({ key: `push-${i}`, label: text, value: text })),
	});
	if (!chosen) return false;
	await loseHp(actor, "1d4", { moveName: IMPLACABLE, detail: chosen });
	return true;
}

// ── The roll cards' buttons ────────────────────────────────────────────────

/** One button on a roll card's tier row. `key` is its latch on the message: one press per key, per card. */
function cardButton(className, { key, label, icon, data = {} }) {
	const attrs = Object.entries({ key, ...data })
		.map(([name, value]) => ` data-${name}="${escHtml(String(value))}"`).join("");
	return `<button type="button" class="stonetop-pd-card-btn ${className}"${attrs}><i class="fas ${icon}"></i> ${escHtml(label)}</button>`;
}

// The damage buttons latch once per CARD, not per tier: a GM Shift that moves the card between 7-9 and
// 10+ redraws the other tier's row, and the blow it already dealt is still the one blow the roll owes.
const TIER_BUTTONS = {
	"own-damage": (tier, move) => cardButton("stonetop-pd-own-damage", {
		key: "own-damage", label: localize(`${KEY}.ownDamage`), icon: "fa-burst", data: { move, tags: "forceful" },
	}),
	"lose-1d4": (tier, move) => cardButton("stonetop-pd-lose-hp", {
		key: `lose-hp-${tier}`, label: format(`${KEY}.loseHp`, { formula: "1d4" }), icon: "fa-heart-crack", data: { move, formula: "1d4" },
	}),
	// Not latched: "spending 1 HP each time they make a committed effort to break free".
	"pin": (tier, move) => cardButton("stonetop-pd-pin", {
		key: `pin-${tier}`, label: localize(`${KEY}.pinHp`), icon: "fa-thumbtack", data: { move },
	}),
};

/** `{tier: [button names]}` as the tier rows' HTML (roll-engine's tierActions). */
export function tierButtons(byTier, { move }) {
	return Object.fromEntries(Object.entries(byTier).map(([tier, names]) =>
		[tier, names.map(name => TIER_BUTTONS[name](tier, move)).join("")]));
}

/**
 * The damage a +Favor roll's tiers owe, as a button on each: read off each tier's own words
 * (utils/damage.js#readOptionDamage), so "deal 2d8 damage (messy, forceful)" rolls 2d8 with those tags and
 * "they take 1d6 damage (ignores armor)" ignores armor. A tier that is "as a 10+" (Red Wrath's 7-9) owes
 * the 10+'s. A tier that names no damage gets no button.
 */
export function tierDamageButtons(moveResults, { move }) {
	const tiers = ["success", "partial"];
	const text = Object.fromEntries(tiers.map(tier => [tier, stripHtmlToText(moveResults?.[tier]?.value ?? "")]));
	const out = {};
	for (const tier of tiers) {
		const dealt = readOptionDamage(text[tier]) ?? (/^as (?:a )?10\+/i.test(text[tier]) ? readOptionDamage(text.success) : null);
		// HP a tier costs its roller is a cost, not the move's damage (TIER_BUTTONS' lose-1d4 pays those).
		if (!dealt || dealt.hpLoss) continue;
		out[tier] = cardButton("stonetop-pd-move-damage", {
			key: "move-damage",
			label: format(`${KEY}.moveDamage`, { formula: dealt.formula }),
			icon: "fa-dice-d6",
			data: { move, formula: dealt.formula, ignores: dealt.ignoresArmor ? 1 : 0, piercing: dealt.piercing, tags: dealt.tags.join(",") },
		});
	}
	return out;
}

/** The message flag a latched button of this card is stamped under. */
const latchFlag = key => `postDeathCard.${key}`;

/**
 * Wire the buttons above on one chat card (stonetop.js renderChatMessageHTML). Each latched button is
 * spent once per card, for everyone (card-latch.js); the pin's HP is paid as often as it is pressed. A
 * client that cannot act for the character sees them disabled.
 */
export function wirePostDeathMoveCards(message, html) {
	const root = html?.[0] ?? html;
	const buttons = [...(root?.querySelectorAll?.(".stonetop-pd-card-btn") ?? [])].filter(btn => belongsToMessage(btn, message));
	if (!buttons.length) return;
	const actor = speakerActor(message);
	const spent = message?.getFlag?.(SYSTEM_ID, "postDeathCard") ?? {};
	for (const btn of buttons) {
		const repeatable = btn.classList.contains("stonetop-pd-pin");
		const used = !repeatable && !!spent[btn.dataset.key];
		btn.classList.toggle("is-chosen", used);
		const usable = repeatable ? !!actor?.isOwner : !used && canRewriteCard(message, actor);
		if (!usable) { btn.disabled = true; continue; }
		if (btn.dataset.pdWired === "1") continue;
		btn.dataset.pdWired = "1";
		btn.addEventListener("click", () => {
			pressCardButton(message, actor, btn)
				.catch(err => console.error("Stonetop | a post-death move's card button failed", err));
		});
	}
}

/** Do what one card button says; the latched ones once. Answers whether it happened. */
export async function pressCardButton(message, actor, btn) {
	const { move = "", formula = "" } = btn.dataset;
	const tags = String(btn.dataset.tags ?? "").split(",").filter(Boolean);
	if (btn.classList.contains("stonetop-pd-pin")) {
		btn.disabled = true;
		try {
			await loseHp(actor, "1", { moveName: move, detail: localize(`${KEY}.pinDetail`) });
		} finally {
			btn.disabled = false;
		}
		return true;
	}
	return withCardLatch(message, latchFlag(btn.dataset.key), true, [btn], async () => {
		if (btn.classList.contains("stonetop-pd-lose-hp")) {
			await loseHp(actor, formula, { moveName: move });
			return true;
		}
		if (btn.classList.contains("stonetop-pd-own-damage")) {
			// "Deal your damage (forceful)": the character's own die, with the tag the move gives the blow.
			return rollDamageAt(actor, {
				formula: await pcDamageDie(actor),
				label: move,
				keywords: tags.join(", "),
				weapon: { name: "", range: [], piercing: 0, ignoresArmor: false, tags },
			});
		}
		if (btn.classList.contains("stonetop-pd-move-damage")) {
			const results = await rollOptionDamage(actor, { move, damage: {
				formula,
				self: false,
				ignoresArmor: btn.dataset.ignores === "1",
				piercing: Number(btn.dataset.piercing) || 0,
				tags,
			} });
			return !!results;
		}
		return false;
	});
}
