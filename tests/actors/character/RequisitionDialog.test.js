import { describe, expect, it, vi } from "vitest";
import { RequisitionDialog } from "../../../module/actors/character/dialogs/RequisitionDialog.js";

function makeDialog(assets) {
	const steadingActor = {
		name: "Stonetop",
		system: {},
		flags: { stonetop_pwd: { steading: { assets } } },
		getFlag: (scope, key) => steadingActor.flags[scope]?.[key],
		setFlag: vi.fn(),
	};
	return new RequisitionDialog(
		{ addCustomInventoryItem: vi.fn() },
		{ id: "hero1", name: "Wren", getFlag: vi.fn(), update: vi.fn() },
		steadingActor,
		vi.fn()
	);
}

function makeRoot(elements) {
	return {
		querySelector: selector => elements[selector] ?? null,
	};
}

describe("RequisitionDialog", () => {
	it("resolves an on-hand steading asset selected from the dropdown", () => {
		const dialog = makeDialog([
			{ name: "Horses", checked: true },
			{ name: "Wagon", checked: true },
		]);
		const root = makeRoot({
			".stonetop-requisition-asset-select": { value: "1" },
		});

		expect(dialog._getChosenAsset(root)).toEqual({ index: 1, name: "Wagon" });
	});

	it("resolves a trimmed custom requisition entry", () => {
		const dialog = makeDialog([{ name: "Horses", checked: true }]);
		const root = makeRoot({
			".stonetop-requisition-asset-select": { value: "__custom__" },
			".stonetop-requisition-custom-input": { value: "  iron spikes  " },
		});

		expect(dialog._getChosenAsset(root)).toEqual({ name: "iron spikes" });
	});
});
