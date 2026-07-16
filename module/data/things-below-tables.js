// The "Things Below" pick-or-roll tables (Stonetop Book II, "The Things Below",
// pp. 412-437): the theme / aspect / instinct tables used to flesh out a Thing
// (p. 416-417), the corrupted-site feature / cause / severity tables (p. 422),
// the emanation origin table (p. 436), and the name/title word-lists (p. 418).
//
// Kept free of Foundry/DOM so the tables + roll/name helpers are unit-testable; the
// Things-Below wizards wire them to controls and feed the picks into a threat seed.
// This is the single source of truth shared by the Create-a-Thing and Corrupted-Site
// dialogs, the analogue of artifact-creation-tables.js for the arcana wizard.

import { rollOnTable } from "./artifact-creation-tables.js";

/** Build a straight 1d12 table from twelve rows (each its own roll). Rows may be a
 *  plain string or an object; either way it gets a { min, max } 1d12 span so the shared
 *  rollOnTable weighting works. */
const seq = rows => rows.map((row, i) =>
	typeof row === "string" ? { id: i + 1, min: i + 1, max: i + 1, text: row }
	                        : { id: i + 1, min: i + 1, max: i + 1, ...row });

/** Build a ranged 1d12 table from [min, max, extra?] rows, so a weighted roll reproduces
 *  the book's odds (e.g. a 3-5 span is three times as likely as a single result). */
const ranges = rows => rows.map(([min, max, extra]) =>
	typeof extra === "string" ? { min, max, text: extra } : { min, max, ...extra });

// ── Themes (1d12) — p. 416 ────────────────────────────────────────────────────
// Choose or roll 2+. Each carries the book's evocative gloss + the associated
// materials/imagery (shown as a hint on the pick and folded into inspiration).
export const THEMES = seq([
	{ text: "Darkness / cold / despair", note: "the swallowing of light, warmth, and hope", materials: "obsidian, hoarfrost" },
	{ text: "Denial / shame / secrets / deceit", note: "the rejection of truth, forgiveness, trust", materials: "pearls, eyes, masks" },
	{ text: "Delusion / delirium / nightmare", note: "the loss of self, the breaking of minds and wills", materials: "quicksilver, mirrors, reflections" },
	{ text: "Hunger / need / addiction", note: "lack and desperation, the howling want", materials: "wind, fangs, meat" },
	{ text: "Cruelty / torture / violence / rage", note: "the urge to hurt, kill, and dominate", materials: "red crystal, spilled blood" },
	{ text: "Destruction / chaos / ruin / ignorance", note: "the tower crumbling; anxiety and loss", materials: "fire, ash, dust" },
	{ text: "Wounds / injury / pain", note: "the rending of flesh, the breaking of bone", materials: "blood, bones, claws, blades" },
	{ text: "Corruption / disease / decay", note: "the loss of strength, wholeness, wellness", materials: "vermin, poison, acid, filth" },
	{ text: "Gluttony / greed / jealousy", note: "the need for more, ever more", materials: "mouths, serpents, gems, swarms" },
	{ text: "Confinement / suffocation / pressure / abuse", note: "the crushing weight of helplessness", materials: "chains, water, earth" },
	{ text: "Mutation / transformation / roiling flesh", note: "the malleability of the body", materials: "wax, clay, slime, tentacles" },
	{ text: "Death / undeath / loss / grief", note: "the end of all things, the refusal to let go", materials: "skulls, tombs, pyres" },
]);

/** A theme's card/label string: its name plus its associated imagery. */
export function themeLabel(entry) {
	return entry?.materials ? `${entry.text} (${entry.materials})` : String(entry?.text ?? "");
}

/** Resolve a Set/iterable of theme ids to their card/label strings (unknown ids dropped). */
export function themeLabels(ids) {
	return [...ids].map(id => themeLabel(THEMES.find(t => t.id === id))).filter(Boolean);
}

/** The theme checklist view-model for a wizard step: one row per theme, ticked if its id is
 *  in `idSet`. Shared by all three Things-Below wizards (a `note` some templates ignore). */
export function themeCheckboxes(idSet) {
	return THEMES.map(t => ({ id: t.id, label: themeLabel(t), note: t.note, checked: idSet.has(t.id) }));
}

