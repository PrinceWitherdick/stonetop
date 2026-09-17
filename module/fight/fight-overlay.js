// Who is fighting whom, drawn on the map.
//
// Book I p.418: a picture of a crowded fight is "great for establishing the situation and making sure
// that everyone is on the same page". So each engagement gets a mark every client draws for itself,
// from the same token positions:
//  • MELEE: a short solid tie across the point where two tokens touch.
//  • RANGED: a dashed line from a player's character to the foe they target, with an arrowhead.
//  • GANGED UP ON: a disc with "×N" on a foe fought by several, or a hero facing several in melee.
// Melee and ranged differ by pattern as well as colour, and every mark sits on a light halo so it
// reads over any map art. The Fight tab says all of this as text too; this is a picture of it.
//
// WHERE IT SITS: one container in the canvas's interface group, above the tokens layer (so above token
// art and bars) and below templates, drawings, map pins, the ruler and the HTML HUD. It is a plain child
// of the group rather than of a layer, so switching the active layer never hides it, and the group
// destroys it with the canvas (canvasTearDown drops our handles).
//
// WHAT IT READS: engagements from fight-state.js, as the tab does; positions from each token's LIVE
// document, which follows an animation frame by frame, so the marks slide along with a moving token.
// A mark is drawn only when this client can see both ends (`token.visible`).
//
// SIZES follow the grid, floored to a minimum on screen: zoomed out, a line scaled to the grid would
// thin to nothing.

import { fightOnScene, snapshotFight } from "./fight-state.js";
import { meleeTie, rangedSegment, dashes, arrowHead, badgeCircle, screenFloor } from "./overlay-geometry.js";
import { isFightOverlayShown } from "../settings.js";
import { bodyStyleTokens } from "../utils/css-tokens.js";

/** Above the tokens layer (200), below templates (400). The same in Foundry 13 and 14. */
export const FIGHT_OVERLAY_Z = 250;

/** The shipped ink, for a paint that runs before the stylesheet does. Pinned to the CSS tokens by test. */
export const FIGHT_INK_FALLBACK = Object.freeze({
	melee: 0xb3261e,
	ranged: 0x1f4e8c,
	halo: 0xf4ecd8,
	haloAlpha: 0.9,
	badge: 0x8e1c16,
	badgeGlyph: 0xffffff,
	weight: 1,
});

/**
 * The overlay's ink, read off the live stylesheet each paint (so switching to high contrast repaints
 * in the new ink), falling back to the shipped values where there is no stylesheet to read.
 */
export function fightInk() {
	const tokens = bodyStyleTokens();
	const melee = tokens?.hex("--stonetop-fight-melee") ?? null;
	if (melee === null) return FIGHT_INK_FALLBACK;
	return Object.freeze({
		melee,
		ranged: tokens.hex("--stonetop-fight-ranged") ?? FIGHT_INK_FALLBACK.ranged,
		halo: tokens.hex("--stonetop-fight-halo") ?? FIGHT_INK_FALLBACK.halo,
		haloAlpha: tokens.number("--stonetop-fight-halo-alpha", FIGHT_INK_FALLBACK.haloAlpha),
		badge: tokens.hex("--stonetop-fight-badge") ?? FIGHT_INK_FALLBACK.badge,
		badgeGlyph: tokens.hex("--stonetop-fight-badge-glyph") ?? FIGHT_INK_FALLBACK.badgeGlyph,
		weight: tokens.number("--stonetop-fight-weight", FIGHT_INK_FALLBACK.weight),
	});
}

/**
 * The painted container and its parts, or nulls when nothing is painted; and the snapshot and ink the
 * last full paint used, which a redraw that only follows tokens and the zoom paints from again.
 */
const painted = { layer: null, lines: null, badges: new Map(), snapshot: null, ink: null };

/** Forget the last snapshot and ink, so the next refresh works the fight out afresh. */
export function invalidateFightOverlay() {
	painted.snapshot = null;
	painted.ink = null;
}

