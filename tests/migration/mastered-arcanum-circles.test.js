import { describe, it, expect, vi } from "vitest";
import { repairMasteredArcanumCircles } from "../../module/migration/mastered-arcanum-circles.js";

// The sweep hands each character to CharacterArcana#repairMasteredUnlock (tested with the arcana)
// and counts the ones it wrote to.
describe("repairMasteredArcanumCircles", () => {
	const actor = (type, wrote) => ({ type, typedActor: { repairMasteredUnlock: vi.fn(async () => wrote) } });

	it("asks every character, and counts the ones repaired", async () => {
		const actors = [actor("character", true), actor("character", false), actor("npc", true)];
		expect(await repairMasteredArcanumCircles({ actors })).toBe(1);
		expect(actors[1].typedActor.repairMasteredUnlock).toHaveBeenCalled();
		expect(actors[2].typedActor.repairMasteredUnlock).not.toHaveBeenCalled();
	});
});
