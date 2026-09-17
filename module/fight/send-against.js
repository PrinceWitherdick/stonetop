// Sending a fighter at someone on the other side: a row in the Fight tab (or window) is dragged onto a
// row on the other side, and the dragged one's token steps into the nearest free space touching them.
// It goes either way about, a foe sent at a hero or a hero sent at a foe; the row picked up is always
// the token that moves.
//
// WHOEVER IS SENT MUST BE YOURS TO MOVE. The check is ownership of the one being sent, not of the one
// being closed with, so a GM may send anyone at anyone and a player may throw their own character (or
// a follower they own) at a foe, as they could by dragging that token across the map themselves.
// Nobody can move a token they do not own, which is core's own rule for a token drag.
//
// NOTHING IS RECORDED. The engagement, its line on the map and the foe's place under the hero in the
// tab all follow from the two tokens touching (engagements.js#touching), exactly as if the GM had
// dragged the token across the map by hand.
//
// THE NEAREST FREE SPACE. Every spot whose footprint touches the one dropped on without covering them
// is a candidate; one that would cover another token, or hang off the scene, is not. Of the rest, the
// one closest to where the mover already stands wins, so a foe coming from the east arrives on the
// hero's east side. With no room at all, nothing moves and the GM is told.
//
// The candidates are PURE (`spotBeside`); `sendAgainst` reads the documents and moves the token in
// core's "displace" movement, as a line-up does: straight there, through walls, no walk along the way.

import { format } from "../utils/i18n.js";
import { displaceTokens } from "../utils/foundry-compat.js";
import { touching } from "./engagements.js";
import { combatantSide, gridOf, tokenRect, tokenLevel, sceneRectOf, insideRect } from "./fight-state.js";
import { overlapShare, rectCenter } from "./overlay-geometry.js";

/** How much of the smaller footprint two tokens may share before one is standing on the other. */
const CROWDED = 0.25;

/**
 * Where a foe should stand to fight a hero: the top-left corner of the free spot touching the hero
 * closest to the foe, or null when every spot is taken.
 *
 * Candidates are laid out in whole squares around the hero's footprint. On a square grid that is
 * every neighbouring position; on a hex grid `snap` pulls each onto a hex and the touching test keeps
 * the ones that really neighbour the hero. "Taken" is a footprint sharing more than a quarter of
 * itself with another token, which tells a neighbouring hex (a sliver of overlap) from the same one.
 *
 * @param {object} p
 * @param {{x: number, y: number, w: number, h: number}} p.mover   the foe's footprint now, in scene pixels
 * @param {{x: number, y: number, w: number, h: number}} p.target  the hero's footprint
 * @param {Array<{x: number, y: number, w: number, h: number}>} [p.others]  every other token's footprint
 * @param {{size?: number, kind?: string}} [p.grid]
 * @param {{x: number, y: number, w: number, h: number}|null} [p.sceneRect]  spots must lie inside it
 * @param {(point: {x: number, y: number}) => {x: number, y: number}} [p.snap]
 * @returns {{x: number, y: number}|null}
 */
export function spotBeside({ mover, target, others = [], grid = {}, sceneRect = null, snap = point => point }) {
	if (!mover || !target) return null;
	const size = Number(grid.size) > 0 ? Number(grid.size) : 100;
	const across = Math.max(1, Math.round(mover.w / size));
	const down = Math.max(1, Math.round(mover.h / size));
	const targetAcross = Math.max(1, Math.round(target.w / size));
	const targetDown = Math.max(1, Math.round(target.h / size));
	const from = rectCenter(mover);

	const seen = new Set();
	const spots = [];
	for (let row = -down; row <= targetDown; row += 1) {
		for (let col = -across; col <= targetAcross; col += 1) {
			const snapped = snap({ x: target.x + col * size, y: target.y + row * size });
			const at = { x: snapped.x, y: snapped.y, w: mover.w, h: mover.h };
			const key = `${at.x},${at.y}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const onTarget = overlapShare(at, target);
			if (grid.kind === "hex" ? onTarget > CROWDED : onTarget > 0) continue;
			if (!touching({ rect: at }, { rect: target }, { size, kind: grid.kind })) continue;
			if (!insideRect(at, sceneRect)) continue;
			if (others.some(other => overlapShare(at, other) > CROWDED)) continue;
			const c = rectCenter(at);
			spots.push({ x: at.x, y: at.y, distance: Math.hypot(c.x - from.x, c.y - from.y) });
		}
	}
	spots.sort((a, b) => a.distance - b.distance);
	return spots[0] ? { x: spots[0].x, y: spots[0].y } : null;
}

/**
 * Move one fighter's token up against a fighter on the other side: the mover's owner's to do (a GM
 * owns everyone), and only on the scene on the canvas, where the move can be seen.
 *
 * @returns {Promise<"moved"|"already"|"noRoom"|false>}  false for anything that could not be tried
 */
export async function sendAgainst(combat, moverId, targetId, { scene = globalThis.canvas?.scene, notify = globalThis.ui?.notifications } = {}) {
	const canvas = globalThis.canvas;
	if (!combat || !scene || canvas?.scene?.id !== scene.id || moverId === targetId) return false;
	const mover = combat.combatants?.get?.(moverId);
	const target = combat.combatants?.get?.(targetId);
	if (!mover?.token || !target?.token || mover.sceneId !== scene.id || target.sceneId !== scene.id) return false;
	// A combatant's ownership is its actor's (core's Combatant#getUserLevel), so this is "may I move
	// that token", and true for a GM whoever they picked up.
	if (!mover.isOwner) return false;
	const moverSide = combatantSide(mover);
	const targetSide = combatantSide(target);
	if (!moverSide || !targetSide || moverSide === targetSide) return false;

	const grid = gridOf(scene);
	const moverRect = tokenRect(mover.token);
	const targetRect = tokenRect(target.token);
	const level = tokenLevel(target.token);
	if (touching({ rect: moverRect, level: tokenLevel(mover.token) }, { rect: targetRect, level }, grid)) return "already";

	const others = [...(scene.tokens ?? [])]
		.filter(token => token.id !== mover.token.id && token.id !== target.token.id && tokenLevel(token) === level)
		.map(tokenRect);
	const spot = spotBeside({
		mover: moverRect,
		target: targetRect,
		others,
		grid,
		sceneRect: sceneRectOf(canvas),
		snap: point => (typeof mover.token.getSnappedPosition === "function" ? mover.token.getSnappedPosition(point) : point),
	});
	if (!spot) {
		notify?.warn?.(format("stonetop.fight.send.noRoom", { name: target.name ?? "" }));
		return "noRoom";
	}
	await displaceTokens(scene, [{ id: mover.token.id, x: spot.x, y: spot.y }]);
	return "moved";
}
