// Level-up mark step — character-model side. Uses the stateful live harness so addMove
// actually grows the owned count that drives a budgeted move's repeat-scaling cap, and so
// setCountMark / setStatSlot writes land in a real flag store (flags.stonetop_pwd.moves.moveMarks).

import { describe, it, expect } from "vitest";
import { buildLiveCharacter, sourceMovesFor } from "../../fakes/LiveCharacter.js";

const marshalMoveId = (name) => sourceMovesFor("The Marshal").find(d => d.name === name)._id;
const getMarks = (actor) => actor.getFlag("stonetop_pwd", "moves.moveMarks") ?? {};

describe("StonetopCharacter.applyLevelUp — count-mark moves (Veteran Crew etc.)", () => {
	it("writes the take's mark, keyed by move name, budget-respecting (1 owned ⇒ 1 pick)", async () => {
		const { char, actor } = buildLiveCharacter({ slug: "the-marshal", name: "The Marshal", level: 2 });
		await char.applyLevelUp(marshalMoveId("Veteran Crew"), null, {
			marks: { moveName: "Veteran Crew", picks: [{ slug: "tags" }] },
		});
		const marks = getMarks(actor)["Veteran Crew"];
		expect(marks.tags).toHaveLength(1);
		// The newly-checked box stamps the level being gained (2 → 3).
		expect(marks.tags[0].level).toBe(3);
	});

	it("derives the crew bonus from the written mark (no double-apply — bonus is render-derived)", async () => {
		const { char } = buildLiveCharacter({ slug: "the-marshal", name: "The Marshal", level: 2 });
		await char.applyLevelUp(marshalMoveId("Veteran Crew"), null, {
			marks: { moveName: "Veteran Crew", picks: [{ slug: "tags" }] },
		});
		// 'tags' grants +2 crew tag slots per mark; one mark ⇒ +2.
		const totals = await char._ownedMoveBonuses({ name: "The Marshal" }, new Set(["Veteran Crew"]));
		expect(totals.crewTags).toBe(2);
	});

	it("clamps a second pick that would exceed the take's budget (1 owned ⇒ only 1)", async () => {
		const { char, actor } = buildLiveCharacter({ slug: "the-marshal", name: "The Marshal", level: 2 });
		await char.applyLevelUp(marshalMoveId("Veteran Crew"), null, {
			marks: { moveName: "Veteran Crew", picks: [{ slug: "tags" }, { slug: "crew-hp" }] },
		});
		const marks = getMarks(actor)["Veteran Crew"];
		expect(marks.tags).toHaveLength(1);
		expect(marks["crew-hp"] ?? []).toHaveLength(0); // budget 1 already spent on tags
	});
});
