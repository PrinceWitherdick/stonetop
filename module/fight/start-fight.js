// Starting a fight, adding to one, and lining everyone up. GM only.
//
// THE START WINDOW OPENS ALREADY ANSWERED, as far as it can be. A GM who selected the tokens that are
// fighting has said who is in it; one who selected nothing most often means "the party and the monsters
// on this map". So the window opens with those ticked, lists everyone else on the map beside them, and
// lets a search reach whoever is not on the map yet: a character elsewhere, a person from the village,
// a monster from the bestiary. Those are put on the map as they join, heroes to the left of the middle
// of the view and foes to the right.
//
// A BYSTANDER IS NEVER TICKED FOR BEING ON THE MAP. An NPC who is neither a follower nor marked friendly
// is listed under "Others", unticked; ticked, they join as a foe, and the tab moves them across.
//
// LINING UP moves every token in the fight in one write, straight to its place (core's "displace"
// movement: through walls, no animation along the way), and remembers where everyone stood so "Put
// everyone back" can undo it.

import { SYSTEM_ID, BESTIARY_PACK } from "../system-id.js";
import { format, localize } from "../utils/i18n.js";
import { joinNames } from "../utils/strings.js";
import { getPlayerCharacters } from "../utils/playbook-actors.js";
import { placeActors } from "../utils/token-drop.js";
import { displaceTokens, deletionEntry } from "../utils/foundry-compat.js";
import { worldActorsBySource, resolveDeployableActor } from "../utils/deployable-actor.js";
import { compendiumRefTail } from "../migration/compat.js";
import { HEROES, FOES } from "./engagements.js";
import { classifySide } from "./fight-sides.js";
import { combatantSide, fightOnScene, isFight, sideInfoFor, SIDE_FLAG, LAST_LINE_UP_FLAG } from "./fight-state.js";
import { fightWindowWillShow } from "./fight-window.js";
import { lineUpPositions } from "./line-up.js";
import { StartFightDialog } from "./StartFightDialog.js";

const KEY = "stonetop.fight.startWindow";
export { LAST_LINE_UP_FLAG };
const TOKEN = "token:";
const ACTOR = "actor:";

/**
 * The start window's lists, pre-ticks and sides, from plain descriptions of what is on the map and
 * in the world. PURE.
 *
 * @param {object} p
 * @param {Array<{id, name, img, type, hasPlayerOwner, isFollower, disposition, hidden, inFight}>} p.sceneTokens
 * @param {Array<{uuid, name, img}>} [p.pcsElsewhere]   player characters with no token on this map
 * @param {Array<{uuid, name, img, disposition}>} [p.people]  world NPCs with no token on this map
 * @param {Array<{uuid, name, img, fromPack}>} [p.monsters]
 * @param {string[]} [p.controlled]     token ids the GM has selected
 * @param {string[]|null} [p.preselect] token ids to tick instead of the selection (Deploy and fight)
 * @param {boolean} [p.preselectPcs]    also tick every player character's token
 * @param {string[]} [p.forceFoes]      token ids that fight as foes whatever they are
 * @param {"start"|"add"} [p.mode]
 * @param {(key: string, data?: object) => string} p.format
 * @returns {{groups: Array, selected: string[], sides: Map<string, string>}}
 */
