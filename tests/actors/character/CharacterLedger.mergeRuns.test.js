import { describe, it, expect } from "vitest";
import { mergeRuns, numericMerge, listMerge } from "../../../module/utils/ledger-core.js";

// mergeRuns folds the bursts of near-identical entries that one player action produces:
// clicking XP up three times, picking four appearance lines, walking a new character from
// level 1 to level 34. Entries arrive newest-first, matching storage order.

let clock = 1_000_000;

function entry(action, { merge = null, move = null, userId = "u1", at = null } = {}) {
	return { id: String(clock++), timestamp: at ?? clock, userId, userName: "GM", action, move, ...(merge ? { merge } : {}) };
}

function numeric(label, key, from, to, opts = {}) {
	const action = `${label} changed from ${from} to ${to}`;
	return entry(action, { merge: numericMerge(label, key, from, to), ...opts });
}

function list(label, key, item, opts = {}) {
	return entry(`${label} set to ${item}`, { merge: listMerge(label, key, [item]), ...opts });
}

const actions = entries => entries.map(e => e.action);

describe("mergeRuns — numeric runs", () => {
	it("collapses a contiguous run into one entry spanning the whole change", () => {
		const merged = mergeRuns([
			numeric("XP", "xp", 2, 3, { at: 300 }),
			numeric("XP", "xp", 1, 2, { at: 200 }),
			numeric("XP", "xp", 0, 1, { at: 100 }),
		]);
		expect(actions(merged)).toEqual(["XP changed from 0 to 3"]);
	});

	it("keeps the newest timestamp so the entry sorts where the last change happened", () => {
		const merged = mergeRuns([
			numeric("XP", "xp", 1, 2, { at: 200 }),
			numeric("XP", "xp", 0, 1, { at: 100 }),
		]);
		expect(merged[0].timestamp).toBe(200);
	});

	it("collapses a whole levelling climb", () => {
		const climb = [];
		for (let level = 1; level < 34; level++) climb.push(numeric("Level", "level", level, level + 1, { at: 1000 + level }));
		expect(actions(mergeRuns(climb.reverse()))).toEqual(["Level changed from 1 to 34"]);
	});

	it("does not join a non-contiguous pair", () => {
		const merged = mergeRuns([
			numeric("HP", "hp", 9, 10, { at: 200 }),
			numeric("HP", "hp", 4, 5, { at: 100 }),
		]);
		expect(actions(merged)).toEqual(["HP changed from 9 to 10", "HP changed from 4 to 5"]);
	});

	it("drops a round trip that lands back where it started", () => {
		const merged = mergeRuns([
			numeric("HP", "hp", 4, 3, { at: 200 }),
			numeric("HP", "hp", 3, 4, { at: 100 }),
		]);
		expect(merged).toEqual([]);
	});

	it("keeps different subjects apart", () => {
		const merged = mergeRuns([
			numeric("DEX", "dex", 1, 2, { at: 200 }),
			numeric("STR", "str", 1, 2, { at: 100 }),
		]);
		expect(actions(merged)).toEqual(["DEX changed from 1 to 2", "STR changed from 1 to 2"]);
	});

	it("never merges across the time window, so tonight's level-up leaves next week's alone", () => {
		const WEEK = 7 * 24 * 60 * 60 * 1000;
		const merged = mergeRuns([
			numeric("Level", "level", 6, 7, { at: WEEK }),
			numeric("Level", "level", 5, 6, { at: 0 }),
		]);
		expect(actions(merged)).toEqual(["Level changed from 6 to 7", "Level changed from 5 to 6"]);
	});

	it("keeps move-driven changes separate from manual ones", () => {
		const merged = mergeRuns([
			numeric("STR", "str", 2, 3, { at: 200 }),
			numeric("STR", "str", 1, 2, { at: 100, move: "Improved Stat" }),
		]);
		expect(merged).toHaveLength(2);
	});

	it("keeps different users' changes separate", () => {
		const merged = mergeRuns([
			numeric("HP", "hp", 5, 6, { at: 200, userId: "u2" }),
			numeric("HP", "hp", 4, 5, { at: 100, userId: "u1" }),
		]);
		expect(merged).toHaveLength(2);
	});
});

describe("mergeRuns — list runs", () => {
	it("accumulates repeated picks into one entry", () => {
		const merged = mergeRuns([
			list("Appearance", "appearance", "ceremonial robes", { at: 400 }),
			list("Appearance", "appearance", "curvy", { at: 300 }),
			list("Appearance", "appearance", "imperious voice", { at: 200 }),
			list("Appearance", "appearance", "fresh-faced", { at: 100 }),
		]);
		expect(actions(merged)).toEqual([
			"Appearance set to fresh-faced, imperious voice, curvy, ceremonial robes",
		]);
	});

	it("does not repeat an item already in the run", () => {
		const merged = mergeRuns([
			list("Appearance", "appearance", "curvy", { at: 200 }),
			list("Appearance", "appearance", "curvy", { at: 100 }),
		]);
		expect(actions(merged)).toEqual(["Appearance set to curvy"]);
	});

	it("truncates a long accumulated list", () => {
		const picks = [];
		for (let i = 0; i < 20; i++) picks.push(list("Arcana gained", "arcana:owned", `A very long arcanum name ${i}`, { at: 100 + i }));
		const merged = mergeRuns(picks.reverse());
		expect(merged).toHaveLength(1);
		expect(merged[0].action.length).toBeLessThan(120);
		expect(merged[0].action).toContain("…");
	});

	it("closes the run at the item cap rather than swallowing further changes", () => {
		const picks = [];
		for (let i = 0; i < 60; i++) picks.push(list("Arcana gained", "arcana:owned", `card-${i}`, { at: 100 + i }));
		const merged = mergeRuns(picks.reverse());
		// Runs cap at 24 items, so 60 picks land as three entries — none of them lost.
		expect(merged.length).toBeGreaterThan(1);
		const covered = merged.reduce((n, e) => n + (e.merge?.items?.length ?? 1), 0);
		expect(covered).toBe(60);
	});
});

describe("mergeRuns — entries without a run descriptor", () => {
	it("leaves plain entries untouched and in order", () => {
		const plain = [entry("Ambush learned", { at: 300 }), entry("Clash learned", { at: 200 }), entry("Aid learned", { at: 100 })];
		expect(actions(mergeRuns(plain))).toEqual(["Ambush learned", "Clash learned", "Aid learned"]);
	});

	it("does not merge across an unrelated entry that interrupts a run", () => {
		const merged = mergeRuns([
			numeric("XP", "xp", 1, 2, { at: 300 }),
			entry("Ambush learned", { at: 200 }),
			numeric("XP", "xp", 0, 1, { at: 100 }),
		]);
		expect(actions(merged)).toEqual(["XP changed from 1 to 2", "Ambush learned", "XP changed from 0 to 1"]);
	});

	it("handles an empty list", () => {
		expect(mergeRuns([])).toEqual([]);
	});
});
