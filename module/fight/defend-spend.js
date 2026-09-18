// Spending Defend's Readiness on a blow, from the damage card that carries it.
//
// DEFEND (Book I p.216): "You can spend Readiness 1-for-1 to: suffer an attack's damage/effects instead of
// your ward; halve an attack's effect or damage; draw all attention from your ward to yourself; strike back
// at an attacker (deal your damage, with disadvantage)." Two of those four change a number the damage card
// is about to write, so the card offers them while the damage is still owed:
//  • HALVE IT: "Halving an attack's damage/effects reduces the damage before applying armor", rounded up
//    like every halving in the book.
//  • TAKE IT FOR THEM: the defender takes the blow in the ward's place, against the defender's own armor.
// "Players can spend Readiness multiple times in response to a single attack, but can only pick each option
// once against any given attack", so each is offered once per blow. Strike back is a damage roll of its own
// (the fight ring's button); drawing attention is fiction, and the GM's to play.
//
// PLAYBOOK MOVES CHANGE THE SPENDS, and the card follows the defender's sheet (owns-move.js#ownsMoveNamed):
//  • PARRY & RIPOSTE (Fox): "spend 1 Readiness to both halve an attack's effects/damage and strike back at
//    the attacker (deal your damage with disadvantage), instead of spending 1 Readiness for each." One more
//    button, which halves the blow and rolls the strike back at whoever struck it. With SECOND INTENT it
//    also puts the Ambush list in front of them: "also pick 1 option from the Ambush list". Whether the
//    weapon is one "you can wield quickly" is the table's to say.
//  • STEADFAST GUARDIAN (Heavy): "While you hold Readiness (from Defend), you can always suffer the
//    damage/effects of an attack instead of your ward; no need to spend Readiness". Taking it for them is
//    free, for as long as they hold any.
//  • A MIGHTY RAMPART (Judge): "you can spend 1 Readiness to completely ignore the effects/damage of an
//    attack that you suffer". Offered to whoever will take the blow: the one hit, or the defender who took
//    it for them.
//
// WHO MAY DEFEND. The one hit, when they hold Readiness, can halve their own blow; any character in the
// fight standing beside them (touching, or fighting the same foe) who holds Readiness can do either. "They
// can't interrupt an attack that they can't perceive, or strike back at a foe that's out of reach", which is
// why it is the people standing there. Pressed by anyone who can record the spend on the card (its author,
// or the one GM who acts), for a defender they may write: a player cannot spend another player's Readiness.
// Not by whoever may press Apply: the ward's player applies their own blow, and an ally or the GM spends on it.

import { SYSTEM_ID } from "../system-id.js";
import { isFightTabEnabled } from "../settings.js";
import { format, localize } from "../utils/i18n.js";
import { escHtml, stripHtmlToText } from "../utils/strings.js";
import { stonetopChatCard, firstOptionList } from "../utils/chat.js";
import { damageRowActor } from "../utils/damage.js";
import { themedDialogClasses } from "../utils/window-theme.js";
import { contentElement } from "../dialogs/content-picker.js";
import { heldReadiness, READINESS_FLAG } from "../combat/defend-readiness.js";
import { ownsMoveNamed, ownedMove } from "../actors/character/owns-move.js";
import { touching, HEROES } from "./engagements.js";
import { engagementFor, fightOnScene, gridOf } from "./fight-state.js";
import { HERO_MOVES } from "./hero-moves.js";
import { isPrimaryGM } from "../utils/primary-gm.js";

const KEY = "stonetop.fight.defend";

/** Take `cost` Readiness off a character, never below none. */
export function spendReadiness(actor, cost = 1) {
	return actor.setFlag(SYSTEM_ID, READINESS_FLAG, Math.max(0, heldReadiness(actor) - cost));
}

/** Halve a blow, rounded up (p.216; the book's halvings round up). */
export const halveDamage = raw => Math.ceil(Math.max(0, Number(raw) || 0) / 2);

/**
 * What the spends on a card have settled so far, by row uuid: the blows halved (a halving or a parry),
 * the ones a defender took in the ward's place, and the ones ignored. PURE.
 *
 * @param {object} damage  the card's damage flag
 * @returns {{halved: Set<string>, standIns: Map<string, object>, ignored: Set<string>}}
 */
