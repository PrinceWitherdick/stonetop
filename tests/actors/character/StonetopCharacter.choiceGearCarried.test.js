import { describe, it, expect } from "vitest";
import { TestCharacterBuilder } from "../../fakes/TestCharacterBuilder.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";

// A gear-bearing `choices` bundle (the Heavy's Weapons of war): choosing which weapons you
// own and marking which you're carrying are two separate states, so giving one up has to
// drop its ◇ carry mark — otherwise re-choosing it later would silently re-add its weight.
const WEAPONS_PLAYBOOK = {
	slug: "test-weapons-pb",
	name: "Test Weapons",
	specialPossessions: {
		pickCount: 0,
		preselected: ["weapons-of-war"],
		options: [{
			slug: "weapons-of-war",
			label: "Weapons of war",
			choices: {
				pickCount: 3, gear: true,
				options: [
					{ slug: "sword",     label: "◇ Sword, iron" },
					{ slug: "battleaxe", label: "◇ Battleaxe, iron" },
					{ slug: "crossbow",  label: "◇ Crossbow" },
				],
			},
		}],
	},
};

function makeChar({ picked = [], carried = {} } = {}) {
	const actor = new FakeActorBuilder()
		.withPlaybook("test-weapons-pb", "Test Weapons")
		.withFlag("possessions.subChoices", { "weapons-of-war": picked })
		.withFlag("possessions.choiceCarried", carried)
		.build();
	return new TestCharacterBuilder(actor).addPlaybook(WEAPONS_PLAYBOOK).build();
}

describe("StonetopCharacter — choice-gear carry marks", () => {
	it("setChoiceGearCarried records the ◇ without touching the picks", async () => {
		const char = makeChar({ picked: ["sword"] });
		await char.setChoiceGearCarried("weapons-of-war", "sword", true);
		expect(char.possessions.isChoiceCarried("weapons-of-war", "sword")).toBe(true);
		expect(char.possessions.subChoices["weapons-of-war"]).toEqual(["sword"]);
	});

	it("deselectSubChoice drops the weapon's carry mark with it", async () => {
		const char = makeChar({ picked: ["sword"], carried: { "weapons-of-war:sword": true } });
		await char.deselectSubChoice("weapons-of-war", "sword");
		expect(char.possessions.subChoices["weapons-of-war"]).toEqual([]);
		expect(char.possessions.isChoiceCarried("weapons-of-war", "sword")).toBe(false);
	});

	it("setPossessionSubChoices drops carry marks for picks it replaces away", async () => {
		const char = makeChar({
			picked: ["sword", "battleaxe"],
			carried: { "weapons-of-war:sword": true, "weapons-of-war:battleaxe": true },
		});
		// Re-running onboarding with a different loadout.
		await char.setPossessionSubChoices("weapons-of-war", ["sword", "crossbow"]);
		expect(char.possessions.isChoiceCarried("weapons-of-war", "sword")).toBe(true);
		expect(char.possessions.isChoiceCarried("weapons-of-war", "battleaxe")).toBe(false);
		expect(char.possessions.isChoiceCarried("weapons-of-war", "crossbow")).toBe(false);
	});
});
