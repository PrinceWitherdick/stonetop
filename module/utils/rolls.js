let _activePrompt = null;

export function promptRollMode() {
	if (_activePrompt) return _activePrompt;
	_activePrompt = new Promise(resolve => {
		const done = (mode) => { _activePrompt = null; resolve(mode); };
		new Dialog({
			title: "Roll Mode",
			content: "",
			buttons: {
				dis: { label: "Disadvantage", callback: () => done("dis") },
				def: { label: "Normal",       callback: () => done("def") },
				adv: { label: "Advantage",    callback: () => done("adv") },
			},
			default: "def",
			close: () => done("def"),
		}).render(true);
	});
	return _activePrompt;
}
