export async function onReady() {
	await _migrateArmourToArmor();
	await _migrateSteadingTypeToStonetop();
	await _registerSteadingSheet();
}

// PBTA registers its own PbtaActorOtherSheet for unknown actor types during
// pbtaSheetConfig (after init), overriding our init-time registration.
// Re-registering here in ready() ensures we win.
async function _registerSteadingSheet() {
	const PbtaBase = game.pbta?.applications?.actor?.PbtaActorSheet;
	if (!PbtaBase) {
		console.error("Stonetop | ready: PbtaActorSheet not found, cannot register steading sheet");
		return;
	}
	try {
		// PBTA converts custom actor types to type="other", so registry-based lookup
		// by type="steading" never works; we intercept at _getSheetClass instead.
		const { createStonetopSteadingSheetClass } = await import("../actors/steading/StonetopSteadingSheet.js");
		game.modules.get("stonetop")._steadingSheetClass = createStonetopSteadingSheetClass(PbtaBase);
	} catch (err) {
		console.error("Stonetop | ready: failed to load steading sheet", err);
	}
}

async function _migrateSteadingTypeToStonetop() {
	const staleActors = game.actors.filter(a => a.system?.customType === "steading");
	if (!staleActors.length) return;
	await Promise.all(staleActors.map(a => a.update({ "system.customType": "stonetop" })));
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
