import {MoveResourceButton} from "./elements/move-resource-button.js";
import {BackgroundInputChoice} from "./elements/background-input-choice.js";
import {PossessionUseButton} from "./elements/possession-use-button.js";
import {OutfitMoveDialog} from "./dialogs/OutfitMoveDialog.js";
import {LevelUpDialog} from "./dialogs/LevelUpDialog.js";
import {DeathsDoorDialog} from "./dialogs/DeathsDoorDialog.js";
import {PlaybookPickerDialog} from "./dialogs/PlaybookPickerDialog.js";
import {ANIMAL_COMPANION_TRAIT_GLOSSARY, CharacterOnboardingDialog} from "./dialogs/CharacterOnboardingDialog.js";
import {CharacterLedger} from "./CharacterLedger.js";
import {resolvedFlags, resolvedFlagProperty, STONETOP_SCOPE, ITEM_FLAG_SCOPE} from "./StonetopFlags.js";
import {rollDamage, sign} from "../../utils/roll-engine.js";
import {normalizeRollType} from "../../utils/roll-types.js";
import {escHtml, isDefaultImg} from "../../utils/strings.js";
import {postMoveToChat} from "../../utils/chat.js";
import {getStonetopSteadingActor} from "../../utils/world.js";
import {STEADING_DEFAULTS, StonetopSteading} from "../steading/StonetopSteading.js";
import {getHoverDescriptionSetting, getRollStatChipsSetting} from "../../settings.js";
import {attachKeepOnTop, keepDialogOnTop} from "../../utils/keep-on-top.js";

const _STAT_KEYS = new Set(["str", "dex", "int", "wis", "con", "cha"]);

const STAT_TOOLTIPS = {
	str: "Your physical power and ability to use it. Roll +STR to Clash, or to Defy Danger with raw might or power.",
	dex: "Your grace and fine motor control. Roll +DEX to Let Fly, or to Defy Danger with speed, agility, finesse.",
	int: "Your memory, learning, and quick thinking. Roll +INT to Know Things, or to Defy Danger via expertise or a clever plan.",
	wis: "Your intuition, self-control, and awareness. Roll +WIS to Seek Insight, or when you rely on your willpower or senses to Defy Danger.",
	con: "Your stamina, grit, determination, and endurance. Roll +CON to Defend, or to Defy Danger by holding steady or enduring hardship.",
	cha: "Your ability to charm and connect with others, and to get a read on what others want. Roll +CHA to Persuade, or to Defy Danger socially.",
};

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
};

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
const _GLYPH_RE = /[○◇◆□]+/g;
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

function _wrapStonetopGlyphsInEl(container) {
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
		acceptNode: node =>
			node.parentElement?.closest(".stonetop-glyph, .stonetop-move-ref")
				? NodeFilter.FILTER_REJECT
				: NodeFilter.FILTER_ACCEPT,
	});
	const toReplace = [];
	let node;
	while ((node = walker.nextNode())) {
		_GLYPH_RE.lastIndex = 0;
		if (_GLYPH_RE.test(node.textContent)) toReplace.push(node);
	}
	for (const textNode of toReplace) {
		const text = textNode.textContent;
		const frag = document.createDocumentFragment();
		let lastIdx = 0;
		_GLYPH_RE.lastIndex = 0;
		let m;
		while ((m = _GLYPH_RE.exec(text)) !== null) {
			if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
			for (const glyph of m[0]) {
				const span = document.createElement("span");
				span.className = "stonetop-glyph";
				if (glyph === "◇") span.classList.add("stonetop-glyph--diamond");
				else if (glyph === "◆") span.classList.add("stonetop-glyph--diamond-selected");
				span.textContent = glyph;
				frag.appendChild(span);
			}
			lastIdx = m.index + m[0].length;
		}
		if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
		textNode.parentNode?.replaceChild(frag, textNode);
	}
}