export function spentOn(damage) {
	return {
		halved: new Set((damage?.halvedBy ?? []).map(spend => spend.uuid)),
		standIns: new Map((damage?.standIns ?? []).map(spend => [spend.uuid, spend])),
		ignored: new Set((damage?.ignoredBy ?? []).map(spend => spend.uuid)),
	};
}

/** The token a damage row's target stands as on the canvas scene, or null. */
function rowToken(doc) {
	if (doc?.documentName === "Token") return doc;
	const scene = globalThis.canvas?.scene ?? null;
	const tokens = (doc?.getActiveTokens?.(false, true) ?? []).filter(t => t?.parent?.id === scene?.id);
	return tokens.length === 1 ? tokens[0] : null;
}

const resolve = uuid => {
	try { return globalThis.fromUuidSync?.(uuid, { strict: false }) ?? null; } catch { return null; }
};

/**
 * Who could spend Readiness on the blow a row owes: the one hit, and the characters standing by them.
 *
 * @param {string} uuid  the row's target
 * @returns {{self: Actor|null, allies: Actor[]}}  those holding Readiness this reader may write
 */
export function defendersFor(uuid, { user = globalThis.game?.user } = {}) {
	const doc = resolve(uuid);
	const target = damageRowActor(doc);
	const writable = actor => !!actor && (user?.isGM || actor.isOwner) && heldReadiness(actor) > 0;
	const self = writable(target) ? target : null;
	const allies = [];
	const token = isFightTabEnabled() ? rowToken(doc) : null;
	// Drawn on every render of every card still owing damage, and most of the time nobody holds any
	// Readiness at all: the fight is only worked out when somebody else in it could spend some.
	const combatants = [...(fightOnScene(token?.parent ?? null)?.combatants ?? [])];
	const anyAlly = combatants.some(c => c.actor !== target && writable(c.actor));
	const found = anyAlly ? engagementFor(token) : null;
	if (found) {
		const me = found.fighters.find(f => f.id === found.combatant.id);
		if (me?.side === HEROES) {
			const grid = gridOf(found.scene);
			const myFoes = new Set(found.entry.melee);
			for (const fighter of found.fighters) {
				if (fighter.id === me.id || fighter.side !== HEROES || fighter.out) continue;
				const theirs = found.result.byFighter[fighter.id]?.melee ?? [];
				if (!touching(me, fighter, grid) && !theirs.some(id => myFoes.has(id))) continue;
				const actor = found.combatants.get(fighter.id)?.actor ?? null;
				if (writable(actor) && actor !== target && !allies.includes(actor)) allies.push(actor);
			}
		}
	}
	return { self, allies };
}

/** The kinds of spend a card can offer, in the order its buttons stand. */
export const SPEND_KINDS = ["halve", "parry", "standIn", "ignore"];

/**
 * The spends a card still offers: one entry per blow and defender, for each option, leaving out an option
 * already taken on that blow. Each carries what it costs: a Steadfast Guardian takes a blow for nothing.
 * PURE apart from `defendersOf` and `resolveActor`.
 *
 * @param {object} damage  the card's damage flag
 * @param {(uuid: string) => {self: Actor|null, allies: Actor[]}} [defendersOf]
 * @param {(uuid: string) => Actor|null} [resolveActor]  a stand-in's actor, from the uuid on the card
 * @returns {{halve: object[], parry: object[], standIn: object[], ignore: object[]}}
 */
