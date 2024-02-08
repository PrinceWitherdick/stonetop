import { info } from "./scripts/logger.js";
import { BaseActorType } from "./scripts/actor/base_types.js";

Hooks.on("renderPause", () => {
	info("Overriding the default pause spinner.");
	const pause = document.getElementById("pause");
	pause.lastElementChild.innerText = "Time Frozen";
	pause.firstElementChild.src = "/modules/stonetop/assets/graphics/pause.png";
});

Hooks.once("pbtaSheetConfig", () => {
	// Disable the sheet config form.
	info("Setting up Stonetop sheet config.");
	game.settings.set("pbta", "sheetConfigOverride", true);
	game.settings.set("pbta", "hideSidebarButtons", true);

	// Define custom tags.
	// game.pbta.tagConfigOverride = {
	// 	// Tags available to any actor and item
	// 	general: '[{"value":"fire"}]',
	// 	actor: {
	// 		// Tags available to all actors
	// 		all: '[{"value":"person"}]',
	// 		// Tags available to a specific actor type set up on game.pbta.sheetConfig.actorTypes (e.g. "character", "npc")
	// 		character: '[{"value":"mook"}]',
	// 	},
	// 	item: {
	// 		// Tags available to all actors
	// 		all: '[{"value":"consumable"}]',
	// 		// Tags available to a specific item type (e.g. "equipment", "move")
	// 		move: '[{"value":"sword"}]',
	// 	},
	// };

	// Replace the game.pbta.sheetConfig with your own version.
	game.pbta.sheetConfig = {
		rollFormula: "2d6",
		// statToggle: {
		// 	label: "Highlight",
		// 	modifier: 0,
		// },
		rollResults: {
			failure: {
				range: "6-",
				label: "Miss",
			},
			partial: {
				range: "7-9",
				label: "Weak Hit",
			},
			success: {
				range: "10-12",
				label: "Strong Hit",
			},
		},
		actorTypes: {
			character: { ...BaseActorType },
			would_be_hero: {
				baseType: "character",
				stats: BaseActorType.stats,
				moveTypes: BaseActorType.moveTypes,
				attrTop: BaseActorType.attrTop,
				attrLeft: {
					omen: {
						type: "Clock",
						label: "Omen",
						value: 0,
						max: 3,
						steps: [false, false, false],
					},
					resolve: {
						type: "Clock",
						label: "Resolve",
						default: 0,
						max: 2,
						steps: [false, false],
					},
					...BaseActorType.attrLeft,
				},
				npc: {
					attrTop: {
						hp: {
							type: "Resource",
							label: "Hit Points",
						},
						armor: {
							type: "Resource",
							label: "Armor",
						},
						instinct: {
							type: "Text",
							label: "Instinct",
						},
					},
					moveTypes: {
						gm: "GM Moves",
					},
				},
			},
		},
	};
});
