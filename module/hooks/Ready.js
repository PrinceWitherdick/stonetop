import { runStartupMigrations } from "./PbtaSheetConfig.js";
import { ensureStonetopSingleton, remindDestinedOmenRoll } from "./StonetopSingleton.js";
import { applySheetFont, getSetting, setSetting } from "../settings.js";
import { EndOfSessionDialog } from "../dialogs/EndOfSessionDialog.js";
import { IntroductionsDialog } from "../dialogs/IntroductionsDialog.js";
import { rollDieOfFate } from "../utils/die-of-fate.js";

const _EOS_MACRO_NAME   = "End of Session";
const _EOS_MACRO_IMG    = "systems/stonetop_pwd/assets/icons/macros/truce.svg";
const _EOS_MACRO_SCRIPT = "game.stonetop?.openEndOfSession?.()";
const _EOS_HOTBAR_SLOT  = 10;

const _INTRO_MACRO_NAME   = "Character Introductions";
const _INTRO_MACRO_IMG    = "systems/stonetop_pwd/assets/icons/macros/introductions.svg";
const _INTRO_MACRO_SCRIPT = `\
const w = Object.values(ui.windows).find(w => w.id === "stonetop-introductions");
if (w?.rendered) { w.bringToTop(); return; }
game.stonetop?.openIntroductions?.();`;
const _INTRO_HOTBAR_SLOT  = 1;

const _FATE_MACRO_NAME   = "Die of Fate";
const _FATE_MACRO_IMG    = "systems/stonetop_pwd/assets/icons/macros/die-of-fate.svg";
const _FATE_MACRO_SCRIPT = "game.stonetop?.rollDieOfFate?.()";
const _FATE_HOTBAR_SLOT  = 2;

export async function onReady() {
	applySheetFont(getSetting("sheetFont"));
	await _migrateArmourToArmor();
	await runStartupMigrations();
	await ensureStonetopSingleton();

	game.stonetop ??= {};
	game.stonetop.openEndOfSession  = () => new EndOfSessionDialog().render(true);
	game.stonetop.openIntroductions = () => new IntroductionsDialog().render(true);
	game.stonetop.rollDieOfFate     = rollDieOfFate;

	if (game.user.isGM) await _ensureEndOfSessionMacro();
	if (game.user.isGM) await _ensureIntroductionsMacro();
	if (game.user.isGM) await _ensureDieOfFateMacro();
	if (game.user.isGM) await _postStartupWelcomeMessageOnce();
	if (game.user.isGM) await remindDestinedOmenRoll();
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
	} else if (macro.img !== _EOS_MACRO_IMG) {
		await macro.update({ img: _EOS_MACRO_IMG });
	}

	const alreadySlotted = Object.entries(game.user.hotbar).some(([, id]) => id === macro.id);
	if (!alreadySlotted) {
		await game.user.assignHotbarMacro(macro, _EOS_HOTBAR_SLOT);
	}
}

async function _ensureIntroductionsMacro() {
	let macro = game.macros.find(m => m.name === _INTRO_MACRO_NAME);
	if (!macro) {
		macro = await Macro.create({
			name:    _INTRO_MACRO_NAME,
			type:    "script",
			img:     _INTRO_MACRO_IMG,
			command: _INTRO_MACRO_SCRIPT,
			scope:   "global",
		});
	} else if (macro.img !== _INTRO_MACRO_IMG) {
		await macro.update({ img: _INTRO_MACRO_IMG });
	}

	const alreadySlotted = Object.entries(game.user.hotbar).some(([, id]) => id === macro.id);
	if (!alreadySlotted) {
		await game.user.assignHotbarMacro(macro, _INTRO_HOTBAR_SLOT);
	}
}

async function _ensureDieOfFateMacro() {
	let macro = game.macros.find(m => m.name === _FATE_MACRO_NAME);
	if (!macro) {
		macro = await Macro.create({
			name:    _FATE_MACRO_NAME,
			type:    "script",
			img:     _FATE_MACRO_IMG,
			command: _FATE_MACRO_SCRIPT,
			scope:   "global",
		});
	} else if (macro.img !== _FATE_MACRO_IMG) {
		await macro.update({ img: _FATE_MACRO_IMG });
	}

	const alreadySlotted = Object.entries(game.user.hotbar).some(([, id]) => id === macro.id);
	if (!alreadySlotted) {
		await game.user.assignHotbarMacro(macro, _FATE_HOTBAR_SLOT);
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

async function _postStartupWelcomeMessageOnce() {
	if (getSetting("startupWelcomeShown")) return;
	if (!globalThis.ChatMessage?.create) return;
	await ChatMessage.create({
		content: _buildStartupWelcomeContent(),
		speaker: { alias: "Stonetop" },
	});
	await setSetting("startupWelcomeShown", true);
}

function _buildStartupWelcomeContent() {
	return `<section class="pbta-chat-card stonetop-roll-card stonetop-startup-card">
		<div class="cell cell--chat">
			<div class="chat-title row flexrow">
				<h2 class="cell__title">Welcome to <span class="stonetop-startup-card__title-logo">Stonetop</span></h2>
				<div class="cell__subtitle">Fresh-start helper</div>
			</div>
			<div class="stonetop-roll-card-description">
				<p>This is an unofficial Foundry VTT system for <strong>Stonetop</strong>, by Jeremy Strandberg, illustrated by Lucie Arnoux, with layout, editing, and co-design by Jason Lutes.</p>
			</div>
			<div class="card-content stonetop-startup-card__content">
				<div class="row stonetop-startup-card__section">
					<h3 class="cell__subtitle">Sheet Features</h3>
					<ul>
						<li>Guided character creation from the playbook picker.</li>
						<li>Edit mode for sheet setup, tab ordering, and character details.</li>
						<li>Clickable stat boxes, move dice, Basic Move chips, and Stonetop roll cards.</li>
						<li>Stonetop steading sheet with residents, player characters, seasons, resources, and improvements.</li>
						<li>End of Session macro added to the GM hotbar when available.</li>
					</ul>
				</div>
				<div class="row stonetop-startup-card__section">
					<h3 class="cell__subtitle">Useful Settings</h3>
					<ul>
						<li><strong>Sheet Font</strong>: choose the typeface used on Stonetop sheets.</li>
						<li><strong>On Hover Info</strong>: turn all hover info on/off, or tune Stats, Basic Moves, Playbook Moves, Traits, and Gear Tags individually.</li>
					</ul>
				</div>
			</div>
			<div class="row row--border stonetop-startup-card__footer">
				Open <strong>Configure Settings</strong> and filter for <strong>Stonetop</strong> to adjust these options.
			</div>
		</div>
	</section>`;
}
