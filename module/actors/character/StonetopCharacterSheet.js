import {MoveResourceButton} from "./elements/move-resource-button.js";
import {BackgroundInputChoice} from "./elements/background-input-choice.js";
import {PossessionUseButton} from "./elements/possession-use-button.js";
import {OutfitMoveDialog} from "./dialogs/OutfitMoveDialog.js";
import {RequisitionDialog} from "./dialogs/RequisitionDialog.js";
import {LevelUpDialog} from "./dialogs/LevelUpDialog.js";
import {DeathsDoorDialog} from "./dialogs/DeathsDoorDialog.js";
import {PlaybookPickerDialog} from "./dialogs/PlaybookPickerDialog.js";
import {ANIMAL_COMPANION_TRAIT_GLOSSARY, CharacterOnboardingDialog} from "./dialogs/CharacterOnboardingDialog.js";
import {CharacterLedger} from "./CharacterLedger.js";
import {ledgerNounOptionsHtml, wireLedgerFilters} from "../../utils/ledger-filter.js";
import {resolvedFlags, resolvedFlagProperty, STONETOP_SCOPE} from "./StonetopFlags.js";
import {rollDamage, sign} from "../../utils/roll-engine.js";
import {dieFromDamage} from "../../utils/damage.js";
import {normalizeRollType} from "../../utils/roll-types.js";
import {escHtml, isDefaultImg, normalizePlaybookGlyphs} from "../../utils/strings.js";
import {postMoveToChat} from "../../utils/chat.js";
import {getStonetopSteadingActor} from "../../utils/world.js";
import {getDragEventData, deletionEntry} from "../../utils/foundry-compat.js";
import {STEADING_DEFAULTS, StonetopSteading} from "../steading/StonetopSteading.js";
import {getHoverDescriptionSetting, getRollStatChipsSetting, getCharacterSheetWidth, setCharacterSheetWidth, getCrewSectionsOpen, setCrewSectionsOpen} from "../../settings.js";
import {attachKeepOnTop, keepDialogOnTop} from "../../utils/keep-on-top.js";
import {withSectionEditing} from "../../utils/section-editing.js";
import {applyLabelTooltips} from "../../utils/label-tooltips.js";
import {wrapStonetopGlyphsInEl} from "../../utils/glyphs.js";
import {BEAST_CATALOG, BEAST_ORDER} from "../../data/beasts.js";
import {FOLLOWER_MOVES} from "../../data/follower-moves.js";

const _STAT_KEYS = new Set(["str", "dex", "int", "wis", "con", "cha"]);
const _STAT_CHOICES = [..._STAT_KEYS].map(k => [k, k.toUpperCase()]);

// Playbook moves that let a character roll a different stat for a basic move. When
// the actor owns `ownsMove`, the basic move named `whenMove` (or, for blanket
// grants, any move whose default stat is `whenDefaultStat`) offers `altStat` as an
// extra choice in the roll's stat picker. Mind Over Magic (arcanum rolls) is not
// covered here — arcana roll through a separate path.
const ALT_STAT_GRANTS = [
	{ whenMove: "Clash",               ownsMove: "Skill at Arms",    altStat: "dex" },
	{ whenMove: "Clash",               ownsMove: "Purifying Flames", altStat: "wis" },
	{ whenMove: "Know Things",         ownsMove: "Well-Read",        altStat: "wis" },
	{ whenMove: "Persuade (vs. NPCs)", ownsMove: "Wild Speech",      altStat: "wis" },
	{ whenDefaultStat: "con",          ownsMove: "Laugh at Danger",  altStat: "cha" },
];

const STAT_TOOLTIPS = {
	str: "Your physical power and ability to use it. Roll +STR to Clash, or to Defy Danger with raw might or power.",
	dex: "Your grace and fine motor control. Roll +DEX to Let Fly, or to Defy Danger with speed, agility, finesse.",
	int: "Your memory, learning, and quick thinking. Roll +INT to Know Things, or to Defy Danger via expertise or a clever plan.",
	wis: "Your intuition, self-control, and awareness. Roll +WIS to Seek Insight, or when you rely on your willpower or senses to Defy Danger.",
	con: "Your stamina, grit, determination, and endurance. Roll +CON to Defend, or to Defy Danger by holding steady or enduring hardship.",
	cha: "Your ability to charm and connect with others, and to get a read on what others want. Roll +CHA to Persuade, or to Defy Danger socially.",
};

// Hover tooltips for the vitals row (Damage/HP/Armor/XP/Level), keyed by the
// label's data-vital attribute. Gated by hoverDescriptionsVitals.
const VITAL_TOOLTIPS = {
	damage: "Your damage die. Roll it when you deal damage; moves, gear, and tags can raise or lower it.",
	hp:     "Hit points. Lose them when you take damage; at 0 HP you're dying and must roll Last Breath. Your max is set by your playbook and CON.",
	armor:  "Reduces the damage you take — subtract it from each hit. Computed from the gear you're wearing.",
	xp:     "Experience. Mark 1 XP on a miss (roll 6-) and from some moves; when the track fills, spend it to level up.",
	level:  "Your character level. Higher levels let you learn advanced moves and raise the XP needed to advance.",
};

// Plain-language explanations for an Invocation's Reduced / Empowered effects,
// surfaced as hover tooltips on those labels in the Invocations tab.
const INVOCATION_EFFECT_TOOLTIPS = {
	reduced:   "When you Invoke the Sun God, one consequence you can choose — and must, on a 7-9 — is for the Invocation to take this weaker, reduced effect instead.",
	empowered: "With the Empowered Invocations move (6th level), you can choose an extra consequence before you roll to give the Invocation this stronger, empowered effect.",
};

// Wrap the "Reduced:" / "Empowered:" labels inside an Invocation's description
// HTML so they carry a hover tooltip explaining what those effect tiers mean.
function _annotateInvocationEffects(html) {
	return String(html).replace(/<strong>(Reduced|Empowered):<\/strong>/g, (_match, label) => {
		const tip = INVOCATION_EFFECT_TOOLTIPS[label.toLowerCase()];
		return `<strong class="stonetop-invocation-effect-label" data-tooltip="${escHtml(tip)}" data-tooltip-direction="UP">${label}:</strong>`;
	});
}

const _esc = escHtml;

function _formatResultLine(text) {
	return _esc(text).replace(/^(7\+|10\+|7-9|6-):/, "<strong>$1:</strong>");
}

const GUIDED_CHARACTER_MOVES = {
	"The Hammer and the Book": {
		trigger: "When you strike a thing of supernatural chaos, roll +WIS.",
		fields: [
			{ name: "target", label: "Target", placeholder: "What supernatural chaos are you striking?" },
		],
		results: ["10+: deal your damage and choose 1.", "7-9: deal damage and choose 1, but expose yourself to harm or unwanted attention."],
		picksLabel: "Choose 1:",
		picks: ["Deal +1d6 damage", "Ignore the thing's armor or other defenses", "Suppress one of its unnatural powers", "Force it from its host"],
	},
	"All is Illuminated": {
		trigger: "When you look closely on another and see their soul laid bare, roll +WIS.",
		fields: [{ name: "subject", label: "Subject", placeholder: "Whose soul are you seeing?" }],
		results: ["10+: ask 1 question from the list, plus what would make them feel loved, beautiful, or worthy.", "7-9: ask 1 question from the list."],
		picksLabel: "Questions:",
		picks: ["Of what are they most ashamed?", "What do they most desire or covet?", "What hope have they abandoned?", "Who or what is most precious to them?", "What would make them feel loved, beautiful, or worthy?"],
	},
	"Helior's Unblinking Eye": {
		trigger: "When you stare into the sun long enough to lose your vision, name a person or place that you know and roll +WIS.",
		fields: [{ name: "subject", label: "Person or place", placeholder: "Who or where are you seeking?" }],
		results: ["10+: briefly glimpse your subject and choose 2.", "7-9: briefly glimpse your subject and choose 1."],
		picksLabel: "Choose:",
		picks: ["The glimpse lasts as long as you wish", "Your point of view shifts to very close range", "You recover your vision quickly"],
	},
	"Invoke the Sun God": {
		trigger: "When you imbue a holy light with Helior's power, choose an Invocation you know and roll +WIS.",
		fields: [{ name: "invocation", label: "Invocation", placeholder: "Which Invocation are you using?" }],
		results: ["10+: it works, but choose 1 consequence.", "7-9: it works, but you and the GM each choose 1 consequence."],
		picksLabel: "Consequences:",
		picks: ["The Invocation has its reduced effect", "The effort taxes you; mark a debility", "The light is snuffed out when the Invocation is complete, its fuel consumed", "You must bask in sunlight for an hour or so before using that Invocation again"],
	},
	"Alpha": {
		trigger: "When you assert dominance over another, roll +WIS.",
		fields: [{ name: "target", label: "Target", placeholder: "Beast, spirit, Fae, person..." }],
		results: ["7+: they must pick 1.", "10+: you also have advantage on your next roll against them."],
		picksLabel: "They pick 1:",
		picks: ["Accept your authority, at least for now", "Slink away or flee, then avoid you", "Fight you for dominance"],
	},
	"Call the Shot": {
		trigger: "When you take your time and calmly line up the perfect shot, either deal your damage or roll +DEX.",
		fields: [{ name: "target", label: "Target", placeholder: "Who or what are you shooting?" }],
		results: ["10+: deal your damage and pick 2.", "7-9: deal your damage and pick 1."],
		picksLabel: "Pick:",
		picks: ["Ignore armor or deal +1d4 damage", "Stun, hobble, or hinder them", "Make them trip or drop what they're holding", "Do no harm; do not deal your damage after all"],
	},
	"Expert Tracker": {
		trigger: "When you follow a creature's trail, roll +WIS.",
		fields: [{ name: "quarry", label: "Quarry", placeholder: "Whose trail are you following?" }],
		results: ["7+: follow it to a significant change in terrain or activity.", "10+: ask a reasonable question about your quarry and get a useful answer."],
		picksLabel: "Possible question:",
		picks: ["What happened here recently?", "Ask another reasonable question about your quarry"],
	},
	"Ambush": {
		trigger: "When you get the drop on a nearby foe, deal your damage or roll +DEX.",
		fields: [{ name: "target", label: "Target", placeholder: "Who are you ambushing?" }],
		results: ["10+: deal your damage and pick 2.", "7-9: deal damage and pick 1."],
		picksLabel: "Pick:",
		picks: ["Deal +1d4 damage", "Stop them from making noise/raising an alarm", "Slip away before they can react", "Create an opportunity; you or an ally gains advantage on the next move to act on it"],
	},
	"Burgle": {
		trigger: "When you sneak off on your own into a dangerous place, roll +INT.",
		fields: [{ name: "place", label: "Place", placeholder: "Where are you sneaking?" }],
		results: ["7+: you make it back; the GM says where you got to and what you learned.", "10+: also pick 2.", "7-9: also pick 1.", "6-: make it back with trouble in tow, or you are missing in action."],
		picksLabel: "Pick:",
		picks: ["You got away clean, rousing no suspicion", "You swiped something valuable", "You set something up to exploit on your return", "Ask a Seek Insight question about what you saw"],
	},
	"Danger Sense": {
		trigger: "When the GM says yes, there is an ambush or trap here, roll +INT.",
		fields: [{ name: "hazard", label: "Ambush or trap", placeholder: "What are you worried about?" }],
		results: ["10+: ask both questions.", "7-9: ask 1 question.", "Either way, gain advantage on your next roll to act on the answer."],
		picksLabel: "Questions:",
		picks: ["What will trigger the ambush or trap?", "What will happen once it is triggered?"],
	},
	"Silver Tongued": {
		trigger: "When you use words to avoid suspicion or trouble, roll +CHA.",
		fields: [{ name: "situation", label: "Situation", placeholder: "What suspicion or trouble are you avoiding?" }],
		results: ["10+: hold 3 Nerve.", "7-9: hold 1 Nerve."],
		picksLabel: "Spend Nerve 1-for-1 to:",
		picks: ["Move about or maneuver unchallenged", "Withstand direct scrutiny or questioning", "Direct suspicion or attention elsewhere"],
	},
	"Danu's Grasp": {
		trigger: "When you call on the world itself to bind a spirit or a perversion of nature, spend 1 Stock and roll +WIS.",
		fields: [{ name: "target", label: "Target", placeholder: "What are you binding?" }],
		results: ["7+: roots, vines, and earth pull at them, and they pick 1.", "10+: both apply."],
		picksLabel: "They pick:",
		picks: ["They are restrained, unable to act freely until your focus slips or they tear their way free", "They take 2d4 damage, ignores armor"],
		note: "Spend 1 Stock before rolling.",
	},
	"Veil": {
		trigger: "When you wrap yourself or another in a subtle veil, spend 1 Stock and choose 1. When your deception comes under scrutiny, roll +INT.",
		fields: [{ name: "subject", label: "Subject", placeholder: "Who is veiled?" }],
		results: ["Choose the veil effect before scrutiny. Roll +INT when the deception comes under scrutiny."],
		picksLabel: "Choose 1:",
		picks: ["A type of being you name will tend to ignore your presence", "People will perceive you as someone else"],
		note: "Spend 1 Stock when wrapping the veil.",
	},
	"Work With What You've Got": {
		trigger: "When you cleverly use your environment to harm or impede your foe(s), roll +INT.",
		fields: [{ name: "environment", label: "Environment", placeholder: "What are you using?" }],
		results: ["10+: pick 2.", "7-9: pick 1."],
		picksLabel: "Pick:",
		picks: ["Interrupt or thwart their action(s)", "Create an opportunity that grants advantage on the next roll to exploit it", "Deal damage appropriate to the source"],
	},
	"Formidable": {
		trigger: "When you wade into battle, you can choose to roll +CHA.",
		fields: [{ name: "battle", label: "Battle", placeholder: "Where are you wading in?" }],
		results: ["10+: both.", "7-9: pick 1.", "6-: pick 1 but ask the GM what you missed."],
		picksLabel: "Effects:",
		picks: ["Lesser foes quail, hesitate, or flee before you", "Doughty foes focus on you as the greatest threat"],
	},
	"Prepare a Welcome": {
		trigger: "When battle is joined, spend 1 Surprise to reveal a ploy, defense, or dirty trick and roll +INT.",
		fields: [{ name: "ploy", label: "Ploy", placeholder: "What did you prepare?" }],
		results: ["10+: it works as well as can be expected, and you regain 1 Surprise.", "7-9: it works as well as can be expected."],
		note: "Hold 1 Surprise if rushed or 2 Surprise if you can take your time.",
	},
	"We Happy Few": {
		trigger: "When you give an inspiring speech to your allies before facing a dire threat, roll +CHA.",
		fields: [{ name: "threat", label: "Dire threat", placeholder: "What are you facing?" }],
		results: ["10+: each ally holds 2 Inspiration.", "7-9: each ally holds 1 Inspiration.", "6-: each ally holds 1, but you have disadvantage until you share your doubts."],
		picksLabel: "Spend Inspiration 1-for-1 to:",
		picks: ["Act fearlessly in the face of terror or overwhelming odds", "Keep 1 HP instead of being reduced to 0 HP", "Add 1d6 to a damage roll they just made"],
	},
	"Censure": {
		trigger: "When you first denounce an individual in your presence as an agent of chaos or anathema to civilization, they pick 1.",
		fields: [{ name: "target", label: "Target", placeholder: "Who are you denouncing?" }],
		picksLabel: "They pick 1:",
		picks: ["They are ashamed, and act accordingly", "They are doubtful, and hesitate, pause", "They are afraid, and seek to escape", "They are enraged, and lash out predictably"],
	},
	"Piety": {
		trigger: "When you spend at least an hour in proper worship to Helior, hold 1 Blessing. Other faithful PCs who partake also hold 1 Blessing.",
		fields: [{ name: "worship", label: "Worship", placeholder: "Where and how do you worship?" }],
		picksLabel: "Spend Blessing to:",
		picks: ["Add +1 to a roll you just made in pursuit of a righteous cause"],
	},
	"Anger is a Gift": {
		trigger: "When you burn with righteous anger, hold 2 Resolve.",
		fields: [{ name: "anger", label: "Righteous anger", placeholder: "What makes you burn?" }],
		picksLabel: "Spend Resolve 1-for-1 to:",
		picks: ["Set aside fear and doubt to do what must be done", "Act suddenly, catching them off-guard", "Inspire allies or bystanders to follow your lead", "Strike hard (+1d4 damage, forceful)", "Keep your footing, position, and/or your course despite what befalls you"],
	},
	"I Get Knocked Down": {
		trigger: "When you take damage despite your best efforts to avoid it, you can halve the damage but pick 1.",
		fields: [{ name: "damage", label: "Damage", placeholder: "What damage are you halving?" }],
		picksLabel: "Pick 1:",
		picks: ["You lose something", "Something on your person breaks", "You are out of it for a moment"],
	},
	"Up With People": {
		trigger: "When you converse with someone, you can hold 2 Rapport with them. If you do, they hold 1 Rapport with you.",
		fields: [{ name: "person", label: "Person", placeholder: "Who are you talking with?" }],
		picksLabel: "Spend Rapport to ask:",
		picks: ["What weighs you down or holds you back?", "What drives you forward?", "What lesson would you have me learn?", "What do you think of me, truly?"],
	},
	"A Safe Place": {
		trigger: "When you select and prepare the party's camp site, hold 1 Precaution, or 2 if well-versed with this area and its dangers.",
		fields: [{ name: "camp", label: "Camp site", placeholder: "Where are you making camp?" }],
		picksLabel: "Spend Precaution to reveal:",
		picks: ["A simple defense", "A warning", "A trick prepared in advance"],
	},
	"Beast of Legend": {
		trigger: "Each time you take this move, pick 1 for your animal companion.",
		picksLabel: "Pick 1:",
		picks: ["They are exceptional", "They get +4 HP and +1 armor", "They develop a unique ability or trait"],
	},
	"Blot Out the Sun": {
		trigger: "When you Let Fly with a bow, deplete your ammunition before rolling. If you do, choose 1.",
		picksLabel: "Choose 1:",
		picks: ["Gain advantage on your damage roll", "Add the area tag to your attack"],
	},
	"Survivalist": {
		trigger: "When you Forage, pick 1 extra choice and add a new option.",
		picksLabel: "Added Forage option:",
		picks: ["Find or fashion some useful item or supply"],
	},
	"Second Intent": {
		trigger: "When you Defend and spend 1 Readiness to Parry & Riposte, also pick 1 option from the Ambush list.",
		picksLabel: "Pick 1:",
		picks: ["Deal +1d4 damage", "Stop them from making noise/raising an alarm", "Slip away before they can react", "Create an opportunity; you or an ally gains advantage on the next move to act on it"],
	},
	"Potent Workings": {
		trigger: "When you craft a protective charm, spend 1 additional Stock to choose 1.",
		picksLabel: "Choose 1:",
		picks: ["Name an additional type of harm", "On a 10+, the charm retains its potency"],
	},
	"Rites of the Land": {
		trigger: "Once per season, when you oversee the sacred rites, hold 1 Favor. If you also sacrifice 1 Surplus, hold 4 Favor instead.",
		picksLabel: "Public sacrifice result:",
		picks: ["Clear a steading debility", "Gain advantage when the steading next rolls +Fortunes"],
	},
	"Safety First": {
		trigger: "When you spend an hour or so preparing your mystical defenses, hold 2 Protection.",
		picksLabel: "Spend Protection to:",
		picks: ["Gain advantage on a roll to resist harmful magic", "Halve harmful magic's damage/effects"],
	},
	"Guardian": {
		trigger: "When you Defend, hold 1 extra Readiness. Even on a 6-, hold 1 Readiness plus whatever the GM says.",
		picksLabel: "Reminder:",
		picks: ["Hold 1 extra Readiness", "On a 6-, hold 1 Readiness"],
	},
	"Mighty Thews": {
		trigger: "When you perform a feat of extraordinary strength, you do it but pick 1.",
		fields: [{ name: "feat", label: "Feat", placeholder: "What are you doing?" }],
		picksLabel: "Pick 1:",
		picks: ["It takes a while", "You cause unwanted damage or harm", "It takes a toll (mark a debility)"],
	},
	"Front Line Leader": {
		trigger: "When you lead your crew into battle, hold 2 Presence.",
		picksLabel: "Spend Presence as:",
		picks: ["Crew Loyalty", "Readiness, as if you Defended them"],
	},
	"Heroes to the Last": {
		trigger: "Each time you take this move, pick 1 for your crew.",
		picksLabel: "Pick 1:",
		picks: ["They are exceptional", "They are inured to terror and horror", "Increase their max HP by 4 each", "Increase their damage die one size"],
	},
	"Stentorian": {
		trigger: "When you go into battle, hold 2 Command. Spend 1 Command to shout an order or warning and pick 1.",
		picksLabel: "Pick 1:",
		picks: ["PCs get advantage on their next roll to do as you say", "You have advantage to Order Followers or Deploy"],
	},
	"Veteran Crew": {
		trigger: "Each time you take this move, pick 1. You can also reselect the crew's Instinct and Cost.",
		picksLabel: "Pick 1:",
		picks: ["Select 2 new tags for your Crew", "Increase their damage die from d6 to d8", "Increase their max HP by 2 each"],
	},

	// ── Expedition moves ──────────────────────────────────────────────
	// Procedural moves open a step-by-step guide; rolling moves add a Roll
	// button driven by `roll` (a stat key, or "ask" to pick a stat). Requisition
	// and Outfit have their own dialogs and are dispatched separately.
	"Chart a Course": {
		trigger: "When you wish to travel to a distant place, name or describe your destination; if the route is unclear, tell the GM how you intend to reach it. The GM tells you what's required, the risks, and how long it will take.",
		fields: [
			{ name: "destination", label: "Destination", placeholder: "Where are you headed?" },
			{ name: "route", label: "Intended route", placeholder: "How do you mean to get there?", type: "textarea" },
		],
		results: [
			"The GM presents each challenge — plus surprises — one at a time.",
			"Address them all to reach your destination.",
		],
		note: "Travel times from Stonetop are listed in the move's description.",
	},
	"Forage": {
		trigger: "When you spend a few hours seeking food in the wild, roll +WIS. In winter, you have disadvantage.",
		results: ["10+: pick 2.", "7-9: pick 1.", "6-: you find nothing, and there is danger or risk."],
		picksLabel: "Pick:",
		picks: [
			"Acquire 4 provisions (1d6 uses)",
			"Acquire an extra 1d6 uses of provisions",
			"Discover something interesting or useful",
			"Avoid danger or risk (else, there is some)",
		],
		note: "Provisions can substitute for supplies when you Make Camp, 1-for-1.",
		roll: "wis",
	},
	"Have What You Need": {
		trigger: "When you decide that you had something all along, transfer a mark (or marks) from your unassigned inventory to a specific item or slot.",
		fields: [{ name: "item", label: "What you had all along", placeholder: "The item you're revealing…" }],
		results: [
			"Mark a slot: fill it with a common mundane item or something from your special possessions.",
			"Or expend a use of supplies to mark an additional small item/slot.",
		],
		note: "It must be something you could plausibly have had all along; the GM or any player can veto unreasonable items.",
	},
	"Keep Company": {
		trigger: "When you spend a stretch of time together, ask the others if they want to Keep Company. If they do, take turns asking a PC or NPC one of the following.",
		picksLabel: "Ask one another:",
		picks: [
			"What do you do that's annoying/endearing?",
			"What do I do that you find annoying/endearing?",
			"Who or what seems to be on your mind?",
			"What do we find ourselves talking about?",
			"How do you/we pass the time?",
			"What new thing do you reveal about yourself?",
		],
	},
	"Make Camp": {
		trigger: "When you settle in to rest in an unsafe area, answer the GM's questions about your campsite. Each member consumes 1 use of supplies or provisions.",
		results: ["If you eat and drink your fill and get at least a few hours' sleep, pick 1:"],
		picksLabel: "Pick 1:",
		picks: [
			"Regain HP equal to ½ your max (round up)",
			"Clear a debility",
		],
		note: "A mess kit (fire & water) lets 1 use provide for up to four people. If your rest was particularly peaceful, also gain advantage on your next roll.",
	},
	"Recover": {
		trigger: "When you take time to catch your breath and tend to what ails you, expend 1 use of supplies and regain HP equal to 4 + Prosperity.",
		fields: [{ name: "ailment", label: "What you're tending", placeholder: "Wound or debility…", type: "textarea" }],
		results: ["You can't gain this benefit again until you take more damage."],
		note: "When you tend to a debility or problematic wound, say how. The GM will say it's taken care of, or tell you what else is required.",
	},
	"Return Triumphant": {
		trigger: "When you return home in triumph — having saved your fellows, put down the threat, seized the opportunity, etc. — clear one of the steading's debilities (diminished, lacking, or malcontent).",
		fields: [{ name: "triumph", label: "Your triumph", placeholder: "What did you accomplish?", type: "textarea" }],
		note: "If the steading has no debilities marked, increase Fortunes by 1 instead.",
	},
	"Struggle as One": {
		trigger: "When you Defy Danger as a group, establish the party's approach and each roll +STAT (per Defy Danger).",
		fields: [{ name: "approach", label: "Party's approach", placeholder: "How are you facing this danger together?" }],
		results: [
			"10+: you do well enough to get someone else out of a spot, if you can tell us how.",
			"7-9: you pull your weight.",
			"6-: you find yourself in a spot — the GM will describe it or ask you to.",
		],
		note: "If you roll a 6- but someone saves you, don't mark XP.",
		roll: "ask",
	},
};

