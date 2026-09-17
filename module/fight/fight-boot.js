// Turning the Fight tab on, at init.
//
// ONE DECISION, MADE ONCE. Core builds its sidebar tabs from `CONFIG.ui` when the interface is first
// drawn, so which class the Combat tab is made from has to be settled at init, from the world setting
// `fightTab`. That is why the setting takes a reload, and why switching it off hands back core's own
// tracker with nothing of ours left running: no stamps, no watcher, no map lines, no damage pre-fill.
//
// Wired in stonetop.js right after the settings are registered (a setting cannot be read before).

import { SYSTEM_ID } from "../system-id.js";
import { isFightTabEnabled } from "../settings.js";
import { HEROES, FOES } from "./engagements.js";
import { createFightTrackerClass } from "./FightTracker.js";
import { installFightWatcher } from "./fight-watcher.js";
import { combatantSide, snapshotFight, FIGHT_FLAG, SIDE_FLAG } from "./fight-state.js";
import { refreshFightOverlay, invalidateFightOverlay, teardownFightOverlay } from "./fight-overlay.js";
import { openStartFight, lineUpFight, putBackFight } from "./start-fight.js";

/**
 * `preCreateCombat`: mark a new Combat as a fight, and tie it to the scene it is started on.
 *
 * A combat the token HUD makes (select tokens, toggle combat) arrives with no scene, and an unlinked
 * combat follows the GM from map to map; a fight is fought somewhere. An explicit scene, or an explicit
 * "no scene", is left as given.
 */
export function stampFight(combat, data = {}) {
	const changes = {};
	if (!data?.flags?.[SYSTEM_ID]?.[FIGHT_FLAG]) changes.flags = { [SYSTEM_ID]: { [FIGHT_FLAG]: { v: 1 } } };
	const sceneId = globalThis.canvas?.scene?.id ?? null;
	if (!("scene" in (data ?? {})) && !combat?.scene && sceneId) changes.scene = sceneId;
	if (Object.keys(changes).length) combat.updateSource(changes);
}

/**
 * `preCreateCombatant`: give a new combatant a side, unless whoever added them already said which.
 * Runs on the creating client, which may be a player adding their own token from its HUD.
 */
export function stampSide(combatant, data = {}) {
	const given = data?.flags?.[SYSTEM_ID]?.[SIDE_FLAG];
	if (given === HEROES || given === FOES) return;
	const side = combatantSide(combatant);
	if (side) combatant.updateSource({ flags: { [SYSTEM_ID]: { [SIDE_FLAG]: side } } });
}

/**
 * Redraw the Fight tab's body when the engagements it shows have changed, and not otherwise: a token
 * sliding one square along a wall changes nothing the tab says.
 */
export function refreshFightTab(tab = globalThis.ui?.combat) {
	const combat = tab?.viewed;
	if (!tab?.rendered || !combat) return;
	const scene = combat.scene ?? globalThis.canvas?.scene ?? null;
	const signature = snapshotFight(combat, { scene })?.result.signature ?? null;
	if (signature !== tab.fightSignature) tab.render({ parts: ["tracker"] });
}

/**
 * Make the Combat tab the Fight tab, when the world has it on.
 *
 * @returns {boolean} whether it was turned on
 */
export function registerFightTab({ config = globalThis.CONFIG, hooks = globalThis.Hooks, foundryNs = globalThis.foundry, game = globalThis.game } = {}) {
	if (!isFightTabEnabled()) return false;
	const Base = foundryNs?.applications?.sidebar?.tabs?.CombatTracker;
	if (!Base || !config?.ui) return false;

	config.ui.combat = createFightTrackerClass(Base);
	const combatTab = config.ui.sidebar?.TABS?.combat;
	if (combatTab) combatTab.tooltip = "stonetop.fight.tab";

	hooks.on("preCreateCombat", stampFight);
	hooks.on("preCreateCombatant", stampSide);

	// What the tab's buttons and the settings' onChange handlers call.
	if (game) {
		game.stonetop ??= {};
		game.stonetop.fight = {
			...(game.stonetop.fight ?? {}),
			refreshOverlay: () => refreshFightOverlay(),
			openStart: options => openStartFight(options),
			lineUp: combat => lineUpFight(combat),
			putBack: combat => putBackFight(combat),
		};
	}
	installFightWatcher({
		hooks,
		// The watcher follows an engagement change with a geometry run, which then paints afresh.
		onEngagement: () => { invalidateFightOverlay(); refreshFightTab(); },
		onGeometry: () => refreshFightOverlay({ reuse: true }),
	});
	// The canvas destroys the overlay with its interface group; drop the handles to it.
	hooks.on("canvasTearDown", teardownFightOverlay);
	// A reader switching high contrast on or off gets the lines repainted in that mode's ink.
	hooks.on("clientSettingChanged", key => {
		if (String(key ?? "") === `${SYSTEM_ID}.sheetContrast`) refreshFightOverlay();
	});
	return true;
}
