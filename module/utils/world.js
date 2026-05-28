export function getStonetopSteadingActor() {
	return game.actors?.find(a => a.system?.customType === "stonetop") ?? null;
}

export function getStonetopProsperity() {
	const actor = getStonetopSteadingActor();
	if (!actor) return null;
	return actor.system?.attributes?.prosperity?.value ?? null;
}
