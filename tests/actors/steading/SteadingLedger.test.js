import { describe, it, expect } from "vitest";
import { SteadingLedger } from "../../../module/actors/steading/SteadingLedger.js";

function makeActor(flags = {}) {
	return {
		type: "stonetop",
		flags,
	};
}

describe("SteadingLedger", () => {
	it("records silver and gold denomination changes distinctly", () => {
		const actor = makeActor({
			stonetop: {
				steading: {
					silver: { purses: 1, handfuls: 2, coins: 3 },
					gold: { purses: 0, handfuls: 1, coins: 2 },
				},
			},
		});

		const entries = SteadingLedger.entriesForActorUpdate(actor, {
			flags: {
				stonetop: {
					steading: {
						silver: { purses: 2, handfuls: 2, coins: 4 },
						gold: { purses: 1, handfuls: 1, coins: 3 },
					},
				},
			},
		});

		expect(entries.map(e => e.action)).toEqual([
			"Silver purses changed from 1 to 2",
			"Silver coins changed from 3 to 4",
			"Gold purses changed from 0 to 1",
			"Gold coins changed from 2 to 3",
		]);
	});

	it("records fortification list changes without object formatting", () => {
		const actor = makeActor({
			stonetop: {
				steading: {
					fortifications: [
						{ name: "Village militia", checked: true },
						{ name: "The Ringwall", checked: false },
						{ name: "Some bows", checked: true },
						{ name: "", checked: false },
					],
				},
			},
		});

		const entries = SteadingLedger.entriesForActorUpdate(actor, {
			flags: {
				stonetop: {
					steading: {
						fortifications: [
							{ name: "Village militia", checked: true },
							{ name: "The Ringwall", checked: true },
							{ name: "Many bows", checked: false },
							{ name: "Palisade", checked: true },
						],
					},
				},
			},
		});

		expect(entries.map(e => e.action)).toEqual([
			"The Ringwall selected",
			"Fortification renamed from Some bows to Many bows",
			"Many bows deselected",
			"Fortification added: Palisade",
			"Palisade selected",
		]);
		expect(entries.map(e => e.action).join(" ")).not.toContain("[object Object]");
	});

	it("records place changes by map letter", () => {
		const actor = makeActor({
			stonetop: {
				steading: {
					places: [
						{ letter: "A", name: "The Stone" },
						{ letter: "B", name: "" },
						{ letter: "C", name: "Cistern" },
					],
				},
			},
		});

		const entries = SteadingLedger.entriesForActorUpdate(actor, {
			flags: {
				stonetop: {
					steading: {
						places: [
							{ letter: "A", name: "The Old Stone" },
							{ letter: "B", name: "Smithy" },
							{ letter: "C", name: "" },
						],
					},
				},
			},
		});

		expect(entries.map(e => e.action)).toEqual([
			"Place A changed from The Stone to The Old Stone",
			"Place B set to Smithy",
			"Place C cleared (Cistern)",
		]);
	});
});
