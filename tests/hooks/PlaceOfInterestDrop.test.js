import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	PLACE_OF_INTEREST_DRAG_TYPE,
	onDropPlaceOfInterest,
	switchToJournalNotesControls,
} from "../../module/hooks/PlaceOfInterestDrop.js";

describe("PlaceOfInterestDrop", () => {
	beforeEach(() => {
		globalThis.CONST = { TEXT_ANCHOR_POINTS: { BOTTOM: 1 } };
		globalThis.game = { user: { can: vi.fn(() => true) } };
		globalThis.ui = {
			controls: { activate: vi.fn(async () => {}) },
			notifications: {
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			},
		};
	});

	it("switches to journal Notes controls using the current Foundry API", async () => {
		const controls = { activate: vi.fn(async () => {}) };

		await switchToJournalNotesControls(controls);

		expect(controls.activate).toHaveBeenCalledWith({ control: "notes", tool: "select" });
	});

	it("falls back to the older controls initializer shape", async () => {
		const controls = { initialize: vi.fn(async () => {}) };

		await switchToJournalNotesControls(controls);

		expect(controls.initialize).toHaveBeenCalledWith({ layer: "notes", control: "notes", tool: "select" });
	});

	it("creates the place note, then switches the dropping user to Notes mode", async () => {
		const scene = {
			name: "Village",
			createEmbeddedDocuments: vi.fn(async () => {}),
		};

		const result = onDropPlaceOfInterest({ scene }, {
			type: PLACE_OF_INTEREST_DRAG_TYPE,
			x: 120,
			y: 240,
			letter: "C",
			name: "The Cistern",
		});
		await Promise.resolve();
		await Promise.resolve();

		expect(result).toBe(false);
		expect(scene.createEmbeddedDocuments).toHaveBeenCalledWith("Note", [expect.objectContaining({
			x: 120,
			y: 240,
			text: "The Cistern",
			texture: expect.objectContaining({
				src: "systems/stonetop_pwd/assets/icons/landmarks/landmark-c.svg",
			}),
		})]);
		expect(globalThis.ui.controls.activate).toHaveBeenCalledWith({ control: "notes", tool: "select" });
		expect(globalThis.ui.notifications.info).toHaveBeenCalledWith('Placed "The Cistern" on Village.');
	});

	it("does not claim unrelated canvas drops", () => {
		const scene = { createEmbeddedDocuments: vi.fn() };

		const result = onDropPlaceOfInterest({ scene }, { type: "Actor" });

		expect(result).toBeUndefined();
		expect(scene.createEmbeddedDocuments).not.toHaveBeenCalled();
		expect(globalThis.ui.controls.activate).not.toHaveBeenCalled();
	});
});