/** Drop our handles; the canvas destroys the objects themselves when it tears down. */
export function teardownFightOverlay() {
	if (painted.layer && !painted.layer.destroyed) painted.layer.destroy({ children: true });
	painted.layer = null;
	painted.lines = null;
	painted.badges.clear();
	invalidateFightOverlay();
}

/** Wipe the marks but keep the container, for a fight that has ended or lines switched off. */
export function clearFightOverlay() {
	painted.lines?.clear?.();
	for (const badge of painted.badges.values()) badge.node.destroy({ children: true });
	painted.badges.clear();
	invalidateFightOverlay();
}

function ensureLayer(canvas) {
	const group = canvas.interface;
	if (painted.layer && !painted.layer.destroyed && painted.layer.parent === group) return painted.layer;
	teardownFightOverlay();
	const layer = new PIXI.Container();
	layer.eventMode = "none";
	layer.interactiveChildren = false;
	layer.zIndex = FIGHT_OVERLAY_Z;
	painted.lines = layer.addChild(new PIXI.Graphics());
	painted.layer = group.addChild(layer);
	return layer;
}

/** A straight stroke. */
function stroke(g, seg, width, color, alpha) {
	g.lineStyle({ width, color, alpha, cap: globalThis.PIXI?.LINE_CAP?.ROUND ?? "round" });
	g.moveTo(seg.x1, seg.y1);
	g.lineTo(seg.x2, seg.y2);
}

/** A filled triangle, with a halo drawn as a thicker outline behind it. */
function arrow(g, points, color, halo, haloAlpha, haloWidth) {
	const flat = points.flatMap(p => [p.x, p.y]);
	g.lineStyle({ width: haloWidth, color: halo, alpha: haloAlpha, join: globalThis.PIXI?.LINE_JOIN?.ROUND ?? "round" });
	g.beginFill(color, 1);
	g.drawPolygon(flat);
	g.endFill();
}

/** One count badge, kept between paints and redrawn only as its size or number changes. */
function paintBadge(id, rect, count, radius, ink) {
	let badge = painted.badges.get(id);
	if (!badge) {
		const node = painted.layer.addChild(new PIXI.Container());
		badge = { node, disc: node.addChild(new PIXI.Graphics()), text: null, count: null, fontSize: null, radius: null, ink: null };
		painted.badges.set(id, badge);
	}
	const circle = badgeCircle(rect, radius);
	if (badge.radius !== radius || badge.ink !== ink) {
		badge.disc.clear();
		badge.disc.lineStyle({ width: Math.max(1, radius * 0.2), color: ink.halo, alpha: 1 });
		badge.disc.beginFill(ink.badge, 1);
		badge.disc.drawCircle(0, 0, radius);
		badge.disc.endFill();
		badge.radius = radius;
		badge.ink = ink;
	}

	const fontSize = Math.max(8, Math.round(radius * 1.05));
	if (badge.count !== count || badge.fontSize !== fontSize || badge.fill !== ink.badgeGlyph) {
		badge.text?.destroy?.();
		const Text = globalThis.foundry?.canvas?.containers?.PreciseText ?? PIXI.Text;
		badge.text = badge.node.addChild(new Text(`×${count}`, {
			fontFamily: globalThis.CONFIG?.canvasTextStyle?.fontFamily ?? "Signika",
			fontSize,
			fontWeight: "700",
			fill: ink.badgeGlyph,
		}));
		badge.text.anchor?.set?.(0.5, 0.5);
		badge.count = count;
		badge.fontSize = fontSize;
		badge.fill = ink.badgeGlyph;
	}
	badge.node.position.set(circle.x, circle.y);
}

/**
 * Paint one fight's engagements on the canvas.
 *
 * @param {object} snapshot  fight-state.js#snapshotFight
 * @param {object} canvas
 * @param {object} ink       fightInk()
 */
