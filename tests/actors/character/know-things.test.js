import { describe, it, expect } from "vitest";
import {
	isKnowThings, ownedMoveNames, logbookUses, knowThingsRollOptions, neverAtALossActions,
	KNOW_THINGS, LOGBOOK, NEVER_AT_A_LOSS, STRONG_HIT_TOTAL,
} from "../../../module/actors/character/know-things.js";

const move = (name, extra = {}) => ({ type: "move", name, system: extra });
const actorWith = (...names) => ({ type: "character", items: names.map(n => (typeof n === "string" ? move(n) : n)) });

describe("isKnowThings", () => {
	it("matches the base move name that the message flag stores", () => {
		expect(isKnowThings(KNOW_THINGS)).toBe(true);
	});

	it("does not match other moves, or nothing at all", () => {
		// The card HEADER would read "Know Things with WIS" for a Well-Read roll, which is exactly
		// why the flag stores the base name and this compares against that rather than the header.
		expect(isKnowThings("Know Things with WIS")).toBe(false);
		expect(isKnowThings("Seek Insight")).toBe(false);
		expect(isKnowThings(null)).toBe(false);
		expect(isKnowThings(undefined)).toBe(false);
	});
});

describe("ownedMoveNames", () => {
	it("collects move names and ignores other item types", () => {
		const actor = { items: [move("Logbook"), { type: "equipment", name: "Rope" }] };
		expect([...ownedMoveNames(actor)]).toEqual(["Logbook"]);
	});

	it("tolerates an actor with no items", () => {
		expect(ownedMoveNames({}).size).toBe(0);
		expect(ownedMoveNames().size).toBe(0);
	});
});

describe("logbookUses", () => {
	// A move track's stored number is how many pips are FILLED, and for a move that means uses
	// SPENT — so a character who has never touched the track has no flag and a full logbook.
	const logbook = move(LOGBOOK, { resource: { max: 2, title: "Uses" } });

	it("reads an untouched logbook as full, not as exhausted", () => {
		expect(logbookUses(actorWith(logbook), {})).toEqual({ max: 2, spent: 0, left: 2 });
	});

	it("counts down as uses are spent", () => {
		expect(logbookUses(actorWith(logbook), { Logbook: 1 }).left).toBe(1);
		expect(logbookUses(actorWith(logbook), { Logbook: 2 }).left).toBe(0);
	});

	it("never reports negative uses if the track overruns its max", () => {
		expect(logbookUses(actorWith(logbook), { Logbook: 5 }).left).toBe(0);
	});

	it("takes max off the owned item, so a re-pointed or homebrew logbook still works", () => {
		const bigger = move(LOGBOOK, { resource: { max: 4 } });
		expect(logbookUses(actorWith(bigger), { Logbook: 1 }).left).toBe(3);
	});

	it("is null for a character who does not own the move", () => {
		expect(logbookUses(actorWith("Know Things"), {})).toBeNull();
	});

	it("ignores another move's track", () => {
		expect(logbookUses(actorWith(logbook), { "Potential for Greatness": 2 }).left).toBe(2);
	});
});

describe("knowThingsRollOptions", () => {
	it("leaves an ordinary character's roll untouched", () => {
		expect(knowThingsRollOptions(actorWith(KNOW_THINGS))).toBeNull();
	});

	it("defers the miss XP for Never at a Loss, and puts the choice on the card", () => {
		const opts = knowThingsRollOptions(actorWith(KNOW_THINGS, NEVER_AT_A_LOSS));
		// Suppressing the automatic mark is what makes the player's choice possible at all.
		expect(opts.noXpOnMiss).toBe(true);
		expect(opts.tierActions.failure).toContain('data-choice="mark"');
		expect(opts.tierActions.failure).toContain('data-choice="decline"');
	});

	it("offers the choice only on a miss — the move only triggers on a 6-", () => {
		const { tierActions } = knowThingsRollOptions(actorWith(NEVER_AT_A_LOSS));
		expect(Object.keys(tierActions)).toEqual(["failure"]);
	});

	it("does not defer XP for a Logbook-only character", () => {
		// The Logbook acts after the roll and spends a resource; it has nothing to do with XP.
		expect(knowThingsRollOptions(actorWith(KNOW_THINGS, LOGBOOK))).toBeNull();
	});
});

describe("neverAtALossActions", () => {
	it("emits both buttons with the shared handler class", () => {
		const html = neverAtALossActions().failure;
		expect(html.match(/class="stonetop-know-things-xp"/g)).toHaveLength(2);
	});
});

describe("STRONG_HIT_TOTAL", () => {
	it("is 10 — padding to exactly a strong hit keeps the card off the 12+ label", () => {
		expect(STRONG_HIT_TOTAL).toBe(10);
	});
});
