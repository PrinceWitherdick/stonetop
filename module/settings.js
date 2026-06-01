export function registerSettings() {
	// -- WORLD SETTINGS ------------------------------------------

	// Tracks the last loaded module version.
	// Used to detect when migrations need to run.
	game.settings.register("stonetop", "moduleVersion", {
		name: "Module Version",
		scope: "world",
		config: false,
		type: String,
		default: ""
	});

	// Whether the compendium seeding prompt has been dismissed.
	// Prevents nagging the GM every session if they've already seeded.
	game.settings.register("stonetop", "seedingComplete", {
		name: "Compendium Seeding Complete",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether the default starting scene has already been created for this world.
	game.settings.register("stonetop", "defaultSceneCreated", {
		name: "Default Scene Created",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Visual treatment for each default scene (one setting per scene).
	for (const [key, sceneKey] of [
		["stonetopSceneTone", "stonetop"],
		["vicinitySceneTone", "vicinity"],
		["worldsEndSceneTone", "worldsEnd"],
	]) {
		game.settings.register("stonetop", key, {
			name: `stonetop.settings.sceneTone.${sceneKey}.name`,
			hint: `stonetop.settings.sceneTone.${sceneKey}.hint`,
			scope: "world",
			config: true,
			type: String,
			choices: {
				sepia: "Sepia",
				white: "White",
			},
			default: "sepia",
			onChange: tone => import("./hooks/Ready.js")
				.then(({ updateDefaultSceneTone }) => updateDefaultSceneTone(tone, sceneKey)),
		});
	}

	// -- CLIENT SPECIFIC SETTINGS --------------------------------

	// Whether move rolls use the actor's saved advantage/disadvantage flag.
	// When true, moves roll without any roll mode modifier.
	game.settings.register("stonetop", "hideRollMode", {
		name: "stonetop.settings.hideRollMode.name",
		hint: "stonetop.settings.hideRollMode.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false
	});

	// Turn debug logging on
	game.settings.register("stonetop", "debugMode", {
		name: "stonetop.settings.debugMode.name",
		hint: "stonetop.settings.debugMode.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false
	});
}

export function getSetting(key) {
	return game.settings.get("stonetop", key);
}

export function setSetting(key, value) {
	return game.settings.set("stonetop", key, value);
}