export function paintFight(snapshot, canvas, ink = fightInk()) {
	ensureLayer(canvas);
	const size = canvas.dimensions?.size ?? canvas.grid?.size ?? 100;
	const zoom = canvas.stage?.scale?.x ?? 1;
	const w = ink.weight;
	const line = screenFloor(size * 0.06 * w, zoom, 3 * w);
	const halo = screenFloor(size * 0.14 * w, zoom, 7 * w);
	const tie = Math.max(size * 0.6, line * 4);
	const dash = screenFloor(size * 0.18, zoom, 10);
	const gap = screenFloor(size * 0.12, zoom, 7);
	const head = screenFloor(size * 0.24 * w, zoom, 12 * w);
	const radius = screenFloor(size * 0.22 * w, zoom, 12 * w);

	// Where each combatant's token is NOW, if this client can see it.
	const rects = new Map();
	for (const [id, combatant] of snapshot.combatants) {
		const token = canvas.tokens?.get?.(combatant.tokenId);
		if (!token?.visible) continue;
		rects.set(id, { x: token.document.x, y: token.document.y, w: token.w, h: token.h });
	}

	const g = painted.lines;
	g.clear();
	const { links, byFighter } = snapshot.result;
	// Halos first, every one of them, then the ink over them all: one line's halo never cuts
	// across another line's ink where two engagements cross.
	const marks = [];
	for (const link of links) {
		const hero = rects.get(link.hero);
		const foe = rects.get(link.foe);
		if (!hero || !foe) continue;
		if (link.kind === "melee") {
			marks.push({ kind: "melee", seg: meleeTie(hero, foe, tie) });
		} else {
			const shooterIsHero = link.from === link.hero;
			const seg = rangedSegment(shooterIsHero ? hero : foe, shooterIsHero ? foe : hero);
			marks.push({ kind: "ranged", seg, parts: dashes(seg, dash, gap), head: arrowHead(seg, head) });
		}
	}
	for (const mark of marks) {
		for (const seg of mark.parts ?? [mark.seg]) stroke(g, seg, halo, ink.halo, ink.haloAlpha);
	}
	for (const mark of marks) {
		if (mark.kind === "melee") stroke(g, mark.seg, line, ink.melee, 1);
		else {
			for (const seg of mark.parts) stroke(g, seg, line, ink.ranged, 1);
			arrow(g, mark.head, ink.ranged, ink.halo, ink.haloAlpha, Math.max(1, halo - line));
		}
	}

	const drawn = new Set();
	for (const fighter of snapshot.fighters) {
		const entry = byFighter[fighter.id];
		const rect = rects.get(fighter.id);
		if (!entry?.ganged || !rect) continue;
		drawn.add(fighter.id);
		paintBadge(fighter.id, rect, entry.attackerBodies, radius, ink);
	}
	for (const [id, badge] of painted.badges) {
		if (drawn.has(id)) continue;
		badge.node.destroy({ children: true });
		painted.badges.delete(id);
	}
}

/**
 * Bring the map's marks up to date with the fight on the canvas scene, or take them down when there is
 * no fight there or this reader has the lines switched off. Safe to call at any time.
 *
 * `reuse`: nothing about who is fighting whom has changed since the last paint (a token sliding along
 * its animation, a zoom), so paint the last snapshot where the tokens are now instead of working the
 * whole fight out again every frame. Whatever can change the engagements calls
 * `invalidateFightOverlay` first (fight-boot.js), and a refresh with nothing kept does a full paint.
 */
export function refreshFightOverlay({ canvas = globalThis.canvas, reuse = false } = {}) {
	if (!canvas?.ready || !canvas.interface) return;
	const kept = reuse && painted.snapshot && painted.layer?.parent === canvas.interface && !painted.layer.destroyed;
	const combat = kept ? null : isFightOverlayShown() ? fightOnScene(canvas.scene) : null;
	if (!kept && !combat) {
		clearFightOverlay();
		return;
	}
	try {
		const snapshot = kept ? painted.snapshot : snapshotFight(combat, { scene: canvas.scene });
		const ink = (kept && painted.ink) || fightInk();
		paintFight(snapshot, canvas, ink);
		painted.snapshot = snapshot;
		painted.ink = ink;
	} catch (err) {
		// A picture that cannot be drawn is a map without it, which is what a scene with no fight
		// looks like. Not worth taking the canvas down for; the tab still says everything.
		console.error("Stonetop | couldn't draw the fight on the map", err);
		clearFightOverlay();
	}
}