export function startWindowModel({
	sceneTokens = [], pcsElsewhere = [], people = [], monsters = [],
	controlled = [], preselect = null, preselectPcs = false, forceFoes = [], mode = "start", format: say,
}) {
	const sides = new Map();
	const lists = { heroes: [], foes: [], others: [] };
	const forced = new Set(forceFoes);
	const tokenRows = [];
	for (const token of sceneTokens) {
		if (mode === "add" && token.inFight) continue;
		const placed = forced.has(token.id)
			? { side: FOES, list: FOES }
			: classifySide(token);
		if (!placed) continue;
		const id = `${TOKEN}${token.id}`;
		sides.set(id, placed.side);
		const row = { id, name: token.name, img: token.img ?? "", hint: token.hidden ? say(`${KEY}.hidden`) : "" };
		lists[placed.list].push(row);
		tokenRows.push({ token, id, list: placed.list });
	}

	const actorRows = (items, side, hint = () => "") => items.map(item => {
		const id = `${ACTOR}${item.uuid}`;
		sides.set(id, typeof side === "function" ? side(item) : side);
		return { id, name: item.name, img: item.img ?? "", hint: hint(item) };
	});
	const groups = [
		{ key: "heroesHere", icon: "fa-shield-halved", label: say(`${KEY}.lists.heroesHere`), people: lists.heroes },
		{ key: "foesHere", icon: "fa-skull", label: say(`${KEY}.lists.foesHere`), people: lists.foes },
		{ key: "othersHere", icon: "fa-user", label: say(`${KEY}.lists.othersHere`), hint: say(`${KEY}.lists.othersHint`), people: lists.others },
		{ key: "pcsElsewhere", icon: "fa-user-group", label: say(`${KEY}.lists.pcsElsewhere`), people: actorRows(pcsElsewhere, HEROES) },
		{ key: "people", icon: "fa-users", label: say(`${KEY}.lists.people`),
			people: actorRows(people, item => classifySide({ type: "npc", disposition: item.disposition })?.side ?? FOES) },
		{ key: "monsters", icon: "fa-dragon", label: say(`${KEY}.lists.monsters`),
			people: actorRows(monsters, FOES, item => (item.fromPack ? say(`${KEY}.fromBestiary`) : "")) },
	].filter(group => group.people.length);

	// Who is ticked: whoever Deploy placed, else the GM's selection, else (starting a fight with
	// nothing selected) the party and every monster a player could see.
	const ticked = new Set();
	const tick = ids => { for (const id of ids) if (sides.has(`${TOKEN}${id}`)) ticked.add(`${TOKEN}${id}`); };
	if (Array.isArray(preselect)) tick(preselect);
	else if (controlled.length) tick(controlled);
	else if (mode === "start") {
		for (const { token, id, list } of tokenRows) {
			if (token.type === "character" || (list === FOES && token.type === "monster" && !token.hidden)) ticked.add(id);
		}
	}
	if (preselectPcs) {
		for (const { token, id } of tokenRows) if (token.type === "character") ticked.add(id);
	}
	return { groups, selected: [...ticked], sides };
}

/** What is on the map and in the world, as startWindowModel reads it. */
export async function gatherStartWindow(scene, combat) {
	const game = globalThis.game;
	const inFight = new Set([...(combat?.combatants ?? [])].filter(c => c.sceneId === scene.id).map(c => c.tokenId));
	const tokens = [...(scene.tokens ?? [])].filter(t => t.actor);
	const sceneTokens = tokens.map(t => ({
		id: t.id,
		name: t.name || t.actor.name,
		img: t.texture?.src || t.actor.img || "",
		...sideInfoFor(t.actor, t),
		hidden: !!t.hidden,
		inFight: inFight.has(t.id),
	}));
	const here = new Set(tokens.map(t => t.actorId));
	const pcsElsewhere = getPlayerCharacters()
		.filter(a => !here.has(a.id))
		.map(a => ({ uuid: a.uuid, name: a.name, img: a.img }));
	const people = [...(game.actors ?? [])]
		.filter(a => a.type === "npc" && !here.has(a.id))
		.map(a => ({ uuid: a.uuid, name: a.name, img: a.img, disposition: a.prototypeToken?.disposition ?? null }))
		.sort((a, b) => a.name.localeCompare(b.name));
	const worldMonsters = [...(game.actors ?? [])].filter(a => a.type === "monster");
	const monsters = worldMonsters.map(a => ({ uuid: a.uuid, name: a.name, img: a.img, fromPack: false }));
	// The bestiary entries the world has no copy of. The index is enough to list them; a pick is
	// imported only if it is chosen (utils/deployable-actor.js), and never twice.
	const pack = game.packs?.get?.(BESTIARY_PACK);
	if (pack) {
		const worldCopy = worldActorsBySource();
		const index = await pack.getIndex({ fields: ["img", "type"] }).catch(() => []);
		for (const entry of index) {
			if (entry.type && entry.type !== "monster") continue;
			const uuid = entry.uuid ?? `Compendium.${pack.collection}.Actor.${entry._id}`;
			if (worldCopy(compendiumRefTail(uuid))) continue;
			monsters.push({ uuid, name: entry.name, img: entry.img, fromPack: true });
		}
	}
	monsters.sort((a, b) => a.name.localeCompare(b.name));
	return { sceneTokens, pcsElsewhere, people, monsters };
}

