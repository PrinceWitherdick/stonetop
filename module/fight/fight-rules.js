// Book I on fights with several combatants, quoted as printed (pp.414-418).
//
// TRANSCRIPTION, NOT COPY. Every text here is the book's own words and punctuation, extracted from
// the PDF's text layer, which is why this file is waived in tests/copy/no-em-dashes.test.js. The
// Fight tab shows these under "What the book says", beside its own short computed lines; nothing of
// ours belongs in this file, and a rule that needs rewording to fit is a rule that belongs in
// en.json as our copy, not here as the book's.
//
// `gmOnly` marks advice written to the GM ("make your move extra hard"). A player's tab leaves those
// out: they are not secrets, but they are not the player's to act on either.
//
// The page is the PRINTED page, for bookPageCites (gm-toolkit/book-ref.js).

/** @type {Record<string, {page: number, book: number, gmOnly: boolean, text: string}>} */
export const FIGHT_RULES = Object.freeze({
	smallerEngagements: Object.freeze({
		book: 1,
		page: 414,
		gmOnly: true,
		text: "When the PCs face multiple foes (and they often will), break up the action into multiple smaller engagements—the Ranger fights one crinwin, the Fox fights another, the Marshal and his crew deal with the rest of them. This isn’t anything formal. It’s just a natural way to manage the scene.",
	}),
	unengagedFoes: Object.freeze({
		book: 1,
		page: 414,
		gmOnly: true,
		text: "Unengaged foes—those that aren’t pinned down in combat—are all sorts of potential trouble. Incorporate them into your moves whenever you have the chance. Announce trouble and have them move to flank the PCs. Demonstrate a downside of being outnumbered and have them block a PC’s path. Reveal an unwelcome truth and have one come out of nowhere and smack a PC when they roll a 6-. Bad guys don’t just sit around waiting to be attacked.",
	}),
	engagesMultiple: Object.freeze({
		book: 1,
		page: 414,
		gmOnly: true,
		text: "When a PC or follower engages multiple foes, make more aggressive moves than when they face a single foe. If they ignore the threat posed by multiple foes, tell them the consequences and ask. If they carry on and ignore the threat, or roll a 6-, or otherwise suffer the enemy’s attack, then make your move extra hard.",
	}),
	oneRollsOthersAid: Object.freeze({
		book: 1,
		page: 414,
		gmOnly: false,
		text: "When multiple PCs and/or followers attack a foe at once, one of them rolls Clash or Let Fly and the others Aid. If a group of followers attacks a single foe (or a significantly smaller group), they effectively Aid themselves.",
	}),
	pileOnDamage: Object.freeze({
		book: 1,
		page: 414,
		gmOnly: false,
		text: "When multiple combatants deal damage to a single foe, roll one combatant’s damage (usually the best one) and add +1 extra damage for each capable attacker after the first. Apply tags from all the attackers as they make sense.",
	}),
	hurtMultiple: Object.freeze({
		book: 1,
		page: 414,
		gmOnly: false,
		text: "When a PC or follower’s attack could feasibly hurt multiple foes—because of the area tag, because a group of followers is making or Aiding the attack, or just because the player describes it in a way that makes sense—then the player rolls to Clash or Let Fly just once, but they roll damage separately against each foe.",
	}),
	groupAsOne: Object.freeze({
		book: 1,
		page: 416,
		gmOnly: false,
		text: "If the group deals damage to another group, or takes damage from another group, then you can roll damage once per side and abstract the results. A group deals damage and has HP and armor as though it was one individual member of the group.",
	}),
	groupOutnumbers: Object.freeze({
		book: 1,
		page: 416,
		gmOnly: false,
		text: "If one group outnumbers the other, they get a +1 bonus to damage and armor for every multiplier past 1.",
	}),
	groupCasualties: Object.freeze({
		book: 1,
		page: 416,
		gmOnly: false,
		text: "Damage represents casualties. If one group loses half its HP, then about half that group’s numbers are out the action. Adjust the bonuses to damage and armor accordingly!",
	}),
	engagedByPcs: Object.freeze({
		book: 1,
		page: 416,
		gmOnly: false,
		text: "Foes that are engaged by individual PCs aren’t really part of a group.",
	}),
	routed: Object.freeze({
		book: 1,
		page: 416,
		gmOnly: false,
		text: "A group reduced to 0 HP is routed, massacred, or otherwise defeated. The fate of individuals within each group is up to you.",
	}),
	noTurns: Object.freeze({
		book: 1,
		page: 417,
		gmOnly: false,
		text: "Players shouldn’t get bored waiting for “their turn,” and the outcome should never be entirely certain.",
	}),
	mapsFocus: Object.freeze({
		book: 1,
		page: 418,
		gmOnly: true,
		text: "Be careful, though, not to let the map dominate the game. Use the map to visualize and communicate, but keep the focus on the conversation.",
	}),
});

/**
 * The quotes to show, in the order asked, each once, with a player's view leaving the GM's advice out.
 *
 * @param {string[]} keys
 * @param {{isGM?: boolean}} [viewer]
 * @returns {Array<{key: string, page: number, book: number, gmOnly: boolean, text: string}>}
 */
export function fightRuleQuotes(keys = [], { isGM = false } = {}) {
	const out = [];
	for (const key of Array.isArray(keys) ? keys : []) {
		const rule = FIGHT_RULES[key];
		if (!rule || out.some(q => q.key === key)) continue;
		if (rule.gmOnly && !isGM) continue;
		out.push({ key, ...rule });
	}
	return out;
}
