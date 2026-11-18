import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ID } from "../../module/system-id.js";
import { BOOT_SENTINELS } from "../../module/utils/boot-guard.js";
import { registeredSettings } from "../fakes/registered-settings.js";

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

/**
 * What registerSettings() hands Foundry, in BOTH kinds of world: the Fight tab on and off pick
 * different labels for one switch and list another or not, so a check on labels has to see both.
 *
 * Run rather than scraped out of the source. The registrations are built by small helpers, most
 * keys never sit beside a `game.settings.register` at all, and the loops (the hover toggles, the
 * weather parts, the layout boxes) derive their labels from the key — a scan of the text saw none
 * of those and had to be told about each loop by hand.
 */
const WORLDS = [registeredSettings({ fightTab: true }), registeredSettings({ fightTab: false })];
const REGISTERED = WORLDS[0].settings;

/** Every i18n path a registration or menu hands Foundry: its labels, and its choices' labels. */
function labelPaths(data) {
	return [data.name, data.hint, data.label, ...Object.values(data.choices ?? {})]
		.filter(value => typeof value === "string");
}

/**
 * The code that could read a setting key, excluding settings.js itself: the entry point Foundry
 * loads, the module tree it imports, and the templates it renders.
 *
 * Named roots, not a walk of the repo root, which is what this was. The root also holds dist/,
 * whose bundle repeats every one of settings.js's register calls, so once a build had run every key
 * counted as read and the dead-key check below could not fail. It holds tests/ too, which names
 * keys without reading them.
 */
function searchCorpus() {
	const out = [];
	const walk = (dir) => {
		for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
			const rel = `${dir}/${entry.name}`;
			if (entry.isDirectory()) walk(rel);
			else if (/\.(js|hbs)$/.test(entry.name) && rel !== "module/settings.js") {
				out.push({ file: rel, src: fs.readFileSync(path.join(ROOT, rel), "utf8") });
			}
		}
	};
	walk("module");
	walk("templates");
	out.push({ file: "stonetop.js", src: fs.readFileSync(path.join(ROOT, "stonetop.js"), "utf8") });
	return out;
}

/** The settings menus' own templates, which localize copy that belongs to a menu, not a key. */
function settingsTemplates() {
	const dir = path.join(ROOT, "templates/settings");
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir)
		.filter(name => name.endsWith(".hbs"))
		.map(name => fs.readFileSync(path.join(dir, name), "utf8"));
}

const CORPUS = searchCorpus();

