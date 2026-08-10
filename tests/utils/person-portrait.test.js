import { describe, expect, it } from "vitest";
import { PERSON_DEFAULT_IMG, PERSON_ROSTER_IMG, isPersonPlaceholderImg } from "../../module/utils/person-portrait.js";
import { isDefaultImg } from "../../module/utils/strings.js";

describe("the people placeholder portraits", () => {
	it("points at the two shipped faces under the active system id", () => {
		expect(PERSON_DEFAULT_IMG).toBe("systems/stonetop_pwd/assets/icons/people/default_profile.svg");
		expect(PERSON_ROSTER_IMG).toBe("systems/stonetop_pwd/assets/icons/people/empty_profile.svg");
	});

	// The actor wears one and the roster draws the other, so a person carrying either has
	// still chosen nothing.
	it("recognises both, with or without a leading slash", () => {
		for (const img of [PERSON_DEFAULT_IMG, PERSON_ROSTER_IMG]) {
			expect(isPersonPlaceholderImg(img)).toBe(true);
			expect(isPersonPlaceholderImg(`/${img}`)).toBe(true);
		}
	});

	it("recognises the same files under an id this package shipped under before", () => {
		expect(isPersonPlaceholderImg("systems/stonetop/assets/icons/people/default_profile.svg")).toBe(true);
		expect(isPersonPlaceholderImg("systems/stonetop/assets/icons/people/empty_profile.svg")).toBe(true);
	});

	it.each(["", null, undefined, "icons/svg/mystery-man.svg", "worlds/mine/art/aderyn.webp"])(
		"is not confused by %p", img => expect(isPersonPlaceholderImg(img)).toBe(false));
});

describe("isDefaultImg", () => {
	// The placeholder is stored on art-less NPCs now, so every "has this person a
	// portrait?" test has to keep reading it as no art at all.
	it("counts both people placeholders as no art, like Foundry's own defaults", () => {
		expect(isDefaultImg(PERSON_DEFAULT_IMG)).toBe(true);
		expect(isDefaultImg(PERSON_ROSTER_IMG)).toBe(true);
		expect(isDefaultImg("systems/stonetop/assets/icons/people/default_profile.svg")).toBe(true);
	});

	it("still counts Foundry's defaults and a missing image as no art", () => {
		expect(isDefaultImg("")).toBe(true);
		expect(isDefaultImg("icons/svg/mystery-man.svg")).toBe(true);
		expect(isDefaultImg("icons/svg/item-bag.svg")).toBe(true);
	});

	it("leaves a chosen portrait alone", () => {
		expect(isDefaultImg("worlds/mine/art/aderyn.webp")).toBe(false);
	});
});
