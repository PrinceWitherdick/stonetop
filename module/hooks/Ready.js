import { runStartupMigrations } from "./PbtaSheetConfig.js";
import { ensureStonetopSingleton } from "./StonetopSingleton.js";
import { applySheetFont, getSetting } from "../settings.js";
import { EndOfSessionDialog } from "../dialogs/EndOfSessionDialog.js";

const _EOS_MACRO_NAME   = "End of Session";
const _EOS_MACRO_IMG    = "systems/stonetop_pwd/assets/icons/macros/end-of-session.png";
const _EOS_MACRO_SCRIPT = "game.stonetop?.openEndOfSession?.()";
const _EOS_HOTBAR_SLOT  = 10;

export async function onReady() {
	applySheetFont(getSetting("sheetFont"));
	await _migrateArmourToArmor();
	await runStartupMigrations();
	await ensureStonetopSingleton();

	game.stonetop ??= {};
	game.stonetop.openEndOfSession = () => new EndOfSessionDialog().render(true);

	if (game.user.isGM) await _ensureEndOfSessionMacro();
}

async function _ensureEndOfSessionMacro() {
	let macro = game.macros.find(m => m.command === _EOS_MACRO_SCRIPT && m.name === _EOS_MACRO_NAME);
	if (!macro) {
		macro = await Macro.create({
			name:    _EOS_MACRO_NAME,
			type:    "script",
			img:     _EOS_MACRO_IMG,
			command: _EOS_MACRO_SCRIPT,
			scope:   "global",
		});
	}

	const alreadySlotted = Object.entries(game.user.hotbar).some(([, id]) => id === macro.id);
	if (!alreadySlotted) {
		await game.user.assignHotbarMacro(macro, _EOS_HOTBAR_SLOT);
	}
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
