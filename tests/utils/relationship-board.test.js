import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	REL_LANES, laneForHearts, laneByKey, buildRelationshipLanes,
	laneMoveTarget, applyRelationshipLaneMove,
	relationshipView, setRelationshipView, REL_VIEW_DEFAULT, autoScrollDelta, dragTranslation,
	REL_STEPS, zoneMoveTarget, moveTarget, isLiftedDrag, isCommittedDrop, liftsDrag,
	stepHearts, laneReorderPatch, applyRelationshipLaneReorder, insertionIndex,
} from "../../module/utils/relationship-board.js";
import { FakeStorage } from "../fakes/migration.js";

// Same recording fake the hearts tests use: the load-bearing assertion is the exact
// entry shape written, and — for the no-op rules — that NOTHING was written at all.
function fakeActor(relationships = {}, name = "Aldric") {
	return {
		name,
		system: { relationships },
		patches: [],
		async update(patch) { this.patches.push(patch); },
		get lastEntry() { return Object.values(this.patches.at(-1) ?? {})[0]; },
	};
}

const card = (name, hearts, rated = true) => ({ id: name.toLowerCase(), name, hearts, rated });

describe("laneForHearts", () => {
	it("bands the five ratings into three lanes", () => {
		expect([1, 2, 3, 4, 5].map(n => laneForHearts(n).key))
			.toEqual(["hostile", "hostile", "neutral", "trusted", "trusted"]);
	});

	// Array order is the RENDERED order, left to right: coldest first, so the board runs
	// the same direction as the rating and as the heart strip, which fills left to right.
	// This is the one place the order is asserted; everything else works by key or index.
	it("runs coldest to warmest, left to right", () => {
		expect(REL_LANES.map(l => l.key)).toEqual(["hostile", "neutral", "trusted"]);
	});

	// Follows clampHearts' two-part policy exactly. An out-of-range NUMBER is still a
	// rating, just a bad one, so it clamps to the nearest end of the scale and lands in
	// that end's lane.
	it("clamps an out-of-range number into the lane at that end of the scale", () => {
		expect(laneForHearts(0).key).toBe("hostile");
		expect(laneForHearts(-3).key).toBe("hostile");
		expect(laneForHearts(9).key).toBe("trusted");
	});

	// Non-numeric is NOT a rating. The map is an unvalidated ObjectField, so garbage must
	// land somewhere rather than dropping the card off the board — and Neutral is the
	// honest reading, where the 1-heart minimum would assert active hatred.
	it("puts a non-numeric rating in Neutral, never nowhere", () => {
		for (const bad of [null, undefined, "nonsense", NaN, ""]) {
			expect(laneForHearts(bad).key).toBe("neutral");
		}
	});

	it("resolves a lane by key, and refuses an unknown one", () => {
		expect(laneByKey("hostile").write).toBe(2);
		expect(laneByKey("beloved")).toBeNull();
	});
});

describe("REL_LANES", () => {
	// A move writes the GENTLE end of its band, so a drag or a lane click can never
	// assert "loves" or "hates" — those stay reserved for a deliberate heart click.
	it("never writes an extreme of the scale", () => {
		expect(REL_LANES.map(l => l.write).sort()).toEqual([2, 3, 4]);
		for (const lane of REL_LANES) {
			expect(lane.write).not.toBe(1);
			expect(lane.write).not.toBe(5);
			// And the value a lane writes must land back in that same lane, or a move would
			// immediately misfile the card it just moved.
			expect(laneForHearts(lane.write).key).toBe(lane.key);
		}
	});

	it("covers all five ratings with no gaps and no overlap", () => {
		const covered = [1, 2, 3, 4, 5].flatMap(n => REL_LANES.filter(l => l.steps.includes(n)));
		expect(covered).toHaveLength(5);
	});
});

// By key, not by position, so re-ordering the board does not break these.
const byKey = lanes => Object.fromEntries(lanes.map(l => [l.key, l]));

describe("lane zones", () => {
	it("splits only the two-value bands, and covers all five ratings once each", () => {
		const lanes = byKey(buildRelationshipLanes([]));
		expect(lanes.hostile.zones.map(z => z.hearts)).toEqual([1, 2]);
		expect(lanes.neutral.zones.map(z => z.hearts)).toEqual([3]);
		expect(lanes.trusted.zones.map(z => z.hearts)).toEqual([4, 5]);
		expect(REL_STEPS).toEqual([1, 2, 3, 4, 5]);
	});

	// Neutral is a single value, so it offers no choice and gets no drop overlay at all —
	// this is the flag the template renders that overlay behind.
	it("marks which lanes offer a value choice", () => {
		const lanes = byKey(buildRelationshipLanes([]));
		expect([lanes.hostile.isSplit, lanes.neutral.isSplit, lanes.trusted.isSplit])
			.toEqual([true, false, true]);
	});

	// The zones are drop TARGETS, not containers. Cards live in one full-width list per lane,
	// because real sub-columns would permanently halve every card's width in a ~185px lane to
	// serve an occasional gesture. So a zone carries only the label and value the overlay
	// needs; anything that put cards in a zone would be reintroducing the sub-columns.
	it("carries no cards, only the label and value the drop overlay needs", () => {
		const lanes = byKey(buildRelationshipLanes([card("Loved", 5), card("Liked", 4)]));
		for (const zone of lanes.trusted.zones) {
			expect(zone).not.toHaveProperty("cards");
			expect(Object.keys(zone).sort()).toEqual(["hearts", "labelKey"]);
		}
		// All of the lane's cards are in its single list, warmest first.
		expect(lanes.trusted.cards.map(c => c.name)).toEqual(["Loved", "Liked"]);
	});

	it("tells each card its own exact rating, so a drop can compare against it", () => {
		const lanes = byKey(buildRelationshipLanes([card("Loved", 5)]));
		expect(lanes.trusted.cards[0].zoneHearts).toBe(5);
		expect(lanes.trusted.cards[0].laneKey).toBe("trusted");
	});

	// A corrupt rating still has to land in a lane, or the card vanishes off the board
	// entirely rather than showing up somewhere a user can fix it.
	it("files a garbage rating in the neutral lane, never nowhere", () => {
		for (const bad of [null, undefined, "nonsense", NaN]) {
			const lanes = buildRelationshipLanes([{ id: "x", name: "X", hearts: bad, rated: true }]);
			const occupied = lanes.filter(l => l.cards.length);
			expect(occupied).toHaveLength(1);
			expect(occupied[0].key).toBe("neutral");
			// And it still reports an exact value, so a drop on it can be judged.
			expect(occupied[0].cards[0].zoneHearts).toBe(3);
		}
	});
});

