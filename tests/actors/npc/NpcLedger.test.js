import { describe, it, expect } from "vitest";
import { NpcLedger } from "../../../module/actors/npc/NpcLedger.js";

function makeActor(system = {}) {
	return { type: "npc", system };
}

describe("NpcLedger", () => {
	it("records scalar identity and stat changes with friendly labels", () => {
		const actor = makeActor({
			instinct: "to protect the herd",
			attributes: { hp: { value: 8, max: 8 }, armor: { value: 0, source: "" }, damage: { value: "", rollFormula: "" } },
		});

		const entries = NpcLedger.entriesForActorUpdate(actor, {
			name: "Blodwen",
			system: { instinct: "to flee danger", attributes: { hp: { value: 5 } } },
		});

		expect(entries.map(e => e.action)).toEqual([
			"Name set to Blodwen",
			"Instinct changed from to protect the herd to to flee danger",
			"HP changed from 8 to 5",
		]);
	});

	it("skips fields whose value did not actually change", () => {
		const actor = makeActor({ occupation: "farmer", instinct: "to endure" });
		const entries = NpcLedger.entriesForActorUpdate(actor, {
			system: { occupation: "farmer", instinct: "to prosper" },
		});
		expect(entries.map(e => e.action)).toEqual([
			"Instinct changed from to endure to to prosper",
		]);
	});

	it("logs rich-text prose fields as updated without dumping HTML", () => {
		const actor = makeActor({ notes: "<p>old</p>", connections: "", motivations: "<p>keep</p>" });
		const entries = NpcLedger.entriesForActorUpdate(actor, {
			system: {
				notes: "<p>new & longer prose</p>",
				connections: "<p>Loyal to the Council</p>",
				motivations: "",
			},
		});
		expect(entries.map(e => e.action)).toEqual([
			"Notes updated",
			"Connections added",
			"Motivations cleared",
		]);
	});

	it("diffs the three impression slots individually", () => {
		const actor = makeActor({ impressions: ["gruff voice", "", "smells of pipe smoke"] });
		const entries = NpcLedger.entriesForActorUpdate(actor, {
			system: {
				impressions: {
					0: "gruff voice",              // unchanged → no entry
					1: "a limp",                   // added
					2: "",                         // cleared
				},
			},
		});
		expect(entries.map(e => e.action)).toEqual([
			"Impression added: a limp",
			"Impression cleared: smells of pipe smoke",
		]);
	});

	it("names the player character when their relationship changes", () => {
		const prev = global.game.actors;
		global.game.actors = { get: (id) => (id === "pc1" ? { name: "Aerin" } : null) };
		try {
			const actor = makeActor({ relationships: { pc1: { hearts: 3, notes: "" } } });
			const entries = NpcLedger.entriesForActorUpdate(actor, {
				system: { relationships: { pc1: { hearts: 5, notes: "warming up" } } },
			});
			expect(entries.map(e => e.action)).toEqual([
				"Relationship with Aerin changed from Neutral (3) to Loves (5)",
				"Relationship note for Aerin set to warming up",
			]);
		} finally {
			global.game.actors = prev;
		}
	});

	// An undefined → "" diff is not "equal", so a write that carries a blank note past a
	// row which never had one would log a phantom "note set to blank" beside whatever else
	// changed. updateRelationship no longer emits that shape for a first-time rating, but
	// an explicit clear does, and so does any world written by an earlier build — the
	// entry below is the shape those produce.
	it("does not log a note change when the note was blank and stayed blank", () => {
		const prev = global.game.actors;
		global.game.actors = { get: (id) => (id === "pc1" ? { name: "Aerin" } : null) };
		try {
			// Nothing stored for pc1 at all — the sparse default, i.e. a first-time rating.
			const actor = makeActor({ relationships: {} });
			const entries = NpcLedger.entriesForActorUpdate(actor, {
				system: { relationships: { pc1: { hearts: 4, notes: "" } } },
			});
			expect(entries.map(e => e.action)).toEqual([
				"Relationship with Aerin set to Likes (4)",
			]);
		} finally {
			global.game.actors = prev;
		}
	});

	it("still logs a note being cleared, which is a real change", () => {
		const prev = global.game.actors;
		global.game.actors = { get: (id) => (id === "pc1" ? { name: "Aerin" } : null) };
		try {
			const actor = makeActor({ relationships: { pc1: { hearts: 4, notes: "owes a debt" } } });
			const entries = NpcLedger.entriesForActorUpdate(actor, {
				system: { relationships: { pc1: { hearts: 4, notes: "" } } },
			});
			expect(entries.map(e => e.action)).toEqual([
				"Relationship note for Aerin cleared",
			]);
		} finally {
			global.game.actors = prev;
		}
	});

	it("ignores writes to the ledger flag itself", () => {
		const actor = makeActor({ instinct: "to wait" });
		const entries = NpcLedger.entriesForActorUpdate(actor, {
			flags: { "stonetop-pwd": { ledger: [{ id: "x", action: "whatever" }] } },
		});
		expect(entries).toEqual([]);
	});

	it("records added and removed npcMove items only", () => {
		const created = [
			{ type: "npcMove", name: "Bark an order" },
			{ type: "weapon", name: "Should be ignored" },
		];
		expect(NpcLedger.entriesForCreatedItems(created).map(e => e.action)).toEqual([
			"Move added: Bark an order",
		]);
		expect(NpcLedger.entriesForDeletedItems([{ type: "npcMove", name: "Bark an order" }]).map(e => e.action)).toEqual([
			"Move removed: Bark an order",
		]);
	});
});