// Expedition moves that open their own bespoke dialog instead of the generic
// guided modal. Keyed by move name so the click handler stays a single lookup.
const EXPEDITION_MOVE_HANDLERS = {
	Requisition: sheet => sheet._onRequisition(),
	Outfit:      sheet => sheet._onOutfitOpen(),
};

// Inventory slugs that hold "uses of supplies", in the order Recover depletes
// them. Mirrors _PROSPERITY_RESOURCE_SLUGS in StonetopCharacter.js.
const RECOVER_SUPPLY_SLUGS = ["supplies", "more-supplies", "even-more-supplies"];

/** Canonical HTML for a move chat card. Both `name` and `description` are trusted module HTML. */
function _buildMoveChatContent(name, description) {
	return `<div class="stonetop-chat-move"><h3 class="stonetop-chat-move-name">${name}</h3><div class="stonetop-chat-move-description">${description}</div></div>`;
}


function _addToLeadingNumber(value, delta) {
	const match = String(value ?? "").match(/^(-?\d+)(.*)$/);
	if (!match) return value;
	return `${Number(match[1]) + delta}${match[2]}`;
}

function _addToDamage(value, delta) {
	const text = String(value ?? "");
	const match = text.match(/^([^(\s]+)(.*)$/);
	if (!match) return value;
	const formula = match[1].replace(/([+-]\d+)?$/, current => {
		const next = (current ? Number(current) : 0) + delta;
		return next > 0 ? `+${next}` : next < 0 ? String(next) : "";
	});
	return `${formula}${match[2]}`;
}

function _applyAnimalCompanionTraits(typeData, traits) {
	const traitText = traits.join(" ");
	const hpBonus     = [...traitText.matchAll(/[+](\d+)\s*HP/gi)]
		.reduce((sum, m) => sum + Number(m[1]), 0);
	const armorBonus  = [...traitText.matchAll(/[+](\d+)\s*armor/gi)]
		.reduce((sum, m) => sum + Number(m[1]), 0);
	const damageBonus = [...traitText.matchAll(/(?:Damage\s*)?[+](\d+)\s*damage/gi)]
		.reduce((sum, m) => sum + Number(m[1]), 0);
	return {
		hp:     typeData?.hp !== undefined ? Number(typeData.hp) + hpBonus : undefined,
		armor:  armorBonus  ? _addToLeadingNumber(typeData?.armor,  armorBonus)  : typeData?.armor,
		damage: damageBonus ? _addToDamage(typeData?.damage, damageBonus) : typeData?.damage,
	};
}

function _titleCase(value) {
	return String(value ?? "").toLowerCase().replace(/\b\p{L}/gu, char => char.toUpperCase());
}

function _animalCompanionTraitTooltip(trait) {
	const key = String(trait ?? "").trim().toLowerCase();
	return ANIMAL_COMPANION_TRAIT_GLOSSARY[key]
		?? ANIMAL_COMPANION_TRAIT_GLOSSARY[key.replace(/\s*\(.*/, "")]
		?? null;
}

function _makeLoyaltyPips(val, max = 3) {
	return Array.from({ length: max }, (_, i) => ({ index: i, filled: i < val }));
}

// Followers that can gain the "exceptional" tag, and the playbook move that
// grants it (Book I p.462: the crew "requires Heroes to the Last"; the Ranger's
// animal companion gets it from Beast of Legend). Other follower types have no
// such option in the rulebook, so they never show the exceptional control.
const FOLLOWER_EXCEPTIONAL = {
	"crew":             { move: "Heroes to the Last", noun: "crew" },
	"animal-companion": { move: "Beast of Legend",    noun: "animal companion" },
};

// Per-follower-type presentation constants, spread into each card builder in
// _buildFollowersData so a type's icon / damage-type tag / capability flags /
// default damage pronoun live in one place instead of being re-typed across the
// four builders. Only genuinely constant fields go here; per-instance values (a
// named companion's pronoun, a beast's follower-vs-livestock icon and label) are
// set after the spread and override these. A type omits a key when it has no
// constant for it — crew has static HP so no `hpFollower`; the beast's icon is
// per-instance so it sets `portraitIcon` itself.
const FOLLOWER_FTYPE_DEFAULTS = {
	"animal-companion": { ftype: "animal-companion", portraitIcon: "fas fa-paw",      damageType: "animal",   hpFollower: "animal-companion", showGear: true,  nameEditable: true, namePlaceholder: "Animal Companion" },
	"crew":             { ftype: "crew",             portraitIcon: "fas fa-users",    damageType: "crew",     damagePronoun: "they",          showGear: false, nameEditable: true, namePlaceholder: "Crew" },
	"initiate":         { ftype: "initiate",         portraitIcon: "fas fa-seedling", damageType: "initiate", hpFollower: "initiate",         showGear: true },
	"beast":            { ftype: "beast",            damageType: "beast",             damagePronoun: "it",    hpFollower: "beast",            showGear: true },
};

// Common, hand-editable follower fields shared by every card type on the
// Followers tab (matching the rulebook's blank Follower card): the exceptional
// toggle, free-text Moves and Notes, and a diamond Gear checklist. Each follower
// stores these under its own flag namespace (see _followerDetailBase); `d` is
// that raw object (may be undefined).
function _followerExtras(d = {}) {
	const moves   = String(d?.moves ?? "");
	const gearArr = Array.isArray(d?.gear) ? d.gear : [];
	return {
		exceptional: !!d?.exceptional,
		moves,
		movesLines:  moves.split("\n").map(s => s.trim()).filter(Boolean),
		gear:        gearArr.map((g, i) => ({ index: i, label: g?.label ?? "", checked: !!g?.checked })),
		notes:       String(d?.notes ?? ""),
	};
}

// Per-follower-type flag layout — the single source of truth both the read side
// (_buildFollowersData) and the write side (activateListeners) resolve paths
// through, so the two can't drift and a new follower type is one row:
//   detailBase  – `.details` namespace for hand-edited extras (moves / notes /
//                 gear) and the Damage / Instinct / Cost overrides. The `.details`
//                 sub-key on the singular types keeps these clear of the
//                 structural flags (name, loyalty, the crew's gear-pip inventory
//                 at `crew.gear`, tags…). `{slug}` is filled per instance for the
//                 repeatable types.
//   loyalty     – the (older) Loyalty store: scalar for the singular animal
//                 companion / crew, per-slug for initiates / beasts.
//   structural  – type-root fields the player edits directly. name / pronoun,
//                 plus instinct / cost on the types that carry them from
//                 onboarding. Editing one writes here, NOT to the override layer,
//                 so it can be cleared — an empty override would otherwise fall
//                 back to the onboarding value (see withStatOverrides).
const _FOLLOWER_FLAGS = {
	"animal-companion": { detailBase: "animalCompanion.details", loyalty: "animalCompanion.loyalty",
		structural: { name: "animalCompanion.name", pronoun: "animalCompanion.pronoun", instinct: "animalCompanion.instinct", cost: "animalCompanion.cost" } },
	"crew":             { detailBase: "crew.details",            loyalty: "crew.loyalty",
		structural: { name: "crew.name", instinct: "crew.instinct", cost: "crew.cost" } },
	"initiate":         { detailBase: "initiateDetails.{slug}",  loyalty: "initiatesLoyalty.{slug}", structural: {} },
	"beast":            { detailBase: "beastDetails.{slug}",     loyalty: "beastLoyalty.{slug}",     structural: {} },
};
const _fillSlug = (tpl, slug) => tpl == null ? null : tpl.replaceAll("{slug}", slug ?? "");

// `.details` namespace for a follower's hand-edited extras + stat overrides, or null.
function _followerDetailBase(ftype, slug) { return _fillSlug(_FOLLOWER_FLAGS[ftype]?.detailBase, slug); }

// Type-root path for a structurally-stored field (name / pronoun / instinct / cost), or null.
function _followerStructuralPath(ftype, field) { return _FOLLOWER_FLAGS[ftype]?.structural?.[field] ?? null; }

// Effective crew headcount: the stored size, else the rulebook's default
// half-dozen (Crew insert, p.144), but never fewer than the named individuals.
// Only a genuinely unset (null/undefined/non-numeric) size defaults to 6 — an
// explicit 0 is honoured, so emptying the roster doesn't spring back to six.
// Shared by the read side (_buildFollowersData) and the resize/delete handlers.
function _effectiveCrewSize(rawSize, namedCount) {
	const n = Number(rawSize);
	const base = Number.isFinite(n) ? Math.max(0, n) : 6;
	return Math.max(namedCount, base);
}

// Hard cap on crew headcount, so a fat-fingered roster size can't build a
// thousand-member anonymous list (and a thousand-die group HP pool).
const _CREW_SIZE_MAX = 99;

// Flag path where a follower type stores its Loyalty value, driving the single
// shared loyalty-pip click handler (see _FOLLOWER_FLAGS).
function _followerLoyaltyPath(ftype, slug) { return _fillSlug(_FOLLOWER_FLAGS[ftype]?.loyalty, slug); }

// Current HP against a max, with the shared "unset → full" default: a missing or
// non-numeric stored value means the follower is at full HP.
function _clampHp(raw, max) {
	const n = Number(raw);
	return raw != null && Number.isFinite(n) ? Math.min(Math.max(0, n), max) : max;
}

// Pull the rollable die and parenthetical "form" (e.g. "forceful") out of a
// free-text damage string like "d8 (forceful)". `band`→`hand` repairs a common
// OCR slip from the transcribed stat blocks.
function _parseFollowerDamage(str) {
	const s = String(str ?? "");
	return {
		damageRoll: dieFromDamage(s),
		damageForm: (s.match(/\(([^)]+)\)/)?.[1] ?? "").replace(/\bband\b/gi, "hand") || null,
	};
}

// ── Move cross-reference hover tooltips ──────────────────────────────────────
// Longest names first so the alternation prefers the longer match.
const _MOVE_REF_NAMES = [
	"Persuade (vs. NPCs)",
	"Persuade (vs. PCs)",
	"Have What You Need",
	"Return Triumphant",
	"Struggle as One",
	"Chart a Course",
	"Keep Company",
	"Defy Danger",
	"Know Things",
	"Seek Insight",
	"Make Camp",
	"Requisition",
	"Let Fly",
	"Outfit",
	"Forage",
	"Recover",
	"Defend",
	"Clash",
	"Aid",
];
const _MOVE_REF_RE = new RegExp(
	`(?<!\\w)(${_MOVE_REF_NAMES.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?!\\w)`,
	"g"
);
const _moveRefCache = new Map();

async function _fetchMoveRef(name) {
	const key = name.toLowerCase();
	if (_moveRefCache.has(key)) return _moveRefCache.get(key);
	const packs = game.packs.filter(p => p.metadata.packageName === "stonetop_pwd" && p.metadata.type === "Item");
	for (const pack of packs) {
		await pack.getIndex();
		const entry = pack.index.find(e => e.name.toLowerCase() === key);
		if (!entry) continue;
		const doc  = await pack.getDocument(entry._id);
		const desc = doc?.system?.description ?? null;
		_moveRefCache.set(key, desc);
		return desc;
	}
	_moveRefCache.set(key, null);
	return null;
}

function _enrichMoveRefsInEl(container) {
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
		acceptNode: node =>
			node.parentElement?.closest(".stonetop-move-ref")
				? NodeFilter.FILTER_REJECT
				: NodeFilter.FILTER_ACCEPT,
	});
	const toReplace = [];
	let node;
	while ((node = walker.nextNode())) {
		_MOVE_REF_RE.lastIndex = 0;
		if (_MOVE_REF_RE.test(node.textContent)) toReplace.push(node);
	}
	for (const textNode of toReplace) {
		const text = textNode.textContent;
		const frag = document.createDocumentFragment();
		let lastIdx = 0;
		_MOVE_REF_RE.lastIndex = 0;
		let m;
		while ((m = _MOVE_REF_RE.exec(text)) !== null) {
			if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
			const span = document.createElement("span");
			span.className = "stonetop-move-ref";
			span.dataset.moveName = m[1];
			span.textContent = m[1];
			frag.appendChild(span);
			lastIdx = m.index + m[1].length;
		}
		if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
		textNode.parentNode?.replaceChild(frag, textNode);
	}
}

