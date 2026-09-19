// The Fight window: the Fight tab popped out into a window of its own, opened when a fight starts on
// the map this reader is looking at and closed again when it ends.
//
// WHY A WINDOW. At the table the sidebar sits on Chat, where the rolls land, so a tab is somewhere
// nobody is looking while a fight is on. The tracker-dock modules solve that for Foundry's own tracker
// by showing it when a combat starts; this does the same for the Fight tab.
//
// IT IS CORE'S POP-OUT, not a window of our own. `renderPopout` makes a second FightTracker inside a
// frame, and core hands every redraw of the tab to it as well, so every button, the context menu,
// hovering a row to light its token and clicking one to pan there all work in the window with no code
// of ours. FightTracker.js gives the pop-out its place, its size and a resize handle.
//
// WHEN IT OPENS AND CLOSES, per client (`fightWindowStep` decides, and is pure):
//  • ONCE PER FIGHT: when the fight starts on this reader's map, when they arrive on its map, when they
//    reload in the middle of it. A redraw of the same fight never reopens a window they closed.
//  • A PLAYER WAITS UNTIL THEY CAN SEE SOMEONE IN IT. A GM setting up an ambush out of hidden tokens
//    must not announce it with a window on every player's screen.
//  • CLOSED BY THE READER, IT STAYS CLOSED FOR THAT FIGHT, across a reload too. The next fight opens
//    it, and the tab's "Open in a window" brings it back sooner.
//  • IT CLOSES WHEN THIS MAP HAS NO FIGHT ON IT ANY MORE (the fight ended, or the reader went to
//    another map), however it was opened: a window saying "No fight on this scene" is clutter.
//  • `fightWindowAuto`, a client setting, stops the opening. The closing stays.

import { fightOnScene, fighterOf } from "./fight-state.js";
import { getObjectSetting, isFightWindowAuto, setSettingQuietly } from "../settings.js";
import { finitePlace } from "../utils/window-restore.js";

/**
 * The client setting holding where this reader left the window and the fight they closed it on.
 * Flat across worlds, like relmap/relmap-size.js: where a reader likes a window is theirs in every
 * world, and a fight id from another world matches nothing here.
 */
const RECORD = "fightWindow";

/** Passed to `close` when the fight is over, so FightTracker#_onClose does not take it for the reader closing the window. */
export const FIGHT_OVER = "stonetopFightOver";

/** How wide the window first opens: a little wider than the sidebar, so the header's buttons sit two to a line. */
export const FIGHT_WINDOW_WIDTH = 380;

/** Clear space kept between the window and the top of the screen and the sidebar, as core keeps around its own UI. */
const MARGIN = 16;

/** How long a moved or resized window waits before its place is written down. Dragging reports every frame. */
const REMEMBER_DELAY_MS = 400;

/**
 * What to do with this reader's window now. PURE.
 *
 * @param {string|null} decided  the fight the window was last decided for, opened or left shut
 * @param {object} p
 * @param {string|null} p.fightId     the fight on the map this reader is looking at
 * @param {boolean} p.canSeeSomeone   whether this reader can see anyone in that fight (a GM always can)
 * @param {boolean} p.auto            whether this reader wants the window to open by itself
 * @param {string|null} [p.closedId]  the fight this reader last closed the window on
 * @returns {{decided: string|null, action: "open"|"close"|null}}
 */
export function fightWindowStep(decided, { fightId, canSeeSomeone, auto, closedId = null }) {
	if (fightId === decided) return { decided, action: null };
	if (!fightId || !canSeeSomeone) return { decided: null, action: decided ? "close" : null };
	return { decided: fightId, action: auto && closedId !== fightId ? "open" : null };
}

/**
 * Where the window opens. PURE.
 *
 * Where this reader last left it, else at the top of the screen against the sidebar: the corner of the
 * map a fight is least likely to be in, and clear of the chat pop-ups that stack at the bottom of that
 * edge. Height is the content's own (core's pop-out rule) until the reader drags the window to a size.
 * Kept on screen, so a place saved on a bigger monitor cannot open the window out of reach.
 *
 * @param {object} p
 * @param {{left?: number, top?: number, width?: number, height?: number}} [p.saved]
 * @param {{width: number, height: number}} p.viewport
 * @param {number|null} [p.sidebarLeft]  the sidebar's left edge on screen, when there is a sidebar
 * @returns {{left: number, top: number, width: number, height?: number}}
 */
