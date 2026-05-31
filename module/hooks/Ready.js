import { runStartupMigrations } from "./PbtaSheetConfig.js";

export async function onReady() {
	await _migrateArmourToArmor();
	await runStartupMigrations();
}

async function _migrateArmourToArmor() {
	const staleActors = game.actors.filter(
		a => a.type === "character" && a.system?.attributes?.armour !== undefined
	);
	if (!staleActors.length) return;
	for (const actor of staleActors) {
		await actor.update({ "system.attributes.-=armour": null });
	}
}