export function createStonetopCharacterSheetClass(Base) {
	// Details-tab sections (Background, Instinct, Appearance, Origin, Lore) each
	// carry their own edit pencil via the shared section-editing mixin, tracked
	// independently of the global header-wrench `_editMode`.
	return class StonetopCharacterSheet extends withSectionEditing(Base) {
		_stonetopCharacter;
		_editMode = false;

		constructor(...args) {
			super(...args);
			this._stonetopCharacter = this.actor.typedActor;

			// Reopen at the width this user last left this character's sheet.
			const storedWidth = getCharacterSheetWidth(this.actor?.id);
			if (storedWidth) {
				this.options.width  = storedWidth;
				this.position.width = storedWidth;
			}

			// Reopen the collapsible crew sections (Inventory / Roster / Group Fight)
			// in the state this user last left them — persisted per-actor, per-user.
			this._openCrewSections = new Set(getCrewSectionsOpen(this.actor?.id));
		}

		// Persist the current crew-section open state so it survives a sheet reopen.
		_persistCrewSections() {
			setCrewSectionsOpen(this.actor?.id, [...(this._openCrewSections ?? [])]);
		}

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["pbta", "stonetop", "sheet", "actor", "character"],
				width: 960,
				minWidth: 800,
				height: 1050,
				tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "moves" }],
				dragDrop: [{ dragSelector: ".items-list .item" }],
			});
		}

		get template() {
			return "systems/stonetop_pwd/templates/actor/character.hbs";
		}

		async _render(force, options) {
			await super._render(force, options);
			this._injectHeaderToggle();
			this.element[0]?.classList.toggle("stonetop-edit-mode", this._editMode);
		}

		// All tabs share one scroll container, so a scroll position from a tall tab
		// carries over to the next. Reset to the top on every switch so the new tab
		// always starts at the top instead of mid-content.
		_onChangeTab(event, tabs, active) {
			super._onChangeTab(event, tabs, active);
			this.element?.[0]?.querySelector(".sheet-body")?.scrollTo({ top: 0 });
		}

		async close(options) {
			this._arcanaMasonryObserver?.disconnect();
			this._persistSheetWidth();
			this._movePanel?.remove();
			this._movePanel = null;
			return super.close(options);
		}

		// Remember the width so the sheet reopens at the size the user left it.
		// setPosition fires on every resize frame, so debounce it; close() also
		// saves immediately to cover a resize-then-close within the debounce window.
		setPosition(options = {}) {
			const position = super.setPosition(options);
			clearTimeout(this._widthSaveTimer);
			this._widthSaveTimer = setTimeout(() => this._persistSheetWidth(), 500);
			return position;
		}

		_persistSheetWidth() {
			if (this._minimized) return;
			const width = this.position?.width;
			if (Number.isFinite(width) && width >= (this.options.minWidth ?? 0)) {
				setCharacterSheetWidth(this.actor?.id, width);
			}
		}

		_injectHeaderToggle() {
			const header = this.element[0]?.querySelector(".window-header");
			if (!header || !this.isEditable) return;

			header.querySelector(".stonetop-header-toggle")?.remove();

			const label = document.createElement("label");
			label.className = "stonetop-edit-toggle stonetop-header-toggle";
			label.title = this._editMode ? "Lock Sheet" : "Edit Character";
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = this._editMode;
			checkbox.addEventListener("change", () => {
				this._editMode = !this._editMode;
				this.render(false);
			});

			const track = document.createElement("span");
			track.className = "stonetop-toggle-track";
			const thumb = document.createElement("span");
			thumb.className = "stonetop-toggle-thumb";
			const icon = document.createElement("i");
			icon.className = "fas fa-wrench";
			thumb.appendChild(icon);
			track.appendChild(thumb);

			label.appendChild(checkbox);
			label.appendChild(track);

			const title = header.querySelector(".window-title");
			header.insertBefore(label, title);
		}

		_openLedgerDialog() {
			const entries = CharacterLedger.getEntries(this.actor);
			const ledgerDate = (timestamp) => {
				const date = timestamp ? new Date(timestamp) : null;
				if (!date || Number.isNaN(date.getTime())) return { key: "unknown", label: "Unknown date" };
				const key = [
					date.getFullYear(),
					String(date.getMonth() + 1).padStart(2, "0"),
					String(date.getDate()).padStart(2, "0"),
				].join("-");
				return {
					key,
					label: date.toLocaleDateString(undefined, {
						weekday: "long",
						year:    "numeric",
						month:   "long",
						day:     "numeric",
					}),
				};
			};
			const buildRows = (items) => items.length
				? items.map((entry, index, list) => {
					const date = ledgerDate(entry.timestamp);
					const previous = index > 0 ? ledgerDate(list[index - 1].timestamp).key : null;
					const header = date.key !== previous
						? `<li class="stonetop-ledger-date-header" data-date-key="${_esc(date.key)}">${_esc(date.label)}</li>`
						: "";
					return `${header}<li class="stonetop-ledger-entry" data-id="${_esc(entry.id)}" data-timestamp="${entry.timestamp ?? 0}" data-date-key="${_esc(date.key)}" data-date-label="${_esc(date.label)}">
						<input type="checkbox" class="stonetop-ledger-row-check">
						<div class="stonetop-ledger-entry-content">
							<div class="stonetop-ledger-entry-main">${_esc(entry.action)}</div>
							<div class="stonetop-ledger-entry-user">Changed by ${_esc(entry.userName)}</div>
							<div class="stonetop-ledger-entry-meta">
								<span>${_esc(entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "")}</span>
							</div>
						</div>
					</li>`;
				}).join("")
				: `<li class="stonetop-ledger-empty">No ledger entries yet.</li>`;

			const nounOptions = ledgerNounOptionsHtml(entries);

			const content = `<div class="stonetop-ledger-container">
				<div class="stonetop-ledger-toolbar">
					<label class="stonetop-edit-toggle stonetop-ledger-edit-toggle" title="Edit entries">
						<input type="checkbox" class="stonetop-ledger-edit-check">
						<span class="stonetop-toggle-track">
							<span class="stonetop-toggle-thumb"><i class="fas fa-pen"></i></span>
						</span>
					</label>
					<label class="stonetop-ledger-select-all-label" title="Select all">
						<input type="checkbox" class="stonetop-ledger-select-all">
					</label>
					<button type="button" class="stonetop-ledger-delete-selected">
						<i class="fas fa-trash"></i> Delete
					</button>
					<input type="search" class="stonetop-ledger-search" placeholder="Filter entries…">
					<select class="stonetop-ledger-noun" title="Filter by subject">
						<option value="">All changes</option>
						${nounOptions}
					</select>
					<select class="stonetop-ledger-sort">
						<option value="desc">Newest first</option>
						<option value="asc">Oldest first</option>
					</select>
				</div>
				<section class="stonetop-ledger-dialog">
					<ol class="stonetop-ledger-list">${buildRows(entries)}</ol>
				</section>
			</div>`;

			const ledgerDialog = new Dialog({
				title: `${this.actor.name}: Ledger`,
				content,
				buttons: {},
				render: (html) => {
					const container  = html.find(".stonetop-ledger-container")[0];
					const list = html.find(".stonetop-ledger-list")[0];
					const selectAllEl = html.find(".stonetop-ledger-select-all")[0];

					const createDateHeader = (dateKey, dateLabel) => {
						const header = document.createElement("li");
						header.className = "stonetop-ledger-date-header";
						header.dataset.dateKey = dateKey;
						header.textContent = dateLabel;
						return header;
					};

					const refreshDateHeaders = () => {
						list.querySelectorAll(".stonetop-ledger-date-header").forEach(el => el.remove());
						let previous = null;
						for (const entry of [...list.querySelectorAll(".stonetop-ledger-entry")]) {
							const dateKey = entry.dataset.dateKey ?? "unknown";
							if (dateKey === previous) continue;
							list.insertBefore(createDateHeader(dateKey, entry.dataset.dateLabel ?? "Unknown date"), entry);
							previous = dateKey;
						}
					};

					const syncDateHeaders = () => {
						for (const header of list.querySelectorAll(".stonetop-ledger-date-header")) {
							let sibling = header.nextElementSibling;
							let hasVisibleEntry = false;
							while (sibling && !sibling.classList.contains("stonetop-ledger-date-header")) {
								if (sibling.classList.contains("stonetop-ledger-entry") && !sibling.hidden) {
									hasVisibleEntry = true;
									break;
								}
								sibling = sibling.nextElementSibling;
							}
							header.hidden = !hasVisibleEntry;
						}
					};

					const syncSelectAll = () => {
						const visibleRows = html.find(".stonetop-ledger-entry:not([hidden]) .stonetop-ledger-row-check");
						const total   = visibleRows.length;
						const checked = visibleRows.filter(":checked").length;
						selectAllEl.checked       = checked === total && total > 0;
						selectAllEl.indeterminate = checked > 0 && checked < total;
					};

					html.find(".stonetop-ledger-edit-check").on("change", ev => {
						container.classList.toggle("stonetop-ledger-edit-mode", ev.currentTarget.checked);
						if (!ev.currentTarget.checked) {
							html.find(".stonetop-ledger-row-check").prop("checked", false);
							syncSelectAll();
						}
					});

					html.find(".stonetop-ledger-select-all").on("change", ev => {
						html.find(".stonetop-ledger-entry:not([hidden]) .stonetop-ledger-row-check")
							.prop("checked", ev.currentTarget.checked);
					});

					html[0].addEventListener("change", ev => {
						if (ev.target.closest(".stonetop-ledger-row-check")) syncSelectAll();
					});

					wireLedgerFilters(html, () => { syncDateHeaders(); syncSelectAll(); });

					html.find(".stonetop-ledger-sort").on("change", ev => {
						const asc  = ev.currentTarget.value === "asc";
						const tagged = [...list.querySelectorAll(".stonetop-ledger-entry")]
							.map(el => [el, Number(el.dataset.timestamp)]);
						tagged.sort(([, ta], [, tb]) => asc ? ta - tb : tb - ta);
						tagged.forEach(([el]) => list.appendChild(el));
						refreshDateHeaders();
						syncDateHeaders();
					});

					html.find(".stonetop-ledger-delete-selected").on("click", async () => {
						const checked = [...html.find(".stonetop-ledger-row-check:checked")];
						if (!checked.length) return;

						const doDelete = async () => {
							const ids = new Set(
								checked.map(el => el.closest(".stonetop-ledger-entry").dataset.id)
							);
							checked.forEach(el => el.closest(".stonetop-ledger-entry")?.remove());
							refreshDateHeaders();
							syncDateHeaders();
							syncSelectAll();
							await CharacterLedger.deleteEntries(this.actor, ids);
						};

						if (checked.length === 1) {
							await doDelete();
							return;
						}

						Dialog.confirm({
							title: "Delete Ledger Entries",
							content: `<p>You're about to delete ${checked.length} entries. Are you sure?</p>`,
							yes: doDelete,
							render: keepDialogOnTop,
							options: { classes: ["dialog", "stonetop-ledger-child"] },
						});
					});
				},
			}, {
				width: 560,
				height: 640,
				classes: ["dialog", "stonetop-ledger-window"],
			});
			attachKeepOnTop(ledgerDialog, { childDialogClass: "stonetop-ledger-child" });
			ledgerDialog.render(true);
		}

		_getHeaderButtons() {
			const buttons  = super._getHeaderButtons().filter(b => b.class !== "configure-sheet");
			const steading = this._stonetopCharacter?.getSteadingActor();
			buttons.unshift({
				label:   steading?.name ?? "",
				class:   "stonetop-open-steading" + (steading ? "" : " stonetop-open-steading--unset"),
				icon:    "fas fa-map-marker-alt",
				onclick: () => {
					if (steading) steading.sheet.render(true, { focus: true });
					else ui.notifications.warn(game.i18n.localize("stonetop.steading.notLinked"));
				},
			});
			buttons.unshift({
				label:   game.i18n.localize("stonetop.newCharacter.buttonLabel"),
				class:   "stonetop-new-character",
				icon:    "fas fa-user-plus",
				onclick: () => this._onNewCharacter(),
			});
			const steadingIdx = buttons.findIndex(b => b.class?.startsWith("stonetop-open-steading"));
			buttons.splice(steadingIdx + 1, 0, {
				label:   "Ledger",
				class:   "stonetop-ledger-button",
				icon:    "fas fa-scroll",
				onclick: () => this._openLedgerDialog(),
			});
			return buttons;
		}

		async getData() {
			const context = await super.getData();
			context.system ??= this.actor.system;
			context.isCharacter = this.actor.type === "character";
			context.stonetop = await this._stonetopCharacter.buildSnapshot();
			// Per-section edit flags: a section is editable when the global wrench is
			// on OR its own pencil is toggled.
			const sectionEdit = section => this.isSectionEditable(section);
			context.stonetop.statsNoteDisplay = sectionEdit("stats") ? context.stonetop.playbook?.statsNote ?? null : null;
			context.stonetop.movelist.startingMovesNoteDisplay = sectionEdit("moves") ? context.stonetop.movelist.startingMovesNote ?? null : null;
			context.stonetop.hideUnselected = this.actor.getFlag('stonetop_pwd', 'hideUnselected') ?? true;
			context.stonetop.editMode = this._editMode;
			context.stonetop.canEdit = this.isEditable;
			context.stonetop.detailsEdit = {
				background: sectionEdit("background"),
				instinct:   sectionEdit("instinct"),
				appearance: sectionEdit("appearance"),
				origin:     sectionEdit("origin"),
				lore:       sectionEdit("lore"),
			};
			context.stonetop.statsEdit       = sectionEdit("stats");
			context.stonetop.movesEdit       = sectionEdit("moves");
			context.stonetop.possessionsEdit = sectionEdit("possessions");
			context.stonetop.invocationsEdit = sectionEdit("invocations");
			context.stonetop.followersEdit   = sectionEdit("followers");
			context.stonetop.showRollStatChips = getRollStatChipsSetting();
			context.stonetop.showPostDeath = !!context.stonetop.postDeathInsert?.activeSlug;
			// Mirror computed vitals back onto system attributes for the sheet's inputs.
			// HP-max and damage are playbook-derived, so they only apply with a playbook —
			// keeps onboarding-built characters from showing the stale template default.
			const v = context.stonetop.vitals;
			const vitalsToSystem = {
				"attributes.armor.value": v.armor,
				"attributes.xp.max":      v.xp.max,
				...(context.stonetop.playbook ? {
					"attributes.hp.max":       v.hp.max,
					"attributes.damage.value": v.damage,
				} : {}),
			};
			for (const [path, value] of Object.entries(vitalsToSystem)) {
				foundry.utils.setProperty(context.system, path, value);
			}
			// Followers tab — build data from flags + playbook definition.
			// Pass smallItemLimit from the already-computed snapshot so crew gear
			// uses the exact same prosperity value as outfit inventory items.
			const playbookDoc = await this._stonetopCharacter.playbook();
			const selections = playbookDoc ? this._readSelectionsFromActor(playbookDoc) : null;
			context.stonetop.hasIncompleteBackgroundQuestions = playbookDoc
				? CharacterOnboardingDialog.hasIncompleteQuestions(playbookDoc, selections)
				: false;
			if (CONFIG.debug?.stonetop) {
				this._logOnboardingQuestionDiagnostics(
					CharacterOnboardingDialog.questionCompletionDiagnostics(playbookDoc, selections),
				);
			}
			const crewStats               = context.stonetop.crewBonuses ?? { memberHp: 6, armor: 0, damageDie: "d6", rollMod: 1 };
			context.stonetop.followers    = this._buildFollowersData(playbookDoc, context.stonetop.inventory?.smallItemLimit ?? null, crewStats);
			context.stonetop.hasFollowers = !!(
				context.stonetop.followers.animalCompanion ||
				context.stonetop.followers.crew ||
				context.stonetop.followers.initiates?.length ||
				context.stonetop.followers.beasts?.length
			);
			// Universal "Follower Special Moves" (same for every character), rendered
			// read-only from the follower-moves items via their build export.
			context.stonetop.followerSpecialMoves = FOLLOWER_MOVES;
			context.stonetop.hasArcana = !!(
				context.stonetop.arcana?.minor?.hasOwned ||
				context.stonetop.arcana?.major?.hasOwned
			);
			context.stonetop.invocations          = this._buildInvocationsData(playbookDoc);
			context.stonetop.showOtherMovesSection = this._editMode || !!(context.stonetop.movelist?.otherMoves?.length);
			const { xp } = context.stonetop.vitals;
			context.stonetop.canLevelUp = xp.value >= xp.max;
			context.stonetop.isDying = context.stonetop.vitals.hp.value <= 0;
			context.stonetop.recover = this._buildRecoverData(context.stonetop);
			return context;
		}

		// Recover (special move): expend 1 use of supplies, regain HP equal to
		// 4+Prosperity. The benefit is locked after use until the character takes
		// damage again (cleared by the preUpdateActor hook in stonetop.js).
		_buildRecoverData(snapshot) {
			const locked      = !!this.actor.getFlag("stonetop_pwd", "recover.spent");
			const resources   = this.actor.getFlag("stonetop_pwd", "inventory.resources") ?? {};
			const suppliesLeft = RECOVER_SUPPLY_SLUGS.reduce((sum, slug) => sum + (Number(resources[slug]) || 0), 0);
			const healAmount  = snapshot.inventory?.smallItemLimit ?? 4;
			const hp          = snapshot.vitals.hp;
			const atFullHp    = hp.value >= hp.max;

			let hint = null;
			if (locked)                 hint = { icon: "fa-lock",                text: game.i18n.localize("stonetop.specialMoves.recover.lockedHint") };
			else if (suppliesLeft <= 0) hint = { icon: "fa-triangle-exclamation", text: game.i18n.localize("stonetop.specialMoves.recover.noSuppliesHint") };
			else if (atFullHp)          hint = { icon: "fa-heart",               text: game.i18n.localize("stonetop.specialMoves.recover.fullHpHint") };

			return {
				locked,
				suppliesLeft,
				healAmount,
				atFullHp,
				hint,
				canRecover: !locked && suppliesLeft > 0 && !atFullHp,
			};
		}

		/** Opening a card's editor queues its name input to grab focus on the next
		 *  render (see activateListeners). Opening a crew collapsible's editor (or the
		 *  whole Followers tab) also expands that <details> so the controls being
		 *  edited are visible. This expansion is in-memory only (for the current
		 *  render); it is NOT persisted, so entering edit mode never overwrites the
		 *  user's saved collapse preference — only an explicit <details> toggle does. */
		_onSectionEditOpened(section) {
			section ??= "";
			const m = /^follower-card:([^:]*):(.*)$/.exec(section);
			if (m) this._pendingFollowerFocus = `follower-name:${m[1]}:${m[2]}`;
			this._openCrewSections ??= new Set();
			if (section === "followers") this._openCrewSections.add("inventory").add("roster").add("groupFight");
			else if (/^follower-individuals:crew:/.test(section)) this._openCrewSections.add("roster");
		}

		_buildFollowersData(playbookDoc, smallItemLimit = null, crewStats = { memberHp: 6, armor: 0, damageDie: "d6", rollMod: 1 }) {
			const sf = resolvedFlags(this.actor);
			// Which collapsible crew sections are expanded. Seeded from the persisted
			// per-actor setting in the constructor (so it survives a sheet reopen);
			// the ??= is just a defensive fallback.
			this._openCrewSections ??= new Set();
			const crewMaxHp = crewStats.memberHp ?? 6;
			// Stash the per-member HP max so the resize/delete handlers can re-clamp
			// the abstracted group-fight pool (crewSize × memberHp) when it shrinks.
			this._crewMemberHpMax = crewMaxHp;
			const crewArmor = crewStats.armor ?? 0;
			const crewDamageDie = crewStats.damageDie ?? "d6";
			const crewRollMod = crewStats.rollMod ?? 1;
			// Edit state for follower cards. One card-level pencil (top-right of the
			// card) makes the whole body — name, stats, moves, notes, gear — editable
			// at once; it is on when the whole Followers tab is in edit mode (global
			// wrench or the tab's pencil) or that card's own pencil has been opened,
			// tracked as `follower-card:<ftype>:<slug>` in the section-editing mixin.
			// The crew's Roster keeps its own separate pencil (`follower-individuals:…`).
			const followersEditing = this.isSectionEditable("followers");
			const cardEditing = (ftype, slug) =>
				followersEditing || this._editingSections.has(`follower-card:${ftype}:${slug}`);
			const withSectionEdits = (card) => {
				if (!card) return card;
				const { ftype, slug } = card;
				const cardOn = cardEditing(ftype, slug);
				card.edit = {
					card:  cardOn,
					name:  cardOn,
					stats: cardOn,
					moves: cardOn,
					notes: cardOn,
					gear:  cardOn,
					// Roster: governed by its own pencil (or the whole-tab edit), not the card button.
					individuals: followersEditing || this._editingSections.has(`follower-individuals:${ftype}:${slug}`),
				};
				return card;
			};
			// The stat-block editor lets the player override Damage / Instinct / Cost with
			// free text, stored on the same per-follower detail flags as moves/notes (see
			// followerDetailPath). An empty override keeps the rules-derived default; a set
			// Damage override also re-derives its rollable die + parenthetical form.
			// Instinct / Cost are skipped for types that store them structurally (animal
			// companion / crew): those edit the type-root value directly so it can be
			// cleared, instead of layering an override that an empty value can't unset.
			const detailFlagsFor = (ftype, slug) => {
				const base = _followerDetailBase(ftype, slug);
				return base ? (foundry.utils.getProperty(sf, base) ?? {}) : {};
			};
			const withStatOverrides = (card) => {
				if (!card) return card;
				const d = detailFlagsFor(card.ftype, card.slug);
				const has = (v) => v != null && String(v).trim() !== "";
				if (!_followerStructuralPath(card.ftype, "instinct") && has(d.instinct)) card.instinct = d.instinct;
				if (!_followerStructuralPath(card.ftype, "cost")     && has(d.cost))     card.cost     = d.cost;
				if (has(d.damage)) {
					card.damage = String(d.damage).trim();
					const parsed = _parseFollowerDamage(card.damage);
					card.damageForm = parsed.damageForm;
					// Keep the rules-derived rollable die if the override has no die of
					// its own (e.g. a free-text "special"), so the damage roll button —
					// and the crew Group Fight roll — never goes empty.
					if (parsed.damageRoll) card.damageRoll = parsed.damageRoll;
				}
				return card;
			};

			// -- Animal Companion (Ranger) ------------------------------
			let animalCompanion = null;
			const acSlug = sf.animalCompanion?.type;
			if (acSlug) {
				const typeData = (playbookDoc?.animalCompanion?.types ?? []).find(t => t.slug === acSlug);
				const traits = sf.animalCompanion?.traits ?? [];
				const stats = _applyAnimalCompanionTraits(typeData, traits);
				const kind = sf.animalCompanion?.kind ?? "";
				const typeLabel = typeData?.label ?? acSlug;
				const loyaltyVal = sf.animalCompanion?.loyalty ?? 0;
				const hpMax = Number(stats.hp) || 0;
				const hpRaw = sf.animalCompanion?.hpCurrent;
				const showTraitHover = getHoverDescriptionSetting("hoverDescriptionsTraits");
				const acName = sf.animalCompanion?.name ?? "";
				const acPronoun = sf.animalCompanion?.pronoun ?? "";
				animalCompanion = {
					...FOLLOWER_FTYPE_DEFAULTS["animal-companion"],
					slug:         "",
					name:         acName,
					pronoun:      acPronoun,
					pronounEditable: true,
					typeLabel:    kind ? `${_titleCase(kind)} (${String(typeLabel).toLowerCase()})` : String(typeLabel),
					tags:         traits.map(label => ({ label, tooltip: showTraitHover ? _animalCompanionTraitTooltip(label) : null })),
					hpSlug:       "",
					hpMax,
					hpCurrent:    _clampHp(hpRaw, hpMax),
					maxHpDisplay: hpMax,
					armor:        stats.armor              ?? "—",
					damage:       stats.damage             ?? "—",
					..._parseFollowerDamage(stats.damage),
					damageKind:   kind || String(typeLabel).toLowerCase(),
					damageName:   acName,
					damagePronoun: acPronoun,
					instinct:     sf.animalCompanion?.instinct ?? "",
					cost:         sf.animalCompanion?.cost     ?? "",
					loyalty:      _makeLoyaltyPips(loyaltyVal),
					loyaltySlug:  "",
					..._followerExtras(sf.animalCompanion?.details),
				};
			}

			// -- Crew (Marshal) -----------------------------------------
			// Hardcoded fallback until LevelDB pack is rebuilt with the marshal.json inventory changes.
			const CREW_INVENTORY_FALLBACK = [
				{ slug: "hatchet",     label: "<strong>Hatchet</strong>, iron (<em>hand, thrown</em>, x <em>piercing</em>)",                       weight: 1 },
				{ slug: "spear",       label: "<strong>Spear</strong>, iron (<em>close</em>, x <em>piercing</em>)",                                weight: 1 },
				{ slug: "bow-arrows",  label: "<strong>Bow &amp; iron arrows</strong> (<em>near</em>, x <em>piercing</em>, ? low ammo, ? all out)", weight: 1 },
				{ slug: "shield",      label: "<strong>Shield</strong> (+1 armor, +1 Readiness on 7+ to Defend)",                         weight: 2 },
				{ slug: "thick-hides", label: "<strong>Thick hides</strong> (1 armor, <em>warm</em>)",                                    weight: 2 },
				{ slug: "cloak",       label: "<strong>Cloak</strong> (<em>warm</em>)",                                                   weight: 1 },
			];
			let crew = null;
			if (sf.crew?.tags?.length || sf.crew?.instinct || sf.crew?.cost || sf.crew?.name || sf.crew?.individuals?.length) {
				const loyaltyVal      = sf.crew?.loyalty ?? 0;
				const gearFlags       = sf.crew?.gear ?? {};
				const inventoryDef    = playbookDoc?.crew?.inventory?.length ? playbookDoc.crew.inventory : CREW_INVENTORY_FALLBACK;
				// Supplies: 6 independent sets, each with (4+Prosperity) circles.
				// smallItemLimit comes from buildSnapshot() — same value driving outfit inventory.
				const pipsPerSet      = smallItemLimit ?? 5;
				const prosperity      = smallItemLimit !== null ? smallItemLimit - 4 : null;
				const suppliesRaw     = sf.crew?.supplies;
				const suppliesArr     = Array.isArray(suppliesRaw) ? suppliesRaw : Array(6).fill(0);
				// Same piercing substitution used for outfit items on the character sheet.
				// Crew gear labels use plain "x piercing"; outfit item notes use "x <em>piercing</em>".
				const applyPiercing   = (label) => {
					if (!label?.includes('x piercing')) return label;
					if (prosperity === null) return label;
					const html      = label.includes('x <em>piercing</em>');
					const token     = html ? 'x <em>piercing</em>' : 'x piercing';
					const removalRe = html ? /(, )?x <em>piercing<\/em>(, )?/ : /(, )?x piercing(, )?/;
					if (prosperity <= -1) return label.replace(token, html ? '<em>crude</em>' : 'crude');
					if (prosperity === 0)  return label.replace(removalRe, (_, pre, post) => post ? (pre ?? '') : '').trim();
					const val = Math.min(prosperity, 2);
					return label.replace(token, html ? `${val} <em>piercing</em>` : `${val} piercing`);
				};
				const crewIndividuals = (sf.crew?.individuals ?? []).map((ind, idx) => {
					const indHpRaw = (sf.crew?.individualsHp ?? {})[idx];
					return { ...ind, index: idx, hpMax: crewMaxHp, hpCurrent: _clampHp(indHpRaw, crewMaxHp) };
				});
				// Roster: the crew is "a half-dozen strong by default" (Crew insert,
				// p.144). Named individuals are the members who've "stood out"; the
				// rest are tracked as anonymous members. Every member has their own
				// current HP against the one shared max (NPCs & Followers, p.470/472).
				const crewNamedCount = crewIndividuals.length;
				const crewSize       = _effectiveCrewSize(sf.crew?.size, crewNamedCount);
				const crewAnonCount  = Math.max(0, crewSize - crewNamedCount);
				const crewMemberHp   = Array.isArray(sf.crew?.memberHp) ? sf.crew.memberHp : [];
				const crewAnonMembers = Array.from({ length: crewAnonCount }, (_, i) => {
					const raw = crewMemberHp[i];
					return {
						index:     i,
						label:     `Crew member ${crewNamedCount + i + 1}`,
						hpMax:     crewMaxHp,
						hpCurrent: _clampHp(raw, crewMaxHp),
					};
				});
				const crewAliveCount = crewIndividuals.filter(m => m.hpCurrent > 0).length
				                     + crewAnonMembers.filter(m => m.hpCurrent > 0).length;
				// Abstracted "treat the whole group as one combatant" pool, tracked
				// independently of per-member HP (Followers in Fights, p.409/473).
				const crewGroupHpMax     = crewSize * crewMaxHp;
				const crewGroupHpRaw     = Number(sf.crew?.groupHp);
				const crewGroupHpCurrent = _clampHp(crewGroupHpRaw, crewGroupHpMax);
				// Readiness held when the crew Defends (common pool, p.473).
				const crewReadiness = Math.max(0, Number(sf.crew?.readiness) || 0);
				// Crew shares the common card body but supplies its own gear (the
				// inventory section below), so spread the shared extras then override
				// `gear`. Details live under crew.details so they don't collide with the
				// inventory pip map stored at crew.gear (see _followerDetailBase).
				const crewExtras = _followerExtras(sf.crew?.details);
				// Playbook-defined tag / instinct / cost options (the lists printed on
				// the Crew sheet), surfaced as pickers in edit mode. Tags store the raw
				// option string (one auto tag from the chosen background is locked on);
				// instinct/cost store the glyph-normalized text, matching onboarding.
				// Only the edit-mode pickers consume these, and each entry runs the
				// glyph normalizer, so skip the whole build outside edit mode.
				// The background-granted "auto" tag is DERIVED from the active background,
				// never baked into crew.tags — so changing background swaps it cleanly
				// instead of leaving the old one stranded in storage. crew.tags holds
				// only the player's chosen tags.
				const crewBgTag = (playbookDoc?.crew?.backgroundTags ?? {})[sf.background?.selected ?? ""] ?? null;
				const crewChosenTags = (sf.crew.tags ?? []).filter(t => t !== crewBgTag);
				let crewTagOptions = null, crewInstinctOptions = null, crewCostOptions = null;
				let crewTagLimit = 2;
				if (cardEditing("crew", "")) {
					const crewOpts     = playbookDoc?.crew ?? {};
					crewTagLimit       = Number.isFinite(crewOpts.additionalTagCount) ? crewOpts.additionalTagCount : 2;
					const crewTagSet   = new Set(sf.crew.tags ?? []);
					const crewTagsAtLimit = [...crewTagSet].filter(t => t !== crewBgTag).length >= crewTagLimit;
					crewTagOptions = (crewOpts.availableTags ?? []).map(tag => {
						const isAuto     = tag === crewBgTag;
						const isSelected = isAuto || crewTagSet.has(tag);
						return { value: tag, label: normalizePlaybookGlyphs(tag), isAuto, isSelected, disabled: isAuto || (!isSelected && crewTagsAtLimit) };
					});
					crewInstinctOptions = (crewOpts.instincts ?? []).map(v => {
						const value = normalizePlaybookGlyphs(v);
						return { value, selected: (sf.crew.instinct ?? "") === value };
					});
					crewCostOptions = (crewOpts.costs ?? []).map(v => {
						const value = normalizePlaybookGlyphs(v);
						return { value, selected: (sf.crew.cost ?? "") === value };
					});
				}
				crew = {
					...FOLLOWER_FTYPE_DEFAULTS["crew"],
					slug:      "",
					name:      sf.crew.name     ?? "",
					typeLabel: "group follower",
					tags:      (crewBgTag ? [crewBgTag, ...crewChosenTags] : crewChosenTags).map(t => ({ label: normalizePlaybookGlyphs(t) })),
					tagOptions: crewTagOptions?.length ? crewTagOptions : null,
					tagLimit:   crewTagLimit,
					tagAutoLabel: crewBgTag ? normalizePlaybookGlyphs(crewBgTag) : null,
					instinct:  sf.crew.instinct ?? "",
					instinctOptions: crewInstinctOptions?.length ? crewInstinctOptions : null,
					cost:      sf.crew.cost     ?? "",
					costOptions: crewCostOptions?.length ? crewCostOptions : null,
					loyalty:   _makeLoyaltyPips(loyaltyVal),
					loyaltySlug: "",
					hpStaticValue: crewMaxHp,
					hpStaticSuffix: "each",
					maxHpDisplay: `${crewMaxHp} each`,
					damage:    crewDamageDie,
					damageRoll: crewDamageDie,
					damageKind: "",
					damageName: sf.crew.name || "Crew",
					damageForm: "",
					...crewExtras,        // exceptional / moves / movesLines / notes (gear overridden below)
					gear:      inventoryDef.map(item => {
						// A weightless entry still gets one pip, so it's toggleable (matches
						// the data-weight `|| 1` fallback in the gear-check handler).
						const weight      = Number(item.weight) || 1;
						const flagVal     = gearFlags[item.slug];
						// backward-compat: old boolean true ? all pips filled
						const filledCount = typeof flagVal === "number" ? flagVal : (flagVal ? weight : 0);
						return {
							...item,
							weight,
							label:   applyPiercing(item.label),
							checked: filledCount >= weight,
							pips:    Array.from({ length: weight }, (_, i) => ({ index: i, filled: i < filledCount })),
						};
					}),
					supplySets: Array.from({ length: 6 }, (_, setIdx) => {
						const filled = suppliesArr[setIdx] ?? 0;
						return {
							index: setIdx,
							pips:  Array.from({ length: pipsPerSet }, (_, pipIdx) => ({
								setIndex: setIdx,
								pipIndex: pipIdx,
								filled:   pipIdx < filled,
							})),
						};
					}),
					individuals:       crewIndividuals,
					individualOptions: playbookDoc?.crew?.individualOptions ?? {},
					namedCount:        crewNamedCount,
					size:              crewSize,
					anonMembers:       crewAnonMembers,
					memberCount:       crewAliveCount,
					groupHpCurrent:    crewGroupHpCurrent,
					groupHpMax:        crewGroupHpMax,
					readiness:         crewReadiness,
					sectionsOpen:      {
						inventory:  this._openCrewSections.has("inventory"),
						roster:     this._openCrewSections.has("roster"),
						groupFight: this._openCrewSections.has("groupFight"),
					},
					memberHp:          crewMaxHp,
					armor:             crewArmor,
					rollMod:           crewRollMod,
				};
			}

			// -- Initiates of Danu (Blessed + Initiate background) ------
			let initiates = null;
			const bgChoices        = sf.background?.choices ?? {};
			const initiatesLoyalty = sf.initiatesLoyalty  ?? {};
			const initiatesHp      = sf.initiatesHp       ?? {};
			const sfInitiateDetails = sf.initiateDetails  ?? {};
			const initiateBg       = (playbookDoc?.backgrounds ?? []).find(b => b.slug === "initiate");
			if (initiateBg?.choices?.options?.length) {
				const selected = initiateBg.choices.options.filter(opt => bgChoices[opt.slug]);
				if (selected.length) {
					initiates = selected.map(opt => {
						const det = sfInitiateDetails[opt.slug] ?? {};
						// Collect non-pronoun row selections as display tags
						const choiceDetails = (opt.choiceRows ?? [])
							.map((row, rowIdx) => row.type !== "pronoun" ? det.rows?.[rowIdx] : null)
							.filter(Boolean);
						const initHpMax = Number(opt.hp) || 0;
						const initHpRaw = initiatesHp[opt.slug];
						// Break the comma-separated epithet name onto one line per
						// segment (keeping the trailing comma); the pronoun rides
						// on the final line.
						const labelParts = String(opt.label ?? "").split(",").map(s => s.trim()).filter(Boolean);
						const labelLines = (labelParts.length ? labelParts : [String(opt.label ?? "")])
							.map((text, i, arr) => ({
								text:    i < arr.length - 1 ? `${text},` : text,
								pronoun: i === arr.length - 1 ? (det.pronoun ?? null) : null,
							}));
						const subtitleTags = (opt.subtitle ?? "").split(", ").map(t => t.trim()).filter(Boolean);
						return {
							...FOLLOWER_FTYPE_DEFAULTS["initiate"],
							slug:          opt.slug,
							label:         opt.label,
							nameLines:     labelLines,
							typeLabel:     "initiate of Danu",
							// subtitle tags plus any non-pronoun choice rows, flagged so the
							// card can tint the chosen details differently.
							tags:          [
								...subtitleTags.map(label => ({ label })),
								...choiceDetails.map(label => ({ label, cls: "stonetop-follower-tag--detail" })),
							],
							hpSlug:        opt.slug,
							hpMax:         initHpMax,
							hpCurrent:     _clampHp(initHpRaw, initHpMax),
							maxHpDisplay:  initHpMax || "—",
							armor:         opt.armor   ?? "—",
							damage:        opt.damage  ?? "—",
							..._parseFollowerDamage(opt.damage),
							damageKind:    "",
							damageName:    opt.label,
							damagePronoun: det.pronoun ?? "",
							instinct:      opt.instinct ?? null,
							cost:          opt.cost    ?? null,
							pronoun:       det.pronoun ?? null,
							choiceDetails,
							loyalty:       _makeLoyaltyPips(initiatesLoyalty[opt.slug] ?? 0),
							loyaltySlug:   opt.slug,
							..._followerExtras(det),
						};
					});
				}
			}

			// -- Livestock & Beasts (any playbook; from added special items) --
			// A character "owns" a beast when its slug is in inventory.addedSpecial
			// (the Add Special Item picker). HP and Loyalty track per-slug, mirroring
			// the initiate flags. Follower beasts (dog/mule/horse) earn Loyalty and
			// pay a Cost; the rest are livestock (butcher note, no Loyalty).
			const ownedSlugs      = sf.inventory?.addedSpecial ?? [];
			const beastHpFlags      = sf.beastHp      ?? {};
			const beastLoyaltyFlags = sf.beastLoyalty ?? {};
			const beastDetailFlags  = sf.beastDetails ?? {};
			const beasts = BEAST_ORDER
				.filter(slug => ownedSlugs.includes(slug))
				.map(slug => {
					const b     = BEAST_CATALOG[slug];
					const hpMax = Number(b.hp) || 0;
					const hpRaw = beastHpFlags[slug];
					const card  = {
						...FOLLOWER_FTYPE_DEFAULTS["beast"],
						slug,
						portraitIcon: b.follower ? "fas fa-dog" : "fas fa-wheat-awn",
						name:         b.name,
						typeLabel:    b.follower ? "beast follower" : "livestock",
						isFollower:   !!b.follower,
						hpSlug:       slug,
						hpMax,
						hpCurrent:    _clampHp(hpRaw, hpMax),
						maxHpDisplay: hpMax,
						armor:        b.armor ?? 0,
						damage:       b.damage + (b.damageForm ? ` (${b.damageForm})` : ""),
						damageRoll:   b.damage ?? null,
						damageForm:   b.damageForm ?? null,
						damageKind:   "",
						damageName:   b.name,
						tags:         (b.traits ?? []).map(label => ({ label })),
						traitsNote:   b.traitsNote ?? null,
						instinct:     b.instinct ?? "",
						cost:         b.cost ?? "",
						butcher:      b.butcher ?? null,
						..._followerExtras(beastDetailFlags[slug]),
					};
					if (b.follower) {
						card.loyalty = _makeLoyaltyPips(beastLoyaltyFlags[slug] ?? 0);
						card.loyaltySlug = slug;
					}
					return card;
				});

			// "exceptional" is a gated tag (see FOLLOWER_EXCEPTIONAL): the chip only
			// shows for follower types whose playbook grants it, and can be switched
			// on only once that move is owned. Surfaced per-card so the tags-row chip
			// and its click handler can warn when the requirement isn't met.
			// Only the animal companion and crew can ever become exceptional (the only
			// FOLLOWER_EXCEPTIONAL keys), so skip the whole-collection item scan unless
			// one of them is present.
			const ownedMoveNames = (animalCompanion || crew)
				? new Set(this.actor.items.filter(i => i.type === "move").map(i => i.name))
				: null;
			const withExceptional = (card) => {
				if (!card) return card;
				const def = FOLLOWER_EXCEPTIONAL[card.ftype];
				card.exceptionalAvailable = !!def;
				if (def) {
					card.exceptionalMoveName = def.move;
					card.exceptionalMet      = ownedMoveNames.has(def.move);
					card.exceptionalHint     = `Your ${def.noun} can become exceptional only after you take the move “${def.move}.”`;
				}
				return card;
			};
			const finalize = (card) => withExceptional(withSectionEdits(withStatOverrides(card)));
			return {
				animalCompanion: finalize(animalCompanion),
				crew:            finalize(crew),
				initiates:       initiates?.map(finalize) ?? null,
				beasts:          beasts.map(finalize),
			};
		}

		_buildInvocationsData(playbookDoc) {
			const raw = playbookDoc?.invocations;
			if (!raw?.options?.length) return null;
			const selected = new Set(this.actor.getFlag("stonetop_pwd", "invocations.selected") ?? []);
			const showEffectTips = getHoverDescriptionSetting("hoverDescriptionsInvocations");
			const options = raw.options.map(opt => {
				const description = opt.description ?? "";
				return {
					slug:        opt.slug,
					label:       opt.label,
					description: showEffectTips ? _annotateInvocationEffects(description) : description,
					known:       selected.has(opt.slug),
					ongoing:     !!opt.ongoing,
				};
			});
			const sort = this.actor.getFlag("stonetop_pwd", "invocationsSort") ?? "known";
			if (sort === "alpha") {
				options.sort((a, b) => a.label.localeCompare(b.label));
			} else {
				// Known first, then alphabetically — mirrors the moves tab's owned-first order.
				options.sort((a, b) => {
					if (a.known !== b.known) return a.known ? -1 : 1;
					return a.label.localeCompare(b.label);
				});
			}
			return {
				startingCount: raw.startingCount ?? 2,
				hideUnknown:   this.actor.getFlag("stonetop_pwd", "hideUnknownInvocations") ?? false,
				sort,
				sortKnown:     sort === "known",
				sortAlpha:     sort === "alpha",
				options,
			};
		}

		activateListeners(html) {
			super.activateListeners(html);

			html.find(".stonetop-create-character-btn").on("click", () => this._onNewCharacter());
			html.find("[data-onboarding-start]").on("click", ev => {
				this._openEditCharacterOnboarding({ startAtStep: ev.currentTarget.dataset.onboardingStart });
			});

			// Reveal the "Drop a playbook here" hint only while a drag is actually
			// over the sheet — a blank sheet shouldn't show a confusing dashed box,
			// but the player can still drop a playbook anywhere on it. dragenter and
			// dragleave bubble up from every child, so track the nesting depth and
			// only clear the hint once the drag has truly left the form.
			let dragDepth = 0;
			const clearDropHint = () => { dragDepth = 0; html[0].classList.remove("stonetop-dragging-playbook"); };
			html[0].addEventListener("dragenter", () => {
				dragDepth++;
				html[0].classList.add("stonetop-dragging-playbook");
			});
			html[0].addEventListener("dragleave", () => { if (--dragDepth <= 0) clearDropHint(); });

			html[0].addEventListener("dragover", (ev) => ev.preventDefault());
			html[0].addEventListener("drop", async (ev) => {
				clearDropHint();
				if (ev.target.closest(".sheet-tabs")) return;
				ev.stopImmediatePropagation();
				const data = this._getDragEventData(ev);
				if (!data) return;
				if (data?.type === "Actor") {
					const doc = await fromUuid(data.uuid);
					if (doc?.system?.customType === "stonetop") {
						await this.actor.setFlag("stonetop_pwd", "steadingId", doc.id);
						this.render(false);
					}
					return;
				}
				if (data?.type === "Item") {
					if (data.uuid) {
						const doc = await fromUuid(data.uuid);
						if (doc?.type === "playbook") {
							await this._onDropPlaybook(doc);
							return;
						}
					}
					// Resolve the dropped item and route it through our own creation
					// handler. We can't rely on the inherited _onDropItem → _onDropItemCreate
					// chain (deprecated AppV1 plumbing), so call _onDropItemCreate directly;
					// fall back to the base handler only for re-ordering an item already on
					// this actor.
					const item = await Item.implementation.fromDropData(data);
					if (!item) return;
					if (item.parent?.uuid === this.actor.uuid) {
						await this._onDropItem(ev, data);
						return;
					}
					await this._onDropItemCreate(item.toObject());
				}
			}, true);

			const dropZone = html[0].querySelector(".stonetop-playbook-drop-zone");
			if (dropZone) {
				dropZone.addEventListener("dragenter", () => dropZone.classList.add("drag-over"));
				dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
				dropZone.addEventListener("drop", () => dropZone.classList.remove("drag-over"));
			}

			html.find(".cell--stats .stat-value").each((_, el) => {
				el.value = el.value.replace(/^\+/, "");
			});
			applyLabelTooltips(html, {
				selector: ".cell--stats .stat[data-stat]", datasetKey: "stat",
				table: STAT_TOOLTIPS, settingKey: "hoverDescriptionsStats", direction: "DOWN",
			});
			applyLabelTooltips(html, {
				selector: ".cell__title[data-vital]", datasetKey: "vital",
				table: VITAL_TOOLTIPS, settingKey: "hoverDescriptionsVitals", direction: "DOWN",
			});

			html.find(".stonetop-hide-unselected-check").on("change", async (ev) => {
				await this.actor.setFlag('stonetop_pwd', 'hideUnselected', ev.currentTarget.checked);
			});

			html.find(".stonetop-hide-unknown-invocations-check").on("change", async (ev) => {
				await this.actor.setFlag('stonetop_pwd', 'hideUnknownInvocations', ev.currentTarget.checked);
			});

			html.find(".stonetop-invocation-sort").on("change", async (ev) => {
				await this.actor.setFlag("stonetop_pwd", "invocationsSort", ev.currentTarget.value);
			});

			// Live text filter over invocation cards (name + description). Client-side
			// only, mirroring the Ledger search; composes with the hide-un-learned CSS.
			const invCards = [...html[0].querySelectorAll(".stonetop-invocation-card")];
			invCards.forEach(card => {
				const name = card.querySelector(".stonetop-invocation-name")?.textContent ?? "";
				const desc = card.querySelector(".stonetop-invocation-desc")?.textContent ?? "";
				card._invText = `${name} ${desc}`.toLowerCase();
			});
			html.find(".stonetop-invocation-search").on("input", (ev) => {
				const term = ev.currentTarget.value.trim().toLowerCase();
				invCards.forEach(card => {
					card.hidden = !!term && !card._invText.includes(term);
				});
			});

			html.find(".stonetop-roll-mode-input").on("change", async (ev) => {
				await this._stonetopCharacter.setRollMode(ev.currentTarget.value);
			});

			html[0].querySelector(".stonetop-portrait")?.addEventListener("click", ev => {
				if (this._editMode) return;
				ev.preventDefault();
				ev.stopPropagation();
				new ImagePopout(this.actor.img, { title: this.actor.name }).render(true);
			});

			html[0].addEventListener("click", ev => {
				if (this._editMode) return;
				const nameEl = ev.target.closest(".stonetop-item-name");
				if (!nameEl) return;
				ev.preventDefault();
				const li = nameEl.closest("li");
				const name = nameEl.textContent.trim();
				const guide = GUIDED_CHARACTER_MOVES[name];
				if (guide) {
					this._openGuidedCharacterMove({ name, guide }, li?.querySelector(".rollable"));
					return;
				}
				const description = li.querySelector(".stonetop-item-description")?.innerHTML ?? "";
				const playbookName = html[0].querySelector(".stonetop-playbook-drop-zone:not(.empty)")?.textContent?.trim() ?? "";
				const speaker = ChatMessage.getSpeaker({ actor: this.actor });
				speaker.alias = playbookName ? `${this.actor.name} ${playbookName}` : this.actor.name;
				ChatMessage.create({
					content: _buildMoveChatContent(name, description),
					speaker,
				});
			});

			// Clicking the move name fires the same roll as the dice icon.
			// For moves without a rollType (Aid), fetch the full doc and post to chat.
			// Restricted to owners/GMs (isEditable) so observers cannot roll on others' actors.
			// Rollable click handler — replaces PBTA's built-in listener.
			html[0].addEventListener("click", async ev => {
				// Don't intercept clicks on enabled inputs (e.g. editing a stat value).
				if (ev.target.tagName === "INPUT" && !ev.target.disabled && !ev.target.readOnly) return;
				// Clicking the "+STAT" chip rolls the same as tapping the dice icon beside it.
				const chip = ev.target.closest(".stonetop-move-roll-chip");
				const rollable = ev.target.closest(".rollable")
					?? chip?.closest("li")?.querySelector(".rollable");
				if (!rollable || !this.isEditable) return;
				ev.stopPropagation();
				const guided = this._guidedMoveForRollable(rollable);
				if (guided) {
					this._openGuidedCharacterMove(guided, rollable);
					return;
				}
				const askItem = this._statChoiceMoveForRollable(rollable);
				if (askItem) {
					this._promptStatChoice(askItem, rollable);
					return;
				}
				const altChoice = this._altStatChoiceForRollable(rollable);
				if (altChoice) {
					this._promptStatChoice(altChoice.item, rollable, altChoice.stats);
					return;
				}
				const handled = await this._stonetopCharacter.onRoll({ currentTarget: rollable });
				if (!handled) {
					const roll = rollable.dataset.roll;
					if (!roll) return;
					if (_STAT_KEYS.has(roll)) {
						// Stat roll (STR, DEX, etc.)
						await this._stonetopCharacter.onDirectStatRoll(roll);
					} else {
						// Raw formula roll (e.g. damage die "d8")
						let label;
						if (rollable.classList.contains("stonetop-follower-damage-roll")) {
							const followerType   = rollable.dataset.followerType ?? "";
							const followerName   = (rollable.dataset.followerName   ?? "").trim();
							const followerKind   = (rollable.dataset.followerKind   ?? "").trim();
							const followerPronoun = (rollable.dataset.followerPronoun ?? "").trim().toLowerCase().split(/[\s/]/)[0];
							const damageForm     = (rollable.dataset.damageForm     ?? "").trim();
							const possessive = { he: "his", she: "her", they: "their" }[followerPronoun] ?? "its";
							if (followerType === "animal") {
								const subject  = followerName || followerKind || "animal companion";
								const formPart = damageForm ? ` with ${possessive} ${damageForm}` : "";
								label = `${subject} attacks${formPart}`;
							} else if (followerType === "initiate") {
								const formPart = damageForm ? ` with ${possessive} ${damageForm}` : "";
								label = `${this.actor.name}'s ${followerName || "initiate"} attacks${formPart}`;
							} else if (followerType === "beast") {
								const formPart = damageForm ? ` with ${possessive} ${damageForm}` : "";
								label = `${this.actor.name}'s ${followerName || "beast"} attacks${formPart}`;
							} else {
								const formPart = damageForm ? ` with ${possessive} ${damageForm}` : "";
								label = `${this.actor.name}'s ${followerName || "crew"} attacks${formPart}`;
							}
						} else {
							label = rollable.dataset.label ?? roll;
						}
						await rollDamage(roll, this.actor, { label });
					}
				}
			}, true);

			// The whole basic/expedition row is tappable, not just the dice icon.
			// The dice icon and the "+stat" chip roll via the capture handler above
			// (which stopPropagation()s), so a click only reaches here when it lands
			// on the move name or empty row space.
			html.find(".stonetop-move-item").on("click", async ev => {
				if (!this.isEditable) return;
				const li     = ev.currentTarget;
				const nameEl = li.querySelector(".stonetop-move-name");
				if (!nameEl) return;
				const moveName = nameEl.textContent.trim();

				// Expedition moves each do something on click: a bespoke dialog
				// (Requisition assets, Outfit), a guided step/roll modal, a direct
				// roll, or — failing those — posting the move text to chat.
				if (nameEl.classList.contains("stonetop-expedition-move-open")) {
					const handler = EXPEDITION_MOVE_HANDLERS[moveName];
					if (handler) { handler(this); return; }
					const guide = GUIDED_CHARACTER_MOVES[moveName];
					if (guide) {
						this._openGuidedCharacterMove({ name: moveName, guide }, li.querySelector(".rollable"));
						return;
					}
				}

				const rollable = li.querySelector(".rollable");
				if (rollable) { rollable.click(); return; }
				const { compendiumId } = nameEl.dataset;
				if (!compendiumId) return;
				const doc = await this._stonetopCharacter._moveRepo.getBasicMoveDocument(compendiumId);
				if (!doc) return;
				const speaker = ChatMessage.getSpeaker({ actor: this.actor });
				ChatMessage.create({
					content: _buildMoveChatContent(doc.name, doc.system?.description ?? ""),
					speaker,
				});
			});

			// -- Basic move hover panel --------------------------------------------
			// Runs for all users (not gated by isEditable).
			// We use a custom fixed panel rather than data-tooltip because the move
			// descriptions are rich HTML and Foundry's TooltipManager escapes content.

			// One floating panel per sheet instance; replace stale one on re-render.
			this._movePanel?.remove();
			if (getHoverDescriptionSetting("hoverDescriptionsBasicMoves")) {
				const panel = document.createElement("div");
				this._movePanel = panel;
				panel.className = "stonetop-basic-move-panel";
				panel.hidden = true;
				document.body.appendChild(panel);

				html.find(".stonetop-move-item").on("mouseenter", ev => {
					const li = ev.currentTarget;
					const descEl = li.querySelector(".stonetop-basic-move-desc");
					if (!descEl) return;
					const nameText = li.querySelector(".stonetop-move-name")?.textContent?.trim() ?? "";
					// Use DOM manipulation so nameText is never treated as HTML.
					const nameEl = document.createElement("strong");
					nameEl.className = "stonetop-basic-move-panel-name";
					nameEl.textContent = nameText;
					panel.replaceChildren(nameEl, ...Array.from(descEl.cloneNode(true).childNodes));
					panel.hidden = false;
					const rect = li.getBoundingClientRect();
					panel.style.top   = `${Math.max(4, Math.min(rect.top, window.innerHeight - panel.offsetHeight - 8))}px`;
					panel.style.right = `${window.innerWidth - rect.left + 8}px`;
				}).on("mouseleave", () => {
					panel.hidden = true;
				});
			}

			// -- Move cross-reference tooltips ---------------------------------
			this._moveRefPanel?.remove();
			const showMoveRefHover = getHoverDescriptionSetting("hoverDescriptionsPlaybookMoves");
			let moveRefPanel = null;
			if (showMoveRefHover) {
				moveRefPanel = document.createElement("div");
				this._moveRefPanel = moveRefPanel;
				moveRefPanel.className = "stonetop-word-tooltip";
				moveRefPanel.hidden = true;
				document.body.appendChild(moveRefPanel);
			}

			// Render inline glyphs (◇ Conduit tracks, etc.) as SVG across every
			// description container. Move-ref enrichment is limited to move
			// descriptions; the other containers only need glyph wrapping.
			html.find(".stonetop-item-description, .stonetop-arcanum-body, .stonetop-invocation-desc").each((_, el) => {
				if (el.dataset.glyphsWrapped) return;
				el.dataset.glyphsWrapped = "1";
				if (el.matches(".stonetop-item-description")) _enrichMoveRefsInEl(el);
				wrapStonetopGlyphsInEl(el);
			});

			// Masonry: pack arcana cards into two columns by measured height (each card
			// goes in the currently-shortest column). Unlike CSS multi-column, cards stay
			// whole — a tall flipped card never splits — and short cards never leave a big
			// row-gap beside a tall one.
			//
			// A ResizeObserver on each grid drives it: it fires when the grid first becomes
			// measurable (the Arcana tab is shown, 0 → width) and whenever the sheet is
			// resized, so the columns re-balance for the new width. The original card order
			// is captured once per grid; the width guard makes the re-pack idempotent — and
			// also breaks the feedback loop, since re-packing changes the grid's own height,
			// which would otherwise re-trigger the observer.
			const packArcanaMasonry = grid => {
				const cards = (grid._stonetopCards ??= Array.from(grid.children)
					.filter(el => el.classList.contains("stonetop-arcanum-card")));
				const width = grid.clientWidth;
				if (cards.length < 2 || !width || !cards[0].offsetHeight || grid._packedWidth === width) return;
				const cols = [0, 1].map(() => {
					const c = document.createElement("div");
					c.className = "stonetop-arcana-col";
					return c;
				});
				const heights = [0, 0];
				for (const card of cards) {
					const i = heights[0] <= heights[1] ? 0 : 1;
					heights[i] += card.offsetHeight;
					cols[i].appendChild(card);
				}
				grid.replaceChildren(...cols);
				grid._packedWidth = width;
			};
			this._arcanaMasonryObserver?.disconnect();
			this._arcanaMasonryObserver = new ResizeObserver(entries => {
				for (const entry of entries) packArcanaMasonry(entry.target);
			});
			html[0].querySelectorAll(".stonetop-arcana-grid")
				.forEach(grid => this._arcanaMasonryObserver.observe(grid));

			if (showMoveRefHover) {
				let _moveRefHovered = null;
				html.find(".stonetop-move-ref").on("mouseenter", async ev => {
					const anchor = ev.currentTarget;
					_moveRefHovered = anchor;
					const name = anchor.dataset.moveName;
					const desc = await _fetchMoveRef(name);
					if (_moveRefHovered !== anchor || !desc) return;
					moveRefPanel.innerHTML =
						`<p class="stonetop-word-tooltip-name">${name}</p>` +
						`<div class="stonetop-word-tooltip-desc">${desc}</div>`;
					moveRefPanel.hidden = false;
					const ar = anchor.getBoundingClientRect();
					const pr = moveRefPanel.getBoundingClientRect();
					let top  = ar.top - pr.height - 6;
					let left = ar.left;
					if (top < 8) top = ar.bottom + 6;
					left = Math.max(8, Math.min(left, window.innerWidth - pr.width - 8));
					moveRefPanel.style.top  = `${top}px`;
					moveRefPanel.style.left = `${left}px`;
				}).on("mouseleave", () => {
					_moveRefHovered = null;
					moveRefPanel.hidden = true;
				});
			}

			if (!this.isEditable) return;

			// Details-tab per-section edit pencils: toggle just that section's edit
			// state, independent of the global header-wrench edit mode.
			this._wireSectionEditToggle(html, ".stonetop-details-section-edit-toggle");

			// Followers tab: per-card, per-section edit pencils. Same per-section toggle
			// mechanism, keyed on `follower-<section>:<ftype>:<slug>`; opening a text
			// section (name/moves/notes) focuses its input.
			this._wireSectionEditToggle(html, ".stonetop-follower-edit, .stonetop-follower-done");
			if (this._pendingFollowerFocus) {
				const m = /^follower-(\w+):([^:]*):(.*)$/.exec(this._pendingFollowerFocus);
				this._pendingFollowerFocus = null;
				if (m) {
					const [, field, ftype, slug] = m;
					const el = html.find(`[data-field="${field}"][data-ftype="${ftype}"][data-slug="${slug}"]`)[0];
					if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) { el.focus(); el.select(); }
				}
			}

			// The Details-tab change handlers below are wired whenever any section is
			// editable — either the global wrench or an individual section pencil.
			if (this.hasActiveEdits) {
				html.find("[name=stonetop-background]").on("change", this._onBackgroundChange.bind(this));
				html.find("[name=stonetop-instinct]").on("change", ev => {
					const val = ev.currentTarget.value;
					html.find(".stonetop-instinct-custom").val(val);
					this._stonetopCharacter.instinct.select(val);
				});
				html.find(".stonetop-instinct-custom").on("change", ev =>
					this._stonetopCharacter.instinct.select(ev.currentTarget.value.trim())
				);
				html.find(".stonetop-appearance-radio").on("change", this._onAppearanceChange.bind(this));
				html.find("[name=stonetop-origin]").on("change", ev =>
					this._stonetopCharacter.origin.select(ev.currentTarget.value)
				);
				html.find(".stonetop-origin-name-check").on("change", this._onOriginNameClick.bind(this));
				html.find(".stonetop-move-check").on("change", this._onMoveCheck.bind(this));
				html.find(".stonetop-repeat-check").on("change", this._onRepeatCheck.bind(this));
				html.find(".stonetop-bg-choice").on("change", this._onBgChoiceChange.bind(this));
			}
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-item-resource-check");
				if (!btn) return;
				ev.stopPropagation();
				ev.stopImmediatePropagation();
				if (btn.classList.contains("stonetop-bg-resource-check")) {
					this._onBackgroundResourceChange({ currentTarget: btn });
				} else if (btn.dataset.moveName !== undefined) {
					this._onMoveResourceChange({ currentTarget: btn });
				} else {
					this._onPossessionUseChange({ currentTarget: btn });
				}
			}, true);
			html.find(".stonetop-inventory-item-check").on("change", this._onInventoryItemCheck.bind(this));
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-inventory-resource-btn");
				if (!btn) return;
				this._onInventoryResource({ currentTarget: btn });
			}, true);
			html.find(".stonetop-inv-add-btn").on("click", this._onAddInventoryItem.bind(this));
			html.find(".stonetop-inv-delete").on("click", this._onDeleteCustomInventoryItem.bind(this));
			html.find(".stonetop-inv-remove-special").on("click", this._onRemoveSpecialItem.bind(this));
			html.find(".stonetop-possession-check").on("change", this._onPossessionCheck.bind(this));
			html.find(".stonetop-possession-sub-check").on("change", this._onPossessionSubCheck.bind(this));
			html.find(".stonetop-possession-sub-radio").on("change", this._onPossessionSubRadio.bind(this));
			html.find(".stonetop-outfit-open-btn").on("click", this._onOutfitOpen.bind(this));
			html.find(".stonetop-levelup-open-btn").on("click", this._onLevelUpOpen.bind(this));
			html.find(".stonetop-deathsdoor-open-btn").on("click", this._onDeathsDoorOpen.bind(this));
			html.find(".stonetop-recover-open-btn").on("click", this._onRecoverOpen.bind(this));

			// -- Followers tab: shared follower-card fields ----------------
			// Common, hand-editable fields on every follower card (name,
			// exceptional/group toggles, free-text Moves/Notes, diamond Gear
			// checklist). The flag path per (ftype, slug, field) is resolved here;
			// see _followerExtras / _buildFollowersData for how they are read back.
			const followerDetailPath = (ftype, slug, field) => {
				const base = _followerDetailBase(ftype, slug);
				return base ? `${base}.${field}` : null;
			};
			// Name / pronoun and free-text Moves / Notes / stat fields. Structural
			// fields (name, pronoun, and instinct/cost on the types that store them)
			// write to the type root so they can be cleared; everything else is a
			// `.details` override field. _followerStructuralPath decides which.
			html.find(".stonetop-follower-name-field, .stonetop-follower-text, .stonetop-follower-stat-input").on("change", async ev => {
				const el   = ev.currentTarget;
				const path = _followerStructuralPath(el.dataset.ftype, el.dataset.field)
					?? followerDetailPath(el.dataset.ftype, el.dataset.slug, el.dataset.field);
				if (!path) return;
				await this.actor.setFlag("stonetop_pwd", path, el.value.trim());
				this.render(false);
			});
			// Exceptional tag chip (edit mode). A gated tag: only follower types whose
			// playbook grants it show the chip (see FOLLOWER_EXCEPTIONAL), and it can
			// be switched on only once that move is owned. Turning it off is always
			// allowed; trying to turn it on without the move warns instead of toggling.
			html.find(".stonetop-exceptional-toggle").on("click", async ev => {
				const el   = ev.currentTarget;
				const path = followerDetailPath(el.dataset.ftype, el.dataset.slug, "exceptional");
				if (!path) return;
				const turnOn = !el.classList.contains("is-selected");
				if (turnOn && el.dataset.met !== "true") {
					ui.notifications.warn(el.dataset.hint || "This follower can't be marked exceptional yet.");
					return;
				}
				await this.actor.setFlag("stonetop_pwd", path, turnOn);
				this.render(false);
			});
			// Crew tag picker: store only the player's chosen tags. The background-auto
			// tag is the disabled option, so `:not(:disabled)` excludes it — it's
			// re-derived from the active background at render, never persisted, so a
			// later background change can't strand a stale auto tag in crew.tags. The
			// pick limit is enforced on render by disabling the unchecked options once full.
			html.find(".stonetop-crew-tag-option").on("change", async () => {
				const tags = html.find(".stonetop-crew-tag-option:checked:not(:disabled)").toArray().map(el => el.value);
				await this.actor.setFlag("stonetop_pwd", "crew.tags", tags);
				this.render(false);
			});
			// Crew instinct / cost pickers (pick one from the playbook list)
			html.find(".stonetop-crew-instinct-option").on("change", async ev => {
				await this.actor.setFlag("stonetop_pwd", "crew.instinct", ev.currentTarget.value);
				this.render(false);
			});
			html.find(".stonetop-crew-cost-option").on("change", async ev => {
				await this.actor.setFlag("stonetop_pwd", "crew.cost", ev.currentTarget.value);
				this.render(false);
			});
			// Gear checklist: toggle carried, rename, add, remove
			const readFollowerGear = (ftype, slug) => {
				const path = followerDetailPath(ftype, slug, "gear");
				const cur  = path ? this.actor.getFlag("stonetop_pwd", path) : null;
				return { path, list: Array.isArray(cur) ? foundry.utils.deepClone(cur) : [] };
			};
			html.find(".stonetop-follower-gear-check").on("change", async ev => {
				const el = ev.currentTarget;
				const { path, list } = readFollowerGear(el.dataset.ftype, el.dataset.slug);
				const i = Number(el.dataset.index);
				if (!path || !list[i]) return;
				list[i].checked = el.checked;
				await this.actor.setFlag("stonetop_pwd", path, list);
				this.render(false);
			});
			html.find(".stonetop-follower-gear-label").on("change", async ev => {
				const el = ev.currentTarget;
				const { path, list } = readFollowerGear(el.dataset.ftype, el.dataset.slug);
				const i = Number(el.dataset.index);
				if (!path || !list[i]) return;
				list[i].label = el.value.trim();
				await this.actor.setFlag("stonetop_pwd", path, list);
				// no re-render: the typed value already shows; avoids a focus jump
			});
			html.find(".stonetop-follower-gear-add").on("click", async ev => {
				const el = ev.currentTarget;
				const { path, list } = readFollowerGear(el.dataset.ftype, el.dataset.slug);
				if (!path) return;
				list.push({ label: "", checked: false });
				await this.actor.setFlag("stonetop_pwd", path, list);
				this.render(false);
			});
			html.find(".stonetop-follower-gear-remove").on("click", async ev => {
				const el = ev.currentTarget;
				const { path, list } = readFollowerGear(el.dataset.ftype, el.dataset.slug);
				const i = Number(el.dataset.index);
				if (!path) return;
				list.splice(i, 1);
				await this.actor.setFlag("stonetop_pwd", path, list);
				this.render(false);
			});

			// -- Followers tab: crew interactions --------------------------
			// Loyalty pips (all follower types). The pip's data-loyalty carries its
			// ftype; clicking a filled pip clears up to it, an empty one fills up to it.
			html.find("button.stonetop-loyalty-pip").on("click", async ev => {
				const { loyalty: ftype, slug } = ev.currentTarget.dataset;
				const path = _followerLoyaltyPath(ftype, slug);
				if (!path) return;
				const idx     = Number(ev.currentTarget.dataset.index);
				const current = Number(this.actor.getFlag("stonetop_pwd", path)) || 0;
				await this.actor.setFlag("stonetop_pwd", path, current === idx + 1 ? idx : idx + 1);
				this.render(false);
			});
			// Crew gear pip circles. An inventory item is carried as a unit — its
			// pips just show its load weight — so a multi-pip ("double diamond")
			// item like the Shield or Thick hides is either fully equipped or not
			// at all. Toggling any pip fills or clears all of that item's pips
			// together (data-weight is the item's pip count).
			html.find(".stonetop-crew-gear-check").on("change", async ev => {
				const { slug, weight } = ev.currentTarget.dataset;
				const checked = ev.currentTarget.checked;
				// Flip every pip of this item (and its label styling) in the same
				// frame as the clicked one, so a double-diamond item reads as a
				// single toggle instead of one pip lagging behind the async persist.
				const pips = ev.currentTarget.closest(".stonetop-crew-gear-pips");
				if (pips) pips.querySelectorAll(".stonetop-crew-gear-check").forEach(cb => { cb.checked = checked; });
				ev.currentTarget.closest(".stonetop-crew-gear-item")?.classList.toggle("is-checked", checked);
				const gear    = foundry.utils.deepClone(this.actor.getFlag("stonetop_pwd", "crew.gear") ?? {});
				gear[slug]    = checked ? (Number(weight) || 1) : 0;
				await this.actor.setFlag("stonetop_pwd", "crew.gear", gear);
				this.render(false);
			});
			// Crew supplies pip circles — 6 independent sets stored as an array of counts
			html.find(".stonetop-crew-supplies-pip").on("change", async ev => {
				const setIdx = Number(ev.currentTarget.dataset.set);
				const pipIdx = Number(ev.currentTarget.dataset.pip);
				const newVal = ev.currentTarget.checked ? pipIdx + 1 : pipIdx;
				const current = this.actor.getFlag("stonetop_pwd", "crew.supplies");
				const arr = Array.isArray(current) ? [...current] : Array(6).fill(0);
				while (arr.length < 6) arr.push(0);
				arr[setIdx] = newVal;
				await this.actor.setFlag("stonetop_pwd", "crew.supplies", arr);
				this.render(false);
			});
			// Add a group-fight pool clamp to a pending update when the roster shrinks:
			// the pool maxes at crewSize × per-member HP, so a smaller crew must not
			// leave a stale over-max value stored. Only an explicitly-set value is
			// touched — an unset groupHp tracks the full max on its own.
			const clampStoredGroupHp = (update, crewSize) => {
				const raw = Number(this.actor.getFlag("stonetop_pwd", "crew.groupHp"));
				if (!Number.isFinite(raw)) return;
				const max = Math.max(0, crewSize) * (this._crewMemberHpMax ?? 6);
				if (raw > max) update["flags.stonetop_pwd.crew.groupHp"] = max;
			};
			// Delete individual crew member
			html.find(".stonetop-crew-delete-individual").on("click", async ev => {
				const idx = Number(ev.currentTarget.dataset.index);
				const individuals = [...(this.actor.getFlag("stonetop_pwd", "crew.individuals") ?? [])];
				if (idx < 0 || idx >= individuals.length) return;
				individuals.splice(idx, 1);
				// Re-key per-individual HP to stay aligned with the spliced array:
				// the removed entry is dropped and every entry above it shifts down
				// one. (individualsHp is an index-keyed map, not part of the array.)
				const oldHp = this.actor.getFlag("stonetop_pwd", "crew.individualsHp") ?? {};
				const newHp = {};
				for (const [k, v] of Object.entries(oldHp)) {
					const i = Number(k);
					if (i < idx)      newHp[i]     = v;
					else if (i > idx) newHp[i - 1] = v;
				}
				// Write the re-keyed entries and per-key delete any stale indices the
				// shift left behind, in one update. (Foundry recursively merges
				// object-valued flags, so without the `-=` deletes the dropped/old
				// trailing entries would persist.)
				const survivors = new Set(Object.keys(newHp));
				const update = { "flags.stonetop_pwd.crew.individuals": individuals };
				for (const k of Object.keys(oldHp))
					if (!survivors.has(k)) update[`flags.stonetop_pwd.crew.individualsHp.-=${k}`] = null;
				for (const [k, v] of Object.entries(newHp))
					update[`flags.stonetop_pwd.crew.individualsHp.${k}`] = v;
				// Shrink the roster by one: "Remove" takes the member out of the crew
				// entirely. Without this the freed slot reappears as a fresh full-HP
				// anonymous member (`size` would still imply the old headcount).
				const sizeBefore = _effectiveCrewSize(this.actor.getFlag("stonetop_pwd", "crew.size"), individuals.length + 1);
				const newSize = Math.max(individuals.length, sizeBefore - 1);
				update["flags.stonetop_pwd.crew.size"] = newSize;
				clampStoredGroupHp(update, newSize);
				await this.actor.update(update);
				this.render(false);
			});

			// Crew roster size — total headcount; never below the number of named
			// individuals. Trims trailing anonymous-member HP entries when shrinking.
			const setCrewSize = async (size) => {
				const namedCount = (this.actor.getFlag("stonetop_pwd", "crew.individuals") ?? []).length;
				const clamped    = Math.min(_CREW_SIZE_MAX, Math.max(namedCount, Math.max(0, size)));
				const anonCount  = Math.max(0, clamped - namedCount);
				const memberHp   = (this.actor.getFlag("stonetop_pwd", "crew.memberHp") ?? []).slice(0, anonCount);
				const update = {
					"flags.stonetop_pwd.crew.size":     clamped,
					"flags.stonetop_pwd.crew.memberHp": memberHp,
				};
				clampStoredGroupHp(update, clamped);
				await this.actor.update(update);
				this.render(false);
			};
			html.find(".stonetop-crew-size-step").on("click", ev => {
				const delta = Number(ev.currentTarget.dataset.delta) || 0;
				const input = ev.currentTarget.parentElement.querySelector(".stonetop-crew-size-input");
				setCrewSize((parseInt(input?.value) || 0) + delta);
			});
			html.find(".stonetop-crew-size-input").on("change", ev => {
				const v = parseInt(ev.currentTarget.value);
				// Blank/non-numeric input: revert to the current size rather than
				// collapsing the roster to the named count (which would drop every
				// anonymous member's tracked HP).
				if (!Number.isFinite(v)) return this.render(false);
				setCrewSize(v);
			});

			// Crew Readiness (Defend pool)
			html.find(".stonetop-crew-readiness-step").on("click", async ev => {
				const delta = Number(ev.currentTarget.dataset.delta) || 0;
				const cur   = Math.max(0, Number(this.actor.getFlag("stonetop_pwd", "crew.readiness")) || 0);
				await this.actor.setFlag("stonetop_pwd", "crew.readiness", Math.max(0, cur + delta));
				this.render(false);
			});

			// Restore the abstracted group-fight pool to full (clears the override)
			html.find(".stonetop-group-hp-reset").on("click", async () => {
				await this.actor.unsetFlag("stonetop_pwd", "crew.groupHp");
				this.render(false);
			});

			// Remember which collapsible crew sections are open across re-renders and,
			// via the persisted per-actor setting, across sheet reopens. Native
			// <details> already updates the DOM, so we only record the state (no
			// re-render) for the next render to honour.
			html.find(".stonetop-crew-collapsible").on("toggle", ev => {
				const id = ev.currentTarget.dataset.section;
				if (!id) return;
				this._openCrewSections ??= new Set();
				if (ev.currentTarget.open) this._openCrewSections.add(id);
				else                       this._openCrewSections.delete(id);
				this._persistCrewSections();
			});
			// Name an (anonymous) crew member: promote them to a named individual,
			// carrying their current HP across. Opened from each member's "Name them"
			// button in edit mode, which targets that specific roster slot.
			const openNameMemberDialog = async (anonIndex) => {
				// Crew individual options are defined here rather than read from the
				// LevelDB pack so they are always available without a rebuild step.
				const CREW_INDIVIDUAL_NAMES  = ["Aled","Culhwch","Eira","Gerat","Glaw","Harri","Lowri","Mervyn","Nesta"];
				const CREW_INDIVIDUAL_TAGS   = ["animal-lover","big","bully","cynical","drunkard","eager","gambler","greedy","grumpy","gullible","hearthrob","honest","kind","little","naive","old","popular","proud","reckless","rookie","shameless","sharp-eyed","short-tempered"];
				const CREW_INDIVIDUAL_TRAITS = ["__'s kid/sibling/parent/cousin/__","bald","crush on __","grudge against __","hates __","idolizes __","jokes a lot","messy","missing eye/finger/hand/__","misses their kids","nightmares","recently married","religious","scars","skinny","sharp-tongued","sings","snores","tells tall tales","too serious","whistler","whittler"];

				// Fall back to playbook data if present (post-rebuild), otherwise use constants above.
				const playbookDoc = await this._stonetopCharacter.playbook();
				const indOpts     = playbookDoc?.flags?.stonetop?.crew?.individualOptions ?? {};
				const names  = indOpts.names?.length  ? indOpts.names  : CREW_INDIVIDUAL_NAMES;
				const tags   = indOpts.tags?.length   ? indOpts.tags   : CREW_INDIVIDUAL_TAGS;
				const traits = indOpts.traits?.length ? indOpts.traits : CREW_INDIVIDUAL_TRAITS;

				const namesHtml = names.map(n => `<option value="${n}">`).join("");
				const tagsHtml  = tags.map(t => `<option value="${t}">${t}</option>`).join("");

				// -- Trait tokenizer ---------------------------------------
				// Splits a trait into: text | standalone __ | slash-option group
				// e.g. "missing eye/finger/hand/__" ?
				//   [text:"missing "], [opts:["eye","finger","hand","__"]]
				// e.g. "__'s kid/sibling/parent/cousin/__" ?
				//   [blank], [text:"'s "], [opts:["kid","sibling","parent","cousin","__"]]
				const tokenize = str => {
					const tokens = [];
					// Greedy: standalone __, then slash-group, then whitespace, then word
					const re = /__|(?:[^\s/]+(?:\/[^\s/]+)+)|[^\s/]+|\s+/g;
					let m;
					while ((m = re.exec(str)) !== null) {
						if (m[0] === "__")         tokens.push({ type: "blank" });
						else if (m[0].includes("/")) tokens.push({ type: "opts", opts: m[0].split("/") });
						else                         tokens.push({ type: "text", text: m[0] });
					}
					return tokens;
				};

				// Build one chip's inner HTML from its tokens, tracking slot indices
				const buildChipInner = (tokens, safeVal) => {
					let html    = `<input type="checkbox" class="stonetop-check" name="traits" value="${safeVal}">`;
					let slotIdx = 0;
					for (const tok of tokens) {
						if (tok.type === "text") {
							html += `<span class="stonetop-trait-text">${tok.text}</span>`;
						} else if (tok.type === "blank") {
							const s = slotIdx++;
							html += `<span class="stonetop-trait-blank">___</span>`;
							html += `<input type="text" class="stonetop-trait-fill" data-slot="${s}" style="display:none" placeholder="…">`;
						} else { // opts
							const s       = slotIdx++;
							const hasCust = tok.opts.includes("__");
							const display = tok.opts.map(o => o === "__" ? "___" : o).join("/");
							const optHtml = tok.opts.map(o =>
								o === "__" ? `<option value="__">___ (type your own)</option>`
								           : `<option value="${o}">${o}</option>`
							).join("");
							html += `<span class="stonetop-trait-blank">${display}</span>`;
							html += `<select class="stonetop-trait-select" data-slot="${s}" style="display:none">
								<option value="">— pick one —</option>${optHtml}
							</select>`;
							if (hasCust) {
								html += `<input type="text" class="stonetop-trait-custom" data-slot="${s}" style="display:none" placeholder="custom…">`;
							}
						}
					}
					return html;
				};

				const traitsHtml = traits.map(t => {
					const safeVal = t.replace(/"/g, "&quot;");
					const tokens  = tokenize(t);
					const simple  = tokens.every(tok => tok.type === "text");
					if (simple) {
						return `<span class="stonetop-trait-chip-group">
							<label class="stonetop-individual-trait-chip">
								<input type="checkbox" class="stonetop-check" name="traits" value="${safeVal}"> ${t}
							</label>
						</span>`;
					}
					return `<span class="stonetop-trait-chip-group" data-trait="${safeVal}">
						<label class="stonetop-individual-trait-chip">
							${buildChipInner(tokens, safeVal)}
						</label>
					</span>`;
				}).join("");

				const content = `
					<form class="stonetop-individual-form">
						<div class="form-group">
							<label>Name</label>
							<input type="text" name="ind-name" list="ind-names" placeholder="Enter a name…">
							<datalist id="ind-names">${namesHtml}</datalist>
						</div>
						<div class="form-group">
							<label>Tag</label>
							<select name="ind-tag"><option value="">— choose one —</option>${tagsHtml}</select>
						</div>
						<div class="form-group stonetop-individual-traits-group">
							<label>Traits <em>(choose one or more)</em></label>
							<div class="stonetop-individual-traits-grid">${traitsHtml}</div>
						</div>
					</form>`;

				new Dialog({
					title:   "Name this Crew Member",
					content,
					buttons: {
						cancel: { label: "Cancel" },
						add: {
							icon:  "<i class='fas fa-user-pen'></i>",
							label: "Name",
							callback: async (dlgHtml) => {
								const name = dlgHtml.find("[name='ind-name']").val().trim();
								if (!name) return;
								const tag    = dlgHtml.find("[name='ind-tag']").val();
								const traits = [];
								dlgHtml.find("[name='traits']:checked").each((_, cb) => {
									const group  = cb.closest(".stonetop-trait-chip-group");
									const tokens = tokenize(cb.value);
									let slotIdx  = 0;
									let result   = "";
									for (const tok of tokens) {
										if (tok.type === "text") {
											result += tok.text;
										} else if (tok.type === "blank") {
											const s  = slotIdx++;
											const el = group.querySelector(`.stonetop-trait-fill[data-slot="${s}"]`);
											result  += el?.value.trim() || "__";
										} else { // opts
											const s   = slotIdx++;
											const sel = group.querySelector(`.stonetop-trait-select[data-slot="${s}"]`);
											if (sel?.value === "__") {
												const cust = group.querySelector(`.stonetop-trait-custom[data-slot="${s}"]`);
												result += cust?.value.trim() || "__";
											} else {
												result += sel?.value || tok.opts[0];
											}
										}
									}
									traits.push(result);
								});
								// Promote the targeted anonymous member: append the named
								// individual, carry its current HP over, and drop it from
								// the anonymous-member HP list.
								const individuals   = [...(this.actor.getFlag("stonetop_pwd", "crew.individuals") ?? [])];
								const newIndex      = individuals.length;
								const memberHp      = [...(this.actor.getFlag("stonetop_pwd", "crew.memberHp") ?? [])];
								const carriedHp     = memberHp[anonIndex];
								const individualsHp = { ...(this.actor.getFlag("stonetop_pwd", "crew.individualsHp") ?? {}) };
								if (carriedHp != null) individualsHp[newIndex] = carriedHp;
								memberHp.splice(anonIndex, 1);
								await this.actor.update({
									"flags.stonetop_pwd.crew.individuals":   [...individuals, { name, tag, traits }],
									"flags.stonetop_pwd.crew.individualsHp": individualsHp,
									"flags.stonetop_pwd.crew.memberHp":      memberHp,
								});
								this.render(false);
							},
						},
					},
					default: "add",
					render: (dlgHtml) => {
						keepDialogOnTop(dlgHtml);
						// Checkbox toggle: expand/collapse the chip
						dlgHtml.find("[name='traits']").on("change", ev => {
							const group   = ev.currentTarget.closest(".stonetop-trait-chip-group");
							const checked = ev.currentTarget.checked;
							group?.classList.toggle("is-selected", checked);
							group?.querySelectorAll(".stonetop-trait-blank").forEach(el =>
								el.style.display = checked ? "none" : ""
							);
							group?.querySelectorAll(".stonetop-trait-fill, .stonetop-trait-select").forEach(el => {
								el.style.display = checked ? "inline-block" : "none";
								if (!checked) el.value = "";
							});
							group?.querySelectorAll(".stonetop-trait-custom").forEach(el => {
								el.style.display = "none";
								el.value = "";
							});
						});
						// Select ? show custom input when "__ (type your own)" chosen
						dlgHtml[0].addEventListener("change", ev => {
							const sel = ev.target;
							if (!sel.classList.contains("stonetop-trait-select")) return;
							const group  = sel.closest(".stonetop-trait-chip-group");
							const custom = group?.querySelector(`.stonetop-trait-custom[data-slot="${sel.dataset.slot}"]`);
							if (!custom) return;
							custom.style.display = sel.value === "__" ? "inline-block" : "none";
							if (sel.value !== "__") custom.value = "";
						});
					},
				}, { width: 540, height: 580, classes: ["dialog", "stonetop-individual-dialog"] }).render(true);
			};
			html.find(".stonetop-crew-name-member").on("click", ev => {
				openNameMemberDialog(Number(ev.currentTarget.dataset.index));
			});
			html.find(".stonetop-inventory-reset-btn").on("click", this._onInventoryReset.bind(this));

			// -- Followers: group fight outnumber calculator --
			html[0].addEventListener("input", ev => {
				const inp = ev.target;
				if (!inp.classList.contains("stonetop-outnumber-yours") && !inp.classList.contains("stonetop-outnumber-theirs")) return;
				const row    = inp.closest(".stonetop-group-fight-outnumber-row");
				if (!row) return;
				const yours  = Math.max(1, parseInt(row.querySelector(".stonetop-outnumber-yours")?.value)  || 1);
				const theirs = Math.max(1, parseInt(row.querySelector(".stonetop-outnumber-theirs")?.value) || 1);
				const bonus  = Math.max(0, Math.floor(yours / theirs) - 1);
				const resultEl = row.querySelector(".stonetop-outnumber-result");
				if (resultEl) resultEl.textContent = bonus > 0 ? `+${bonus} damage, +${bonus} armor` : "no bonus";
				const section  = row.closest(".stonetop-group-fight-section");
				const dmgBtn   = section?.querySelector(".stonetop-group-fight-dmg-roll");
				const dmgLabel = section?.querySelector(".stonetop-group-fight-dmg-label");
				// Build on the crew's actual damage die (carried in data-base-roll,
				// which honours any Damage override), not a hardcoded d6.
				const baseDie  = dmgBtn?.dataset.baseRoll || "d6";
				const roll     = bonus > 0 ? `${baseDie}+${bonus}` : baseDie;
				if (dmgBtn)   dmgBtn.dataset.roll     = roll;
				if (dmgLabel) dmgLabel.textContent    = roll;
			}, true);

			// -- Followers: group fight Clash / Let Fly --
			html[0].addEventListener("click", async ev => {
				const btn = ev.target.closest(".stonetop-group-fight-roll");
				if (!btn) return;
				ev.stopPropagation();
				const stat = btn.dataset.stat;
				if (!stat) return;
				// Read the name off the group-fight damage button's data attribute, not
				// the header's name text — that text node is replaced by an <input> in
				// edit mode, which would drop the name to the "Crew" fallback.
				const section  = btn.closest(".stonetop-group-fight-section");
				const crewName = section?.querySelector(".stonetop-group-fight-dmg-roll")?.dataset.followerName?.trim() || "Crew";
				const moveName = stat === "str" ? `${crewName}: Clash` : `${crewName}: Let Fly`;
				await this._stonetopCharacter.onDirectStatRoll(stat, { moveName });
			}, true);

			html.find(".stonetop-invocation-check").on("change", async ev => {
				const { slug } = ev.currentTarget.dataset;
				const current = this.actor.getFlag("stonetop_pwd", "invocations.selected") ?? [];
				const updated = ev.currentTarget.checked
					? [...current, slug]
					: current.filter(s => s !== slug);
				await this.actor.setFlag("stonetop_pwd", "invocations.selected", updated);
				this.render(false);
			});
			// Tapping an Invocation's title posts its details to chat, mirroring moves.
			html.find(".stonetop-invocation-name").on("click", ev => {
				const card = ev.currentTarget.closest(".stonetop-invocation-card");
				if (!card) return;
				const name = ev.currentTarget.textContent.trim();
				const description = card.querySelector(".stonetop-invocation-desc")?.innerHTML ?? "";
				ChatMessage.create({
					content: _buildMoveChatContent(name, description),
					speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				});
			});
			html.find(".stonetop-other-move-delete").on("click", async ev => {
				const { itemId } = ev.currentTarget.dataset;
				await this._stonetopCharacter.removeMove(itemId);
			});

			html[0].addEventListener("click", ev => {
				const title = ev.target.closest(".stonetop-arcanum-title--clickable");
				if (!title) return;
				ev.stopPropagation();
				const { slug, flipped } = title.dataset;
				this._stonetopCharacter.getArcanumChatContent(slug, flipped === "true").then(content => {
					if (!content) return;
					ChatMessage.create({
						content,
						speaker: ChatMessage.getSpeaker({ actor: this.actor }),
						rollMode: game.settings.get("core", "rollMode"),
					});
				});
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-identify-btn");
				if (!btn) return;
				ev.stopPropagation();
				const { slug } = btn.dataset;
				Dialog.confirm({
					title: game.i18n.localize("stonetop.arcana.identifyTitle"),
					content: `<p>${game.i18n.localize("stonetop.arcana.identifyConfirm")}</p>`,
					yes: () => this._stonetopCharacter.identifyArcanum(slug).then(() => this.render(false)),
					render: keepDialogOnTop,
				});
			}, true);

			html[0].addEventListener("click", ev => {
				const thumb = ev.target.closest(".stonetop-arcanum-thumb, .stonetop-lore-arcana-img");
				if (!thumb) return;
				ev.stopPropagation();
				new ImagePopout(thumb.src, { title: thumb.dataset.name }).render(true);
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-flip-btn");
				if (!btn) return;
				ev.stopPropagation();
				const { slug, flipped } = btn.dataset;
				if (flipped === "true") {
					this._stonetopCharacter.unflipArcanum(slug).then(() => this.render(false));
				} else {
					this._stonetopCharacter.flipArcanum(slug).then(() => this.render(false));
				}
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-resource-btn");
				if (!btn) return;
				ev.stopPropagation();
				const { slug, index } = btn.dataset;
				const isChecked = btn.classList.contains("is-checked");
				const newVal = isChecked ? Number(index) : Number(index) + 1;
				this._stonetopCharacter.setArcanumResource(slug, newVal).then(() => this.render(false));
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-delete");
				if (!btn) return;
				ev.stopPropagation();
				const { slug } = btn.dataset;
				this._stonetopCharacter.removeArcanum(slug).then(() => this.render(true));
			}, true);

			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".stonetop-arcanum-unlock-check");
				if (!cb) return;
				const { arcanumSlug, optionSlug, index } = cb.dataset;
				const newCount = cb.checked ? Number(index) + 1 : Number(index);
				this._stonetopCharacter.setArcanumUnlockCount(arcanumSlug, optionSlug, newCount);
			}, true);

			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".stonetop-arcanum-box, .stonetop-arcanum-circle, .stonetop-arcanum-diamond");
				if (!cb) return;
				ev.stopPropagation();
				const { arcanumSlug, context, index } = cb.dataset;
				this._stonetopCharacter.setArcanumBoxChecked(arcanumSlug, context, Number(index), cb.checked);
			}, true);

			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".stonetop-lore-option-check");
				if (!cb || ev.target.closest("[data-pdi='lore']")) return;
				const { loreSlug, optionSlug, idx } = cb.dataset;
				const newCount = cb.checked ? Number(idx) + 1 : Number(idx);
				this._stonetopCharacter.setLoreOptionCount(loreSlug, optionSlug, newCount);
			}, true);

			html[0].addEventListener("change", ev => {
				const ta = ev.target.closest(".stonetop-lore-option-text");
				if (!ta || ev.target.closest("[data-pdi='lore']")) return;
				const { loreSlug, optionSlug } = ta.dataset;
				this._stonetopCharacter.setLoreOptionText(loreSlug, optionSlug, ta.value);
			}, true);

			html[0].addEventListener("change", ev => {
				const sel = ev.target.closest(".stonetop-lore-arcana-select");
				if (!sel) return;
				this._stonetopCharacter.setMinorArcanumRole(sel.dataset.role, sel.value);
			}, true);

			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".stonetop-move-mark-check");
				if (cb) {
					const { moveName, markSlug, idx } = cb.dataset;
					this._stonetopCharacter.setCountMark(moveName, markSlug, cb.checked ? Number(idx) + 1 : Number(idx));
					return;
				}
				const sel = ev.target.closest(".stonetop-move-mark-stat");
				if (sel) {
					const { moveName, markSlug, idx } = sel.dataset;
					this._stonetopCharacter.setStatSlot(moveName, markSlug, Number(idx), sel.value);
					return;
				}
				const lvl = ev.target.closest(".stonetop-move-mark-level");
				if (lvl) {
					const { moveName, markSlug, idx } = lvl.dataset;
					this._stonetopCharacter.setMarkLevel(moveName, markSlug, Number(idx), parseInt(lvl.value, 10));
				}
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-pdi-activate");
				if (!btn) return;
				ev.stopPropagation();
				this._stonetopCharacter.setPostDeathInsert(btn.dataset.slug).then(() => this.render(false));
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-pdi-remove");
				if (!btn) return;
				ev.stopPropagation();
				this._stonetopCharacter.setPostDeathInsert(null).then(() => this.render(false));
			}, true);

			html[0].addEventListener("change", ev => {
				const radio = ev.target.closest(".stonetop-pdi-instinct");
				if (!radio) return;
				this._stonetopCharacter.setPostDeathInstinct(radio.value);
			}, true);

			html[0].addEventListener("change", ev => {
				if (!ev.target.closest("[data-pdi='lore']")) return;
				const cb = ev.target.closest(".stonetop-lore-option-check");
				if (!cb) return;
				const { loreSlug, optionSlug, idx } = cb.dataset;
				const newCount = cb.checked ? Number(idx) + 1 : Number(idx);
				this._stonetopCharacter.setPostDeathLoreCount(loreSlug, optionSlug, newCount);
			}, true);

			html[0].addEventListener("change", ev => {
				if (!ev.target.closest("[data-pdi='lore']")) return;
				const ta = ev.target.closest(".stonetop-lore-option-text");
				if (!ta) return;
				const { loreSlug, optionSlug } = ta.dataset;
				this._stonetopCharacter.setPostDeathLoreText(loreSlug, optionSlug, ta.value);
			}, true);

			// (Pronoun is a structural field routed through the shared
			// .stonetop-follower-name-field change handler above.)

			// -- Followers tab: HP tracking --------------------------------
			html[0].addEventListener("change", async ev => {
				const input = ev.target.closest(".stonetop-follower-hp-input");
				if (!input) return;
				const max = Number(input.max);
				// Clamp to the field's max on write, not just on the next render's
				// display — otherwise a typed over-max value (the max= attribute is
				// advisory) would persist and resurface if the max later grows.
				let val = Math.max(0, parseInt(input.value) || 0);
				if (Number.isFinite(max) && max > 0) val = Math.min(val, max);
				const { follower, slug, index } = input.dataset;
				// The per-slug / per-index HP stores are object-valued flags; write the
				// single changed key with a dotted path (Foundry merges it in) instead
				// of cloning and rewriting the whole map on every blur.
				if (follower === "animal-companion") {
					await this.actor.setFlag("stonetop_pwd", "animalCompanion.hpCurrent", val);
				} else if (follower === "initiate") {
					await this.actor.update({ [`flags.stonetop_pwd.initiatesHp.${slug}`]: val });
				} else if (follower === "crew-individual") {
					await this.actor.update({ [`flags.stonetop_pwd.crew.individualsHp.${Number(index)}`]: val });
				} else if (follower === "crew-member") {
					const arr = [...(this.actor.getFlag("stonetop_pwd", "crew.memberHp") ?? [])];
					arr[Number(index)] = val;
					await this.actor.setFlag("stonetop_pwd", "crew.memberHp", arr);
				} else if (follower === "crew-group") {
					await this.actor.setFlag("stonetop_pwd", "crew.groupHp", val);
				} else if (follower === "beast") {
					await this.actor.update({ [`flags.stonetop_pwd.beastHp.${slug}`]: val });
				}
				this.render(false);
			}, true);

			this._activateTabDragDrop(html);
		}

		_activateTabDragDrop(html) {
			const root = html[0];
			const nav = root.querySelector(".sheet-tabs");
			if (!nav) return;

			this._applyTabOrder(root);

			let dragSource = null;

			nav.querySelectorAll(".item[data-tab]").forEach(tab => { tab.draggable = true; });

			nav.addEventListener("dragstart", ev => {
				dragSource = ev.target.closest(".item[data-tab]");
				if (!dragSource) return;
				ev.dataTransfer.setData("text/plain", dragSource.dataset.tab);
				ev.dataTransfer.effectAllowed = "move";
				dragSource.classList.add("stonetop-tab-dragging");
			});

			nav.addEventListener("dragover", ev => {
				ev.preventDefault();
				ev.dataTransfer.dropEffect = "move";
				const target = ev.target.closest(".item[data-tab]");
				if (!target || target === dragSource) return;
				nav.querySelectorAll(".item[data-tab]").forEach(t => t.classList.remove("stonetop-tab-drag-over"));
				target.classList.add("stonetop-tab-drag-over");
			});

			nav.addEventListener("dragleave", ev => {
				if (!nav.contains(ev.relatedTarget)) {
					nav.querySelectorAll(".item[data-tab]").forEach(t => t.classList.remove("stonetop-tab-drag-over"));
				}
			});

			nav.addEventListener("drop", async ev => {
				ev.preventDefault();
				const target = ev.target.closest(".item[data-tab]");
				nav.querySelectorAll(".item[data-tab]").forEach(t => t.classList.remove("stonetop-tab-drag-over", "stonetop-tab-dragging"));
				if (!target || target === dragSource || !dragSource) return;
				const tabs = [...nav.querySelectorAll(".item[data-tab]")];
				if (tabs.indexOf(dragSource) < tabs.indexOf(target)) target.after(dragSource);
				else target.before(dragSource);
				const newOrder = [...nav.querySelectorAll(".item[data-tab]")].map(t => t.dataset.tab);
				this._applyTabOrder(root, newOrder);
				await this.actor.setFlag("stonetop_pwd", "tabOrder", newOrder);
				this.render(false);
				dragSource = null;
			});

			nav.addEventListener("dragend", () => {
				nav.querySelectorAll(".item[data-tab]").forEach(t => t.classList.remove("stonetop-tab-dragging", "stonetop-tab-drag-over"));
				dragSource = null;
			});
		}

		_applyTabOrder(root, order = null) {
			const nav = root.querySelector(".sheet-tabs");
			const body = root.querySelector(".sheet-body");
			if (!nav) return;
			const savedOrder = order ?? this.actor.getFlag("stonetop_pwd", "tabOrder");
			if (!savedOrder?.length) return;
			const tabs = [...nav.querySelectorAll(".item[data-tab]")];
			const tabMap = new Map(tabs.map(t => [t.dataset.tab, t]));
			const panels = body ? [...body.children].filter(el => el.matches?.(".tab[data-tab]")) : [];
			const panelMap = new Map(panels.map(panel => [panel.dataset.tab, panel]));
			for (const key of savedOrder) {
				const tab = tabMap.get(key);
				if (tab) nav.appendChild(tab);
				const panel = panelMap.get(key);
				if (panel) body.appendChild(panel);
			}
			for (const tab of tabs) {
				if (!savedOrder.includes(tab.dataset.tab)) nav.appendChild(tab);
			}
			for (const panel of panels) {
				if (!savedOrder.includes(panel.dataset.tab)) body.appendChild(panel);
			}
		}

		_getDragEventData(ev) {
			return getDragEventData(ev);
		}

		// Initial HP for a newly-assigned playbook (full HP). max is also synced in
		// getData, but the current value must be seeded here or it stays at the default.
		_playbookHpInit(playbookDoc) {
			const hp = playbookDoc.flags?.stonetop?.hp;
			return hp ? { "system.attributes.hp.max": hp, "system.attributes.hp.value": hp } : {};
		}

		async _onDropPlaybook(playbookDoc) {
			if (!this.isEditable) return;
			if (playbookDoc.flags?.stonetop?.lore?.length) {
				const slug = playbookDoc.system?.slug;
				if (slug) await this._stonetopCharacter.setPostDeathInsert(slug);
				this.render(false);
				return;
			}
			await this.actor.update({
				"system.playbook": {
					uuid: playbookDoc.uuid,
					name: playbookDoc.name,
					slug: playbookDoc.system?.slug ?? "",
				},
				...this._playbookHpInit(playbookDoc),
			});
			await this._stonetopCharacter.ensureStartingMoves();
			this.render(false);
		}

		async _onDropItemCreate(itemData) {
			const items  = Array.isArray(itemData) ? itemData : [itemData];
			const arcana = items.filter(i => i.type === "move" && i.system?.moveType === "arcanum");
			const moves  = items.filter(i => i.type === "move" && i.system?.moveType !== "arcanum");
			const others = items.filter(i => i.type !== "move");
			let anyAdded = false;
			for (const item of arcana) {
				const slug = item.flags?.stonetop?.slug;
				if (slug) {
					await this._stonetopCharacter.addArcanum(slug);
					anyAdded = true;
				}
			}
			for (const item of moves) {
				if (await this._stonetopCharacter.onDropMove(item)) anyAdded = true;
			}
			if (others.length) await super._onDropItemCreate(others);
			if (anyAdded) this.render(false);
		}

		_statChoiceMoveForRollable(rollable) {
			const itemId = rollable.closest(".item")?.dataset.itemId;
			if (!itemId) return null;
			const item = this.actor.items.get(itemId);
			if (!item || normalizeRollType(item.system?.rollType) !== "ask") return null;
			return item;
		}

		// A fixed-stat move (e.g. Clash +STR) becomes a stat choice when the actor owns a
		// move that grants an alternate stat for it (e.g. Skill at Arms → +DEX). Returns
		// { item, stats: [default, ...alts] } or null. See ALT_STAT_GRANTS.
		_altStatChoiceForRollable(rollable) {
			const itemId = rollable.closest(".item")?.dataset.itemId;
			if (!itemId) return null;
			const item = this.actor.items.get(itemId);
			if (!item || item.type !== "move") return null;
			const defaultStat = normalizeRollType(item.system?.rollType);
			if (!defaultStat || !_STAT_KEYS.has(defaultStat)) return null; // skip "ask"/formula moves
			const owned = new Set(this.actor.items.filter(i => i.type === "move").map(i => i.name));
			const alts = [];
			for (const g of ALT_STAT_GRANTS) {
				const matches = (g.whenMove && g.whenMove === item.name)
					|| (g.whenDefaultStat && g.whenDefaultStat === defaultStat);
				if (matches && owned.has(g.ownsMove) && g.altStat !== defaultStat && !alts.includes(g.altStat)) {
					alts.push(g.altStat);
				}
			}
			if (!alts.length) return null;
			return { item, stats: [defaultStat, ...alts] };
		}

		_promptStatChoice(item, rollable, statKeys = _STAT_KEYS) {
			const stats = this.actor.system?.stats ?? {};
			const buttons = {};
			for (const key of statKeys) {
				const value = stats[key]?.value ?? 0;
				const label = Handlebars.helpers.statLabel(key);
				buttons[key] = {
					label: `${label} (${sign(value)})`,
					callback: () => this._stonetopCharacter.onRoll({ currentTarget: rollable }, { statOverride: key }),
				};
			}
			new Dialog({
				title: `${item.name} — Choose a Stat`,
				content: `<p>Which stat are you rolling with?</p>`,
				buttons,
				render: keepDialogOnTop,
			}, { width: 480, classes: ["dialog", "stonetop-stat-picker-dialog"] }).render(true);
		}

		_guidedMoveForRollable(rollable) {
			const li = rollable.closest(".stonetop-item");
			const name = li?.querySelector(".stonetop-item-name")?.textContent?.trim()
				?? rollable.dataset.label?.trim();
			const guide = GUIDED_CHARACTER_MOVES[name];
			return guide ? { name, guide } : null;
		}

		_openGuidedCharacterMove({ name, guide }, rollable) {
			const fieldsHtml = (guide.fields ?? []).map(field => `<label class="stonetop-homestead-field">
				<span>${_esc(field.label)}</span>
				${field.type === "textarea"
					? `<textarea name="${_esc(field.name)}" rows="2" placeholder="${_esc(field.placeholder)}"></textarea>`
					: `<input type="text" name="${_esc(field.name)}" placeholder="${_esc(field.placeholder)}">`}
			</label>`).join("");
			const resultsHtml = guide.results?.length
				? `<div class="stonetop-homestead-reference">
					<strong>Results</strong>
					<ul>${guide.results.map(result => `<li>${_formatResultLine(result)}</li>`).join("")}</ul>
				</div>`
				: "";
			const picksHtml = guide.picks?.length
				? `<div class="stonetop-homestead-reference">
					<strong>${_esc(guide.picksLabel ?? "Choose")}</strong>
					<div class="stonetop-homestead-choice-list">
						${guide.picks.map((pick, index) => `<label class="stonetop-homestead-choice">
							<input type="checkbox" class="stonetop-check" name="pick.${index}" value="${_esc(pick)}">
							<span>${_esc(pick)}</span>
						</label>`).join("")}
					</div>
				</div>`
				: "";

			// A guide may roll without an owned item (e.g. expedition moves): `guide.roll`
			// is a stat key, or "ask" to let the player pick a stat in the dialog.
			const askStat = !rollable && guide.roll === "ask";
			const statPickerHtml = askStat
				? `<label class="stonetop-homestead-field stonetop-guided-stat-pick">
					<span>Roll with</span>
					<select name="guidedRollStat">${_STAT_CHOICES.map(([key, label]) => `<option value="${key}">+${label}</option>`).join("")}</select>
				</label>`
				: "";

			const buttons = {
				cancel: { label: "Cancel" },
				post: {
					label: "Post",
					callback: html => this._postGuidedCharacterMove(name, guide, html),
				},
			};
			if (rollable) {
				buttons.roll = {
					label: `Roll +${(rollable.dataset.roll ?? "").toUpperCase()}`,
					callback: async html => {
						await this._postGuidedCharacterMove(name, guide, html);
						await this._stonetopCharacter.onRoll({ currentTarget: rollable });
					},
				};
			} else if (guide.roll) {
				const fixedStat = askStat ? null : guide.roll;
				buttons.roll = {
					label: fixedStat ? `Roll +${fixedStat.toUpperCase()}` : "Roll",
					callback: async html => {
						await this._postGuidedCharacterMove(name, guide, html);
						const stat = fixedStat ?? html[0]?.querySelector('[name="guidedRollStat"]')?.value ?? "wis";
						await this._stonetopCharacter.onDirectStatRoll(stat, { moveName: name });
					},
				};
			}

			new Dialog({
				title: name,
				content: `<form class="stonetop-homestead-dialog stonetop-character-move-dialog">
					<p class="stonetop-homestead-trigger"><em>${_esc(guide.trigger)}</em></p>
					${fieldsHtml || statPickerHtml ? `<div class="stonetop-homestead-fields">${fieldsHtml}${statPickerHtml}</div>` : ""}
					${resultsHtml}
					${picksHtml}
					${guide.note ? `<p class="stonetop-homestead-note">${_esc(guide.note)}</p>` : ""}
				</form>`,
				buttons,
				default: (rollable || guide.roll) ? "roll" : "post",
				render: keepDialogOnTop,
			}, { width: 520 }).render(true);
		}

		async _postGuidedCharacterMove(name, guide, html) {
			const form = html[0]?.querySelector(".stonetop-character-move-dialog");
			if (!form) return;
			const data = Object.fromEntries(new FormData(form));
			const rows = [];
			for (const field of guide.fields ?? []) {
				const raw   = data[field.name];
				const value = field.type === "checkbox"
					? (raw ? "yes" : "")
					: String(raw ?? "").trim();
				if (value) rows.push({ label: field.label, value });
			}
			const selected = Object.entries(data)
				.filter(([key]) => key.startsWith("pick."))
				.map(([, value]) => String(value ?? "").trim())
				.filter(Boolean);
			if (selected.length) rows.push({ label: "Selected", value: selected.join("\n") });
			postMoveToChat(this.actor, name, rows);
		}

		async _onBackgroundChange(ev) {
			const slug = ev.currentTarget.value;
			await this._stonetopCharacter.background.selectBackground(slug);
			await this._stonetopCharacter.ensureStartingMoves();
		}

		async _onAppearanceChange(ev) {
			const el = ev.currentTarget;
			await this._stonetopCharacter.appearance.select(Number(el.dataset.line), el.value);
		}

		async _onOriginNameClick(ev) {
			await this._stonetopCharacter.updateName(ev.currentTarget.value);
		}

		async _onMoveCheck(ev) {
			const el = ev.currentTarget;
			if (el.checked) {
				await this._stonetopCharacter.addMove(el.dataset.compendiumId);
			} else {
				await this._stonetopCharacter.removeMove(el.dataset.ownedId);
			}
		}

		async _onRepeatCheck(ev) {
			const el = ev.currentTarget;
			if (el.checked) {
				await this._stonetopCharacter.addMove(el.dataset.compendiumId);
			} else {
				await this._stonetopCharacter.removeMove(el.dataset.ownedId);
			}
		}

		async _onMoveResourceChange(ev) {
			const button = new MoveResourceButton(ev);
			await this._stonetopCharacter.moveResources.add(button);
		}

		async _onBackgroundResourceChange(ev) {
			const { key, index } = ev.currentTarget.dataset;
			if (!key) return;
			const value = ev.currentTarget.classList.contains("is-checked") ? Number(index) : Number(index) + 1;
			await this._stonetopCharacter.background.setSetupResource(key, value);
		}

		async _onBgChoiceChange(ev) {
			const choice = new BackgroundInputChoice(ev);
			await this._stonetopCharacter.background.addChoice(choice);
		}

		async _onPossessionCheck(ev) {
			const { slug } = ev.currentTarget.dataset;
			if (ev.currentTarget.checked) {
				await this._stonetopCharacter.selectPossession(slug);
			} else {
				await this._stonetopCharacter.deselectPossession(slug);
			}
		}

		async _onPossessionUseChange(ev) {
			const btn = new PossessionUseButton(ev);
			const newVal = btn.isChecked() ? btn.index : btn.index + 1;
			if (btn.choiceSlug) {
				await this._stonetopCharacter.setSubChoiceUses(btn.possessionSlug, btn.choiceSlug, newVal);
			} else {
				await this._stonetopCharacter.setPossessionUses(btn.possessionSlug, newVal);
			}
		}

		async _onPossessionSubCheck(ev) {
			const { possessionSlug, choiceSlug } = ev.currentTarget.dataset;
			if (ev.currentTarget.checked) {
				await this._stonetopCharacter.selectSubChoice(possessionSlug, choiceSlug);
			} else {
				await this._stonetopCharacter.deselectSubChoice(possessionSlug, choiceSlug);
			}
		}

		async _onPossessionSubRadio(ev) {
			const { possessionSlug, choiceSlug, siblingSlugsCsv } = ev.currentTarget.dataset;
			const exclusiveSlugs = siblingSlugsCsv ? siblingSlugsCsv.split(",") : [];
			await this._stonetopCharacter.selectSubChoiceExclusive(possessionSlug, choiceSlug, exclusiveSlugs);
		}

		async _onInventoryItemCheck(ev) {
			// Have What You Need: marking an item pulls marks from the undefined pool
			// (its weight, or 1 for a small item); un-marking returns them. The load
			// total is fixed at Outfit, so a mark must be available to define an item.
			const el = ev.currentTarget;
			if (!el.dataset.slug) return; // ignore the slug-less undefined-pool diamonds
			const ok = await this._stonetopCharacter.toggleCarriedItem(el.dataset.slug, el.checked, {
				small:  !!el.closest(".stonetop-inventory-small"),
				weight: Number(el.dataset.weight ?? 1),
			});
			if (!ok) ui.notifications.warn(game.i18n.localize("stonetop.inventory.notEnoughUndefined"));
			this.render(false);
		}

		async _onInventoryResource(ev) {
			const { slug, index } = ev.currentTarget.dataset;
			const isChecked = ev.currentTarget.classList.contains("is-checked");
			const newVal = isChecked ? Number(index) : Number(index) + 1;
			await this._stonetopCharacter.setInventoryResource(slug, newVal);
			this.render(false);
		}

		async _onAddInventoryItem(ev) {
			const column = ev.currentTarget.dataset.column;
			const isRegular = column === "regular";
			const content = isRegular
				? `<div style="display:grid;gap:6px;padding:6px">
					<label>${game.i18n.localize("stonetop.inventory.addItemName")} <input name="name" type="text" style="width:100%"></label>
					<label>${game.i18n.localize("stonetop.inventory.addItemWeight")} <input name="weight" type="number" min="1" value="1" style="width:60px"></label>
				   </div>`
				: `<div style="padding:6px"><label>${game.i18n.localize("stonetop.inventory.addItemName")} <input name="name" type="text" style="width:100%"></label></div>`;
			new Dialog({
				title: isRegular ? game.i18n.localize("stonetop.inventory.addItem") : game.i18n.localize("stonetop.inventory.addSmallItem"),
				content,
				buttons: {
					cancel: { label: game.i18n.localize("Cancel") },
					add: {
						label: game.i18n.localize("stonetop.inventory.addItemConfirm"),
						callback: html => {
							const name = html.find("[name=name]").val().trim();
							if (!name) return;
							if (isRegular) {
								const weight = Math.max(1, parseInt(html.find("[name=weight]").val()) || 1);
								this._stonetopCharacter.addCustomInventoryItem(name, weight)
									.then(() => this.render(false));
							} else {
								this._stonetopCharacter.addCustomSmallItem(name)
									.then(() => this.render(false));
							}
						},
					},
				},
				default: "add",
				render: keepDialogOnTop,
			}).render(true);
		}


		async _onDeleteCustomInventoryItem(ev) {
			await this._stonetopCharacter.removeCustomInventoryItem(ev.currentTarget.dataset.ownedId);
		}

		async _onRemoveSpecialItem(ev) {
			await this._stonetopCharacter.removeSpecialItem(ev.currentTarget.dataset.slug);
		}

		async _onInventoryReset() {
			Dialog.confirm({
				title: game.i18n.localize("stonetop.inventory.resetTitle"),
				content: `<p>${game.i18n.localize("stonetop.inventory.resetConfirm")}</p>`,
				yes: async () => {
					await this._stonetopCharacter.resetInventorySelections();
					this.render(false);
				},
				render: keepDialogOnTop,
			});
		}

		_onRequisition() {
			const steading = this._stonetopCharacter?.getSteadingActor();
			if (!steading) {
				ui.notifications.warn("This character isn't linked to a steading.");
				return;
			}
			new RequisitionDialog(
				this._stonetopCharacter,
				this.actor,
				steading,
				() => this.render(false),
			).render(true);
		}

		async _onOutfitOpen() {
			const snapshot = await this._stonetopCharacter.buildSnapshot();
			new OutfitMoveDialog(
				this._stonetopCharacter,
				snapshot.inventory.outfit,
				() => this.render(false),
			).render(true);
		}

		async _onLevelUpOpen() {
			const levelUpData = await this._stonetopCharacter.getLevelUpData();
			new LevelUpDialog(
				this._stonetopCharacter,
				levelUpData,
				() => this.render(false),
			).render(true);
		}

		async _onDeathsDoorOpen() {
			if ((this.actor.system?.attributes?.hp?.value ?? 1) > 0) return;
			new DeathsDoorDialog(
				this._stonetopCharacter,
				() => this.render(false),
			).render(true);
		}

		async _onRecoverOpen() {
			const snapshot = await this._stonetopCharacter.buildSnapshot();
			const hp = snapshot.vitals.hp;
			if (this.actor.getFlag("stonetop_pwd", "recover.spent")) return;
			if (hp.value >= hp.max) return;

			const resources  = this.actor.getFlag("stonetop_pwd", "inventory.resources") ?? {};
			const supplySlug = RECOVER_SUPPLY_SLUGS.find(slug => (Number(resources[slug]) || 0) > 0);
			if (!supplySlug) return;

			const healAmount = snapshot.inventory?.smallItemLimit ?? 4;
			const newHp      = Math.min(hp.value + healAmount, hp.max);
			const guide      = GUIDED_CHARACTER_MOVES.Recover;

			new Dialog({
				title: "Recover",
				content: `<form class="stonetop-homestead-dialog stonetop-recover-dialog">
					<p class="stonetop-homestead-trigger"><em>${_esc(guide.trigger)}</em></p>
					<div class="stonetop-homestead-reference">
						<ul>
							<li>Expend <strong>1 use of supplies</strong>.</li>
							<li>Regain HP: <strong>${hp.value} &rarr; ${newHp}</strong> (4+Prosperity = ${healAmount}).</li>
						</ul>
					</div>
					<label class="stonetop-homestead-field">
						<span>What you're tending <em>(optional)</em></span>
						<textarea name="ailment" rows="2" placeholder="Wound or debility…"></textarea>
					</label>
					<p class="stonetop-homestead-note">${_esc(guide.note)} You can't gain this benefit again until you take more damage.</p>
				</form>`,
				buttons: {
					cancel:  { label: "Cancel" },
					recover: {
						label: `Recover (+${newHp - hp.value} HP)`,
						callback: html => this._applyRecover(html, { supplySlug, currentUses: Number(resources[supplySlug]) || 0, oldHp: hp.value, newHp }),
					},
				},
				default: "recover",
				render: keepDialogOnTop,
			}, { width: 480 }).render(true);
		}

		async _applyRecover(html, { supplySlug, currentUses, oldHp, newHp }) {
			await this._stonetopCharacter.setInventoryResource(supplySlug, Math.max(0, currentUses - 1));
			await this.actor.update({
				"system.attributes.hp.value": newHp,
				"flags.stonetop_pwd.recover.spent": true,
			});

			const ailment = String(html[0]?.querySelector('[name="ailment"]')?.value ?? "").trim();
			const rows = [
				{ label: "Supplies", value: "Expended 1 use" },
				{ label: "HP", value: `${oldHp} → ${newHp} (+${newHp - oldHp})` },
			];
			if (ailment) rows.push({ label: "Tending", value: ailment });
			postMoveToChat(this.actor, "Recover", rows);

			this.render(false);
		}

		async _onNewCharacter() {
			const existingPlaybook = this.actor.system?.playbook?.slug;
			const openPicker = () => {
				new PlaybookPickerDialog(async (playbookDoc) => {
					new CharacterOnboardingDialog(
						playbookDoc,
						async (selections) => {
							await this._applyPlaybookSelections(playbookDoc, selections);
						},
						{
							onBack: openPicker,
							onSave: async (selections) => {
								await this._applyPlaybookSelections(playbookDoc, selections);
							},
						},
					).render(true);
				}).render(true);
			};
			if (existingPlaybook) {
				new Dialog({
					title:   game.i18n.localize("stonetop.newCharacter.confirmTitle"),
					content: `<p>${game.i18n.localize("stonetop.newCharacter.confirmContent")}</p>`,
					buttons: {
						cancel: {
							icon:     '<i class="fas fa-times"></i>',
							label:    "Cancel",
						},
						edit: {
							icon:     '<i class="fas fa-edit"></i>',
							label:    "Edit",
							callback: () => this._openEditCharacterOnboarding(),
						},
						reset: {
							icon:     '<i class="fas fa-undo"></i>',
							label:    "New",
							callback: openPicker,
						},
					},
					default: "cancel",
					render: keepDialogOnTop,
				}).render(true);
			} else {
				openPicker();
			}
		}

		async _openEditCharacterOnboarding(options = {}) {
			const playbookUuid = this.actor.system?.playbook?.uuid;
			if (!playbookUuid) return;
			const playbookDoc = await fromUuid(playbookUuid);
			if (!playbookDoc) return;

			// Note: _applyPlaybookSelections updates the prototype token image but not
			// any already-placed tokens; those are left for the GM to sync manually.
			new CharacterOnboardingDialog(
				playbookDoc,
				async (selections) => {
					await this._applyPlaybookSelections(playbookDoc, selections);
				},
				{
					initialSelections: this._readSelectionsFromActor(playbookDoc),
					startAtStep: options.startAtStep ?? null,
					onSave: async (selections) => {
						await this._applyPlaybookSelections(playbookDoc, selections);
					},
				},
				// no onBack ? back button is hidden
			).render(true);
		}

		_logOnboardingQuestionDiagnostics(diagnostics = null) {
			if (!diagnostics || !console?.groupCollapsed) return;
			const actorName = this.actor?.name ?? "(unknown actor)";
			const incomplete = diagnostics.incomplete;
			console.groupCollapsed(
				`[Stonetop] Background question diagnostics: ${actorName} (${incomplete.length} incomplete)`,
			);
			console.info("Playbook:", diagnostics.playbook);
			console.info("First incomplete:", diagnostics.firstIncomplete ?? "none");
			if (incomplete.length) {
				console.table(incomplete.map(step => ({
					index: step.index,
					stepType: step.stepType,
					label: step.label,
					details: JSON.stringify(step.details),
				})));
			} else {
				console.info("All resume/question steps are complete.");
			}
			console.debug("All question steps:", diagnostics.steps);
			console.groupEnd();
		}

		_readSelectionsFromActor(playbookDoc = null) {
			const f  = resolvedFlags(this.actor);
			const sys = this.actor.system ?? {};

			// Major arcanum: use the saved flag if present, otherwise infer from owned arcana
			// cross-referenced with the background's allowed list.
			const bgSlug       = f.background?.selected ?? "";
			const backgrounds  = playbookDoc?.flags?.stonetop?.backgrounds ?? [];
			const bg           = backgrounds.find(b => b.slug === bgSlug);
			const allowedMajors = new Set(bg?.majorArcana ?? []);
			let majorArcanum   = f.arcana?.major ?? "";
			if (!majorArcanum && allowedMajors.size) {
				const ownedSlugs = f.arcana?.owned ?? [];
				majorArcanum = ownedSlugs.find(s => allowedMajors.has(s)) ?? "";
			}

			return {
				backgroundSlug:  f.background?.selected ?? "",
				instinctValue:   f.instinct?.selected ?? "",
				appearance:      foundry.utils.deepClone(f.appearance?.selected ?? {}),
				originRegion:    f.origin?.selected ?? "",
				name:            this.actor.name ?? "",
				stats: (s => Object.fromEntries(
					["str","dex","con","int","wis","cha"].map(k => [k, k in s ? s[k] : null])
				))(f.onboardingStats ?? {}),
				possessions:     [...(f.possessions?.selected ?? [])],
				moves:           [], // compendium IDs are hard to recover; player re-picks
				invocations:     [...(f.invocations?.selected ?? [])],
				initiates:       Object.entries(f.background?.choices ?? {})
				                       .filter(([, v]) => v === true)
				                       .map(([k]) => k),
				initiateDetails: foundry.utils.deepClone(f.initiateDetails ?? {}),
				crew: {
					name:     f.crew?.name ?? "",
					tags:     [...(f.crew?.tags ?? [])],
					instinct: f.crew?.instinct ?? "",
					cost:     f.crew?.cost ?? "",
				},
				animalCompanion: {
					type:     f.animalCompanion?.type ?? "",
					kind:     f.animalCompanion?.kind ?? "",
					traits:   [...(f.animalCompanion?.traits ?? [])],
					name:     f.animalCompanion?.name ?? "",
					instinct: f.animalCompanion?.instinct ?? "",
					cost:     f.animalCompanion?.cost ?? "",
				},
				backgroundChoices: foundry.utils.deepClone(f.moves?.backgroundAnswers ?? {}),
				backgroundSetup: {
					choices:        foundry.utils.deepClone(f.background?.setupChoices ?? {}),
					texts:          foundry.utils.deepClone(f.background?.setupTexts ?? {}),
					neighborTraits: foundry.utils.deepClone(f.background?.neighborTraits ?? {}),
					neighborPicks:  foundry.utils.deepClone(f.background?.neighborPicks ?? {}),
				},
				lore: {
					picks: foundry.utils.deepClone(f.lore?.counts ?? {}),
					texts: foundry.utils.deepClone(f.lore?.texts ?? {}),
				},
				arcana: {
					major:      majorArcanum,
					minorDraw:  [...(f.arcana?.minorDraw ?? [])],
					minorRoles: foundry.utils.deepClone(
						f.arcana?.minorRoles ?? { mastered: "", found: "", lead: "" }
					),
				},
			};
		}

		_backgroundSetupNeighbors(backgroundSetup, selections) {
			const out = [];
			for (const neighbor of (backgroundSetup?.neighbors ?? [])) {
				if (!neighbor.name) continue;
				out.push({
					name: neighbor.name,
					origin: neighbor.origin ?? "",
					trait: neighbor.traitKey
						? selections.backgroundSetup?.neighborTraits?.[neighbor.traitKey]?.trim() ?? ""
						: neighbor.trait ?? "",
					checked: true,
				});
			}
			for (const choice of (backgroundSetup?.neighborChoices ?? [])) {
				const selected = new Set(selections.backgroundSetup?.neighborPicks?.[choice.key] ?? []);
				for (const option of (choice.options ?? [])) {
					if (!selected.has(option.value)) continue;
					out.push({
						name: option.name ?? option.value,
						origin: option.origin ?? "",
						trait: option.trait ?? "",
						checked: true,
					});
				}
			}
			return out;
		}

		async _applyBackgroundNeighbors(backgroundSetup, selections) {
			const additions = this._backgroundSetupNeighbors(backgroundSetup, selections);
			if (!additions.length) return;
			const steadingActor = getStonetopSteadingActor();
			if (!steadingActor) {
				ui.notifications?.warn?.("No Stonetop steading actor was found, so background neighbors were not added.");
				return;
			}
			const stonetopSteading = steadingActor.typedActor ?? new StonetopSteading(steadingActor);
			const flags = resolvedFlagProperty(steadingActor, "steading") ?? {};
			const neighbors = foundry.utils.deepClone(flags.neighbors ?? STEADING_DEFAULTS.neighbors);
			const keyFor = neighbor => `${String(neighbor.name ?? "").trim().toLowerCase()}|${String(neighbor.origin ?? "").trim().toLowerCase()}`;

			for (const addition of additions) {
				const key = keyFor(addition);
				if (!addition.name?.trim() || key === "|") continue;
				const idx = neighbors.findIndex(neighbor => keyFor(neighbor) === key);
				if (idx >= 0) {
					neighbors[idx] = {
						...neighbors[idx],
						origin: addition.origin || neighbors[idx].origin || "",
						trait: addition.trait || neighbors[idx].trait || "",
						checked: true,
					};
				} else {
					neighbors.push(addition);
				}
			}
			await stonetopSteading.setFlags({ neighbors });
		}

		async _applyPlaybookSelections(playbookDoc, selections) {
			const slug = playbookDoc.system?.slug ?? "";
			const updates = {
				"system.playbook": { uuid: playbookDoc.uuid, name: playbookDoc.name, slug },
				...this._playbookHpInit(playbookDoc),
			};
			if (slug && isDefaultImg(this.actor.img)) {
				const icon = `systems/stonetop_pwd/assets/icons/playbooks/${slug.replace(/-/g, "_")}_icon.webp`;
				updates.img = icon;
				updates["prototypeToken.texture.src"] = icon;
			}
			const statFlagObj = {};
			for (const [key, value] of Object.entries(selections.stats ?? {})) {
				if (value !== null && value !== undefined) {
					updates[`system.stats.${key}.value`] = Number(value);
					statFlagObj[key] = Number(value);
				}
			}
			updates[`flags.${STONETOP_SCOPE}.onboardingStats`] = statFlagObj;
			await this.actor.update(updates);

			// Background must be saved before ensureStartingMoves reads it.
			if (selections.backgroundSlug) {
				await this._stonetopCharacter.background.selectBackground(selections.backgroundSlug);
			}
			await this._stonetopCharacter.ensureStartingMoves();

			const { flagUpd, selectedBackground, backgroundSetup } =
				await this._applyCommonSelections(playbookDoc, selections);

			// Apply-specific: create owned possession items, add moves, bg extras.
			const rawPossessions = playbookDoc.flags?.stonetop?.specialPossessions;
			if (rawPossessions) {
				const slugsToSelect = [
					...(rawPossessions.preselected ?? []),
					...(selections.possessions ?? []),
				];
				for (const slug of slugsToSelect) {
					await this._stonetopCharacter.selectPossession(slug);
				}
			}
			for (const compendiumId of (selections.moves ?? [])) {
				await this._stonetopCharacter.addMove(compendiumId, { skipIfOwned: true });
			}
			for (const slug of (selectedBackground?.extraPossessions ?? [])) {
				await this._stonetopCharacter.selectPossession(slug);
			}
			for (const choice of (backgroundSetup?.choices ?? [])) {
				const value = selections.backgroundSetup?.choices?.[choice.key];
				if (!value) continue;
				if (choice.apply === "move") {
					await this._stonetopCharacter.addPlaybookMoveByName(playbookDoc.name, value);
				} else if (choice.apply === "possession") {
					await this._stonetopCharacter.selectPossession(value);
				}
			}
			for (const arcanum of (backgroundSetup?.arcana ?? [])) {
				if (!arcanum.slug) continue;
				await this._stonetopCharacter.addArcanum(arcanum.slug);
				if (arcanum.identify) await this._stonetopCharacter.identifyArcanum(arcanum.slug);
				for (const box of (arcanum.boxes ?? [])) {
					await this._stonetopCharacter.setArcanumBoxChecked(
						arcanum.slug, box.context ?? "front", Number(box.index ?? 0), true,
					);
				}
			}
			const existingSetupResources = resolvedFlagProperty(this.actor, "background.setupResources") ?? {};
			const backgroundSetupResources = {};
			for (const resource of (backgroundSetup?.resources ?? [])) {
				if (!resource.key) continue;
				backgroundSetupResources[resource.key] = existingSetupResources[resource.key] ?? resource.value ?? 0;
			}
			if (Object.keys(backgroundSetupResources).length) {
				flagUpd[`flags.${STONETOP_SCOPE}.background.setupResources`] = backgroundSetupResources;
			}

			// Seeker arcana
			const masteredMinor = selections.arcana?.minorRoles?.mastered ?? null;
			const foundMinor    = selections.arcana?.minorRoles?.found    ?? null;
			for (const slug of [selections.arcana?.major, masteredMinor, foundMinor].filter(Boolean)) {
				await this._stonetopCharacter.addArcanum(slug);
				await this._stonetopCharacter.identifyArcanum(slug);
			}
			if (masteredMinor) await this._stonetopCharacter.flipArcanum(masteredMinor);

			if (Object.keys(flagUpd).length) await this.actor.update(flagUpd);
			await this._applyBackgroundNeighbors(backgroundSetup, selections);
			this.render(false);
		}

		// Core of _applyPlaybookSelections (used for both "Save" and final apply).
		// Handles character-method calls (instinct, appearance, origin, name),
		// background-setup flag writes, initiates, and lore.
		// Returns { flagUpd, selectedBackground, backgroundSetup } for callers to extend.
		async _applyCommonSelections(playbookDoc, selections) {
			if (selections.instinctValue) {
				await this._stonetopCharacter.instinct.select(selections.instinctValue);
			}
			for (const [lineIdx, value] of Object.entries(selections.appearance ?? {})) {
				if (value?.trim()) await this._stonetopCharacter.appearance.select(Number(lineIdx), value.trim());
			}
			if (selections.originRegion) {
				await this._stonetopCharacter.origin.select(selections.originRegion);
			}
			if (selections.name?.trim()) {
				await this._stonetopCharacter.updateName(selections.name.trim());
			}

			const selectedBackground = (playbookDoc.flags?.stonetop?.backgrounds ?? [])
				.find(bg => bg.slug === selections.backgroundSlug);
			const backgroundSetup = selectedBackground?.setup ?? null;
			if (selectedBackground) {
				const backgroundSetupTexts    = {};
				const backgroundSetupChoices  = {};
				const backgroundNeighborTraits = {};
				const backgroundNeighborPicks  = {};
				for (const text of (backgroundSetup?.texts ?? [])) {
					const value = selections.backgroundSetup?.texts?.[text.key]?.trim();
					if (value) backgroundSetupTexts[text.key] = value;
				}
				for (const choice of (backgroundSetup?.choices ?? [])) {
					const value = selections.backgroundSetup?.choices?.[choice.key];
					if (value) backgroundSetupChoices[choice.key] = value;
				}
				for (const neighbor of (backgroundSetup?.neighbors ?? [])) {
					const value = selections.backgroundSetup?.neighborTraits?.[neighbor.traitKey]?.trim();
					if (neighbor.traitKey && value) backgroundNeighborTraits[neighbor.traitKey] = value;
				}
				for (const choice of (backgroundSetup?.neighborChoices ?? [])) {
					const values = selections.backgroundSetup?.neighborPicks?.[choice.key] ?? [];
					if (values.length) backgroundNeighborPicks[choice.key] = values;
				}
				await this._batchFlagSetOrUnset({
					"background.setupChoices":   backgroundSetupChoices,
					"background.setupTexts":     backgroundSetupTexts,
					"background.neighborTraits": backgroundNeighborTraits,
					"background.neighborPicks":  backgroundNeighborPicks,
				});
			}

			const backgroundAnswers = {};
			for (const choice of (selectedBackground?.moveChoices ?? [])) {
				const key = choice.move ?? choice.slug ?? choice.label ?? "";
				if (!key) continue;
				const answer = selections.backgroundChoices?.[key];
				if (answer?.value) backgroundAnswers[key] = answer;
			}

			for (const slug of (selections.initiates ?? [])) {
				await this._stonetopCharacter.background.addChoice({ slug, isChecked: true });
			}
			for (const [key, count] of Object.entries(selections.lore?.picks ?? {})) {
				const [sectionSlug, optionSlug] = key.split(":");
				if (count > 0) await this._stonetopCharacter.setLoreOptionCount(sectionSlug, optionSlug, count);
			}
			for (const [key, value] of Object.entries(selections.lore?.texts ?? {})) {
				const [sectionSlug, optionSlug] = key.split(":");
				if (value?.trim()) await this._stonetopCharacter.setLoreOptionText(sectionSlug, optionSlug, value.trim());
			}

			const flagUpd = {};
			const f = key => `flags.${STONETOP_SCOPE}.${key}`;
			if (Object.keys(backgroundAnswers).length)                flagUpd[f("moves.backgroundAnswers")] = backgroundAnswers;
			if (selections.invocations?.length)                       flagUpd[f("invocations.selected")]    = selections.invocations;
			// Initiate onboarding owns only each initiate's pronoun + per-row choices.
			// Write those with dotted paths (Foundry merges, leaving sibling keys intact)
			// so a hand-edit of the same initiate's moves / notes / gear / stat overrides
			// — which share the initiateDetails.<slug> namespace — is never clobbered.
			for (const [slug, det] of Object.entries(selections.initiateDetails ?? {})) {
				if (det?.pronoun != null) flagUpd[f(`initiateDetails.${slug}.pronoun`)] = det.pronoun;
				if (det?.rows)            flagUpd[f(`initiateDetails.${slug}.rows`)]    = det.rows;
			}
			if (selections.crew?.instinct || selections.crew?.cost || selections.crew?.tags?.length || selections.crew?.name) {
				flagUpd[f("crew.name")]     = selections.crew.name?.trim() ?? "";
				// Store only the chosen tags; the background-auto tag is derived from the
				// active background at render (see _buildFollowersData), so baking it in
				// here would strand a stale copy if the background later changes.
				flagUpd[f("crew.tags")]     = [...selections.crew.tags];
				flagUpd[f("crew.instinct")] = selections.crew.instinct ?? "";
				flagUpd[f("crew.cost")]     = selections.crew.cost     ?? "";
			}
			if (selections.animalCompanion?.type) {
				const ac = selections.animalCompanion;
				flagUpd[f("animalCompanion.type")]     = ac.type;
				flagUpd[f("animalCompanion.kind")]     = ac.kind?.trim() ?? "";
				flagUpd[f("animalCompanion.traits")]   = ac.traits;
				flagUpd[f("animalCompanion.instinct")] = ac.instinct ?? "";
				flagUpd[f("animalCompanion.cost")]     = ac.cost     ?? "";
				if (ac.name?.trim()) flagUpd[f("animalCompanion.name")] = ac.name.trim();
			}
			if (selections.arcana?.major)            flagUpd[f("arcana.major")]      = selections.arcana.major;
			if (selections.arcana?.minorDraw?.length) flagUpd[f("arcana.minorDraw")] = selections.arcana.minorDraw;
			if (selections.arcana?.minorRoles)        flagUpd[f("arcana.minorRoles")] = selections.arcana.minorRoles;

			return { flagUpd, selectedBackground, backgroundSetup };
		}

		// Builds a single actor.update() from a {flagKey: valueObj} map.
		// Each entry is set when the object is non-empty, unset otherwise.
		async _batchFlagSetOrUnset(entries) {
			const upd = {};
			for (const [key, obj] of Object.entries(entries)) {
				if (Object.keys(obj).length) {
					upd[`flags.${STONETOP_SCOPE}.${key}`] = obj;
				} else {
					const [updKey, val] = deletionEntry(`flags.${STONETOP_SCOPE}.${key}`);
					upd[updKey] = val;
				}
			}
			if (Object.keys(upd).length) await this.actor.update(upd);
		}
	};
}