/** Resolve a Set/iterable of aspect ids to their text strings (unknown ids dropped). */
export function aspectTexts(ids) {
	return [...ids].map(id => ASPECTS.find(a => a.id === id)?.text).filter(Boolean);
}

/** The aspect checklist view-model for a wizard step: one row per aspect, ticked if in `idSet`. */
export function aspectCheckboxes(idSet) {
	return ASPECTS.map(a => ({ id: a.id, label: a.text, checked: idSet.has(a.id) }));
}

// ── Aspects (1d12) — p. 417 ───────────────────────────────────────────────────
// Choose or roll 2+. "Make their aspects impossible and weird, things of
// fever-dream and drug-fueled vision" — they are not bound by biology or physics.
export const ASPECTS = seq([
	"Chitin / shell / carapace / armor",
	"An elder / a crone / a stooped old man",
	"Fire / light / haze / cloud / vortex / void",
	"Horns / wings / tail(s) / hooves",
	"The inanimate, animated / an amalgamation of things",
	"Many-limbed / many-headed / many-eyed / many-bodied",
	"Moisture / tentacles / slime / ooze",
	"A predator / a warrior / a warlord / a ruler",
	"Scales / sinew / suppleness",
	"Skulls / bones / corpses / death",
	"Vastness / immensity",
	"A youth / a child / an infant",
]);

// ── Instincts (1d12) — p. 417 ─────────────────────────────────────────────────
// Choose or roll one (or invent your own). "Tweak the instinct you choose to
// reflect your growing understanding of this particular Thing Below."
export const INSTINCTS = seq([
	"To stoke conflict, confusion, distrust",
	"To erode hope / faith / honor / self-image",
	"To hide / bury / smother things or ideas",
	"To deprive others of what they need",
	"To inflict harm, cruelly and unnecessarily",
	"To desecrate / mutilate / ruin things of value",
	"To shock / terrify / horrify others",
	"To wantonly devour and consume",
	"To befoul and corrupt beauty / strength / dignity",
	"To fight and hurt and kill and rage and hurt some more",
	"To dominate, punish, and crush",
	"To simply destroy, nothing more and nothing less",
]);

// ── Corrupted-site feature (1d12) — p. 422 ────────────────────────────────────
// "If the site itself hasn't been established, combine the terrain in which it is
// located with a feature."
export const SITE_FEATURES = ranges([
	[1,  1,  "Nothing to mark it but the terrain itself"],
	[2,  3,  "A distinctive (un)natural landmark (big tree, natural arch, spring, etc.)"],
	[4,  4,  "Signs of great destruction (ash fields, crevasse, lava flow, mudslide, etc.)"],
	[5,  5,  "A beast's lair / burrow / den"],
	[6,  6,  "A tomb / barrow / memorial, left by the locals or their ancestors"],
	[7,  7,  "An old dwelling / gathering place of the locals or their ancestors"],
	[8,  8,  "A ruin of the Makers, or a lingering sign of their presence"],
	[9,  12, "Deep water, the depths obscure, conceals the site"],
]);

// ── Corrupted-site cause (1d12) — p. 422 ──────────────────────────────────────
// "Pick or roll the cause and severity of the corruption." A trailing * in the
// book means "decide whether this was intentional, misguided, or accidental" — carried
// as `fateful:true` so the wizard can prompt the Die of Fate.
export const SITE_CAUSES = ranges([
	[1,  1,  { text: "Erosion / shifting earth / the implacable passage of time" }],
	[2,  2,  { text: "A failed attempt to wield primordial power" }],
	[3,  5,  { text: "An artifact / a sorcerer's bones / remains of a corrupted beast, left to fester", fateful: true }],
	[6,  8,  { text: "An offering of flesh / blood / trauma, intentional or not", fateful: true }],
	[9,  10, { text: "A summoning / an invocation / a misguided invitation", fateful: true }],
	[11, 12, { text: "A seal or binding that kept prior corruption in check, now weakened", fateful: true }],
]);