export function fightWindowPlacement({ saved = {}, viewport, sidebarLeft = null }) {
	const number = value => (Number.isFinite(value) ? value : null);
	const width = Math.max(1, Math.min(number(saved?.width) ?? FIGHT_WINDOW_WIDTH, viewport.width));
	const right = number(sidebarLeft) ?? viewport.width;
	const left = number(saved?.left) ?? right - width - MARGIN;
	const top = number(saved?.top) ?? MARGIN;
	const placement = {
		left: Math.round(Math.min(Math.max(0, left), Math.max(0, viewport.width - width))),
		top: Math.round(Math.min(Math.max(0, top), Math.max(0, viewport.height - MARGIN * 3))),
		width: Math.round(width),
	};
	const height = number(saved?.height);
	if (height !== null) placement.height = Math.round(Math.max(1, Math.min(height, viewport.height)));
	return placement;
}

function readRecord() {
	return getObjectSetting(RECORD);
}

/** Merge `changes` into the record, skipping a write that would store what is already there. */
function writeRecord(changes) {
	const current = readRecord();
	const next = { ...current, ...changes };
	if (JSON.stringify(next) === JSON.stringify(current)) return;
	setSettingQuietly(RECORD, next, "Stonetop | Fight window: could not remember");
}

/** The fight this client last decided about: the window was opened for it, or left shut. */
let decided = null;

let rememberTimer = null;

/** Where the window was last left, while it waits on REMEMBER_DELAY_MS to be written down. */
let placeToWrite = null;

/**
 * Whether this reader can see anyone in a fight on `scene`, by the tab's own rule (a hidden token or a
 * hidden combatant is nobody, to a player), never the canvas's line of sight.
 */
function canSeeSomeoneIn(combat, scene, user) {
	if (user?.isGM) return true;
	return [...combat.combatants].some(combatant => fighterOf(combatant, { scene, viewer: user })?.visible);
}

/**
 * Open or close this reader's window to match the map they are looking at.
 *
 * The fight watcher calls this whenever the fight may have changed, and fight-boot.js once at ready:
 * on a reload the watcher's first canvasReady lands before the game is ready, and is ignored here.
 */
export function syncFightWindow() {
	const game = globalThis.game;
	if (!game?.ready || !globalThis.ui?.combat) return null;
	const scene = globalThis.canvas?.scene ?? null;
	const fight = fightOnScene(scene);
	const fightId = fight?.id ?? null;
	// Most calls are a token moving in a fight already decided about: nothing to read or do.
	if (fightId === decided) return null;
	// A fight nobody here can see yet decides nothing, so its settings are not read.
	const canSeeSomeone = !!fight && canSeeSomeoneIn(fight, scene, game.user);
	const step = fightWindowStep(decided, {
		fightId,
		canSeeSomeone,
		auto: canSeeSomeone && isFightWindowAuto(),
		closedId: canSeeSomeone ? readRecord().closed : null,
	});
	decided = step.decided;
	const work = step.action === "open" ? openFightWindow({ fight })
		: step.action === "close" ? closeFightWindow()
		: null;
	// The watcher runs this from a frame callback that cannot await it, so a failed draw is caught here.
	return work ? Promise.resolve(work).catch(err => console.error("Stonetop | Fight window:", err)) : null;
}

/**
 * Pop the Fight tab out, or bring the window forward (and back up from minimized) when it is out already.
 *
 * @param {object} [p]
 * @param {Combat|null} [p.fight]  the fight to show, when the tab is showing a different one
 * @param {boolean} [p.byHand]     the reader asked for the window, which undoes having closed it on this fight
 */
