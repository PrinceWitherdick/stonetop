import { describe, it, expect } from "vitest";
import { CharacterLedger, ledgerNoun, ledgerNounCounts } from "../../../module/actors/character/CharacterLedger.js";

function makeActor(system = {}, flags = {}) {
	return {
		type: "character",
		system,
		flags,
	};
}

describe("CharacterLedger", () => {
	it("records a playbook being added", async () => {
		const actor = makeActor({ playbook: { name: "", slug: "" } });
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"system.playbook": { name: "The Fox", slug: "the-fox", uuid: "Compendium.x" },
		});
		expect(entries.map(e => e.action)).toEqual(["Playbook added: The Fox"]);
	});

	it("records damage changes", async () => {
		const actor = makeActor({ attributes: { damage: { value: "d4" } } });
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"system.attributes.damage.value": "d6",
		});
		expect(entries.map(e => e.action)).toEqual(["Damage value changed from d4 to d6"]);
	});

	it("records inventory selections by item name", async () => {
		const actor = makeActor({}, { stonetop: { inventory: { checked: { "bow-arrows": false } } } });
		actor.typedActor = {
			buildSnapshot: async () => ({
				inventory: {
					outfit: {
						regularItems: [{ slug: "bow-arrows", name: "Bow & arrows" }],
					},
				},
			}),
		};

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop_pwd.inventory.checked.bow-arrows": true,
		});
		expect(entries.map(e => e.action)).toEqual(["Bow & arrows selected"]);
	});

	it("records possession selections by item name", async () => {
		const actor = makeActor({}, { stonetop: { possessions: { selected: ["sacred-pouch"] } } });
		actor.typedActor = {
			buildSnapshot: async () => ({
				inventory: {
					possessions: {
						items: [{ slug: "sacred-pouch", label: "Sacred pouch" }],
					},
				},
			}),
		};

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop_pwd.possessions.selected": [],
		});
		expect(entries.map(e => e.action)).toEqual(["Sacred pouch deselected"]);
	});

	it("records background choices by choice label", async () => {
		const actor = makeActor({}, { stonetop: { background: { choices: { enfys: false } } } });
		actor.items = [{
			type: "playbook",
			flags: {
				stonetop: {
					backgrounds: [{
						slug: "initiate",
						choices: {
							options: [{ slug: "enfys", label: "Enfys, your acolyte, beloved by birds" }],
						},
					}],
				},
			},
		}];

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop_pwd.background.choices.enfys": true,
		});
		expect(entries.map(e => e.action)).toEqual(["Enfys, your acolyte, beloved by birds selected"]);
	});

	it("records initiate loyalty by follower name", async () => {
		const actor = makeActor({}, { stonetop: { initiatesLoyalty: { enfys: 1 } } });
		actor.items = [{
			type: "playbook",
			flags: {
				stonetop: {
					backgrounds: [{
						slug: "initiate",
						choices: {
							options: [{ slug: "enfys", label: "Enfys, your acolyte, beloved by birds" }],
						},
					}],
				},
			},
		}];

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop_pwd.initiatesLoyalty.enfys": 2,
		});
		expect(entries.map(e => e.action)).toEqual(["Enfys loyalty changed from 1 to 2"]);
	});

	it("records named follower stat changes", async () => {
		const actor = makeActor({}, {
			stonetop: {
				animalCompanion: { name: "Bramble", instinct: "to chase rabbits" },
				crew: {
					name: "The Red Shields",
					loyalty: 1,
					individuals: [{ name: "Aled", tag: "eager" }],
				},
			},
		});

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop_pwd.animalCompanion.instinct": "to guard the camp",
			"flags.stonetop_pwd.crew.loyalty": 2,
			"flags.stonetop_pwd.crew.individuals.0.tag": "cautious",
		});
		expect(entries.map(e => e.action)).toEqual([
			"Bramble instinct changed from to chase rabbits to to guard the camp",
			"The Red Shields loyalty changed from 1 to 2",
			"Aled tag changed from eager to cautious",
		]);
	});

	it("records learned and removed moves", () => {
		const item = { name: "Ambush", type: "move", system: { moveType: "playbook" } };
		expect(CharacterLedger.entriesForCreatedItems([item]).map(e => e.action)).toEqual(["Ambush learned"]);
		expect(CharacterLedger.entriesForDeletedItems([item]).map(e => e.action)).toEqual(["Ambush removed"]);
	});
});

describe("ledgerNoun", () => {
	it("derives the subject before the change verb", () => {
		expect(ledgerNoun("HP changed from 5 to 3")).toBe("HP");
		expect(ledgerNoun("STR set to +1")).toBe("STR");
		expect(ledgerNoun("Forward cleared")).toBe("Forward");
		expect(ledgerNoun("Bow & arrows selected")).toBe("Bow & arrows");
		expect(ledgerNoun("Bow & arrows deselected")).toBe("Bow & arrows");
		expect(ledgerNoun("Ambush learned")).toBe("Ambush");
		expect(ledgerNoun("Ambush removed")).toBe("Ambush");
	});

	it("uses the type label as the noun for typed add/remove entries", () => {
		expect(ledgerNoun("Playbook added: The Fox")).toBe("Playbook");
		expect(ledgerNoun("Playbook removed: The Fox")).toBe("Playbook");
		expect(ledgerNoun("Arcanum added: Gold Ring")).toBe("Arcanum");
		expect(ledgerNoun("Asset removed: Wagon")).toBe("Asset");
		expect(ledgerNoun("Neighbor renamed from A to B")).toBe("Neighbor");
	});

	it("keeps the full subject phrase for compound and currency nouns", () => {
		expect(ledgerNoun("Silver purses changed from 1 to 2")).toBe("Silver purses");
		expect(ledgerNoun("The Red Shields loyalty changed from 1 to 2")).toBe("The Red Shields loyalty");
		expect(ledgerNoun("Place A set to The Stone")).toBe("Place A");
	});

	it("falls back to the whole action when no verb is recognised", () => {
		expect(ledgerNoun("Some freeform note")).toBe("Some freeform note");
		expect(ledgerNoun("")).toBe("");
		expect(ledgerNoun(null)).toBe("");
	});
});

describe("ledgerNounCounts", () => {
	it("counts distinct nouns and sorts them alphabetically", () => {
		const entries = [
			{ action: "HP changed from 5 to 3" },
			{ action: "HP changed from 3 to 4" },
			{ action: "STR set to +1" },
			{ action: "Ambush learned" },
		];
		expect(ledgerNounCounts(entries)).toEqual([
			{ noun: "Ambush", count: 1 },
			{ noun: "HP", count: 2 },
			{ noun: "STR", count: 1 },
		]);
	});

	it("handles empty input", () => {
		expect(ledgerNounCounts([])).toEqual([]);
		expect(ledgerNounCounts(undefined)).toEqual([]);
	});
});