// ── Corrupted-site severity (1d12) — p. 422 ───────────────────────────────────
// An ordered escalation ladder: a site accrues the dangers of every level up to its
// own ("The dangers from a lower level of severity can be found in higher levels, too").
// `level` orders the ladder so the wizard can seed a MacGuffin's grim portents from the
// levels ABOVE the chosen severity (it "getting worse"), ending in "a wound in the world".
export const SITE_SEVERITIES = ranges([
	[1,  3,  { level: 1, key: "shunned",   text: "A shunned place",     danger: "disquiet and unease", detail: "full of disquiet and unease; not actively dangerous, but where it's easy to draw upon their power" }],
	[4,  6,  { level: 2, key: "hungry",    text: "A hungry place",      danger: "whispers and visions", detail: "full of whispers and visions, calling the unwholesome, trapping and consuming the unwary" }],
	[7,  9,  { level: 3, key: "poisonous", text: "A poisonous place",   danger: "unnatural phenomena",  detail: "full of unnatural phenomena, corrupting those who visit" }],
	[10, 11, { level: 4, key: "spawning",  text: "A spawning place",    danger: "congealing emanations", detail: "where emanations congeal and manifest" }],
	[12, 12, { level: 5, key: "wound",     text: "A wound in the world", danger: "spreading rot",        detail: "spreading rot, bleeding horror, getting worse" }],
]);

// The severity ladder in level order, for seeding a corrupted-site doom track.
const _SEVERITY_LADDER = [...SITE_SEVERITIES].sort((a, b) => a.level - b.level);

/**
 * Seed a corrupted-site's doom track from its chosen severity. A site "getting worse"
 * climbs the severity ladder, so the grim portents are the levels ABOVE the chosen one
 * and the impending doom is the top of the ladder ("a wound in the world"). A site that
 * is already a wound has no room to worsen, so it gets an empty track.
 * @param {string} severityKey  a SITE_SEVERITIES key (shunned/hungry/poisonous/spawning/wound)
 * @returns {{ grimPortents: {text:string, done:boolean}[], impendingDoom: {text:string, done:boolean} }}
 */
export function seedSiteDoomTrack(severityKey) {
	const chosen = _SEVERITY_LADDER.find(s => s.key === severityKey);
	const from = chosen ? chosen.level : 1;
	const worse = _SEVERITY_LADDER.filter(s => s.level > from);
	const top = worse.length ? worse[worse.length - 1] : null;
	const middle = top ? worse.slice(0, -1) : worse;
	return {
		grimPortents: middle.map(s => ({ text: `${s.text}: ${s.danger}`, done: false })),
		impendingDoom: top ? { text: `${top.text}: ${top.danger}`, done: false } : { text: "", done: false },
	};
}

// ── Corrupted-site danger GM moves (pp. 428-429) ──────────────────────────────
// Each severity level unlocks a category of dangers ("The dangers from a lower level of
// severity can be found in higher levels, too"), so a site accrues the GM moves of every
// level up to its own. Keyed by SITE_SEVERITIES.level; siteDangerMoves() returns the
// cumulative set to seed a corrupted-site threat's GM moves.
export const SITE_DANGER_MOVES = {
	1: [ // Disquiet and unease
		"Introduce something ominous (a cold spot, a gust of wind, mist, a foul stench)",
		"Ask about their fears, doubts, shames, or animosities",
		"Reveal a lack of natural spirits, or only unsavory ones",
	],
	2: [ // Whispers and visions
		"Twist their senses; lure them deeper or closer",
		"Fill them with growing dread; keep them from sleeping",
		"Whisper a suggestion or compulsion",
	],
	3: [ // Unnatural phenomena
		"Present something impossible and disturbing (bleeding walls, water on the ceiling)",
		"Have light sources dim, sputter, or snuff out; food spoil, drink foul",
		"Eat away at their gear, or corrupt them",
	],
	4: [ // Spawning
		"Manifest an emanation from the corrupted site",
	],
	5: [ // A wound in the world
		"Spread its rot to the surrounding area, bleeding horror outward",
	],
};

/** The cumulative danger GM moves for a site of the given severity level (1-5). */
export function siteDangerMoves(level = 1) {
	const out = [];
	const seen = new Set();
	for (let l = 1; l <= level; l++) {
		for (const m of SITE_DANGER_MOVES[l] ?? []) {
			if (seen.has(m)) continue;
			seen.add(m);
			out.push(m);
		}
	}
	return out;
}

