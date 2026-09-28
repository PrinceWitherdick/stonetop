import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RequisitionDialog } from "../../../module/actors/character/dialogs/RequisitionDialog.js";
import { STEADING_DEFAULTS } from "../../../module/actors/steading/StonetopSteading.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function makeDialog(assets, items = []) {
	const steadingActor = {
		name: "Stonetop",
		system: {},
		flags: { "stonetop_pwd": { steading: { assets } } },
		getFlag: (scope, key) => steadingActor.flags[scope]?.[key],
		setFlag: vi.fn(),
	};
	return new RequisitionDialog(
		{ addCustomInventoryItem: vi.fn() },
		{ id: "hero1", name: "Wren", type: "character", items, getFlag: vi.fn(), update: vi.fn() },
		steadingActor,
		vi.fn()
	);
}

const logistics = (learned = true) => ({ type: "move", name: "Logistics", flags: learned ? {} : { "stonetop_pwd": { learned: false } } });

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

	it("resolves a default on-hand asset on a steading whose assets flag was never written", () => {
		// The dropdown is built from getAvailableAssets() (which falls back to STEADING_DEFAULTS),
		// so selecting a default asset must resolve its name — not "" — even with no assets flag.
		const dialog = makeDialog(undefined);
		const root = makeRoot({
			".stonetop-requisition-asset-select": { value: "0" },
		});

		expect(dialog._getChosenAsset(root)).toEqual({ index: 0, name: STEADING_DEFAULTS.assets[0].name });
	});

	// The Marshal's Logistics: "when you Requisition, you have advantage".
	it("asks the Logistics line for a character who has it learned, and only them", () => {
		expect(makeDialog([], [logistics()]).getData().logistics).toBe("Logistics (Wren): they are the one Requisitioning, advantage");
		expect(makeDialog([], [logistics(false)]).getData().logistics).toBe("");
		expect(makeDialog([], []).getData().logistics).toBe("");
	});

	it("renders the Logistics line pre-ticked, and reads it back as the roll's answer", () => {
		const hbs = fs.readFileSync(path.resolve(HERE, "../../../templates/dialogs/requisition-picker.hbs"), "utf8");
		expect(hbs).toMatch(/name="logistics" checked>/);
		const dialog = makeDialog([]);
		expect(dialog._rollAnswers(makeRoot({ '[name="logistics"]': { checked: true } }))).toEqual({ herdShare: false, logistics: true });
		expect(dialog._rollAnswers(makeRoot({ '[name="logistics"]': { checked: false } }))).toEqual({ herdShare: false, logistics: false });
	});
});