let windowsOpened = 0;

/**
 * Open the start window (or, with a fight already on the map, the add window), then do what it says.
 *
 * @param {object} [p]
 * @param {Combat|null} [p.combat]      the fight to add to; defaults to the fight on the canvas scene
 * @param {string[]|null} [p.preselect] token ids to tick
 * @param {boolean} [p.preselectPcs]
 * @param {string[]} [p.forceFoes]
 */
export async function openStartFight({ combat = null, preselect = null, preselectPcs = false, forceFoes = [] } = {}) {
	const game = globalThis.game;
	const canvas = globalThis.canvas;
	if (!game?.user?.isGM) return null;
	const scene = canvas?.scene ?? null;
	if (!scene) {
		globalThis.ui?.notifications?.warn(localize(`${KEY}.noScene`));
		return null;
	}
	// A Combat we never stamped (the old Introductions roster, one made with the Fight tab off) is
	// not a fight to add to, even when the tab is showing it.
	if (combat && !isFight(combat)) combat = null;
	combat ??= fightOnScene(scene);
	const mode = combat ? "add" : "start";
	const model = startWindowModel({
		...(await gatherStartWindow(scene, combat)),
		controlled: (canvas.tokens?.controlled ?? []).map(t => t.document?.id ?? t.id),
		preselect, preselectPcs, forceFoes, mode, format,
	});
	if (!model.groups.length) {
		globalThis.ui?.notifications?.info(localize(`${KEY}.nobody`));
		return null;
	}
	const dialog = new StartFightDialog({
		title: localize(`${KEY}.${mode === "add" ? "titleAdd" : "titleStart"}`),
		hint: localize(`${KEY}.${mode === "add" ? "hintAdd" : "hintStart"}`),
		buttonLabel: localize(`${KEY}.${mode === "add" ? "buttonAdd" : "buttonStart"}`),
		icon: mode === "add" ? "fa-user-plus" : "fa-swords",
		groups: model.groups,
		selected: model.selected,
		sides: model.sides,
		mode,
		toggles: [{ key: "lineUp", label: localize("stonetop.fight.lineUp"), hint: localize("stonetop.fight.lineUpHint"), checked: false }],
	}, { id: `stonetop-start-fight-${++windowsOpened}` });
	const answer = await dialog.promise();
	if (!answer) return null;
	return startFight({ scene, combat, picks: answer.picks, lineUp: answer.lineUp });
}

/**
 * Where arriving tokens are dropped: their line-up places, as the CENTRE points core's drop takes.
 */
function arrivalPoints(canvas, arrivals) {
	const size = canvas.dimensions?.size ?? canvas.grid?.size ?? 100;
	const sized = arrivals.map((a, i) => ({
		id: String(i), side: a.side,
		w: a.actor.prototypeToken?.width ?? 1, h: a.actor.prototypeToken?.height ?? 1,
	}));
	const positions = lineUpPositions({
		view: viewRectWorld(canvas),
		size,
		sceneRect: sceneRectOf(canvas),
		heroes: sized.filter(s => s.side === HEROES),
		foes: sized.filter(s => s.side !== HEROES),
	});
	return sized.map(s => {
		const at = positions.get(s.id);
		return at ? { x: at.x + (s.w * size) / 2, y: at.y + (s.h * size) / 2 } : null;
	});
}

/** The scene rectangle, as `{x, y, w, h}`. */
function sceneRectOf(canvas) {
	const rect = canvas.dimensions?.sceneRect ?? canvas.dimensions?.rect ?? null;
	return rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null;
}

/**
 * The part of the scene the GM can see, in scene pixels: the window, less the scene controls on the
 * left, the sidebar on the right, and the Fight window on whichever side of the view it stands.
 *
 * The Fight window is left out only while that keeps at least half of the view's width: a GM who has
 * dragged it wide across the middle of the map still gets the fight in front of them, not squeezed
 * into a strip beside it.
 */
