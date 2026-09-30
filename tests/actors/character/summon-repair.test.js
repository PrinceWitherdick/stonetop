import { describe, it, expect, vi, beforeEach } from "vitest";

const repair = vi.fn();
vi.mock("../../../module/actors/character/dialogs/ArcanaSummonDialog.js", () => ({
	ArcanaSummonDialog: { repair: (...args) => repair(...args) },
}));

const { offerSummonRepairs, _resetSummonRepairAsks } = await import("../../../module/actors/character/summon-repair.js");
const { STONETOP_SCOPE } = await import("../../../module/actors/character/StonetopFlags.js");
const { arcanaSummon } = await import("../../../module/data/arcana-summons.js");
const { buildCustomFollower } = await import("../../../module/data/follower-build.js");

const TULPA = arcanaSummon("beautiful-scroll").followers[0];
const OLD_MOVES = "Manifest a form of dust/snow/vapor\nProduce light (area, reach)\nCarry/manipulate a ◇ item\nDeliver a message\nSpy on someone/something";

// A character holding one tulpa made the old way, owned by the player "p1".
function makeActor({ follower = {}, ownsCard = false, boxes = {}, ownership = { p1: 3 } } = {}) {
	const store = { customFollowers: { t1: { ...buildCustomFollower({ ...TULPA, moves: OLD_MOVES }), ...follower } } };
	const actor = {
		id: "a1", type: "character", isOwner: true,
		ownership,
		getFlag: (scope, path) => path.split(".").reduce((o, k) => o?.[k], store),
		update: vi.fn(async (data) => {
			for (const [path, value] of Object.entries(data)) {
				const keys = path.replace(`flags.${STONETOP_SCOPE}.`, "").split(".");
				const last = keys.pop();
				keys.reduce((o, k) => (o[k] ??= {}), store)[last] = value;
			}
		}),
		typedActor: {
			ownedArcanaSlugs: new Set(ownsCard ? ["beautiful-scroll"] : []),
			arcanaBoxStates: boxes,
			getArcanum: async () => ({ back: { description: "<p>□ <em>eager</em> □ <em>fierce</em></p>" } }),
			setArcanumBoxesChecked: vi.fn(async () => {}),
		},
	};
	return { actor, store };
}
const player = { id: "p1", isGM: false, character: null };
const other  = { id: "p2", isGM: false, character: null };
const gm     = { id: "gm", isGM: true };
const users  = [player, other, gm];

describe("offerSummonRepairs", () => {
	beforeEach(() => { repair.mockReset(); _resetSummonRepairAsks(); });

	it("asks the owning player to put an old tulpa right, and writes the picks", async () => {
		repair.mockResolvedValue({ action: "save", picks: { tags: ["eager", "sly"], moves: ["Deliver a message", "Spy on someone/something"], instinct: ["to play"], cost: ["new experiences"] } });
		const { actor, store } = makeActor();
		await offerSummonRepairs(actor, { user: player, users });
		expect(repair).toHaveBeenCalledTimes(1);
		const [, , { name, issues }] = repair.mock.calls[0];
		expect(name).toBe("Tulpa");
		expect(issues.find(i => i.field === "moves")).toMatchObject({ kind: "over", have: 4, pick: 2 });
		const t = store.customFollowers.t1;
		expect(t.picksSettled).toBe(true);
		expect(t.moves).toBe("Manifest a form of dust/snow/vapor\nDeliver a message\nSpy on someone/something");
		expect(t.tags).toEqual(["spirit", "construct", "tiny", "naive", "eager", "sly"]);
		expect(t.instinct).toBe("to play");
		expect(t.cost).toBe("new experiences");
	});

	it("ticks the card when the character holds it", async () => {
		repair.mockResolvedValue({ action: "save", picks: { tags: ["fierce"] } });
		const { actor } = makeActor({ ownsCard: true });
		await offerSummonRepairs(actor, { user: player, users });
		expect(actor.typedActor.setArcanumBoxesChecked).toHaveBeenCalledWith("beautiful-scroll", "back", { 0: false, 1: true });
	});

	it("'Keep it as it is' only stops the asking", async () => {
		repair.mockResolvedValue({ action: "keep" });
		const { actor, store } = makeActor();
		await offerSummonRepairs(actor, { user: player, users });
		expect(store.customFollowers.t1.picksSettled).toBe(true);
		expect(store.customFollowers.t1.moves).toBe(OLD_MOVES);
	});

	it("'Remind me later' writes nothing and waits for the next session", async () => {
		repair.mockResolvedValue(null);
		const { actor } = makeActor();
		await offerSummonRepairs(actor, { user: player, users });
		await offerSummonRepairs(actor, { user: player, users });
		expect(repair).toHaveBeenCalledTimes(1);
		expect(actor.update).not.toHaveBeenCalled();
		_resetSummonRepairAsks();
		await offerSummonRepairs(actor, { user: player, users });
		expect(repair).toHaveBeenCalledTimes(2);
	});

	it("leaves a settled tulpa, another player's character, and a player's character on the GM's screen alone", async () => {
		await offerSummonRepairs(makeActor({ follower: { picksSettled: true } }).actor, { user: player, users });
		await offerSummonRepairs(makeActor().actor, { user: other, users });
		await offerSummonRepairs(makeActor().actor, { user: gm, users });
		expect(repair).not.toHaveBeenCalled();
	});

	it("asks only the assigned player, even at a table where everyone owns everyone", async () => {
		repair.mockResolvedValue(null);
		const { actor } = makeActor({ ownership: { p1: 3, p2: 3 } });
		const assigned = [{ ...player, character: { id: "a1" } }, other, gm];
		await offerSummonRepairs(actor, { user: other, users: assigned });
		expect(repair).not.toHaveBeenCalled();
		await offerSummonRepairs(actor, { user: assigned[0], users: assigned });
		expect(repair).toHaveBeenCalledTimes(1);
	});

	it("asks the GM about a character no player owns by name or assignment", async () => {
		repair.mockResolvedValue(null);
		await offerSummonRepairs(makeActor({ ownership: { default: 3 } }).actor, { user: gm, users });
		expect(repair).toHaveBeenCalledTimes(1);
	});

	it("settles the card before reading its ticks, so old marks are read where the new text prints them", async () => {
		repair.mockResolvedValue(null);
		const { actor } = makeActor({ ownsCard: true });
		actor.typedActor.settleArcanumBoxLayouts = vi.fn(async () => false);
		await offerSummonRepairs(actor, { user: player, users });
		expect(actor.typedActor.settleArcanumBoxLayouts).toHaveBeenCalledWith({ slug: "beautiful-scroll" });
	});

	it("skips a tulpa a co-owner settled while the window was open", async () => {
		const { actor, store } = makeActor();
		repair.mockImplementation(async () => {
			store.customFollowers.t1.picksSettled = true;
			return { action: "save", picks: { tags: ["eager", "sly"] } };
		});
		await offerSummonRepairs(actor, { user: player, users });
		expect(actor.update).not.toHaveBeenCalled();
	});

	it("keeps asking a tulpa saved part-way, next session", async () => {
		repair.mockResolvedValue({ action: "save", picks: { tags: ["eager", "sly"] } });
		const { actor, store } = makeActor();
		await offerSummonRepairs(actor, { user: player, users });
		expect(store.customFollowers.t1.picksSettled).toBe(false);
		expect(store.customFollowers.t1.moves).toBe(OLD_MOVES);
		_resetSummonRepairAsks();
		await offerSummonRepairs(actor, { user: player, users });
		expect(repair).toHaveBeenCalledTimes(2);
	});
});
