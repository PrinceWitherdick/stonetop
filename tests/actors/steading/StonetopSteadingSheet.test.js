import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStonetopSteadingSheetClass } from "../../../module/actors/steading/StonetopSteadingSheet.js";

function makeSheet({ players = [] } = {}) {
	const typedActor = {
		_flags: { players },
		setFlags: vi.fn(async updates => {
			typedActor._flags = { ...typedActor._flags, ...updates };
		}),
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
});
