import { info } from "./scripts/logger.js";
import { CharacterType } from "./scripts/actor/character.js";

Hooks.on("renderPause", () => {
	info("Overriding the default pause spinner.");
	const pause = document.getElementById("pause");
	pause.lastElementChild.innerText = "Time Frozen";
	pause.firstElementChild.src = "/modules/stonetop/assets/graphics/pause.png";
});

Hooks.once("pbtaSheetConfig", () => {
	if (!game.user.isGM) return;

	// Disable the sheet config form.
	info("Setting up Stonetop sheet config.");
	game.settings.set("pbta", "sheetConfigOverride", true);

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
		statToggle: {
			label: "Debility",
			modifier: 0,
		},
		rollResults: {
			failure: {
				start: null,
				end: 6,
				label: "Miss",
			},
			partial: {
				start: 7,
				end: 9,
				label: "Weak Hit",
			},
			success: {
				start: 10,
				end: 12,
				label: "Strong Hit!",
			},
		},
		actorTypes: {
			character: CharacterType,
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
	}
}
);

Hooks.once("ready", async () => {
	if (!game.user.isGM) return;
	// Override the default rollPbtA function to handle Disadvantage on debilities.
	CONFIG.Dice.RollPbtA = new Proxy(CONFIG.Dice.RollPbtA, {
		construct: (target, args, newTarget) => {
			const [_, data, options] = args;
			const stat = options.stat;
			const debility = data.stats[stat].toggle;
			if (debility)
				options.rollMode = 'dis';
			return Reflect.construct(target, [...args.slice(0, -1), options], newTarget);
		}
	});
})