describe("settings registration", () => {
	it("registers the settings at all, all under our namespace (guards the run itself)", () => {
		expect(REGISTERED.size).toBeGreaterThan(100);
		for (const { settings, menus } of WORLDS) {
			for (const [key, data] of [...settings, ...menus]) expect(data.namespace, key).toBe(SYSTEM_ID);
		}
	});

	// The boot check reads how far registerSettings got from these keys, so each one must still be
	// registered, and in the order the list claims, or a partial boot is reported at the wrong depth.
	it("registers every boot sentinel, in the order boot-guard lists them", () => {
		const order = [...REGISTERED.keys()];
		const at = BOOT_SENTINELS.map(key => order.indexOf(key));
		expect(BOOT_SENTINELS.filter((_, i) => at[i] < 0), "sentinels that are never registered").toEqual([]);
		expect(at).toEqual([...at].sort((a, b) => a - b));
	});

	// The dead-key check counts a key as read when any corpus file quotes it, so nothing in the
	// corpus may repeat settings.js's own register calls. A register call found here means the
	// corpus has taken in a copy of settings.js (the dist/ bundle is one), or a setting is being
	// registered outside settings.js, where none of these checks can see it.
	it("searches code that registers no settings itself (guards the dead-key scan)", () => {
		expect(CORPUS.length, "the corpus found no source to search").toBeGreaterThan(100);
		const registering = CORPUS.filter(({ src }) => /\.settings\.register\(/.test(src)).map(({ file }) => file);
		expect(registering, `corpus files that register settings:\n  ${registering.join("\n  ")}`).toEqual([]);
	});

	it("localizes every setting shown in the config menu", () => {
		// A `config: true` setting renders its name/hint straight into Foundry's settings
		// window; an unlocalized one shows the raw "stonetop.settings.x.name" path. Both worlds,
		// since a label may be chosen at registration (`fightWindowAuto` reads differently in a
		// world with the Fight tab off).
		const bad = [];
		for (const { settings } of WORLDS) {
			for (const [key, data] of settings) {
				if (data.config !== true) continue;
				for (const field of ["name", "hint"]) {
					const label = data[field];
					if (!label) bad.push(`${key}.${field} is missing`);
					else if (!label.startsWith("stonetop.settings.")) bad.push(`${key}.${field} is a bare string, not an i18n key`);
				}
			}
		}
		expect(bad, `Config-visible settings with missing/unlocalized labels:\n  ${bad.join("\n  ")}`).toEqual([]);
	});

	// Hidden settings too: the hover toggles and the map-pin default are drawn by menus of their
	// own, which localize the same strings, so any label a registration carries has to exist.
	it("finds every label a registration or menu names in en.json", () => {
		const missing = new Set();
		for (const { settings, menus } of WORLDS) {
			for (const [key, data] of [...settings, ...menus]) {
				for (const label of labelPaths(data)) {
					if (label.startsWith("stonetop.settings.") && !(label in I18N)) missing.add(`${key} -> ${label}`);
				}
			}
		}
		expect([...missing], `labels with no en.json entry:\n  ${[...missing].join("\n  ")}`).toEqual([]);
	});

	it("has no orphaned stonetop.settings.* strings in en.json", () => {
		// What the registrations hand Foundry, plus every literal path in settings.js (a menu's
		// title, the map-pin menu's option labels).
		const declared = new Set();
		for (const { settings, menus } of WORLDS) {
			for (const data of [...settings.values(), ...menus.values()]) {
				for (const label of labelPaths(data)) declared.add(label);
			}
		}
		for (const m of SETTINGS_SRC.matchAll(/"(stonetop\.settings\.[A-Za-z0-9_.]+)"/g)) declared.add(m[1]);
		// A settings MENU renders its own template, and copy that belongs to the menu rather than
		// to any one key (a note above the rows, the labels on a tristate select) is localized
		// there and named nowhere else. Those are references too, and a scan that could not see
		// them would report every one as an orphan and push it into being a bare string.
		for (const src of settingsTemplates()) {
			for (const m of src.matchAll(/"(stonetop\.settings\.[A-Za-z0-9_.]+)"/g)) declared.add(m[1]);
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
		// settings.js's own exported accessors (getSheetSize, getCrewSectionsOpen,
		// …) name their key rather than going through getSetting, so the accessor region —
		// everything after registerSettings() closes — counts as a reference too.
		const accessorRegion = SETTINGS_SRC.slice(SETTINGS_SRC.indexOf("export const HOVER_DESCRIPTION_SETTING_KEYS"));
		expect(accessorRegion, "accessor region not found — did settings.js reorganize?").not.toBe("");
		const unused = [];
		for (const key of REGISTERED.keys()) {
			if (KEPT.has(key)) continue;
			const referenced = CORPUS.some(({ src }) => src.includes(`"${key}"`)) || accessorRegion.includes(`"${key}"`);
			if (!referenced) unused.push(key);
		}
		expect(unused, `Registered settings nothing reads:\n  ${unused.join("\n  ")}`).toEqual([]);
	});
});

// Every settings SUBMENU is a Stonetop window, and our chrome — the header bar, the content
// background, the focus glow, `--stonetop-font-scale` — is scoped to the `stonetop` class on
// purpose. `FormApplication` contributes only `["form"]`, and nothing adds ours at runtime: the
// system's one `classList.add("stonetop")` is for actor sheets. So a menu that omits it opens in
// core's dark chrome while its OWN form rules still apply, which reads as half-styled rather than
// unstyled and is easy to ship without noticing. Read out of the source because there is no
// FormApplication here to instantiate.
describe("settings menu windows", () => {
	it("dresses every settings submenu as one of ours", () => {
		const start = SETTINGS_SRC.indexOf("function _createSettingsMenuApp(");
		expect(start, "_createSettingsMenuApp not found — did settings.js reorganize?").toBeGreaterThan(-1);
		const body = SETTINGS_SRC.slice(start, SETTINGS_SRC.indexOf("\n}", start));
		// The whole DECLARATION line, not a bracket scan: the value contains its own `[]` in the
		// spread default, and a scan that stopped at the first `]` read only as far as that.
		const classes = /^\s*classes:.*$/m.exec(body);
		expect(classes, "the shared settings-menu app declares no classes").not.toBeNull();
		expect(classes[0]).toContain('"stonetop"');
		// And core's own class survives: mergeObject REPLACES an array where it merges an object,
		// so listing the two names out rather than spreading would drop `form` silently.
		expect(classes[0]).toContain("base.classes");
	});

	// A settings window minted WITHOUT going through the shared factory would miss the class
	// again, which is the whole failure this guards.
	it("mints every settings window through that one factory", () => {
		const extended = [...SETTINGS_SRC.matchAll(/class\s+\w+\s+extends\s+FormApplication/g)];
		expect(extended.length, "a settings window sidesteps _createSettingsMenuApp").toBe(1);
	});
});

// The sheet-font maps. applySheetFont resolves ONE key and reads both of them with it, so a face
// present in one and missing from the other silently sets `--st-caps-nudge: undefined` — which
// does not throw, does not log, and surfaces only as uppercase pills sitting high on that one
// font. A near-miss of exactly that shape already shipped: the nudge was a single constant in the
// stylesheet, tuned against a face that is not the default, so it was wrong for everybody who had
// not changed the setting.
describe("sheet font maps", () => {
	/** Keys of an object literal declared as `const <name> = { … }` in settings.js. */
	function literalKeys(name) {
		const start = SETTINGS_SRC.indexOf(`const ${name} = {`);
		expect(start, `${name} not found in settings.js`).toBeGreaterThan(-1);
		const body = SETTINGS_SRC.slice(start, SETTINGS_SRC.indexOf("};", start));
		return [...body.matchAll(/^\s*"([^"]+)":/gm)].map(m => m[1]).sort();
	}

	it("gives every sheet font a caps nudge, and every nudge a font", () => {
		expect(literalKeys("_FONT_CAPS_NUDGE")).toEqual(literalKeys("_FONT_MAP"));
	});

	// The stylesheet's fallback is what a client paints with before applySheetFont runs, and what
	// it keeps for good if that never happens. It has to agree with the default face's entry, or
	// every capitalised pill shifts the moment the setting lands.
	it("matches the stylesheet fallback to the default font's nudge", () => {
		const dflt = SETTINGS_SRC.match(/const _DEFAULT_FONT = "([^"]+)"/)?.[1];
		expect(dflt, "_DEFAULT_FONT not found in settings.js").toBeTruthy();

		const nudgeStart = SETTINGS_SRC.indexOf("const _FONT_CAPS_NUDGE = {");
		const nudgeBody  = SETTINGS_SRC.slice(nudgeStart, SETTINGS_SRC.indexOf("};", nudgeStart));
		const nudge = nudgeBody.match(new RegExp(`"${dflt}":\\s*"([^"]+)"`))?.[1];
		expect(nudge, `no _FONT_CAPS_NUDGE entry for the default font "${dflt}"`).toBeTruthy();

		const css = fs.readFileSync(path.join(ROOT, "styles/stonetop.css"), "utf8");
		const fallback = css.match(/--st-caps-nudge:\s*([^;]+);/)?.[1]?.trim();
		expect(fallback, "--st-caps-nudge is not declared in stonetop.css").toBeTruthy();
		expect(fallback).toBe(nudge);
	});
});
