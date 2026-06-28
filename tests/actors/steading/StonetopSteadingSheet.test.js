import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStonetopSteadingSheetClass } from "../../../module/actors/steading/StonetopSteadingSheet.js";

function makeSheet({ players = [], improvements = {}, improvementDef, addResult, removeResult } = {}) {
	const typedActor = {
		_flags: { players, improvements },
		setFlags: vi.fn(async updates => {
			typedActor._flags = { ...typedActor._flags, ...updates };
		}),
		improvementDef: vi.fn(() => improvementDef ?? null),
		addCustomImprovement: vi.fn(async () => addResult ?? { ok: true, slug: "custom-x", label: "X" }),
		removeCustomImprovement: vi.fn(async () => removeResult ?? true),
	};
	const actor = {
		name: "Stonetop",
		type: "stonetop",
		typedActor,
		getFlag: vi.fn(),
	};
	const Base = class {
		constructor() { this._actor = actor; }
		get actor() { return this._actor; }
		get isEditable() { return true; }
		render() {}
	};
	const Sheet = createStonetopSteadingSheetClass(Base);
	return { sheet: new Sheet(), typedActor };
}

describe("StonetopSteadingSheet", () => {
	beforeEach(() => {
		globalThis.ui = {
			notifications: {
				info: vi.fn(),
				warn: vi.fn(),
			},
		};
	});

	it("adds dropped character actors to the players list", async () => {
		const { sheet, typedActor } = makeSheet();

		await sheet._onDropPlayerCharacter({
			id: "hero-id",
			uuid: "Actor.hero",
			name: "Wren",
			img: "wren.webp",
			type: "character",
		});

		expect(typedActor.setFlags).toHaveBeenCalledWith({
			players: [{
				id: "hero-id",
				uuid: "Actor.hero",
				name: "Wren",
				img: "wren.webp",
				checked: true,
				traits: "",
				relations: "",
				notes: "",
			}],
		});
	});

	it("does not add the same dropped character twice", async () => {
		const { sheet, typedActor } = makeSheet({
			players: [{ id: "hero-id", uuid: "Actor.hero", name: "Wren", img: "wren.webp", checked: true }],
		});

		await sheet._onDropPlayerCharacter({
			id: "hero-id",
			uuid: "Actor.hero",
			name: "Wren",
			img: "wren.webp",
			type: "character",
		});

		expect(typedActor.setFlags).not.toHaveBeenCalled();
		expect(globalThis.ui.notifications.info).toHaveBeenCalledWith("Wren is already in the players list.");
	});

	it("adds a dropped steading-improvement card as a tracked improvement", async () => {
		const { sheet, typedActor } = makeSheet({ addResult: { ok: true, slug: "custom-roadbuilding", label: "ROADBUILDING" } });
		const improvement = { name: "ROADBUILDING", sections: [], effect: "..." };

		await sheet._onDropSteadingImprovement(improvement);

		expect(typedActor.addCustomImprovement).toHaveBeenCalledWith(improvement);
		expect(globalThis.ui.notifications.info).toHaveBeenCalledWith("Added steading improvement: ROADBUILDING.");
	});

	it("warns instead of adding when the improvement is already present", async () => {
		const { sheet, typedActor } = makeSheet({ addResult: { ok: false, reason: "duplicate", label: "ROADBUILDING" } });

		await sheet._onDropSteadingImprovement({ name: "ROADBUILDING" });

		expect(typedActor.addCustomImprovement).toHaveBeenCalled();
		expect(globalThis.ui.notifications.warn).toHaveBeenCalledWith("ROADBUILDING is already a steading improvement.");
	});

	it("ignores a malformed drop payload", async () => {
		const { sheet, typedActor } = makeSheet();
		await sheet._onDropSteadingImprovement(undefined);
		await sheet._onDropSteadingImprovement({ flavor: "no name" });
		expect(typedActor.addCustomImprovement).not.toHaveBeenCalled();
	});

	it("removes a custom improvement by slug", async () => {
		const { sheet, typedActor } = makeSheet();
		await sheet._onRemoveCustomImprovement("custom-roadbuilding");
		expect(typedActor.removeCustomImprovement).toHaveBeenCalledWith("custom-roadbuilding");
	});

	describe("completing an improvement whose requirements aren't all met", () => {
		const lockedDef = {
			slug: "palisade",
			label: "PALISADE",
			sections: [{ heading: "Requires:", items: ["A", "B", "C"] }],
			effect: "...",
		};

		it("offers to mark every requirement complete, then earns it when accepted", async () => {
			const { sheet, typedActor } = makeSheet({ improvementDef: lockedDef });
			globalThis.Dialog = { confirm: vi.fn(async () => true) };
			sheet.render = vi.fn();

			await sheet._onImprovementComplete("palisade", true);

			expect(globalThis.Dialog.confirm).toHaveBeenCalledTimes(1);
			expect(typedActor.setFlags).toHaveBeenCalledWith({
				improvements: { palisade: { completed: true, r: [true, true, true] } },
			});
		});

		it("does nothing but revert the checkbox when declined", async () => {
			const { sheet, typedActor } = makeSheet({ improvementDef: lockedDef });
			globalThis.Dialog = { confirm: vi.fn(async () => false) };
			sheet.render = vi.fn();

			await sheet._onImprovementComplete("palisade", true);

			expect(typedActor.setFlags).not.toHaveBeenCalled();
			expect(sheet.render).toHaveBeenCalledWith(false); // re-render resets the tapped checkbox
		});

		it("marks complete without prompting once the requirements are already met", async () => {
			const { sheet, typedActor } = makeSheet({
				improvementDef: lockedDef,
				improvements: { palisade: { completed: false, r: [true, true, true] } },
			});
			globalThis.Dialog = { confirm: vi.fn(async () => true) };
			sheet.render = vi.fn();

			await sheet._onImprovementComplete("palisade", true);

			expect(globalThis.Dialog.confirm).not.toHaveBeenCalled();
			expect(typedActor.setFlags).toHaveBeenCalledWith({
				improvements: { palisade: { completed: true, r: [true, true, true] } },
			});
		});

		it("always allows un-completing a finished improvement without prompting", async () => {
			const { sheet, typedActor } = makeSheet({
				improvementDef: lockedDef,
				improvements: { palisade: { completed: true, r: [true, true, true] } },
			});
			globalThis.Dialog = { confirm: vi.fn(async () => true) };
			sheet.render = vi.fn();

			await sheet._onImprovementComplete("palisade", false);

			expect(globalThis.Dialog.confirm).not.toHaveBeenCalled();
			expect(typedActor.setFlags).toHaveBeenCalledWith({
				improvements: { palisade: { completed: false, r: [true, true, true] } },
			});
		});
	});
});