// The one motion shared by the arrow keys and the card's two outer buttons, so this is where
// "one sub-column" is pinned down.
describe("stepHearts", () => {
	it("walks one rating at a time, in screen order", () => {
		expect([1, 2, 3, 4].map(n => stepHearts(n, 1))).toEqual([2, 3, 4, 5]);
		expect([2, 3, 4, 5].map(n => stepHearts(n, -1))).toEqual([1, 2, 3, 4]);
	});

	// Null, not a clamp. Re-asserting the value a card already holds would run it back through
	// the click-TOGGLE write path and silently decrement the rating.
	it("returns null at either end rather than clamping to the value already held", () => {
		expect(stepHearts(1, -1)).toBeNull();
		expect(stepHearts(5, 1)).toBeNull();
	});

	// The board reads coldest-to-warmest left to right, and the step has to follow whatever
	// REL_STEPS says that order is — not a hard-coded +1 on the rating.
	it("follows REL_STEPS, so direction is screen direction", () => {
		expect(stepHearts(REL_STEPS[0], 1)).toBe(REL_STEPS[1]);
		expect(stepHearts(REL_STEPS.at(-1), -1)).toBe(REL_STEPS.at(-2));
	});

	it("steps from wherever a garbage rating clamps to, never off the scale", () => {
		for (const bad of [null, undefined, "nonsense", NaN]) {
			// clampHearts reads non-numeric as the neutral 3, so both directions are live.
			expect(stepHearts(bad, -1)).toBe(2);
			expect(stepHearts(bad, 1)).toBe(4);
		}
		// An out-of-range NUMBER clamps to its end of the scale, which is a dead end one way.
		expect(stepHearts(9, 1)).toBeNull();
		expect(stepHearts(0, -1)).toBeNull();
	});
});

