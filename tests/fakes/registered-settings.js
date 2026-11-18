import { registerSettings } from "../../module/settings.js";

/**
 * What `registerSettings()` actually hands Foundry: every setting and every menu, keyed by key, in
 * the order they were registered.
 *
 * Run rather than read. The registrations are built by small helpers in settings.js, so a test that
 * scraped `game.settings.register(SYSTEM_ID, "<key>", { … })` blocks out of the source would see
 * none of them — and it was only ever a proxy for this: which key, which scope, which default.
 *
 * `fightTab` is the one world setting registerSettings reads while it runs (it picks the labels of
 * the Fight window switch and whether the ring switch is listed), so a test can ask for either
 * world. The globals it needs are stood up for the call and put back after it.
 */
export function registeredSettings({ fightTab = true } = {}) {
	const settings = new Map();
	const menus = new Map();
	const saved = { game: globalThis.game, FormApplication: globalThis.FormApplication };
	globalThis.FormApplication ??= class FormApplication {};
	globalThis.game = {
		...saved.game,
		settings: {
			register: (namespace, key, data) => {
				if (settings.has(key)) throw new Error(`"${key}" is registered twice`);
				settings.set(key, { namespace, ...data });
			},
			registerMenu: (namespace, key, data) => menus.set(key, { namespace, ...data }),
			get: (_namespace, key) => {
				if (key === "fightTab") return fightTab;
				throw new Error(`"${key}" is not a registered game setting`);
			},
		},
	};
	try {
		registerSettings();
	} finally {
		globalThis.game = saved.game;
		if (saved.FormApplication === undefined) delete globalThis.FormApplication;
	}
	return { settings, menus };
}
