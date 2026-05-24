export function promptRollMode() {
	return new Promise(resolve => {
		new Dialog({
			title: "Roll Mode",
			content: "",
			buttons: {
				dis: { label: "Disadvantage", callback: () => resolve("dis") },
				def: { label: "Normal", callback: () => resolve("def") },
				adv: { label: "Advantage", callback: () => resolve("adv") },
			},
			default: "def",
			close: () => resolve("def"),
		}).render(true);
	});
}
