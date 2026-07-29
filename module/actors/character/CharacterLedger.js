import { BEAST_CATALOG } from "../../data/beasts.js";
import { stripHtmlToText } from "../../utils/strings.js";

const LEDGER_SCOPE = "stonetop-pwd";
const LEDGER_KEY = "ledger";
const LEDGER_MAX_ENTRIES = 300;

const SYSTEM_PATH_LABELS = {
	"name": "Name",
	"system.playbook.name": "Playbook",
	"system.attributes.damage.value": "Damage value",
	"system.attributes.hp.value": "HP",
	"system.attributes.hp.max": "Max HP",
	"system.attributes.xp.value": "XP",
	"system.attributes.xp.max": "XP max",
	"system.attributes.level.value": "Level",
	"system.attributes.armor.value": "Armor",
	"system.attributes.forward.value": "Forward",
	"system.attributes.ongoing.value": "Ongoing",
	"system.stats.str.value": "STR",
	"system.stats.dex.value": "DEX",
	"system.stats.int.value": "INT",
	"system.stats.wis.value": "WIS",
	"system.stats.con.value": "CON",
	"system.stats.cha.value": "CHA",
	"system.attributes.debilities.options.weakened.value": "Weakened",
	"system.attributes.debilities.options.dazed.value": "Dazed",
	"system.attributes.debilities.options.miserable.value": "Miserable",
};

const FLAG_PATH_LABELS = {
	"flags.stonetop-pwd.background.selected": "Background",
	"flags.stonetop-pwd.instinct.selected": "Instinct",
	"flags.stonetop-pwd.origin.selected": "Origin",
	"flags.stonetop-pwd.inventory.regularPool": "Items undefined ◇",
	"flags.stonetop-pwd.inventory.smallPool": "Small Items undefined □",
	"flags.stonetop-pwd.postDeathInsert.slug": "Post-death insert",
	"flags.stonetop-pwd.rollMode": "Roll mode",
	"flags.stonetop-pwd.steadingId": "Linked steading",
};

const FLAG_NAMESPACE_LABELS = {
	"flags.stonetop-pwd.animalCompanion": "Animal companion",
	"flags.stonetop-pwd.appearance": "Appearance",
	"flags.stonetop-pwd.arcana": "Arcana",
	"flags.stonetop-pwd.background.choices": "Background choices",
	"flags.stonetop-pwd.crew": "Crew",
	"flags.stonetop-pwd.initiatesLoyalty": "Initiates loyalty",
	"flags.stonetop-pwd.initiateDetails": "Initiate details",
	"flags.stonetop-pwd.inventory.checked": "Inventory",
	"flags.stonetop-pwd.inventory.custom": "Custom inventory",
	"flags.stonetop-pwd.inventory.resources": "Inventory resource",
	"flags.stonetop-pwd.invocations": "Invocations",
	"flags.stonetop-pwd.lore": "Lore",
	"flags.stonetop-pwd.moves": "Move resource",
	"flags.stonetop-pwd.possessions": "Possessions",
	"flags.stonetop-pwd.postDeathInstinct": "Post-death instinct",
	"flags.stonetop-pwd.postDeathLore": "Post-death lore",
};

const SORTED_NAMESPACE_PREFIXES = Object.keys(FLAG_NAMESPACE_LABELS).sort((a, b) => b.length - a.length);
const INVENTORY_CHECKED_PREFIX = "flags.stonetop-pwd.inventory.checked.";
const INVENTORY_RESOURCE_PREFIX = "flags.stonetop-pwd.inventory.resources.";
// Move resource tracks (e.g. the Blessed's "Rites of the Land" Favor) live under the
// misnamed "backgroundChoices" sub-flag (see MoveResources), keyed by move name for
// shipped moves and by stable item id for player-authored custom moves.
const MOVE_RESOURCE_PREFIX = "flags.stonetop-pwd.moves.backgroundChoices.";
// Per-option advancement marks (e.g. Potential for Greatness): keyed
// "<moveName>.<optionSlug>", each an array of { stat, level } entries.
const MOVE_MARKS_PREFIX = "flags.stonetop-pwd.moves.moveMarks.";
const BACKGROUND_CHOICES_PREFIX = "flags.stonetop-pwd.background.choices.";
const INITIATES_LOYALTY_PREFIX = "flags.stonetop-pwd.initiatesLoyalty.";
const INITIATES_HP_PREFIX = "flags.stonetop-pwd.initiatesHp.";
const INITIATES_READINESS_PREFIX = "flags.stonetop-pwd.initiatesReadiness.";
const ANIMAL_COMPANION_PREFIX = "flags.stonetop-pwd.animalCompanion.";
const CREW_PREFIX = "flags.stonetop-pwd.crew.";
// Custom followers (walkthrough / monster conversion / arcana summon) keep their
// Loyalty, current HP and Readiness inside one per-id record; beast/livestock
// followers track theirs per catalog slug. Neither had ledger coverage, so a
// Strengthen Your Bond or an HP change on them went unrecorded — these prefixes
// (and the entry builders below) close that gap.
const CUSTOM_FOLLOWERS_PREFIX = "flags.stonetop-pwd.customFollowers.";
const BEAST_LOYALTY_PREFIX = "flags.stonetop-pwd.beastLoyalty.";
const BEAST_HP_PREFIX = "flags.stonetop-pwd.beastHp.";
const BEAST_READINESS_PREFIX = "flags.stonetop-pwd.beastReadiness.";
const POSSESSION_USES_PREFIX = "flags.stonetop-pwd.possessions.uses.";
const POSSESSION_SUBCHOICES_PREFIX = "flags.stonetop-pwd.possessions.subChoices.";
const POSSESSION_CHOICE_USES_PREFIX = "flags.stonetop-pwd.possessions.choiceUses.";
// The ◇ load mark on a gear bundle's chosen option (a Heavy's Weapons of war), which is
// separate from choosing it — same "selected / deselected" reading as an inventory mark.
const POSSESSION_CHOICE_CARRIED_PREFIX = "flags.stonetop-pwd.possessions.choiceCarried.";
const POSSESSION_SELECTED_PATH = `flags.${LEDGER_SCOPE}.possessions.selected`;
const POSSESSION_CUSTOM_PATH = `flags.${LEDGER_SCOPE}.possessions.custom`;

