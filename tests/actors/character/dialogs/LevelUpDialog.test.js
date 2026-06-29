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

// A budgeted count-mark move (Veteran Crew shape): base 1 pick per take, repeat-scaling.
const veteranCrew = {
	compendiumId: "vc1", name: "Veteran Crew", cap: null, crossPlaybook: null,
	markOptions: [
		{ slug: "tags",    label: "Select 2 new tags", marks: 4 },
		{ slug: "crew-hp", label: "+2 HP each",        marks: 4 },
	],
	markBudget: { base: 1, perExtra: 1 }, ownedIds: [],
};

describe("LevelUpDialog mark step — budgeted moves (Veteran Crew / Well Versed / …)", () => {
	it("a budgeted move needs the mark step (disjoint from stat/foreign) with the budget's allowance", () => {
		const { dlg } = makeDialog({ data: { availableMoves: [veteranCrew], marks: {} } });
		dlg._selectedMoveId = "vc1";
		expect(dlg._needsMarkChoice()).toBe(true);
		expect(dlg._needsStatChoice()).toBe(false);
		expect(dlg._needsForeignMoveChoice()).toBe(false);
		expect(dlg._markStepDescriptor()).toMatchObject({ moveName: "Veteran Crew", allowance: 1 });
	});

	it("the allowance scales with the move's owned count (a 2nd copy of Well Versed grants more)", () => {
		const wellVersed = { ...veteranCrew, name: "Well Versed", markBudget: { base: 1, perExtra: 2 }, ownedIds: ["o1"] };
		const { dlg } = makeDialog({ data: { availableMoves: [{ ...wellVersed, compendiumId: "wv1" }], marks: {} } });
		dlg._selectedMoveId = "wv1";
		// 1 already owned ⇒ this take is the 2nd copy ⇒ budget 1 + 2·(2−1) = 3.
		expect(dlg._markStepDescriptor().allowance).toBe(3);
	});

	it("the move step is non-terminal and Continue is gated until the take's pick is made", () => {
		const { dlg } = makeDialog({ data: { availableMoves: [veteranCrew], marks: {} } });
		dlg._selectedMoveId = "vc1";
		dlg._step = "move";
		expect(dlg.getData().isLastStep).toBe(false);
		dlg._step = "marks";
		expect(dlg.getData().canContinue).toBe(false);
		dlg._selectedMarks = [{ slug: "tags" }];
		const ctx = dlg.getData();
		expect(ctx.canContinue).toBe(true);
		expect(ctx.isLastStep).toBe(true); // no invocation follows
		expect(ctx.markStep.used).toBe(1);
	});

	it("_apply threads the mark picks to applyLevelUp", async () => {
		const { dlg, char } = makeDialog({ data: { availableMoves: [veteranCrew], marks: {} } });
		dlg._selectedMoveId = "vc1";
		dlg._selectedMarks = [{ slug: "tags" }];
		await dlg._apply();
		expect(char.applyLevelUp).toHaveBeenCalledWith("vc1", null, { marks: { moveName: "Veteran Crew", picks: [{ slug: "tags" }] } });
	});

	it("clamps the take's required picks to the selectable options so the step can't dead-end", () => {
		// Beast-of-Legend shape: 2 options, 3rd take grants budget 3 — but one pick per
		// option means only 2 are placeable, so the required count clamps to 2 (no hard lock).
		const beast = {
			compendiumId: "bol1", name: "Beast of Legend", cap: null, crossPlaybook: null,
			markOptions: [
				{ slug: "tough",  label: "+4 HP, +1 armor", marks: 3 },
				{ slug: "unique", label: "unique trait",    marks: 3 },
			],
			markBudget: { base: 1, perExtra: 1 }, ownedIds: ["a", "b"], // 2 owned ⇒ 3rd take ⇒ budget 3
		};
		const { dlg } = makeDialog({ data: { availableMoves: [beast], marks: {} } });
		dlg._selectedMoveId = "bol1";
		dlg._step = "marks";
		expect(dlg.getData().markStep.allowance).toBe(2); // clamped from budget 3 → 2 selectable
		dlg._selectedMarks = [{ slug: "tough" }, { slug: "unique" }];
		expect(dlg.getData().canContinue).toBe(true);
	});
});

describe("LevelUpDialog mark step — no step when not applicable", () => {
	it("no mark step for a plain (non-budgeted) move", () => {
		const { dlg } = makeDialog({ data: { availableMoves: [plainMove] } });
		dlg._selectedMoveId = "p1";
		dlg._step = "move";
		expect(dlg._needsMarkChoice()).toBe(false);
		expect(dlg.getData().isLastStep).toBe(true); // nothing follows → move is terminal
	});
});