export function createStonetopCharacterSheetClass(Base) {
	return class StonetopCharacterSheet extends Base {
		_stonetopCharacter;
		_editMode = false;

		constructor(...args) {
			super(...args);
			this._stonetopCharacter = this.actor.typedActor;
		}

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["pbta", "stonetop", "sheet", "actor", "character"],
				width: 1200,
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

		async close(options) {
			this._movePanel?.remove();
			this._movePanel = null;
			return super.close(options);
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

					// Cache lowercased text once per entry so the search handler
					// doesn't re-query the DOM and call toLowerCase on every keystroke.
					html.find(".stonetop-ledger-entry").each((_, el) => {
						el._ledgerText = el.querySelector(".stonetop-ledger-entry-main")
							?.textContent?.toLowerCase() ?? "";
					});

					html.find(".stonetop-ledger-search").on("input", ev => {
						const term = ev.currentTarget.value.trim().toLowerCase();
						html.find(".stonetop-ledger-entry").each((_, el) => {
							el.hidden = !!term && !el._ledgerText.includes(term);
						});
						syncDateHeaders();
						syncSelectAll();
					});

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
						}, { classes: ["dialog", "stonetop-ledger-child"] });
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
			context.stonetop.statsNoteDisplay = this._editMode ? context.stonetop.playbook?.statsNote ?? null : null;
			context.stonetop.movelist.startingMovesNoteDisplay = this._editMode ? context.stonetop.movelist.startingMovesNote ?? null : null;
			context.stonetop.hideUnselected = this.actor.getFlag('stonetop_pwd', 'hideUnselected') ?? true;
			context.stonetop.editMode = this._editMode;
			context.stonetop.showRollStatChips = getRollStatChipsSetting();
			context.stonetop.showPostDeath = !!context.stonetop.postDeathInsert?.activeSlug;
			// reassign stonetop to system
			context.system.attributes.armor.value = context.stonetop.vitals.armor
			context.system.attributes.xp.max = context.stonetop.vitals.xp.max
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
			context.stonetop.followers    = this._buildFollowersData(playbookDoc, context.stonetop.inventory?.smallItemLimit ?? null);
			context.stonetop.hasFollowers = !!(
				context.stonetop.followers.animalCompanion ||
				context.stonetop.followers.crew ||
				context.stonetop.followers.initiates?.length
			);
			context.stonetop.hasArcana = !!(
				context.stonetop.arcana?.minor?.hasOwned ||
				context.stonetop.arcana?.major?.hasOwned
			);
			context.stonetop.invocations          = this._buildInvocationsData(playbookDoc);
			context.stonetop.showOtherMovesSection = this._editMode || !!(context.stonetop.movelist?.otherMoves?.length);
			const { xp } = context.stonetop.vitals;
			context.stonetop.canLevelUp = xp.value >= xp.max;
			context.stonetop.isDying = context.stonetop.vitals.hp.value <= 0;
			return context;
		}

		_buildFollowersData(playbookDoc, smallItemLimit = null) {
			const sf = resolvedFlags(this.actor);

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
				animalCompanion = {
					name:     sf.animalCompanion?.name     ?? "",
					pronoun:  sf.animalCompanion?.pronoun  ?? "",
					type:     typeLabel,
					kind,
					kindDisplay: _titleCase(kind),
					typeDisplay: String(typeLabel).toLowerCase(),
					hp:       stats.hp                     ?? "—",
					hpMax,
					hpCurrent: hpRaw != null ? Math.min(Math.max(0, Number(hpRaw)), hpMax) : hpMax,
					armor:      stats.armor                ?? "—",
					damage:     stats.damage               ?? "—",
					damageRoll: String(stats.damage ?? "").match(/(\d*d\d+(?:[+-]\d+)?)/i)?.[1] ?? null,
					damageForm: (String(stats.damage ?? "").match(/\(([^)]+)\)/)?.[1] ?? "").replace(/\bband\b/gi, "hand") || null,
					traits: traits.map(label => ({ label, tooltip: showTraitHover ? _animalCompanionTraitTooltip(label) : null })),
					instinct: sf.animalCompanion?.instinct ?? "",
					cost:     sf.animalCompanion?.cost     ?? "",
					loyalty:  _makeLoyaltyPips(loyaltyVal),
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
					return { ...ind, index: idx, hpCurrent: indHpRaw != null ? Math.min(Math.max(0, Number(indHpRaw)), 6) : 6 };
				});
				crew = {
					name:      sf.crew.name     ?? "",
					tags:      sf.crew.tags     ?? [],
					instinct:  sf.crew.instinct ?? "",
					cost:      sf.crew.cost     ?? "",
					loyalty:   _makeLoyaltyPips(loyaltyVal),
					gear:      inventoryDef.map(item => {
						const flagVal     = gearFlags[item.slug];
						// backward-compat: old boolean true ? all pips filled
						const filledCount = typeof flagVal === "number" ? flagVal : (flagVal ? item.weight : 0);
						return {
							...item,
							label:   applyPiercing(item.label),
							checked: filledCount >= item.weight,
							pips:    Array.from({ length: item.weight }, (_, i) => ({ index: i, filled: i < filledCount })),
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
					groupHp:           crewIndividuals.length * 6,
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
						return {
							slug:          opt.slug,
							label:         opt.label,
							tags:          (opt.subtitle ?? "").split(", ").map(t => t.trim()).filter(Boolean),
							hp:            opt.hp      ?? "—",
							hpMax:         initHpMax,
							hpCurrent:     initHpRaw != null ? Math.min(Math.max(0, Number(initHpRaw)), initHpMax) : initHpMax,
							armor:         opt.armor   ?? "—",
							damage:        opt.damage  ?? "—",
							damageRoll:    String(opt.damage ?? "").match(/(\d*d\d+(?:[+-]\d+)?)/i)?.[1] ?? null,
							damageForm:    String(opt.damage ?? "").match(/\(([^)]+)\)/)?.[1] ?? null,
							instinct:      opt.instinct ?? null,
							cost:          opt.cost    ?? null,
							pronoun:       det.pronoun ?? null,
							choiceDetails,
							loyalty: Array.from({ length: 3 }, (_, i) => ({
								slug:   opt.slug,
								index:  i,
								filled: i < (initiatesLoyalty[opt.slug] ?? 0),
							})),
						};
					});
				}
			}

			return { animalCompanion, crew, initiates };
		}

		_buildInvocationsData(playbookDoc) {
			const raw = playbookDoc?.invocations;
			if (!raw?.options?.length) return null;
			const selected = new Set(this.actor.getFlag("stonetop_pwd", "invocations.selected") ?? []);
			return {
				startingCount: raw.startingCount ?? 2,
				options: raw.options.map(opt => ({
					slug:        opt.slug,
					label:       opt.label,
					description: opt.description ?? "",
					known:       selected.has(opt.slug),
				})),
			};
		}

		activateListeners(html) {
			super.activateListeners(html);

			html.find(".stonetop-create-character-btn").on("click", () => this._onNewCharacter());
			html.find("[data-onboarding-start]").on("click", ev => {
				this._openEditCharacterOnboarding({ startAtStep: ev.currentTarget.dataset.onboardingStart });
			});

			html[0].addEventListener("dragover", (ev) => ev.preventDefault());
			html[0].addEventListener("drop", async (ev) => {
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
					this._onDropItem(ev, data);
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
			html.find(".cell--stats .stat[data-stat]").each((_, el) => {
				if (!getHoverDescriptionSetting("hoverDescriptionsStats")) return;
				const tooltip = STAT_TOOLTIPS[el.dataset.stat];
				if (tooltip) {
					el.dataset.tooltip = tooltip;
					el.dataset.tooltipDirection = "DOWN";
				}
			});

			html.find(".stonetop-hide-unselected-check").on("change", async (ev) => {
				await this.actor.setFlag('stonetop_pwd', 'hideUnselected', ev.currentTarget.checked);
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

			html.find(".stonetop-basic-move-open, .stonetop-expedition-move-open").on("click", async ev => {
				if (!this.isEditable) return;
				const li       = ev.currentTarget.closest("li");
				const rollable = li?.querySelector(".rollable");
				if (rollable) { rollable.click(); return; }
				const { compendiumId } = ev.currentTarget.dataset;
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

			html.find(".stonetop-item-description").each((_, el) => {
				if (el.dataset.moveRefsEnriched) return;
				el.dataset.moveRefsEnriched = "1";
				_enrichMoveRefsInEl(el);
				_wrapStonetopGlyphsInEl(el);
			});

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

			if (this._editMode) {
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
			html.find(".stonetop-outfit-load-radio").on("change", this._onOutfitLoad.bind(this));
			html.find(".stonetop-possession-check").on("change", this._onPossessionCheck.bind(this));
			html.find(".stonetop-possession-sub-check").on("change", this._onPossessionSubCheck.bind(this));
			html.find(".stonetop-possession-sub-radio").on("change", this._onPossessionSubRadio.bind(this));
			html.find(".stonetop-regular-pool-btn").on("change", this._onRegularPool.bind(this));
			html.find(".stonetop-outfit-open-btn").on("click", this._onOutfitOpen.bind(this));
			html.find(".stonetop-levelup-open-btn").on("click", this._onLevelUpOpen.bind(this));
			html.find(".stonetop-deathsdoor-open-btn").on("click", this._onDeathsDoorOpen.bind(this));

			// -- Followers tab: crew interactions --------------------------
			// Crew name (editable in edit mode on Followers tab)
			html.find(".stonetop-crew-name-input").on("change", async ev => {
				await this.actor.setFlag("stonetop_pwd", "crew.name", ev.currentTarget.value.trim());
			});
			// Crew loyalty pips
			html.find("button.stonetop-crew-loyalty-pip").on("click", async ev => {
				const idx = Number(ev.currentTarget.dataset.index);
				const current = this.actor.getFlag("stonetop_pwd", "crew.loyalty") ?? 0;
				// clicking a filled pip clears up to that pip; clicking empty fills up to it
				const newVal = current === idx + 1 ? idx : idx + 1;
				await this.actor.setFlag("stonetop_pwd", "crew.loyalty", newVal);
				this.render(false);
			});
			// Animal companion loyalty pips
			html.find("button.stonetop-animal-companion-loyalty-pip").on("click", async ev => {
				const idx = Number(ev.currentTarget.dataset.index);
				const current = this.actor.getFlag("stonetop_pwd", "animalCompanion.loyalty") ?? 0;
				const newVal = current === idx + 1 ? idx : idx + 1;
				await this.actor.setFlag("stonetop_pwd", "animalCompanion.loyalty", newVal);
				this.render(false);
			});
			// Initiate loyalty pips
			html.find("button.stonetop-initiate-loyalty-pip").on("click", async ev => {
				const { slug, index } = ev.currentTarget.dataset;
				const idx     = Number(index);
				const current = (this.actor.getFlag("stonetop_pwd", "initiatesLoyalty") ?? {})[slug] ?? 0;
				const newVal  = current === idx + 1 ? idx : idx + 1;
				await this.actor.update({ [`flags.stonetop_pwd.initiatesLoyalty.${slug}`]: newVal });
				this.render(false);
			});
			// Crew gear pip circles — each pip is independently selectable;
			// clicking pip N fills up to N+1 circles (or down to N if unchecking)
			html.find(".stonetop-crew-gear-check").on("change", async ev => {
				const { slug, pip } = ev.currentTarget.dataset;
				const pipIdx  = Number(pip);
				const checked = ev.currentTarget.checked;
				const gear    = foundry.utils.deepClone(this.actor.getFlag("stonetop_pwd", "crew.gear") ?? {});
				gear[slug]    = checked ? pipIdx + 1 : pipIdx;
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
			// Delete individual crew member
			html.find(".stonetop-crew-delete-individual").on("click", async ev => {
				const idx = Number(ev.currentTarget.dataset.index);
				const individuals = [...(this.actor.getFlag("stonetop_pwd", "crew.individuals") ?? [])];
				individuals.splice(idx, 1);
				await this.actor.setFlag("stonetop_pwd", "crew.individuals", individuals);
				this.render(false);
			});
			// Create individual crew member
			html.find(".stonetop-crew-create-individual").on("click", async () => {
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
					let html    = `<input type="checkbox" name="traits" value="${safeVal}">`;
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
								<input type="checkbox" name="traits" value="${safeVal}"> ${t}
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
					title:   "Add Crew Individual",
					content,
					buttons: {
						cancel: { label: "Cancel" },
						add: {
							icon:  "<i class='fas fa-user-plus'></i>",
							label: "Add",
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
								const current = this.actor.getFlag("stonetop_pwd", "crew.individuals") ?? [];
								await this.actor.setFlag("stonetop_pwd", "crew.individuals",
									[...current, { name, tag, traits }]);
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
				const roll     = bonus > 0 ? `d6+${bonus}` : "d6";
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
				const card     = btn.closest(".stonetop-follower-card");
				const crewName = card?.querySelector(".stonetop-follower-name")?.textContent?.trim() || "Crew";
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
				const thumb = ev.target.closest(".stonetop-arcanum-thumb");
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
				const cb = ev.target.closest(".stonetop-arcanum-box, .stonetop-arcanum-circle");
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

			// -- Followers tab: pronoun ------------------------------------
			html[0].addEventListener("change", async ev => {
				const input = ev.target.closest(".stonetop-animal-companion-pronoun-input");
				if (!input) return;
				await this.actor.setFlag("stonetop_pwd", "animalCompanion.pronoun", input.value.trim());
				this.render(false);
			}, true);

			// -- Followers tab: HP tracking --------------------------------
			html[0].addEventListener("change", async ev => {
				const input = ev.target.closest(".stonetop-follower-hp-input");
				if (!input) return;
				const val = Math.max(0, parseInt(input.value) || 0);
				const { follower, slug, index } = input.dataset;
				if (follower === "animal-companion") {
					await this.actor.setFlag("stonetop_pwd", "animalCompanion.hpCurrent", val);
				} else if (follower === "initiate") {
					const current = foundry.utils.deepClone(this.actor.getFlag("stonetop_pwd", "initiatesHp") ?? {});
					current[slug] = val;
					await this.actor.setFlag("stonetop_pwd", "initiatesHp", current);
				} else if (follower === "crew-individual") {
					const current = foundry.utils.deepClone(this.actor.getFlag("stonetop_pwd", "crew.individualsHp") ?? {});
					current[Number(index)] = val;
					await this.actor.setFlag("stonetop_pwd", "crew.individualsHp", current);
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

			if (!this._editMode) return;

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
			const textEditor = foundry?.applications?.ux?.TextEditor?.implementation;
			return textEditor?.getDragEventData(ev) ?? TextEditor.getDragEventData(ev);
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

		_promptStatChoice(item, rollable) {
			const stats = this.actor.system?.stats ?? {};
			const buttons = {};
			for (const key of _STAT_KEYS) {
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
							<input type="checkbox" name="pick.${index}" value="${_esc(pick)}">
							<span>${_esc(pick)}</span>
						</label>`).join("")}
					</div>
				</div>`
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
			}

			new Dialog({
				title: name,
				content: `<form class="stonetop-homestead-dialog stonetop-character-move-dialog">
					<p class="stonetop-homestead-trigger"><em>${_esc(guide.trigger)}</em></p>
					${fieldsHtml ? `<div class="stonetop-homestead-fields">${fieldsHtml}</div>` : ""}
					${resultsHtml}
					${picksHtml}
					${guide.note ? `<p class="stonetop-homestead-note">${_esc(guide.note)}</p>` : ""}
				</form>`,
				buttons,
				default: rollable ? "roll" : "post",
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
			const slug      = ev.currentTarget.dataset.slug;
			const isChecked = ev.currentTarget.checked;
			await this._stonetopCharacter.setInventoryItemChecked(slug, isChecked);
			if (ev.currentTarget.closest(".stonetop-inventory-small")) {
				await this._stonetopCharacter.adjustSmallPool(isChecked);
			} else if (ev.currentTarget.closest(".stonetop-inventory-regular")) {
				const weight = Number(ev.currentTarget.dataset.weight ?? 1);
				await this._stonetopCharacter.adjustRegularPool(isChecked, weight);
			}
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

		async _onOutfitLoad(ev) {
			await this._stonetopCharacter.setInventoryLoadLevel(ev.currentTarget.value);
			this.render(false);
		}

		async _onRegularPool(ev) {
			const idx = Number(ev.currentTarget.dataset.index);
			await this._stonetopCharacter.setInventoryRegularPool(
				ev.currentTarget.checked ? idx + 1 : idx
			);
			this.render(false);
		}

		async _onSmallPool(ev) {
			const idx = Number(ev.currentTarget.dataset.index);
			await this._stonetopCharacter.setInventorySmallPool(
				ev.currentTarget.checked ? idx + 1 : idx
			);
			this.render(false);
		}

		async _onDeleteCustomInventoryItem(ev) {
			await this._stonetopCharacter.removeCustomInventoryItem(ev.currentTarget.dataset.ownedId);
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
			if (Object.keys(selections.initiateDetails ?? {}).length) flagUpd[f("initiateDetails")]         = selections.initiateDetails;
			if (selections.crew?.instinct || selections.crew?.cost || selections.crew?.tags?.length || selections.crew?.name) {
				const bgTag = playbookDoc.flags?.[ITEM_FLAG_SCOPE]?.crew?.backgroundTags?.[selections.backgroundSlug] ?? null;
				flagUpd[f("crew.name")]     = selections.crew.name?.trim() ?? "";
				flagUpd[f("crew.tags")]     = bgTag ? [bgTag, ...selections.crew.tags] : [...selections.crew.tags];
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
					const parts = key.split(".");
					upd[`flags.${STONETOP_SCOPE}.${parts.slice(0, -1).join(".")}.-=${parts.at(-1)}`] = null;
				}
			}
			if (Object.keys(upd).length) await this.actor.update(upd);
		}
	};
}