describe("buildRelationshipLanes", () => {

	it("deals rows into their lanes and counts them", () => {
		const lanes = byKey(buildRelationshipLanes([
			card("Vera", 5), card("Blodwen", 3), card("Aldric", 1), card("Miller", 4),
		]));
		// One full-width list per lane, warmest first.
		expect(lanes.trusted.cards.map(c => c.name)).toEqual(["Vera", "Miller"]);
		expect(lanes.neutral.cards.map(c => c.name)).toEqual(["Blodwen"]);
		expect(lanes.hostile.cards.map(c => c.name)).toEqual(["Aldric"]);
		expect([lanes.hostile.count, lanes.neutral.count, lanes.trusted.count]).toEqual([1, 1, 2]);
	});

	it("returns the lanes in board order, so the template can just iterate", () => {
		expect(buildRelationshipLanes([]).map(l => l.key)).toEqual(REL_LANES.map(l => l.key));
	});

	it("marks an empty lane, so the template can say so instead of showing a void", () => {
		const lanes = byKey(buildRelationshipLanes([card("Vera", 5)]));
		expect(lanes.trusted.isEmpty).toBe(false);
		expect(lanes.neutral.isEmpty).toBe(true);
		expect(lanes.hostile.isEmpty).toBe(true);
	});

	// The whole reason `rated` exists: storage is sparse, so an absent entry reads as 3
	// and Neutral would otherwise bury the deliberate neutrals under the untouched roster.
	it("sinks never-rated cards to the bottom of their lane and counts them apart", () => {
		const lanes = buildRelationshipLanes([
			card("Unrated A", 3, false), card("Rated", 3, true), card("Unrated B", 3, false),
		]);
		const neutral = lanes.find(l => l.key === "neutral");
		expect(neutral.cards.map(c => c.name)).toEqual(["Rated", "Unrated A", "Unrated B"]);
		expect(neutral.count).toBe(3);
		expect(neutral.ratedCount).toBe(1);
	});

	// Position no longer encodes the exact value (the overlay is gone when idle), so the sort
	// has to: rating first, then name. Each card's own heart strip carries the value too.
	it("sorts by rating, then name", () => {
		const lanes = byKey(buildRelationshipLanes([card("Zeb", 5), card("Ama", 4), card("Bo", 5)]));
		expect(lanes.trusted.cards.map(c => c.name)).toEqual(["Bo", "Zeb", "Ama"]);
	});

	// The control is step-left / Neutral / step-right. The outer two must name the rating one
	// sub-column to THEIR OWN side, or a press would move the card the way the arrow does not.
	it("gives every card two step buttons and a Neutral button, in screen order", () => {
		const lanes = byKey(buildRelationshipLanes([card("Miller", 4)]));
		const buttons = lanes.trusted.cards[0].moveButtons;
		expect(buttons.map(b => b.dir)).toEqual(["colder", undefined, "warmer"]);
		expect(buttons[1].laneKey).toBe("neutral");
		expect(buttons.map(b => b.hearts)).toEqual([3, undefined, 5]);
		expect(buttons.some(b => b.disabled)).toBe(false);
	});

	// Two cards in the same lane offer different targets, which is why the control is built per
	// card and not once per lane.
	it("aims each card's step buttons at its own rating, not its lane's", () => {
		const lanes = byKey(buildRelationshipLanes([card("Vera", 5), card("Miller", 4)]));
		expect(lanes.trusted.cards.map(c => c.moveButtons.map(b => b.hearts)))
			.toEqual([[4, undefined, null], [3, undefined, 5]]);
	});

	// Disabled, not dropped: losing a segment would shift Neutral under the pointer on exactly
	// the cards someone is most likely to be nudging back toward the middle.
	it("disables the step button that has nowhere to go, at either end", () => {
		const lanes = byKey(buildRelationshipLanes([card("Vera", 5), card("Aldric", 1)]));
		expect(lanes.trusted.cards[0].moveButtons.map(b => b.disabled)).toEqual([false, undefined, true]);
		expect(lanes.hostile.cards[0].moveButtons.map(b => b.disabled)).toEqual([true, undefined, false]);
	});

	it("marks the Neutral button as current only for a card in that lane", () => {
		const lanes = byKey(buildRelationshipLanes([card("Blodwen", 3), card("Vera", 5)]));
		expect(lanes.neutral.cards[0].moveButtons[1].isCurrent).toBe(true);
		expect(lanes.trusted.cards[0].moveButtons[1].isCurrent).toBe(false);
	});

	// The tooltip has to name the rating the press will write BEFORE it is pressed, which is
	// what makes a step allowed to assert "hates" and "loves" where a band button was not.
	it("labels a step with the rating it would write, and a dead end with the current one", () => {
		const lanes = byKey(buildRelationshipLanes([card("Aldric", 1)]));
		const [colder, , warmer] = lanes.hostile.cards[0].moveButtons;
		expect(colder.labelKey).toBe("stonetop.relationships.lane.stepFloor");
		expect(colder.targetLabelKey).toBe("stonetop.relationships.zone.h1");
		expect(warmer.labelKey).toBe("stonetop.relationships.lane.stepWarmer");
		expect(warmer.targetLabelKey).toBe("stonetop.relationships.zone.h2");
	});

	// Every button needs a resolvable target key, including the Neutral one: the template
	// formats all three through a single `{{localize labelKey target=(localize targetLabelKey)}}`
	// expression, and an undefined key would render the string "undefined" in the tooltip.
	it("gives every button a target label key", () => {
		const lanes = buildRelationshipLanes([card("Vera", 5), card("Blodwen", 3), card("Aldric", 1)]);
		for (const lane of lanes) {
			for (const c of lane.cards) {
				for (const b of c.moveButtons) {
					expect(b.targetLabelKey).toMatch(/^stonetop\.relationships\.zone\.h[1-5]$/);
				}
			}
		}
	});

	it("does not mutate the rows it was handed", () => {
		const rows = [card("Vera", 5)];
		buildRelationshipLanes(rows);
		expect(rows[0]).not.toHaveProperty("moveButtons");
	});

	it("survives no rows at all", () => {
		expect(buildRelationshipLanes().every(l => l.isEmpty)).toBe(true);
	});
});

describe("laneMoveTarget", () => {
	it("writes the target lane's value on a real move", () => {
		expect(laneMoveTarget({ hearts: 3, rated: true, laneKey: "trusted" })).toBe(4);
		expect(laneMoveTarget({ hearts: 5, rated: true, laneKey: "hostile" })).toBe(2);
	});

	// Load-bearing: setRelationshipHearts is a click-TOGGLE, so re-asserting the current
	// value through the normal path would silently decrement the rating.
	it("is a no-op when a rated card is dropped in the lane it already occupies", () => {
		expect(laneMoveTarget({ hearts: 5, rated: true, laneKey: "trusted" })).toBeNull();
		expect(laneMoveTarget({ hearts: 1, rated: true, laneKey: "hostile" })).toBeNull();
	});

	// An unrated card reads as 3 only because nothing is stored. Committing it to Neutral
	// is a real change even though the number does not move: it stops being a guess.
	it("still commits an unrated card to its own default lane", () => {
		expect(laneMoveTarget({ hearts: 3, rated: false, laneKey: "neutral" })).toBe(3);
	});

	it("moving WITHIN Trusted is a no-op, so a 5 is never quietly demoted to 4", () => {
		expect(laneMoveTarget({ hearts: 5, rated: true, laneKey: "trusted" })).toBeNull();
	});

	it("refuses an unknown lane rather than guessing", () => {
		expect(laneMoveTarget({ hearts: 3, rated: true, laneKey: "beloved" })).toBeNull();
		expect(laneMoveTarget({})).toBeNull();
	});
});

