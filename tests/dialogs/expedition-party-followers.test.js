import { describe, it, expect, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

// The Outfit step's load rows for a PC's followers follow the "in the party" toggle every follower
// card carries (follower-party.js, the user's ruling of 2026-10-02). The crew used to be listed
// whether or not it was going; now it goes unless ticked out, the animal companion likewise, and an
// initiate or a beast goes once ticked in. A follower's load is its ✓ gear marks (Book I p.472).

vi.mock("../../module/book2-art/travel-map-art.js", () => ({
	browseTravelMapArt: () => Promise.resolve({ has: () => false }),
	travelMapFile:      () => Promise.resolve(null),
	resolveTravelMap:   () => Promise.resolve(null),
}));

vi.mock("../../module/utils/world.js", () => ({
	getStonetopSteadingActor:       () => null,
	getStonetopSteadingActorOrWarn: () => null,
	isSteadingActor: a => a?.type === "stonetop" || a?.system?.customType === "stonetop",
}));

const { ExpeditionDialog } = await import("../../module/dialogs/ExpeditionDialog.js");

function dialog() {
	const d = Object.create(ExpeditionDialog.prototype);
	d._rolls = {};
	d.render = vi.fn();
	return d;
}

function pc(flags = {}) {
	const store = { [SYSTEM_ID]: flags };
	return { id: "rhianna", flags: store, getFlag: (scope, key) => foundry.utils.getProperty(store[scope] ?? {}, key) };
}

const CREW = { name: "The Wolves", tags: ["brave"], gear: { spears: 2 } };
const gear = (...checked) => checked.map((c, index) => ({ index, label: `item ${index}`, checked: c }));

describe("a PC's followers on the expedition", () => {
	it("lists the crew while it is in the party, and drops it once ticked out", () => {
		expect(dialog()._partyFollowersOf(pc({ crew: { ...CREW } })).map(r => r.name)).toEqual(["The Wolves"]);
		expect(dialog()._partyFollowersOf(pc({ crew: { ...CREW, party: false } }))).toEqual([]);
	});

	it("adds the companion, an initiate and a beast off their follower records when they travel", () => {
		const cards = [
			{ ftype: "animal-companion", slug: "", name: "Wolf", party: true, details: { gear: gear(true, false) } },
			{ ftype: "initiate", slug: "enfys", name: "Enfys", party: true, details: {} },
			{ ftype: "beast", slug: "ox", name: "Ox", party: true, details: { gear: gear(true, true, true) } },
			{ ftype: "beast", slug: "goat", name: "Goat", party: false, details: {} },
		];
		const rows = dialog()._partyFollowersOf(pc({}), cards);
		expect(rows.map(r => [r.name, r.folTag, r.marks])).toEqual([
			["Wolf", "animal companion", 1], ["Enfys", "initiate", 0], ["Ox", "beast", 3],
		]);
	});

	it("reads custom followers through the same toggle, and leaves the dead at home", () => {
		const flags = { customFollowers: {
			hound: { name: "Hound", party: true, order: 1 },
			mule:  { name: "Mule", party: false, order: 2 },
			lost:  { name: "Lost", party: true, dead: true, order: 3 },
		} };
		expect(dialog()._partyFollowersOf(pc(flags), []).map(r => r.name)).toEqual(["Hound"]);
	});
});