export function defendOffers(damage, defendersOf = defendersFor, resolveActor = uuid => damageRowActor(resolve(uuid))) {
	const done = new Set((damage?.applied ?? []).map(a => a.uuid));
	const { halved, standIns, ignored } = spentOn(damage);
	const offers = { halve: [], parry: [], standIn: [], ignore: [] };
	const user = globalThis.game?.user;
	for (const row of damage?.results ?? []) {
		if (!row?.uuid || done.has(row.uuid) || ignored.has(row.uuid)) continue;
		const { self, allies } = defendersOf(row.uuid);
		if (!halved.has(row.uuid)) {
			for (const defender of [self, ...allies].filter(Boolean)) {
				offers.halve.push({ row, defender, cost: 1 });
				if (ownsMoveNamed(defender, HERO_MOVES.PARRY)) offers.parry.push({ row, defender, cost: 1 });
			}
		}
		if (!standIns.has(row.uuid)) {
			for (const defender of allies) offers.standIn.push({ row, defender, cost: ownsMoveNamed(defender, HERO_MOVES.STEADFAST) ? 0 : 1 });
		}
		// Whoever will suffer the blow: the defender who took it, or the one it was aimed at.
		const standIn = standIns.get(row.uuid);
		const sufferer = standIn ? resolveActor(standIn.by) : self;
		const mayWrite = !!sufferer && (user?.isGM || sufferer.isOwner || !user);
		if (mayWrite && heldReadiness(sufferer) > 0 && ownsMoveNamed(sufferer, HERO_MOVES.RAMPART)) {
			offers.ignore.push({ row, defender: sufferer, cost: 1 });
		}
	}
	return offers;
}

/**
 * Ask which one, when there is more than one: a button each, and Cancel. Resolves to the one picked, or
 * null. The Readiness spends here and the ring's Big Damn Hero (fight-ring.js#lockEyesFromRing) ask this.
 *
 * @param {object[]} items
 * @param {object} p
 * @param {string} p.title
 * @param {string} p.question
 * @param {(item: object) => string} p.labelOf  each item's button
 */
export async function pickOne(items, { title, question, labelOf, DialogV2 = globalThis.foundry?.applications?.api?.DialogV2 }) {
	if (items.length <= 1) return items[0] ?? null;
	if (!DialogV2) return null;
	const index = await DialogV2.wait({
		classes: themedDialogClasses(),
		window: { title },
		content: contentElement(`<p>${escHtml(question)}</p>`),
		buttons: [
			...items.map((item, i) => ({ action: `o${i}`, label: labelOf(item), callback: () => i })),
			{ action: "cancel", label: localize(`${KEY}.cancel`), callback: () => null },
		],
		rejectClose: false,
	}).catch(() => null);
	return Number.isInteger(index) ? items[index] : null;
}

/** Ask which spend, when there is more than one; resolves to one offer or null. */
function pickOffer(offers, kind) {
	return pickOne(offers, {
		title: format(`${KEY}.${kind}`, {}),
		question: format(`${KEY}.ask`, {}),
		labelOf: offer => format(`${KEY}.${kind}Choice`, { defender: offer.defender.name, ward: offer.row.name }),
	});
}

/**
 * Take one spend: its Readiness off the defender (none for a Steadfast Guardian taking a blow, though they
 * must still hold some), and the card's flag told, so apply-time arithmetic (attack-flow.js#wireApplyDamage)
 * halves the blow, hands it to the defender, or lets it pass. A parry then strikes back at the attacker.
 *
 * @param {object} [deps]
 * @param {(defender: Actor, attackerUuid: string, label: string) => Promise<unknown>} [deps.strikeBack]
 */
export async function spendOnBlow(message, kind, offer, { scope = SYSTEM_ID, strikeBack = null } = {}) {
	const current = message.getFlag(scope, "damage");
	if (!current || !offer) return false;
	const held = heldReadiness(offer.defender);
	const cost = Number.isFinite(offer.cost) ? offer.cost : 1;
	if (held < Math.max(1, cost)) return false;
	if (cost > 0) await spendReadiness(offer.defender, cost);
	const spend = { uuid: offer.row.uuid, name: offer.defender.name, how: kind };
	// Each kept as a list of who spent what, which is all spentOn and defendNotes read.
	const list = kind === "halve" || kind === "parry" ? "halvedBy" : kind === "ignore" ? "ignoredBy" : "standIns";
	const entry = list === "standIns" ? { ...spend, by: offer.defender.uuid, free: cost === 0 } : spend;
	await message.setFlag(scope, "damage", { ...current, [list]: [...(current[list] ?? []), entry] });
	if (kind === "parry") {
		const strike = strikeBack ?? (await import("../combat/attack-flow.js")).strikeBackAt;
		// On a blow a character takes, the card's attacker IS that character: the foe is `foeUuid`.
		const attacker = current.selfHarm ? (current.foeUuid ?? "") : (current.attackerUuid ?? "");
		await strike(offer.defender, attacker, format(`${KEY}.parryStrike`, {}));
		if (ownsMoveNamed(offer.defender, HERO_MOVES.SECOND_INTENT)) await postSecondIntent(offer.defender);
	}
	return true;
}

