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

	// Turn debug logging on
	game.settings.register("stonetop_pwd", "debugMode", {
		name: "stonetop.settings.debugMode.name",
		hint: "stonetop.settings.debugMode.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false
	});
}

export function getSetting(key) {
	return game.settings.get("stonetop_pwd", key);
}

export function setSetting(key, value) {
	return game.settings.set("stonetop_pwd", key, value);
}