describe("zoneMoveTarget", () => {
	it("writes the exact rating the zone names", () => {
		for (const n of [1, 2, 3, 4, 5]) {
			expect(zoneMoveTarget({ hearts: 3, rated: true, zoneHearts: n })).toBe(n === 3 ? null : n);
		}
	});

	// The whole point of the zones: a band move could not express this, because 4 and 5 are
	// both Trusted and laneMoveTarget would have called it a no-op.
	it("moves between two values inside one band, which a band move cannot", () => {
		expect(laneMoveTarget({ hearts: 5, rated: true, laneKey: "trusted" })).toBeNull();
		expect(zoneMoveTarget({ hearts: 5, rated: true, zoneHearts: 4 })).toBe(4);
		expect(zoneMoveTarget({ hearts: 1, rated: true, zoneHearts: 2 })).toBe(2);
	});

	// An aimed drop into a labelled zone IS deliberate, so unlike a band move it may assert
	// the extremes. That was always the real requirement: no ACCIDENTAL "hates"/"loves".
	it("can assert 1 and 5, which a band move deliberately cannot", () => {
		expect(zoneMoveTarget({ hearts: 2, rated: true, zoneHearts: 1 })).toBe(1);
		expect(zoneMoveTarget({ hearts: 4, rated: true, zoneHearts: 5 })).toBe(5);
		expect(REL_LANES.map(l => l.write)).not.toContain(1);
		expect(REL_LANES.map(l => l.write)).not.toContain(5);
	});

	it("is a no-op when a rated card is dropped on the value it already has", () => {
		expect(zoneMoveTarget({ hearts: 4, rated: true, zoneHearts: 4 })).toBeNull();
	});

	it("still commits an unrated card to the value it already displays", () => {
		expect(zoneMoveTarget({ hearts: 3, rated: false, zoneHearts: 3 })).toBe(3);
	});

	// Better to write nothing than to clamp into a rating the user did not aim at.
	it("refuses a zone that is not a real step", () => {
		for (const bad of [0, 6, -1, 2.5, "x", null, undefined, NaN]) {
			expect(zoneMoveTarget({ hearts: 3, rated: true, zoneHearts: bad })).toBeNull();
		}
	});
});

describe("moveTarget", () => {
	it("takes the zone when given one, since it is the more specific instruction", () => {
		expect(moveTarget({ hearts: 3, rated: true, laneKey: "trusted", zoneHearts: 5 })).toBe(5);
	});

	it("falls back to the band's gentle end when no zone is named", () => {
		expect(moveTarget({ hearts: 3, rated: true, laneKey: "trusted" })).toBe(4);
		expect(moveTarget({ hearts: 3, rated: true, laneKey: "hostile" })).toBe(2);
	});

	// A drop on a lane's header or padding passes no zone, so `undefined` must mean "band",
	// not "zone number undefined".
	it("treats an absent or null zone as a band move, not a broken zone", () => {
		expect(moveTarget({ hearts: 3, rated: true, laneKey: "trusted", zoneHearts: undefined })).toBe(4);
		expect(moveTarget({ hearts: 3, rated: true, laneKey: "trusted", zoneHearts: null })).toBe(4);
	});
});

describe("applyRelationshipLaneMove", () => {
	it("writes the whole entry under the id, exactly like a heart click", async () => {
		const actor = fakeActor();
		expect(await applyRelationshipLaneMove(actor, { id: "vera", hearts: 3, rated: false, laneKey: "trusted" })).toBe(4);
		expect(Object.keys(actor.patches[0])[0]).toBe("system.relationships.vera");
		expect(actor.lastEntry).toEqual({ hearts: 4 });
	});

	it("writes NOTHING on a no-op move, so no phantom ledger line is logged", async () => {
		const actor = fakeActor({ vera: { hearts: 5, notes: "" } });
		expect(await applyRelationshipLaneMove(actor, { id: "vera", hearts: 5, rated: true, laneKey: "trusted" })).toBeNull();
		expect(actor.patches).toHaveLength(0);
	});

	it("carries an existing note and visibility choice through the move", async () => {
		const actor = fakeActor({ vera: { hearts: 2, notes: "owes a debt", shown: false } });
		await applyRelationshipLaneMove(actor, { id: "vera", hearts: 2, rated: true, laneKey: "trusted" });
		expect(actor.lastEntry).toEqual({ hearts: 4, notes: "owes a debt", shown: false });
	});

	// The end-to-end shape of the bug the `rated` flag exists to prevent: someone revealed
	// on the sheet but never judged must still be committable to Neutral. If a bare reveal
	// counted as a rating, this click would hit the same-lane no-op and write nothing.
	it("commits a revealed-but-never-rated person to Neutral", async () => {
		const actor = fakeActor({ vera: { notes: "", shown: true } });
		const rated = false; // what relationshipRow derives for an entry with no hearts
		expect(await applyRelationshipLaneMove(actor, { id: "vera", hearts: 3, rated, laneKey: "neutral" })).toBe(3);
		expect(actor.lastEntry).toEqual({ hearts: 3, notes: "", shown: true });
	});

	it("writes nothing when the viewer cannot edit, or when there is no id", async () => {
		for (const opts of [
			{ id: "vera", hearts: 3, rated: true, laneKey: "trusted", editable: false },
			{ id: "", hearts: 3, rated: true, laneKey: "trusted" },
		]) {
			const actor = fakeActor();
			expect(await applyRelationshipLaneMove(actor, opts)).toBeNull();
			expect(actor.patches).toHaveLength(0);
		}
	});

	// A round trip out of Trusted and back lands on 4, not the original 5. That is the
	// accepted cost of three lanes over a five-point scale; the heart strip is the
	// lossless route, and this test pins the behaviour so it can't drift unnoticed.
	it("is lossy on a round trip, by design", async () => {
		const actor = fakeActor({ vera: { hearts: 5, notes: "" } });
		await applyRelationshipLaneMove(actor, { id: "vera", hearts: 5, rated: true, laneKey: "hostile" });
		expect(actor.lastEntry.hearts).toBe(2);
		await applyRelationshipLaneMove(actor, { id: "vera", hearts: 2, rated: true, laneKey: "trusted" });
		expect(actor.lastEntry.hearts).toBe(4);
	});
});

