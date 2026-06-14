global.Application = class {};

global.game = {
	i18n: { localize: (key) => key },
};

global.Hooks = {
	once: () => {},
	on: () => {},
};

global.CONFIG = {};

global.foundry = {
	// V13 sentinel that, when set as an update value, forces deletion of that key.
	data: { operators: { ForcedDeletion: Symbol.for("ForcedDeletion") } },
	utils: {
		mergeObject: (a, b) => ({ ...a, ...b }),
		deepClone: (value) => structuredClone(value),
		escapeHTML: (value) => String(value ?? "")
			.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
		getProperty: (obj, path) => path.split(".").reduce((value, key) => value?.[key], obj),
		flattenObject: (obj, prefix = "") => Object.entries(obj ?? {}).reduce((acc, [key, value]) => {
			const path = prefix ? `${prefix}.${key}` : key;
			if (value && typeof value === "object" && !Array.isArray(value)) {
				Object.assign(acc, global.foundry.utils.flattenObject(value, path));
			} else {
				acc[path] = value;
			}
			return acc;
		}, {}),
	},
};

Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
