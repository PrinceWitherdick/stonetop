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
	attrTop: {
		instinct: {
			type: "LongText",
			label: "Instinct",
			value: "<strong>To fill out this sheet:</strong> And get sweet rewards!",
		},
		xp: {
			type: "Xp",
			label: "XP",
			max: 20,
			steps: Array.from({ length: 20 }, () => false),
		},
		level: {
			type: "Number",
			label: "Level",
			value: 1,
		},
	},
	attrLeft: {
		omen: {
			type: "Clock",
			label: "Omen",
			playbook: "the-would-be-hero",
			value: 0,
			max: 3,
			steps: [false, false, false],
		},
		resolve: {
			type: "Clock",
			label: "Resolve",
			playbook: "the-would-be-hero",
			default: 0,
			max: 2,
			steps: [false, false],
		},
		hp: {
			type: "Resource",
			label: "HP",
			value: 16,
			max: 16,
			min: 0,
		},
		armour: {
			type: "Number",
			label: "Armour",
			value: 0,
		},
		damage: {
			type: "Roll",
			label: "Damage",
			value: "d4",
		},
	},
	equipmentTypes: {
		special: {
			label: "Special Possessions",
			items: [],
		},
	}
};