// A pointer-event drag gets NO auto-scroll from the browser, so a lane below the fold
// would be unreachable without this. Container spans y=100..500 here, 40px margins.
describe("autoScrollDelta", () => {
	const at = y => autoScrollDelta(y, 100, 500);

	it("does not scroll while the pointer is clear of both margins", () => {
		expect(at(300)).toBe(0);
		expect(at(141)).toBe(0);
		expect(at(459)).toBe(0);
	});

	it("scrolls up near the top and down near the bottom", () => {
		expect(at(120)).toBeLessThan(0);
		expect(at(480)).toBeGreaterThan(0);
	});

	it("ramps with depth into the margin, so easing in creeps and pinning runs", () => {
		expect(Math.abs(at(130))).toBeLessThan(Math.abs(at(110)));
		expect(at(470)).toBeLessThan(at(490));
	});

	it("clamps, so dragging far past the edge cannot fling the sheet", () => {
		expect(at(-9999)).toBe(-16);
		expect(at(9999)).toBe(16);
	});

	// A container shorter than two margins is entirely "edge". It must still resolve to one
	// direction rather than fighting itself or scrolling on a stationary pointer.
	it("picks a single direction in a container smaller than its own margins", () => {
		const tiny = autoScrollDelta(30, 20, 60);
		expect(tiny).toBeLessThan(0);
		expect(Number.isFinite(tiny)).toBe(true);
	});
});

// Two thresholds, and the gap between them is the point. A card fills its whole lane, so it
// straddles BOTH of that lane's drop zones; the overlay appears the moment the card lifts,
// which puts the pointer inside a zone it never travelled to. Honouring that would let a
// twitch on the left half of a "Dislikes" card silently rewrite it to "Hates".
describe("drag thresholds", () => {
	it("lifts the card sooner than it will commit a drop", () => {
		// A press that has lifted but not travelled: draggable, not yet droppable.
		expect(isLiftedDrag(6, 0)).toBe(true);
		expect(isCommittedDrop(6, 0)).toBe(false);
	});

	it("refuses to write for a nudge in any direction", () => {
		for (const [dx, dy] of [[0, 0], [4, 0], [0, 5], [-6, 4], [8, 8]]) {
			expect(isCommittedDrop(dx, dy)).toBe(false);
		}
	});

	it("commits once the gesture is a real drag", () => {
		for (const [dx, dy] of [[14, 0], [0, -14], [40, 30], [-60, 5]]) {
			expect(isCommittedDrop(dx, dy)).toBe(true);
		}
	});

	// If these ever crossed, a card could be picked up and never put down — or worse, be
	// committed before it had even lifted.
	it("keeps the lift threshold strictly below the commit threshold", () => {
		const lift = [...Array(200).keys()].find(d => isLiftedDrag(d, 0));
		const commit = [...Array(200).keys()].find(d => isCommittedDrop(d, 0));
		expect(lift).toBeLessThan(commit);
	});

	it("measures radially, so travel counts whichever way the card went", () => {
		// 10-per-axis is ~14.1 diagonal: past the commit distance even though neither axis is.
		expect(isCommittedDrop(10, 10)).toBe(true);
		expect(isCommittedDrop(10, 0)).toBe(false);
	});

	// A card carries `touch-action: pan-y`, so the vertical axis belongs to the scroller. A
	// vertical touch swipe is someone scrolling the sheet; lifting the card for it flashed
	// every drop zone until the browser claimed the gesture and fired pointercancel.
	describe("touch cedes the vertical axis to scrolling", () => {
		it("refuses to lift on a vertical-dominant touch swipe", () => {
			expect(liftsDrag("touch", 0, 40)).toBe(false);
			expect(liftsDrag("touch", 5, 40)).toBe(false);
		});

		it("still lifts on a horizontal-dominant touch swipe, which is a real drag", () => {
			expect(liftsDrag("touch", 40, 0)).toBe(true);
			expect(liftsDrag("touch", 40, 5)).toBe(true);
		});

		it("leaves mouse and pen on the plain radial test — no competing scroll gesture", () => {
			for (const kind of ["mouse", "pen", undefined]) {
				expect(liftsDrag(kind, 0, 40)).toBe(true);
				expect(liftsDrag(kind, 40, 0)).toBe(true);
			}
		});

		it("never lifts below the threshold, whatever the pointer or axis", () => {
			for (const kind of ["touch", "mouse", "pen"]) {
				expect(liftsDrag(kind, 2, 2)).toBe(false);
			}
		});
	});
});

