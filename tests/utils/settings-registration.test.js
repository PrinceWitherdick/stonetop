import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Structural guards on module/settings.js. Settings drift quietly: a hint keeps
// describing behaviour that moved, a key outlives the feature it gated, a new
// user-facing toggle ships with an unlocalized name. None of that fails at runtime —
// Foundry happily renders a raw i18n path as a label and happily stores a value nobody
// reads. So the checks live here.
//
// `moduleVersion` is why the dead-key check exists: it was registered, documented as
// "used to detect when migrations need to run", and never once read or written.

const ROOT = path.resolve(__dirname, "../..");
const SETTINGS_SRC = fs.readFileSync(path.join(ROOT, "module/settings.js"), "utf8");
const EN = JSON.parse(fs.readFileSync(path.join(ROOT, "languages/en.json"), "utf8"));

/** Flatten en.json to dotted paths so an i18n key can be looked up directly. */
const I18N = (() => {
	const flat = {};
	(function walk(obj, prefix) {
		for (const [k, v] of Object.entries(obj)) {
			const key = prefix ? `${prefix}.${k}` : k;
			if (v && typeof v === "object" && !Array.isArray(v)) walk(v, key);
			else flat[key] = v;
		}
	})(EN, "");
	return flat;
})();

/** Every `game.settings.register("stonetop-pwd", "<key>", { … })` block. */
function registrations() {
	const out = [];
	const re = /game\.settings\.register\("stonetop-pwd",\s*"([A-Za-z0-9_]+)",\s*\{/g;
	for (const m of SETTINGS_SRC.matchAll(re)) {
		// Slice to the end of the options object (the first line that closes it at
		// the register call's indentation).
		const from = m.index + m[0].length;
		const end = SETTINGS_SRC.indexOf("\n\t});", from);
		out.push({ key: m[1], body: SETTINGS_SRC.slice(from, end === -1 ? undefined : end) });
	}
	return out;
}

/** The keys generated from HOVER_DESCRIPTION_SETTING_KEYS (registered in a loop). */
function hoverKeys() {
	const block = /HOVER_DESCRIPTION_SETTING_KEYS = \[([\s\S]*?)\n\];/.exec(SETTINGS_SRC);
	expect(block, "HOVER_DESCRIPTION_SETTING_KEYS not found").not.toBeNull();
	return [...block[1].matchAll(/"([A-Za-z0-9_]+)"/g)].map(m => m[1]);
}

/** Repo files that could reference a setting key, excluding settings.js itself. */
function searchCorpus() {
	const out = [];
	const skip = new Set(["node_modules", ".git", "packs"]);
	(function walk(dir) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (skip.has(entry.name)) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (/\.(js|hbs)$/.test(entry.name)) {
				const rel = path.relative(ROOT, full);
				if (rel.replace(/\\/g, "/") === "module/settings.js") continue;
				out.push(fs.readFileSync(full, "utf8"));
			}
		}
	})(ROOT);
	return out;
}

const REGISTRATIONS = registrations();
const HOVER_KEYS = hoverKeys();

describe("settings registration", () => {
	it("parses the registrations at all (guards the scan itself)", () => {
		expect(REGISTRATIONS.length).toBeGreaterThan(30);
		expect(HOVER_KEYS.length).toBeGreaterThan(10);
	});

	it("localizes every setting shown in the config menu", () => {
		// A `config: true` setting renders its name/hint straight into Foundry's settings
		// window; an unlocalized one shows the raw "stonetop.settings.x.name" path.
		const bad = [];
		for (const { key, body } of REGISTRATIONS) {
			if (!/config:\s*true/.test(body)) continue;
			for (const field of ["name", "hint"]) {
				const m = new RegExp(`${field}:\\s*"([^"]+)"`).exec(body);
				if (!m) { bad.push(`${key}.${field} is missing`); continue; }
				if (!m[1].startsWith("stonetop.settings.")) bad.push(`${key}.${field} is a bare string, not an i18n key`);
				else if (!(m[1] in I18N)) bad.push(`${key}.${field} -> ${m[1]} (no such key in en.json)`);
			}
		}
		expect(bad, `Config-visible settings with missing/unlocalized labels:\n  ${bad.join("\n  ")}`).toEqual([]);
	});

	it("localizes every hover-description toggle", () => {
		// These are config:false but rendered by the "On Hover Info" menu, which
		// localizes them by convention rather than from the registration.
		const bad = [];
		for (const key of HOVER_KEYS) {
			for (const field of ["name", "hint"]) {
				const i18nKey = `stonetop.settings.${key}.${field}`;
				if (!(i18nKey in I18N)) bad.push(i18nKey);
			}
		}
		expect(bad, `Hover toggles missing en.json entries:\n  ${bad.join("\n  ")}`).toEqual([]);
	});

	it("has no orphaned stonetop.settings.* strings in en.json", () => {
		const declared = new Set();
		for (const m of SETTINGS_SRC.matchAll(/"(stonetop\.settings\.[A-Za-z0-9_.]+)"/g)) declared.add(m[1]);
		for (const key of HOVER_KEYS) {
			declared.add(`stonetop.settings.${key}.name`);
			declared.add(`stonetop.settings.${key}.hint`);
		}
		const orphans = Object.keys(I18N)
			.filter(k => k.startsWith("stonetop.settings.") && !declared.has(k));
		expect(orphans, `en.json strings no setting references:\n  ${orphans.join("\n  ")}`).toEqual([]);
	});

	it("has no registered setting that nothing reads", () => {
		// A setting only "behaves as described" if something consults it. Anything
		// deliberately kept for backward compatibility belongs in KEPT below, with the
		// reason, so the exemption is a decision rather than an oversight.
		//
		// Currently empty, and worth keeping that way. The one entry it held —
		// `peopleCropRebuildOffered` — was exempted on the grounds that a world still
		// holding the value needed it registered to read without throwing. Nothing read it,
		// so it is now simply unregistered (Foundry ignores a stored value whose key it does
		// not know); settings.js names the retired key in a comment so it is not reused.
		const KEPT = new Set([]);
		const corpus = searchCorpus();
		// settings.js's own exported accessors (getCharacterSheetWidth, getCrewSectionsOpen,
		// …) name their key rather than going through getSetting, so the accessor region —
		// everything after registerSettings() closes — counts as a reference too.
		const accessorRegion = SETTINGS_SRC.slice(SETTINGS_SRC.indexOf("export const HOVER_DESCRIPTION_SETTING_KEYS"));
		expect(accessorRegion, "accessor region not found — did settings.js reorganize?").not.toBe("");
		const unused = [];
		for (const { key } of REGISTRATIONS) {
			if (KEPT.has(key)) continue;
			const referenced = corpus.some(src => src.includes(`"${key}"`)) || accessorRegion.includes(`"${key}"`);
			if (!referenced) unused.push(key);
		}
		expect(unused, `Registered settings nothing reads:\n  ${unused.join("\n  ")}`).toEqual([]);
	});
});
