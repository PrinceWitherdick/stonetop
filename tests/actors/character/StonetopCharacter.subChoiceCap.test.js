import { describe, it, expect } from "vitest";
import { TestCharacterBuilder } from "../../fakes/TestCharacterBuilder.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";

// A minimal playbook whose possession carries a capped multi-select sub-choice line
// (maxSelect 1, +1 per "Big Magic"), mirroring the Blessed's sacred-pouch remarkable-trait
// line — so selectSubChoice's model-level cap enforcement can be exercised in isolation.
const POUCH_PLAYBOOK = {
	slug: "test-pouch-pb",
	name: "Test Pouch",
	specialPossessions: {
		pickCount: 0,
		preselected: ["pouch"],
		options: [{
			slug: "pouch",
			label: "Pouch",
			choiceGroups: [{
				heading: "What remarkable trait does it possess?",
				subgroups: [{
					multiSelect: true,
					maxSelect: 1,
					maxSelectBonus: { moveBonus: [{ moveName: "Big Magic", perInstance: 1 }] },
					options: [{ slug: "a", label: "A" }, { slug: "b", label: "B" }, { slug: "c", label: "C" }],
				}],
			}],
		}],
	},
};

function makeChar({ picked = [], moves = [] } = {}) {
	const actor = new FakeActorBuilder()
		.withPlaybook("test-pouch-pb", "Test Pouch")
		.withFlag("possessions.subChoices", { pouch: picked })
		.withItems(moves.map((name, i) => ({ _id: `m${i}`, type: "move", name, system: { moveType: "playbook" } })))
		.build();
	return new TestCharacterBuilder(actor).addPlaybook(POUCH_PLAYBOOK).build();
}

describe("StonetopCharacter.selectSubChoice — model-level cap", () => {
	it("refuses a pick past the subgroup cap", async () => {
		const char = makeChar({ picked: ["a"] }); // cap is 1, already filled
		await char.selectSubChoice("pouch", "b");
		expect(char.possessions.subChoices.pouch).toEqual(["a"]);
	});

	it("allows the pick once a Big Magic raises the cap", async () => {
		const char = makeChar({ picked: ["a"], moves: ["Big Magic"] }); // cap becomes 2
		await char.selectSubChoice("pouch", "b");
		expect(char.possessions.subChoices.pouch).toEqual(["a", "b"]);
	});

	it("still refuses once the raised cap is also full", async () => {
		const char = makeChar({ picked: ["a", "b"], moves: ["Big Magic"] }); // cap 2, full
		await char.selectSubChoice("pouch", "c");
		expect(char.possessions.subChoices.pouch).toEqual(["a", "b"]);
	});

	it("adds a choice belonging to no capped subgroup (pick-N / radio) unconditionally", async () => {
		const char = makeChar({ picked: ["a"] });
		await char.selectSubChoice("pouch", "unlisted-choice");
		expect(char.possessions.subChoices.pouch).toEqual(["a", "unlisted-choice"]);
	});
});