// ── Cleansing a corrupted site (p. 423) ───────────────────────────────────────
// Not a d12 table — the book's bulleted "Make a Plan" requirements and the list of
// things one might use to bind the evil. Offered as a checklist that populates the
// threat's `cleansing` field.
export const CLEANSING_REQUIREMENTS = [
	"Learn the name of the Thing Below that taints this place",
	"Find the seed of corruption within the site",
	"Create or obtain something with which to bind the evil",
	"Repair the bindings that previously held back the corruption",
	"Enlist the help of a powerful spirit or Fae",
	"Days or weeks of prayer and ritual cleansing",
	"Wait until high noon / the solstice / the equinox / the full moon",
	"The best you can do is stop it getting worse",
	"Burn sacks of bendis root (Value 2)",
	"Risk being corrupted yourselves",
	"Risk making things much worse",
];

export const CLEANSING_BINDINGS = [
	"A tree, especially an elder tree",
	"A large piece of stone / crystal / amber / dark ice",
	"A ring of runes, deeply etched",
	"A spike or vessel of bronze, orichalcum, or black iron",
	"A Fae domain",
	"A barrow / cairn / vault / urn / vessel, sealed and sanctified",
	"A perpetual holy flame",
	"The bones of a pure soul, properly carved and prepared",
];

// ── Emanation origin (1d12) — p. 436 ──────────────────────────────────────────
// "Pick or roll for its origin." How this discharge of a Thing Below came to be.
export const EMANATION_ORIGINS = ranges([
	[1,  2,  "Arose in the aftermath of great devastation / atrocity"],
	[3,  4,  "Burst forth from a corrupted being that absorbed too much power"],
	[5,  6,  "Called forth, via a terrible ritual"],
	[7,  8,  "Given shape by worship / adoration / feeding"],
	[9,  10, "Let into the world by accident or hubris (a failed attempt to bind, cleanse, or wield the power of the Things Below)"],
	[11, 12, "Spawned spontaneously from a truly corrupted site"],
]);

// ── Names & titles (p. 418) ───────────────────────────────────────────────────
// The book's word-lists for naming a Thing Below and giving it grandiose titles.
export const NAME_ARTICLES = [
	"the", "a", "an", "who", "which", "that", "of", "in", "on", "through", "with", "without", "o",
];

export const NAME_VERBS = [
	"bargain", "bleed", "break", "bring", "burn", "burrow", "bury", "butcher", "chew", "consume",
	"crawl", "crush", "dance", "deceive", "deny", "desire", "despoil", "destroy", "eat", "end",
	"engulf", "feed", "fester", "flense", "freeze", "haunt", "hide", "hoard", "howl", "hunger",
	"keep", "know", "lack", "laugh", "lie", "melt", "offer", "promise", "rage", "rend", "roil",
	"rot", "scatter", "scurry", "seep", "shape", "shatter", "sing", "slaughter", "sleep", "slough",
	"smother", "snuff", "spoil", "starve", "steal", "strain", "suppurate", "swallow", "swarm",
	"topple", "unravel", "wallow", "want", "weave", "whisper", "wither",
];

export const NAME_ADJECTIVES = [
	"all-consuming", "awful", "black", "blackest", "broken", "crimson", "cruel", "dark", "dead",
	"desperate", "eldest", "false", "forty", "endless", "first", "forgotten", "forlorn", "gray",
	"great", "hidden", "hundred", "hungry", "implacable", "inexorable", "lost", "mad", "many",
	"pale", "pallid", "red", "rusty", "secret", "terrible", "thousand", "unkind", "unliving",
	"vast", "wrathful", "yellow",
];

export const NAME_ROLES = [
	"child", "daughter", "father", "heir", "herald", "king", "lady", "last", "lord", "master",
	"mistress", "mother", "prince", "princess", "thief", "queen", "son", "tyrant",
];

// Syllable fragments for the invented, hard-to-pronounce true-name approximations the
// book describes ("Combine short, unlikely sounds, often with apostrophes"). Not from a
// table — a small kit that composes names in the spirit of Hec'tumel, Na'ieraak, Unhlef'k.
const NAME_SYLLABLES = [
	"ha", "na", "un", "hlef", "tu", "mel", "raak", "iel", "z", "ra", "el", "rash", "orra", "hlad",
	"bin", "boz", "ia", "aaw", "kara", "gon", "daa", "themyin", "nisat", "hakog", "lala", "chee",
	"wa", "skir", "voth", "gllo", "myin", "thal", "vor", "sruth", "kesh", "morr",
];

