export function registerSettings() {
	// -- WORLD SETTINGS ------------------------------------------

	// Tracks the last loaded module version.
	// Used to detect when migrations need to run.
	game.settings.register("stonetop_pwd", "moduleVersion", {
		name: "Module Version",
		scope: "world",
		config: false,
		type: String,
		default: ""
	});

	// Whether the compendium seeding prompt has been dismissed.
	// Prevents nagging the GM every session if they've already seeded.
	game.settings.register("stonetop_pwd", "seedingComplete", {
		name: "Compendium Seeding Complete",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// -- CLIENT SPECIFIC SETTINGS --------------------------------

	// Whether move rolls use the actor's saved advantage/disadvantage flag.
	// When true, moves roll without any roll mode modifier.
	game.settings.register("stonetop_pwd", "hideRollMode", {
		name: "stonetop.settings.hideRollMode.name",
		hint: "stonetop.settings.hideRollMode.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false
	});

	game.settings.register("stonetop_pwd", "sheetFont", {
		name: "stonetop.settings.sheetFont.name",
		hint: "stonetop.settings.sheetFont.hint",
		scope: "client",
		config: true,
		type: String,
		choices: {
			"libre-caslon":   "stonetop.settings.sheetFont.libreCaslon",
			"im-fell-english": "stonetop.settings.sheetFont.imFellEnglish",
			"signika":         "stonetop.settings.sheetFont.signika",
		},
		default: "libre-caslon",
		onChange: value => applySheetFont(value),
	});
}

const _FONT_MAP = {
	"libre-caslon":    '"Libre Caslon Text", serif',
	"im-fell-english": '"IM Fell English", serif',
	"signika":         "Signika, sans-serif",
};

export function applySheetFont(value) {
	const font = _FONT_MAP[value] ?? _FONT_MAP["libre-caslon"];
	document.documentElement.style.setProperty("--font-stonetop", font);
}

export function getSetting(key) {
	return game.settings.get("stonetop_pwd", key);
}

export function setSetting(key, value) {
	return game.settings.set("stonetop_pwd", key, value);
}
