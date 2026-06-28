import { STONETOP_SCOPE } from "./StonetopFlags.js";
import { escHtml } from "../../utils/strings.js";
import { stonetopChatCard } from "../../utils/chat.js";

export const WBH_PLAYBOOK_NAME = "The Would-Be Hero";
export const WBH_HERO_NAME     = "The Hero";
export const WBH_HERO_FLAG     = "wbhBecameHero";
const _PROMPT_FLAG = "wbhAsteriskPrompt";

const POTENTIAL_FOR_GREATNESS = "Potential for Greatness";
const _STAT_KEYS = new Set(["str", "dex", "con", "int", "wis", "cha"]);

// The Would-Be Hero's asterisked moves carry their trigger in the move data:
// system.asterisk = { basicMove, minTotal, question }. "The first time you use
// any move marked with an asterisk, cross off 'Would-be'." None of them roll
// dice, so we watch the basic-move roll the trigger names; when a Would-Be Hero
// who owns the move makes that roll (meeting the threshold), we ask in chat
// whether the condition applied, with a button to cross off "Would-be".

/** Display name for the playbook header — "The Hero" once "Would-be" is crossed off. */
export function heroDisplayName(playbookName, becameHero) {
	return (becameHero && playbookName === WBH_PLAYBOOK_NAME) ? WBH_HERO_NAME : playbookName;
}

/**
 * Called after a character move roll. If the roller is a Would-Be Hero who owns
 * an asterisked move whose trigger matches this roll, post a chat prompt asking
 * whether they just used it (and offering to cross off "Would-be").
 */
export async function maybePromptAsteriskMove(actor, moveName, total) {
	if (actor?.type !== "character" || !moveName) return;
	if (actor.system?.playbook?.name !== WBH_PLAYBOOK_NAME) return;
	if (actor.getFlag(STONETOP_SCOPE, WBH_HERO_FLAG)) return; // already a Hero

	const move = actor.items.find(i => i.type === "move"
		&& i.system?.asterisk?.basicMove === moveName
		&& total >= (i.system.asterisk.minTotal ?? 0));
	if (!move) return;

	await ChatMessage.create({
		content: _promptContent(actor, move.name, move.system.asterisk.question),
		speaker: ChatMessage.getSpeaker({ actor }),
		flags: { [STONETOP_SCOPE]: { [_PROMPT_FLAG]: { actorId: actor.id } } },
	});
}

/**
 * Called after a stat roll. Potential for Greatness is marked "Once per level, when you
 * roll a stat and get a 10+." It is NOT collected at level-up — so when a Would-Be Hero who
 * still owns an unmarked PfG box rolls a 10+ on an actual stat roll (not a follower/crew
 * roll) and hasn't yet taken this level's mark, post a chat reminder. The once-per-level
 * cap is read straight from the stored marks ({ stat, level }) keyed by move name.
 */
export async function maybeRemindPotentialForGreatness(actor, statKey, total) {
	if (actor?.type !== "character" || total < 10) return;
	if (actor.system?.playbook?.name !== WBH_PLAYBOOK_NAME) return;
	if (!_STAT_KEYS.has(statKey)) return; // follower/crew rolls aren't "rolling a stat"

	const pfg = actor.items.find(i => i.type === "move" && i.name === POTENTIAL_FOR_GREATNESS);
	const markOptions = pfg?.system?.markOptions ?? [];
	if (!markOptions.length) return;

	const moveMarks = (actor.getFlag(STONETOP_SCOPE, "moves.moveMarks") ?? {})[POTENTIAL_FOR_GREATNESS] ?? {};
	const entriesAt = slug => Array.isArray(moveMarks[slug]) ? moveMarks[slug] : [];
	const capacity  = markOptions.reduce((n, o) => n + (o.marks ?? 1), 0);
	const used      = markOptions.reduce((n, o) => n + entriesAt(o.slug).length, 0);
	if (used >= capacity) return; // all six boxes already filled

	const level = actor.system?.attributes?.level?.value ?? 1;
	if (markOptions.some(o => entriesAt(o.slug).some(e => e?.level === level))) return; // already marked this level

	await ChatMessage.create({
		content: stonetopChatCard("Potential for Greatness",
			`<div class="stonetop-roll-card-description">
				<p><strong>${escHtml(actor.name)}</strong> rolled a <strong>10+</strong> on a stat roll and hasn't yet marked <strong>Potential for Greatness</strong> this level.</p>
				<p><em>Once per level, when you roll a stat and get a 10+,</em> mark one box: increase the stat you rolled (${statKey.toUpperCase()}) by 1 to a max of +2, increase your max HP by 4, or increase your damage die to a d8.</p>
			</div>`),
		speaker: ChatMessage.getSpeaker({ actor }),
	});
}

/** Cross off "Would-be": flag the actor as a Hero and announce it. */
export async function crossOffWouldBe(actor) {
	if (!actor || actor.getFlag(STONETOP_SCOPE, WBH_HERO_FLAG)) return;
	await actor.setFlag(STONETOP_SCOPE, WBH_HERO_FLAG, true);
	await ChatMessage.create({
		content: stonetopChatCard("A Would-Be Hero No Longer",
			`<div class="stonetop-roll-card-description">
				<p><strong>${escHtml(actor.name)}</strong> has crossed off &ldquo;Would-be&rdquo; &mdash; they are now <strong>${WBH_HERO_NAME}</strong>.</p>
			</div>`),
		speaker: ChatMessage.getSpeaker({ actor }),
	});
}

function _promptContent(actor, moveName, question) {
	return stonetopChatCard(`${moveName} *`,
		`<div class="stonetop-roll-card-description">
			<p>${escHtml(question)}</p>
			<p>If so, you are a Would-be Hero no longer &mdash; cross off &ldquo;Would-be.&rdquo;</p>
		</div>
		<div class="card-buttons stonetop-card-buttons">
			<button class="stonetop-become-hero-btn" data-actor-id="${actor.id}"><i class="fas fa-star"></i> Become a Hero</button>
		</div>`);
}