describe("dragTranslation", () => {
	it("tracks the pointer when nothing has scrolled", () => {
		expect(dragTranslation({ x: 150, startX: 100, y: 220, startY: 200 }))
			.toEqual({ dx: 50, dy: 20 });
	});

	// The property that matters, stated directly: wherever the card started on screen, and
	// however far the container has scrolled under it, the card must render at the pointer.
	// The card's own layout position moves by -scrolled, so rendered = origin - scrolled + dy.
	it("keeps the card under the pointer across any amount of auto-scroll", () => {
		const origin = 400;
		const start = { x: 100, startX: 100, startY: 200, startScroll: 0 };
		for (const [pointerY, scrollTop] of [[200, 0], [260, 0], [260, 120], [260, 900], [180, -60]]) {
			const { dy } = dragTranslation({ ...start, y: pointerY, scrollTop });
			const rendered = origin - (scrollTop - start.startScroll) + dy;
			expect(rendered).toBe(origin + (pointerY - start.startY));
		}
	});

	it("measures scroll from where the drag began, not from zero", () => {
		// Armed on an already-scrolled sheet: only movement SINCE the press counts.
		const still = dragTranslation({ x: 0, startX: 0, y: 200, startY: 200, scrollTop: 500, startScroll: 500 });
		expect(still).toEqual({ dx: 0, dy: 0 });
	});

	it("adds the scrolled distance rather than subtracting it", () => {
		// The sign is the whole bug: subtracting made the card run away at twice the rate.
		const { dy } = dragTranslation({ x: 0, startX: 0, y: 200, startY: 200, scrollTop: 100, startScroll: 0 });
		expect(dy).toBe(100);
	});
});

describe("relationshipView", () => {
	// The view preference is per browser, not world data, so it needs a real storage
	// surface. Reuses the Map-backed fake the migration tests already ship.
	beforeEach(() => { globalThis.localStorage = new FakeStorage(); });
	afterEach(() => { delete globalThis.localStorage; });

	it("defaults to the table, including for an unknown or corrupt stored value", () => {
		expect(relationshipView("nothingStored")).toBe(REL_VIEW_DEFAULT);
		setRelationshipView("bogusKey", "kanban");
		expect(relationshipView("bogusKey")).toBe("table");
	});

	it("round-trips a real choice, per table", () => {
		setRelationshipView("characterRelationships", "board");
		setRelationshipView("steadingSettlements", "table");
		expect(relationshipView("characterRelationships")).toBe("board");
		expect(relationshipView("steadingSettlements")).toBe("table");
	});

	it("tolerates a missing resizeKey rather than writing a junk storage entry", () => {
		expect(relationshipView(undefined)).toBe(REL_VIEW_DEFAULT);
		expect(() => setRelationshipView(undefined, "board")).not.toThrow();
		expect(globalThis.localStorage.length).toBe(0);
	});

	// Storage can be unavailable outright (private browsing, a quota wall). The section
	// must still render, in the default layout — never throw out of getData.
	it("falls back to the table when storage is unavailable, without throwing", () => {
		delete globalThis.localStorage;
		expect(relationshipView("characterRelationships")).toBe(REL_VIEW_DEFAULT);
		expect(() => setRelationshipView("characterRelationships", "board")).not.toThrow();
	});
});

// ── Hand-arranged lanes ──────────────────────────────────────────────────────

// A card someone has placed, versus one nobody has touched. The distinction is the whole
// point of the feature: the position is sparse, so an ABSENT one means "sort me by the
// rule", not "put me first".
const placedCard = (name, hearts, order, rated = true) => ({ ...card(name, hearts, rated), order });

