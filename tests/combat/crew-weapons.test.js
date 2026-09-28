import { describe, it, expect, afterEach, vi } from "vitest";
import { crewWeaponChoices } from "../../module/combat/crew-weapons.js";
import { crewBlow } from "../../module/combat/attack-flow.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// The Crew insert kits the crew with an iron hatchet (hand, thrown, x piercing), an iron spear (close,
// thrown, x piercing) and a bow with iron arrows (near, x piercing). A crew blow asks which one it is
// dealt with, so the weapon's piercing reaches Apply; the card's own die was all it used to carry.

const INVENTORY = [
	{ slug: "hatchet", weight: 1 },
	{ slug: "spear", weight: 1 },
	{ slug: "bow-arrows", weight: 1 },
	{ slug: "shield", weight: 2 },
	{ slug: "cloak", weight: 1 },
];

describe("crewWeaponChoices", () => {
	it("lists the weapons the crew's card has ticked, and nothing that is not a weapon", () => {
		const crew = { gear: { hatchet: 1, spear: 0, "bow-arrows": true, shield: 2, cloak: 1 } };
		expect(crewWeaponChoices(crew, INVENTORY).map(c => c.slug)).toEqual(["hatchet", "bow-arrows"]);
		expect(crewWeaponChoices(crew, INVENTORY)[0].meta).toMatchObject({ name: "Hatchet", piercing: "prosperity" });
	});

	it("offers melee for Clash and thrown or ranged for Let Fly", () => {
		const crew = { gear: { hatchet: 1, spear: 1, "bow-arrows": 1 } };
		expect(crewWeaponChoices(crew, INVENTORY, { move: "clash" }).map(c => c.slug)).toEqual(["hatchet", "spear"]);
		expect(crewWeaponChoices(crew, INVENTORY, { move: "let-fly" }).map(c => c.slug)).toEqual(["hatchet", "spear", "bow-arrows"]);
	});

	it("reads the pip map on its own without the playbook's rows", () => {
		expect(crewWeaponChoices({ gear: { spear: 1, cloak: 1 } }, null).map(c => c.slug)).toEqual(["spear"]);
		expect(crewWeaponChoices({}, INVENTORY)).toEqual([]);
		expect(crewWeaponChoices(null, INVENTORY)).toEqual([]);
	});
});

describe("crewBlow", () => {
	// The Crew insert comes through crewSource: the Marshal's own, or the one a learned Crew borrows.
	const marshal = gear => ({ flags: { [SYSTEM_ID]: { crew: { gear } } }, typedActor: { crewSource: async () => ({ inventory: INVENTORY }) } });
	afterEach(() => { delete globalThis.Dialog; });

	it("deals the blow with the one weapon ticked, its x piercing riding along, and asks nothing", async () => {
		globalThis.Dialog = vi.fn();
		const blow = await crewBlow(marshal({ spear: 1 }), { label: "Rhianna's crew attacks", weapon: { name: "", range: [], piercing: 0, ignoresArmor: false, tags: [] }, keywords: "" });
		expect(globalThis.Dialog).not.toHaveBeenCalled();
		expect(blow.label).toBe("Rhianna's crew attacks: Spear");
		expect(blow.weapon).toMatchObject({ slug: "spear", name: "Spear", piercing: "prosperity", range: ["close", "thrown"], ignoresArmor: false });
		expect(blow.keywords).toBe("");
	});

	it("leaves the card's bare die as it was with no weapon ticked", async () => {
		const blow = await crewBlow(marshal({ cloak: 1 }), { label: "Rhianna's crew attacks", weapon: null, keywords: "" });
		expect(blow).toEqual({ label: "Rhianna's crew attacks", weapon: null, keywords: "" });
	});

	it("asks which with several, and backs out on Cancel", async () => {
		const shown = [];
		globalThis.Dialog = class { constructor(spec) { shown.push(spec); } render() { return this; } };
		const asked = crewBlow(marshal({ hatchet: 1, "bow-arrows": 1 }), { label: "Swarm", weapon: null });
		await vi.waitFor(() => expect(shown).toHaveLength(1));
		expect(shown[0].title).toBe("Swarm: which weapon?");
		expect(shown[0].content).toContain("Hatchet");
		expect(shown[0].content).toContain("Bow &amp; arrows");
		// The bow, as the radio the player ticked.
		shown[0].buttons.choose.callback({ querySelector: () => ({ value: "bow-arrows" }) });
		expect((await asked).weapon).toMatchObject({ slug: "bow-arrows", range: ["near"], piercing: "prosperity" });

		const cancelled = crewBlow(marshal({ hatchet: 1, "bow-arrows": 1 }), { label: "Swarm", weapon: null });
		await vi.waitFor(() => expect(shown).toHaveLength(2));
		shown[1].buttons.cancel.callback();
		expect(await cancelled).toBeNull();
	});
});
