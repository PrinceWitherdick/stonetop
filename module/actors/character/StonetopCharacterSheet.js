import {MoveResourceButton} from "./elements/move-resource-button.js";
import {BackgroundInputChoice} from "./elements/background-input-choice.js";
import {PossessionUseButton} from "./elements/possession-use-button.js";
import {OutfitMoveDialog} from "./dialogs/OutfitMoveDialog.js";
import {RequisitionDialog} from "./dialogs/RequisitionDialog.js";
import {CustomMoveDialog, characterMoveSaver} from "./dialogs/CustomMoveDialog.js";
import {AddInventoryItemDialog, characterInventoryItemSaver} from "./dialogs/AddInventoryItemDialog.js";
import {LoveLetterDialog} from "../../dialogs/LoveLetterDialog.js";
import {LoveLetterReadDialog} from "../../dialogs/LoveLetterReadDialog.js";
import {LevelUpDialog} from "./dialogs/LevelUpDialog.js";
import {PossessionChoicesDialog} from "./dialogs/PossessionChoicesDialog.js";
import {DeathsDoorDialog} from "./dialogs/DeathsDoorDialog.js";
import {PlaybookPickerDialog} from "./dialogs/PlaybookPickerDialog.js";
import {ANIMAL_COMPANION_TRAIT_GLOSSARY, CharacterOnboardingDialog} from "./dialogs/CharacterOnboardingDialog.js";
import {CreateFollowerDialog} from "./dialogs/CreateFollowerDialog.js";
import {MonsterToFollowerDialog} from "./dialogs/MonsterToFollowerDialog.js";
import {OrderFollowersDialog} from "./dialogs/OrderFollowersDialog.js";
import {FollowerFateDialog} from "./dialogs/FollowerFateDialog.js";
import {CallUpDeepOnesDialog} from "./dialogs/CallUpDeepOnesDialog.js";
import {RING_SOURCE_UUID, SERVANT_SOURCE_UUID, buildServantFollower} from "../../data/servant-of-daagon.js";
import {readOnboardingResume, writeOnboardingResume, clearOnboardingResume} from "./onboarding-resume.js";
import {CharacterLedger} from "./CharacterLedger.js";
import {ledgerNounOptionsHtml, wireLedgerFilters} from "../../utils/ledger-filter.js";
import {wireTabSearch} from "../../utils/tab-search.js";
import {resolvedFlags, resolvedFlagProperty, STONETOP_SCOPE, ITEM_FLAG_SCOPE} from "./StonetopFlags.js";
import {createArcanumItem} from "../../item/createArcanum.js";
import {rollDamage, rollStat, sign, classifyResult} from "../../utils/roll-engine.js";
import {defendReadinessHold} from "../../combat/defend-readiness.js";
import {dieFromDamage} from "../../utils/damage.js";
import {normalizeRollType} from "../../utils/roll-types.js";
import {escHtml, isDefaultImg, normalizePlaybookGlyphs, composeInstinct} from "../../utils/strings.js";
import {playbookIconPath} from "../../utils/playbook-actors.js";
import {postMoveToChat, moveChatCard} from "../../utils/chat.js";
import {getStonetopSteadingActor} from "../../utils/world.js";
import {openChroniclePageForActor} from "../../utils/chronicle.js";
import {getDragEventData, deletionEntry} from "../../utils/foundry-compat.js";
import {STEADING_DEFAULTS, StonetopSteading} from "../steading/StonetopSteading.js";
import {getHoverDescriptionSetting, getRollStatChipsSetting, getCharacterSheetWidth, setCharacterSheetWidth, getCrewSectionsOpen, setCrewSectionsOpen, getMovesSectionsCollapsed, setMovesSectionsCollapsed, getArcanaSectionsCollapsed, setArcanaSectionsCollapsed, getArcanaContentExpanded, setArcanaContentExpanded, getArcanaCardsCollapsed, setArcanaCardsCollapsed, getSidebarCollapsed, setSidebarCollapsed, getPromptRollModifierSetting, getOpenSheetsInEditMode, getHideRollableIconSetting} from "../../settings.js";
import {attachFrontOnOpen, bringDialogToFront} from "../../utils/front-on-open.js";
import {promptRollModifier} from "../../dialogs/RollModifierDialog.js";
import {withSectionEditing} from "../../utils/section-editing.js";
import {applyLabelTooltips} from "../../utils/label-tooltips.js";
import {annotateInvocationEffects} from "./invocation-effects.js";
import {wrapStonetopGlyphsInEl} from "../../utils/glyphs.js";
import {StonetopAutocomplete} from "../../utils/autocomplete.js";
import {canAuthorCustomMoves, canCreateArcana} from "../../utils/authoring-gates.js";
import {enrichMoveRefsInEl, fetchMoveRef} from "../../utils/move-refs.js";
import {keepScrollAcrossTab} from "../../utils/tab-scroll.js";
import {BEAST_CATALOG, BEAST_ORDER} from "../../data/beasts.js";
import {parseFollowerArmor, buildCustomFollower, readinessCap, READINESS_SHIELD_BONUS, READINESS_SHIELD_WALL_BONUS, SHIELD_WALL_MOVE, outnumberBonus, nextFollowerOrder} from "../../data/follower-build.js";
import {arcanaSummonFollowers, joinNames} from "../../data/arcana-summons.js";
import {availablePossessionFollowers} from "../../data/possession-followers.js";
import {FOLLOWER_MOVES} from "../../data/follower-moves.js";
import {CREW_INDIVIDUAL_NAMES, CREW_INDIVIDUAL_TAGS, CREW_INDIVIDUAL_TRAITS} from "../../data/steading-members.js";

const _STAT_KEYS = new Set(["str", "dex", "con", "int", "wis", "cha"]);
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

// Suggested "where their armor comes from" values for the follower armor row.
// Free-type: these are autocomplete hints only — a player can pick one, combine
// them, type their own, or leave it blank (no source is a perfectly valid state).
const FOLLOWER_ARMOR_SOURCES = [
	"Leather armor",
	"Padded armor",
	"Thick hides",
	"Scale armor",
	"Chainmail",
	"Brigandine",
	"Shield",
	"Helm",
	"Natural (tough hide)",
];

const _esc = escHtml;

function _formatResultLine(text) {
	return _esc(text).replace(/^(7\+|10\+|7-9|6-):/, "<strong>$1:</strong>");
}

function _guidedCharacterMoveHasAction(guide, rollable = null) {
	return Boolean(rollable || guide?.roll || guide?.fields?.length);
}

