import { describe, expect, it } from "vitest";
import {
	stepPcDone,
	nextActiveIndex,
	firstActiveIndex,
	turnsUntilActive,
	cursorPositionKey,
	cursorReaction,
} from "../../module/dialogs/introductions-flow.js";

describe("stepPcDone", () => {
	it("is done when the PC passed", () => {
		expect(stepPcDone({ answers: [], passed: true }, 4)).toBe(true);
	});
	it("is done when the PC has answered every question", () => {
		expect(stepPcDone({ answers: [{}, {}, {}, {}], passed: false }, 4)).toBe(true);
	});
	it("is not done with answers remaining and no pass", () => {
		expect(stepPcDone({ answers: [{}, {}], passed: false }, 4)).toBe(false);
	});
	it("treats a missing/empty record as not done", () => {
		expect(stepPcDone(undefined, 4)).toBe(false);
		expect(stepPcDone({}, 4)).toBe(false);
	});
	it("treats a step with no questions as done (can't answer, can't exhaust)", () => {
		expect(stepPcDone({ answers: [], passed: false }, 0)).toBe(true);
	});
});

describe("nextActiveIndex", () => {
	// done map: index → done?
	const doneFn = (map) => (idx) => !!map[idx];

	it("moves to the next active PC with wrap-around", () => {
		// 3 PCs, none done. From index 2 wraps to 0.
		expect(nextActiveIndex(2, 3, doneFn({}))).toBe(0);
		expect(nextActiveIndex(0, 3, doneFn({}))).toBe(1);
	});
	it("skips PCs that are already done", () => {
		// From 0, PC1 done, PC2 active.
		expect(nextActiveIndex(0, 3, doneFn({ 1: true }))).toBe(2);
	});
	it("stays on the current PC when they are the only one left active", () => {
		// From 1, PCs 0 and 2 are done, PC1 still active → returns 1.
		expect(nextActiveIndex(1, 3, doneFn({ 0: true, 2: true }))).toBe(1);
	});
	it("returns -1 when everyone is done", () => {
		expect(nextActiveIndex(0, 3, doneFn({ 0: true, 1: true, 2: true }))).toBe(-1);
	});
	it("returns -1 for an empty roster", () => {
		expect(nextActiveIndex(0, 0, doneFn({}))).toBe(-1);
	});
});

describe("firstActiveIndex", () => {
	const doneFn = (map) => (idx) => !!map[idx];
	it("finds the first active PC", () => {
		expect(firstActiveIndex(3, doneFn({ 0: true }))).toBe(1);
	});
	it("returns -1 when all are done", () => {
		expect(firstActiveIndex(2, doneFn({ 0: true, 1: true }))).toBe(-1);
	});
});

describe("turnsUntilActive", () => {
	const doneFn = (map) => (idx) => !!map[idx];

	it("is 0 turns away when the target is the current turn", () => {
		expect(turnsUntilActive(1, 1, 3, doneFn({}))).toBe(0);
	});
	it("counts turns forward with wrap-around", () => {
		// From 2, target 0 is one active turn away (2 → 0); target 1 is two away.
		expect(turnsUntilActive(2, 0, 3, doneFn({}))).toBe(1);
		expect(turnsUntilActive(2, 1, 3, doneFn({}))).toBe(2);
	});
	it("skips PCs that are already done when counting", () => {
		// From 0, PC1 done: PC2 is the first upcoming active turn (1 away).
		expect(turnsUntilActive(0, 2, 3, doneFn({ 1: true }))).toBe(1);
	});
	it("returns -1 when the target itself is done", () => {
		expect(turnsUntilActive(0, 2, 3, doneFn({ 2: true }))).toBe(-1);
	});
	it("returns -1 for an empty roster or a negative target", () => {
		expect(turnsUntilActive(0, 0, 0, doneFn({}))).toBe(-1);
		expect(turnsUntilActive(0, -1, 3, doneFn({}))).toBe(-1);
	});
});

describe("cursorPositionKey", () => {
	const at = { active: true, phase: 4, activeActorId: "a1", activeUserId: "u1", pcOrder: ["a1", "a2"] };

	it("ignores the nonces, which exist only to make a write fire at all", () => {
		expect(cursorPositionKey({ ...at, nonce: 7, showNonce: 2 }))
			.toBe(cursorPositionKey({ ...at, nonce: 99, showNonce: 5 }));
	});

	it("separates the step, the PC whose turn it is, and who may edit", () => {
		const key = cursorPositionKey(at);
		expect(cursorPositionKey({ ...at, phase: 5 })).not.toBe(key);
		expect(cursorPositionKey({ ...at, activeActorId: "a2" })).not.toBe(key);
		expect(cursorPositionKey({ ...at, activeUserId: "u2" })).not.toBe(key);
	});

	it("ignores the roster, which churns on its own during session zero", () => {
		// A late PC joining the combat tracker rewrites the cursor without moving the turn.
		// Counting it would repaint — and so wipe — whatever the active player is typing.
		expect(cursorPositionKey({ ...at, pcOrder: ["a1", "a2", "a3"] })).toBe(cursorPositionKey(at));
	});

	it("survives a cursor with no roster yet", () => {
		expect(() => cursorPositionKey({})).not.toThrow();
	});
});