describe("buildRelationshipLanes ordering", () => {
	// The default sort, unchanged, on a lane nobody has arranged. This is the guard that
	// keeps the feature opt-in: an untouched board must look exactly as it did before.
	it("leaves an unarranged lane sorted by the old rule", () => {
		const lanes = byKey(buildRelationshipLanes([
			card("Aldric", 4), card("Zeva", 5), card("Bran", 4, false),
		]));
		expect(lanes.trusted.cards.map(c => c.name)).toEqual(["Zeva", "Aldric", "Bran"]);
	});

	it("puts hand-placed cards in their own order, ahead of everyone unplaced", () => {
		const lanes = byKey(buildRelationshipLanes([
			card("Unplaced", 5),
			placedCard("Third", 4, 2), placedCard("First", 4, 0), placedCard("Second", 5, 1),
		]));
		expect(lanes.trusted.cards.map(c => c.name))
			.toEqual(["First", "Second", "Third", "Unplaced"]);
	});

	// A newcomer queues at the BOTTOM of an arranged lane rather than shouldering into the
	// middle of an arrangement it was never part of — even though its rating would have put
	// it first under the default rule.
	it("queues a newcomer below an arranged lane, whatever its rating", () => {
		const lanes = byKey(buildRelationshipLanes([
			placedCard("Liked", 4, 0), card("Loved", 5),
		]));
		expect(lanes.trusted.cards.map(c => c.name)).toEqual(["Liked", "Loved"]);
	});

	// A hand-placed position OUTRANKS the rating sort, which is the point: the arrangement
	// is the answer, and a 4 above a 5 is a thing someone is allowed to want.
	it("lets an arrangement outrank the rating it would otherwise sort by", () => {
		const lanes = byKey(buildRelationshipLanes([
			placedCard("Liked", 4, 0), placedCard("Loved", 5, 1),
		]));
		expect(lanes.trusted.cards.map(c => c.name)).toEqual(["Liked", "Loved"]);
	});

	// These live in an ObjectField, which validates nothing. A hand-edited or corrupted
	// value must read as "unplaced" rather than wedging the column somewhere strange.
	it("treats a junk position as unplaced", () => {
		const lanes = byKey(buildRelationshipLanes([
			placedCard("Junk", 5, "second"), placedCard("Negative", 5, -1),
			placedCard("Fractional", 5, 1.5), placedCard("Real", 5, 0),
		]));
		expect(lanes.trusted.cards[0].name).toBe("Real");
		expect(lanes.trusted.cards.map(c => c.name).slice(1).sort())
			.toEqual(["Fractional", "Junk", "Negative"]);
	});

	// Two cards claiming the same slot cannot happen from the board — a reorder renumbers
	// the whole lane — but the numbers are hand-editable, so the tie must still resolve to
	// something someone chose rather than to whatever Array#sort happens to do.
	it("breaks a tie between equal positions with the default rule", () => {
		const lanes = byKey(buildRelationshipLanes([
			placedCard("Liked", 4, 0), placedCard("Loved", 5, 0),
		]));
		expect(lanes.trusted.cards.map(c => c.name)).toEqual(["Loved", "Liked"]);
	});

	// What a reorder counts FROM — not the stored position, which is empty on an unplaced
	// card, and stale on one that has just changed lanes.
	it("tells each card where it is rendered, and which ends of the column are dead", () => {
		const lanes = byKey(buildRelationshipLanes([card("A", 5), card("B", 4), card("C", 4)]));
		expect(lanes.trusted.cards.map(c => c.laneIndex)).toEqual([0, 1, 2]);
		const disabled = lanes.trusted.cards.map(c => c.orderButtons.map(b => b.disabled));
		expect(disabled).toEqual([[true, false], [false, false], [false, true]]);
	});

	it("renders both ends dead on a lone card, so the strip never changes size", () => {
		const lanes = byKey(buildRelationshipLanes([card("Alone", 5)]));
		expect(lanes.trusted.cards[0].orderButtons.map(b => b.disabled)).toEqual([true, true]);
	});
});

describe("insertionIndex", () => {
	// Three 40px cards stacked from y=0, so their midpoints land at 20, 60 and 100.
	const MIDS = [20, 60, 100];

	// The whole point of the subtraction: a card dragged DOWNWARD must be able to reach the
	// slot below it. The dragged card still occupies its own slot while in flight, so it is
	// counted too, and without the correction "just past my neighbour's middle" resolves to
	// the slot the card is already in — the gesture would do nothing.
	it("lets a card reach the slot below it", () => {
		expect(insertionIndex(MIDS, 61, 0)).toBe(1);   // A dragged just past B's middle
		expect(insertionIndex(MIDS, 101, 0)).toBe(2);  // ...and past C's
		expect(insertionIndex(MIDS, 101, 1)).toBe(2);  // B to the bottom
	});

	it("lets a card reach the slot above it", () => {
		expect(insertionIndex(MIDS, 19, 2)).toBe(0);   // C dragged above A's middle
		expect(insertionIndex(MIDS, 59, 2)).toBe(1);
		expect(insertionIndex(MIDS, 19, 1)).toBe(0);
	});

	// Held over its own half of its own slot, the answer is the slot it is in — which
	// laneReorderPatch then refuses as a no-op. A drag that goes nowhere writes nothing.
	it("resolves to the card's own slot while it has not passed a neighbour", () => {
		expect(insertionIndex(MIDS, 21, 0)).toBe(0);
		expect(insertionIndex(MIDS, 59, 0)).toBe(0);
		expect(insertionIndex(MIDS, 61, 1)).toBe(1);
		expect(insertionIndex(MIDS, 99, 1)).toBe(1);
	});

	// Above every card and below every card: a drag can travel well past either end, and the
	// answer has to stay a real slot rather than running off the list.
	it("stays inside the lane past either end", () => {
		expect(insertionIndex(MIDS, -500, 1)).toBe(0);
		expect(insertionIndex(MIDS, 5000, 1)).toBe(2);
	});

	it("answers 0 for a lane holding only the card being dragged", () => {
		expect(insertionIndex([20], 5, 0)).toBe(0);
		expect(insertionIndex([20], 500, 0)).toBe(0);
	});
});