// Wounds (the 4th harm track) live as an array on this path; flattenObject leaves an array
// as a single leaf, so the whole list arrives at the granular handler as one old/new pair.
const WOUNDS_PATH = "system.attributes.wounds";
// Arcana marks all live under the arcana namespace keyed by arcanum slug: the ◇/○/□ track
// boxes (booleans, "<slug>:<context>:<index>"), the front unlock requirements, and the back
// power options (both counts, "<slug>:<optionSlug>"). Resolve the slug to the card's tier +
// title so a tick reads "Minor Arcana The Key: … master your fear selected" not "Arcana …".
const ARCANA_BOXES_PREFIX = `flags.${LEDGER_SCOPE}.arcana.boxes.`;
const ARCANA_UNLOCK_PREFIX = `flags.${LEDGER_SCOPE}.arcana.unlock.`;
const ARCANA_BACK_OPTIONS_PREFIX = `flags.${LEDGER_SCOPE}.arcana.backOptions.`;

function normalizeFlagPath(path) {
	return String(path ?? "").replace(/^flags\.stonetop\./, `flags.${LEDGER_SCOPE}.`);
}

function getActorProperty(actor, path) {
	const value = foundry.utils.getProperty(actor, path);
	if (value !== undefined) return value;
	if (String(path).startsWith(`flags.${LEDGER_SCOPE}.`)) {
		return foundry.utils.getProperty(actor, path.replace(`flags.${LEDGER_SCOPE}.`, "flags.stonetop."));
	}
	return undefined;
}

export function isBlank(v) {
	return v === undefined || v === null || v === "";
}

export function formatValue(value) {
	if (isBlank(value)) return "blank";
	if (typeof value === "boolean") return value ? "on" : "off";
	if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
	if (typeof value === "object") return "changed";
	return String(value);
}

export function valuesEqual(a, b) {
	if (a === b) return true;
	if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
	return false;
}

export function actionForField(label, oldValue, newValue) {
	if (isBlank(oldValue)) return `${label} set to ${formatValue(newValue)}`;
	if (isBlank(newValue)) return `${label} cleared`;
	return `${label} changed from ${formatValue(oldValue)} to ${formatValue(newValue)}`;
}

export function coalesceEntries(entries) {
	const seen = new Set();
	return entries.filter(entry => {
		if (seen.has(entry.action)) return false;
		seen.add(entry.action);
		return true;
	});
}

// Verb phrases that separate a change's subject (noun) from its detail. Ordered
// longest/most-specific first isn't required — we take the earliest match.
const LEDGER_VERB_MARKERS = [
	" changed from ",
	" renamed from ",
	" set to ",
	" cleared",
	" selected",
	" deselected",
	" marked",
	" unmarked",
	" completed",
	" learned",
	" removed",
	" added",
];

/**
 * Derive the "noun" (subject) of a ledger action string — the phrase before its
 * verb — so entries can be grouped and filtered. e.g. "HP changed from 5 to 3"
 * → "HP", "Longsword selected" → "Longsword", "Asset added: Wagon" → "Asset".
 * Falls back to the whole (trimmed) action when no known verb is present.
 */
export function ledgerNoun(action) {
	const text = String(action ?? "").trim();
	if (!text) return "";
	let cut = text.length;
	for (const marker of LEDGER_VERB_MARKERS) {
		const idx = text.indexOf(marker);
		if (idx >= 0 && idx < cut) cut = idx;
	}
	return text.slice(0, cut).trim() || text;
}

/**
 * Distinct nouns present across ledger entries, with counts, sorted alphabetically.
 * @returns {{noun: string, count: number}[]}
 */