export function viewRectWorld(canvas = globalThis.canvas) {
	const doc = globalThis.document;
	const width = globalThis.innerWidth ?? 1920;
	const height = globalThis.innerHeight ?? 1080;
	let left = 0;
	let right = width;
	const controls = doc?.getElementById?.("ui-left")?.getBoundingClientRect?.();
	if (controls?.width) left = Math.max(left, controls.right);
	const sidebar = doc?.getElementById?.("sidebar")?.getBoundingClientRect?.();
	if (sidebar?.width) right = Math.min(right, sidebar.left);
	const fightWindow = globalThis.ui?.combat?.popout;
	const box = fightWindow?.rendered && !fightWindow.minimized ? fightWindow.element?.getBoundingClientRect?.() : null;
	if (box?.width) {
		const onRight = box.left + box.width / 2 >= (left + right) / 2;
		const narrowed = onRight ? [left, Math.min(right, box.left)] : [Math.max(left, box.right), right];
		if (narrowed[1] - narrowed[0] >= (right - left) / 2) [left, right] = narrowed;
	}
	const transform = canvas?.stage?.worldTransform;
	if (!transform?.applyInverse) {
		const rect = sceneRectOf(canvas);
		return rect ?? { x: 0, y: 0, w: width, h: height };
	}
	const topLeft = transform.applyInverse({ x: left, y: 0 });
	const bottomRight = transform.applyInverse({ x: right, y: height });
	return { x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y };
}

/**
 * Put the picks into the fight on `scene`, starting one when there is none.
 *
 * @returns {Promise<{combat: Combat|null, added: number, placed: number, imported: number, missed: string[]}>}
 */
export async function startFight({ scene, combat = null, picks = [], lineUp = false } = {}) {
	const game = globalThis.game;
	const canvas = globalThis.canvas;
	const notify = globalThis.ui?.notifications;
	const result = { combat: null, added: 0, placed: 0, imported: 0, missed: [] };
	if (!game?.user?.isGM || !scene) return result;

	// Whoever is not on the map yet: find (or import, once) their actor, then drop a token, one at a
	// time. Each drop reads the layer's top sort, and each import must be seen by the next row.
	const joiners = [];
	const arrivals = [];
	const worldCopy = worldActorsBySource();
	for (const pick of picks.filter(p => p.id.startsWith(ACTOR))) {
		const found = await resolveDeployableActor(pick.id.slice(ACTOR.length), worldCopy);
		if (!found) { result.missed.push(pick.name); continue; }
		if (found.imported) result.imported += 1;
		arrivals.push({ actor: found.actor, side: pick.side, name: pick.name });
	}
	if (arrivals.length && canvas?.scene?.id === scene.id) {
		const points = arrivalPoints(canvas, arrivals);
		const drop = await placeActors(canvas, arrivals.map(a => a.actor), i => points[i]);
		result.missed.push(...drop.missed);
		for (const { i, actor, token } of drop.dropped) {
			if (token?.documentName !== "Token") { result.missed.push(actor.name); continue; }
			joiners.push({ token, side: arrivals[i].side });
			result.placed += 1;
		}
	} else {
		for (const arrival of arrivals) result.missed.push(arrival.actor.name);
	}
	for (const pick of picks.filter(p => p.id.startsWith(TOKEN))) {
		const token = scene.tokens?.get?.(pick.id.slice(TOKEN.length));
		if (token) joiners.push({ token, side: pick.side });
		else result.missed.push(pick.name);
	}

	// The fight: the one on this map, or a new one.
	if (combat && !isFight(combat)) combat = null;
	combat ??= fightOnScene(scene);
	const started = !combat;
	if (!combat) {
		const CombatClass = globalThis.getDocumentClass?.("Combat") ?? globalThis.CONFIG?.Combat?.documentClass;
		combat = await CombatClass.create({ scene: scene.id, active: true });
	} else if (!combat.active) {
		await combat.activate?.({ render: false });
	}
	result.combat = combat;
	if (!combat) return result;

	const already = new Set([...(combat.combatants ?? [])].filter(c => c.sceneId === scene.id).map(c => c.tokenId));
	const data = [];
	for (const { token, side } of joiners) {
		if (already.has(token.id)) continue;
		already.add(token.id);
		data.push({
			tokenId: token.id, sceneId: scene.id, actorId: token.actorId, hidden: !!token.hidden,
			flags: { [SYSTEM_ID]: { [SIDE_FLAG]: side } },
		});
	}
	if (data.length) await combat.createEmbeddedDocuments("Combatant", data);
	result.added = data.length;

	if (lineUp) await lineUpFight(combat, { scene });
	// Show the GM the fight: in the Fight window when that is open or opening for it, which leaves their
	// sidebar on Chat where the rolls land; else in the tab, as before there was a window.
	if (!fightWindowWillShow({ started })) globalThis.ui?.sidebar?.changeTab?.("combat", "primary");

	if (result.added) notify?.info(format(`${KEY}.joined`, { count: result.added }));
	if (result.imported) notify?.info(format(`${KEY}.imported`, { count: result.imported }));
	if (result.missed.length) notify?.warn(format(`${KEY}.missed`, { names: joinNames(result.missed) }));
	return result;
}

