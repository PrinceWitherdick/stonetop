import { describe, it, expect, vi } from "vitest";
import { contextMenuEntry, displaceTokens } from "../../module/utils/foundry-compat.js";

// The two shims the Fight tab leans on across Foundry 13 and 14.

describe("contextMenuEntry", () => {
	it("speaks both cores' spellings of one entry", () => {
		const run = vi.fn();
		const visible = vi.fn(() => true);
		const entry = contextMenuEntry({ label: "stonetop.fight.menu.remove", icon: "fa-solid fa-trash", visible, run });
		expect(entry).toMatchObject({ label: "stonetop.fight.menu.remove", name: "stonetop.fight.menu.remove", icon: '<i class="fa-solid fa-trash"></i>' });
		const target = { dataset: { combatantId: "c1" } };
		expect(entry.visible(target)).toBe(true);
		expect(entry.condition(target)).toBe(true);
		entry.onClick({ type: "click" }, target);
		entry.callback(target);
		expect(run.mock.calls).toEqual([[target], [target]]);
	});

	it("is shown by default, and hidden when its test says so", () => {
		expect(contextMenuEntry({ label: "x", icon: "y", run: () => {} }).visible({})).toBe(true);
		expect(contextMenuEntry({ label: "x", icon: "y", visible: () => 0, run: () => {} }).condition({})).toBe(false);
	});
});

describe("displaceTokens", () => {
	const moves = [{ id: "a", x: 100, y: 200 }, { id: "b", x: 300, y: 400 }];
	const instruction = (x, y) => ({
		waypoints: [{ x, y, action: "displace", snapped: true }],
		method: "api", autoRotate: false, showRuler: false,
		constrainOptions: { ignoreWalls: true, ignoreCost: true },
	});

	it("batches the move through Scene#moveTokens where core has it (v14)", async () => {
		const scene = { moveTokens: vi.fn(async () => ({})), updateEmbeddedDocuments: vi.fn() };
		await displaceTokens(scene, moves);
		expect(scene.moveTokens).toHaveBeenCalledTimes(1);
		expect(scene.moveTokens).toHaveBeenCalledWith({ a: instruction(100, 200), b: instruction(300, 400) });
		expect(scene.updateEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("sends the same movement through one token update where it does not (v13)", async () => {
		const scene = { updateEmbeddedDocuments: vi.fn(async () => []) };
		await displaceTokens(scene, moves);
		expect(scene.updateEmbeddedDocuments).toHaveBeenCalledTimes(1);
		expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith("Token", [{ _id: "a" }, { _id: "b" }], {
			movement: { a: instruction(100, 200), b: instruction(300, 400) },
		});
	});

	it("never uses the deprecated teleport option", async () => {
		const scene = { updateEmbeddedDocuments: vi.fn(async () => []) };
		await displaceTokens(scene, moves);
		expect(JSON.stringify(scene.updateEmbeddedDocuments.mock.calls)).not.toContain("teleport");
	});

	it("writes nothing with nothing to move", async () => {
		const scene = { moveTokens: vi.fn(), updateEmbeddedDocuments: vi.fn() };
		expect(await displaceTokens(scene, [])).toBeNull();
		expect(await displaceTokens(null, moves)).toBeNull();
		expect(scene.moveTokens).not.toHaveBeenCalled();
	});
});