export function ledgerNounCounts(entries) {
	const counts = new Map();
	for (const entry of entries ?? []) {
		const noun = ledgerNoun(entry?.action);
		if (noun) counts.set(noun, (counts.get(noun) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([noun, count]) => ({ noun, count }))
		.sort((a, b) => a.noun.localeCompare(b.noun));
}

function labelForPath(path) {
	if (SYSTEM_PATH_LABELS[path]) return SYSTEM_PATH_LABELS[path];
	if (FLAG_PATH_LABELS[path]) return FLAG_PATH_LABELS[path];
	const namespace = SORTED_NAMESPACE_PREFIXES.find(prefix => path === prefix || path.startsWith(`${prefix}.`));
	if (namespace) return FLAG_NAMESPACE_LABELS[namespace];
	return null;
}

export function prettifySlug(slug) {
	return String(slug ?? "")
		.split(/[-_:]/)
		.filter(Boolean)
		.map(part => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ") || "Unknown";
}

// The ledger wants null (not "") for an empty value so a rich-text clear reads as a removal;
// otherwise it's the shared strip-HTML helper.
function stripHtml(value) {
	return stripHtmlToText(value) || null;
}

function firstLabelPart(value) {
	return (stripHtml(value) ?? "").split(",")[0]?.trim() || null;
}

// Cap a long detail phrase (e.g. an arcanum's unlock-requirement sentence, which can run
// 250+ chars) to a readable ledger length, cutting on a word boundary when one is near.
function truncateDetail(text, max = 64) {
	const t = String(text ?? "").trim();
	if (t.length <= max) return t;
	const slice = t.slice(0, max);
	const lastSpace = slice.lastIndexOf(" ");
	return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

function getPlaybookFlags(actor, snapshot) {
	const snapshotPlaybook = snapshot?.playbook;
	if (snapshotPlaybook?.backgrounds || snapshotPlaybook?.crew || snapshotPlaybook?.animalCompanion) return snapshotPlaybook;

	const playbookItem = [...(actor.items ?? [])].find(item => item?.type === "playbook");
	return playbookItem?.flags?.stonetop ?? playbookItem?.flags?.[LEDGER_SCOPE] ?? null;
}

function addPossessionChoiceNames(names, possession) {
	for (const choice of possession.choices?.options ?? []) {
		names.possessionChoices.set(`${possession.slug}:${choice.slug}`, stripHtml(choice.label) ?? prettifySlug(choice.slug));
	}
	for (const group of possession.choiceGroups ?? []) {
		for (const choice of group.options ?? []) {
			names.possessionChoices.set(`${possession.slug}:${choice.slug}`, stripHtml(choice.label) ?? prettifySlug(choice.slug));
		}
	}
}

async function buildNameLookup(actor) {
	const names = {
		inventory: new Map(),
		inventoryResourceTitles: new Map(),
		arcana: new Map(),
		possessions: new Map(),
		possessionChoices: new Map(),
		backgroundChoices: new Map(),
		moveResourceTitles: new Map(),
		moveResourceNames: new Map(),
		moveMarkOptions: new Map(),
		followers: new Map(),
		crewIndividuals: new Map(),
		followerFields: new Map([
			["cost", "cost"],
			["hpCurrent", "HP"],
			["instinct", "instinct"],
			["kind", "kind"],
			["loyalty", "loyalty"],
			["name", "name"],
			["readiness", "Readiness"],
			["supplies", "supplies"],
			["tag", "tag"],
			["tags", "tags"],
			["traits", "traits"],
			["type", "type"],
		]),
	};

	const addBackgroundChoice = choice => {
		if (choice?.slug) names.backgroundChoices.set(choice.slug, stripHtml(choice.label) ?? prettifySlug(choice.slug));
	};

	const addFollower = (key, label) => {
		const name = firstLabelPart(label);
		if (name) names.followers.set(key, name);
	};

	for (const item of actor.items ?? []) {
		if (item?._id && item.name) names.inventory.set(item._id, item.name);
		// Custom moves persist their resource track by item id; map that id back to the
		// move's name/title so a ledger tick reads "<Move> - <Title>", not a raw id.
		if (item?.type === "move" && item.flags?.["stonetop-pwd"]?.custom && item._id) {
			names.moveResourceNames.set(item._id, stripHtml(item.name) ?? item.name);
			if (item.system?.resource?.title) names.moveResourceTitles.set(item._id, stripHtml(item.system.resource.title));
		}
	}

	try {
		const snapshot = await actor.typedActor?.buildSnapshot?.();
		const playbookFlags = getPlaybookFlags(actor, snapshot);
		const outfit = snapshot?.inventory?.outfit;
		for (const item of [
			...(outfit?.regularItems ?? []),
			...(outfit?.smallItems ?? []),
			...(outfit?.smallGridItems ?? []),
			...(outfit?.arcanaRegular ?? []),
			...(outfit?.arcanaSmall ?? []),
			...(outfit?.treasureRegular ?? []),
			...(outfit?.treasureSmall ?? []),
		]) {
			if (!item?.slug) continue;
			names.inventory.set(item.slug, stripHtml(item.name) ?? prettifySlug(item.slug));
			// Titled resource tracks (e.g. an arcanum's "Souls") name the track in the
			// ledger; untitled tracks (e.g. "Bow & arrows" ammo) just say "resource".
			if (item.resource?.title) names.inventoryResourceTitles.set(item.slug, stripHtml(item.resource.title));
		}
		for (const item of snapshot?.inventory?.other ?? []) {
			if (item?.ownedId) names.inventory.set(item.ownedId, stripHtml(item.name) ?? prettifySlug(item.ownedId));
		}
		// Owned arcana → tier-prefixed card name ("Minor Arcana The Key") plus its front
		// unlock-requirement and back-power option labels, so a marked box or a selected
		// requirement names the specific card and choice in the ledger.
		for (const section of [snapshot?.arcana?.minor, snapshot?.arcana?.major]) {
			for (const item of section?.items ?? []) {
				if (!item?.slug) continue;
				const tier = item.major ? "Major Arcana" : "Minor Arcana";
				const title = stripHtml(item.front?.title) ?? prettifySlug(item.slug);
				const unlockOptions = new Map();
				for (const req of item.front?.unlock?.requirements ?? []) {
					if (req?.type === "option" && req.slug) unlockOptions.set(req.slug, truncateDetail(stripHtml(req.description) ?? prettifySlug(req.slug)));
				}
				const backOptions = new Map();
				for (const opt of item.back?.options ?? []) {
					if (opt?.slug) backOptions.set(opt.slug, truncateDetail(stripHtml(opt.description) ?? prettifySlug(opt.slug)));
				}
				names.arcana.set(item.slug, { subject: `${tier} ${title}`, unlockOptions, backOptions });
			}
		}
		for (const possession of snapshot?.inventory?.possessions?.items ?? []) {
			if (!possession?.slug) continue;
			names.possessions.set(possession.slug, stripHtml(possession.label) ?? prettifySlug(possession.slug));
			addPossessionChoiceNames(names, possession);
		}
		for (const background of playbookFlags?.backgrounds ?? []) {
			for (const choice of background.choices?.options ?? []) {
				addBackgroundChoice(choice);
				if (background.slug === "initiate") addFollower(`initiate:${choice.slug}`, choice.label);
			}
		}
		for (const category of snapshot?.moves ?? []) {
			for (const move of category?.moves ?? []) {
				if (!move?.name) continue;
				if (move.resource?.title) names.moveResourceTitles.set(move.name, stripHtml(move.resource.title));
				for (const opt of move.markOptions ?? []) {
					if (opt?.slug) names.moveMarkOptions.set(`${move.name}:${opt.slug}`, { label: stripHtml(opt.label) ?? prettifySlug(opt.slug), choice: opt.choice ?? null });
				}
			}
		}
		for (const follower of snapshot?.followers?.initiates ?? []) {
			addFollower(`initiate:${follower.slug}`, follower.label);
		}
		const companionName = getActorProperty(actor, `flags.${LEDGER_SCOPE}.animalCompanion.name`);
		if (companionName) names.followers.set("animalCompanion", companionName);
		const companionKind = getActorProperty(actor, `flags.${LEDGER_SCOPE}.animalCompanion.kind`);
		if (!names.followers.has("animalCompanion") && companionKind) names.followers.set("animalCompanion", companionKind);
		const companionType = getActorProperty(actor, `flags.${LEDGER_SCOPE}.animalCompanion.type`);
		const companionTypeLabel = (playbookFlags?.animalCompanion?.types ?? []).find(type => type.slug === companionType)?.label;
		if (!names.followers.has("animalCompanion")) addFollower("animalCompanion", companionTypeLabel ?? "Animal companion");
		const crewName = getActorProperty(actor, `flags.${LEDGER_SCOPE}.crew.name`);
		addFollower("crew", crewName || "Crew");
		for (const [index, individual] of Object.entries(getActorProperty(actor, `flags.${LEDGER_SCOPE}.crew.individuals`) ?? [])) {
			if (individual?.name) names.crewIndividuals.set(String(index), individual.name);
		}
		// Custom followers (walkthrough / monster conversion / arcana summon): name from
		// the stored record so a Loyalty/HP change reads "<Name> loyalty changed…".
		for (const [id, data] of Object.entries(getActorProperty(actor, `flags.${LEDGER_SCOPE}.customFollowers`) ?? {})) {
			addFollower(`custom:${id}`, data?.name || "A follower");
		}
		// Beast / livestock followers: name comes from the catalog by owned slug.
		for (const slug of getActorProperty(actor, `flags.${LEDGER_SCOPE}.inventory.addedSpecial`) ?? []) {
			const beastName = BEAST_CATALOG[slug]?.name;
			if (beastName) names.followers.set(`beast:${slug}`, beastName);
		}
	} catch (err) {
		console.warn("Stonetop | Could not build ledger name lookup", err);
	}

	return names;
}

function nameFrom(map, slug) {
	return map.get(slug) ?? prettifySlug(slug);
}

function inventorySelectionEntry(path, oldValue, newValue, names) {
	const slug = path.slice(INVENTORY_CHECKED_PREFIX.length);
	const itemName = nameFrom(names.inventory, slug);
	if (!!oldValue === !!newValue) return null;
	return { action: `${itemName} ${newValue ? "selected" : "deselected"}` };
}

// "<Name> - <Title>" for a titled track (an arcanum's "Souls", the Blessed's
// "Favor"), else "<Name> resource". Shared by inventory- and move-resource tracks.
function resourceEntry(name, title, oldValue, newValue) {
	const label = title ? `${name} - ${title}` : `${name} resource`;
	return { action: actionForField(label, oldValue, newValue) };
}

function inventoryResourceEntry(path, oldValue, newValue, names) {
	const slug = path.slice(INVENTORY_RESOURCE_PREFIX.length);
	return resourceEntry(nameFrom(names.inventory, slug), names.inventoryResourceTitles.get(slug), oldValue, newValue);
}

function moveResourceEntry(path, oldValue, newValue, names) {
	const key = path.slice(MOVE_RESOURCE_PREFIX.length);
	// Custom moves key by item id; resolve it back to the move name for the subject.
	const subject = names.moveResourceNames.get(key) ?? key;
	return resourceEntry(subject, names.moveResourceTitles.get(key), oldValue, newValue);
}

function moveMarkEntries(path, oldValue, newValue, names) {
	const key        = path.slice(MOVE_MARKS_PREFIX.length);
	const dot        = key.lastIndexOf(".");
	const moveName   = dot >= 0 ? key.slice(0, dot) : key;
	const optionSlug = dot >= 0 ? key.slice(dot + 1) : key;
	const option     = names.moveMarkOptions.get(`${moveName}:${optionSlug}`);
	const subject    = `${moveName} - ${option?.label ?? prettifySlug(optionSlug)}`;
	const oldEntries = Array.isArray(oldValue) ? oldValue : [];
	const newEntries = Array.isArray(newValue) ? newValue : [];

	// Stat-choice marks (Potential for Greatness): each slot picks a stat. Report
	// every slot whose chosen stat changed. The +1/-1 to the stat itself rides the
	// same update and is logged separately, so this just attributes it to the move.
	if (option?.choice === "stat") {
		const slots = Math.max(oldEntries.length, newEntries.length);
		const entries = [];
		for (let i = 0; i < slots; i++) {
			const oldStat = oldEntries[i]?.stat ?? "";
			const newStat = newEntries[i]?.stat ?? "";
			if (oldStat === newStat) continue;
			if (oldStat) entries.push({ action: `${subject}: ${oldStat.toUpperCase()} unmarked` });
			if (newStat) entries.push({ action: `${subject}: ${newStat.toUpperCase()} marked` });
		}
		return entries;
	}

	// Count-style marks (a checkbox track): report the net direction of the change.
	if (oldEntries.length === newEntries.length) return [];
	return [{ action: `${subject} ${newEntries.length > oldEntries.length ? "marked" : "unmarked"}` }];
}

function backgroundChoiceEntry(path, oldValue, newValue, names) {
	const slug = path.slice(BACKGROUND_CHOICES_PREFIX.length);
	const choiceName = nameFrom(names.backgroundChoices, slug);
	if (!!oldValue === !!newValue) return null;
	return { action: `${choiceName} ${newValue ? "selected" : "deselected"}` };
}

function followerFieldEntry(followerName, field, oldValue, newValue) {
	const label = field ? `${followerName} ${field}` : followerName;
	return { action: actionForField(label, oldValue, newValue) };
}

function animalCompanionEntry(path, oldValue, newValue, names) {
	const field = path.slice(ANIMAL_COMPANION_PREFIX.length).split(".")[0];
	const followerName = names.followers.get("animalCompanion") ?? "Animal companion";
	return followerFieldEntry(followerName, names.followerFields.get(field), oldValue, newValue);
}

function crewEntry(path, oldValue, newValue, names) {
	const key = path.slice(CREW_PREFIX.length);
	if (key.startsWith("individuals.")) {
		const [, index, field] = key.split(".");
		const followerName = names.crewIndividuals.get(index);
		return followerFieldEntry(followerName || `Crew member ${Number(index) + 1}`, names.followerFields.get(field), oldValue, newValue);
	}
	const field = key.split(".")[0];
	const followerName = names.followers.get("crew") ?? "Crew";
	return followerFieldEntry(followerName, names.followerFields.get(field), oldValue, newValue);
}

// Custom follower record (customFollowers.<id>.<field>). Only the play-relevant scalar
// tracks (Loyalty / HP / Readiness) of an ALREADY-EXISTING follower become ledger lines.
// Creation, duplicate, transfer, removal, and detail edits (name/cost/instinct/tags/…) stay
// quiet so the ledger isn't flooded: a whole-record create/duplicate/transfer flattens into
// one write per field, and buildNameLookup runs against the pre-update state — so a brand-new
// follower has no entry in names.followers, and its initial-value writes are suppressed here.
const CUSTOM_FOLLOWER_LOGGED_FIELDS = new Set(["loyalty", "hpCurrent", "readiness"]);

function customFollowerEntry(path, oldValue, newValue, names) {
	const key = path.slice(CUSTOM_FOLLOWERS_PREFIX.length);
	const dot = key.indexOf(".");
	const id = dot >= 0 ? key.slice(0, dot) : key;
	const field = dot >= 0 ? key.slice(dot + 1) : "";
	if (!CUSTOM_FOLLOWER_LOGGED_FIELDS.has(field)) return null;
	// A brand-new follower isn't in the pre-update name map; suppressing it here keeps a
	// whole-record create/duplicate/transfer from emitting a line per field.
	const followerName = names.followers.get(`custom:${id}`);
	if (!followerName) return null;
	return followerFieldEntry(followerName, names.followerFields.get(field), oldValue, newValue);
}

// Per-slug follower track (beast / initiate Loyalty, HP, Readiness): the flag key
// after the prefix is the follower's slug; `keyPrefix` selects its name map.
function perSlugFollowerEntry(path, prefix, keyPrefix, field, oldValue, newValue, names) {
	const slug = path.slice(prefix.length);
	const followerName = names.followers.get(`${keyPrefix}:${slug}`) ?? prettifySlug(slug);
	return followerFieldEntry(followerName, field, oldValue, newValue);
}

function possessionSelectionEntries(oldValue, newValue, names) {
	const oldSet = new Set(Array.isArray(oldValue) ? oldValue : []);
	const newSet = new Set(Array.isArray(newValue) ? newValue : []);
	const entries = [];
	for (const slug of newSet) {
		if (!oldSet.has(slug)) entries.push({ action: `${nameFrom(names.possessions, slug)} selected` });
	}
	for (const slug of oldSet) {
		if (!newSet.has(slug)) entries.push({ action: `${nameFrom(names.possessions, slug)} deselected` });
	}
	return entries;
}

// Write-in possessions carry their own label, so diff the { slug, label } list
// directly rather than looking names up in the snapshot.
function possessionCustomEntries(oldValue, newValue) {
	const oldBySlug = new Map((Array.isArray(oldValue) ? oldValue : []).map(c => [c.slug, c.label]));
	const newBySlug = new Map((Array.isArray(newValue) ? newValue : []).map(c => [c.slug, c.label]));
	const entries = [];
	for (const [slug, label] of newBySlug) {
		if (!oldBySlug.has(slug)) entries.push({ action: `${label} added (write-in possession)` });
	}
	for (const [slug, label] of oldBySlug) {
		if (!newBySlug.has(slug)) entries.push({ action: `${label} removed (write-in possession)` });
	}
	return entries;
}

// Ledger the wound lifecycle: additions, removals, heals (→ scars), reopens, and status
// changes. Move-driven writes (Recover, Convalesce) tag these "via <move>" through the
// update's stonetopMove option. Wound text is included — wounds are no longer hidden.
const WOUND_STATUS_VERB = { problematic: "became problematic", stabilized: "stabilized", permanent: "became permanent" };

function woundLedgerEntries(oldValue, newValue) {
	const oldById = new Map((Array.isArray(oldValue) ? oldValue : []).map(w => [w.id, w]));
	const newById = new Map((Array.isArray(newValue) ? newValue : []).map(w => [w.id, w]));
	const label = (w) => (w?.text ? `"${stripHtml(w.text)}"` : "a wound");
	const entries = [];
	for (const [id, w] of newById) {
		const prev = oldById.get(id);
		if (!prev) { entries.push({ action: `Wound recorded: ${label(w)}` }); continue; }
		if (!prev.healed && w.healed)      entries.push({ action: `Wound healed to a scar: ${label(w)}` });
		else if (prev.healed && !w.healed) entries.push({ action: `Wound reopened: ${label(w)}` });
		else if (prev.status !== w.status) entries.push({ action: `Wound ${WOUND_STATUS_VERB[w.status] ?? "updated"}: ${label(w)}` });
	}
	for (const [id, w] of oldById) {
		if (!newById.has(id)) entries.push({ action: `Wound removed: ${label(w)}` });
	}
	return entries;
}

function possessionUsesEntry(path, oldValue, newValue, names) {
	const slug = path.slice(POSSESSION_USES_PREFIX.length);
	const itemName = nameFrom(names.possessions, slug);
	return { action: `${itemName} uses changed from ${formatValue(oldValue)} to ${formatValue(newValue)}` };
}

function possessionSubchoiceEntries(path, oldValue, newValue, names) {
	const possessionSlug = path.slice(POSSESSION_SUBCHOICES_PREFIX.length);
	const oldSet = new Set(Array.isArray(oldValue) ? oldValue : []);
	const newSet = new Set(Array.isArray(newValue) ? newValue : []);
	const possessionName = nameFrom(names.possessions, possessionSlug);
	const entries = [];
	for (const choiceSlug of newSet) {
		if (!oldSet.has(choiceSlug)) {
			const choiceName = nameFrom(names.possessionChoices, `${possessionSlug}:${choiceSlug}`);
			entries.push({ action: `${possessionName}: ${choiceName} selected` });
		}
	}
	for (const choiceSlug of oldSet) {
		if (!newSet.has(choiceSlug)) {
			const choiceName = nameFrom(names.possessionChoices, `${possessionSlug}:${choiceSlug}`);
			entries.push({ action: `${possessionName}: ${choiceName} deselected` });
		}
	}
	return entries;
}

function possessionChoiceCarriedEntry(path, oldValue, newValue, names) {
	const key = path.slice(POSSESSION_CHOICE_CARRIED_PREFIX.length);
	const [possessionSlug] = key.split(":");
	if (!!oldValue === !!newValue) return null;
	const possessionName = nameFrom(names.possessions, possessionSlug);
	const choiceName = nameFrom(names.possessionChoices, key);
	return { action: `${possessionName}: ${choiceName} ${newValue ? "carried" : "set down"}` };
}

function possessionChoiceUsesEntry(path, oldValue, newValue, names) {
	const key = path.slice(POSSESSION_CHOICE_USES_PREFIX.length);
	const [possessionSlug, choiceSlug] = key.split(":");
	const possessionName = nameFrom(names.possessions, possessionSlug);
	const choiceName = nameFrom(names.possessionChoices, key);
	return { action: `${possessionName}: ${choiceName} uses changed from ${formatValue(oldValue)} to ${formatValue(newValue)}` };
}

// "Minor Arcana The Key" for a known card, else "Arcana <Slug>" when the snapshot
// couldn't resolve it (e.g. a card removed in the same breath as its marks clearing).
function arcanaSubject(names, slug) {
	return names.arcana.get(slug)?.subject ?? `Arcana ${prettifySlug(slug)}`;
}

// Describe an arcana track glyph by side, kind, and 1-based position — the boxes carry no
// authored label of their own, only their glyph (◇ diamond, ○ circle, □ box) and index.
function arcanaBoxDetail(context, index) {
	const n = Number(index) + 1;
	if (context === "unlock") return `unlock ${n}`;
	const side = context.startsWith("back") ? "back" : "front";
	const kind = context.endsWith("Diamond") ? "diamond" : context.endsWith("Circle") ? "circle" : "box";
	return `${side} ${kind} ${n}`;
}

function arcanaBoxEntry(path, oldValue, newValue, names) {
	const [slug, context = "", index = ""] = path.slice(ARCANA_BOXES_PREFIX.length).split(":");
	if (!!oldValue === !!newValue) return null;
	return { action: `${arcanaSubject(names, slug)}: ${arcanaBoxDetail(context, index)} ${newValue ? "marked" : "unmarked"}` };
}

// Front unlock requirements and back power options are count tracks keyed "<slug>:<option>".
// They can hold more than one mark, so describe each change as a mark added or removed — not
// "selected/deselected", which would wrongly read as the whole option turning off when a
// multi-mark option merely drops a mark (e.g. 3 → 2). `optionField` picks which label map
// (unlockOptions / backOptions) names the specific choice.
function arcanaOptionEntry(path, prefix, optionField, oldValue, newValue, names) {
	const key = path.slice(prefix.length);
	const colon = key.indexOf(":");
	const slug = colon >= 0 ? key.slice(0, colon) : key;
	const optionSlug = colon >= 0 ? key.slice(colon + 1) : "";
	const label = names.arcana.get(slug)?.[optionField]?.get(optionSlug) ?? prettifySlug(optionSlug);
	const marked = Number(newValue ?? 0) > Number(oldValue ?? 0);
	return { action: `${arcanaSubject(names, slug)}: ${label} ${marked ? "marked" : "unmarked"}` };
}

function granularEntriesForPath(path, oldValue, newValue, names) {
	if (path.startsWith(INVENTORY_CHECKED_PREFIX)) return [inventorySelectionEntry(path, oldValue, newValue, names)].filter(Boolean);
	if (path.startsWith(INVENTORY_RESOURCE_PREFIX)) return [inventoryResourceEntry(path, oldValue, newValue, names)];
	if (path.startsWith(MOVE_RESOURCE_PREFIX)) return [moveResourceEntry(path, oldValue, newValue, names)];
	if (path.startsWith(MOVE_MARKS_PREFIX)) return moveMarkEntries(path, oldValue, newValue, names);
	if (path.startsWith(BACKGROUND_CHOICES_PREFIX)) return [backgroundChoiceEntry(path, oldValue, newValue, names)].filter(Boolean);
	if (path.startsWith(INITIATES_LOYALTY_PREFIX)) return [perSlugFollowerEntry(path, INITIATES_LOYALTY_PREFIX, "initiate", "loyalty", oldValue, newValue, names)];
	if (path.startsWith(INITIATES_HP_PREFIX)) return [perSlugFollowerEntry(path, INITIATES_HP_PREFIX, "initiate", "HP", oldValue, newValue, names)];
	if (path.startsWith(INITIATES_READINESS_PREFIX)) return [perSlugFollowerEntry(path, INITIATES_READINESS_PREFIX, "initiate", "Readiness", oldValue, newValue, names)];
	if (path.startsWith(ANIMAL_COMPANION_PREFIX)) return [animalCompanionEntry(path, oldValue, newValue, names)];
	if (path.startsWith(CREW_PREFIX)) return [crewEntry(path, oldValue, newValue, names)];
	if (path.startsWith(CUSTOM_FOLLOWERS_PREFIX)) return [customFollowerEntry(path, oldValue, newValue, names)].filter(Boolean);
	if (path.startsWith(BEAST_LOYALTY_PREFIX)) return [perSlugFollowerEntry(path, BEAST_LOYALTY_PREFIX, "beast", "loyalty", oldValue, newValue, names)];
	if (path.startsWith(BEAST_HP_PREFIX)) return [perSlugFollowerEntry(path, BEAST_HP_PREFIX, "beast", "HP", oldValue, newValue, names)];
	if (path.startsWith(BEAST_READINESS_PREFIX)) return [perSlugFollowerEntry(path, BEAST_READINESS_PREFIX, "beast", "Readiness", oldValue, newValue, names)];
	if (path === POSSESSION_SELECTED_PATH) return possessionSelectionEntries(oldValue, newValue, names);
	if (path === POSSESSION_CUSTOM_PATH) return possessionCustomEntries(oldValue, newValue);
	if (path === WOUNDS_PATH) return woundLedgerEntries(oldValue, newValue);
	if (path.startsWith(POSSESSION_USES_PREFIX)) return [possessionUsesEntry(path, oldValue, newValue, names)];
	if (path.startsWith(POSSESSION_SUBCHOICES_PREFIX)) return possessionSubchoiceEntries(path, oldValue, newValue, names);
	if (path.startsWith(POSSESSION_CHOICE_USES_PREFIX)) return [possessionChoiceUsesEntry(path, oldValue, newValue, names)];
	if (path.startsWith(POSSESSION_CHOICE_CARRIED_PREFIX)) return [possessionChoiceCarriedEntry(path, oldValue, newValue, names)].filter(Boolean);
	if (path.startsWith(ARCANA_BOXES_PREFIX)) return [arcanaBoxEntry(path, oldValue, newValue, names)].filter(Boolean);
	if (path.startsWith(ARCANA_UNLOCK_PREFIX)) return [arcanaOptionEntry(path, ARCANA_UNLOCK_PREFIX, "unlockOptions", oldValue, newValue, names)];
	if (path.startsWith(ARCANA_BACK_OPTIONS_PREFIX)) return [arcanaOptionEntry(path, ARCANA_BACK_OPTIONS_PREFIX, "backOptions", oldValue, newValue, names)];
	return null;
}

async function actorUpdateEntries(actor, changed) {
	const names = await buildNameLookup(actor);
	const entries = [];
	for (const [path, newValue] of Object.entries(foundry.utils.flattenObject(changed))) {
		const normalizedPath = normalizeFlagPath(path);
		if (!normalizedPath || normalizedPath === `flags.${LEDGER_SCOPE}.${LEDGER_KEY}` || normalizedPath.startsWith(`flags.${LEDGER_SCOPE}.${LEDGER_KEY}.`)) continue;

		if (normalizedPath === "system.playbook" || normalizedPath.startsWith("system.playbook.")) {
			const oldName = actor.system?.playbook?.name;
			const newName = normalizedPath === "system.playbook"
				? newValue?.name
				: normalizedPath === "system.playbook.name"
					? newValue
					: foundry.utils.getProperty(changed, "system.playbook.name");
			if (newName && oldName !== newName) {
				entries.push({
					action: oldName ? `Playbook changed from ${oldName} to ${newName}` : `Playbook added: ${newName}`,
				});
			}
			continue;
		}

		const oldValue = getActorProperty(actor, normalizedPath);
		if (valuesEqual(oldValue, newValue)) continue;

		const granularEntries = granularEntriesForPath(normalizedPath, oldValue, newValue, names);
		if (granularEntries) {
			entries.push(...granularEntries);
			continue;
		}

		const label = labelForPath(normalizedPath);
		if (!label) continue;

		entries.push({ action: actionForField(label, oldValue, newValue) });
	}
	return coalesceEntries(entries);
}

function itemTypeLabel(item) {
	const moveType = item.system?.moveType;
	if (item.type === "playbook") return "Playbook";
	if (item.type !== "move") return item.type ?? "Item";
	if (moveType === "arcanum") return "Arcanum";
	if (moveType === "inventory-custom") return "Inventory item";
	if (moveType === "post-death") return "Post-death move";
	return "Move";
}

function createdItemAction(item) {
	const label = itemTypeLabel(item);
	if (label === "Move" || label === "Post-death move") return `${item.name} learned`;
	if (label === "Playbook") return `Playbook added: ${item.name}`;
	return `${label} added: ${item.name}`;
}

function deletedItemAction(item) {
	const label = itemTypeLabel(item);
	if (label === "Move" || label === "Post-death move") return `${item.name} removed`;
	if (label === "Playbook") return `Playbook removed: ${item.name}`;
	return `${label} removed: ${item.name}`;
}

export class CharacterLedger {
	static getEntries(actor) {
		return actor.getFlag?.(LEDGER_SCOPE, LEDGER_KEY) ?? [];
	}

	static async append(actor, entries, { userId = globalThis.game?.user?.id } = {}) {
		if (!actor || actor.type !== "character" || !entries?.length) return;
		const current = this.getEntries(actor);
		const user = userId ? globalThis.game?.users?.get?.(userId) : null;
		const stamped = entries.map(entry => ({
			id: globalThis.foundry?.utils?.randomID?.() ?? `${Date.now()}-${Math.random()}`,
			timestamp: Date.now(),
			userId: userId ?? null,
			userName: user?.name ?? globalThis.game?.user?.name ?? "Unknown",
			action: entry.action,
			// Name of the move that caused this change, when the change was a move's
			// automated effect (e.g. "+1 XP on a miss" → the rolled move). null for
			// plain sheet edits.
			move: entry.move ?? null,
		}));
		await actor.update({
			[`flags.${LEDGER_SCOPE}.${LEDGER_KEY}`]: stamped.concat(current.slice(0, LEDGER_MAX_ENTRIES - stamped.length)),
		}, { stonetopLedger: true, render: false });
	}

	static entriesForActorUpdate(actor, changed) {
		return actorUpdateEntries(actor, changed);
	}

	static async deleteEntries(actor, ids) {
		if (!actor || actor.type !== "character" || !ids?.size) return;
		const current = this.getEntries(actor);
		await actor.update({
			[`flags.${LEDGER_SCOPE}.${LEDGER_KEY}`]: current.filter(e => !ids.has(e.id)),
		}, { stonetopLedger: true });
	}

	static entriesForCreatedItems(items) {
		return items.map(item => ({ action: createdItemAction(item) }));
	}

	static entriesForDeletedItems(items) {
		return items.map(item => ({ action: deletedItemAction(item) }));
	}
}
