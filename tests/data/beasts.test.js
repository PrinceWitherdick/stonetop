import { describe, it, expect } from "vitest";
import { beastFollowerForAsset, followerInputFromBeast, BEAST_CATALOG } from "../../module/data/beasts.js";

// Requisition → follower bridge: a steading asset naming a follower-capable animal
// (the town's horses, a mule, a dog) can be added to the Followers tab.

describe("beastFollowerForAsset", () => {
	it("matches the town's draft horses to the horse stat block", () => {
		const m = beastFollowerForAsset("A pair of hardy draft horses");
		expect(m?.slug).toBe("horse");
		expect(m?.beast.hp).toBe(10);
	});

	it("matches mules and dogs (and hounds)", () => {
		expect(beastFollowerForAsset("A sturdy mule")?.slug).toBe("mule");
		expect(beastFollowerForAsset("Good hunting dog")?.slug).toBe("dog-follower");
		expect(beastFollowerForAsset("A pack of hounds")?.slug).toBe("dog-follower");
	});

	it("does not match livestock or non-animals (not proper followers)", () => {
		expect(beastFollowerForAsset("A cart of grain")).toBeNull();
		expect(beastFollowerForAsset("Three goats")).toBeNull();
		expect(beastFollowerForAsset("A fine sword")).toBeNull();
		expect(beastFollowerForAsset("")).toBeNull();
	});
});

describe("followerInputFromBeast", () => {
	it("turns a beast catalog entry into buildCustomFollower input", () => {
		const input = followerInputFromBeast(BEAST_CATALOG.horse, { name: "Fflur" });
		expect(input.name).toBe("Fflur");
		expect(input.hp).toBe(10);
		expect(input.damage).toBe("d6+3 (hand, close, forceful)");
		expect(input.instinct).toBe("panic");
		expect(input.cost).toBe("care & grooming");
	});

	it("returns null for a missing beast", () => {
		expect(followerInputFromBeast(null)).toBeNull();
	});
});