describe("cursorReaction", () => {
	// A live session on the looping answer step, with the turn on this client's PC.
	const onMe = { active: true, phase: 4, activeActorId: "a1", activeUserId: "u1", pcOrder: ["a1", "a2"] };
	// That turn's player, mid-sentence: dialog open, caret inside it, already drawn here.
	const typing = (cursor, over = {}) => cursorReaction({
		cursor, userId: "u1", isRoundRobin: true, hasDialog: true, typing: true,
		prevKey: cursorPositionKey(cursor),
		lastTurnKey: `${cursor.phase}:${cursor.activeActorId}`,
		lastShowNonce: 0, ...over,
	});

	it("leaves a player alone on a same-position write while they type", () => {
		// The bug: a roster reshuffle (a late PC reaching the combat tracker) rewrites the
		// cursor at the SAME turn. Repainting then rebuilt the capture textarea from the last
		// autosave, so a half-typed sentence snapped back.
		const act = typing({ ...onMe, nonce: 12 });
		expect(act.render).toBe(false);
		expect(act.raise).toBe(false);
		expect(act.toast).toBe(false);
	});

	it("leaves a typist alone when only the roster moved", () => {
		const reshuffled = { ...onMe, pcOrder: ["a1", "a2", "a3"], nonce: 12 };
		expect(typing(reshuffled, { prevKey: cursorPositionKey(onMe) }).render).toBe(false);
	});

	it("repaints mid-sentence when edit rights move to another owner", () => {
		// activeUserId deciding who may write means the field may have to go read-only.
		const handedOver = { ...onMe, activeUserId: "u2" };
		expect(typing(handedOver, { prevKey: cursorPositionKey(onMe) }).render).toBe(true);
	});

	it("still repaints a same-position write when nobody is typing", () => {
		expect(typing({ ...onMe, nonce: 12 }, { typing: false }).render).toBe(true);
	});

	it("repaints mid-sentence when the session actually moves on", () => {
		// Their turn may have just ended, so the screen has to change under them. The dialog
		// flushes the field to its flag before rebuilding, so nothing typed is lost.
		const moved = { ...onMe, activeActorId: "a2", activeUserId: "u2" };
		expect(typing(moved, { prevKey: cursorPositionKey(onMe) }).render).toBe(true);
	});

	it("repaints mid-sentence when the GM force-shows", () => {
		expect(typing({ ...onMe, showNonce: 1 }).render).toBe(true);
	});

	it("raises on a genuine hand-off, not on every write for a turn already held", () => {
		const handOff = cursorReaction({
			cursor: onMe, userId: "u1", isRoundRobin: true, hasDialog: true,
			prevKey: null, lastTurnKey: "4:a0", lastShowNonce: 0,
		});
		expect(handOff.raise).toBe(true);
		expect(handOff.toast).toBe(true);
		// Same turn, written again: announced and raised once already.
		expect(typing({ ...onMe, nonce: 13 }).raise).toBe(false);
	});

	it("raises and repaints for a watching player when the GM force-shows", () => {
		const watcher = cursorReaction({
			cursor: { ...onMe, showNonce: 3 }, userId: "u2", isRoundRobin: true,
			hasDialog: true, typing: true, prevKey: cursorPositionKey(onMe), lastShowNonce: 0,
		});
		expect(watcher.raise).toBe(true);
		expect(watcher.render).toBe(true);
		expect(watcher.showNonce).toBe(3);   // honoured, so it can't force twice
		expect(watcher.toast).toBe(false);   // not their turn
	});

	it("only honours a NEWER show nonce", () => {
		const stale = cursorReaction({
			cursor: { ...onMe, showNonce: 2 }, userId: "u2", isRoundRobin: true,
			hasDialog: true, typing: true, prevKey: cursorPositionKey(onMe), lastShowNonce: 2,
		});
		expect(stale.raise).toBe(false);
		expect(stale.render).toBe(false);
		expect(stale.showNonce).toBe(2);
	});

	it("opens on this player's turn when they have no dialog, and not otherwise", () => {
		const base = { userId: "u1", isRoundRobin: true, hasDialog: false, lastShowNonce: 0 };
		expect(cursorReaction({ cursor: onMe, ...base }).open).toBe(true);
		expect(cursorReaction({ cursor: onMe, ...base, userId: "u2" }).open).toBe(false);
		// A player who closed their window mid-session isn't re-summoned by a nonce bump.
		expect(cursorReaction({ cursor: { ...onMe, nonce: 9 }, ...base, userId: "u2" }).open).toBe(false);
		// ...until the GM force-shows.
		expect(cursorReaction({ cursor: { ...onMe, showNonce: 1 }, ...base, userId: "u2" }).open).toBe(true);
	});

	it("does not treat a non-round-robin phase as anyone's turn", () => {
		const act = cursorReaction({
			cursor: onMe, userId: "u1", isRoundRobin: false, hasDialog: false, lastShowNonce: 0,
		});
		expect(act.open).toBe(false);
		expect(act.toast).toBe(false);
		expect(act.turnKey).toBe(null);
	});

	it("closes every follower's dialog and resets the turn when the session ends", () => {
		const act = cursorReaction({
			cursor: { active: false }, userId: "u1", isRoundRobin: true,
			hasDialog: true, typing: true, lastTurnKey: "4:a1", lastShowNonce: 3,
		});
		expect(act.close).toBe(true);
		expect(act.turnKey).toBe(null);
		expect(act.render).toBe(false);
		// The show-nonce baseline survives the session end, so a stale click can't re-summon.
		expect(act.showNonce).toBe(3);
	});
});
