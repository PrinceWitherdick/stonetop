import { describe, expect, it } from "vitest";
import { StonetopSteading } from "../../../module/actors/steading/StonetopSteading.js";
import { StonetopCharacter } from "../../../module/actors/character/StonetopCharacter.js";

// Weapons of War on the character side, and the Fortification a revert puts back, both ask the
// steading's ONE rules path (improvement-rules.js) rather than deciding for themselves: a homebrew
// improvement's Fortification is recognised, and a hand-written entry compares case-blind.

const steadingActor = (steading = {}) => ({
	type: "stonetop",
	flags: { "stonetop-pwd": { steading } },
	getFlag: () => undefined,
});

const earned = steading => StonetopCharacter.prototype.weaponsOfWarEarned.call({}, steadingActor(steading));

const homebrewArmory = {
	slug: "custom-armory", label: "Armory", sections: [],
	grants: { fortifications: ["Weapons of War"] },
};

describe("weaponsOfWarEarned", () => {
	it("is earned by the improvement built", () => {
		expect(earned({ improvements: { weaponsOfWar: { completed: true } } })).toBe(true);
		expect(earned({ improvements: { weaponsOfWar: { completed: false } } })).toBe(false);
	});

	it("is earned by a ticked Fortifications entry, whatever its case, and not by an unticked one", () => {
		expect(earned({ fortifications: [{ name: "weapons of war", checked: true }] })).toBe(true);
		expect(earned({ fortifications: [{ name: "Weapons of War", checked: false }] })).toBe(false);
	});

	it("is earned by a built homebrew improvement that adds the Fortification", () => {
		const steading = {
			customImprovements: [homebrewArmory],
			improvements: { "custom-armory": { completed: true } },
			fortifications: [{ name: "Weapons of War", checked: true }],
		};
		expect(earned(steading)).toBe(true);
	});
});

describe("_fortificationOwners", () => {
	it("names the book's improvement for its own Fortification", () => {
		expect(new StonetopSteading(steadingActor())._fortificationOwners("stone wall").map(o => o.slug)).toEqual(["stoneWall"]);
	});

	it("names a homebrew improvement for the Fortification it adds", () => {
		const owners = new StonetopSteading(steadingActor({ customImprovements: [{ ...homebrewArmory, grants: { fortifications: ["Iron Gate"] } }] }))
			._fortificationOwners("Iron Gate");
		expect(owners).toEqual([{ slug: "custom-armory", label: "Armory" }]);
	});

	it("names the book's and a homebrew improvement that add the same Fortification, the book's first", () => {
		const owners = new StonetopSteading(steadingActor({ customImprovements: [{ ...homebrewArmory, grants: { fortifications: ["Palisade"] } }] }))
			._fortificationOwners("Palisade");
		expect(owners.map(o => o.slug)).toEqual(["palisade", "custom-armory"]);
	});

	it("is empty for a name nothing adds", () => {
		expect(new StonetopSteading(steadingActor())._fortificationOwners("A rope bridge")).toEqual([]);
	});
});