/** Uppercase the first letter of a word without touching the rest. */
function _cap(word) {
	const s = String(word ?? "");
	return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Pick one entry from a plain array using the same rng contract as rollOnTable. */
function _pick(list, rng) {
	if (!Array.isArray(list) || !list.length) return null;
	const i = Math.floor((rng() || 0) * list.length);
	return list[Math.min(list.length - 1, Math.max(0, i))];
}

/** Turn a verb into an agent-noun the title patterns can use (howl → Howler, bargain →
 *  Bargainer, freeze → Freezer). Keeps it crude on purpose — these are approximations. */
function _agent(verb) {
	const v = String(verb ?? "");
	if (!v) return "";
	if (v.endsWith("e")) return _cap(v) + "r";
	if (v.endsWith("y")) return _cap(v.slice(0, -1)) + "ier";
	return _cap(v) + "er";
}

/**
 * Compose an invented true-name approximation from 2-3 short syllables, sometimes with an
 * apostrophe (as the book's examples do: "Hec'tumel", "Unhlef'k"). Deterministic under a
 * seeded rng for tests.
 */
export function generateThingName(rng = Math.random) {
	const count = 2 + Math.floor((rng() || 0) * 2); // 2 or 3 syllables
	const parts = [];
	for (let i = 0; i < count; i++) parts.push(_pick(NAME_SYLLABLES, rng));
	let name = parts.join("");
	// Occasionally insert an apostrophe between the first two syllables for that inflection.
	if (parts.length >= 2 && (rng() || 0) < 0.5) name = parts[0] + "'" + parts.slice(1).join("");
	return _cap(name);
}

/**
 * Generate one grandiose title in the spirit of the book's examples ("Herald of Grief",
 * "the Pale Serpent", "He Who Freezes the Heart", "Thief of a Thousand Hopes"), optionally
 * flavored by a theme's imagery. `theme` is a THEMES entry (or null).
 */
export function generateThingTitle(rng = Math.random, theme = null) {
	const adj = _pick(NAME_ADJECTIVES, rng);
	const role = _pick(NAME_ROLES, rng);
	const verb = _pick(NAME_VERBS, rng);
	// A concrete noun pulled from a theme's imagery, when one is available.
	const materials = theme && typeof theme.materials === "string"
		? theme.materials.split(",").map(s => s.trim()).filter(Boolean)
		: [];
	const noun = materials.length ? _pick(materials, rng) : _pick(["Grief", "Sorrow", "Ash", "Shadow", "Hunger", "Ruin", "Silence"], rng);

	const patterns = [
		() => `the ${_cap(adj)} ${_cap(role)}`,
		() => `${_cap(role)} of ${_cap(noun)}`,
		() => `the ${_agent(verb)} in ${_cap(noun)}`,
		() => `${_cap(role)} of a ${_cap(adj)} ${_cap(noun)}`,
		() => `Who ${_cap(verb)}s the ${_cap(noun)}`,
	];
	return (_pick(patterns, rng) ?? patterns[0])();
}

/**
 * Roll a full name suggestion: an invented name plus a couple of distinct titles. `themes`
 * (an array of THEMES entries) flavors the titles' nouns. Deterministic under a seeded rng.
 * @returns {{ name: string, titles: string[] }}
 */
export function rollThingName(rng = Math.random, themes = []) {
	const name = generateThingName(rng);
	const theme = Array.isArray(themes) && themes.length ? themes[0] : null;
	const titles = [];
	// Try a few times to get two distinct titles.
	for (let i = 0; i < 6 && titles.length < 2; i++) {
		const t = generateThingTitle(rng, themes[titles.length] ?? theme);
		if (!titles.includes(t)) titles.push(t);
	}
	return { name, titles };
}

// ── Roll helper re-export ─────────────────────────────────────────────────────
// Roll a single result off any of the tables above (weighted to reproduce 1d12 odds).
export { rollOnTable };

/** Roll N distinct results off a table (for "roll 2+" themes/aspects). Falls back to
 *  fewer than N if the table is smaller. `rng` returns a float in [0, 1). */
export function rollDistinct(table, count = 2, rng = Math.random) {
	const out = [];
	const seen = new Set();
	for (let i = 0; i < count * 6 && out.length < count && out.length < table.length; i++) {
		const entry = rollOnTable(table, rng);
		if (!entry) break;
		const key = entry.id ?? entry.text;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(entry);
	}
	return out;
}
