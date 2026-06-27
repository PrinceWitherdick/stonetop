import { describe, expect, it, vi } from "vitest";
import { LevelUpDialog } from "../../../../module/actors/character/dialogs/LevelUpDialog.js";

function makeDialog({ character = {}, data = {} } = {}) {
	const char = {
		applyLevelUp: vi.fn(),
		getForeignMovesForLevelUp: vi.fn().mockResolvedValue([]),
		...character,
	};
	const levelUpData = {
		newLevel: 3, cost: 8, xpRemaining: 2, playbookName: "The Fox", needsInvocation: false,
		availableMoves: [], lockedMoves: [], availableInvocations: [], stats: [],
		...data,
	};
	const dlg = new LevelUpDialog(char, levelUpData, vi.fn());
	dlg.close = vi.fn();
	dlg.render = vi.fn();
	return { dlg, char };
}

const crossMove = { compendiumId: "v1", name: "Versatile",      cap: null, crossPlaybook: { playbooks: "any" } };
const statMove  = { compendiumId: "s1", name: "Improved Stat",  cap: 2,    crossPlaybook: null };
const plainMove = { compendiumId: "p1", name: "Harden",         cap: null, crossPlaybook: null };

describe("LevelUpDialog cross-playbook step machine", () => {
	it("_needsForeignMoveChoice reflects the selected move's crossPlaybook (and is disjoint from the stat step)", () => {
		const { dlg } = makeDialog({ data: { availableMoves: [crossMove, statMove, plainMove] } });
		dlg._selectedMoveId = "v1";
		expect(dlg._needsForeignMoveChoice()).toBe(true);
		expect(dlg._needsStatChoice()).toBe(false);
		dlg._selectedMoveId = "s1";
		expect(dlg._needsForeignMoveChoice()).toBe(false);
		expect(dlg._needsStatChoice()).toBe(true);
		dlg._selectedMoveId = "p1";
		expect(dlg._needsForeignMoveChoice()).toBe(false);
		expect(dlg._needsStatChoice()).toBe(false);
	});

	it("_loadForeignMoves fetches once and caches by move id (no re-fetch on a Back→Next round-trip)", async () => {
		const fetch = vi.fn().mockResolvedValue([{ compendiumId: "f1", name: "Smash", playbook: "The Heavy" }]);
		const { dlg } = makeDialog({ data: { availableMoves: [crossMove] }, character: { getForeignMovesForLevelUp: fetch } });
		dlg._selectedMoveId = "v1";
		await dlg._loadForeignMoves();
		dlg._selectedForeignMoveId = "f1";
		await dlg._loadForeignMoves();                 // same move → cached
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(dlg._selectedForeignMoveId).toBe("f1"); // pick preserved
	});

	it("foreignMove step: canContinue needs a pick unless the list is empty; isLastStep when no invocation follows", () => {
		const { dlg } = makeDialog({ data: { availableMoves: [crossMove] } });
		dlg._selectedMoveId = "v1";
		dlg._step = "foreignMove";
		dlg._foreignMoves = [{ compendiumId: "f1", name: "Smash", playbook: "The Heavy" }];
		const ctx = dlg.getData();
		expect(ctx.isForeignMove).toBe(true);
		expect(ctx.isLastStep).toBe(true);
		expect(ctx.canContinue).toBe(false);           // a move is offered but none picked yet
		dlg._selectedForeignMoveId = "f1";
		expect(dlg.getData().canContinue).toBe(true);
		dlg._foreignMoves = []; dlg._selectedForeignMoveId = null;
		expect(dlg.getData().canContinue).toBe(true);  // empty list still lets the player finish
	});

	it("a cross-playbook move that grants no invocation makes the move step NON-terminal (foreignMove follows)", () => {
		const { dlg } = makeDialog({ data: { availableMoves: [crossMove] } });
		dlg._selectedMoveId = "v1";
		dlg._step = "move";
		expect(dlg.getData().isLastStep).toBe(false);
	});

	it("_apply threads cross-playbook choices (foreign move + grantsPossession) to applyLevelUp", async () => {
		const initiate = { compendiumId: "i1", name: "Initiate of the Secret Arts", cap: null, crossPlaybook: { playbooks: ["The Blessed"], grantsPossession: "sacred-pouch" } };
		const { dlg, char } = makeDialog({ data: { availableMoves: [initiate] } });
		dlg._selectedMoveId = "i1";
		dlg._selectedForeignMoveId = "bm1";
		await dlg._apply();
		expect(char.applyLevelUp).toHaveBeenCalledWith("i1", null, { crossPlaybook: true, foreignMoveId: "bm1", grantsPossession: "sacred-pouch" });
		expect(dlg.close).toHaveBeenCalled();
	});

	it("_apply still passes the stat choice for a stat move (no cross-playbook collision)", async () => {
		const { dlg, char } = makeDialog({ data: { availableMoves: [statMove] } });
		dlg._selectedMoveId = "s1";
		dlg._selectedStat = "str";
		await dlg._apply();
		expect(char.applyLevelUp).toHaveBeenCalledWith("s1", null, { stat: "str", cap: 2 });
	});
});