describe("laneReorderPatch", () => {
	const lane = [{ id: "a", order: 0 }, { id: "b", order: 1 }, { id: "c", order: 2 }];

	it("renumbers only the rows the move actually shifts", () => {
		// c to the top: c takes 0, a and b each slide down one.
		expect(laneReorderPatch(lane, "c", 0)).toEqual({ c: 0, a: 1, b: 2 });
		// b down one: only b and c swap. `a` keeps 0 and stays out of the patch entirely.
		expect(laneReorderPatch(lane, "b", 2)).toEqual({ b: 2, c: 1 });
	});

	// The first arrangement of a lane nobody has touched has to number EVERY card, because
	// there is nothing to be relative to yet — that is the case sparse numbering cannot
	// express, and the reason this renumbers rather than interpolating.
	it("numbers the whole lane the first time one is arranged", () => {
		const fresh = [{ id: "a" }, { id: "b" }, { id: "c" }];
		expect(laneReorderPatch(fresh, "c", 0)).toEqual({ c: 0, a: 1, b: 2 });
	});

	it("refuses a move that changes nothing", () => {
		expect(laneReorderPatch(lane, "b", 1)).toBeNull();
		expect(laneReorderPatch(lane, "nobody", 0)).toBeNull();
		expect(laneReorderPatch([], "a", 0)).toBeNull();
	});

	// The keyboard and the two buttons ask for one slot either way without checking the
	// ends, and a drag can travel past the last card. All of those clamp rather than
	// throwing the gesture away — except at an end, where the clamp lands on the card's own
	// slot and the move correctly becomes a no-op.
	it("clamps a target past either end of the lane", () => {
		expect(laneReorderPatch(lane, "b", -5)).toEqual({ b: 0, a: 1 });
		expect(laneReorderPatch(lane, "b", 99)).toEqual({ b: 2, c: 1 });
		expect(laneReorderPatch(lane, "a", -1)).toBeNull();
		expect(laneReorderPatch(lane, "c", 99)).toBeNull();
	});

	it("refuses a target that is not a number at all", () => {
		expect(laneReorderPatch(lane, "a", "second")).toBeNull();
		expect(laneReorderPatch(lane, "a", undefined)).toBeNull();
	});

	// A lane gains a GAP in its numbering the moment a card leaves it — the survivors keep
	// the numbers they had. The patch is a diff, so in that state the moved card can land on
	// the very number it already carries and drop out of its own patch. Nothing downstream
	// may read the card's destination back out of this, which is why laneIndexIn exists.
	it("can omit the moved card itself once the lane has a gap", () => {
		// What is left of [A(0), B(1), C(2)] after A was promoted out of the lane.
		const gapped = [{ id: "b", order: 1 }, { id: "c", order: 2 }];
		const patch = laneReorderPatch(gapped, "b", 1);
		expect(patch).toEqual({ c: 0 });
		expect(patch.b).toBeUndefined();
	});
});

describe("applyRelationshipLaneReorder", () => {
	const lane = [{ id: "a", order: 0 }, { id: "b", order: 1 }, { id: "c", order: 2 }];

	// ONE update for the whole lane. A write per card would re-render the sheet once per
	// card and let the board flicker through every intermediate arrangement.
	it("writes every renumbered row in a single update", async () => {
		const actor = fakeActor({ a: { hearts: 5 }, b: { hearts: 4 }, c: { hearts: 4 } });
		expect(await applyRelationshipLaneReorder(actor, { cards: lane, id: "c", toIndex: 0 }))
			.toEqual({ c: 0, a: 1, b: 2 });
		expect(actor.patches).toHaveLength(1);
		expect(Object.keys(actor.patches[0]).sort()).toEqual([
			"system.relationships.a", "system.relationships.b", "system.relationships.c",
		]);
		// The rating rides through untouched: a position is not a judgment.
		expect(actor.patches[0]["system.relationships.c"]).toEqual({ hearts: 4, order: 0 });
	});

	it("writes nothing on a no-op, or when the viewer cannot edit", async () => {
		for (const opts of [
			{ cards: lane, id: "b", toIndex: 1 },
			{ cards: lane, id: "c", toIndex: 0, editable: false },
			{ cards: lane, id: "", toIndex: 0 },
		]) {
			const actor = fakeActor();
			expect(await applyRelationshipLaneReorder(actor, opts)).toBeNull();
			expect(actor.patches).toHaveLength(0);
		}
	});

	// Placing an unrated card must not invent a rating for them: `rated` is derived from
	// whether `hearts` is stored, so an entry created by a reorder would otherwise turn a
	// dimmed "never judged" card into a real 3-heart verdict.
	it("places an unrated card without judging them", async () => {
		const actor = fakeActor({});
		await applyRelationshipLaneReorder(actor, {
			cards: [{ id: "a" }, { id: "b" }], id: "b", toIndex: 0,
		});
		expect(actor.patches[0]["system.relationships.b"]).toEqual({ order: 0 });
	});
});

describe("a lane move and a hand-placed position", () => {
	// A card that changes COLUMN loses its position: the number named a slot in the lane it
	// just left, so honouring it in the new one drops the card into the middle of a column
	// it has never been in. Cleared, it lands at the bottom, where an arrival belongs.
	it("clears the position when the card changes column", async () => {
		const actor = fakeActor({ vera: { hearts: 2, order: 0 } });
		await applyRelationshipLaneMove(actor, { id: "vera", hearts: 2, rated: true, laneKey: "trusted" });
		expect(actor.lastEntry).toEqual({ hearts: 4, order: null });
	});

	// ...but a rating nudge INSIDE a lane keeps it. The arrangement is about the column, and
	// 4 to 5 is not a request to be re-sorted.
	it("keeps the position when only the rating moves within the lane", async () => {
		const actor = fakeActor({ vera: { hearts: 4, order: 2 } });
		await applyRelationshipLaneMove(actor, { id: "vera", hearts: 4, rated: true, zoneHearts: 5 });
		expect(actor.lastEntry).toEqual({ hearts: 5, order: 2 });
	});

	// Nothing stored, nothing to clear: an ordinary rating change on a board nobody has
	// arranged must not start writing a null into every entry it touches.
	it("stores no position at all for a card that never had one", async () => {
		const actor = fakeActor({ vera: { hearts: 2 } });
		await applyRelationshipLaneMove(actor, { id: "vera", hearts: 2, rated: true, laneKey: "trusted" });
		expect(actor.lastEntry).toEqual({ hearts: 4 });
	});
});
