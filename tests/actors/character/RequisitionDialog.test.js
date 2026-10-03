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
		flags: { "stonetop-pwd": { steading: { assets } } },
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

const logistics = (learned = true) => ({ type: "move", name: "Logistics", flags: learned ? {} : { "stonetop-pwd": { learned: false } } });

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

		expect(dialog._getChosenAsset(root)).toMatchObject({ index: 1, name: "Wagon" });
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

		expect(dialog._getChosenAsset(root)).toMatchObject({ index: 0, name: STEADING_DEFAULTS.assets[0].name });
	});

	it("gives a seeded asset stored without a beast field its default's back, by name", () => {
		// A world seeded before rows carried `beast`: the plows must not read as horses.
		const stored = STEADING_DEFAULTS.assets.filter(a => a.name).map(({ name, checked }) => ({ name, checked }));
		const dialog = makeDialog(stored);
		const pick = value => dialog._getChosenAsset(makeRoot({ ".stonetop-requisition-asset-select": { value } })).asset;
		expect(pick("0").beast).toEqual({ slug: "horse", count: 2, traits: ["hardy"] });
		expect(pick("1").beast).toBeNull();
		const custom = makeDialog([{ name: "Two old ponies", checked: true }]);
		expect(custom._getChosenAsset(makeRoot({ ".stonetop-requisition-asset-select": { value: "0" } })).asset.beast).toBeUndefined();
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

	// The steading playbook's "A pair of hardy draft horses, followers (large, powerful,
	// keen-nosed, hardy)": the requisitioned follower is a hardy horse, with no choice left open.
	// "A pair" is two horses: one card each, numbered, in one write, in tab order.
	it("adds the steading's pair of draft horses as two hardy horse followers", async () => {
		let n = 0;
		const info = vi.fn();
		vi.stubGlobal("foundry", { utils: { randomID: () => `id${++n}` } });
		vi.stubGlobal("ui", { notifications: { info } });
		try {
			const dialog = makeDialog([]);
			const assetName = STEADING_DEFAULTS.assets.find(a => /draft horses/.test(a.name)).name;
			const match = (await import("../../../module/data/beasts.js")).beastFollowerForAsset(assetName);
			await dialog._addRequisitionedFollower(match, assetName);
			expect(dialog._characterActor.update).toHaveBeenCalledTimes(1);
			const written = Object.values(dialog._characterActor.update.mock.calls[0][0]);
			expect(written.map(f => f.name)).toEqual(["Horse 1", "Horse 2"]);
			expect(written[1].order).toBe(written[0].order + 1);
			for (const f of written) {
				expect(f.tags).toContain("hardy");
				// The seeded asset line trails a dashed stat block; the note names the asset only.
				expect(f.notes).toBe("Requisitioned from A pair of hardy draft horses.");
			}
			expect(info).toHaveBeenCalledWith("Horse 1 & Horse 2 added to your followers.");
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("adds a lone animal as one follower under its plain name", async () => {
		vi.stubGlobal("foundry", { utils: { randomID: () => "abc" } });
		vi.stubGlobal("ui", { notifications: { info: vi.fn() } });
		try {
			const dialog = makeDialog([]);
			const match = (await import("../../../module/data/beasts.js")).beastFollowerForAsset("A sturdy mule");
			await dialog._addRequisitionedFollower(match, "A sturdy mule");
			const written = Object.values(dialog._characterActor.update.mock.calls[0][0]);
			expect(written.map(f => f.name)).toEqual(["Mule"]);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