/**
 * Heroes in columns on the left of the GM's view, foes on the right, in one move, remembering where
 * everyone stood. Only for a fight on the canvas scene, where there is a view to line up in.
 */
export async function lineUpFight(combat, { scene = globalThis.canvas?.scene } = {}) {
	const game = globalThis.game;
	const canvas = globalThis.canvas;
	if (!game?.user?.isGM || !combat || !scene || canvas?.scene?.id !== scene.id) return false;
	const size = canvas.dimensions?.size ?? scene.grid?.size ?? 100;
	const fighters = [...(combat.combatants ?? [])]
		.filter(c => c.sceneId === scene.id && c.token)
		.map(c => ({ combatant: c, token: c.token, side: combatantSide(c) }))
		.filter(f => f.side)
		.sort((a, b) => (a.token._source.y - b.token._source.y) || (a.token._source.x - b.token._source.x));
	if (!fighters.length) return false;
	const entry = f => ({ id: f.token.id, w: f.token._source.width ?? 1, h: f.token._source.height ?? 1 });
	const positions = lineUpPositions({
		view: viewRectWorld(canvas),
		size,
		sceneRect: sceneRectOf(canvas),
		heroes: fighters.filter(f => f.side === HEROES).map(entry),
		foes: fighters.filter(f => f.side === FOES).map(entry),
	});
	const moves = [];
	// A LIST, NOT A MAP BY TOKEN ID. Core merges an update's objects into the flag already saved, so
	// a map would keep every token an earlier line-up moved and "Put everyone back" would move them
	// too; an array is replaced whole.
	const before = [];
	for (const { token } of fighters) {
		const target = positions.get(token.id);
		if (!target) continue;
		const snapped = typeof token.getSnappedPosition === "function"
			? token.getSnappedPosition({ x: target.x, y: target.y })
			: target;
		if (snapped.x === token._source.x && snapped.y === token._source.y) continue;
		before.push({ id: token.id, x: token._source.x, y: token._source.y });
		moves.push({ id: token.id, x: snapped.x, y: snapped.y });
	}
	if (!moves.length) return false;
	await combat.update({ [`flags.${SYSTEM_ID}.${LAST_LINE_UP_FLAG}`]: { sceneId: scene.id, positions: before } });
	await displaceTokens(scene, moves);
	return true;
}

/** Undo the last line-up: everyone it moved goes back to where they stood, if they are still there. */
export async function putBackFight(combat, { scene = globalThis.canvas?.scene } = {}) {
	const game = globalThis.game;
	const saved = combat?.flags?.[SYSTEM_ID]?.[LAST_LINE_UP_FLAG];
	if (!game?.user?.isGM || !saved || !scene || saved.sceneId !== scene.id) return false;
	const moves = (Array.isArray(saved.positions) ? saved.positions : [])
		.filter(at => scene.tokens?.get?.(at.id))
		.map(({ id, x, y }) => ({ id, x, y }));
	const [key, value] = deletionEntry(`flags.${SYSTEM_ID}.${LAST_LINE_UP_FLAG}`);
	await combat.update({ [key]: value });
	if (moves.length) await displaceTokens(scene, moves);
	return moves.length > 0;
}
