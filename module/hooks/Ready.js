import { runStartupMigrations } from "./PbtaSheetConfig.js";
import { ensureStonetopSingleton, remindDestinedOmenRoll } from "./StonetopSingleton.js";
import { seedCompendiumJournalsOnce, updateSeededJournalsOnVersionChange } from "./SeedCompendiums.js";
import { applySheetFont, applySheetFontScale, applyEditPencilRevealDelay, getSetting, setSetting } from "../settings.js";
import { EndOfSessionDialog } from "../dialogs/EndOfSessionDialog.js";
import { IntroductionsDialog } from "../dialogs/IntroductionsDialog.js";
import { WelcomeDialog } from "../dialogs/WelcomeDialog.js";
import { rollDieOfFate } from "../utils/die-of-fate.js";
import { findVisibleJournal, SETTING_OVERVIEW_JOURNAL } from "../utils/seeded-journals.js";

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

const _WELCOME_MACRO_NAME   = "Welcome to Stonetop";
const _WELCOME_MACRO_IMG    = "systems/stonetop_pwd/assets/icons/macros/spring.svg";
const _WELCOME_MACRO_SCRIPT = "game.stonetop?.openWelcome?.()";
const _WELCOME_HOTBAR_SLOT  = 3;

export async function onReady() {
	applySheetFont(getSetting("sheetFont"));
	applySheetFontScale(getSetting("sheetFontScale"));
	applyEditPencilRevealDelay(getSetting("editPencilRevealDelay"));
	await _migrateArmourToArmor();
	await runStartupMigrations();
	await ensureStonetopSingleton();

	game.stonetop ??= {};
	game.stonetop.openEndOfSession  = () => new EndOfSessionDialog().render(true);
	game.stonetop.openIntroductions = () => IntroductionsDialog.open();
	game.stonetop.openWelcome       = () => WelcomeDialog.open();
	game.stonetop.rollDieOfFate     = rollDieOfFate;

	_registerCharacterAutoOpen();

	if (game.user.isGM) await seedCompendiumJournalsOnce();
	if (game.user.isGM) await updateSeededJournalsOnVersionChange();
	if (game.user.isGM) {
		await _ensureHotbarMacro({
			name: _EOS_MACRO_NAME, img: _EOS_MACRO_IMG, command: _EOS_MACRO_SCRIPT, slot: _EOS_HOTBAR_SLOT,
			match: m => m.command === _EOS_MACRO_SCRIPT && m.name === _EOS_MACRO_NAME,
		});
		await _ensureHotbarMacro({ name: _INTRO_MACRO_NAME,   img: _INTRO_MACRO_IMG,   command: _INTRO_MACRO_SCRIPT,   slot: _INTRO_HOTBAR_SLOT });
		await _ensureHotbarMacro({ name: _FATE_MACRO_NAME,    img: _FATE_MACRO_IMG,    command: _FATE_MACRO_SCRIPT,    slot: _FATE_HOTBAR_SLOT });
		await _ensureHotbarMacro({ name: _WELCOME_MACRO_NAME, img: _WELCOME_MACRO_IMG, command: _WELCOME_MACRO_SCRIPT, slot: _WELCOME_HOTBAR_SLOT });
	}
	if (game.user.isGM) await _postStartupWelcomeMessageOnce();
	if (game.user.isGM) await remindDestinedOmenRoll();

	await _openSettingOverviewOnce();
	if (game.user.isGM) _openGmWelcomeGuide();
}

// Auto-open a freshly-minted character on its owner's screen. The GM stamps the
// new actor with an `autoOpenFor` flag (see WelcomeDialog._onCreateCharacter);
// the owning client opens the sheet and clears the flag so it only ever pops
// once. This is race-free either way: a character created while the owner is
// online fires `createActor` on their client, and one created while they're
// offline is caught by the ready-time sweep when they next log in.
function _registerCharacterAutoOpen() {
	Hooks.on("createActor", actor => _maybeAutoOpenCharacter(actor));
	for (const actor of game.actors) _maybeAutoOpenCharacter(actor);
}

function _maybeAutoOpenCharacter(actor) {
	if (actor?.type !== "character") return;
	if (actor.getFlag?.("stonetop_pwd", "autoOpenFor") !== game.user.id) return;
	actor.sheet.render(true);
	// Owner-only flag; drop it so the sheet doesn't re-open on later loads.
	actor.unsetFlag("stonetop_pwd", "autoOpenFor").catch(() => {});
}

// Pop the first-session Welcome guide for the GM until they tick "Don't show
// this automatically" (which sets gmWelcomeShown). The flag is only written by
// that checkbox, so the guide keeps greeting the GM across the first few loads.
function _openGmWelcomeGuide() {
	if (getSetting("gmWelcomeShown")) return;
	WelcomeDialog.open();
}

// Pop the Setting Overview journal open the first time each user connects, so a
// fresh install lands everyone on the startup info. Runs for every user (the GM
// seeds it; SeedCompendiums grants players read access). Guarded by a per-client
// flag so it opens once and never re-interrupts later sessions.
async function _openSettingOverviewOnce() {
	if (getSetting("settingOverviewShown")) return;
	const overview = findVisibleJournal(SETTING_OVERVIEW_JOURNAL);
	if (!overview) return; // not seeded yet (or not visible to this user) — try again next load
	overview.sheet.render(true);
	await setSetting("settingOverviewShown", true);
}

// Find-or-create a global script macro and pin it to a hotbar slot. Idempotent:
// refreshes the icon if it drifted, and only claims the slot when the macro isn't
// already on the user's hotbar. `match` overrides the default name-based lookup
// (the End of Session macro also keys on its command to avoid clashing with any
// user macro of the same name). Run these serially — each assignHotbarMacro writes
// the same user.hotbar document, so concurrent calls would clobber each other.
async function _ensureHotbarMacro({ name, img, command, slot, match }) {
	let macro = game.macros.find(match ?? (m => m.name === name));
	if (!macro) {
		macro = await Macro.create({ name, type: "script", img, command, scope: "global" });
	} else if (macro.img !== img) {
		await macro.update({ img });
	}

	const alreadySlotted = Object.entries(game.user.hotbar).some(([, id]) => id === macro.id);
	if (!alreadySlotted) {
		await game.user.assignHotbarMacro(macro, slot);
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
						<li><span><strong>Sheet Font &amp; Size</strong>: choose the typeface and scale the text on Stonetop sheets.</span></li>
						<li><span><strong>On Hover Info</strong>: turn all hover info on/off, or tune Stats, Basic Moves, Playbook Moves, Traits, and Gear Tags individually.</span></li>
					</ul>
				</div>
				<div class="row stonetop-startup-card__section">
					<h3 class="cell__subtitle">Recommended Add-on</h3>
					<ul>
						<li><span>Install <strong><a href="https://foundryvtt.com/packages/dice-so-nice">Dice So Nice!</a></strong> for 3D dice on the tabletop &mdash; every move, damage, and steading roll uses Foundry's dice, so it adds a little immersion to your rolls.</span></li>
					</ul>
				</div>
			</div>
			<div class="row stonetop-startup-card__actions">
				<button type="button" class="stonetop-startup-open-welcome">
					<i class="fas fa-feather"></i> Open the First-Session Guide
				</button>
			</div>
			<div class="row row--border stonetop-startup-card__footer">
				Open <strong>Configure Settings</strong> and filter for <strong>Stonetop</strong> to adjust these options.
			</div>
		</div>
	</section>`;
}