/**
 * Second Intent: "When you Defend and spend 1 Readiness to Parry & Riposte, also pick 1 option from the
 * Ambush list." The list is read off the character's own Ambush, so it is the book's words; the pick is
 * theirs to say.
 */
export async function postSecondIntent(actor) {
	const ambush = ownedMove(actor, "Ambush");
	const options = (firstOptionList(ambush?.system?.description)?.items ?? []).map(stripHtmlToText).filter(Boolean);
	const list = options.length ? `<ul>${options.map(o => `<li>${escHtml(o)}</li>`).join("")}</ul>` : "";
	return globalThis.ChatMessage?.create?.({
		content: stonetopChatCard(HERO_MOVES.SECOND_INTENT, `<div class="card-content"><p>${escHtml(format(`${KEY}.secondIntent`, { name: actor.name }))}</p>${list}</div>`, "stonetop-second-intent-card"),
		speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }),
	});
}

/** The line a card prints for each spend taken. PURE. */
export function defendNotes(damage) {
	const notes = [];
	const ward = spend => damage.results?.find(r => r.uuid === spend.uuid)?.name ?? "";
	for (const spend of damage?.halvedBy ?? []) {
		notes.push(format(`${KEY}.${spend.how === "parry" ? "noteParry" : "noteHalve"}`, { defender: spend.name, ward: ward(spend) }));
	}
	for (const spend of damage?.standIns ?? []) {
		notes.push(format(`${KEY}.${spend.free ? "noteStandInFree" : "noteStandIn"}`, { defender: spend.name, ward: ward(spend) }));
	}
	for (const spend of damage?.ignoredBy ?? []) {
		notes.push(format(`${KEY}.noteIgnore`, { defender: spend.name }));
	}
	return notes;
}

/**
 * Put the Readiness buttons on a damage card, and say which spends were taken. Drawn every render, from the
 * flag, like the fight's +N toggle.
 *
 * @param {ChatMessage} message
 * @param {HTMLElement|object} html
 */
export function wireDefendSpends(message, html, { scope = SYSTEM_ID, user = globalThis.game?.user } = {}) {
	const root = html?.[0] ?? html;
	const damage = message?.getFlag?.(scope, "damage");
	if (!root || !damage?.results?.length) return;

	const notes = defendNotes(damage);
	if (notes.length) {
		const list = root.querySelector(".stonetop-damage-list");
		const block = document.createElement("p");
		block.className = "stonetop-damage-defend-note";
		block.textContent = notes.join(" ");
		list?.after?.(block);
	}

	const actions = root.querySelector(".stonetop-attack-actions");
	if (!actions || !root.querySelector(".stonetop-apply-damage")) return;
	// A spend is written to the card, so only a client that may write it offers one; of several GMs, one.
	if (!message.isOwner || (user?.isGM && !isPrimaryGM())) return;
	const offers = defendOffers(damage);
	for (const kind of SPEND_KINDS) {
		if (!offers[kind].length) continue;
		const button = document.createElement("button");
		button.type = "button";
		button.className = `stonetop-attack-btn stonetop-damage-defend stonetop-damage-defend--${kind}`;
		const [one] = offers[kind];
		// A Steadfast Guardian's stand-in says it is free, so nobody waits for a Readiness to come off.
		const free = kind === "standIn" && one.cost === 0 ? "Free" : "";
		const label = offers[kind].length === 1
			? format(`${KEY}.${kind}${free}One`, { defender: one.defender.name, ward: one.row.name })
			: format(`${KEY}.${kind}`, {});
		button.innerHTML = `<i class="fa-solid fa-shield-halved"></i> ${escHtml(label)}`;
		button.addEventListener("click", async () => {
			if (button.disabled) return;
			button.disabled = true;
			try {
				const offer = await pickOffer(offers[kind], kind);
				if (!offer || !(await spendOnBlow(message, kind, offer, { scope }))) button.disabled = false;
			} catch (err) {
				console.error("Stonetop | spending Readiness failed", err);
				button.disabled = false;
			}
		});
		actions.append(button);
	}
}
