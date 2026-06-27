import { describe, expect, it, vi } from "vitest";
import { TestCharacterBuilder } from "../../fakes/TestCharacterBuilder.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";

// A foreign playbook move definition (raw doc the fake move repo wraps in MoveDefinition).
function foreignMove(id, name, system = {}) {
	return { _id: id, name, system: { playbook: "The Heavy", moveType: "playbook", description: `${name} desc`, ...system } };
}

describe("StonetopCharacter.getForeignMovesForLevelUp", () => {
	it("returns qualifying foreign moves; excludes stat / cross-playbook / owned / under-level / unmet-prereq, and IGNORES requirement.playbook", async () => {
		const actor = new FakeActorBuilder()
			.withPlaybook("the-fox", "The Fox")
			.addItem({ _id: "o1", type: "move", name: "Armored", system: { moveType: "playbook", playbook: "The Heavy" } })
			.build();
		const char = new TestCharacterBuilder(actor)
			.addPlaybookMove(foreignMove("f1", "Smash"))                                                  // ✓ qualifies
			.addPlaybookMove(foreignMove("f2", "Improved Stat", { cap: 2 }))                               // ✗ stat move
			.addPlaybookMove(foreignMove("f3", "Seasoned Warrior", { crossPlaybook: { playbooks: ["X"] } })) // ✗ cross-playbook
			.addPlaybookMove(foreignMove("f4", "Armored"))                                                // ✗ already owned
			.addPlaybookMove(foreignMove("f5", "Cut From Granite", { requirement: { moves: ["Carved Out of Wood"] } })) // ✗ missing prereq
			.addPlaybookMove(foreignMove("f6", "Hardy", { requirement: { playbook: "The Heavy" } }))       // ✓ playbook req ignored
			.addPlaybookMove(foreignMove("f7", "Tough", { requirement: { level: 6 } }))                    // ✗ under level
			.build();

		const result = await char.getForeignMovesForLevelUp({ playbooks: ["The Heavy"] }, 5);
		expect(result.map(m => m.name)).toEqual(["Hardy", "Smash"]); // sorted by playbook then name
		expect(result[0]).toMatchObject({ compendiumId: "f6", playbook: "The Heavy", description: "Hardy desc" });
	});

	it("admits a foreign move whose required move the actor DOES own", async () => {
		const actor = new FakeActorBuilder()
			.withPlaybook("the-fox", "The Fox")
			.addItem({ _id: "o1", type: "move", name: "Crew", system: { moveType: "playbook", playbook: "The Marshal" } })
			.build();
		const char = new TestCharacterBuilder(actor)
			.addPlaybookMove(foreignMove("vc", "Veteran Crew", { requirement: { moves: ["Crew"] } }))
			.build();
		const result = await char.getForeignMovesForLevelUp({ playbooks: ["The Marshal"] }, 5);
		expect(result.map(m => m.name)).toEqual(["Veteran Crew"]);
	});
});

describe("StonetopCharacter._applyForeignMoveChoice", () => {
	function makeChar(flags = {}) {
		const actor = new FakeActorBuilder().withPlaybook("the-seeker", "The Seeker").withFlags(flags).build();
		return new TestCharacterBuilder(actor).build();
	}

	it("adds the foreign move and tags it grantedBy the cross-playbook move instance", async () => {
		const char = makeChar();
		const foreignItem = { _id: "new1", name: "Smash", setFlag: vi.fn() };
		char.addMove = vi.fn().mockResolvedValue(foreignItem);
		await char._applyForeignMoveChoice({ id: "cross1", name: "Versatile" }, "f1", null);
		expect(char.addMove).toHaveBeenCalledWith("f1");
		expect(foreignItem.setFlag).toHaveBeenCalledWith("stonetop_pwd", "grantedBy", { move: "Versatile", instanceId: "cross1" });
	});

	it("grants the possession when grantsPossession is set and not already owned (Initiate Sacred Pouch)", async () => {
		const char = makeChar();
		char.addMove = vi.fn().mockResolvedValue({ _id: "x", name: "Big Magic", setFlag: vi.fn() });
		char.selectPossession = vi.fn();
		await char._applyForeignMoveChoice({ id: "c1", name: "Initiate of the Secret Arts" }, "bm", "sacred-pouch");
		expect(char.selectPossession).toHaveBeenCalledWith("sacred-pouch");
	});

	it("does NOT re-grant the possession when the actor already owns it (idempotent across repeated takes)", async () => {
		const char = makeChar({ "possessions.selected": ["sacred-pouch"] });
		char.addMove = vi.fn().mockResolvedValue(null);
		char.selectPossession = vi.fn();
		await char._applyForeignMoveChoice({ id: "c2", name: "Initiate of the Secret Arts" }, null, "sacred-pouch");
		expect(char.selectPossession).not.toHaveBeenCalled();
	});

	it("does nothing with the foreign move when none was chosen (foreignMoveId null)", async () => {
		const char = makeChar();
		char.addMove = vi.fn();
		await char._applyForeignMoveChoice({ id: "c3", name: "Versatile" }, null, null);
		expect(char.addMove).not.toHaveBeenCalled();
	});
});

describe("StonetopCharacter.applyLevelUp — cross-playbook threading", () => {
	function makeChar() {
		const actor = new FakeActorBuilder().withPlaybook("the-fox", "The Fox").withLevel(2).withXp(20, 30).build();
		return new TestCharacterBuilder(actor).build();
	}

	it("adds the cross-playbook move FIRST, then applies the foreign-move choice with that item (ordering is load-bearing for the grantedBy tag)", async () => {
		const char = makeChar();
		const crossItem = { id: "cross1", name: "Versatile" };
		char.addMove = vi.fn().mockResolvedValue(crossItem);
		char._applyForeignMoveChoice = vi.fn();
		await char.applyLevelUp("vId", null, { crossPlaybook: true, foreignMoveId: "fId", grantsPossession: null });
		expect(char.addMove).toHaveBeenCalledWith("vId");
		expect(char._applyForeignMoveChoice).toHaveBeenCalledWith(crossItem, "fId", null);
	});

	it("skips the foreign-move choice entirely when the cross-playbook move failed to add", async () => {
		const char = makeChar();
		char.addMove = vi.fn().mockResolvedValue(null);
		char._applyForeignMoveChoice = vi.fn();
		await char.applyLevelUp("badId", null, { crossPlaybook: true, foreignMoveId: "fId", grantsPossession: "sacred-pouch" });
		expect(char._applyForeignMoveChoice).not.toHaveBeenCalled();
	});
});
