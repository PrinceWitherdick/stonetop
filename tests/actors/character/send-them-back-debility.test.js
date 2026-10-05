// Send Them Back (the Ring of Daagon's servants, roll +CHA) is a +CHA roll like any other, so a
// marked Miserable puts it at disadvantage (Book I p.241: "disadvantage when rolling +CON or +CHA").
// Wounds audit #4: the sheet rolled it straight through rollStat, around the one seam every debility
// reaches a roll by (StonetopCharacter#applyDebilityRollMode), so it went out clean.

import { describe, it, expect, vi } from "vitest";
import { buildLiveCharacter } from "../../fakes/LiveCharacter.js";
import { createStonetopCharacterSheetClass } from "../../../module/actors/character/StonetopCharacterSheet.js";

// Only the dice are stood in for: the test reads what the roll was handed.
const rollStat = vi.hoisted(() => vi.fn(async () => ({ total: 10 })));
vi.mock("../../../module/utils/roll-engine.js", async importOriginal => ({ ...(await importOriginal()), rollStat }));

function sheetFor(char, actor) {
	actor.typedActor = char;
	const Base = class {
		constructor() { this._actor = actor; }
		get actor() { return this._actor; }
		get isEditable() { return true; }
		async getData() { return {}; }
		activateListeners() {}
		render = vi.fn();
	};
	const sheet = new (createStonetopCharacterSheetClass(Base))();
	sheet._confirmServantDeparture = vi.fn();
	sheet._onServantsResist = vi.fn();
	return sheet;
}

describe("Send Them Back and the debilities", () => {
	it("rolls at disadvantage, and says why, while Miserable", async () => {
		rollStat.mockClear();
		const { char, actor } = buildLiveCharacter({ slug: "the-seeker", name: "The Seeker" });
		actor.system.attributes.debilities.options.miserable.value = true;
		await sheetFor(char, actor)._onSendServantsBack("deep-ones", "the servants of Daagon");

		const [stat, , options] = rollStat.mock.calls[0];
		expect(stat).toBe("cha");
		expect(options.rollMode).toBe("dis");
		expect(options.stonetopDebility).toBe("Miserable");
		expect(options.moveName).toBe("Send Them Back");
	});

	it("rolls clean when nothing touching +CHA is marked", async () => {
		rollStat.mockClear();
		const { char, actor } = buildLiveCharacter({ slug: "the-seeker", name: "The Seeker" });
		actor.system.attributes.debilities.options.weakened.value = true;
		await sheetFor(char, actor)._onSendServantsBack("deep-ones", "the servants of Daagon");

		const options = rollStat.mock.calls[0][2];
		expect(options.rollMode ?? "normal").not.toBe("dis");
		expect(options.stonetopDebility).toBeUndefined();
	});
});
