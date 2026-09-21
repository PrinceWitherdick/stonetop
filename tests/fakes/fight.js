// Stand-ins for the documents a fight is made of: a scene with a grid, tokens with a saved position,
// actors, and a combat holding combatants. Only what module/fight/ reads.

import { SYSTEM_ID } from "../../module/system-id.js";

export const GRID = 100;

/** A Foundry Collection's shape: iterable, `get`, `size`, `contents`. */
export function collection(items = []) {
	const map = new Map(items.map(item => [item.id, item]));
	return {
		get: id => map.get(id),
		get size() { return map.size; },
		get contents() { return [...map.values()]; },
		find: fn => [...map.values()].find(fn),
		filter: fn => [...map.values()].filter(fn),
		some: fn => [...map.values()].some(fn),
		[Symbol.iterator]: () => map.values(),
	};
}

export function fakeActor({ id, type = "character", name = id, system = {}, ownership = {}, hasPlayerOwner = false, flags = {} } = {}) {
	return {
		id, type, name, system, ownership, hasPlayerOwner, flags,
		testUserPermission: (user, level) => !!user?.isGM || level === "OBSERVER" || (ownership[user?.id] ?? 0) >= 3,
		sheet: { render: () => {} },
	};
}

/** A token on grid square (col, row). `x/y` differ from `_source` while `animating` is set. */
export function fakeToken({ id, col = 0, row = 0, width = 1, height = 1, hidden = false, actor = null, name = actor?.name ?? id, disposition = -1, animating = null } = {}) {
	const source = { x: col * GRID, y: row * GRID, width, height, hidden, disposition };
	return {
		id, name, actor, hidden,
		actorId: actor?.id ?? null,
		_source: source,
		x: animating ? animating.x : source.x,
		y: animating ? animating.y : source.y,
		getSize: ({ width: w = width, height: h = height } = {}) => ({ width: w * GRID, height: h * GRID }),
	};
}

export function fakeScene({ id = "scene1", gridType = 1, tokens = [] } = {}) {
	const scene = { id, grid: { type: gridType, size: GRID }, tokens: collection(tokens) };
	for (const token of tokens) token.parent = scene;
	return scene;
}

/** A combatant standing on `token` in `scene`, fighting on `side` unless left to be worked out. */
export function fakeCombatant({ id, token, scene, side = undefined, count = undefined, hidden = false, defeated = false, visible = true, isOwner = false } = {}) {
	const ours = {};
	if (side !== undefined) ours.side = side;
	if (count !== undefined) ours.count = count;
	return {
		id,
		tokenId: token?.id ?? null,
		sceneId: scene?.id ?? null,
		actorId: token?.actor?.id ?? null,
		token,
		actor: token?.actor ?? null,
		name: token?.name ?? id,
		img: "",
		hidden,
		defeated,
		isDefeated: defeated,
		visible,
		isOwner,
		flags: { [SYSTEM_ID]: ours },
	};
}

/** A combat stamped as a fight, as fight-boot.js stamps every one made with the Fight tab on; `flags: {}` for one that is not. */
export function fakeCombat({ id = "combat1", scene = null, combatants = [], active = true, modified = 1, flags = { [SYSTEM_ID]: { fight: { v: 1 } } } } = {}) {
	return {
		id, scene, active, flags, round: 0,
		_stats: { modifiedTime: modified },
		combatants: collection(combatants),
	};
}

/** The usual table: a GM, and a player playing Bram. */
export function fakeUsers({ bram = null, targets = [] } = {}) {
	const gm = { id: "gm", isGM: true, active: true, targets: new Set() };
	const player = { id: "player", isGM: false, active: true, character: bram, targets: new Set(targets) };
	return { gm, player, all: [gm, player] };
}
