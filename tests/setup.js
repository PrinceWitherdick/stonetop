import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

global.Application = class {};

// Load the real English table so localize()/format() return the strings players
// actually see — production code can call game.i18n directly without carrying
// duplicate English fallbacks just for the tests.
const _i18nTable = JSON.parse(fs.readFileSync(
	path.join(path.dirname(fileURLToPath(import.meta.url)), "../languages/en.json"), "utf8"));

// Resolve a dot-path key to its leaf string, mirroring Foundry's localize():
// a missing key (or a non-leaf path) returns the key unchanged.
function _localize(key) {
	const value = String(key).split(".").reduce((node, part) => node?.[part], _i18nTable);
	return typeof value === "string" ? value : key;
}

global.game = {
	i18n: {
		localize: _localize,
		// {placeholder} interpolation from `data`, like Foundry's format().
		format: (key, data = {}) => _localize(key).replace(/\{(\w+)\}/g, (m, name) => (name in data ? data[name] : m)),
	},
};

global.Hooks = {
	once: () => {},
	on: () => {},
};

// Foundry's always-present notifications global. Production code calls
// `ui.notifications?.info?.(…)` with a bare `ui` reference, so `ui` itself must
// exist or it ReferenceErrors under node. No-ops by default; tests that assert on
// notifications reassign `global.ui` with their own spies.
global.ui = {
	notifications: { info: () => {}, warn: () => {}, error: () => {} },
};

global.CONFIG = {};

global.foundry = {
	// V13+ operator class: an INSTANCE (`new ForcedDeletion()`) set as an update
	// value forces deletion of that key. Core detects it via `instanceof`, so the
	// fake must be a class, not a sentinel value, to model that faithfully.
	data: { operators: { ForcedDeletion: class ForcedDeletion {} } },
	utils: {
		mergeObject: (a, b) => ({ ...a, ...b }),
		deepClone: (value) => structuredClone(value),
		escapeHTML: (value) => String(value ?? "")
			.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
		getProperty: (obj, path) => path.split(".").reduce((value, key) => value?.[key], obj),
		randomID: (length = 16) => {
			const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
			let id = "";
			for (let i = 0; i < length; i++) id += chars[Math.floor(Math.random() * chars.length)];
			return id;
		},
		// Mirrors Foundry's flattenObject (common/utils/helpers.mjs), INCLUDING the two cases it is
		// easy to get wrong and which silently weaken every test that depends on this:
		//   • an EMPTY object is kept as a leaf rather than recursed away to nothing. Recursing
		//     drops the key entirely, so a production path that writes `{}` — the crew's
		//     `individualsHp` on a first naming, say — reached the code under test in the fake but
		//     never in Foundry, and a defect there passed the suite while failing in the world.
		//   • only PLAIN objects are descended. A class instance (a ForcedDeletion operator, a
		//     Document, a Set) is a leaf, exactly as core treats it.
		flattenObject: (obj, prefix = "") => Object.entries(obj ?? {}).reduce((acc, [key, value]) => {
			const path = prefix ? `${prefix}.${key}` : key;
			const isPlain = value !== null && typeof value === "object" && !Array.isArray(value)
				&& (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
			if (isPlain && Object.keys(value).length) {
				Object.assign(acc, global.foundry.utils.flattenObject(value, path));
			} else {
				acc[path] = value;
			}
			return acc;
		}, {}),
	},
};

Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
