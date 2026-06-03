export function getStonetopSteadingActor() {
	return game.actors?.find(a => a.type === "stonetop" || a.system?.customType === "stonetop") ?? null;
}

export function getStonetopProsperity() {
	const actor = getStonetopSteadingActor();
	if (!actor) return null;
	return actor.getFlag?.("stonetop_pwd", "steading.system.attributes.prosperity.value")
		?? actor.flags?.stonetop?.steading?.system?.attributes?.prosperity?.value
		?? actor.system?.attributes?.prosperity?.value
		?? null;
}