const GUIDED_CHARACTER_MOVES = {
	"Censure": {
		trigger: "When you first denounce an individual in your presence as an agent of chaos or anathema to civilization, they pick 1.",
		picksLabel: "They pick 1:",
		picks: ["They are ashamed, and act accordingly", "They are doubtful, and hesitate, pause", "They are afraid, and seek to escape", "They are enraged, and lash out predictably"],
	},
	"Piety": {
		trigger: "When you spend at least an hour in proper worship to Helior, hold 1 Blessing. Other faithful PCs who partake also hold 1 Blessing.",
		picksLabel: "Spend Blessing to:",
		picks: ["Add +1 to a roll you just made in pursuit of a righteous cause"],
	},
	"Anger is a Gift": {
		trigger: "When you burn with righteous anger, hold 2 Resolve.",
		picksLabel: "Spend Resolve 1-for-1 to:",
		picks: ["Set aside fear and doubt to do what must be done", "Act suddenly, catching them off-guard", "Inspire allies or bystanders to follow your lead", "Strike hard (+1d4 damage, forceful)", "Keep your footing, position, and/or your course despite what befalls you"],
	},
	"I Get Knocked Down": {
		trigger: "When you take damage despite your best efforts to avoid it, you can halve the damage but pick 1.",
		picksLabel: "Pick 1:",
		picks: ["You lose something", "Something on your person breaks", "You are out of it for a moment"],
	},
	"Up With People": {
		trigger: "When you converse with someone, you can hold 2 Rapport with them. If you do, they hold 1 Rapport with you.",
		picksLabel: "Spend Rapport to ask:",
		picks: ["What weighs you down or holds you back?", "What drives you forward?", "What lesson would you have me learn?", "What do you think of me, truly?"],
	},
	"A Safe Place": {
		trigger: "When you select and prepare the party's camp site, hold 1 Precaution, or 2 if well-versed with this area and its dangers.",
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
		note: "A mess kit (fire & water) lets 1 use provide for up to four people. If your rest was particularly peaceful, also gain advantage on your next roll. Regaining HP or clearing a debility does NOT heal problematic wounds — those need Recover to stabilize and Convalesce to heal.",
	},
	"Recover": {
		trigger: "When you take time to catch your breath and tend to what ails you, expend 1 use of supplies and regain HP equal to 4 + Prosperity.",
		results: ["You can't gain this benefit again until you take more damage."],
		note: "When you tend to a debility or problematic wound, say how. The GM will say it's taken care of, or tell you what else is required.",
	},
	"Return Triumphant": {
		trigger: "When you return home in triumph — having saved your fellows, put down the threat, seized the opportunity, etc. — clear one of the steading's debilities (diminished, lacking, or malcontent).",
		note: "If the steading has no debilities marked, increase Fortunes by 1 instead.",
	},
	"Struggle as One": {
		trigger: "When you Defy Danger as a group, establish the party's approach and each roll +STAT (per Defy Danger).",
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

// Wound status → sheet presentation. Untreated wounds glow the bestiary red, treated
// ones fade to a bandage, permanent ones lock. Labels feed the row tooltip.
const _WOUND_STATUS_GLYPH = { problematic: "fa-droplet", stabilized: "fa-bandage", permanent: "fa-lock" };
const _WOUND_STATUS_LABEL = {
	problematic: "Problematic — untreated, still hindering",
	stabilized:  "Stabilized — treated, but not yet healed",
	permanent:   "Permanent — this one can't heal",
};
const _WOUND_STATUS_OPTIONS = [
	{ value: "problematic", label: "Problematic (untreated)" },
	{ value: "stabilized",  label: "Stabilized (treated, not healed)" },
	{ value: "permanent",   label: "Permanent (can't heal)" },
];
const _WOUND_ORIGIN_OPTIONS = [
	{ value: "wound",       label: "Wound" },
	{ value: "deaths-door", label: "Death's-Door mark" },
];

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

// The Ring of Daagon and its Servants share one Loyalty pool (Book II). Find the Ring
// follower in a customFollowers map so a Servant batch's pips + Spend button act on the
// Ring's track. Callers pass an in-hand map (getData) or a freshly-read flag.
function findRingFollower(map = {}) {
	const entry = Object.entries(map).find(([, f]) => f?.sourceUuid === RING_SOURCE_UUID);
	return {
		id:      entry?.[0] ?? null,
		name:    entry?.[1]?.name || "the Ring of Daagon",
		loyalty: Math.max(0, Number(entry?.[1]?.loyalty) || 0),
		hasRing: !!entry,
	};
}

// Readiness circles (Defend, p.216 / followers p.469). The Defend move holds up
// to 3 (10+) or 1 (7-9); a borne shield adds +1 to either, so the cap is 4 with
// a shield, 3 without. Never render fewer circles than are held, so an over-held
// pool (e.g. shield dropped mid-fight) stays spendable.
function _makeReadinessPips(val, max = 3) {
	const count = Math.max(max, val);
	return Array.from({ length: count }, (_, i) => ({ index: i, filled: i < val }));
}

// A follower "bears a shield" (+1 Readiness on a 7+ Defend) if any checked gear
// entry names a shield. Gear labels are free text on every follower type, so a
// simple name match covers animal companions, initiates, beasts and customs; the
// crew detects its shield from its structured inventory instead (see below).
function _followerBearsShield(gear) {
	return (gear ?? []).some(g => g?.checked && /shield/i.test(g?.label ?? ""));
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
	"custom":           { ftype: "custom",           portraitIcon: "fas fa-user",     damageType: "custom",   damagePronoun: "they",  hpFollower: "custom",   showGear: true,  nameEditable: true, pronounEditable: true, namePlaceholder: "Follower" },
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
	"animal-companion": { detailBase: "animalCompanion.details", loyalty: "animalCompanion.loyalty", readiness: "animalCompanion.readiness", ammo: "animalCompanion.ammo",
		structural: { name: "animalCompanion.name", pronoun: "animalCompanion.pronoun", instinct: "animalCompanion.instinct", cost: "animalCompanion.cost" } },
	"crew":             { detailBase: "crew.details",            loyalty: "crew.loyalty",            readiness: "crew.readiness",            ammo: "crew.ammo",
		structural: { name: "crew.name", instinct: "crew.instinct", cost: "crew.cost" } },
	"initiate":         { detailBase: "initiateDetails.{slug}",  loyalty: "initiatesLoyalty.{slug}", readiness: "initiatesReadiness.{slug}", ammo: "initiatesAmmo.{slug}", structural: {} },
	"beast":            { detailBase: "beastDetails.{slug}",     loyalty: "beastLoyalty.{slug}",     readiness: "beastReadiness.{slug}",     ammo: "beastAmmo.{slug}",     structural: {} },
	// Custom followers (the walkthrough / monster conversion) store everything —
	// structural stats, the hand-edited overrides, Loyalty and current HP — in one
	// object keyed by the follower's id. detailBase points at that whole object, so
	// the shared override (damage/instinct/cost) and extras (moves/notes/gear)
	// handlers read and write it directly; name/pronoun fall through to it too
	// (structural is empty, so the name-field change handler uses the detail path).
	"custom":           { detailBase: "customFollowers.{slug}",  loyalty: "customFollowers.{slug}.loyalty", readiness: "customFollowers.{slug}.readiness", ammo: "customFollowers.{slug}.ammo", structural: {} },
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

// Flag path where a follower type holds Readiness (held when it Defends, p.469).
// Crew uses its own group-fight Readiness control; the card-body stepper is for
// the non-crew followers, which have no group-fight section.
function _followerReadinessPath(ftype, slug) { return _fillSlug(_FOLLOWER_FLAGS[ftype]?.readiness, slug); }

// Flag path for a follower's ammo track (0 = full, 1 = low ammo, 2 = all out) — the
// ◇ low ammo / ◇ all out marks a ranged follower carries (Moves & Gear).
function _followerAmmoPath(ftype, slug) { return _fillSlug(_FOLLOWER_FLAGS[ftype]?.ammo, slug); }

// Current HP against a max, with the shared "unset → full" default: a missing or
// non-numeric stored value means the follower is at full HP.
function _clampHp(raw, max) {
	const n = Number(raw);
	return raw != null && Number.isFinite(n) ? Math.min(Math.max(0, n), max) : max;
}

// A hand-edited stat override (follower armor / max HP, or a crew's per-member
// stats): a non-negative integer, or null when blank/non-numeric so callers can
// fall back to the rules-derived value.
function _intOverrideOrNull(value) {
	// Treat blank/empty/null as "no override" → null. (Number("") and Number(null)
	// are both 0, so without this guard a cleared field would read as an explicit 0,
	// zeroing crew armor or collapsing per-member HP instead of reverting to derived.)
	if (value == null || String(value).trim() === "") return null;
	const n = Number(value);
	return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
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

			// Honor the "Open Sheets in Edit Mode" client setting on first open; the
			// header wrench still toggles modes per-sheet afterward.
			this._editMode = getOpenSheetsInEditMode();

			// Reopen at the width this user last left this character's sheet.
			const storedWidth = getCharacterSheetWidth(this.actor?.id);
			if (storedWidth) {
				this.options.width  = storedWidth;
				this.position.width = storedWidth;
			}

			// Reopen the collapsible crew sections (Inventory / Roster / Group Fight)
			// in the state this user last left them — persisted per-actor, per-user.
			this._openCrewSections = new Set(getCrewSectionsOpen(this.actor?.id));

			// Likewise the sidebar move groups (Basic / Expedition), which default to
			// expanded, so we track the ones left collapsed.
			this._collapsedMoveSections = new Set(getMovesSectionsCollapsed(this.actor?.id));

			// And the Arcana sections (Major / Minor arcanum), which also default to
			// expanded; we track the ones left collapsed.
			this._collapsedArcanaSections = new Set(getArcanaSectionsCollapsed(this.actor?.id));

			// Reverse-side arcanum content folds (the "Consequences" section on major
			// arcana). Unlike the sections above these default to COLLAPSED, so we track
			// the ones left EXPANDED (absence = collapsed).
			this._expandedArcanaContent = new Set(getArcanaContentExpanded(this.actor?.id));

			// And the individual arcanum cards (clamped to their title bar). Like the
			// sections they default to expanded; we track the slugs left collapsed.
			this._collapsedArcanaCards = new Set(getArcanaCardsCollapsed(this.actor?.id));
		}

		// Persist the current crew-section open state so it survives a sheet reopen.
		_persistCrewSections() {
			setCrewSectionsOpen(this.actor?.id, [...(this._openCrewSections ?? [])]);
		}

		// Persist which sidebar move groups are collapsed so it survives a reopen.
		_persistMoveSections() {
			setMovesSectionsCollapsed(this.actor?.id, [...(this._collapsedMoveSections ?? [])]);
		}

		// Persist which Arcana sections are collapsed so it survives a reopen.
		_persistArcanaSections() {
			setArcanaSectionsCollapsed(this.actor?.id, [...(this._collapsedArcanaSections ?? [])]);
		}

		// Persist which reverse-side arcanum content folds (Consequences) are expanded.
		_persistArcanaContent() {
			setArcanaContentExpanded(this.actor?.id, [...(this._expandedArcanaContent ?? [])]);
		}

		// Persist which individual arcanum cards are collapsed so it survives a reopen.
		_persistArcanaCards() {
			setArcanaCardsCollapsed(this.actor?.id, [...(this._collapsedArcanaCards ?? [])]);
		}

		// Wire a custom collapse/expand toggle for a set of collapsible sections. Used
		// by both the sidebar move groups and the Arcana sections — both use a custom
		// toggle (not <details>) so the content keeps contributing layout, and both
		// track COLLAPSED ids (default expanded). `getSet` returns the live Set to
		// mutate; `persist` writes it back. (Crew sections use <details>.open instead,
		// so they keep their own handler.)
		_wireCollapsible(html, { summarySel, collapsibleSel, getSet, persist, onToggle }) {
			const toggle = el => {
				const wrap = el.closest(collapsibleSel);
				const id   = wrap?.dataset.section;
				if (!id) return;
				const collapsed = wrap.classList.toggle("is-collapsed");
				el.setAttribute("aria-expanded", String(!collapsed));
				const set = getSet();
				if (collapsed) set.add(id);
				else           set.delete(id);
				persist();
				onToggle?.(wrap, collapsed);
			};
			html.find(summarySel).on("click", ev => toggle(ev.currentTarget));
			html.find(summarySel).on("keydown", ev => {
				if (ev.key !== "Enter" && ev.key !== " ") return;
				ev.preventDefault();
				toggle(ev.currentTarget);
			});
		}

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["pbta", "stonetop", "sheet", "actor", "character"],
				width: 960,
				minWidth: 800,
				height: 1050,
				tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "moves" }],
				dragDrop: [{ dragSelector: ".items-list .item" }],
				// The sheet scrolls as one inside .window-content; the moves sidebar has its
				// own scroll. Register both so Foundry saves/restores scrollTop across
				// re-renders — otherwise adding an item / arcanum / follower (which re-renders
				// the sheet) snaps the user back to the top of the sheet.
				scrollY: [".window-content", ".stonetop-sidebar-body"],
			});
		}

		get template() {
			return "systems/stonetop_pwd/templates/actor/character.hbs";
		}

		async _render(force, options) {
			// Foundry replaces the whole window content on every render, so a fresh
			// <img> portrait is built and the browser must re-fetch/decode it before
			// it paints — a visible flicker on each data-only re-render (toggling
			// supplies pips, rapport "hold" circles, etc.). Carry the already-decoded
			// portrait element forward when nothing about it changed (same src, same
			// edit state) so it never reloads. The live node keeps the click listener
			// wired in activateListeners for that state, so reuse is only safe when
			// neither changed.
			const oldImg = this.element?.[0]?.querySelector("img.stonetop-portrait");
			const oldSrc = oldImg?.getAttribute("src");
			const oldEditable = oldImg?.hasAttribute("data-edit");
			// The art hover preview is a document.body singleton, so a re-render while the
			// cursor is over a card's art tears out the anchor without firing mouseleave —
			// clear it up front so no orphaned floating preview is left stuck on screen.
			this._removeArcanumThumbPreview();
			await super._render(force, options);
			const newImg = this.element?.[0]?.querySelector("img.stonetop-portrait");
			if (oldImg && newImg
				&& oldSrc === newImg.getAttribute("src")
				&& oldEditable === newImg.hasAttribute("data-edit")) {
				oldImg.title = newImg.title;
				oldImg.alt = newImg.alt;
				newImg.replaceWith(oldImg);
			}
			this._injectHeaderToggle();
			this.element[0]?.classList.toggle("stonetop-edit-mode", this._editMode);
			// Deferred one-shot: switch to the Arcana tab after a dropped card's re-render (set
			// in _onDropItemCreate). Instance-scoped so a sibling sheet's render can't consume it.
			if (this._activateArcanaTabOnRender) {
				this._activateArcanaTabOnRender = false;
				this._tabs?.[0]?.activate?.("arcana");
			}
		}

		// The whole sheet scrolls as one inside .window-content. Keep the reader's scroll
		// position across tab switches instead of letting the browser clamp it up to the
		// top when the incoming tab is shorter (which reads as a jump/bounce). See
		// keepScrollAcrossTab.
		_onChangeTab(event, tabs, active) {
			keepScrollAcrossTab(this.element, () => super._onChangeTab(event, tabs, active));
		}

		async close(options) {
			this._arcanaMasonryObserver?.disconnect();
			this._persistSheetWidth();
			this._movePanel?.remove();
			this._movePanel = null;
			// The art hover preview lives on document.body, so it survives the sheet's DOM
			// being torn down — clear it or it orphans if the sheet closes (e.g. Escape) while
			// the cursor is still over a card's art and no mouseleave ever fires.
			this._removeArcanumThumbPreview();
			return super.close(options);
		}

		_removeArcanumThumbPreview() {
			document.querySelector(".stonetop-arcanum-thumb-preview")?.remove();
		}

		// Hover preview for an arcanum's header art: a larger copy of the thumbnail in a
		// fixed-position popup appended to <body>, so it escapes the arcana tab's overflow
		// clipping. Placed to the right of the art (it sits at the card's left edge, so
		// there's room), flipping left if it would run off the right of the viewport, and
		// vertically centred on the thumb. Mirrors the steading avatar preview.
		_showArcanumThumbPreview(anchor) {
			this._removeArcanumThumbPreview();
			if (!anchor?.src) return;
			const popup = document.createElement("div");
			popup.className = "stonetop-arcanum-thumb-preview";
			const img = document.createElement("img");
			img.src = anchor.src;
			img.alt = "";
			popup.appendChild(img);
			const name = anchor.dataset.name?.trim();
			if (name) {
				const caption = document.createElement("strong");
				caption.textContent = name;
				popup.appendChild(caption);
			}
			document.body.appendChild(popup);

			const ar = anchor.getBoundingClientRect();
			const gap = 8;
			const pw = popup.offsetWidth;
			const ph = popup.offsetHeight;
			let left = ar.right + gap;
			if (left + pw > window.innerWidth - 8) left = ar.left - pw - gap;
			left = Math.max(8, left);
			let top = ar.top + ar.height / 2 - ph / 2;
			top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
			popup.style.top = `${top}px`;
			popup.style.left = `${left}px`;
			const z = parseInt(this.element?.[0]?.style?.zIndex || 0);
			popup.style.setProperty("z-index", String(Math.max(10000, z + 2)), "important");
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

		// Jump to this character's page in the shared "Player Introductions" Chronicle
		// journal (see utils/chronicle.js for the seeding/notice behaviour).
		_openChroniclePage() {
			return openChroniclePageForActor(this.actor);
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
							<div class="stonetop-ledger-entry-main">${_esc(entry.action)}${entry.move ? ` <span class="stonetop-ledger-entry-move">via ${_esc(entry.move)}</span>` : ""}</div>
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
							render: bringDialogToFront,
							options: { classes: ["dialog", "stonetop-ledger-child"] },
						});
					});
				},
			}, {
				width: 560,
				height: 640,
				classes: ["dialog", "stonetop-ledger-window"],
			});
			attachFrontOnOpen(ledgerDialog);
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
			buttons.splice(steadingIdx + 1, 0,
				{
					label:   "Ledger",
					class:   "stonetop-ledger-button",
					icon:    "fas fa-scroll",
					onclick: () => this._openLedgerDialog(),
				},
				{
					label:   "Chronicle",
					class:   "stonetop-chronicle-button",
					icon:    "fas fa-book",
					onclick: () => this._openChroniclePage(),
				},
			);
			return buttons;
		}

		async getData() {
			const context = await super.getData();
			context.system ??= this.actor.system;
			context.isCharacter = this.actor.type === "character";
			context.stonetop = await this._stonetopCharacter.buildSnapshot();
			context.stonetop.movelist ??= {};
			const overageKey = context.stonetop.movelist.levelMovesOverageKey ?? null;
			const dismissedOverageKey = this.actor.getFlag(STONETOP_SCOPE, "moves.dismissedLevelOverage");
			context.stonetop.movelist.showLevelMovesOverLimit =
				!!context.stonetop.movelist.levelMovesOverLimit && overageKey !== dismissedOverageKey;
			// Per-section edit flags: a section is editable when the global wrench is
			// on OR its own pencil is toggled.
			const sectionEdit = section => this.isSectionEditable(section);
			context.stonetop.statsNoteDisplay = sectionEdit("stats") ? context.stonetop.playbook?.statsNote ?? null : null;
			context.stonetop.movelist.startingMovesNoteDisplay = sectionEdit("moves") ? context.stonetop.movelist.startingMovesNote ?? null : null;
			// Sidebar move groups default to expanded; a group is open unless this
			// user collapsed it (persisted per-actor in _collapsedMoveSections).
			const collapsedMoves = this._collapsedMoveSections ?? new Set();
			context.stonetop.movesOpen = {
				basicMoves:      !collapsedMoves.has("basicMoves"),
				expeditionMoves: !collapsedMoves.has("expeditionMoves"),
			};
			// Arcana sections (Major / Minor arcanum) default to expanded; a section is
			// open unless this user collapsed it (persisted in _collapsedArcanaSections).
			const collapsedArcana = this._collapsedArcanaSections ?? new Set();
			context.stonetop.arcanaOpen = {
				major: !collapsedArcana.has("arcanaMajor"),
				minor: !collapsedArcana.has("arcanaMinor"),
			};
			// Whether the whole moves sidebar is collapsed (defaults to expanded),
			// persisted per-actor, per-user.
			context.stonetop.sidebarCollapsed = getSidebarCollapsed(this.actor?.id);
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
			// The two Arcana sections (Major / Minor) each get their own pencil, like every
			// other section. The per-tier "Create arcanum" buttons live at the foot of their
			// own section (gated on canCreateArcana, in and out of edit mode) — see tab-arcana.hbs.
			context.stonetop.arcanaEdit = {
				major: sectionEdit("arcanaMajor"),
				minor: sectionEdit("arcanaMinor"),
			};
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
			// Moves that grant a possession sub-choice (Big Magic → sacred-pouch trait):
			// move name → possession slug, so those move cards show an "edit" affordance.
			context.stonetop.possessionTriggerMoves = this._stonetopCharacter.possessionTriggerMoves(playbookDoc);
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
			const companionBonuses        = context.stonetop.companionBonuses ?? { hp: 0, armor: 0, traitPicks: 0 };
			context.stonetop.followers    = this._buildFollowersData(playbookDoc, context.stonetop.inventory?.smallItemLimit ?? null, crewStats, companionBonuses);
			context.stonetop.hasFollowers = !!(
				context.stonetop.followers.animalCompanion ||
				context.stonetop.followers.crew ||
				context.stonetop.followers.initiates?.length ||
				context.stonetop.followers.beasts?.length ||
				context.stonetop.followers.custom?.length
			);
			// Owners can always reach the tab (even with no followers yet) so they can
			// run the Create-a-Follower walkthrough or drop a monster to convert it;
			// non-owners only see it once the character actually has followers. The
			// add/convert controls themselves are gated on editability.
			context.stonetop.showFollowersTab = context.stonetop.hasFollowers || this.isEditable;
			context.stonetop.canAddFollower   = this.isEditable;
			// Universal "Follower Special Moves" (same for every character), rendered
			// read-only from the follower-moves items via their build export.
			context.stonetop.followerSpecialMoves = FOLLOWER_MOVES;
			// The Ranger's Animal Companion insert carries its own special move (Loyal
			// to the End, p.143) — not universal, so it shows only when a beast-bonded
			// Ranger actually has a companion.
			context.stonetop.animalCompanionMoves = context.stonetop.followers.animalCompanion
				? (playbookDoc?.animalCompanion?.moves ?? [])
				: [];
			context.stonetop.hasArcana = !!(
				context.stonetop.arcana?.minor?.hasOwned ||
				context.stonetop.arcana?.major?.hasOwned
			);
			// Decorate summoning arcana (those whose reverse "Treats it/them as a
			// follower") with what the "Add as follower" button needs: its label and
			// whether the creature(s) are already on the Followers tab (matched by the
			// stable sourceUuid marker). See module/data/arcana-summons.js.
			const summonedUuids = new Set(
				Object.values(this.actor.getFlag("stonetop_pwd", "customFollowers") ?? {})
					.map(f => f?.sourceUuid).filter(Boolean)
			);
			// Per-card arcana back visibility. Two independent things gate whether the back
			// panel renders beside the front: PERMISSION (may this viewer see the back at
			// all) and the per-card "show both" toggle (a view preference, default off, so
			// cards read front-only until spread). Permission: the GM always may. The card's
			// OWNER may once it's UNLOCKED — filling every unlock spot earns the back, no
			// setting required. The world setting arcanaPlayersSeeBothSides is a separate
			// "peek" switch: when on, players may open the back of a card they HAVEN'T unlocked
			// yet (an open table that lets you read the whole card); when off, an un-earned
			// back stays hidden until the GM reveals that specific card. The toggle is an
			// edit-mode, PER-USER preference — stored on the viewing user (not the actor), so
			// the GM's spread choices are independent of the owning player's and each client
			// renders its own. It persists so a spread stays open while reading in play mode,
			// and can never expose a back the viewer isn't permitted to see. canReveal drives
			// the GM-only reveal toggle, meaningful only in secretive mode for a still-LOCKED
			// card. isSpread marks a card that renders both sides, laid out full-width by the
			// masonry. See settings.js and tab-arcana.hbs.
			const playersSeeBothArcana = game.settings.get("stonetop_pwd", "arcanaPlayersSeeBothSides");
			const viewerIsGM           = game.user.isGM;
			// True when the viewing user owns this actor (GMs own everything, but they're
			// already covered by viewerIsGM). An unlocked back is the owner's earned reward,
			// so it's shown to the owner regardless of the world setting.
			const viewerOwnsActor      = this.actor.isOwner;
			const revealedArcana       = this._stonetopCharacter.revealedArcanaSlugs;
			// Keyed by actor id since one user (esp. the GM) may view several character sheets.
			const showBothArcana       = new Set(
				(game.user.getFlag("stonetop_pwd", "arcanaShowBoth") ?? {})[this.actor.id] ?? []
			);
			// The single-side flip (front ⇄ back) is a second, independent per-user view
			// preference, stored the same way. It only takes effect when the card isn't
			// already laid open as a spread (show-both wins), and never on a card whose back
			// this viewer isn't permitted to see.
			const showBackArcana       = new Set(
				(game.user.getFlag("stonetop_pwd", "arcanaShowBack") ?? {})[this.actor.id] ?? []
			);
			for (const [section, sectionEditable] of [
				[context.stonetop.arcana?.major, context.stonetop.arcanaEdit.major],
				[context.stonetop.arcana?.minor, context.stonetop.arcanaEdit.minor],
			]) {
				const collapsedCards = this._collapsedArcanaCards ?? new Set();
				for (const item of (section?.items ?? [])) {
					// Card footers (Remove / reveal / show-both) show when this card's section
					// is editable — via the global wrench or that section's own pencil.
					item.sectionEditable   = sectionEditable;
					// Whether this user left this card clamped (persisted).
					item.collapsed         = collapsedCards.has(item.slug);
					// Collapsed preview: the front description's lead — its first paragraph
					// (the flavor text before the mechanics). Shown in place of the full body
					// when the card is collapsed, on every view including a back-only flip
					// (where the front panel isn't otherwise rendered). Strip any injected
					// track inputs so the preview stays a clean, read-only snippet.
					const frontLead        = item.front?.description?.match(/<p\b[^>]*>[\s\S]*?<\/p>/i);
					item.frontLead         = frontLead ? frontLead[0].replace(/<input\b[^>]*>/gi, "") : "";
					const revealed         = revealedArcana.has(item.slug);
					// Owner sees a back they've unlocked (earned, no setting needed) or one the GM
					// has revealed to them; both are owner-scoped, so a non-owning viewer (e.g. an
					// Observer-permission player) never sees another character's hidden back. The
					// world setting is the separate peek switch: on → any player may open the back
					// without unlocking it. Otherwise a locked back waits on the GM's reveal.
					const permittedBack    = viewerIsGM || playersSeeBothArcana
						|| (viewerOwnsActor && (revealed || item.unlocked));
					item.showBoth          = showBothArcana.has(item.slug);
					item.showBack          = showBackArcana.has(item.slug);
					const spread           = permittedBack && item.showBoth;
					// Back-only: the viewer flipped this card to its reverse. Suppressed while
					// spread (both already shown). Front hides only in this single-side view.
					const backOnly         = permittedBack && !spread && item.showBack;
					item.frontVisible      = !backOnly;
					item.backVisible       = spread || backOnly;
					item.isSpread          = item.identified && spread;
					// Surface the back's Consequences onto the front (Hec'tumel / Redwood) only
					// when the front is the sole visible side — in a spread or a back-only flip the
					// back panel already carries the section, so we don't want a second copy. The
					// snapshot only sets item.consequences for the front-referencing cards.
					item.showFrontConsequences = !!item.consequences && item.frontVisible && !item.backVisible;
					item.revealedToPlayers = revealed;
					// The GM's reveal toggle only matters in secretive mode (setting off) for a
					// still-LOCKED back: an unlocked back is already seen by its owner, and with
					// the setting on every player can peek anyway.
					item.canReveal         = viewerIsGM && !playersSeeBothArcana && !item.unlocked;
					// The show-both toggle is only meaningful when the viewer may see the back.
					item.canToggleBoth     = permittedBack;
					// The flip button shows whenever the back is permitted and the card isn't
					// already a spread (nothing to flip when both sides are open).
					item.canFlip           = permittedBack && !spread;

					// The plain "Add as follower" button manifests only the directly-summoned
					// followers. `viaCallUp` followers (the Ring of Daagon's Servants) are rolled
					// and shaped through the Call Up the Deep Ones dialog on the Ring's follower
					// card instead, so they're excluded here — the Ring's button adds just the Ring.
					const followers = (item.summonFollowers ?? []).filter(f => !f.viaCallUp);
					if (!followers.length) continue;
					const names   = joinNames(followers.map(f => f.name));
					const plural  = followers.length > 1;
					// A repeatable follower (the Ring's Servants) can always be summoned
					// again, so the button never reads "added" / disables while one exists.
					const hasRepeatable = followers.some(f => f.repeatable);
					const addedAll = !hasRepeatable && followers.every(f => summonedUuids.has(f.sourceUuid));
					item.summon = {
						added: addedAll,
						label: addedAll
							? `${names} ${plural ? "are" : "is"} in your Followers`
							: `Add ${names} as ${plural ? "followers" : "a follower"}`,
					};
				}
			}
			context.stonetop.invocations          = this._buildInvocationsData(playbookDoc);
			context.stonetop.showOtherMovesSection = this._editMode || !!(context.stonetop.movelist?.otherMoves?.length);
			// Authoring custom moves can be restricted to the GM (world setting). When
			// restricted, players still see/roll existing custom moves but get no "+"
			// button or edit pencils. Existing moves always render regardless.
			context.stonetop.canAuthorCustomMoves = canAuthorCustomMoves();
			// Love letters are GM prep (Book I p.568): only the GM gets the edit/delete
			// affordances on a letter's card. Players read and resolve their own letters.
			context.stonetop.canAuthorLoveLetters = game.user.isGM;
			// Creating homebrew arcana can be restricted to the GM independently of
			// custom moves (arcanaCreationGmOnly). When restricted, players don't see
			// the per-tier "Create arcanum" buttons, but still edit cards they own.
			context.stonetop.canCreateArcana = canCreateArcana();
			const { xp } = context.stonetop.vitals;
			context.stonetop.canLevelUp = xp.value >= xp.max;
			context.stonetop.isDying = context.stonetop.vitals.hp.value <= 0;
			context.stonetop.recover = this._buildRecoverData(context.stonetop);
			context.stonetop.convalesce = this._buildConvalesceData(context.stonetop);
			context.stonetop.woundsView = this._buildWoundsView(context.stonetop.wounds, context.editable);
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

		// Convalesce (homefront move): rest a few days in safety and comfort to
		// recover ALL HP and clear ALL debilities. Unlike Recover there's no supply
		// cost and no once-per-damage lock — it's a downtime move, available whenever
		// there's something to restore (HP below max or any debility marked).
		_buildConvalesceData(snapshot) {
			const hp               = snapshot.vitals.hp;
			const atFullHp         = hp.value >= hp.max;
			const activeDebilities = (snapshot.debilities ?? []).filter(d => d.active);
			const hasDebility      = activeDebilities.length > 0;
			// Convalesce also heals wounds that can heal, and is where permanent injuries
			// get a Make-a-Plan note — so it's available when either is outstanding, even
			// at full HP with no debilities. gmOnly wounds are hidden from the owning player,
			// so they don't drive availability for a non-GM (mirrors the dialog's own filter).
			const openWounds       = (snapshot.wounds ?? []).filter(w => !w.healed && (game.user.isGM || !w.gmOnly));
			const healableWounds   = openWounds.filter(w => w.status !== "permanent");
			const permanentWounds  = openWounds.filter(w => w.status === "permanent");
			const canConvalesce    = !atFullHp || hasDebility || openWounds.length > 0;
			return {
				atFullHp,
				hasDebility,
				activeDebilities,
				healableWounds,
				permanentWounds,
				canConvalesce,
				hint: canConvalesce ? null : { icon: "fa-heart", text: game.i18n.localize("stonetop.specialMoves.convalesce.nothingHint") },
			};
		}

		// Shape the wound snapshot for the sheet block: hide gmOnly wounds from a
		// non-GM viewer (a soft screen — the record still lives on the player-owned
		// actor, so this is UI courtesy, not a security boundary), split the active
		// list from healed "scars", and precompute each row's glyph/label. `show` keeps
		// the whole block out of the DOM when there's nothing to show and no way to add.
		_buildWoundsView(wounds = [], editable = false) {
			const isGM = game.user.isGM;
			const decorate = (w) => {
				// The inline chip shows only the wound text; fold its detail
				// (requirement / plan / lasting tag) into one hover tooltip so
				// nothing is lost in the compact presentation. The template reads
				// only the fields returned below — the folded-in detail lives solely
				// in `tooltip`, so it isn't duplicated onto the view model.
				const planProgress = w.planProgress ?? { done: 0, total: 0 };
				const tip = [];
				if (w.text)            tip.push(w.text);
				if (w.requirementNote) tip.push(`Needs: ${w.requirementNote}`);
				if (w.planNote || planProgress.total) {
					let s = w.planNote ? `Plan: ${w.planNote}` : "Plan";
					if (planProgress.total) s += ` (${planProgress.done}/${planProgress.total} done)`;
					tip.push(s);
				}
				if (w.mechanicalTag)   tip.push(w.mechanicalTag);
				return {
					id: w.id,
					text: w.text,
					status: w.status,
					isDeathsDoor: w.origin === "deaths-door",
					gmOnly: w.gmOnly,
					statusLabel: _WOUND_STATUS_LABEL[w.status] ?? _WOUND_STATUS_LABEL.problematic,
					glyph: _WOUND_STATUS_GLYPH[w.status] ?? _WOUND_STATUS_GLYPH.problematic,
					tooltip: tip.join(" • ") || w.text || "",
				};
			};
			const visible = (wounds ?? []).filter(w => isGM || !w.gmOnly);
			const active = visible.filter(w => !w.healed).map(decorate);
			const scars  = visible.filter(w =>  w.healed).map(decorate);
			return {
				canEdit: editable,
				isGM,
				active,
				scars,
				scarCount: scars.length,
				// The wounds block only renders when there's a wound to show; the
				// "add wound" affordance lives by the HP label (gated by canEdit),
				// so an editable-but-woundless sheet shows no block under the vitals.
				show: active.length > 0 || scars.length > 0,
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

		_buildFollowersData(playbookDoc, smallItemLimit = null, crewStats = { memberHp: 6, armor: 0, damageDie: "d6", rollMod: 1 }, companionBonuses = { hp: 0, armor: 0, traitPicks: 0 }) {
			const sf = resolvedFlags(this.actor);
			// Which collapsible crew sections are expanded. Seeded from the persisted
			// per-actor setting in the constructor (so it survives a sheet reopen);
			// the ??= is just a defensive fallback.
			this._openCrewSections ??= new Set();
			// Per-member HP / armor derive from the Marshal's crew bonuses, but a
			// hand-edited override (crew.details.hpMax / .armor — the same flags the
			// shared stat-override layer reads) wins, so the player can adjust the
			// crew as it grows (Updating followers, p.480).
			const _crewOverride = (field) => _intOverrideOrNull(sf.crew?.details?.[field]);
			const crewMaxHp = (_crewOverride("hpMax") ?? crewStats.memberHp ?? 6) || 1;
			// Stash the per-member HP max so the resize/delete handlers can re-clamp
			// the abstracted group-fight pool (crewSize × memberHp) when it shrinks.
			this._crewMemberHpMax = crewMaxHp;
			const crewArmor = _crewOverride("armor") ?? crewStats.armor ?? 0;
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
				// Hand-edited Armor / Max HP overrides (Updating followers, p.480: a
				// follower can grow more resilient or better armored). The crew also
				// re-derives crewMaxHp / crewArmor from the same flags up top so its
				// roster + group-fight pool stay in step; here we just apply to the
				// card so every type's stat block + HP box reflect the override.
				if (has(d.armor)) {
					const a = _intOverrideOrNull(d.armor);
					if (a !== null) card.armor = a;
				}
				if (has(d.hpMax)) {
					const m = _intOverrideOrNull(d.hpMax);
					if (m !== null && m > 0) {
						card.hpMax = m;
						if (typeof card.hpCurrent === "number") card.hpCurrent = Math.min(card.hpCurrent, m);
						// Crew shows its per-member HP in the static octagon slot.
						if (card.hpStaticValue != null) card.hpStaticValue = m;
					}
				}
				// The `armor` field can be a placeholder ("—") or, on legacy/converted
				// data, a book-format string ("2 (0 vs. iron)") — fine for the read-only
				// value span, but it must never reach the <input type="number">. Give the
				// number input its own always-numeric value.
				card.armorInput = parseFollowerArmor(card.armor);
				// Optional free-text "where their armor comes from" note (leather, shield,
				// hides…). Purely descriptive — never feeds the numeric armor value.
				card.armorSource = has(d.armorSource) ? String(d.armorSource).trim() : "";
				return card;
			};

			// -- Animal Companion (Ranger) ------------------------------
			let animalCompanion = null;
			const acSlug = sf.animalCompanion?.type;
			if (acSlug) {
				const typeData = (playbookDoc?.animalCompanion?.types ?? []).find(t => t.slug === acSlug);
				const traits = sf.animalCompanion?.traits ?? [];
				// The type's mandatory trait (Bird/Critter "tiny", etc.) is auto-included
				// and free; it's stat-neutral, so it doesn't affect derived stats, but it
				// must still show as a locked chip and never count toward the pick budget.
				const mandatoryTrait = typeData?.mandatoryTrait ?? null;
				const displayTraits  = (mandatoryTrait && !traits.includes(mandatoryTrait))
					? [mandatoryTrait, ...traits] : traits;
				const stats = _applyAnimalCompanionTraits(typeData, traits);
				const kind = sf.animalCompanion?.kind ?? "";
				const typeLabel = typeData?.label ?? acSlug;
				const loyaltyVal = sf.animalCompanion?.loyalty ?? 0;
				// Trait-derived base stats, then Beast of Legend's marked "+4 HP / +1 armor"
				// (companionBonuses) layered onto the leading number of the base armor string
				// (e.g. "1 (size)" → "2 (size)"), matching _applyAnimalCompanionTraits.
				const hpMax = (Number(stats.hp) || 0) + (companionBonuses.hp ?? 0);
				const acArmor = companionBonuses.armor
					? _addToLeadingNumber(stats.armor, companionBonuses.armor)
					: (stats.armor ?? "—");
				const hpRaw = sf.animalCompanion?.hpCurrent;
				const showTraitHover = getHoverDescriptionSetting("hoverDescriptionsTraits");
				const acName = sf.animalCompanion?.name ?? "";
				const acPronoun = sf.animalCompanion?.pronoun ?? "";
				// Edit mode: the type's trait list as a pick-up-to-pickCount picker
				// (the rulebook's animal-companion build). Traits drive HP / armor /
				// damage via _applyAnimalCompanionTraits, so toggling one re-derives the
				// card's stats. Only built when editing; view mode shows the trait chips.
				let acTraitChoices = null;
				if (cardEditing("animal-companion", "")) {
					const acTypeTraits = typeData?.traits ?? [];
					// Base trait allowance + Magnificent Specimen's "+2 options" per owned copy.
					const pickCount    = (Number(typeData?.pickCount) || 0) + (companionBonuses.traitPicks ?? 0);
					const selectedSet  = new Set(traits);
					// The mandatory trait is locked on and free, so exclude it from the count.
					const extraCount   = [...selectedSet].filter(t => t !== mandatoryTrait).length;
					const atLimit      = pickCount > 0 && extraCount >= pickCount;
					if (acTypeTraits.length) acTraitChoices = {
						limit:   pickCount,
						options: acTypeTraits.map(value => {
							const isMandatory = value === mandatoryTrait;
							const selected    = isMandatory || selectedSet.has(value);
							return { value, selected, mandatory: isMandatory, disabled: isMandatory || (!selected && atLimit) };
						}),
					};
				}
				animalCompanion = {
					...FOLLOWER_FTYPE_DEFAULTS["animal-companion"],
					slug:         "",
					name:         acName,
					pronoun:      acPronoun,
					pronounEditable: true,
					typeLabel:    kind ? `${_titleCase(kind)} (${String(typeLabel).toLowerCase()})` : String(typeLabel),
					tags:         displayTraits.map(label => ({ label, tooltip: showTraitHover ? _animalCompanionTraitTooltip(label) : null })),
					traitChoices: acTraitChoices,
					hpSlug:       "",
					hpMax,
					hpCurrent:    _clampHp(hpRaw, hpMax),
					armor:        acArmor,
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

			// Owned move names, built once here for both the crew's Shield-Wall check
			// (below) and the per-card "exceptional" gate (further down) — each of which
			// otherwise scanned actor.items on its own.
			const ownedMoveNames = new Set(this.actor.items.filter(i => i.type === "move").map(i => i.name));

			// -- Crew (Marshal) -----------------------------------------
			// Hardcoded fallback until LevelDB pack is rebuilt with the marshal.json inventory changes.
			const CREW_INVENTORY_FALLBACK = [
				{ slug: "hatchet",     label: "<strong>Hatchet</strong>, iron (<em>hand, thrown</em>, x <em>piercing</em>)",                       weight: 1 },
				{ slug: "spear",       label: "<strong>Spear</strong>, iron (<em>close</em>, x <em>piercing</em>)",                                weight: 1 },
				{ slug: "bow-arrows",  label: "<strong>Bow &amp; iron arrows</strong> (<em>near</em>, x <em>piercing</em>)", weight: 1 },
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
				// Readiness held when the crew Defends (common pool, p.473). A shield in
				// the crew's kit raises the cap from 3 to 4 (+1 Readiness on a 7+ Defend,
				// p.216); the shield is "equipped" when all its load pips are filled.
				const crewReadiness  = Math.max(0, Number(sf.crew?.readiness) || 0);
				const crewShieldDef  = inventoryDef.find(i => i.slug === "shield");
				const crewShieldWeight = Number(crewShieldDef?.weight) || 1;
				// A non-number gear flag is already the "fully equipped" boolean; a
				// number is filled load pips and counts as equipped once it meets weight.
				const crewHasShield  = !!crewShieldDef && (typeof gearFlags.shield === "number"
					? gearFlags.shield >= crewShieldWeight
					: !!gearFlags.shield);
				// "Shield Wall" (Marshal) upgrades the shield's Readiness bonus from +1 to
				// +2, so a Shield-Wall crew with shields can hold up to 5.
				const crewHasShieldWall = ownedMoveNames.has(SHIELD_WALL_MOVE);
				const crewShieldBonus = crewHasShieldWall ? READINESS_SHIELD_WALL_BONUS : READINESS_SHIELD_BONUS;
				const crewReadinessPips = _makeReadinessPips(crewReadiness, readinessCap(crewHasShield, crewShieldBonus));
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
					// Base allowance (playbook data) + extra tags unlocked by Veteran Crew's
					// "Select 2 new tags" picks (tagBonus, from the marked-move bonuses).
					crewTagLimit       = (Number.isFinite(crewOpts.additionalTagCount) ? crewOpts.additionalTagCount : 2) + (crewStats.tagBonus ?? 0);
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
					readinessPips:     crewReadinessPips,
					readinessValue:    crewReadiness,
					readinessHasShield: crewHasShield,
					readinessShieldWall: crewHasShieldWall,
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
						// Edit mode: the rulebook's "pick 1 on each line". One radio row
						// per non-pronoun choiceRow (the pronoun line is edited up in the
						// name section). Selections persist to initiateDetails.<slug>.rows,
						// the same store onboarding writes — see the trait-option handler.
						let initTraitRows = null;
						if (cardEditing("initiate", opt.slug)) {
							initTraitRows = (opt.choiceRows ?? [])
								.map((row, rowIdx) => row.type === "pronoun" ? null : {
									slug:    opt.slug,
									rowIdx,
									label:   row.label ?? null,
									options: (row.options ?? []).map(value => ({ value, selected: (det.rows?.[rowIdx] ?? "") === value })),
								})
								.filter(Boolean);
							if (!initTraitRows.length) initTraitRows = null;
						}
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
							subtitleTags:  subtitleTags.map(label => ({ label })),
							traitRows:     initTraitRows,
							hpSlug:        opt.slug,
							hpMax:         initHpMax,
							hpCurrent:     _clampHp(initHpRaw, initHpMax),
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

			// -- Custom followers (any playbook; built via the Create-a-Follower
			// walkthrough or by converting a dropped monster) -----------------
			// Each is a self-contained card stored under customFollowers.<id>. Its
			// structural stats (tags, max HP, armor) live alongside the hand-edited
			// fields (name, damage, instinct, cost, moves, gear, notes), Loyalty and
			// current HP in that one object — the same object the shared detail /
			// override / loyalty / HP handlers resolve through _FOLLOWER_FLAGS["custom"].
			// Ordered by their stored `order` (creation time) so the list is stable.
			const customMap = sf.customFollowers ?? {};
			// The Ring of Daagon and its Servants share one Loyalty pool (Book II: "sharing a
			// pool of Loyalty with the Ring itself"), so a Servant batch's Loyalty pips + Spend
			// button act on the Ring's track, not its own.
			const { id: ringId, loyalty: ringLoyaltyVal } = findRingFollower(customMap);
			const customFollowers = Object.entries(customMap)
				.sort((a, b) => (Number(a[1]?.order) || 0) - (Number(b[1]?.order) || 0))
				.map(([id, c]) => {
					const hpMax  = Number(c?.hpMax) || 0;
					const damage = String(c?.damage ?? "");
					const card = {
						...FOLLOWER_FTYPE_DEFAULTS["custom"],
						slug:         id,
						hpSlug:       id,
						portraitIcon: c?.portraitIcon || "fas fa-user",
						name:         c?.name ?? "",
						pronoun:      c?.pronoun ?? "",
						typeLabel:    c?.typeLabel || (c?.isGroup ? "group follower" : "follower"),
						isFollower:   true,
						removable:    true,
						party:        !!c?.party,
						// A follower marked "Dead" from the 0-HP fate dialog keeps its card as a
						// record (greyed out, with a Remove button), until the player clears it or
						// revives them. See _resolveFollowerFate / the HP-change revival clear.
						dead:         !!c?.dead,
						hpMax,
						hpCurrent:    _clampHp(c?.hpCurrent, hpMax),
						armor:        parseFollowerArmor(c?.armor),
						damage,
						..._parseFollowerDamage(damage),
						damageKind:   "",
						damageName:   c?.name || "follower",
						tags:         (Array.isArray(c?.tags) ? c.tags : []).map(label => ({ label })),
						instinct:     c?.instinct ?? "",
						cost:         c?.cost ?? "",
						butcher:      c?.butcher ?? null,
						loyalty:      _makeLoyaltyPips(c?.loyalty ?? 0),
						loyaltySlug:  id,
						..._followerExtras(c),
					};
					// Ring of Daagon identity — drives the card's Call Up / Send Them Back actions
					// (templates/actor/partials/tab-followers.hbs) and the shared-Loyalty link.
					card.sourceUuid = c?.sourceUuid ?? null;
					card.isRing     = card.sourceUuid === RING_SOURCE_UUID;
					card.isServant  = card.sourceUuid === SERVANT_SOURCE_UUID;
					card.brokenFree = !!c?.brokenFree;   // a Servant batch that broke free (Send Them Back 6-)
					// A Servant batch holds no Loyalty of its own — it draws on the Ring's pool
					// (Book II: "sharing a pool of Loyalty with the Ring itself"). Point its pips +
					// Spend button at the Ring's track so spending a Servant's Loyalty decrements the
					// Ring, and Call Up pays from the same pool. Readiness/ammo stay on the batch's own
					// id (they key off card.slug), so only Loyalty is shared.
					if (card.isServant && ringId) {
						card.sharedLoyalty = true;
						card.loyalty       = _makeLoyaltyPips(ringLoyaltyVal);
						card.loyaltySlug   = ringId;
					}
					// Group follower (NPCs & Followers p.470): the same shared stats as a
					// single follower, plus a roster where every member tracks their own
					// current HP against the shared max, an abstracted "one combatant"
					// group-HP pool (size × per-member HP), and the outnumber calculator.
					// The crew is the built-in example; this brings the same tools to a
					// hired warband, an arcana-summoned group, or a converted group monster.
					if (c?.isGroup) {
						const memberHpMax = hpMax || 1;
						const size = Math.max(2, Math.trunc(Number(c?.size) || 0) || 2);
						const memberHpRaw = Array.isArray(c?.memberHp) ? c.memberHp : [];
						const anonMembers = Array.from({ length: size }, (_, i) => ({
							index:     i,
							label:     `Member ${i + 1}`,
							hpMax:     memberHpMax,
							hpCurrent: _clampHp(memberHpRaw[i], memberHpMax),
						}));
						const groupHpMax     = size * memberHpMax;
						const groupHpCurrent = _clampHp(Number(c?.groupHp), groupHpMax);
						card.isGroup        = true;
						card.groupSize      = size;
						card.groupMembers   = anonMembers;
						card.groupHpCurrent = groupHpCurrent;
						card.groupHpMax     = groupHpMax;
						card.groupMemberHp  = memberHpMax;
						card.memberCount    = anonMembers.filter(m => m.hpCurrent > 0).length;
						card.groupSectionsOpen = {
							roster:     this._openCrewSections.has(`roster:custom:${id}`),
							groupFight: this._openCrewSections.has(`groupFight:custom:${id}`),
						};
					}
					return card;
				});

			// "exceptional" is a gated tag (see FOLLOWER_EXCEPTIONAL): the chip only
			// shows for follower types whose playbook grants it, and can be switched
			// on only once that move is owned. Surfaced per-card so the tags-row chip
			// and its click handler can warn when the requirement isn't met.
			// (ownedMoveNames is built once above, shared with the crew Shield-Wall check.)
			const withExceptional = (card) => {
				if (!card) return card;
				const def = FOLLOWER_EXCEPTIONAL[card.ftype];
				if (def) {
					card.exceptionalAvailable = true;
					card.exceptionalMoveName = def.move;
					card.exceptionalMet      = ownedMoveNames.has(def.move);
					card.exceptionalHint     = `Your ${def.noun} can become exceptional only after you take the move “${def.move}.”`;
					return card;
				}
				// Book I (p.462) lets the GM declare any truly outstanding follower
				// exceptional. The crew and animal companion earn it through a move
				// (above); every other true follower can simply be toggled — no gate.
				// Livestock (a beast that isn't a follower) can't be ordered, so it never
				// shows the chip.
				const ungated = card.ftype === "custom" || card.ftype === "initiate"
					|| (card.ftype === "beast" && card.isFollower);
				card.exceptionalAvailable = ungated;
				card.exceptionalMet        = ungated;   // no move requirement → always met
				return card;
			};
			// Stash the data the Order button (and its dialog) needs as plain values:
			// a clean tag list (pipe-joined — no follower tag contains a pipe), the
			// exceptional flag, and a display name. Initiates carry their epithet in
			// `label`, not `name`, so fall through to it. Also derives the Loyalty
			// total for the Spend button.
			const withOrderData = (card) => {
				if (!card) return card;
				const tags = (card.tags ?? [])
					.map(t => (typeof t === "string" ? t : t?.label))
					.filter(Boolean);
				card.orderTagsCsv = tags.join("|");
				card.orderName    = card.name || card.label || card.namePlaceholder || card.typeLabel || "Follower";
				if (Array.isArray(card.loyalty) && card.loyalty.length) {
					card.loyaltyValue = card.loyalty.filter(p => p.filled).length;
					// A Loyalty track marks a true follower (every orderable type has one;
					// livestock doesn't), so it gates the Order button the same way it
					// gates the readiness stepper below — no Order action on a butcher beast.
					card.canOrder = true;
					// "Have what they need" (p.472) adds an item to a follower's gear on the
					// fly. Non-crew followers carry a free-text gear checklist to append to;
					// the crew Outfits/restocks from its Supplies section instead.
					card.canHaveNeed = card.ftype !== "crew";
					// Readiness circles for non-crew followers (the crew has its own in
					// the Group Fight section). Only true followers — which is exactly
					// the set that has a Loyalty track — so livestock is excluded. A
					// borne shield raises the cap from 3 to 4 (+1 Readiness on a 7+
					// Defend, p.216).
					if (card.ftype && card.ftype !== "crew") {
						// Readiness lives on the follower's OWN id (card.slug), never the (possibly
						// shared) loyaltySlug — a Servant of Daagon shares the Ring's Loyalty but
						// holds its own Readiness. For every other type card.slug === loyaltySlug, so
						// this is behaviour-preserving; the singular types ignore {slug} entirely.
						const rSlug = card.slug ?? "";
						card.showReadiness     = true;
						card.readinessFollower = card.ftype;
						card.readinessSlug     = rSlug;
						card.readinessValue    = Math.max(0, Number(this.actor.getFlag("stonetop_pwd", _followerReadinessPath(card.ftype, rSlug))) || 0);
						card.readinessHasShield = _followerBearsShield(card.gear);
						card.readinessPips      = _makeReadinessPips(card.readinessValue, readinessCap(card.readinessHasShield));
					}
					// Ammo track (◇ low ammo, ◇ all out) — opt-in per follower via the
					// "uses ammo" toggle in the Damage section (a ranged weapon: bow,
					// sling, thrown — Moves & Gear). canUseAmmo shows that toggle (every
					// true follower, the crew included, may carry one — the crew bow tracks
					// ammo too, p.144); usesAmmo gates the ◇ low ammo / ◇ all out circles.
					// Two cumulative checks: 0 full → 1 low → 2 out.
					const aSlug = card.slug ?? "";   // ammo keys off the follower's own id, not the shared loyaltySlug
					card.canUseAmmo = true;
					card.usesAmmo   = !!detailFlagsFor(card.ftype, card.slug).usesAmmo;
					if (card.usesAmmo) {
						const ammoVal = Math.max(0, Math.min(2, Number(this.actor.getFlag("stonetop_pwd", _followerAmmoPath(card.ftype, aSlug))) || 0));
						card.ammoFollower = card.ftype;
						card.ammoSlug     = aSlug;
						card.ammoValue    = ammoVal;
						card.ammoChecks   = [
							{ index: 0, label: "low ammo", checked: ammoVal >= 1 },
							{ index: 1, label: "all out",  checked: ammoVal >= 2 },
						];
					}
				}
				// A named crew member can be directed on their own — their unique tag +
				// traits apply on top of the group's shared tags (NPCs & Followers p.471).
				// Build each member's Order data from the crew's tags plus their own.
				if (card.ftype === "crew" && Array.isArray(card.individuals)) {
					card.individuals = card.individuals.map(ind => {
						const own = [ind.tag, ...(Array.isArray(ind.traits) ? ind.traits : [])].filter(Boolean);
						return {
							...ind,
							orderName:    ind.name || `Crew member ${ind.index + 1}`,
							orderTagsCsv: [...tags, ...own].join("|"),
							exceptional:  !!card.exceptional,
						};
					});
				}
				return card;
			};
			const finalize = (card) => withOrderData(withExceptional(withSectionEdits(withStatOverrides(card))));
			// Playbook possession-followers (the Would-be Hero's dog, the Ranger's Hounds,
			// the Blessed's Mastiffs) ship as gear text; offer to materialize any the PC
			// holds but hasn't added yet as a follower card (deduped by sourceUuid, like
			// arcana summons). Selected = preselected free gear + the player's picks.
			const ownedPossessions = [
				...(playbookDoc?.specialPossessions?.preselected ?? []),
				...(sf.possessions?.selected ?? []),
			];
			const presentSources = new Set(Object.values(customMap).map(f => f?.sourceUuid).filter(Boolean));
			const possessionFollowerOffers = availablePossessionFollowers(ownedPossessions, presentSources)
				.map(f => ({ slug: f.slug, name: f.name, isGroup: !!f.isGroup }));
			return {
				animalCompanion: finalize(animalCompanion),
				crew:            finalize(crew),
				initiates:       initiates?.map(finalize) ?? null,
				beasts:          beasts.map(finalize),
				custom:          customFollowers.map(finalize),
				possessionFollowerOffers,
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
					description: showEffectTips ? annotateInvocationEffects(description) : description,
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
			html.find(".stonetop-moves-level-notice-dismiss").on("click", async ev => {
				const key = ev.currentTarget.dataset.overageKey;
				if (key) await this.actor.setFlag(STONETOP_SCOPE, "moves.dismissedLevelOverage", key);
				this.render(false);
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
					} else if (doc?.type === "monster") {
						// Dropping a monster offers to convert it to a follower (NPCs &
						// Followers, p.475): keep its stats, add tags, choose a cost.
						this._onMonsterDropConvert(doc);
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

			// Live text filters (shared wireTabSearch): a round magnifying-glass button beside a
			// header that expands into a filter box (tab-search-control.hbs). Each call is scoped
			// to the container that holds both the box and the items it hides, so scoping to a
			// whole tab filters the tab and scoping to one column filters just that column.
			wireTabSearch(html[0].querySelector(".tab.moves"), {
				itemSel: ".stonetop-item",
				textFor: li => li.textContent,
			});
			// Arcana tab: the Major and Minor sections each get their own filter, scoped to that
			// section, so each search only hides its own cards. An active term flags the section
			// `.is-searching`, which force-opens it if collapsed (see stonetop.css) so a match is
			// never hidden. Match on title(s) + front/back body only, skipping the footer button
			// labels (Remove / Reveal / Flip) so a term like "remove" doesn't match every card.
			const arcanaCardText = card => [...card.querySelectorAll(".stonetop-arcanum-title, .stonetop-arcanum-body")]
				.map(el => el.textContent).join(" ");
			for (const section of ["arcanaMajor", "arcanaMinor"]) {
				wireTabSearch(html[0].querySelector(`.stonetop-arcana-section[data-section="${section}"]`), {
					itemSel: ".stonetop-arcanum-card",
					textFor: arcanaCardText,
				});
			}
			// Inventory tab: each gear column gets its OWN filter, scoped to that column, so the
			// Items search never touches Small Items and vice-versa. Match on the row's name AND
			// its note/tags (the tags live in a sibling `.stonetop-inv-note`, so matching the label
			// span alone would miss a search for a visible gear tag like "near" or "piercing").
			const invLabelText = el => [".stonetop-inv-label", ".stonetop-inv-note"]
				.map(sel => el.querySelector(sel)?.textContent ?? "")
				.join(" ").trim() || el.textContent;
			for (const col of [".stonetop-inventory-regular", ".stonetop-inventory-small"]) {
				wireTabSearch(html[0].querySelector(col), {
					itemSel: ".stonetop-inv-item",
					textFor: invLabelText,
				});
			}
			// Followers tab: one filter over the follower cards, matched by name / type / tags.
			// The shared reference cards ("… Moves") are excluded so they always stay visible.
			wireTabSearch(html[0].querySelector(".tab.followers"), {
				itemSel: ".stonetop-follower-card:not(.stonetop-follower-card--rules)",
				textFor: card => {
					const text = [...card.querySelectorAll(
						".stonetop-follower-name, .stonetop-follower-name-line, .stonetop-follower-type, .stonetop-follower-tag"
					)].map(el => el.textContent).join(" ");
					const inputs = [...card.querySelectorAll(".stonetop-follower-name-field")].map(el => el.value).join(" ");
					return `${text} ${inputs}`;
				},
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
				const nameEl = ev.target.closest(".stonetop-item-name");
				if (!nameEl) return;
				// Move names stay "play-like" (open guided move / roll / post to chat) even in
				// edit mode — only moves live inside a `.stonetop-move-group`. Other item names
				// (equipment, details) keep the edit-mode guard so a stray click there doesn't
				// fire a chat post while you're editing the sheet.
				if (this._editMode && !nameEl.closest(".stonetop-move-group")) return;
				// A love letter is single-use: it resolves (and self-consumes) only via its own
				// Read & Resolve / Roll button, never a name-click that would post it to chat
				// without removing it. Its edit/delete pencils have their own handlers.
				if (nameEl.closest(".stonetop-love-letter")) return;
				// An un-learned custom move is inactive (no dice icon, bonuses off); a name-click
				// must not post its card to chat either — treat it as non-interactive.
				if (nameEl.closest("li")?.classList.contains("move-unlearned")) return;
				ev.preventDefault();
				const li = nameEl.closest("li");
				const name = nameEl.textContent.trim();
				const guide = GUIDED_CHARACTER_MOVES[name];
				const rollable = li?.querySelector(".rollable");
				if (guide && _guidedCharacterMoveHasAction(guide, rollable)) {
					this._openGuidedCharacterMove({ name, guide }, rollable);
					return;
				}
				// With "Hide Rollable Icon" on, the dice icon is gone, so the move name
				// becomes the roll trigger — forward to the (hidden) rollable the way the
				// steading sheet does. Only rollable moves have a `.rollable`; description-
				// only moves (no rollType, hence no icon) fall through and post to chat.
				// Re-dispatch a click carrying the Shift state (a plain `.click()` would drop
				// it) so "Shift to skip the modifier prompt" still works when rolling here.
				if (rollable && getHideRollableIconSetting()) {
					rollable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: ev.shiftKey }));
					return;
				}
				const description = li.querySelector(".stonetop-item-description")?.innerHTML ?? "";
				const playbookName = html[0].querySelector(".stonetop-playbook-drop-zone:not(.empty)")?.textContent?.trim() ?? "";
				const speaker = ChatMessage.getSpeaker({ actor: this.actor });
				speaker.alias = playbookName ? `${this.actor.name} ${playbookName}` : this.actor.name;
				ChatMessage.create({
					content: moveChatCard(name, description),
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
					this._promptStatChoice(askItem, rollable, undefined, { shiftKey: ev.shiftKey });
					return;
				}
				const altChoice = this._altStatChoiceForRollable(rollable);
				if (altChoice) {
					this._promptStatChoice(altChoice.item, rollable, altChoice.stats, { shiftKey: ev.shiftKey });
					return;
				}
				// Optional pre-roll modifier prompt for 2d6 move/stat rolls (not damage).
				// Returns null when the player cancels the prompt — abort the roll then.
				let situational = 0;
				if (rollable.classList.contains("move-rollable") || _STAT_KEYS.has(rollable.dataset.roll)) {
					situational = await this._maybePromptRollModifier({ shiftKey: ev.shiftKey, rollable });
					if (situational === null) return;
				}
				const handled = await this._stonetopCharacter.onRoll({ currentTarget: rollable }, { situational });
				if (!handled) {
					const roll = rollable.dataset.roll;
					if (!roll) return;
					if (_STAT_KEYS.has(roll)) {
						// Stat roll (STR, DEX, etc.)
						await this._stonetopCharacter.onDirectStatRoll(roll, { situational });
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
							} else if (followerType === "custom") {
								const formPart = damageForm ? ` with ${possessive} ${damageForm}` : "";
								label = `${this.actor.name}'s ${followerName || "follower"} attacks${formPart}`;
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
				// A tap on Defend's Readiness circles adjusts held Readiness — it must never
				// fall through to rolling the move (its own handler adjusts the pool).
				if (ev.target.closest(".stonetop-move-readiness")) return;
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
					const rollable = li.querySelector(".rollable");
					if (guide && _guidedCharacterMoveHasAction(guide, rollable)) {
						this._openGuidedCharacterMove({ name: moveName, guide }, rollable);
						return;
					}
				}

				const rollable = li.querySelector(".rollable");
				if (rollable) { rollable.click(); return; }
				const { compendiumId } = nameEl.dataset;
				if (!compendiumId) return;
				const doc = await this._stonetopCharacter._moveRepo.getBasicMoveDocument(compendiumId);
				if (!doc) return;
				this._postMoveCard(doc.name, doc.system?.description ?? "");
			});

			// Defend's Readiness circles (p.216). Clicking a circle sets held Readiness to
			// its position; clicking the highest filled one clears back to it (matching the
			// follower Loyalty/Readiness pips). stopPropagation so the tap doesn't bubble to
			// the row handler above and fire a Defend roll.
			html.find("button.stonetop-move-readiness-pip").on("click", async ev => {
				ev.preventDefault();
				ev.stopPropagation();
				if (!this.isEditable) return;
				const idx     = Number(ev.currentTarget.dataset.index);
				const current = this._stonetopCharacter.defendReadiness;
				await this._stonetopCharacter.setDefendReadiness(current === idx + 1 ? idx : idx + 1);
				this.render(false);
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
					const descClone = descEl.cloneNode(true);
					// Drop collapsible <details> (e.g. Chart a Course's "Travel Times"
					// table) — they can't be opened in this floating panel, which
					// disappears on mouseleave. They stay clickable on the item sheet.
					descClone.querySelectorAll("details").forEach(d => d.remove());
					panel.replaceChildren(nameEl, ...Array.from(descClone.childNodes));
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

			// Render inline glyphs (◇ Conduit tracks, ○ marks, □ boxes, ▶ arrows) as SVG
			// across every read-only description container. Move-ref enrichment is limited
			// to move descriptions; the other containers only need glyph wrapping. The lore
			// option/description containers are display-only — their editable answers live
			// in a sibling <textarea>, which this selector never matches (wrapping a
			// textarea's value would corrupt the saved text).
			html.find(".stonetop-item-description, .stonetop-arcanum-body, .stonetop-invocation-desc, .stonetop-lore-description, .stonetop-lore-option-desc").each((_, el) => {
				if (el.dataset.glyphsWrapped) return;
				el.dataset.glyphsWrapped = "1";
				if (el.matches(".stonetop-item-description")) enrichMoveRefsInEl(el);
				wrapStonetopGlyphsInEl(el);
			});

			// Fold the long, secondary "Consequences" section behind a collapsible heading
			// (like the basic-moves sidebar groups), defaulting to collapsed. It lives inside
			// the card's authored back HTML, so we wrap it at render time: the
			// <h3>Consequences</h3> becomes a clickable summary and everything after it (until
			// the next heading) folds into the body. Expanded state is per-user/per-actor and
			// persisted, so marking a consequence — which re-renders the sheet — doesn't refold
			// it. This runs on the BACK body, and also on the FRONT body of the cards that
			// surface their Consequences there (Hec'tumel / Redwood — see showFrontConsequences);
			// the front-only view and the spread's back panel are mutually exclusive, so the same
			// `${slug}:consequences` fold id is never in the DOM twice at once. Runs before the
			// masonry below so cards are measured at their folded height.
			html[0].querySelectorAll(".stonetop-arcanum-side--back .stonetop-arcanum-body, .stonetop-arcanum-side--front .stonetop-arcanum-body").forEach(body => {
				const slug = body.closest(".stonetop-arcanum-card")?.dataset.slug;
				if (!slug) return;
				const isFront = !!body.closest(".stonetop-arcanum-side--front");
				// Fold stops at the next heading or at template-appended siblings (the back
				// move trigger / "Add as follower" button that follow the authored HTML),
				// so folding the last section never swallows them.
				const isFoldBoundary = n => n.nodeType === 1 && (
					n.tagName === "H3" ||
					n.classList.contains("stonetop-arcanum-move-trigger") ||
					n.classList.contains("stonetop-arcanum-summon")
				);
				let foldedConsequences = false;
				for (const heading of [...body.children].filter(n => n.tagName === "H3")) {
					if (heading.textContent.trim().toLowerCase() !== "consequences") continue;

					// Everything from just after the heading up to the next boundary is the fold body.
					const bodyNodes = [];
					for (let n = heading.nextSibling; n && !isFoldBoundary(n); ) {
						const next = n.nextSibling;
						bodyNodes.push(n);
						n = next;
					}

					const id = `${slug}:consequences`;
					const expanded = this._expandedArcanaContent?.has(id);
					const fold = document.createElement("div");
					fold.className = `stonetop-arcanum-foldable${expanded ? "" : " is-collapsed"}`;
					fold.dataset.section = id;
					const summary = document.createElement("div");
					summary.className = "stonetop-arcanum-foldable-summary";
					summary.setAttribute("role", "button");
					summary.setAttribute("tabindex", "0");
					summary.setAttribute("aria-expanded", String(!!expanded));
					const foldBody = document.createElement("div");
					foldBody.className = "stonetop-arcanum-foldable-body";

					heading.replaceWith(fold);
					summary.appendChild(heading);      // move the heading into the summary
					bodyNodes.forEach(n => foldBody.appendChild(n));
					fold.append(summary, foldBody);
					foldedConsequences = true;
				}

				// With the section now surfaced below the front text, the front's own pointer
				// "mark a consequence (see reverse)" should read "(see below)". Only rewrite when
				// the fold is actually present (front-only view); in a spread the front keeps
				// "(see reverse)" pointing at the visible back panel. Scoped to the description
				// prose so the unlock's "(see reverse)" pointers (to spells / named moves) are
				// left alone.
				if (isFront && foldedConsequences) {
					const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
					for (let node = walker.nextNode(); node; node = walker.nextNode()) {
						if (!node.nodeValue.includes("(see reverse)")) continue;
						if (node.parentElement?.closest(".stonetop-arcanum-unlock-lead, .stonetop-arcanum-unlock-list, .stonetop-arcanum-foldable")) continue;
						node.nodeValue = node.nodeValue.replace(/\(see reverse\)/g, "(see below)");
					}
				}
			});

			// Toggle a "Consequences" fold (see above). Tracks EXPANDED ids since these
			// default collapsed; persisted per-user/per-actor.
			const toggleArcanaFold = summary => {
				const fold = summary.closest(".stonetop-arcanum-foldable");
				const id   = fold?.dataset.section;
				if (!id) return;
				const collapsed = fold.classList.toggle("is-collapsed");
				summary.setAttribute("aria-expanded", String(!collapsed));
				const set = (this._expandedArcanaContent ??= new Set());
				if (collapsed) set.delete(id); else set.add(id);
				this._persistArcanaContent();
			};
			html[0].addEventListener("click", ev => {
				const summary = ev.target.closest(".stonetop-arcanum-foldable-summary");
				if (!summary) return;
				ev.stopPropagation();
				toggleArcanaFold(summary);
			}, true);
			html[0].addEventListener("keydown", ev => {
				if (ev.key !== "Enter" && ev.key !== " ") return;
				const summary = ev.target.closest(".stonetop-arcanum-foldable-summary");
				if (!summary) return;
				ev.preventDefault();
				toggleArcanaFold(summary);
			}, true);

			// Masonry: lay arcana cards out by measured height, preserving authored order.
			// A both-sides "spread" card (front | back) spans the full grid width; the
			// narrower front-only cards pack two-up. The cards are walked into ordered
			// segments — each spread its own full-width segment, and each run of consecutive
			// narrow cards into a two-column block (each card placed in the currently-shortest
			// of that block's two columns). Unlike CSS multi-column, cards stay whole — a tall
			// card never splits — and a short card never leaves a big row-gap beside a tall one.
			//
			// A ResizeObserver on each grid drives it: it fires when the grid first becomes
			// measurable (the Arcana tab is shown, 0 → width) and whenever the sheet is
			// resized, so the columns re-balance for the new width. The original card order
			// is captured once per grid; the width guard makes the re-pack idempotent — and
			// also breaks the feedback loop, since re-packing changes the grid's own height,
			// which would otherwise re-trigger the observer.
			const packArcanaMasonry = grid => {
				const cards = (grid._stonetopCards ??=
					Array.from(grid.querySelectorAll(".stonetop-arcanum-card")));
				const width = grid.clientWidth;
				if (!cards.length || !width || grid._packedWidth === width) return;

				// Reset to a flat grid (narrow cards fall back to one track) and clear any
				// prior width-promotion, so every front-only card measures at its narrow,
				// one-column width — the width the "too tall" test below judges it at.
				for (const card of cards) card.classList.remove("stonetop-arcanum-card--wide");
				grid.replaceChildren(...cards);
				if (!cards[0].offsetHeight) return; // not measurable yet (tab still hidden)

				// Measure every card at its narrow width in one pass (reads before any style
				// write, so no per-card reflow), then promote any front-only card that renders
				// more than twice as tall as it is wide to span the full grid width: an
				// over-long arcanum reads better as one short, wide card than a skinny
				// sliver. Genuine both-sides spreads are already full-width and left alone.
				// Skip the promotion when the normal masonry column is already comfortably
				// wide; at that point the card should stay in the balanced column flow.
				const WIDE_PROMOTION_MAX_COLUMN_PX = 460;
				const measured = cards.map(card => ({ card, h: card.offsetHeight, w: card.offsetWidth }));
				const heights = new Map();
				for (const { card, h, w } of measured) {
					heights.set(card, h);
					if (card.classList.contains("stonetop-arcanum-card--spread")) continue;
					if (h > w * 2 && w < WIDE_PROMOTION_MAX_COLUMN_PX) card.classList.add("stonetop-arcanum-card--wide");
				}

				// Walk cards into ordered segments: a full-width card (a spread, or one
				// promoted wide above) stands alone; consecutive narrow cards accumulate into
				// a two-column array to balance.
				// A collapsed card is clamped to a header + lead, so it always packs as a
				// narrow one-column card — even a spread, whose full-width span is dropped
				// (both in CSS and here) while collapsed.
				const isFullWidth = card =>
					!card.classList.contains("is-collapsed") &&
					(card.classList.contains("stonetop-arcanum-card--spread") ||
					 card.classList.contains("stonetop-arcanum-card--wide"));
				const segments = [];
				let run = null;
				for (const card of cards) {
					if (isFullWidth(card)) {
						run = null;
						segments.push(card);
					} else {
						if (!run) segments.push(run = []);
						run.push(card);
					}
				}

				const nodes = segments.map(seg => {
					if (!Array.isArray(seg)) return seg; // a full-width card (spread or promoted)
					const block = document.createElement("div");
					block.className = "stonetop-arcana-masonry";
					const cols = [0, 1].map(() => {
						const c = document.createElement("div");
						c.className = "stonetop-arcana-col";
						return c;
					});
					const colHeights = [0, 0];
					for (const card of seg) {
						const i = colHeights[0] <= colHeights[1] ? 0 : 1;
						colHeights[i] += heights.get(card) ?? card.offsetHeight;
						cols[i].appendChild(card);
					}
					block.append(...cols);
					return block;
				});
				grid.replaceChildren(...nodes);
				grid._packedWidth = width;
			};
			this._arcanaMasonryObserver?.disconnect();
			this._arcanaMasonryObserver = new ResizeObserver(entries => {
				for (const entry of entries) packArcanaMasonry(entry.target);
			});
			html[0].querySelectorAll(".stonetop-arcana-grid").forEach(grid => {
				// Pack the visible grid now (it has width because super.activateListeners
				// already activated the tab) so its final, shorter height is in place
				// before Foundry restores scrollTop — otherwise the async observer repacks
				// after the restore, shrinking the grid and clamping the scroll position.
				packArcanaMasonry(grid);
				this._arcanaMasonryObserver.observe(grid);
			});

			// Re-pack every arcana grid on demand. Collapsing / expanding a card changes its
			// height but not the grid width, so the width-guarded observer won't re-balance
			// the two columns on its own — invalidate the per-width guard and re-run the packer.
			this._repackArcana = () => {
				html[0].querySelectorAll(".stonetop-arcana-grid").forEach(grid => {
					grid._packedWidth = null;
					packArcanaMasonry(grid);
				});
			};

			// Special-moves masonry: distribute the few, variable-height special-move
			// cards ROW-MAJOR into as many equal-width column tracks as the tab is wide
			// enough to hold (card i → column i % N). Unlike CSS multi-column — which
			// balances by height and, with only a handful of cards, can leave a right-hand
			// column holding more rows than one to its left — this keeps the fill strictly
			// left-weighted while each track stays a tight, natural-height stack. Driven by
			// a ResizeObserver, exactly like the arcana grid above: it fires when the tab
			// first gains width (0 → measurable) and on every sheet resize, and the
			// per-width guard makes the re-pack idempotent (so re-packing, which shortens
			// the grid, doesn't feed back into the observer).
			const SPECIAL_MOVE_MIN_COL_PX = 280;
			const SPECIAL_MOVE_COL_GAP_PX = 12;
			const packSpecialMoves = grid => {
				const cards = (grid._stonetopCards ??=
					Array.from(grid.querySelectorAll(".stonetop-special-move-card")));
				const width = grid.clientWidth;
				if (!cards.length || !width || grid._packedWidth === width) return;

				const colCount = Math.max(1, Math.min(cards.length,
					Math.floor((width + SPECIAL_MOVE_COL_GAP_PX) /
						(SPECIAL_MOVE_MIN_COL_PX + SPECIAL_MOVE_COL_GAP_PX))));
				const cols = Array.from({ length: colCount }, () => {
					const c = document.createElement("div");
					c.className = "stonetop-special-move-col";
					return c;
				});
				cards.forEach((card, i) => cols[i % colCount].appendChild(card));
				grid.replaceChildren(...cols);
				grid._packedWidth = width;
			};
			this._specialMoveMasonryObserver?.disconnect();
			this._specialMoveMasonryObserver = new ResizeObserver(entries => {
				for (const entry of entries) packSpecialMoves(entry.target);
			});
			html[0].querySelectorAll(".stonetop-special-move-grid").forEach(grid => {
				packSpecialMoves(grid);
				this._specialMoveMasonryObserver.observe(grid);
			});

			if (showMoveRefHover) {
				let _moveRefHovered = null;
				html.find(".stonetop-move-ref").on("mouseenter", async ev => {
					const anchor = ev.currentTarget;
					_moveRefHovered = anchor;
					const name = anchor.dataset.moveName;
					const desc = await fetchMoveRef(name);
					if (_moveRefHovered !== anchor || !desc) return;
					moveRefPanel.innerHTML =
						`<p class="stonetop-word-tooltip-name">${name}</p>` +
						`<div class="stonetop-word-tooltip-desc">${desc}</div>`;
					// Same as the move panel: drop collapsible <details> (e.g. Chart a
					// Course's "Travel Times") that can't be opened in a hover tooltip.
					moveRefPanel.querySelectorAll("details").forEach(d => d.remove());
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

			// Arcana-tab per-section edit pencils (Major / Minor). Same mechanism; the
			// pencil sits in the collapsible section's summary, so its capture-phase
			// handler stops the click before the collapse toggle sees it.
			this._wireSectionEditToggle(html, ".stonetop-arcana-section-edit-toggle");

			// The "needs your input" hand on a move card (shown when a budgeted move still
			// has unspent picks) is a one-tap shortcut into moves-edit — same as hitting the
			// section pencil — so the player can make the pending pick immediately. Open-only:
			// it never toggles edit OFF (the hand only shows while a choice is outstanding).
			const openMovesEditFromHand = ev => {
				const hand = ev.target.closest(".stonetop-move-choice-needed");
				if (!hand) return;
				if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
				ev.preventDefault();
				ev.stopPropagation();
				if (this.isSectionEditable("moves")) return; // already editable — nothing to do
				this._editingSections.add("moves");
				this._onSectionEditOpened("moves");
				this.render(false);
			};
			html[0].addEventListener("click", openMovesEditFromHand, true);
			html[0].addEventListener("keydown", openMovesEditFromHand, true);

			// The stat-choice hand on an Improved/Superior Stat card whose stat was never
			// chosen: open the +1 picker straight away for the first unfilled owned instance
			// (a repeatable move can have several). Distinct from the budgeted-move hand above
			// because there's no on-card control to pick a stat — it needs the dialog.
			const fillStatChoiceFromHand = async ev => {
				const hand = ev.target.closest(".stonetop-move-stat-choice-needed");
				if (!hand) return;
				if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
				ev.preventDefault();
				ev.stopPropagation();
				const itemId = hand.closest("[data-item-id]")?.dataset.itemId;
				const item = itemId ? this.actor.items.get(itemId) : null;
				if (!item) return;
				const choices = this.actor.getFlag(STONETOP_SCOPE, "improvedStatChoices") ?? {};
				const unfilled = this.actor.items.find(i =>
					i.type === "move" && i.name === item.name && i.system?.cap != null && !choices[i.id]);
				if (unfilled) await this._promptFillStatIncrease(unfilled);
			};
			html[0].addEventListener("click", fillStatChoiceFromHand, true);
			html[0].addEventListener("keydown", fillStatChoiceFromHand, true);

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
					html.find(".stonetop-instinct-custom-word, .stonetop-instinct-custom-desc").val("");
					this._stonetopCharacter.instinct.select(ev.currentTarget.value);
				});
				// Keep the word field to a single token, then save the composed
				// "Word — Description" so custom instincts match the suggestions.
				html.find(".stonetop-instinct-custom-word").on("input", ev => {
					ev.currentTarget.value = ev.currentTarget.value.replace(/\s+/g, "");
				});
				html.find(".stonetop-instinct-custom-word, .stonetop-instinct-custom-desc").on("change", () => {
					html.find("[name=stonetop-instinct]").prop("checked", false);
					const word = html.find(".stonetop-instinct-custom-word").val();
					const desc = html.find(".stonetop-instinct-custom-desc").val();
					this._stonetopCharacter.instinct.select(composeInstinct(word, desc));
				});
				html.find(".stonetop-appearance-radio").on("change", this._onAppearanceChange.bind(this));
				html.find("[name=stonetop-origin]").on("change", ev =>
					this._stonetopCharacter.origin.select(ev.currentTarget.value)
				);
				html.find(".stonetop-origin-name-check").on("change", this._onOriginNameClick.bind(this));
				// A regular move check and a repeatable-move check run the identical
				// add/remove-plus-prompts flow, so both bind to the one handler.
				html.find(".stonetop-move-check, .stonetop-repeat-check").on("change", this._onMoveCheck.bind(this));
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
			// Beast-Bonded markable actions stay interactive in normal view (marked
			// during play as levels unlock more), not just under the edit pencil.
			html.find(".stonetop-bg-action-check").on("change", this._onBackgroundActionCheck.bind(this));
			html.find(".stonetop-inventory-item-check").on("change", this._onInventoryItemCheck.bind(this));
			html.find(".stonetop-regular-pool-btn, .stonetop-small-pool-display").on("change", this._onInventoryPoolEdit.bind(this));
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-inventory-resource-btn");
				if (!btn) return;
				this._onInventoryResource({ currentTarget: btn });
			}, true);
			html.find(".stonetop-inv-add-btn").on("click", this._onAddInventoryItem.bind(this));
			html.find(".stonetop-inv-delete").on("click", this._onDeleteCustomInventoryItem.bind(this));
			html.find(".stonetop-inv-remove-special").on("click", this._onRemoveSpecialItem.bind(this));
			html.find(".stonetop-possession-check").on("change", this._onPossessionCheck.bind(this));
			html.find(".stonetop-possession-custom-remove").on("click", this._onRemoveCustomPossession.bind(this));
			html.find(".stonetop-possession-sub-check").on("change", this._onPossessionSubCheck.bind(this));
			// "Edit sacred pouch" affordances (Big Magic move card + gear-tab pencil):
			// open the standalone choiceGroups editor for the named possession.
			html.find("[data-possession-choices]").on("click", ev => {
				ev.preventDefault();
				ev.stopPropagation();
				this._openPossessionChoices(ev.currentTarget.dataset.possessionChoices);
			});
			html.find(".stonetop-levelup-open-btn").on("click", this._onLevelUpOpen.bind(this));
			html.find(".stonetop-levelup-icon").on("click", this._onLevelUpOpen.bind(this));
			html.find(".stonetop-deathsdoor-open-btn").on("click", this._onDeathsDoorOpen.bind(this));
			html.find(".stonetop-recover-open-btn").on("click", this._onRecoverOpen.bind(this));
			html.find(".stonetop-convalesce-open-btn").on("click", this._onConvalesceOpen.bind(this));

			// Wounds (4th harm track): add / edit / remove. Status transitions are otherwise
			// move-gated (Recover stabilizes, Convalesce heals); the edit dialog is the manual
			// override. The row's data-wound-id resolves which record an action targets.
			html.find(".stonetop-wound-add").on("click", this._onWoundAdd.bind(this));
			html.find(".stonetop-wound-tend").on("click", ev => this._onWoundTend(this._woundIdFromEvent(ev)));
			html.find(".stonetop-wound-edit").on("click", ev => this._onWoundEdit(this._woundIdFromEvent(ev)));
			html.find(".stonetop-wound-remove").on("click", ev => this._onWoundRemove(this._woundIdFromEvent(ev)));

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
			// Armor-source field: a free-type input with a suggestion dropdown (leather,
			// shield, hides…). Picking a suggestion fires `change`, saved by the handler
			// above; the field stays free-type, so "type your own" and "leave blank" both
			// just work. Uses our custom popup (native <datalist> has no scrollbar).
			html.find(".stonetop-follower-armor-source-input").each((_, input) =>
				StonetopAutocomplete.attach(input, FOLLOWER_ARMOR_SOURCES));
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
			// Animal-companion trait picker: pick up to the type's pickCount. Same
			// "checked, not disabled" gather as the crew tags; the limit is enforced on
			// render by disabling unchecked options once full. Traits drive the
			// companion's HP / armor / damage, so a re-render re-derives those stats.
			html.find(".stonetop-ac-trait-option").on("change", async () => {
				const traits = html.find(".stonetop-ac-trait-option:checked:not(:disabled)").toArray().map(el => el.value);
				await this.actor.setFlag("stonetop_pwd", "animalCompanion.traits", traits);
				this.render(false);
			});
			// Initiate of Danu trait lines: "pick 1 on each line". Each radio row writes
			// its choice to initiateDetails.<slug>.rows[rowIdx] — the same object store
			// onboarding fills — so the two stay in sync (the pronoun line is edited up
			// in the name section, never here).
			html.find(".stonetop-initiate-trait-option").on("change", async ev => {
				const el     = ev.currentTarget;
				const slug   = el.dataset.slug;
				const rowIdx = Number(el.dataset.rowIdx);
				if (!slug || !Number.isInteger(rowIdx)) return;
				const path = `initiateDetails.${slug}.rows`;
				const rows = foundry.utils.deepClone(this.actor.getFlag("stonetop_pwd", path) ?? {});
				rows[rowIdx] = el.value;
				await this.actor.setFlag("stonetop_pwd", path, rows);
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

			// Tapping one of a follower's own moves posts it to chat, spoken with the
			// follower's name (mirrors how basic moves / Invocations post to chat). Only
			// the read-only list is clickable; edit mode shows a textarea instead.
			html.find(".stonetop-follower-moves-list li").on("click", ev => {
				const moveText = ev.currentTarget.textContent.trim();
				if (!moveText) return;
				const card   = ev.currentTarget.closest(".stonetop-follower-card");
				// Read the name without its pronoun span so the type label doesn't
				// double up the parentheses (e.g. "Brindle (follower)", not "(she) (follower)").
				const nameEl = card?.querySelector(".stonetop-follower-name")?.cloneNode(true);
				nameEl?.querySelectorAll(".stonetop-follower-pronoun").forEach(n => n.remove());
				const name = (nameEl?.textContent.trim().replace(/\s+/g, " ")) || "Follower";
				const type = card?.querySelector(".stonetop-follower-type")?.textContent.trim();
				const title = type ? `${name} (${type})` : name;
				this._postMoveCard(title, `<p>${escHtml(moveText)}</p>`);
			});

			// Create a follower via the Book I walkthrough (NPCs & Followers, p.474).
			html.find(".stonetop-create-follower-btn").on("click", () => this._onCreateFollowerOpen());
			// Materialize a playbook possession-follower (dog / Hounds / Mastiffs) as a card.
			html.find(".stonetop-add-possession-follower").on("click", ev =>
				this._onAddPossessionFollower(ev.currentTarget.dataset.slug));
			// Expand/collapse-all caret on a rules card header (Animal Companion Moves /
			// Follower Special Moves): open every move's <details> when any is collapsed,
			// otherwise close them all. Open state is ephemeral (resets on re-render), like
			// the individual summaries, so nothing is persisted.
			html.find(".stonetop-follower-rules-toggle").on("click", ev => {
				ev.preventDefault();
				const btn   = ev.currentTarget;
				const rules = [...(btn.closest(".stonetop-follower-card--rules")?.querySelectorAll(".stonetop-follower-rule") ?? [])];
				if (!rules.length) return;
				const expand = rules.some(d => !d.open);
				rules.forEach(d => { d.open = expand; });
				btn.setAttribute("aria-expanded", String(expand));
				btn.classList.toggle("is-expanded", expand);
			});
			// Remove a custom follower (built by the walkthrough or converted from a
			// monster) entirely — drops its whole customFollowers.<id> object.
			html.find(".stonetop-follower-remove").on("click", ev => {
				const slug = ev.currentTarget.dataset.slug;
				if (!slug) return;
				const name = this.actor.getFlag("stonetop_pwd", `customFollowers.${slug}.name`) || "this follower";
				Dialog.confirm({
					title:   "Remove follower",
					content: `<p>Remove <strong>${escHtml(name)}</strong> from your followers? This can't be undone.</p>`,
					yes:     () => this._removeCustomFollower(slug),
					render:  bringDialogToFront,
					options: { classes: ["dialog", "stonetop"] },
				});
			});
			// Hand a custom follower off to another PC (p.480).
			html.find(".stonetop-follower-handoff").on("click", ev => {
				const slug = ev.currentTarget.dataset.slug;
				if (!slug) return;
				const name = ev.currentTarget.dataset.followerName
					|| this.actor.getFlag("stonetop_pwd", `customFollowers.${slug}.name`) || "this follower";
				this._onHandOffFollower(slug, name);
			});
			// Party-wide follower toggle (advisory): any PC may pay its cost / spend its
			// Loyalty (p.464). The data still lives on this PC — it's a shared-table note.
			html.find(".stonetop-follower-party-check").on("change", async ev => {
				const slug = ev.currentTarget.dataset.slug;
				if (!slug) return;
				await this.actor.update({ [`flags.stonetop_pwd.customFollowers.${slug}.party`]: ev.currentTarget.checked });
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
			// Spend Loyalty / Readiness (p.464 / p.469): open a small chooser for the
			// rulebook's spend options, decrement the track, and post a chat note.
			html.find(".stonetop-spend-loyalty").on("click", ev => {
				const { ftype, slug, followerName } = ev.currentTarget.dataset;
				this._onSpendLoyalty(ftype, slug ?? "", followerName);
			});
			html.find(".stonetop-spend-readiness").on("click", ev => {
				const { ftype, slug, followerName } = ev.currentTarget.dataset;
				this._onSpendReadiness(ftype, slug ?? "", followerName);
			});
			// Ring of Daagon — Call Up the Deep Ones (roll & shape a fresh Servant batch)
			// and Send Them Back (+CHA to dismiss a batch). See the Daagon actions in
			// tab-followers.hbs; both live on the Ring's / Servant's custom-follower card.
			html.find(".stonetop-callup-deep-ones").on("click", () => this._onCallUpDeepOnes());
			html.find(".stonetop-send-back").on("click", ev => {
				const { slug, followerName } = ev.currentTarget.dataset;
				this._onSendServantsBack(slug, followerName);
			});
			// Have What They Need (add gear to a follower) / Outfit the crew (restock).
			html.find(".stonetop-follower-have-need").on("click", ev => {
				const { ftype, slug, followerName } = ev.currentTarget.dataset;
				this._onHaveWhatTheyNeed(ftype, slug ?? "", followerName);
			});
			html.find(".stonetop-crew-outfit").on("click", () => this._onOutfitCrew());

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
			html.find(".stonetop-crew-delete-individual").on("click", ev => {
				const idx = Number(ev.currentTarget.dataset.index);
				const individuals = [...(this.actor.getFlag("stonetop_pwd", "crew.individuals") ?? [])];
				if (idx < 0 || idx >= individuals.length) return;
				const name = individuals[idx]?.name || "this crew member";
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
				// object-valued flags, so without the key deletes the dropped/old
				// trailing entries would persist.)
				const survivors = new Set(Object.keys(newHp));
				const update = { "flags.stonetop_pwd.crew.individuals": individuals };
				for (const k of Object.keys(oldHp))
					if (!survivors.has(k)) {
						const [updKey, val] = deletionEntry(`flags.${STONETOP_SCOPE}.crew.individualsHp.${k}`);
						update[updKey] = val;
					}
				for (const [k, v] of Object.entries(newHp))
					update[`flags.stonetop_pwd.crew.individualsHp.${k}`] = v;
				// Shrink the roster by one: "Remove" takes the member out of the crew
				// entirely. Without this the freed slot reappears as a fresh full-HP
				// anonymous member (`size` would still imply the old headcount).
				const sizeBefore = _effectiveCrewSize(this.actor.getFlag("stonetop_pwd", "crew.size"), individuals.length + 1);
				const newSize = Math.max(individuals.length, sizeBefore - 1);
				update["flags.stonetop_pwd.crew.size"] = newSize;
				clampStoredGroupHp(update, newSize);
				Dialog.confirm({
					title:   "Remove crew member",
					content: `<p>Remove <strong>${escHtml(name)}</strong> from the crew? This can't be undone.</p>`,
					yes:     async () => { await this.actor.update(update); this.render(false); },
					render:  bringDialogToFront,
					options: { classes: ["dialog", "stonetop"] },
				});
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

			// Readiness circles (crew Defend pool + each non-crew follower — p.469:
			// held when they Defend; spend to suffer an attack for a ward, halve it,
			// draw all attention, or strike back). The crew's pips carry ftype "crew",
			// so the same handler resolves both via _followerReadinessPath. Clicking a
			// circle sets Readiness to its position; clicking the highest filled one
			// clears back to it (matching the Loyalty-pip toggle).
			html.find("button.stonetop-readiness-pip").on("click", async ev => {
				const { ftype, slug } = ev.currentTarget.dataset;
				const path = _followerReadinessPath(ftype, slug);
				if (!path) return;
				const idx     = Number(ev.currentTarget.dataset.index);
				const current = Math.max(0, Number(this.actor.getFlag("stonetop_pwd", path)) || 0);
				await this.actor.update({ [`flags.stonetop_pwd.${path}`]: current === idx + 1 ? idx : idx + 1 });
				this.render(false);
			});
			// "Uses ammo" toggle (Damage section, edit mode): opts a ranged follower
			// into the ◇ low ammo / ◇ all out track. Turning it off clears any marked
			// ammo, so a later re-enable starts fresh at full.
			html.find(".stonetop-follower-uses-ammo-input").on("change", async ev => {
				const { ftype, slug } = ev.currentTarget.dataset;
				const path = followerDetailPath(ftype, slug ?? "", "usesAmmo");
				if (!path) return;
				const on = ev.currentTarget.checked;
				const update = { [`flags.stonetop_pwd.${path}`]: on };
				if (!on) {
					const ammoPath = _followerAmmoPath(ftype, slug ?? "");
					if (ammoPath) update[`flags.stonetop_pwd.${ammoPath}`] = 0;
				}
				await this.actor.update(update);
				this.render(false);
			});
			// Follower ammo checks (◇ low ammo, ◇ all out): a cumulative 0→1→2 track, so
			// checking "all out" implies "low ammo" and clearing "low" resets to full.
			html.find(".stonetop-follower-ammo-input").on("change", async ev => {
				const { ftype, slug, index } = ev.currentTarget.dataset;
				const path = _followerAmmoPath(ftype, slug ?? "");
				if (!path) return;
				const idx    = Number(index);
				const newVal = ev.currentTarget.checked ? idx + 1 : idx;
				await this.actor.update({ [`flags.stonetop_pwd.${path}`]: newVal });
				this.render(false);
			});

			// Restore the abstracted group-fight pool to full (clears the override).
			// A data-slug marks a custom group's pool; without one it's the crew's.
			html.find(".stonetop-group-hp-reset").on("click", async ev => {
				const slug = ev.currentTarget.dataset.slug;
				if (slug) await this.actor.update({ [`flags.stonetop_pwd.customFollowers.${slug}.groupHp`]: null });
				else      await this.actor.unsetFlag("stonetop_pwd", "crew.groupHp");
				this.render(false);
			});

			// Custom group roster size (mirrors the crew size stepper). Clamps the
			// abstracted group-HP pool down when the group shrinks, and drops any
			// per-member HP entries beyond the new size, so nothing stale is left.
			const setCustomGroupSize = async (slug, next) => {
				const c = this.actor.getFlag("stonetop_pwd", `customFollowers.${slug}`);
				if (!c) return;
				const size = Math.max(2, Math.min(_CREW_SIZE_MAX, Math.trunc(Number(next) || 0) || 2));
				const memberHpMax = Math.max(1, Math.trunc(Number(c.hpMax) || 0) || 1);
				const update = { [`flags.stonetop_pwd.customFollowers.${slug}.size`]: size };
				// Trim per-member HP to the new roster length.
				if (Array.isArray(c.memberHp) && c.memberHp.length > size) {
					update[`flags.stonetop_pwd.customFollowers.${slug}.memberHp`] = c.memberHp.slice(0, size);
				}
				// Clamp an explicitly-set group pool to the new max (unset tracks full).
				const rawPool = Number(c.groupHp);
				if (Number.isFinite(rawPool)) {
					const max = size * memberHpMax;
					if (rawPool > max) update[`flags.stonetop_pwd.customFollowers.${slug}.groupHp`] = max;
				}
				await this.actor.update(update);
				this.render(false);
			};
			html.find(".stonetop-custom-group-size-step").on("click", ev => {
				const { slug, delta } = ev.currentTarget.dataset;
				const cur = Math.max(2, Math.trunc(Number(this.actor.getFlag("stonetop_pwd", `customFollowers.${slug}.size`)) || 0) || 2);
				setCustomGroupSize(slug, cur + Number(delta));
			});
			html.find(".stonetop-custom-group-size-input").on("change", ev =>
				setCustomGroupSize(ev.currentTarget.dataset.slug, ev.currentTarget.value));

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

			// Collapse / expand the sidebar move groups (Basic / Expedition). A custom
			// toggle rather than <details> keeps the move list in normal flow and
			// contributing its width, so the sidebar doesn't reflow (jitter) when a
			// group collapses. Collapsed ids are persisted (default expanded).
			this._wireCollapsible(html, {
				summarySel:     ".stonetop-moves-summary",
				collapsibleSel: ".stonetop-moves-collapsible",
				getSet:         () => (this._collapsedMoveSections ??= new Set()),
				persist:        () => this._persistMoveSections(),
			});

			// Collapse / expand the Arcana sections (Major / Minor arcanum). Same custom-
			// toggle approach as the move groups: the heading is the summary and the card
			// grid below clamps to zero height (keeping its masonry packing intact).
			this._wireCollapsible(html, {
				summarySel:     ".stonetop-arcana-summary",
				collapsibleSel: ".stonetop-arcana-collapsible",
				getSet:         () => (this._collapsedArcanaSections ??= new Set()),
				persist:        () => this._persistArcanaSections(),
			});

			// Collapse / expand an individual arcanum card down to its title bar. The
			// corner chevron is the summary; the card body/footer clamp away. Re-pack the
			// masonry after each toggle so the two columns re-balance for the card's new
			// height. Collapsed card slugs persist per actor (default expanded).
			this._wireCollapsible(html, {
				summarySel:     ".stonetop-arcanum-collapse-btn",
				collapsibleSel: ".stonetop-arcanum-card",
				getSet:         () => (this._collapsedArcanaCards ??= new Set()),
				persist:        () => this._persistArcanaCards(),
				onToggle:       () => this._repackArcana?.(),
			});

			// Collapse / expand the whole moves sidebar (Roll Modifier + move lists).
			// Toggling a class (rather than re-rendering) lets the tab content reclaim
			// the freed width without flicker; the state is persisted so the sidebar
			// reopens the same way.
			html.find(".stonetop-sidebar-toggle").on("click", ev => {
				const sidebar   = ev.currentTarget.closest(".stonetop-moves-sidebar");
				if (!sidebar) return;
				const collapsed = sidebar.classList.toggle("is-collapsed");
				ev.currentTarget.setAttribute("aria-expanded", String(!collapsed));
				ev.currentTarget.setAttribute("aria-label", collapsed ? "Expand moves sidebar" : "Collapse moves sidebar");
				setSidebarCollapsed(this.actor?.id, collapsed);
			});
			// Name an (anonymous) crew member: promote them to a named individual,
			// carrying their current HP across. Opened from each member's "Name them"
			// button in edit mode, which targets that specific roster slot.
			const openNameMemberDialog = async (anonIndex) => {
				// Fall back to the shared crew suggestion lists (module/data/steading-members.js)
				// when the playbook pack doesn't carry its own crew.individualOptions.
				const playbookDoc = await this._stonetopCharacter.playbook();
				const indOpts     = playbookDoc?.flags?.stonetop?.crew?.individualOptions ?? {};
				const names  = indOpts.names?.length  ? indOpts.names  : CREW_INDIVIDUAL_NAMES;
				const tags   = indOpts.tags?.length   ? indOpts.tags   : CREW_INDIVIDUAL_TAGS;
				const traits = indOpts.traits?.length ? indOpts.traits : CREW_INDIVIDUAL_TRAITS;

				const namesHtml = names.map(n => `<option value="${n}">`).join("");
				const tagsHtml  = tags.map(t => `<option value="${t}"></option>`).join("");

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

				// Build one chip's inner HTML from its tokens, tracking slot indices.
				// Slash-option slots are free-type combos: the slash choices become
				// <datalist> suggestions, but you can type anything (replacing the old
				// "___ (type your own)" select option). traitIndex keeps datalist ids unique.
				const buildChipInner = (tokens, safeVal, traitIndex) => {
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
							const s        = slotIdx++;
							const realOpts = tok.opts.filter(o => o !== "__");
							const display  = tok.opts.map(o => o === "__" ? "___" : o).join("/");
							const listId   = `trait-opts-${traitIndex}-${s}`;
							const optHtml  = realOpts.map(o => `<option value="${o.replace(/"/g, "&quot;")}"></option>`).join("");
							html += `<span class="stonetop-trait-blank">${display}</span>`;
							html += `<input type="text" class="stonetop-trait-select" data-slot="${s}" list="${listId}" style="display:none" placeholder="…" autocomplete="off">`;
							html += `<datalist id="${listId}">${optHtml}</datalist>`;
						}
					}
					return html;
				};

				const traitsHtml = traits.map((t, ti) => {
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
							${buildChipInner(tokens, safeVal, ti)}
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
							<input type="text" name="ind-tag" list="ind-tags" placeholder="Choose or type a tag…" autocomplete="off">
							<datalist id="ind-tags">${tagsHtml}</datalist>
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
								const tag    = dlgHtml.find("[name='ind-tag']").val().trim();
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
											const val = sel?.value.trim();
											result += val || tok.opts.find(o => o !== "__") || tok.opts[0];
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
						bringDialogToFront(dlgHtml);
						// Swap the name/tag/trait combos' native <datalist> popups (which
						// lose their scrollbar when long, crbug.com/375637) for our
						// scrollable one. See utils/autocomplete.js.
						StonetopAutocomplete.upgradeAll(dlgHtml);
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
				const { label, rollFor } = outnumberBonus(
					row.querySelector(".stonetop-outnumber-yours")?.value,
					row.querySelector(".stonetop-outnumber-theirs")?.value,
				);
				const resultEl = row.querySelector(".stonetop-outnumber-result");
				if (resultEl) resultEl.textContent = label;
				const section  = row.closest(".stonetop-group-fight-section");
				const dmgBtn   = section?.querySelector(".stonetop-group-fight-dmg-roll");
				const dmgLabel = section?.querySelector(".stonetop-group-fight-dmg-label");
				// Build on the crew's actual damage die (carried in data-base-roll,
				// which honours any Damage override), not a hardcoded d6.
				const roll     = rollFor(dmgBtn?.dataset.baseRoll);
				if (dmgBtn)   dmgBtn.dataset.roll     = roll;
				if (dmgLabel) dmgLabel.textContent    = roll;
			}, true);

			// -- Followers: group fight Clash / Let Fly --
			html[0].addEventListener("click", async ev => {
				const btn = ev.target.closest(".stonetop-group-fight-roll");
				if (!btn) return;
				ev.stopPropagation();
				const moveLabel = btn.dataset.moveLabel || "Clash";
				// Order Followers (p.462): a group rolls its OWN bonus (the crew's
				// rollMod, the "+1" the card shows), not the PC's +STAT. The crew's
				// modifier already bakes in its relevant tag(s), so the group-fight
				// shortcut skips the per-tag prompt and rolls it directly.
				const bonus = Math.trunc(Number(btn.dataset.rollMod) || 0);
				// Read the name off the group-fight damage button's data attribute, not
				// the header's name text — that text node is replaced by an <input> in
				// edit mode, which would drop the name to the "Crew" fallback.
				const section  = btn.closest(".stonetop-group-fight-section");
				const crewName = section?.querySelector(".stonetop-group-fight-dmg-roll")?.dataset.followerName?.trim() || "Crew";
				await this._stonetopCharacter.onOrderFollowersRoll({ bonus, moveName: `${crewName}: ${moveLabel}` });
			}, true);

			// -- Followers: Order (direct any follower to make a move, p.462) --
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-follower-order");
				if (!btn) return;
				ev.stopPropagation();
				const tags = (btn.dataset.tags || "").split("|").map(s => s.trim()).filter(Boolean);
				const follower = {
					name:        btn.dataset.followerName || "Follower",
					tags,
					exceptional: btn.dataset.exceptional === "true",
					// A group-fight Clash/Let Fly button pre-selects that move; the plain
					// Order button leaves it at the default (Defy Danger).
					moveKey:     btn.dataset.moveKey || null,
				};
				const ftype = btn.dataset.ftype, slug = btn.dataset.slug ?? "";
				new OrderFollowersDialog(this.actor, follower,
					async (result) => {
						const roll = await this._stonetopCharacter.onOrderFollowersRoll(result);
						await this._maybeHoldReadinessOnDefend(ftype, slug, result, roll);
					},
				).render(true);
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
				this._postMoveCard(name, description);
			});
			html.find(".stonetop-other-move-delete").on("click", ev => {
				const { itemId } = ev.currentTarget.dataset;
				const item = this.actor.items.get(itemId);
				// Custom moves are read-only for players when authoring is GM-only — don't
				// let them delete a GM-authored custom move either (matches the hidden +/pencil).
				if (item?.flags?.[STONETOP_SCOPE]?.custom && !canAuthorCustomMoves()) return;
				const name = item?.name || "this move";
				Dialog.confirm({
					title:   "Remove move",
					content: `<p>Remove <strong>${escHtml(name)}</strong> from your moves? This can't be undone.</p>`,
					yes:     () => this._stonetopCharacter.removeMove(itemId),
					render:  bringDialogToFront,
					options: { classes: ["dialog", "stonetop"] },
				});
			});

			const openCustomMove = (item = null) => {
				if (!this.isEditable || !canAuthorCustomMoves()) return;
				new CustomMoveDialog(characterMoveSaver(this._stonetopCharacter), {
					item,
					onSaved: () => this.render(false),
				}).render(true);
			};
			// Learned toggle on a custom move: un-checking keeps it on the sheet but inactive
			// (not rollable, bonuses off); re-checking re-learns it. Gated the same way as
			// authoring, so a player can't toggle a GM-authored one when authoring is GM-only.
			html.find(".stonetop-custom-move-learned").on("change", async ev => {
				if (!this.isEditable || !canAuthorCustomMoves()) return;
				await this._stonetopCharacter.setCustomMoveLearned(ev.currentTarget.dataset.itemId, ev.currentTarget.checked);
				this.render(false);
			});
			html.find(".stonetop-add-custom-move").on("click", () => openCustomMove());
			html.find(".stonetop-custom-move-edit").on("click", ev => {
				const item = this.actor.items.get(ev.currentTarget.dataset.itemId);
				if (item) openCustomMove(item);
			});

			// Love letters (Book I p.568). "Read letter" opens the letter in a reader modal;
			// resolving from there rolls/posts it like any move, then consumes it (single-use)
			// — the last one takes its section with it. Edit and delete are GM-only affordances
			// (canAuthorLoveLetters gates the markup too).
			html.find(".stonetop-love-letter-read").on("click", ev => {
				const itemId = ev.currentTarget.dataset.itemId;
				const item = this.actor.items.get(itemId);
				if (!item) return void ui.notifications.warn("That love letter is no longer on this character.");
				new LoveLetterReadDialog({
					item,
					actor: this.actor,
					onResolve: () => this._onResolveLoveLetter(itemId),
				}).render(true);
			});
			html.find(".stonetop-love-letter-edit").on("click", ev => {
				if (!game.user.isGM) return;
				const item = this.actor.items.get(ev.currentTarget.dataset.itemId);
				if (item) new LoveLetterDialog({ item, actor: this.actor, onSaved: () => this.render(false) }).render(true);
			});
			html.find(".stonetop-love-letter-delete").on("click", ev => {
				if (!game.user.isGM) return;
				const item = this.actor.items.get(ev.currentTarget.dataset.itemId);
				if (!item) return;
				Dialog.confirm({
					title:   game.i18n.localize("stonetop.character.moves.loveLetter.deleteMove"),
					content: `<p>${game.i18n.format("stonetop.character.moves.loveLetter.deleteConfirm", { name: escHtml(item.name) })}</p>`,
					yes:     () => item.delete(),
					render:  bringDialogToFront,
					options: { classes: ["dialog", "stonetop"] },
				});
			});

			html[0].addEventListener("click", ev => {
				const title = ev.target.closest(".stonetop-arcanum-title--clickable");
				if (!title) return;
				ev.stopPropagation();
				const { slug, flipped } = title.dataset;
				this._stonetopCharacter.getArcanumChatContent(slug, flipped === "true").then(content => {
					if (!content) return;
					// applyRollMode sets whisper/blind from the configured roll mode; passing
					// rollMode as a create-data key alone does nothing, so a "Private GM Roll"
					// setting would still broadcast a referenced card back to every player.
					const messageData = {
						content,
						speaker: ChatMessage.getSpeaker({ actor: this.actor }),
					};
					ChatMessage.applyRollMode(messageData, game.settings.get("core", "rollMode"));
					ChatMessage.create(messageData);
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
					render: bringDialogToFront,
					options: { classes: ["dialog", "stonetop"] },
				});
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-discover-btn");
				if (!btn) return;
				ev.stopPropagation();
				const { slug } = btn.dataset;
				Dialog.confirm({
					title: game.i18n.localize("stonetop.arcana.discoverTitle"),
					content: `<p>${game.i18n.localize("stonetop.arcana.discoverConfirm")}</p>`,
					yes: () => this._stonetopCharacter.discoverArcanum(slug).then(() => this.render(false)),
					render: bringDialogToFront,
					options: { classes: ["dialog", "stonetop"] },
				});
			}, true);

			html[0].addEventListener("click", ev => {
				const thumb = ev.target.closest(".stonetop-arcanum-thumb, .stonetop-lore-arcana-img");
				if (!thumb) return;
				ev.stopPropagation();
				new ImagePopout(thumb.src, { title: thumb.dataset.name }).render(true);
			}, true);

			// Hovering a card's art pops a larger preview beside it (click still opens the
			// full ImagePopout, above). It's a fixed-position popup on <body> — not a CSS
			// ::after — because the thumb sits at the far left of each card and the arcana
			// tab is overflow-x:hidden, which would clip a pseudo-element. Delegated in the
			// capture phase so it fires for the thumbs even though mouseenter/leave don't bubble.
			html[0].addEventListener("mouseenter", ev => {
				const thumb = ev.target.closest?.(".stonetop-arcanum-thumb, .stonetop-lore-arcana-img");
				if (!thumb) return;
				this._showArcanumThumbPreview(thumb);
			}, true);
			html[0].addEventListener("mouseleave", ev => {
				if (!ev.target.closest?.(".stonetop-arcanum-thumb, .stonetop-lore-arcana-img")) return;
				this._removeArcanumThumbPreview();
			}, true);

			// "Show both sides" ⇄ "show front only" toggle (available in and out of edit
			// mode). Persists a PER-USER display preference so the card renders as a front|back
			// spread while reading in play mode. Stored on the viewing user, so the GM's and the
			// owning player's choices are independent. It never overrides back permission — the
			// button is only rendered for cards whose back this viewer may already see.
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-showboth-btn");
				if (!btn) return;
				ev.stopPropagation();
				const { slug, show } = btn.dataset;
				this._toggleArcanumShowBoth(slug, show !== "true").then(() => this.render(false));
			}, true);

			// "Show back" ⇄ "Show front" single-side flip. A sibling PER-USER preference to
			// show-both; it swaps which lone side renders while the card isn't spread. Same
			// permission guard — only ever offered for a back this viewer may already see.
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-flip-btn");
				if (!btn) return;
				ev.stopPropagation();
				const { slug, show } = btn.dataset;
				this._toggleArcanumShowBack(slug, show !== "true").then(() => this.render(false));
			}, true);

			// GM-only: in secretive mode (setting off), toggle whether the owning player can
			// peek at a still-LOCKED card's back (the button is hidden once unlocked — the
			// owner sees it then — and hidden entirely when the peek setting is on). Writing
			// the actor flag propagates to the player's open sheet, which re-renders.
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-reveal-btn");
				if (!btn || !game.user.isGM) return;
				ev.stopPropagation();
				const { slug, revealed } = btn.dataset;
				const action = revealed === "true"
					? this._stonetopCharacter.hideArcanum(slug)
					: this._stonetopCharacter.revealArcanum(slug);
				action.then(() => this.render(false));
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-summon-btn");
				if (!btn || btn.disabled) return;
				ev.stopPropagation();
				this._onArcanaSummon(btn.dataset.slug);
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-resource-btn");
				if (!btn) return;
				ev.stopPropagation();
				const { slug, index, resourceKind } = btn.dataset;
				const isChecked = btn.classList.contains("is-checked");
				const newVal = isChecked ? Number(index) : Number(index) + 1;
				// Reflect the new fill in place and persist WITHOUT a re-render. An arcana
				// resource track is self-contained — nothing else on the sheet derives from its
				// count — and a full re-render repacks the arcana masonry, which jumps the tab's
				// scroll position on every click. Toggle the track's own buttons directly (a
				// button at index i is filled when i < count, matching the resourceChecks helper).
				btn.parentElement.querySelectorAll(".stonetop-arcanum-resource-btn").forEach(b =>
					b.classList.toggle("is-checked", Number(b.dataset.index) < newVal));
				// A card's back-ITEM resource is keyed `${slug}:item` so it never shares storage
				// with the back-power resource on the same card (see CharacterArcana buildSnapshot).
				const key = resourceKind === "item" ? `${slug}:item` : slug;
				this._stonetopCharacter.setArcanumResource(key, newVal, { render: false });
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-delete");
				if (!btn) return;
				ev.stopPropagation();
				const { slug } = btn.dataset;
				const title = btn.closest(".stonetop-arcanum-card")
					?.querySelector(".stonetop-arcanum-title")?.textContent?.trim() || "this arcanum";
				Dialog.confirm({
					title:   "Remove arcanum",
					content: `<p>Remove <strong>${escHtml(title)}</strong> from your arcana? This can't be undone.</p>`,
					yes:     () => this._pruneArcanumUserPrefs(slug)
						.then(() => this._stonetopCharacter.removeArcanum(slug))
						.then(() => this.render(true)),
					render:  bringDialogToFront,
					options: { classes: ["dialog", "stonetop", "stonetop-remove-arcanum-dialog"] },
				});
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcana-create");
				if (!btn) return;
				ev.stopPropagation();
				this._onArcanaCreate(btn.dataset.major === "true");
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
				// Watch for a named single follower (animal companion / initiate / beast /
				// custom — not the crew, not livestock) crossing from alive to 0 HP, so we
				// can prompt for its fate (p.469 + Loyal to the End) after the write.
				const fateTypes = new Set(["animal-companion", "initiate", "beast", "custom"]);
				const fateHpPaths = {
					"animal-companion": "animalCompanion.hpCurrent",
					"initiate":         `initiatesHp.${slug}`,
					"beast":            `beastHp.${slug}`,
					"custom":           `customFollowers.${slug}.hpCurrent`,
				};
				const fateEligible = val === 0
					&& fateTypes.has(follower)
					&& !input.closest(".stonetop-follower-card--livestock");
				// "unset" HP means full (see _clampHp) — so an undefined previous value
				// counts as alive; only an explicit 0 means they were already down.
				const wasAlive = fateEligible
					&& Number(this.actor.getFlag("stonetop_pwd", fateHpPaths[follower])) !== 0;
				await this._setFollowerHp(follower, slug, index, val);
				// Reviving a fallen custom follower (HP back above 0) clears its "dead" mark so
				// the card returns to normal — a mirror of the fate dialog's "Dead" outcome.
				if (follower === "custom" && slug && val > 0
					&& this.actor.getFlag("stonetop_pwd", `customFollowers.${slug}.dead`)) {
					await this.actor.update({ [`flags.stonetop_pwd.customFollowers.${slug}.dead`]: false });
				}
				// Capture the follower's display name off the live card BEFORE the
				// re-render detaches this input from the DOM.
				const fateName = wasAlive
					? (input.closest(".stonetop-follower-card")?.querySelector(".stonetop-follower-order")?.dataset.followerName
						|| input.closest(".stonetop-follower-card")?.querySelector(".stonetop-spend-loyalty")?.dataset.followerName
						|| "Your follower")
					: null;
				this.render(false);
				// Now that the 0 is committed, offer the fate choice (Loyal to the End /
				// Death's Door / dying / dead) for a follower who just went down.
				if (wasAlive) {
					const loyaltyPath = _followerLoyaltyPath(follower, slug);
					const loyalty = Math.max(0, Number(this.actor.getFlag("stonetop_pwd", loyaltyPath)) || 0);
					// Loyal to the End is the Ranger's animal-companion move (p.469 → p.143):
					// it replaces the standard fate choice, and only the companion gets it.
					new FollowerFateDialog(this.actor, { name: fateName, loyalty, isAnimalCompanion: follower === "animal-companion" },
						(action) => this._resolveFollowerFate(action, { name: fateName, loyalty, follower, slug }),
					).render(true);
				}
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
			const items     = Array.isArray(itemData) ? itemData : [itemData];
			const arcana    = items.filter(i => i.type === "move" && i.system?.moveType === "arcanum");
			const inventory = items.filter(i => i.type === "move" && i.system?.moveType === "inventory");
			const moves     = items.filter(i => i.type === "move" && !["arcanum", "inventory"].includes(i.system?.moveType));
			const others    = items.filter(i => i.type !== "move");
			let anyAdded = false;
			// A dropped arcanum is added UNIDENTIFIED — a face-down "mystery" card the player
			// Identifies in play (drop is the only path that plants a mystery; onboarding,
			// level-up, and the homebrew creator all identify on add). Because that card shows
			// no name or art until identified, and can land on a tab you aren't looking at, a
			// silent add reads as "nothing happened". So collect the freshly-added ones (skip
			// arcana already owned — a re-drop is a no-op) to toast and reveal the Arcana tab.
			const ownedArcana = this._stonetopCharacter.ownedArcanaSlugs;
			const addedArcana = [];
			for (const item of arcana) {
				const slug = item.flags?.stonetop?.slug;
				if (slug && !ownedArcana.has(slug)) {
					await this._stonetopCharacter.addArcanum(slug);
					addedArcana.push(item.name || item.flags?.stonetop?.front?.title || "an arcanum");
					anyAdded = true;
				}
			}
			for (const item of moves) {
				if (await this._stonetopCharacter.onDropMove(item)) anyAdded = true;
			}
			for (const item of inventory) {
				await this._stonetopCharacter.addDroppedInventoryItem(item);
				anyAdded = true;
			}
			if (others.length) await super._onDropItemCreate(others);
			if (addedArcana.length) {
				const one = addedArcana.length === 1;
				ui.notifications?.info?.(
					`Added ${joinNames(addedArcana)} to the Arcana tab, face-down — use Identify to reveal ${one ? "it" : "them"}.`,
				);
				// Reveal the Arcana tab so the new (face-down) card is visible — but do it AFTER
				// the re-render lands, as a cheap DOM toggle, not by presetting active before a
				// render. The flag write above schedules its own auto-render, which races the
				// explicit render(false) below; presetting active lost that race intermittently,
				// leaving the card on a hidden tab until the sheet was reopened. An instance flag
				// consumed by _render makes the switch deterministic regardless of which render
				// wins — and, unlike a global Hooks.once(render…), can't be swallowed by another
				// open character sheet that happens to re-render first.
				this._activateArcanaTabOnRender = true;
			}
			if (anyAdded) this.render(false);
		}

		// Roll one of this character's owned moves by its embedded item id, running the
		// exact same dispatch a click on the move's dice icon would — guided-move dialog,
		// "ask"/alt-stat picker, and the optional pre-roll modifier prompt all included.
		// This is the entry point used by the hotbar move-macros (drag a move onto the
		// hotbar): it works whether or not the sheet is currently rendered, because it
		// builds a detached stand-in for the row's rollable icon (see _makeSyntheticRollable)
		// and feeds it to the same helpers the inline click handler uses. Keep the branch
		// order here in sync with that handler in activateListeners.
		async rollMoveById(itemId, { shiftKey = false } = {}) {
			const item = this.actor?.items?.get(itemId);
			if (!item) return void ui.notifications.warn("That move is no longer on this character.");
			if (!this.isEditable) return;

			const rollable = this._makeSyntheticRollable(item);
			if (!rollable) return item.roll();   // description-only move → post to chat

			const guided = this._guidedMoveForRollable(rollable);
			if (guided) return this._openGuidedCharacterMove(guided, rollable);

			const askItem = this._statChoiceMoveForRollable(rollable);
			if (askItem) return this._promptStatChoice(askItem, rollable, undefined, { shiftKey });

			const altChoice = this._altStatChoiceForRollable(rollable);
			if (altChoice) return this._promptStatChoice(altChoice.item, rollable, altChoice.stats, { shiftKey });

			const situational = await this._maybePromptRollModifier({ shiftKey, rollable });
			if (situational === null) return;   // player cancelled the modifier prompt
			await this._stonetopCharacter.onRoll({ currentTarget: rollable }, { situational });
		}

		// Resolve a love letter (Book I p.568): post it like any move, then consume it.
		// A fixed-stat letter rolls through the standard engine (same chat card, XP-on-miss);
		// a no-roll letter posts its body as a description card. We call onRoll directly (not
		// rollMoveById) so there's no situational-modifier prompt whose cancel could leave a
		// single-use letter half-spent — the letter is only deleted once its card has posted.
		async _onResolveLoveLetter(itemId) {
			const item = this.actor?.items?.get(itemId);
			if (!item) return void ui.notifications.warn("That love letter is no longer on this character.");
			if (!this.isEditable) return;

			try {
				const rollable = this._makeSyntheticRollable(item);   // null when there's no roll
				if (rollable) await this._stonetopCharacter.onRoll({ currentTarget: rollable }, {});
				else await item.roll({ descriptionOnly: true });
			} catch (err) {
				console.error("Stonetop | Error resolving love letter:", err);
				ui.notifications.error("Could not resolve that love letter — see the console for details.");
				// Rethrow so the reader dialog keeps itself open and re-enables its button; the
				// letter is left in place (delete below is skipped) so it isn't silently consumed.
				throw err;
			}

			await item.delete();   // single-use — the section vanishes with the last letter
		}

		// Build a detached DOM element that stands in for a move row's rollable dice icon,
		// carrying just the structure the rollable-dispatch helpers read: an ancestor
		// `.item.stonetop-item` with the item id, a `.stonetop-item-name`, and the stat on
		// the rollable's data-roll. Returns null for a move with no rollType (nothing to
		// roll). Using a real (unattached) element means the helpers need no DOM-vs-object
		// special-casing — they closest()/querySelector() over it exactly as on the sheet.
		_makeSyntheticRollable(item) {
			const stat = normalizeRollType(item.system?.rollType);
			if (!stat) return null;
			const li = document.createElement("li");
			li.className = "item stonetop-item";
			li.dataset.itemId = item.id;
			const name = document.createElement("strong");
			name.className = "stonetop-item-name";
			name.textContent = item.name;
			const rollable = document.createElement("span");
			rollable.className = "rollable move-rollable";
			rollable.dataset.roll = stat;
			li.append(name, rollable);
			return rollable;
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

		// Optional pre-roll modifier prompt, gated by the "Prompt for Roll Modifier"
		// client setting. Returns the situational modifier to apply (0 when the setting
		// is off or the prompt is skipped), or null when the player cancels the prompt so
		// the caller can abort the roll. Holding Shift on the originating click skips it.
		// Pass a `rollable` to derive the title from its move/stat, or an explicit `title`.
		async _maybePromptRollModifier({ shiftKey = false, rollable = null, title = null } = {}) {
			if (!getPromptRollModifierSetting()) return 0;
			if (shiftKey) return 0;
			const moveName = rollable?.closest(".stonetop-item")?.querySelector(".stonetop-item-name")?.textContent?.trim();
			const statKey  = rollable?.dataset?.roll;
			const resolvedTitle = title
				|| moveName
				|| (statKey && _STAT_KEYS.has(statKey) ? `Roll +${statKey.toUpperCase()}` : "Roll Modifier");
			return promptRollModifier({ title: resolvedTitle });
		}

		_promptStatChoice(item, rollable, statKeys = _STAT_KEYS, { shiftKey = false } = {}) {
			const stats = this.actor.system?.stats ?? {};
			const buttons = {};
			for (const key of statKeys) {
				const value = stats[key]?.value ?? 0;
				const label = Handlebars.helpers.statLabel(key);
				buttons[key] = {
					// Offer the modifier prompt once the stat is chosen, mirroring the inline
					// roll path; Shift on the original click skips it, a cancel aborts the roll.
					callback: async () => {
						const situational = await this._maybePromptRollModifier({ shiftKey, title: item.name });
						if (situational === null) return;
						await this._stonetopCharacter.onRoll({ currentTarget: rollable }, { statOverride: key, situational });
					},
					label: `${label} (${sign(value)})`,
				};
			}
			new Dialog({
				title: `${item.name} — Choose a Stat`,
				content: `<p>Which stat are you rolling with?</p>`,
				buttons,
				render: bringDialogToFront,
			}, { width: 480, classes: ["dialog", "stonetop", "stonetop-stat-picker-dialog"] }).render(true);
		}

		_guidedMoveForRollable(rollable) {
			const li = rollable.closest(".stonetop-item");
			const name = li?.querySelector(".stonetop-item-name")?.textContent?.trim()
				?? rollable.dataset.label?.trim();
			const guide = GUIDED_CHARACTER_MOVES[name];
			if (!guide) return null;
			// A player-authored custom move (moveType "other") that happens to share a
			// guided move's name should roll as itself, not hijack the built-in dialog.
			const item = li?.dataset.itemId ? this.actor.items.get(li.dataset.itemId) : null;
			if (item?.system?.moveType === "other") return null;
			return { name, guide };
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
			};
			if (rollable) {
				buttons.roll = {
					label: `Roll +${(rollable.dataset.roll ?? "").toUpperCase()}`,
					// Prompt for the modifier before posting, so cancelling is a clean abort
					// (nothing hits the chat). Title comes from the rollable's move/stat.
					callback: async html => {
						const situational = await this._maybePromptRollModifier({ rollable });
						if (situational === null) return;
						await this._postGuidedCharacterMove(name, guide, html);
						await this._stonetopCharacter.onRoll({ currentTarget: rollable }, { situational });
					},
				};
			} else if (guide.roll) {
				const fixedStat = askStat ? null : guide.roll;
				buttons.roll = {
					label: fixedStat ? `Roll +${fixedStat.toUpperCase()}` : "Roll",
					callback: async html => {
						const stat = fixedStat ?? html[0]?.querySelector('[name="guidedRollStat"]')?.value ?? "wis";
						const situational = await this._maybePromptRollModifier({ title: name });
						if (situational === null) return;
						await this._postGuidedCharacterMove(name, guide, html);
						await this._stonetopCharacter.onDirectStatRoll(stat, { moveName: name, situational });
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
				default: (rollable || guide.roll) ? "roll" : "cancel",
				render: bringDialogToFront,
			}, { width: 520, classes: ["dialog", "stonetop", "stonetop-character-move-dialog"] }).render(true);
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
				const added = await this._stonetopCharacter.addMove(el.dataset.compendiumId);
				await this._maybePromptStatIncrease(added);
				await this._maybePromptForeignMove(added);
				await this._maybeOpenPossessionChoicesForMove(el.dataset.moveName);
			} else {
				await this._stonetopCharacter.removeMove(el.dataset.ownedId);
			}
		}

		// Ticking an Improved/Superior Stat box on the moves tab has to collect the same
		// "+1 to which stat?" choice the level-up flow does — otherwise the box just reads as
		// mysteriously checked with no stat bumped. Offer the stats still below the move's cap;
		// picking one records + applies it (the "+1 STR" chip then renders). Closing without a
		// pick un-ticks the box (removeMove), since a stat move with no choice does nothing.
		// Fill in the stat for an ALREADY-OWNED Improved/Superior Stat instance that never
		// had one chosen (a character imported/created before onboarding collected it — the
		// move-card "needs your input" hand routes here). Reuses the picker but must NOT
		// delete the move on cancel: the player already owns it, they're just completing it.
		async _promptFillStatIncrease(item) {
			return this._maybePromptStatIncrease(item, { removeOnCancel: false });
		}

		async _maybePromptStatIncrease(addedItem, { removeOnCancel = true } = {}) {
			if (!addedItem) return;
			const cap = addedItem.system?.cap ?? null;
			if (cap == null) return; // not a stat-increase move
			const stats    = this.actor.system?.stats ?? {};
			const eligible = _STAT_CHOICES.filter(([key]) => (stats[key]?.value ?? 0) < cap);
			if (!eligible.length) {
				ui.notifications?.warn(`${addedItem.name}: every stat is already at the maximum (+${cap}).`);
				if (removeOnCancel) await this._stonetopCharacter.removeMove(addedItem.id);
				return;
			}
			const maxed = _STAT_CHOICES
				.filter(([key]) => (stats[key]?.value ?? 0) >= cap)
				.map(([, label]) => label);
			const note = maxed.length
				? `<p class="notes">Already at the max (+${cap}): ${maxed.join(", ")}.</p>`
				: "";
			let picked = false;
			const buttons = {};
			for (const [key, label] of eligible) {
				const value = stats[key]?.value ?? 0;
				buttons[key] = {
					label: `${label} (${sign(value)} → ${sign(value + 1)})`,
					callback: async () => {
						picked = true;
						await this._stonetopCharacter._applyStatIncreaseChoice(addedItem, key, cap);
					},
				};
			}
			new Dialog({
				title:   `${addedItem.name} — Increase a Stat`,
				content: `<p>Choose one stat to raise by +1 (max +${cap}).</p>${note}`,
				buttons,
				render:  bringDialogToFront,
				// Closed without choosing (window ✕): for a freshly-ticked box, treat it as never
				// ticked (remove); for an existing owned move being filled in, just leave it be.
				close:   async () => { if (!picked && removeOnCancel) await this._stonetopCharacter.removeMove(addedItem.id); },
			}, { width: 480, classes: ["dialog", "stonetop", "stonetop-stat-picker-dialog"] }).render(true);
		}

		// Ticking a cross-playbook move (Versatile / Worldly / Dabbler / Wild Soul / Seasoned
		// Warrior / Arts of War / Initiate of the Secret Arts) on the moves tab has to collect
		// the same "which move from another playbook?" pick the level-up flow does — otherwise
		// the box just reads as checked while granting nothing (and, for Initiate, without its
		// Sacred Pouch). Offer the qualifying foreign moves; picking one grants it (tagged
		// "Granted by …" under Learned Moves) plus any bundled possession. Closing without a
		// pick un-ticks the box; dropping the move later cascades the grant away (removeMove).
		async _maybePromptForeignMove(addedItem) {
			if (!addedItem) return;
			const crossPlaybook = addedItem.system?.crossPlaybook ?? null;
			if (!crossPlaybook) return; // not a cross-playbook move
			const grantsPossession = crossPlaybook.grantsPossession ?? null;
			const level   = this.actor.system?.attributes?.level?.value ?? 1;
			const foreign = await this._stonetopCharacter.getForeignMovesForLevelUp(crossPlaybook, level);
			// Nothing new qualifies (e.g. a repeat take that already scooped every eligible move).
			if (!foreign.length) {
				if (grantsPossession) {
					// Still worth taking for its bundled possession (Initiate's Sacred Pouch) —
					// grant that (idempotent) and keep the move.
					await this._stonetopCharacter._applyForeignMoveChoice(addedItem, null, grantsPossession);
					ui.notifications?.info(`${addedItem.name}: no Blessed move qualifies right now, but its Sacred Pouch is granted.`);
				} else {
					// Pure foreign-move grant with nothing to grant → un-tick the box.
					ui.notifications?.warn(`${addedItem.name}: no qualifying moves to learn right now.`);
					await this._stonetopCharacter.removeMove(addedItem.id);
				}
				return;
			}
			// The list arrives sorted playbook-then-name; fold it into an <optgroup> per playbook.
			let optionsHtml = "", lastPb = null;
			for (const m of foreign) {
				if (m.playbook !== lastPb) {
					if (lastPb !== null) optionsHtml += "</optgroup>";
					optionsHtml += `<optgroup label="${_esc(m.playbook)}">`;
					lastPb = m.playbook;
				}
				optionsHtml += `<option value="${_esc(m.compendiumId)}">${_esc(m.name)}</option>`;
			}
			if (lastPb !== null) optionsHtml += "</optgroup>";
			const descFor = id => {
				const m = foreign.find(x => x.compendiumId === id);
				if (!m) return "";
				const req = m.requiresLabel ? `<p class="stonetop-move-note">Requires: ${_esc(m.requiresLabel)}</p>` : "";
				return `${m.description ?? ""}${req}`;
			};
			const pouchNote = grantsPossession
				? `<p class="notes">${_esc(addedItem.name)} also grants a Sacred Pouch.</p>`
				: "";
			const content = `
				<form class="stonetop-foreign-move-picker">
					<p>Choose a move to learn from another playbook.</p>
					${pouchNote}
					<select class="stonetop-foreign-move-select">${optionsHtml}</select>
					<div class="stonetop-foreign-move-desc">${descFor(foreign[0].compendiumId)}</div>
				</form>`;
			let picked = false;
			new Dialog({
				title:   `${addedItem.name} — Learn a Move`,
				content,
				buttons: {
					learn: {
						icon:  "<i class='fas fa-book'></i>",
						label: "Learn",
						callback: async html => {
							const id = html.find(".stonetop-foreign-move-select").val();
							if (!id) return;
							picked = true;
							await this._stonetopCharacter._applyForeignMoveChoice(addedItem, id, grantsPossession);
						},
					},
					cancel: { label: "Cancel" },
				},
				default: "learn",
				render: html => {
					bringDialogToFront(html);
					// Live-preview the highlighted move's text as the selection changes.
					const sel  = html.find(".stonetop-foreign-move-select");
					const desc = html.find(".stonetop-foreign-move-desc");
					sel.on("change", () => desc.html(descFor(sel.val())));
				},
				// Closed without learning anything (Cancel / window ✕) → un-tick the box.
				close: async () => { if (!picked) await this._stonetopCharacter.removeMove(addedItem.id); },
			}, { width: 520, classes: ["dialog", "stonetop", "stonetop-foreign-move-dialog"] }).render(true);
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

		async _onBackgroundActionCheck(ev) {
			const cb = ev.currentTarget;
			const { slug } = cb.dataset;
			if (!slug) return;
			if (cb.checked) {
				// Enforce the level-gated limit directly, not just via the rendered disabled
				// attribute — otherwise rapid clicks before the re-render lands could mark
				// more than allowed. Revert the checkbox if the limit is already reached.
				const allowed = await this._stonetopCharacter.allowedMarkedActions();
				const marked  = this._stonetopCharacter.background.markedActions;
				if (!marked.includes(slug) && marked.length >= allowed) {
					cb.checked = false;
					return;
				}
				await this._stonetopCharacter.background.markAction(slug);
			} else {
				await this._stonetopCharacter.background.unmarkAction(slug);
			}
		}

		async _onPossessionCheck(ev) {
			const { slug } = ev.currentTarget.dataset;
			if (ev.currentTarget.checked) {
				await this._stonetopCharacter.selectPossession(slug);
			} else {
				await this._stonetopCharacter.deselectPossession(slug);
			}
		}

		async _onRemoveCustomPossession(ev) {
			await this._stonetopCharacter.removeCustomPossession(ev.currentTarget.dataset.slug);
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

		async _onInventoryItemCheck(ev) {
			// Have What You Need: marking an item spends marks from the undefined pool
			// (its weight, or 1 for a small item); any shortfall adds to your load as
			// loot. Un-marking returns the marks. The derived load updates on re-render.
			const el = ev.currentTarget;
			if (!el.dataset.slug) return; // ignore the slug-less undefined-pool diamonds
			// A multi-weight item renders one diamond per point of weight, all bound to the
			// single carried/not-carried state. The browser only toggles the clicked diamond,
			// so mirror its state onto the sibling diamonds and the wrapper now — otherwise the
			// rest of the track visibly lags until the async re-render below lands.
			const group = el.closest(".stonetop-inv-diamonds");
			if (group) for (const box of group.querySelectorAll(".stonetop-inv-diamond")) box.checked = el.checked;
			el.closest(".stonetop-inv-item")?.classList.toggle("is-checked", el.checked);
			// Small items in the columns sit inside `.stonetop-inventory-small`; the same
			// items rendered inside a possession card carry `data-small` instead (they're
			// outside that column but must still draw from the small pool).
			const smallColumn = el.closest(".stonetop-inventory-small");
			const small = el.dataset.small === "true" || !!smallColumn;
			if (small && el.checked && smallColumn) this._warnIfOverSmallAllotment(smallColumn);
			await this._stonetopCharacter.toggleCarriedItem(el.dataset.slug, el.checked, {
				small,
				weight: Number(el.dataset.weight ?? 1),
			});
			this.render(false);
		}

		// Small items don't count toward load and have no hard limit (Book I p.84/326),
		// so marking past the 4+Prosperity Outfit allotment is allowed — but flag it, so
		// the player remembers to expend supplies or square it with the GM. Only warns
		// when a steading is linked (otherwise Prosperity, and the allotment, is unknown).
		_warnIfOverSmallAllotment(smallColumn) {
			const raw = smallColumn.dataset.smallAllotment;
			if (raw == null || raw === "") return;
			const allotment = Number(raw);
			if (!Number.isFinite(allotment)) return;
			// The clicked box is already checked, so the live count includes it.
			const checkedSmall = smallColumn.querySelectorAll(
				".stonetop-inventory-item-check[data-slug]:checked").length;
			if (checkedSmall > allotment) {
				ui.notifications.warn(game.i18n.format("stonetop.inventory.smallOverAllotment", { limit: allotment }));
			}
		}

		async _onInventoryResource(ev) {
			const { slug, index } = ev.currentTarget.dataset;
			const isChecked = ev.currentTarget.classList.contains("is-checked");
			const newVal = isChecked ? Number(index) : Number(index) + 1;
			await this._stonetopCharacter.setInventoryResource(slug, newVal);
			this.render(false);
		}

		async _onAddInventoryItem(ev) {
			const column = ev.currentTarget.dataset.column === "small" ? "small" : "regular";
			new AddInventoryItemDialog(characterInventoryItemSaver(this._stonetopCharacter), {
				column,
				onSaved: () => this.render(false),
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
				render: bringDialogToFront,
				options: { classes: ["dialog", "stonetop"] },
			});
		}

		async _onInventoryPoolEdit(ev) {
			// The undefined ◇/□ pools are freely editable tracks: clicking a diamond
			// sets the reserve count (click a filled one to clear back to it).
			const el = ev.currentTarget;
			const index    = Number(el.dataset.index);
			const isSmall  = el.classList.contains("stonetop-small-pool-display");
			const track    = el.closest(".stonetop-supplies-pool-diamonds");
			// Cap = room left under the load limit after the items already marked. The track
			// always shows the full capacity, so it includes empty slots past the cap; a
			// click that would reserve beyond it is clamped to the cap. filledBefore = the
			// reserve already showing (the .is-checked diamonds — that class is render-time,
			// so the just-clicked box isn't counted yet), which tells us if there was room.
			const cap = Number(track?.dataset.poolCap ?? Infinity);
			const filledBefore = track?.querySelectorAll(".is-checked").length ?? 0;
			let newCount = el.checked ? index + 1 : index;
			if (el.checked && newCount > cap) {
				newCount = cap;
				// Only warn when the reserve was already maxed (truly no room); otherwise
				// the click just filled the remaining room up to the cap.
				if (filledBefore >= cap) {
					ui.notifications.warn(game.i18n.localize(
						isSmall ? "stonetop.inventory.smallPoolAtLimit" : "stonetop.inventory.regularPoolAtLimit"));
				}
			}
			if (isSmall) {
				await this._stonetopCharacter.setInventorySmallPool(newCount);
			} else {
				await this._stonetopCharacter.setInventoryRegularPool(newCount);
			}
			this.render(false);
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
				(addedMoveName) => {
					this.render(false);
					// Levelling into Big Magic frees an additional remarkable trait — open
					// the sacred-pouch editor so the player picks it right away.
					if (addedMoveName) this._maybeOpenPossessionChoicesForMove(addedMoveName);
				},
			).render(true);
		}

		async _onDeathsDoorOpen() {
			if ((this.actor.system?.attributes?.hp?.value ?? 1) > 0) return;
			new DeathsDoorDialog(
				this._stonetopCharacter,
				() => this.render(false),
			).render(true);
		}

		// Open the Create-a-Follower walkthrough (Book I, NPCs & Followers, p.474).
		// On finish it hands back buildCustomFollower() data, which we persist.
		async _onCreateFollowerOpen() {
			if (!this.isEditable) return;
			new CreateFollowerDialog(
				this.actor,
				(data) => this._applyCustomFollower(data),
				// Recruit a villager: offer the linked steading's residents as name
				// suggestions on the walkthrough's first step (NPCs & Followers p.474).
				{ residentNames: this._steadingResidentNames() },
			).render(true);
		}

		// Names of the linked steading's residents (+ neighbors), for the Create-a-Follower
		// name datalist. Best-effort — a missing/unlinked steading just yields no hints.
		_steadingResidentNames() {
			try {
				const steading = this._stonetopCharacter?.getSteadingActor?.();
				if (!steading) return [];
				const rows = [
					...(steading.getFlag("stonetop_pwd", "residents") ?? []),
					...(steading.getFlag("stonetop_pwd", "neighbors") ?? []),
				];
				return [...new Set(rows.map(r => String(r?.name ?? "").trim()).filter(Boolean))];
			} catch { return []; }
		}

		// Offer to convert a dropped monster into a follower (keep its stats, add
		// tags, choose a cost — p.475). Cancelling the modal does nothing.
		_onMonsterDropConvert(monsterDoc) {
			if (!this.isEditable || !monsterDoc) return;
			new MonsterToFollowerDialog(
				this.actor,
				monsterDoc,
				(data) => this._applyCustomFollower(data),
			).render(true);
		}

		// Toggle the viewing user's "show both sides" preference for one arcanum. Kept as a
		// User flag (not on the actor) so the GM's spread choices stay independent of the
		// owning player's — each client renders its own. Keyed by actor id, since one user
		// may view several character sheets. Writing only this actor's key lets Foundry's
		// mergeObject preserve preferences for the user's other sheets.
		async _toggleArcanumShowBoth(slug, show) {
			const set = new Set((game.user.getFlag("stonetop_pwd", "arcanaShowBoth") ?? {})[this.actor.id] ?? []);
			if (show) set.add(slug); else set.delete(slug);
			await game.user.setFlag("stonetop_pwd", "arcanaShowBoth", { [this.actor.id]: [...set] });
			// Collapsing a spread ("Show front only") returns to the front, so clear any lingering
			// back-only flip on this card — otherwise it would land on the back, belying the label.
			if (!show) await this._toggleArcanumShowBack(slug, false);
		}

		// Toggle the viewing user's single-side "show back" preference for one arcanum. Stored
		// exactly like show-both (a per-user, per-actor User flag) so each client renders its own
		// flip state and the GM's choices stay independent of the owning player's.
		async _toggleArcanumShowBack(slug, show) {
			const set = new Set((game.user.getFlag("stonetop_pwd", "arcanaShowBack") ?? {})[this.actor.id] ?? []);
			if (show) set.add(slug); else set.delete(slug);
			await game.user.setFlag("stonetop_pwd", "arcanaShowBack", { [this.actor.id]: [...set] });
		}

		// Drop a removed arcanum's slug from this user's per-actor show-both / show-back view
		// preferences, so a re-acquired card doesn't re-open as a spread the user never requested
		// and the flag arrays don't accumulate dead slugs. Per-user by nature — only the acting
		// user's prefs are reachable here (others prune their own on their next removal/toggle).
		async _pruneArcanumUserPrefs(slug) {
			// The two prefs are independent flags, so prune them concurrently.
			await Promise.all(["arcanaShowBoth", "arcanaShowBack"].map(flag => {
				const all = game.user.getFlag("stonetop_pwd", flag);
				const forActor = all?.[this.actor.id];
				if (!Array.isArray(forActor) || !forActor.includes(slug)) return null;
				return game.user.setFlag("stonetop_pwd", flag, { ...all, [this.actor.id]: forActor.filter(s => s !== slug) });
			}));
		}

		// Manifest an arcanum's bound creature(s) as followers (the arcana whose reverse
		// says "Treat it/them as a follower" — see ARCANA_SUMMONS). Triggered by the
		// "Add as follower" button on the arcanum's back side. Confirm first (it adds
		// cards to the Followers tab), then add any not already present — matched by their
		// stable sourceUuid marker so re-summoning never piles up duplicate cards.
		async _onArcanaSummon(slug) {
			if (!this.isEditable) return;
			const arcanum = await this._stonetopCharacter.getArcanum(slug);
			// `viaCallUp` followers (the Ring of Daagon's Servants) aren't manifested by this
			// button — they're rolled through the Call Up the Deep Ones dialog. The Ring's
			// button adds just the Ring itself.
			const followers = arcanaSummonFollowers(arcanum)?.filter(f => !f.viaCallUp);
			if (!followers?.length) return;
			const names = joinNames(followers.map(f => f.name));
			const plural = followers.length > 1;
			const confirmed = await Dialog.confirm({
				title:      "Manifest follower",
				content:    `<p>Manifest <strong>${escHtml(names)}</strong> and add ${plural ? "them" : "it"} to your Followers tab?</p>`,
				yes:        () => true,
				no:         () => false,
				defaultYes: false,
				render:     bringDialogToFront,
				options:    { classes: ["dialog", "stonetop"] },
			});
			if (!confirmed) return;

			const existing = this.actor.getFlag("stonetop_pwd", "customFollowers") ?? {};
			const present  = new Set(Object.values(existing).map(f => f?.sourceUuid).filter(Boolean));
			const update   = {};
			let order = this._nextFollowerOrder();
			for (const input of followers) {
				// `repeatable` followers (e.g. the Ring of Daagon's Servants) can be
				// summoned again and again, so they're never deduped by sourceUuid.
				if (!input.repeatable && present.has(input.sourceUuid)) continue;
				const id = foundry.utils.randomID(16);
				update[`flags.stonetop_pwd.customFollowers.${id}`] = { ...buildCustomFollower(input), order: order++ };
			}
			if (Object.keys(update).length) await this.actor.update(update);
			this.render(false);
		}

		// ── Ring of Daagon: Call Up the Deep Ones / Send Them Back ───────────────────
		// The Ring's Servants aren't a fixed summon — each Call Up rolls five d4s and
		// shapes a fresh batch (see servant-of-daagon.js / CallUpDeepOnesDialog). The
		// batch shares the Ring's Loyalty pool, so both live as linked custom followers.

		// The Ring-of-Daagon follower on this sheet (or a null-ish stub), for the shared
		// Loyalty pool that Call Up spends and a Servant's Spend button draws on.
		_ringFollowerEntry() {
			return findRingFollower(this.actor.getFlag("stonetop_pwd", "customFollowers") ?? {});
		}

		// Open the Call Up the Deep Ones roller. Requires the Ring itself to be a follower
		// (its mysteries unlocked) — the Servants share its Loyalty pool.
		async _onCallUpDeepOnes() {
			if (!this.isEditable) return;
			const ring = this._ringFollowerEntry();
			if (!ring.hasRing) {
				ui.notifications?.warn?.("Add the Ring of Daagon as a follower first, then Call Up the Deep Ones.");
				return;
			}
			new CallUpDeepOnesDialog(this.actor, ring, ({ input, cost }) => this._applyCallUp(input, cost)).render(true);
		}

		// Manifest a rolled Servant batch as a fresh custom follower and pay Call Up's cost
		// (spend 1 of the Ring's Loyalty, or mark a consequence). Re-reads the Ring live —
		// the roller is non-modal, so its Loyalty may have moved since it opened.
		async _applyCallUp(input, cost) {
			const ring   = this._ringFollowerEntry();
			const id     = foundry.utils.randomID(16);
			const update = {
				[`flags.stonetop_pwd.customFollowers.${id}`]: { ...buildServantFollower(input), order: this._nextFollowerOrder() },
			};
			let costLine;
			if (cost?.kind === "loyalty" && ring.id && ring.loyalty > 0) {
				update[`flags.stonetop_pwd.customFollowers.${ring.id}.loyalty`] = ring.loyalty - 1;
				costLine = `<p>You spend <strong>1 Loyalty</strong> from ${escHtml(ring.name)} (now ${ring.loyalty - 1}).</p>`;
			} else if (cost?.kind === "loyalty") {
				costLine = `<p>${escHtml(ring.name)} holds no Loyalty, so you <strong>mark a consequence</strong> to call them up.</p>`;
			} else {
				costLine = `<p>You <strong>mark a consequence</strong> to call them up.</p>`;
			}
			await this.actor.update(update, { stonetopMove: "Call Up the Deep Ones" });

			const diceStr = Array.isArray(cost?.dice) && cost.dice.length
				? ` <span class="stonetop-callup-dice">(5d4: ${cost.dice.join(", ")})</span>` : "";
			const tagLine = [...input.tags, ...(input.exceptional ? ["exceptional"] : [])].join(", ");
			const body =
				`<p>From heavy fog and deep water you call up <strong>${escHtml(input.name)}</strong>${diceStr} &mdash; <em>${escHtml(tagLine)}</em>.</p>`
				+ `<p>HP ${input.hp}${input.isGroup ? ` each &middot; ${input.size} strong` : ""}, Armor ${input.armor}, damage ${escHtml(input.damage)}.</p>`
				+ (input.moves ? `<p><strong>Moves:</strong> ${escHtml(input.moves.replace(/\n/g, "; "))}</p>` : "")
				+ costLine;
			await this._postMoveCard("Call Up the Deep Ones", body);
			this.render(false);
		}

		// Send Them Back (roll +CHA): 10+ they go now; 7-9 they go but do some harm; 6-
		// they resist — spend their (shared) Loyalty / mark a consequence, or they break free.
		async _onSendServantsBack(slug, name) {
			if (!this.isEditable || !slug) return;
			const who = name
				|| this.actor.getFlag("stonetop_pwd", `customFollowers.${slug}.name`)
				|| "the servants of Daagon";
			const roll = await rollStat("cha", this.actor, {
				moveName:        "Send Them Back",
				moveDescription: `<p>When you <strong><em>send them back whence they came</em></strong>, roll +CHA.</p>`,
				moveResults: {
					success: { value: "They go, now." },
					partial: { value: "They go, but take their time and likely do some harm on the way out." },
					failure: { value: "Spend their Loyalty or mark a consequence and they'll eventually go &mdash; otherwise, this batch breaks free of your control." },
				},
			});
			const total = Number(roll?.total) || 0;
			if (total >= 10) return this._confirmServantDeparture(slug, who, "They return to the deep at once.");
			if (total >= 7)  return this._confirmServantDeparture(slug, who, "They go, but take their time and likely do some harm on the way out.");
			return this._onServantsResist(slug, who);
		}

		// Offer to clear a departing batch from the Followers tab.
		_confirmServantDeparture(slug, who, note) {
			Dialog.confirm({
				title:      "Send them back",
				content:    `<p>${note}</p><p>Remove <strong>${escHtml(who)}</strong> from your Followers?</p>`,
				yes:        () => this._removeCustomFollower(slug),
				no:         () => {},
				defaultYes: true,
				render:     bringDialogToFront,
				options:    { classes: ["dialog", "stonetop"] },
			});
		}

		_removeCustomFollower(slug) {
			const [key, val] = deletionEntry(`flags.${STONETOP_SCOPE}.customFollowers.${slug}`);
			return this.actor.update({ [key]: val }).then(() => this.render(false));
		}

		/** Post a move-result card to chat, spoken by this actor. Returns the create promise. */
		_postMoveCard(title, body) {
			return ChatMessage.create({
				content: moveChatCard(title, body),
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			});
		}

		// The 6- branch: pay to make them leave (spend the Ring's shared Loyalty, or mark a
		// consequence) or let them break free of your control.
		_onServantsResist(slug, who) {
			const ring       = this._ringFollowerEntry();
			const canLoyalty = ring.hasRing && ring.loyalty > 0;
			const buttons    = {};
			if (canLoyalty) buttons.loyalty = {
				icon:     '<i class="fas fa-hand-holding-heart"></i>',
				label:    `Spend 1 Loyalty (${ring.loyalty})`,
				callback: () => this._payServantExit(slug, who, "loyalty"),
			};
			buttons.consequence = {
				icon:     '<i class="fas fa-triangle-exclamation"></i>',
				label:    "Mark a consequence",
				callback: () => this._payServantExit(slug, who, "consequence"),
			};
			buttons.free = {
				icon:     '<i class="fas fa-skull-crossbones"></i>',
				label:    "Let them break free",
				callback: () => this._servantsBreakLoose(slug, who),
			};
			new Dialog({
				title:   "They won't go quietly",
				content: `<p><strong>${escHtml(who)}</strong> resist. Spend their Loyalty or mark a consequence and they'll eventually go &mdash; otherwise they break free of your control.</p>`,
				buttons,
				default: canLoyalty ? "loyalty" : "consequence",
				render:  bringDialogToFront,
			}, { classes: ["dialog", "stonetop"] }).render(true);
		}

		async _payServantExit(slug, who, kind) {
			const ring = this._ringFollowerEntry();
			let line;
			if (kind === "loyalty" && ring.id && ring.loyalty > 0) {
				await this.actor.setFlag("stonetop_pwd", `customFollowers.${ring.id}.loyalty`, ring.loyalty - 1);
				line = `<p>You spend <strong>1 Loyalty</strong> from ${escHtml(ring.name)} (now ${ring.loyalty - 1}). <strong>${escHtml(who)}</strong> will eventually go.</p>`;
			} else {
				line = `<p>You <strong>mark a consequence</strong>. <strong>${escHtml(who)}</strong> will eventually go.</p>`;
			}
			await this._postMoveCard("Send Them Back", line);
			this._confirmServantDeparture(slug, who, "They'll eventually go.");
		}

		async _servantsBreakLoose(slug, who) {
			// No longer yours to command. Flag the batch (the card shows a "broke free" badge)
			// and note it; it stays on the tab until removed.
			await this.actor.setFlag("stonetop_pwd", `customFollowers.${slug}.brokenFree`, true);
			await this._postMoveCard("Send Them Back",
				`<p><strong>${escHtml(who)}</strong> break free of your control. They are no longer yours to command.</p>`);
			this.render(false);
		}

		// Materialize a playbook possession-follower (the Would-be Hero's dog, the
		// Ranger's Hounds, the Blessed's Mastiffs) as an editable follower card. Mirrors
		// the arcana "Add as follower" flow: build from the catalog and dedupe by
		// sourceUuid so it can't be added twice. Groups (Hounds/Mastiffs) land as a group.
		async _onAddPossessionFollower(slug) {
			if (!this.isEditable || !slug) return;
			const { possessionFollower } = await import("../../data/possession-followers.js");
			const input = possessionFollower(slug);
			if (!input) return;
			const existing = this.actor.getFlag("stonetop_pwd", "customFollowers") ?? {};
			if (Object.values(existing).some(f => f?.sourceUuid === input.sourceUuid)) return;
			const id = foundry.utils.randomID(16);
			await this.actor.update({
				[`flags.stonetop_pwd.customFollowers.${id}`]: { ...buildCustomFollower(input), order: this._nextFollowerOrder() },
			});
			this.render(false);
		}

		// Open a blank homebrew arcanum (minor or major) in the editor as a draft. It's added
		// to this character only when the author clicks Save & Done (see _createAndAddArcanum).
		async _onArcanaCreate(major = false) {
			if (!this.isEditable || !canCreateArcana()) return;
			await this._createAndAddArcanum({ name: major ? "New Major Arcanum" : "New Minor Arcanum", major });
		}

		// Create a homebrew arcanum world Item (optionally pre-filled) and open its editor as a
		// DRAFT — it is NOT added to this character until the author clicks Save & Done in the
		// editor, at which point `attach` runs: adds it by slug, marks it identified (the author
		// made it — no mystery to solve), and re-renders so the arcana tab shows the finished
		// card (resolved via the world-item path of FoundryArcanaRepository). Closing the editor
		// without saving offers to discard the draft. Returns the created Item.
		async _createAndAddArcanum({ name, major = false, front } = {}) {
			const attach = async (item) => {
				const slug = item?.flags?.[ITEM_FLAG_SCOPE]?.slug;
				if (!slug) return;
				await this._stonetopCharacter.addArcanum(slug);
				await this._stonetopCharacter.identifyArcanum(slug);
				if (this.rendered) this.render(false);
			};
			return createArcanumItem({ name, major, front, onSave: attach });
		}

		// Persist a built custom follower under a fresh id and re-render. `data` is
		// the buildCustomFollower() shape; we stamp a creation-order key for stable
		// ordering on the Followers tab.
		async _applyCustomFollower(data) {
			if (!data) return;
			const id = foundry.utils.randomID(16);
			await this.actor.update({
				[`flags.stonetop_pwd.customFollowers.${id}`]: { ...data, order: this._nextFollowerOrder() },
			});
			this.render(false);
		}

		// Next creation-order stamp for a custom follower: one past the largest existing
		// `order`, so two followers added in the same millisecond still sort by insertion
		// (Date.now() alone can tie). Date.now() is the floor for the first follower.
		_nextFollowerOrder() {
			return nextFollowerOrder(this.actor.getFlag("stonetop_pwd", "customFollowers") ?? {});
		}

		// Apply the fate chosen for a follower that hit 0 HP (FollowerFateDialog).
		// "roll" is the Ranger's animal-companion move Loyal to the End (p.143): roll +0
		// (advantage if it holds Loyalty) and the result card carries the 10+/7-9/6-
		// outcome. Every other follower's "action" just posts a note recording the GM's
		// call.
		async _resolveFollowerFate(action, { name, loyalty, follower, slug } = {}) {
			const who = escHtml(name || "Your follower");
			if (action === "roll") {
				await rollStat("", this.actor, {
					statValue:   0,
					moveName:    "Loyal to the End",
					rollMode:    loyalty > 0 ? "adv" : "normal",
					noXpOnMiss:  true,
					moveDescription: `<p>When your <strong><em>companion is at 0 HP</em></strong>, roll +0, with advantage if it holds Loyalty.</p>`,
					moveResults: {
						success: { label: "10+", value: `<strong>${who}</strong> will be fine once it regains any HP.` },
						partial: { label: "7–9", value: `<strong>${who}</strong> survives but takes the <em>injured</em> tag.` },
						failure: { label: "6–", value: `<strong>${who}</strong> is injured and will die soon unless someone saves it.` },
					},
				});
				this.render(false);
				return;
			}
			let body;
			if (action === "deathsdoor") {
				body = `<p><strong>${who}</strong> triggers <strong>Death's Door</strong> &mdash; ${escHtml(this.actor.name)} rolls for them.</p>`;
			} else if (action === "dying") {
				body = `<p><strong>${who}</strong> is dying &mdash; out of the action; they'll die or hit Death's Door soon if no one intervenes.</p>`;
			} else if (action === "dead") {
				body = `<p><strong>${who}</strong> is dead.</p>`;
				// Mark a custom follower fallen so its card stays on the sheet as a record —
				// greyed out with a Remove button — rather than either vanishing or lingering
				// as if nothing happened. Reviving them (HP back above 0) clears the mark. The
				// built-in followers (animal companion / initiate / beast) aren't removable and
				// have no per-record store, so they keep the chat-card record only.
				if (follower === "custom" && slug) {
					await this.actor.update({ [`flags.stonetop_pwd.customFollowers.${slug}.dead`]: true });
				}
			} else {
				return;
			}
			await this._postMoveCard("Follower Down", body);
			this.render(false);
		}

		// Write a follower's current HP to `val`. The per-slug / per-index HP stores are
		// object-valued flags; write the single changed key with a dotted path (Foundry
		// merges it) instead of cloning the whole map.
		async _setFollowerHp(follower, slug, index, val) {
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
			} else if (follower === "custom") {
				await this.actor.update({ [`flags.stonetop_pwd.customFollowers.${slug}.hpCurrent`]: val });
			} else if (follower === "custom-group") {
				await this.actor.update({ [`flags.stonetop_pwd.customFollowers.${slug}.groupHp`]: val });
			} else if (follower === "custom-member") {
				const arr = [...(this.actor.getFlag("stonetop_pwd", `customFollowers.${slug}.memberHp`) ?? [])];
				arr[Number(index)] = val;
				await this.actor.update({ [`flags.stonetop_pwd.customFollowers.${slug}.memberHp`]: arr });
			}
		}

		// Have What They Need (p.472): a follower produces a needed item. Prompt for it
		// and append it (checked) to their free-text gear checklist.
		_onHaveWhatTheyNeed(ftype, slug, name) {
			const base = _followerDetailBase(ftype, slug);
			const gearPath = base ? `${base}.gear` : null;
			if (!gearPath) return;
			new Dialog({
				title:   `${name || "Follower"} — Have What They Need`,
				content: `<form class="stonetop-spend-form"><p>What does <strong>${escHtml(name || "they")}</strong> produce?</p>`
					+ `<input type="text" class="stonetop-hwtn-item stonetop-cf-input" placeholder="an item, some supplies…" style="width:100%"></form>`,
				buttons: {
					add: { icon: '<i class="fas fa-sack"></i>', label: "Add to their gear",
						callback: async html => {
							const item = String(html?.[0]?.querySelector(".stonetop-hwtn-item")?.value ?? "").trim();
							if (!item) return;
							const cur = foundry.utils.deepClone(this.actor.getFlag("stonetop_pwd", gearPath) ?? []);
							cur.push({ label: item, checked: true });
							await this.actor.setFlag("stonetop_pwd", gearPath, cur);
							await this._postMoveCard("Have What They Need",
								`<p><strong>${escHtml(name || "Your follower")}</strong> produces <em>${escHtml(item)}</em> — added to their gear.</p>`);
							this.render(false);
						} },
					cancel: { label: "Cancel" },
				},
				default: "add",
				render:  bringDialogToFront,
			}, { classes: ["dialog", "stonetop"] }).render(true);
		}

		// Outfit the crew (p.472): the group Outfits with the same gear, restocking
		// every member's Supplies to full.
		async _onOutfitCrew() {
			// The Supplies-per-set count is "4 + Prosperity" — a synchronous read; no need
			// to build the whole sheet snapshot just to pull one scalar off it.
			const pipsPerSet = this._stonetopCharacter.getSmallItemLimit() ?? 5;
			await this.actor.setFlag("stonetop_pwd", "crew.supplies", Array(6).fill(pipsPerSet));
			await this._postMoveCard("Outfit",
				`<p>The crew Outfits — every member's Supplies restocked to full (${pipsPerSet} uses each).</p>`);
			this.render(false);
		}


		// Whether a follower bears a shield (+1 Readiness on a 7+ Defend). Gear-based types
		// match a "shield" gear label; the crew reads the shield pip of its structured kit.
		_followerHasShield(ftype, slug) {
			if (ftype === "crew") {
				const gearFlags = this.actor.getFlag("stonetop_pwd", "crew.gear") ?? {};
				// A number is filled load pips (equipped once ≥ its weight, default 1); a
				// non-number flag is already the "fully equipped" boolean.
				return typeof gearFlags.shield === "number" ? gearFlags.shield >= 1 : !!gearFlags.shield;
			}
			const detail = this.actor.getFlag("stonetop_pwd", _followerDetailBase(ftype, slug));
			return _followerBearsShield(detail?.gear);
		}

		// When a follower is Ordered to Defend and rolls 7+, they hold Readiness (p.469):
		// 1 on a 7–9, 3 on a 10+ (a shield adds +1 — the player can click one more). We
		// set the base hold automatically off the Order Followers result and post a note.
		async _maybeHoldReadinessOnDefend(ftype, slug, result, roll) {
			const total = Number(roll?.total);
			if (!Number.isFinite(total) || total < 7) return;
			// The dialog reports the chosen move + follower name structurally, so we don't
			// have to sniff "defend" out of (or split ":" from) the flattened moveName.
			if (result?.moveKey !== "defend") return;
			const path = _followerReadinessPath(ftype, slug ?? "");
			if (!path) return;
			// Base hold via the shared, unit-tested tier→hold table (defend-readiness.js), so PC
			// and follower Defend holds can't drift. The follower path leaves the shield's +1 as a
			// manual pip (advertised in shieldNote below), so we don't pass hasShield; the total ≥ 7
			// guard above guarantees a success/partial tier here.
			const held = defendReadinessHold(classifyResult(total).key);
			// Never REDUCE an already-held pool: a follower who held 3 (or clicked a 4th pip
			// for their shield) and then Defends again at 7–9 keeps the higher pool rather
			// than being silently knocked down to 1.
			const existing = Math.max(0, Number(this.actor.getFlag("stonetop_pwd", path)) || 0);
			const next = Math.max(existing, held);
			// Only advertise the shield's +1 when the follower actually bears one, and only
			// when this Defend set the (fresh) base hold — not when we kept a higher pool.
			const bearsShield = this._followerHasShield(ftype, slug ?? "");
			const shieldNote = (bearsShield && next === held) ? ` (${held + 1} with their shield)` : "";
			if (next !== existing) {
				await this.actor.update({ [`flags.stonetop_pwd.${path}`]: next }, { stonetopMove: "Defend" });
			}
			const who = result?.followerName || "Your follower";
			await this._postMoveCard("Defend — Readiness held",
				`<p><strong>${escHtml(who)}</strong> holds <strong>${next}</strong> Readiness${shieldNote}.</p>`
				+ `<p>Spend it to suffer the damage/effects of an attack for a ward, or to draw all attention to themselves.</p>`);
			if (next !== existing) this.render(false);
		}

		// Radio-option markup shared by the Spend Loyalty / Spend Readiness choosers:
		// one <label> per reason, the first pre-checked, keyed by the given input name.
		_spendRadioOptions(name, reasons) {
			return reasons.map((r, i) =>
				`<label class="stonetop-spend-choice"><input type="radio" name="${name}" value="${r.key}"${i === 0 ? " checked" : ""}> <span>${escHtml(r.label)}</span></label>`
			).join("");
		}

		// Spend 1 Loyalty (Strengthen Your Bond, p.464): a follower overcomes fear,
		// resists their instinct, or does something they'd rather not. Decrements the
		// Loyalty track by one (attributed so the ledger reads "via Spend Loyalty") and
		// posts a chat note naming what it bought.
		_onSpendLoyalty(ftype, slug, name) {
			const path = _followerLoyaltyPath(ftype, slug);
			if (!path) return;
			const current = Math.max(0, Number(this.actor.getFlag("stonetop_pwd", path)) || 0);
			if (current <= 0) { ui.notifications?.warn?.(`${name || "This follower"} holds no Loyalty to spend.`); return; }
			const reasons = [
				{ key: "fear",      label: "Overcome their fear to do as you say" },
				{ key: "instinct",  label: "Resist acting on their instinct / tags / traits" },
				{ key: "unwilling", label: "Do something they don't want to do" },
			];
			const opts = this._spendRadioOptions("spend-loyalty", reasons);
			new Dialog({
				title:   `Spend ${name || "follower"}'s Loyalty`,
				content: `<form class="stonetop-spend-form"><p>Spend <strong>1 Loyalty</strong> (${current} held) to have <strong>${escHtml(name || "them")}</strong>:</p>${opts}</form>`,
				buttons: {
					spend:  { icon: '<i class="fas fa-hand-holding-heart"></i>', label: "Spend 1 Loyalty",
						callback: html => this._applySpendLoyalty(path, name, reasons, html) },
					cancel: { label: "Cancel" },
				},
				default: "spend",
				render:  bringDialogToFront,
			}, { classes: ["dialog", "stonetop"] }).render(true);
		}

		async _applySpendLoyalty(path, name, reasons, html) {
			const key    = html?.[0]?.querySelector('input[name="spend-loyalty"]:checked')?.value ?? reasons[0].key;
			const reason = reasons.find(r => r.key === key)?.label ?? "";
			// Decrement the LIVE value, not the count captured when this (non-modal) dialog
			// opened — the track may have changed since, and writing captured−1 would clobber it.
			const live = Math.max(0, Number(this.actor.getFlag("stonetop_pwd", path)) || 0);
			if (live <= 0) { ui.notifications?.warn?.(`${name || "This follower"} no longer holds any Loyalty to spend.`); return; }
			await this.actor.update({ [`flags.stonetop_pwd.${path}`]: live - 1 }, { stonetopMove: "Spend Loyalty" });
			await this._postMoveCard("Spend Loyalty",
				`<p>You spend <strong>1 Loyalty</strong> to have <strong>${escHtml(name || "them")}</strong> <em>${escHtml(reason.toLowerCase())}</em>.</p>`
				+ `<p>They now hold <strong>${live - 1}</strong> Loyalty.</p>`);
			this.render(false);
		}

		// Spend 1 Readiness (Followers in Fights, p.469/473): a follower holding
		// Readiness suffers an attack for a ward or draws all attention. If they wouldn't
		// want to, the player must also spend 1 Loyalty (p.547) — surfaced as a checkbox.
		_onSpendReadiness(ftype, slug, name) {
			const rPath = _followerReadinessPath(ftype, slug);
			if (!rPath) return;
			const readiness = Math.max(0, Number(this.actor.getFlag("stonetop_pwd", rPath)) || 0);
			if (readiness <= 0) { ui.notifications?.warn?.(`${name || "This follower"} holds no Readiness to spend.`); return; }
			const lPath   = _followerLoyaltyPath(ftype, slug);
			const loyalty = Math.max(0, Number(this.actor.getFlag("stonetop_pwd", lPath)) || 0);
			const reasons = [
				{ key: "suffer",    label: "Suffer the damage/effects of an attack for a ward" },
				{ key: "attention", label: "Draw all attention from a ward to themselves" },
			];
			const opts = this._spendRadioOptions("spend-readiness", reasons);
			const unwilling = loyalty > 0
				? `<label class="stonetop-spend-choice stonetop-spend-choice--unwilling"><input type="checkbox" class="stonetop-spend-unwilling"> <span>…and they wouldn't want to (also spend <strong>1 Loyalty</strong>)</span></label>`
				: `<p class="stonetop-spend-note"><em>If they wouldn't want to, you'd also spend 1 Loyalty — but they hold none.</em></p>`;
			new Dialog({
				title:   `Spend ${name || "follower"}'s Readiness`,
				content: `<form class="stonetop-spend-form"><p>Spend <strong>1 Readiness</strong> (${readiness} held) to have <strong>${escHtml(name || "them")}</strong>:</p>${opts}${unwilling}</form>`,
				buttons: {
					spend:  { icon: '<i class="fas fa-shield"></i>', label: "Spend Readiness",
						callback: html => this._applySpendReadiness({ rPath, readiness, lPath, loyalty, name, reasons, html }) },
					cancel: { label: "Cancel" },
				},
				default: "spend",
				render:  bringDialogToFront,
			}, { classes: ["dialog", "stonetop"] }).render(true);
		}

		async _applySpendReadiness({ rPath, lPath, name, reasons, html }) {
			const key       = html?.[0]?.querySelector('input[name="spend-readiness"]:checked')?.value ?? reasons[0].key;
			const reason    = reasons.find(r => r.key === key)?.label ?? "";
			// Decrement the LIVE tracks, not the counts captured when this (non-modal) dialog
			// opened — either may have changed since, and writing captured−1 would clobber it.
			const liveReadiness = Math.max(0, Number(this.actor.getFlag("stonetop_pwd", rPath)) || 0);
			if (liveReadiness <= 0) { ui.notifications?.warn?.(`${name || "This follower"} no longer holds any Readiness to spend.`); return; }
			const wantsUnwilling = !!html?.[0]?.querySelector(".stonetop-spend-unwilling")?.checked;
			const liveLoyalty = lPath ? Math.max(0, Number(this.actor.getFlag("stonetop_pwd", lPath)) || 0) : 0;
			// Only charge the "wouldn't want to" Loyalty if they still hold some to pay it.
			const unwilling = wantsUnwilling && !!lPath && liveLoyalty > 0;
			const update = { [`flags.stonetop_pwd.${rPath}`]: liveReadiness - 1 };
			if (unwilling) update[`flags.stonetop_pwd.${lPath}`] = liveLoyalty - 1;
			await this.actor.update(update, { stonetopMove: "Spend Readiness" });
			const costLine = unwilling
				? `<p>They didn't want to, so you also spent <strong>1 Loyalty</strong> (${liveLoyalty - 1} left).</p>`
				: wantsUnwilling
					? `<p>They didn't want to, but hold no Loyalty left to spend.</p>`
					: "";
			await this._postMoveCard("Spend Readiness",
				`<p>You spend <strong>1 Readiness</strong> to have <strong>${escHtml(name || "them")}</strong> <em>${escHtml(reason.toLowerCase())}</em>.</p>`
				+ `<p>They now hold <strong>${liveReadiness - 1}</strong> Readiness.</p>${costLine}`);
			this.render(false);
		}

		// Hand a custom follower off to another PC (NPCs & Followers p.480: a follower
		// can shift from one PC's lead to another's). Only custom followers transfer —
		// the built-in ones are tied to a playbook / background / inventory item.
		_onHandOffFollower(slug, name) {
			const targets = game.actors.filter(a => a.type === "character" && a.id !== this.actor.id && a.isOwner);
			if (!targets.length) {
				ui.notifications?.warn?.("No other character is available to take this follower.");
				return;
			}
			const opts = targets.map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join("");
			new Dialog({
				title:   `Hand off ${name}`,
				content: `<p>Move <strong>${escHtml(name)}</strong> &mdash; with their Loyalty, current HP, and notes &mdash; to another character:</p>
					<div class="form-group stonetop-handoff-row"><label>Character</label>
						<select class="stonetop-handoff-target">${opts}</select></div>`,
				buttons: {
					handoff: { icon: '<i class="fas fa-people-arrows"></i>', label: "Hand off",
						callback: html => this._handOffFollower(slug, html.find(".stonetop-handoff-target").val()) },
					cancel:  { label: "Cancel" },
				},
				default: "handoff",
				render:  bringDialogToFront,
			}, { classes: ["dialog", "stonetop"] }).render(true);
		}

		async _handOffFollower(slug, targetId) {
			const data   = this.actor.getFlag("stonetop_pwd", `customFollowers.${slug}`);
			const target = game.actors.get(targetId);
			if (!data || !target) return;
			// Fresh id + order on the destination so it can't collide with one of theirs.
			const targetMap = target.getFlag("stonetop_pwd", "customFollowers") ?? {};
			const maxOrder  = Object.values(targetMap).reduce((m, f) => Math.max(m, Number(f?.order) || 0), 0);
			const newId     = foundry.utils.randomID(16);
			await target.update({
				[`flags.stonetop_pwd.customFollowers.${newId}`]: { ...data, order: Math.max(maxOrder + 1, Date.now()) },
			});
			await this._removeCustomFollower(slug);
			await this._postMoveCard("Follower Handed Off",
				`<p><strong>${escHtml(data.name || "A follower")}</strong> now follows <strong>${escHtml(target.name)}</strong>.</p>`);
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
					<p class="stonetop-homestead-note">${_esc(guide.note)} You can't gain this benefit again until you take more damage.</p>
				</form>`,
				buttons: {
					cancel:  { label: "Cancel" },
					recover: {
						label: `Recover (+${newHp - hp.value} HP)`,
						callback: () => this._applyRecover({ supplySlug, currentUses: Number(resources[supplySlug]) || 0, oldHp: hp.value, newHp }),
					},
				},
				default: "recover",
				render: bringDialogToFront,
			}, { width: 480, classes: ["dialog", "stonetop", "stonetop-recover-dialog"] }).render(true);
		}

		async _applyRecover({ supplySlug, currentUses, oldHp, newHp }) {
			await this._stonetopCharacter.setInventoryResource(supplySlug, Math.max(0, currentUses - 1));
			await this.actor.update({
				"system.attributes.hp.value": newHp,
				"flags.stonetop_pwd.recover.spent": true,
			});

			const rows = [
				{ label: "Supplies", value: "Expended 1 use" },
				{ label: "HP", value: `${oldHp} → ${newHp} (+${newHp - oldHp})` },
			];
			postMoveToChat(this.actor, "Recover", rows);

			this.render(false);
		}

		async _onConvalesceOpen() {
			const snapshot = await this._stonetopCharacter.buildSnapshot();
			const hp = snapshot.vitals.hp;
			const activeDebilities = (snapshot.debilities ?? []).filter(d => d.active);
			// A gmOnly wound is hidden from the owning player on the sheet; keep it out of
			// their Convalesce lists too (the GM manages those), so the dialog never surfaces
			// the concealed text — and the resulting card never broadcasts it.
			const isGM = game.user.isGM;
			const openWounds = (snapshot.wounds ?? []).filter(w => !w.healed && (isGM || !w.gmOnly));
			const healable   = openWounds.filter(w => w.status !== "permanent");
			const permanent  = openWounds.filter(w => w.status === "permanent");
			if (hp.value >= hp.max && activeDebilities.length === 0 && openWounds.length === 0) return;

			const hpRow = hp.value < hp.max
				? `<li>Recover all HP: <strong>${hp.value} &rarr; ${hp.max}</strong>.</li>`
				: `<li>HP already full.</li>`;
			const debilityRow = activeDebilities.length
				? `<li>Clear ${activeDebilities.length === 1 ? "debility" : "debilities"}: <strong>${_esc(activeDebilities.map(d => d.name).join(", "))}</strong>.</li>`
				: `<li>No debilities marked.</li>`;

			// Wounds that can heal → an OPT-IN checklist (unchecked by default): healing them
			// is Convalesce's stricter "few weeks under a healer" tier, distinct from the "few
			// days" HP/debility reset above, so the player asserts it deliberately rather than
			// having it ride along on every reset. Healing keeps a wound as a scar, not deletion.
			const healSection = healable.length
				? `<div class="stonetop-convalesce-wounds">
						<p class="stonetop-homestead-subhead">Heal wounds that can heal (weeks under a healer):</p>
						<ul class="stonetop-convalesce-wound-list">
							${healable.map(w => `<li><label class="stonetop-convalesce-wound"><input type="checkbox" name="heal" value="${_esc(w.id)}"> <span>${_esc(w.text || "(unnamed wound)")}</span></label></li>`).join("")}
						</ul>
					</div>`
				: "";
			// Permanent injuries can't heal. Split them by origin so each gets the right framing:
			// a real impairment (lost limb, shattered knee) prompts "retire or Make a Plan"; a
			// purely narrative Death's-Door mark is just carried and never gets the retire framing.
			const permRow = (w) => `<li class="stonetop-convalesce-permanent-row">
					<span class="stonetop-convalesce-permanent-text"><i class="fas fa-lock"></i> ${_esc(w.text || "(unnamed injury)")}</span>
					<input type="text" name="plan-${_esc(w.id)}" value="${_esc(w.planNote ?? "")}" placeholder="Make a Plan to adapt (a prosthetic, learn to compensate…)">
				</li>`;
			const permBlock = (title, list) => list.length
				? `<div class="stonetop-convalesce-permanent">
						<p class="stonetop-homestead-subhead">${title}</p>
						<ul class="stonetop-convalesce-wound-list">${list.map(permRow).join("")}</ul>
					</div>`
				: "";
			// The goal input here is a quick capture; the full plan (tick-box requirements +
			// any interim penalty like "Let Fly at disadvantage until practiced") lives on the
			// wound's own edit form, so point there rather than duplicating that editor.
			const permHint = permanent.length
				? `<p class="stonetop-homestead-note">Add tick-box requirements and any interim penalty via the wound's <i class="fas fa-pen"></i> edit on the sheet.</p>`
				: "";
			const permSection =
				permBlock("Permanent injury — retire or Make a Plan to adapt:", permanent.filter(w => w.origin !== "deaths-door")) +
				permBlock("A lasting mark — Make a Plan to carry it, or just bring it up in play:", permanent.filter(w => w.origin === "deaths-door")) +
				permHint;

			new Dialog({
				title: "Convalesce",
				content: `<form class="stonetop-homestead-dialog stonetop-convalesce-dialog">
					<p class="stonetop-homestead-trigger"><em>When you rest for a few days, in safety and comfort…</em></p>
					<div class="stonetop-homestead-reference">
						<ul>${hpRow}${debilityRow}</ul>
					</div>
					<p class="stonetop-homestead-note"><em>When you rest for a few weeks under the care of a healer,</em> heal any problematic wounds that can heal. If you have suffered a permanent injury or impairment, either retire or Make a Plan to adapt to it.</p>
					${healSection}
					${permSection}
				</form>`,
				buttons: {
					convalesce: {
						label: "Convalesce",
						callback: (html) => {
							const healIds = html.find('input[name="heal"]:checked').map((_i, el) => el.value).get();
							// Only carry a plan note when it actually changed — the inputs are
							// pre-filled with the stored note, so an untouched permanent wound would
							// otherwise trigger a redundant wound write (and a spurious "via
							// Convalesce" ledger entry) every time HP/debilities are the real point.
							const planNotes = {};
							for (const w of permanent) {
								const next = (html.find(`[name="plan-${w.id}"]`).val() ?? "").trim();
								if (next !== (w.planNote ?? "")) planNotes[w.id] = next;
							}
							this._applyConvalesce({ oldHp: hp.value, newHp: hp.max, debilities: activeDebilities, healable, healIds, planNotes });
						},
					},
					cancel: { label: "Cancel" },
				},
				default: "convalesce",
				render: bringDialogToFront,
			}, { width: 480, classes: ["dialog", "stonetop", "stonetop-convalesce-dialog"] }).render(true);
		}

		async _applyConvalesce({ oldHp, newHp, debilities, healable = [], healIds = [], planNotes = {} }) {
			const update = { "system.attributes.hp.value": newHp };
			for (const d of debilities) update[`system.attributes.debilities.options.${d.key}.value`] = false;
			await this.actor.update(update, { stonetopMove: "Convalesce" });

			// Heal checked wounds (→ scars) and stamp any Make-a-Plan notes, in one write.
			const hasPlanNotes = Object.keys(planNotes).length > 0;
			if (healIds.length || hasPlanNotes) {
				await this._stonetopCharacter.convalesceWounds({ healIds, planNotes });
			}
			// Don't broadcast a gmOnly wound's concealed text into the public heal card.
			const healedNames = healIds.map(id => {
				const w = healable.find(x => x.id === id);
				return w?.gmOnly ? "a hidden wound" : (w?.text || "a wound");
			});

			const rows = [];
			if (newHp > oldHp)       rows.push({ label: "HP", value: `${oldHp} → ${newHp} (+${newHp - oldHp})` });
			if (debilities.length)   rows.push({ label: "Debilities cleared", value: debilities.map(d => d.name).join(", ") });
			if (healedNames.length)  rows.push({ label: healedNames.length === 1 ? "Wound healed" : "Wounds healed", value: healedNames.join(", ") });
			if (!rows.length)        rows.push({ label: "Convalesce", value: "Rested in safety and comfort." });
			postMoveToChat(this.actor, "Convalesce", rows);

			this.render(false);
		}

		// ── Wounds (4th harm track) ────────────────────────────────────────────────
		_woundIdFromEvent(ev) {
			return ev.currentTarget.closest("[data-wound-id]")?.dataset.woundId ?? null;
		}

		// The current raw wound record (freshest source) for prefilling the edit dialog.
		_woundRecord(id) {
			return (this.actor.system?.attributes?.wounds ?? []).find(w => w.id === id) ?? null;
		}

		// Every move name the character can roll — basic, expedition, playbook,
		// cross-playbook, "other" (both the flat list and any custom category groups),
		// love letters, post-death. A superset of actor.items, since basic/expedition
		// moves aren't embedded documents. Sourced from the same snapshot the sheet
		// renders, so a stored reminderMove matches the moveName that rollStat passes when
		// that move is rolled (that's what the echo keys on).
		_woundReminderMoveNames(snapshot) {
			const ml = snapshot?.movelist;
			const names = new Set();
			const push = (arr) => { for (const m of (arr ?? [])) if (m?.name) names.add(m.name); };
			push(ml?.basicMoves);
			push(ml?.expeditionMoves);
			push(ml?.playbookMoves);
			push(ml?.learnedMoves);
			push(ml?.otherMoves);
			for (const group of (ml?.otherGroups ?? [])) push(group?.moves);
			push(ml?.postDeathGroup?.moves);
			push(ml?.loveLetters);
			return [...names].sort((a, b) => a.localeCompare(b));
		}

		// Options for the "remind on" picker: none, all move rolls, then the moves by name.
		// ("All move rolls" not "All rolls" — the echo only rides 2d6+stat move rolls, not
		// damage/formula/Death's-Door rolls, so the label shouldn't overpromise.)
		_woundReminderMoveOptions(selected = "", moveNames = []) {
			const opts = [
				{ value: "",  label: "— no reminder —" },
				{ value: "*", label: "All move rolls" },
				...moveNames.map(name => ({ value: name, label: name })),
			];
			// If the stored reminder targets a move that's since been renamed or unlearned,
			// keep it as an explicit option so re-saving the wound doesn't silently drop the
			// (drifted) binding — the dropdown would otherwise have no matching value.
			if (selected && selected !== "*" && !moveNames.includes(selected)) {
				opts.push({ value: selected, label: `${selected} (not a current move)` });
			}
			return opts.map(o =>
				`<option value="${_esc(o.value)}"${o.value === selected ? " selected" : ""}>${_esc(o.label)}</option>`,
			).join("");
		}

		async _onWoundAdd() {
			const snapshot = await this._stonetopCharacter.buildSnapshot();
			this._openWoundDialog({ isNew: true, moveNames: this._woundReminderMoveNames(snapshot) });
		}

		async _onWoundEdit(id) {
			if (!id) return;
			const snapshot = await this._stonetopCharacter.buildSnapshot();
			this._openWoundDialog({ isNew: false, wound: this._woundRecord(id), moveNames: this._woundReminderMoveNames(snapshot) });
		}

		// Recover, applied to one wound: "say how you tend to it," then stabilize it —
		// Recover only ever *stabilizes* (clearing any stored requirement); healing is
		// Convalesce. If the GM says it isn't handled yet, cancel and note what's still
		// required on the wound via Edit.
		_onWoundTend(id) {
			if (!id) return;
			const wound = this._woundRecord(id);
			if (!wound) return;
			const label = wound.text || "(unnamed wound)";
			// A gmOnly wound's tend chip is only visible to the GM (the sheet hides it from
			// the owning player), so the dialog can name it — but the resulting chat card is
			// public, so never broadcast the concealed text or the treatment specifics.
			const chatLabel = wound.gmOnly ? "a hidden wound" : label;
			// No inputs: "say how" is table narration (said out loud; the trigger line
			// prompts it), and nothing here would persist a typed value. The action is a
			// single confirm — the GM says it's handled, and the wound stabilizes.
			const content = `<form class="stonetop-homestead-dialog stonetop-wound-tend-form">
				<p class="stonetop-homestead-trigger"><em>When you tend to a problematic wound, say how.</em></p>
				<p class="stonetop-wound-tend-target"><i class="fas fa-droplet"></i> <strong>${_esc(label)}</strong></p>
				<p class="stonetop-homestead-note">The GM will say it's taken care of, or tell you what's still required. Stabilizing isn't healing — that takes Convalesce.</p>
			</form>`;

			const stabilize = async () => {
				await this._stonetopCharacter.updateWound(id, { status: "stabilized", requirementNote: "" }, { moveName: "Recover" });
				postMoveToChat(this.actor, "Recover", [{ label: "Wound stabilized", value: chatLabel }]);
				this.render(false);
			};

			new Dialog({
				title: "Recover — tend to a wound",
				content,
				buttons: {
					stabilize: { label: "It's taken care of", callback: stabilize },
					cancel:    { label: "Cancel" },
				},
				default: "stabilize",
				render: bringDialogToFront,
			}, { width: 460, classes: ["dialog", "stonetop", "stonetop-wound-tend-dialog"] }).render(true);
		}

		async _onWoundRemove(id) {
			if (!id) return;
			const wound = this._woundRecord(id);
			const label = wound?.text ? `“${wound.text}”` : "this wound";
			const ok = await Dialog.confirm({
				title: "Remove Wound",
				content: `<p>Remove ${_esc(label)} from the sheet? This deletes it entirely — to keep its fiction as a healed scar instead, edit it and tick “Healed — move to Scars.”</p>`,
				render:  bringDialogToFront,
				options: { classes: ["dialog", "stonetop", "stonetop-remove-wound-dialog"] },
			});
			if (!ok) return;
			await this._stonetopCharacter.removeWound(id);
			this.render(false);
		}

		// Shared add/edit form. Status/healed are settable here as a manual override; the
		// normal path is move-gated (Recover stabilizes, Convalesce heals → scar). The
		// "Healed — move to Scars" toggle is the manual heal path (the Remove dialog points
		// here to keep a wound's fiction as a scar). Only the GM sees the "hidden from
		// players" toggle. planNote is editable here too, so a permanent injury's adaptation
		// plan and its interim lasting tag/reminder can be captured in one place.
		_openWoundDialog({ isNew, wound = null, moveNames = [] }) {
			const w    = wound ?? {};
			const isGM = game.user.isGM;
			const statusOptions = _WOUND_STATUS_OPTIONS.map(o =>
				`<option value="${o.value}"${(w.status ?? "problematic") === o.value ? " selected" : ""}>${_esc(o.label)}</option>`,
			).join("");
			const originOptions = _WOUND_ORIGIN_OPTIONS.map(o =>
				`<option value="${o.value}"${(w.origin ?? "wound") === o.value ? " selected" : ""}>${_esc(o.label)}</option>`,
			).join("");
			// One Make-a-Plan tick-box row (Book I p.530: "write the requirements down with
			// tick boxes… tick the boxes off"): a done checkbox + the requirement text + remove.
			const reqRow = (text = "", done = false) => `<li class="stonetop-wound-req">
				<label class="checkbox"><input type="checkbox" class="req-done"${done ? " checked" : ""}></label>
				<input type="text" class="req-text" value="${_esc(text)}" placeholder="e.g. months of practice">
				<button type="button" class="req-remove" data-tooltip="Remove"><i class="fas fa-xmark"></i></button>
			</li>`;
			const content = `<form class="stonetop-wound-dialog-form">
				${isNew ? `<p class="stonetop-homestead-note">A problematic wound always involves taking damage, and often a marked debility — apply those on the sheet as the fiction warrants.</p>` : ""}
				<div class="form-group">
					<label>Wound</label>
					<input type="text" name="text" value="${_esc(w.text ?? "")}" placeholder="e.g. Twisted ankle — can't bear weight">
				</div>
				<div class="form-group">
					<label>Status</label>
					<select name="status">${statusOptions}</select>
				</div>
				<div class="form-group">
					<label>Origin</label>
					<select name="origin">${originOptions}</select>
				</div>
				<div class="form-group">
					<label>Note / requirement</label>
					<input type="text" name="requirementNote" value="${_esc(w.requirementNote ?? "")}" placeholder="What's needed to treat it (optional)">
				</div>
				<div class="form-group">
					<label>Lasting tag</label>
					<input type="text" name="mechanicalTag" value="${_esc(w.mechanicalTag ?? "")}" placeholder="e.g. Let Fly at disadvantage until practiced">
				</div>
				<div class="form-group">
					<label>Remind on</label>
					<select name="reminderMove">${this._woundReminderMoveOptions(w.reminderMove ?? "", moveNames)}</select>
				</div>
				<div class="form-group">
					<label>Make-a-Plan goal</label>
					<input type="text" name="planNote" value="${_esc(w.planNote ?? "")}" placeholder="Adaptation goal for a permanent injury (optional)">
				</div>
				<div class="form-group stonetop-wound-plan-reqs">
					<label>Plan requirements <span class="stonetop-wound-plan-hint">— tick off as you adapt</span></label>
					<ul class="stonetop-wound-req-list">${(w.planRequirements ?? []).map(r => reqRow(r.text, r.done)).join("")}</ul>
					<button type="button" class="stonetop-wound-req-add"><i class="fas fa-plus"></i> Add requirement</button>
				</div>
				<div class="form-group">
					<label class="checkbox"><input type="checkbox" name="healed"${w.healed ? " checked" : ""}> Healed — move to Scars</label>
				</div>
				${isGM ? `<div class="form-group">
					<label class="checkbox"><input type="checkbox" name="gmOnly"${w.gmOnly ? " checked" : ""}> Hidden from players</label>
				</div>` : ""}
			</form>`;

			const apply = async (html) => {
				const val = (name) => html.find(`[name="${name}"]`).val();
				const data = {
					text:            (val("text") ?? "").trim(),
					status:          val("status"),
					origin:          val("origin"),
					requirementNote: (val("requirementNote") ?? "").trim(),
					mechanicalTag:   (val("mechanicalTag") ?? "").trim(),
					reminderMove:    val("reminderMove") ?? "",
					planNote:        (val("planNote") ?? "").trim(),
					planRequirements: html.find(".stonetop-wound-req").toArray().map(li => ({
						text: (li.querySelector(".req-text")?.value ?? "").trim(),
						done: !!li.querySelector(".req-done")?.checked,
					})).filter(r => r.text),
					healed:          html.find('[name="healed"]').is(":checked"),
				};
				if (isGM) data.gmOnly = html.find('[name="gmOnly"]').is(":checked");
				if (isNew) await this._stonetopCharacter.addWound(data);
				else if (w.id) await this._stonetopCharacter.updateWound(w.id, data);
				this.render(false);
			};

			new Dialog({
				title: isNew ? "Add Wound" : "Edit Wound",
				content,
				buttons: {
					save:   { label: isNew ? "Add" : "Save", callback: apply },
					cancel: { label: "Cancel" },
				},
				default: "save",
				render: (html) => {
					bringDialogToFront(html);
					// Dynamic add/remove of plan-requirement rows; collected from the live DOM on save.
					html.find(".stonetop-wound-req-add").on("click", () => html.find(".stonetop-wound-req-list").append(reqRow()));
					html.on("click", ".req-remove", (ev) => ev.currentTarget.closest(".stonetop-wound-req")?.remove());
				},
			}, { width: 460, classes: ["dialog", "stonetop", "stonetop-wound-dialog"] }).render(true);
		}

		// Stamp the character with where the player is in creation, so the GM's
		// first-session Welcome roster can show their progress. `state` is one of
		// "picker" (choosing a playbook), "onboarding" (with 1-based step + total),
		// or "exited" (closed mid-creation). Fire-and-forget — a failed write must
		// never interrupt the player's creation flow.
		_setOnboardingState(state, extra = {}) {
			this.actor.setFlag("stonetop_pwd", "onboardingProgress", { state, ...extra })
				.catch(err => console.error("Stonetop | failed to record onboarding progress", err));
		}

		// Drop the progress flag once creation is finished, so the roster stops
		// showing progress for a completed character.
		_clearOnboardingProgress() {
			return this.actor.unsetFlag("stonetop_pwd", "onboardingProgress").catch(() => {});
		}

		async _onNewCharacter(options = {}) {
			// Launched from the player's first-session intro (CharacterCreationDialog),
			// the sheet is still closed — `openSheetWhenDone` asks us to pop it open once
			// the player lands at the end of the flow, so they never face an empty sheet.
			// The in-sheet button leaves it false: the sheet is already on screen.
			const openSheetWhenDone = options.openSheetWhenDone ?? false;
			let sheetOpened = false;
			const openSheetOnce = () => {
				if (!openSheetWhenDone || sheetOpened) return;
				sheetOpened = true;
				this.render(true);
			};

			const openPicker = () => {
				// Did this picker hand off to onboarding? Closing it without a pick means
				// the player backed all the way out, so fall back to opening their sheet.
				let picked = false;
				this._setOnboardingState("picker");
				new PlaybookPickerDialog(
					async (playbookDoc) => {
						picked = true;
						this._launchOnboarding(playbookDoc, { openSheetOnce, openPicker });
					},
					// Closing the picker without picking is leaving creation entirely.
					{ onClose: () => { if (!picked) { this._setOnboardingState("exited"); openSheetOnce(); } } },
				).render(true);
			};

			const existingPlaybook = this.actor.system?.playbook?.slug;

			// Resume an interrupted creation straight into onboarding at the saved page.
			// The picked playbook + selections live in client-local storage (not
			// system.playbook) because creation isn't committed until the player
			// finishes — so the character still "has no playbook" until then, which is
			// what the reload sweep in hooks/Ready.js keys off to re-offer creation.
			// We also resume when re-entered from the sheet's own button (no explicit
			// `resume`) for a still-uncommitted character that has saved progress, so a
			// player who closed the walkthrough and clicked "Create Character" again
			// continues where they left off instead of starting over and losing answers.
			if (options.resume || !existingPlaybook) {
				const snap = readOnboardingResume(this.actor);
				const playbookDoc = snap?.playbookUuid ? await fromUuid(snap.playbookUuid) : null;
				if (playbookDoc && snap?.selections) {
					this._launchOnboarding(playbookDoc, {
						openSheetOnce, openPicker,
						initialSelections: snap.selections,
						startAtStep:       snap.stepType ?? null,
					});
					return;
				}
				// A snapshot that can't be used (playbook deleted / re-imported, or no
				// selections) — drop it so a stale entry can't shadow a fresh start, then
				// fall through to a normal pick.
				if (snap) clearOnboardingResume(this.actor);
			}

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
					render: bringDialogToFront,
				}, { classes: ["dialog", "stonetop", "stonetop-new-character-confirm"] }).render(true);
			} else {
				openPicker();
			}
		}

		// Open the guided onboarding for a chosen playbook, wired into the full
		// creation flow: commit on finish, step back to the picker, land on the sheet
		// when done, and keep a resume snapshot so a reload can reopen this page (see
		// _onNewCharacter's `resume`). The heavy snapshot (playbook + selections) goes
		// to cheap client-local storage; only the small page number reaches the actor
		// flag (and only on page change, not per keystroke) for the GM's roster.
		// `initialSelections` / `startAtStep` resume an interrupted creation.
		// Move name → count owned by the actor. Threaded into onboarding so a sub-choice
		// cap that grows with a move (the Blessed's sacred-pouch remarkable traits, +1 per
		// Big Magic) is correct when re-opening onboarding after taking that move.
		_ownedMoveCounts() {
			return this._stonetopCharacter.ownedMoveCounts();
		}

		// Open the standalone sacred-pouch (possession choiceGroups) editor. `addOnly`
		// restricts it to the just-freed remarkable-trait slot (the level-up surface);
		// the default full editor (gear-tab pencil) exposes flavor + all traits.
		_openPossessionChoices(possessionSlug, { addOnly = false } = {}) {
			if (!possessionSlug) return;
			new PossessionChoicesDialog(
				this._stonetopCharacter,
				possessionSlug,
				{ onDone: () => this.render(false), addOnly },
			).render(true);
		}

		// After gaining a move, auto-open the possession editor if that move just freed a
		// sub-choice slot (a Blessed taking Big Magic → an additional remarkable trait).
		// Add-only: the player adds just the new trait, not re-edit the whole pouch.
		async _maybeOpenPossessionChoicesForMove(moveName) {
			const slug = await this._stonetopCharacter.possessionWithOpenChoiceFor(moveName);
			if (slug) this._openPossessionChoices(slug, { addOnly: true });
		}

		_launchOnboarding(playbookDoc, { openSheetOnce, openPicker, initialSelections = null, startAtStep = null } = {}) {
			const saveResume = info => writeOnboardingResume(this.actor, {
				playbookUuid: playbookDoc.uuid,
				stepType:     info.stepType,
				selections:   info.selections,
			});
			new CharacterOnboardingDialog(
				playbookDoc,
				async (selections) => {
					await this._applyPlaybookSelections(playbookDoc, selections);
					await this._clearOnboardingProgress();
					clearOnboardingResume(this.actor);
				},
				{
					initialSelections,
					startAtStep,
					ownedMoveCounts: this._ownedMoveCounts(),
					onBack: openPicker,
					onSave: async (selections) => {
						await this._applyPlaybookSelections(playbookDoc, selections);
					},
					// Finishing, saving-and-closing, or closing onboarding all land the
					// player on their now-populated sheet. Back-navigation to the picker
					// suppresses this (see CharacterOnboardingDialog._goBack).
					onClose: openSheetOnce,
					// Page change: update the GM's "page X of Y" (small flag) and snapshot.
					// Stamp the chosen playbook onto the flag too — it lives only in the
					// player's local resume snapshot otherwise, which the GM can't read, so
					// the Welcome roster has no other way to name the in-progress playbook.
					onProgress: info => {
						this._setOnboardingState("onboarding", { step: info.step + 1, total: info.total, playbook: playbookDoc.name });
						saveResume(info);
					},
					// Every edit (debounced): just the local snapshot — no network — so a
					// dropped connection mid-page still leaves the writing recoverable.
					onLiveSave: saveResume,
					// Closing mid-creation keeps the snapshot so a reload can resume here.
					onExit: info => {
						this._setOnboardingState("exited", { playbook: playbookDoc.name });
						saveResume(info);
					},
				},
			).render(true);
		}

		async _openEditCharacterOnboarding(options = {}) {
			const playbookUuid = this.actor.system?.playbook?.uuid;
			if (!playbookUuid) return;
			const playbookDoc = await fromUuid(playbookUuid);
			if (!playbookDoc) return;

			// Track live progress for the GM's Welcome roster only while creation is
			// still unfinished — re-opening onboarding to tweak a completed character
			// shouldn't make the roster claim they're mid-creation again.
			const selections = this._readSelectionsFromActor(playbookDoc);
			const trackProgress = CharacterOnboardingDialog.hasIncompleteQuestions(playbookDoc, selections);

			// Note: _applyPlaybookSelections updates the prototype token image but not
			// any already-placed tokens; those are left for the GM to sync manually.
			new CharacterOnboardingDialog(
				playbookDoc,
				async (sel) => {
					await this._applyPlaybookSelections(playbookDoc, sel);
					if (trackProgress) await this._clearOnboardingProgress();
				},
				{
					initialSelections: selections,
					startAtStep: options.startAtStep ?? null,
					ownedMoveCounts: this._ownedMoveCounts(),
					onSave: async (sel) => {
						await this._applyPlaybookSelections(playbookDoc, sel);
					},
					...(trackProgress
						? {
							onProgress: info => this._setOnboardingState("onboarding", { step: info.step + 1, total: info.total }),
							onExit: () => this._setOnboardingState("exited"),
						}
						: {}),
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

		// Restore each "either X OR Y" starting-move pick (e.g. the Heavy's Armored OR
		// Uncanny Reflexes) by the owned move's NAME — its compendium id isn't knowable
		// from the actor alone. The onboarding dialog swaps the name for the id once its
		// move list loads, so the moves step shows the choice already made rather than
		// forcing a re-pick. Keyed by choice-group index.
		_restoreOwnedMoveChoices(playbookDoc) {
			const groups = playbookDoc?.flags?.stonetop?.moves?.choices ?? [];
			const ownedMoveNames = new Set(this.actor.items.filter(i => i.type === "move").map(i => i.name));
			const picks = {};
			groups.forEach((group, i) => {
				const owned = (group.options ?? []).find(name => ownedMoveNames.has(name));
				if (owned) picks[i] = owned;
			});
			return picks;
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

			// Ranger animal companion: the type's mandatory trait (Bird/Critter "tiny",
			// Brute "tough", Predator "fierce", Steed "large") is auto-included and never
			// counts toward "pick N more", so keep it out of the editable selection — it's
			// re-added for display and is stat-neutral. Stripping here also self-heals any
			// legacy character that stored it as one of its picks.
			const acType      = f.animalCompanion?.type ?? "";
			const acTypes     = playbookDoc?.flags?.stonetop?.animalCompanion?.types ?? [];
			const acMandatory = acTypes.find(t => t.slug === acType)?.mandatoryTrait ?? null;
			const acTraits    = [...(f.animalCompanion?.traits ?? [])]
				.filter(t => !acMandatory || t !== acMandatory);

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
				possessionChoices: foundry.utils.deepClone(f.possessions?.subChoices ?? {}),
				customPossession: f.possessions?.custom?.[0]?.label ?? "",
				moves:           [], // compendium IDs are hard to recover; player re-picks
				moveChoices:     this._restoreOwnedMoveChoices(playbookDoc),
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
					type:     acType,
					kind:     f.animalCompanion?.kind ?? "",
					traits:   acTraits,
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
				markedActions:  [...(f.background?.markedActions ?? [])],
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
					// Stamp majorMarksFor to the restored major so getData keeps these marks
					// instead of re-defaulting them (it only resets when the major changes).
					majorMarks:    [...(f.arcana?.majorMarks ?? [])],
					majorMarksFor: majorArcanum,
				},
			};
		}

		_backgroundSetupNeighbors(backgroundSetup, selections) {
			const out = [];
			// Playbook backgrounds author a neighbor's place of origin as `origin` and
			// their trait as `trait`; the steading's Neighbors table stores these under
			// `home` and `traits` (see _onNeighborChange / the neighbors partial), so map
			// them across — the location belongs in the Home column, not Occupation.
			for (const neighbor of (backgroundSetup?.neighbors ?? [])) {
				if (!neighbor.name) continue;
				out.push({
					name: neighbor.name,
					home: neighbor.origin ?? "",
					traits: neighbor.traitKey
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
						home: option.origin ?? "",
						traits: option.trait ?? "",
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
			const keyFor = neighbor => `${String(neighbor.name ?? "").trim().toLowerCase()}|${String(neighbor.home ?? "").trim().toLowerCase()}`;

			for (const addition of additions) {
				const key = keyFor(addition);
				if (!addition.name?.trim() || key === "|") continue;
				const idx = neighbors.findIndex(neighbor => keyFor(neighbor) === key);
				if (idx >= 0) {
					neighbors[idx] = {
						...neighbors[idx],
						home: addition.home || neighbors[idx].home || "",
						traits: addition.traits || neighbors[idx].traits || "",
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
				const icon = playbookIconPath(slug);
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
				// "Pick N" bundles (Weapons of war, Symbol of authority…): replace the
				// chosen sub-options wholesale, but only for possessions actually selected.
				// Replacing (not adding) drops picks the player deselected on a re-run.
				const selectedSet = new Set(slugsToSelect);
				for (const [possessionSlug, choiceSlugs] of Object.entries(selections.possessionChoices ?? {})) {
					if (!selectedSet.has(possessionSlug)) continue;
					await this._stonetopCharacter.setPossessionSubChoices(possessionSlug, choiceSlugs);
				}
				// Write-in "something else (discuss with GM)" possession. Replace rather
				// than append so re-running onboarding doesn't duplicate it.
				await this._stonetopCharacter.setCustomPossessions(
					selections.customPossession?.trim() ? [selections.customPossession] : [],
				);
			}
			for (const compendiumId of (selections.moves ?? [])) {
				await this._stonetopCharacter.addMove(compendiumId, { skipIfOwned: true });
				// A stat-increase move picked at creation (the Would-Be Hero's Improved Stat)
				// carries a "+1 to which stat?" choice made in onboarding — apply it against the
				// owned instance (freshly added or already present), bumping the chosen stat and
				// recording the pick exactly as the level-up path does. This must NOT gate on
				// addMove's return: on a re-run the move is already owned (addMove returns null)
				// and the base-stat write above just reset the stat, so gating there would drop
				// the +1. applyCreationStatChoice is idempotent (base reset first, +1 capped).
				await this._stonetopCharacter.applyCreationStatChoice(
					compendiumId, selections.moveStatChoices?.[compendiumId],
				);
			}
			// "Either X OR Y" starting-move choices (e.g. the Heavy's Armored OR
			// Uncanny Reflexes) — ensureStartingMoves skips these, so add the picks and
			// drop any previously-chosen alternative so re-running doesn't leave both.
			await this._stonetopCharacter.applyStartingMoveChoices(
				playbookDoc.flags?.stonetop?.moves?.choices ?? [],
				selections.moveChoices ?? {},
			);
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
			const leadMinor     = selections.arcana?.minorRoles?.lead     ?? null;
			for (const slug of [selections.arcana?.major, masteredMinor, foundMinor].filter(Boolean)) {
				await this._stonetopCharacter.addArcanum(slug);
				await this._stonetopCharacter.identifyArcanum(slug);
			}
			// "You've begun to unlock the mysteries of your major arcanum" — mark the ○
			// circles / □ tasks the player ticked in onboarding onto the actual card
			// (majorMarks holds "<context>:<index>" keys matching the sheet's boxes).
			if (selections.arcana?.major) {
				for (const key of (selections.arcana.majorMarks ?? [])) {
					const [context, indexStr] = String(key).split(":");
					const index = Number(indexStr);
					if (context && Number.isInteger(index)) {
						await this._stonetopCharacter.setArcanumBoxChecked(selections.arcana.major, context, index, true);
					}
				}
			}
			// The Seeker's mastered minor begins play already realized: fully unlock it so it
			// carries its back item and shows its back to the owner. The carried side and back
			// visibility now follow the unlock state (the manual flip was retired), so identify
			// alone would leave a mastered card reading as a locked, front-only curio.
			if (masteredMinor) await this._stonetopCharacter.masterArcanum(masteredMinor);
			// The Lead minor isn't in hand yet: add it as a lead card (owned but un-identified)
			// so it shows on the arcana tab as a placeholder the player can later mark discovered.
			if (leadMinor) await this._stonetopCharacter.addLead(leadMinor);

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
				// Beast-Bonded marked actions, filtered to the selected background's list.
				const markableSlugs = new Set((selectedBackground.markableActions?.options ?? []).map(o => o.slug));
				const backgroundMarkedActions = (selections.markedActions ?? []).filter(s => markableSlugs.has(s));
				await this._batchFlagSetOrUnset({
					"background.setupChoices":   backgroundSetupChoices,
					"background.setupTexts":     backgroundSetupTexts,
					"background.neighborTraits": backgroundNeighborTraits,
					"background.neighborPicks":  backgroundNeighborPicks,
					"background.markedActions":  backgroundMarkedActions,
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
			if (selections.arcana?.majorMarks?.length) flagUpd[f("arcana.majorMarks")] = selections.arcana.majorMarks;

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
