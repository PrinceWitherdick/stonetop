// Who a roll hits when nobody picked a target by hand: whoever the roller is fighting.
//
// The Fight tab already knows that (engagements.js): tokens touching are in melee, and a player's target
// is a shot. So a character's Clash lands on the foe they are standing against, and a monster's damage
// lands on the character standing against it, without anyone reaching for T.
//
// HAND TARGETS STILL WIN. A player who targeted something meant it, and the GM's own targets are the
// only way to aim a monster at somebody it is not touching.
//
// A HERO hits the foes they are in melee with, then any they are shooting at. A FOE hits the heroes in
// melee with it, and only when there are none, the heroes it has a shot on record at (fight-shots.js),
// then the heroes shooting at it: a monster with a character in its face is not swinging at the archer
// behind them.
//
// SEVERAL IS A QUESTION, NOT A DEFAULT. Clash and Let Fly are written against one foe. Book I p.414 (and
// Clash's own notes, p.215): "When a PC or follower's attack could feasibly hurt multiple foes—because of
// the area tag, because a group of followers is making or Aiding the attack, or just because the player
// describes it in a way that makes sense—then the player rolls to Clash or Let Fly just once, but they
// roll damage separately against each foe." Only the roller knows which of those this is, so a roller
// fighting more than one is asked, with the first ticked.

import { escHtml } from "../utils/strings.js";
import { format, localize } from "../utils/i18n.js";
import { themedDialogClasses } from "../utils/window-theme.js";
import { contentElement } from "../dialogs/content-picker.js";
import { HEROES } from "./engagements.js";
import { rollerEngagement } from "./damage-seed.js";
import { namesPhrase } from "./fight-copy.js";

const KEY = "stonetop.fight.targets";
export const TARGET_FIELD = "stonetopFightTarget";

/** A combatant as a roll's target, in the shape a hand target is frozen in (combat/attack-flow.js). */
function asTarget(combatant) {
	return {
		uuid: combatant.token.uuid,
		name: combatant.name || combatant.token.name || "",
		actorId: combatant.actorId ?? null,
		disposition: combatant.token.disposition ?? 0,
		hasActor: !!combatant.actor,
	};
}

/**
 * Everyone `actor` is fighting on the canvas scene, as targets, in the order the Fight tab lists them.
 * Empty with the Fight tab off, no fight here, the actor not in it, or nobody engaged with them.
 *
 * @param {Actor} actor  the roller (an unlinked token's own actor, for a monster)
 */
export function engagedOpponents(actor, { scene = globalThis.canvas?.scene ?? null } = {}) {
	const found = rollerEngagement(actor, { scene });
	if (!found) return [];
	const self = found.fighters.find(f => f.id === found.combatant.id);
	const { melee = [], shootingAt = [], shotBy = [] } = found.entry;
	const ids = self?.side === HEROES
		? [...new Set([...melee, ...shootingAt])]
		: (melee.length ? melee : [...new Set([...shootingAt, ...shotBy])]);
	return ids.map(id => found.combatants.get(id)).filter(c => c?.token).map(asTarget);
}

/**
 * The "Who does this hit?" window's words: a checkbox per opponent, the first ticked. PURE.
 *
 * @param {{roller: string, candidates: Array<{name: string}>}} question
 */
export function whoItHitsWindow({ roller, candidates }) {
	const rows = candidates.map((candidate, index) => `<li>
			<label class="stonetop-fight-targets-option">
				<input type="checkbox" name="${TARGET_FIELD}" value="${index}"${index === 0 ? " checked" : ""}>
				<span>${escHtml(candidate.name)}</span>
			</label>
		</li>`).join("");
	return {
		title: format(`${KEY}.title`, { name: roller }),
		content: `<div class="stonetop-fight-targets">
		<p>${escHtml(format(`${KEY}.body`, { name: roller }))}</p>
		<ul class="stonetop-fight-targets-list">${rows}</ul>
		<p class="stonetop-fight-targets-hint">${escHtml(localize(`${KEY}.hint`))}</p>
	</div>`,
		confirm: whoItHitsConfirm(candidates.slice(0, 1)),
		cancel: localize(`${KEY}.cancel`),
	};
}

/** The confirm button's words for what is ticked: "Attack Wolf", "Attack Wolf & Crinwin". */
export function whoItHitsConfirm(ticked) {
	return ticked.length
		? format(`${KEY}.confirm`, { names: namesPhrase(ticked.map(t => t.name), format) })
		: localize(`${KEY}.confirmNone`);
}

/**
 * Ask the roller which of the opponents they are fighting this roll hits. Resolves to the ticked ones,
 * or null when the window is cancelled or closed, which calls the roll off.
 *
 * @param {{roller: string, candidates: object[]}} question
 */
export async function askWhoItHits(question, { DialogV2 = globalThis.foundry?.applications?.api?.DialogV2, document = globalThis.document } = {}) {
	if (!DialogV2 || !document || !question?.candidates?.length) return null;
	const { candidates } = question;
	const view = whoItHitsWindow(question);
	// An element, not a string: core runs a string through its sanitizer, and this markup is ours.
	const content = contentElement(view.content, document);
	const ticked = form => [...(form?.querySelectorAll?.(`input[name="${TARGET_FIELD}"]:checked`) ?? [])]
		.map(input => candidates[Number(input.value)])
		.filter(Boolean);
	return DialogV2.wait({
		classes: themedDialogClasses("stonetop-fight-targets-app"),
		window: { title: view.title },
		// Sized, or core fits the window to the hint's one long line and it spans the whole screen.
		position: { width: 440 },
		content,
		buttons: [
			{ action: "hit", label: view.confirm, default: true, callback: (_event, button) => ticked(button?.form) },
			{ action: "cancel", label: view.cancel, callback: () => null },
		],
		// The confirm button names who is ticked, and cannot be pressed with nobody ticked.
		render: (_event, dialog) => {
			const root = dialog?.element ?? dialog;
			const form = root?.querySelector?.("form") ?? root;
			const confirm = root?.querySelector?.('button[data-action="hit"]');
			root?.addEventListener?.("change", () => {
				if (!confirm) return;
				const now = ticked(form);
				// Core puts a button's label in a span of its own (DialogV2#_renderButtons); keep it there.
				(confirm.querySelector?.("span") ?? confirm).textContent = whoItHitsConfirm(now);
				confirm.disabled = now.length === 0;
			});
		},
		rejectClose: false,
	}).catch(() => null).then(answer => (Array.isArray(answer) && answer.length ? answer : null));
}

/**
 * Who a roll hits: the hand targets when there are any, else whoever the roller is fighting, asking
 * which when that is more than one. Resolves to an array (empty when there is nobody to hit, which
 * rolls damage at no one, as before), or null when the roller backed out of the question.
 *
 * @param {Actor} actor
 * @param {object} [options]
 * @param {object[]} [options.handTargets]  the roller's own targets, frozen
 * @param {string} [options.roller]  who the question names, when that is not `actor`: a follower
 *   off the map, fighting beside the character it is aimed by
 * @param {typeof askWhoItHits} [options.ask]
 * @returns {Promise<object[]|null>}
 */
export async function rollTargets(actor, { handTargets = [], roller = "", ask = askWhoItHits } = {}) {
	if (handTargets?.length) return handTargets;
	const engaged = engagedOpponents(actor);
	if (engaged.length < 2) return engaged;
	return ask({ roller: roller || actor?.name || "", candidates: engaged });
}
