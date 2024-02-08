import { info } from "./scripts/logger.js";

Hooks.on("renderPause", () => {
	info("Overriding the default pause spinner.");
	const pause = document.getElementById("pause");
	pause.lastElementChild.innerText = "Time Frozen";
	pause.firstElementChild.src = "/modules/stonetop/assets/graphics/pause.png"
})

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
			character: {
				stats: {
					str: "Strength",
					dex: "Dexterity",
					int: "Intelligence",
					wis: "Wisdom",
					con: "Constitution",
					cha: "Charisma",
				},
				moveTypes: {
					background: "Background",
					basic: "Basic Moves",
					class: "Playbook Moves",
					special: "Special Moves",
					follower: "Follower Moves",
					expedition: "Expedition Moves",
					homefront: "Homefront Moves",
				},
				attributesTop: {
					instinct: {
						type: "LongText",
						label: "Instinct",
					},
					xp: {
						type: "Xp",
						label: "XP",
						max: 26,
						default: 0,
					},
					level: {
						type: "Number",
						label: "Level",
						default: 1,
					},
				},
				attributesLeft: {
					hp: {
						type: "Resource",
						label: "HP",
						default: "18",
						max: "18",
						min: "0",
					},
					armour: {
						type: "Number",
						label: "Armour",
						default: 0,
					},
					damage: {
						type: "Roll",
						label: "Damage",
						default: "d4",
					},
					debilities: {
						type: "ListMany",
						label: "Debilities",
						description: "Gives Disadvantage on rolls:",
						options: [
							"Weakened (STR, DEX)",
							"Dazed (INT, WIS)",
							"Miserable (CON, CHA)",
						],
					},
				},
			},
			would_be_hero: {
				baseType: "character",
				stats: {
					str: "Strength",
					dex: "Dexterity",
					int: "Intelligence",
					wis: "Wisdom",
					con: "Constitution",
					cha: "Charisma",
				},
				moveTypes: {
					background: "Background",
					basic: "Basic Moves",
					class: "Playbook Moves",
					special: "Special Moves",
					follower: "Follower Moves",
					expedition: "Expedition Moves",
					homefront: "Homefront Moves",
				},
				attributesTop: {
					instinct: {
						type: "LongText",
						label: "Instinct",
					},
					xp: {
						type: "Xp",
						label: "XP",
						max: 26,
						default: 0,
					},
					level: {
						type: "Number",
						label: "Level",
						default: 1,
					},
				},
				attributesLeft: {
					omen: {
						type: "Clock",
						label: "Omen",
						default: 0,
						max: 3,
					},
					resolve: {
						type: "Clock",
						label: "Resolve",
						default: 0,
						max: 2,
					},
					hp: {
						type: "Resource",
						label: "HP",
						default: "18",
						max: "18",
						min: "0",
					},
					armour: {
						type: "Number",
						label: "Armour",
						default: 0,
					},
					damage: {
						type: "Roll",
						label: "Damage",
						default: "d4",
					},
					debilities: {
						type: "ListMany",
						label: "Debilities",
						description: "Gives Disadvantage on rolls:",
						options: [
							"Weakened (STR, DEX)",
							"Dazed (INT, WIS)",
							"Miserable (CON, CHA)",
						],
					},
				},
			},
			npc: {
				attributesTop: {
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
	};
});