export function openFightWindow({ fight = null, byHand = false } = {}) {
	const tab = globalThis.ui?.combat;
	// A module that swaps in its own combat tracker may have no pop-out to open.
	if (typeof tab?.renderPopout !== "function") return null;
	if (byHand && readRecord().closed) writeRecord({ closed: null });
	// The window shows whatever the tab is viewing, so a new fight has to be the tab's first. Assigning
	// `viewed` is core's own way to switch it (CombatTracker#initialize's deprecation says so).
	if (fight && tab.viewed !== fight) {
		tab.viewed = fight;
		tab.render();
	}
	// An open window redraws with the tab too (AbstractSidebarTab#render), but core does not hand back
	// that draw, so a window switching fights draws once more here: this is the draw a caller can catch.
	return tab.renderPopout();
}

/** Close the window because this map has no fight on it any more. */
function closeFightWindow() {
	const popout = globalThis.ui?.combat?.popout;
	if (!popout?.rendered) return null;
	return popout.close({ [FIGHT_OVER]: true });
}

/** The reader closed the window: keep it shut for the fight it was open on. Called by FightTracker#_onClose. */
export function noteFightWindowClosed() {
	if (decided) writeRecord({ closed: decided });
}

/**
 * Where the window opens, from where the reader last left it and where the sidebar is now.
 * Read by FightTracker when core builds the pop-out.
 */
export function fightWindowPosition() {
	const sidebar = globalThis.document?.getElementById?.("sidebar")?.getBoundingClientRect?.();
	return fightWindowPlacement({
		saved: readRecord().position,
		viewport: { width: globalThis.innerWidth ?? 1920, height: globalThis.innerHeight ?? 1080 },
		sidebarLeft: sidebar?.width ? sidebar.left : null,
	});
}

/**
 * Write down where the window is, once the reader stops moving it. Only numbers are kept: a window
 * still fitting its content reports its height as "auto", and must go on fitting it next time.
 */
export function rememberFightWindowPosition(position) {
	const place = finitePlace(position);
	if (!("left" in place) || !("top" in place)) return;
	placeToWrite = place;
	clearTimeout(rememberTimer);
	rememberTimer = setTimeout(writeFightWindowPosition, REMEMBER_DELAY_MS);
}

/**
 * Write down the place still waiting on the delay. Also run as the page unloads, so a window moved
 * just before a reload is not lost: a client setting lands in localStorage before the page goes.
 */
function writeFightWindowPosition() {
	clearTimeout(rememberTimer);
	rememberTimer = null;
	if (!placeToWrite) return;
	const place = placeToWrite;
	placeToWrite = null;
	writeRecord({ position: place });
}

/**
 * Whether a fight a GM has just started, or added to, will be on their screen in the window, so
 * start-fight.js can leave their sidebar on Chat rather than switch it to the Fight tab.
 *
 * @param {object} [p]
 * @param {boolean} [p.started]  the fight was started just now, so this client is about to open the window for it
 */
export function fightWindowWillShow({ started = false } = {}) {
	return !!globalThis.ui?.combat?.popout?.rendered || (started && isFightWindowAuto());
}

/**
 * Where the window is about to open for a fight a GM is starting, before it is there: its place from
 * `fightWindowPosition`, or null when it will not open (the reader turned the opening off) or is open
 * already (the caller measures the real one). Tokens dropped for the new fight keep clear of it.
 *
 * @param {object} [p]
 * @param {boolean} [p.started]  a fight is being started now
 * @returns {{left: number, right: number, width: number}|null}
 */
export function fightWindowComing({ started = false } = {}) {
	if (!started || globalThis.ui?.combat?.popout?.rendered || !isFightWindowAuto()) return null;
	const { left, width } = fightWindowPosition();
	return { left, right: left + width, width };
}

/**
 * Open the window for a fight already on the map at ready (a reload in the middle of one), and write
 * down a place still waiting on its delay as the page unloads.
 */
export function installFightWindow({ hooks = globalThis.Hooks, page = globalThis } = {}) {
	hooks.on("ready", () => { syncFightWindow(); });
	page.addEventListener?.("beforeunload", writeFightWindowPosition);
}
