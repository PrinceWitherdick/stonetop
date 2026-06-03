import {resolvedFlagProperty} from "../actors/character/StonetopFlags.js";

export function getStonetopSteadingActor() {
	return game.actors?.find(a => a.type === "stonetop" || a.system?.customType === "stonetop") ?? null;
}

export function getStonetopProsperity() {
	const actor = getStonetopSteadingActor();
	if (!actor) return null;
	return resolvedFlagProperty(actor, "steading.system.attributes.prosperity.value")
		?? actor.system?.attributes?.prosperity?.value
		?? null;
}
