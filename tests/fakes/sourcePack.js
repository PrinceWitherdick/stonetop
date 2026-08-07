// Loaders for the runtime-faithful move + playbook source data.
//
// IMPORTANT: the level-up engine reads moves from the COMPILED pack (built from
// packs/src), whose Item `system` carries the full move — including `crossPlaybook`,
// `cap`, `markOptions`, etc. The lightweight `data/playbook-moves.json` export drops
// several of those fields (see scripts/gen-data-exports.js `cleanMove`), so leveling
// tests must read the pack SOURCE to match what runs in Foundry. Playbook defs, by
// contrast, keep everything the engine needs in `data/playbooks.json` (name, slug,
// backgrounds, invocations), so we read those from there.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

export const PLAYBOOKS = [
	{ slug: "the-blessed",       name: "The Blessed" },
	{ slug: "the-fox",           name: "The Fox" },
	{ slug: "the-heavy",         name: "The Heavy" },
	{ slug: "the-judge",         name: "The Judge" },
	{ slug: "the-lightbearer",   name: "The Lightbearer" },
	{ slug: "the-marshal",       name: "The Marshal" },
	{ slug: "the-ranger",        name: "The Ranger" },
	{ slug: "the-seeker",        name: "The Seeker" },
	{ slug: "the-would-be-hero", name: "The Would-Be Hero" },
];
export const PLAYBOOK_NAMES = PLAYBOOKS.map(p => p.name);
export const STAT_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

// The seven cross-playbook "learn a foreign move" moves, one per playbook except the
// Judge and the Lightbearer. (Keyed for the data-integrity test.)
export const CROSS_PLAYBOOK_MOVES = {
	"The Blessed":       "Wild Soul",
	"The Fox":           "Dabbler",
	"The Heavy":         "Seasoned Warrior",
	"The Marshal":       "Arts of War",
	"The Ranger":        "Worldly",
	"The Seeker":        "Initiate of the Secret Arts",
	"The Would-Be Hero": "Versatile",
};

function walkJson(dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			out.push(...walkJson(path.join(dir, entry.name)));
		} else if (entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("_")) {
			out.push(JSON.parse(fs.readFileSync(path.join(dir, entry.name), "utf8")));
		}
	}
	return out;
}

// Every playbook-move source doc ({ _id, name, type, system, folder }).
export function loadPlaybookMoveDocs() {
	return walkJson(path.join(ROOT, "packs", "src", "stonetop-items", "playbook-moves"))
		.filter(doc => doc?.type === "move");
}

// Map playbook display name → its source move docs.
export function movesByPlaybook(docs = loadPlaybookMoveDocs()) {
	const map = new Map();
	for (const doc of docs) {
		const pb = doc.system?.playbook ?? "Unknown";
		if (!map.has(pb)) map.set(pb, []);
		map.get(pb).push(doc);
	}
	return map;
}

// Playbook Item source docs from packs/src. Unlike data/playbooks.json (which the
// export step strips down), these keep the full `flags.stonetop` block — including the
// starting-moves note and the "either X OR Y" choice groups.
export function loadPlaybookPackDocs() {
	return walkJson(path.join(ROOT, "packs", "src", "stonetop-items", "playbooks"))
		.filter(doc => doc?.type === "playbook");
}

// Every arcanum source doc from packs/src/stonetop-arcana (major/ and minor/). Filtered on
// the moveType discriminator rather than the file name, which also drops the _folders docs
// that walkJson picks up on its way through.
export function loadArcanaPackDocs() {
	return walkJson(path.join(ROOT, "packs", "src", "stonetop-arcana"))
		.filter(doc => doc?.type === "move" && doc?.system?.moveType === "arcanum");
}

// Cleaned playbook defs from data/playbooks.json (has backgrounds + invocations).
export function loadPlaybookDefs() {
	const arr = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "playbooks.json"), "utf8"));
	const bySlug = new Map();
	const byName = new Map();
	for (const pb of arr) {
		bySlug.set(pb.slug, pb);
		byName.set(pb.name, pb);
	}
	return { arr, bySlug, byName };
}
