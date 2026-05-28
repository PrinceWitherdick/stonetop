export function GetSteadingConfig() {
	return {
		label: "Stonetop",
		stats: {
			fortunes: { label: "Fortunes", value: 1 },
			defenses: { label: "Defenses", value: 0 },
		},
		attributes: {
			population: { type: "Number", label: "Population", value: 0 },
			prosperity: { type: "Number", label: "Prosperity", value: 0 },
			surplus:    { type: "Number", label: "Surplus",    value: 1 },
			debilities: {
				type: "ListMany",
				label: "Debilities",
				condition: true,
				options: {
					diminished: { label: "diminished", value: false },
					lacking:    { label: "lacking",    value: false },
					malcontent: { label: "malcontent", value: false },
				},
			},
		},
	};
}
