export const CharacterType = {
	stats: {
		str: { label: "Strength", value: 0 },
		dex: { label: "Dexterity", value: 0 },
		int: { label: "Intelligence", value: 0 },
		wis: { label: "Wisdom", value: 0 },
		con: { label: "Constitution", value: 0 },
		cha: { label: "Charisma", value: 0 },
	},
	moveTypes: {
		background: { label: "Background", moves: [] },
		basic: {
			label: "Basic Moves",
			creation: true,
			moves: [],
		},
		playbook: {
			label: "Playbook Moves",
			playbook: true,
			moves: [],
		},
		special: {
			label: "Special Moves",
			creation: true,
			moves: [],
		},
		follower: {
			label: "Follower Moves",
			creation: true,
			moves: [],
		},
		expedition: {
			label: "Expedition Moves",
			creation: true,
			moves: []
		},
		homefront: {
			label: "Homefront Moves",
			creation: true,
			moves: []
		},
	},
	attributes: {
		instinct: {
			position: "Top",
			type: "LongText",
			label: "Instinct",
			value: "<strong>To fill out this sheet:</strong> And get sweet rewards!",
		},
		xp: {
			position: "Top",
			type: "Xp",
			label: "XP",
			max: 20,
			steps: Array.from({ length: 20 }, () => false),
		},
		level: {
			position: "Top",
			type: "Number",
			label: "Level",
			value: 1,
		},
		omen: {
			position: "Left",
			type: "Clock",
			label: "Omen",
			playbook: "the-would-be-hero",
			value: 0,
			max: 3,
			steps: [false, false, false],
		},
		resolve: {
			position: "Left",
			type: "Clock",
			label: "Resolve",
			playbook: "the-would-be-hero",
			default: 0,
			max: 2,
			steps: [false, false],
		},
		hp: {
			position: "Left",
			type: "Resource",
			label: "HP",
			value: 16,
			max: 16,
			min: 0,
		},
		armour: {
			type: "Number",
			label: "Armour",
			position: "Left",
			value: 0,
		},
		damage: {
			position: "Left",
			type: "Roll",
			label: "Damage",
			description: "The damage your character deals.",
			value: "d4",
		},
		load: {
			position: "Left",
			type: "ListOne",
			label: "Load",
			options: [{ label: "Light", value: 3 }, { label: "Normal", value: 6 }, { label: "Heavy", value: 9 }],
		}
	},
	equipmentTypes: {
		special: {
			label: "Special Possessions",
			items: [],
		},
		gear: {
			label: "Gear",
			items: [],
		},
	}
};
