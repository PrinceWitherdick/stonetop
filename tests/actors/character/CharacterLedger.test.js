import { describe, it, expect } from "vitest";
import { CharacterLedger } from "../../../module/actors/character/CharacterLedger.js";
import { ledgerNoun } from "../../../module/utils/ledger-core.js";

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

	it("records wound additions, status changes, and removals", async () => {
		const actor = makeActor({ attributes: { wounds: [
			{ id: "w1", text: "Twisted ankle", status: "problematic", healed: false },
			{ id: "w2", text: "Cracked rib", status: "problematic", healed: false },
		] } });
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"system.attributes.wounds": [
				{ id: "w1", text: "Twisted ankle", status: "stabilized", healed: false },
				{ id: "w3", text: "Burn", status: "problematic", healed: false },
			],
		});
		expect(entries.map(e => e.action)).toEqual([
			'Wound stabilized: "Twisted ankle"',
			'Wound recorded: "Burn"',
			'Wound removed: "Cracked rib"',
		]);
	});

	it("records a wound healed to a scar", async () => {
		const actor = makeActor({ attributes: { wounds: [
			{ id: "w1", text: "Gash", status: "stabilized", healed: false },
		] } });
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"system.attributes.wounds": [
				{ id: "w1", text: "Gash", status: "stabilized", healed: true },
			],
		});
		expect(entries.map(e => e.action)).toEqual(['Wound healed to a scar: "Gash"']);
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
			"flags.stonetop-pwd.inventory.checked.bow-arrows": true,
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
			"flags.stonetop-pwd.possessions.selected": [],
		});
		expect(entries.map(e => e.action)).toEqual(["Sacred pouch deselected"]);
	});

	// A gear bundle's ◇ is the carry mark, not the pick — so it needs its own reading.
	// Without it the change falls through to the generic "Possessions" namespace label and
	// every diamond click writes an unreadable "Possessions changed from … to …" line.
	it("records a chosen weapon being picked up and set down by its label", async () => {
		const weaponsActor = choiceCarried => {
			const actor = makeActor({}, { stonetop: { possessions: { choiceCarried } } });
			actor.typedActor = {
				buildSnapshot: async () => ({
					inventory: {
						possessions: {
							items: [{
								slug: "weapons-of-war", label: "Weapons of war",
								choices: { options: [{ slug: "sword", label: "◇ Sword, iron" }] },
							}],
						},
					},
				}),
			};
			return actor;
		};
		const path = "flags.stonetop-pwd.possessions.choiceCarried.weapons-of-war:sword";

		const carried = await CharacterLedger.entriesForActorUpdate(weaponsActor({}), { [path]: true });
		expect(carried.map(e => e.action)).toEqual(["Weapons of war: ◇ Sword, iron carried"]);

		const setDown = await CharacterLedger.entriesForActorUpdate(
			weaponsActor({ "weapons-of-war:sword": true }), { [path]: false });
		expect(setDown.map(e => e.action)).toEqual(["Weapons of war: ◇ Sword, iron set down"]);
	});

	it("records a write-in possession being added by its label", async () => {
		const actor = makeActor({}, { stonetop: { possessions: { custom: [] } } });
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.possessions.custom": [{ slug: "custom-1", label: "A locket" }],
		});
		expect(entries.map(e => e.action)).toEqual(["A locket added (write-in possession)"]);
	});

	it("records a write-in possession being removed by its label", async () => {
		const actor = makeActor({}, { stonetop: { possessions: { custom: [{ slug: "custom-1", label: "A locket" }] } } });
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.possessions.custom": [],
		});
		expect(entries.map(e => e.action)).toEqual(["A locket removed (write-in possession)"]);
	});

	it("records move resource changes by move name and resource title", async () => {
		const actor = makeActor({}, { stonetop: { moves: { backgroundChoices: { "Rites of the Land": 1 } } } });
		actor.typedActor = {
			buildSnapshot: async () => ({
				moves: [{ moves: [{ name: "Rites of the Land", resource: { title: "Favor" } }] }],
			}),
		};

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.moves.backgroundChoices": { "Rites of the Land": 3 },
		});
		expect(entries.map(e => e.action)).toEqual(["Rites of the Land - Favor changed from 1 to 3"]);
	});

	it("falls back to the move name when a move resource has no title", async () => {
		const actor = makeActor({}, { stonetop: { moves: { backgroundChoices: {} } } });
		actor.typedActor = {
			buildSnapshot: async () => ({
				moves: [{ moves: [{ name: "Untitled Track", resource: { title: null } }] }],
			}),
		};

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.moves.backgroundChoices": { "Untitled Track": 2 },
		});
		expect(entries.map(e => e.action)).toEqual(["Untitled Track resource set to 2"]);
	});

	it("names titled inventory resource tracks by their title (e.g. arcana charges)", async () => {
		const actor = makeActor({}, { stonetop: { inventory: { resources: { "shell-game-of-souls": 0 } } } });
		actor.typedActor = {
			buildSnapshot: async () => ({
				inventory: {
					outfit: { arcanaRegular: [{ slug: "shell-game-of-souls", name: "Shell Game of Souls", resource: { title: "Souls" } }] },
				},
			}),
		};

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.inventory.resources.shell-game-of-souls": 2,
		});
		expect(entries.map(e => e.action)).toEqual(["Shell Game of Souls - Souls changed from 0 to 2"]);
	});

	it("falls back to 'resource' for untitled inventory tracks", async () => {
		const actor = makeActor({}, { stonetop: { inventory: { resources: {} } } });
		actor.typedActor = {
			buildSnapshot: async () => ({
				inventory: { outfit: { regularItems: [{ slug: "bow-arrows", name: "Bow & arrows", resource: { title: null, labels: ["low", "out"] } }] } },
			}),
		};

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.inventory.resources.bow-arrows": 1,
		});
		expect(entries.map(e => e.action)).toEqual(["Bow & arrows resource set to 1"]);
	});

	it("records count-style move marks by move name and option label", async () => {
		const actor = makeActor({}, { stonetop: { moves: { moveMarks: { "Heroes to the Last": { "crew-hp": [] } } } } });
		actor.typedActor = {
			buildSnapshot: async () => ({
				moves: [{ moves: [{ name: "Heroes to the Last", markOptions: [{ slug: "crew-hp", label: "Increase their max HP by 4 each" }] }] }],
			}),
		};

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.moves.moveMarks": { "Heroes to the Last": { "crew-hp": [{ stat: "", level: 6 }] } },
		});
		expect(entries.map(e => e.action)).toEqual(["Heroes to the Last - Increase their max HP by 4 each marked"]);
	});

	it("records stat-choice move marks with the chosen stat", async () => {
		const actor = makeActor({ stats: { str: { value: 0 } } }, { stonetop: { moves: { moveMarks: { "Potential for Greatness": { stat: [] } } } } });
		actor.typedActor = {
			buildSnapshot: async () => ({
				moves: [{ moves: [{ name: "Potential for Greatness", markOptions: [{ slug: "stat", label: "Increase the stat you rolled by 1, to a max of +2", choice: "stat" }] }] }],
			}),
		};

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.moves.moveMarks": { "Potential for Greatness": { stat: [{ stat: "str", level: 2 }] } },
		});
		expect(entries.map(e => e.action)).toEqual(["Potential for Greatness - Increase the stat you rolled by 1, to a max of +2: STR marked"]);
	});

	it("records an arcana unlock requirement by card name and requirement text", async () => {
		const actor = makeActor({}, { stonetop: { arcana: { unlock: { "the-key:master-fear": 0 } } } });
		actor.typedActor = {
			buildSnapshot: async () => ({
				arcana: {
					minor: { items: [{
						slug: "the-key", major: false,
						front: { title: "The Key", unlock: { requirements: [
							{ type: "option", slug: "master-fear", description: "… master your fear and force yourself to touch it." },
						] } },
						back: { options: [] },
					}] },
					major: { items: [] },
				},
			}),
		};

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.arcana.unlock.the-key:master-fear": 1,
		});
		expect(entries.map(e => e.action)).toEqual([
			"Minor Arcana The Key: … master your fear and force yourself to touch it. marked",
		]);
	});

	it("truncates a long unlock requirement to a readable ledger length", async () => {
		const long = "… calm your mind, gaze upon the sigil, and roll +WIS: on a 10+, the sigil becomes clear and you may proceed.";
		const actor = makeActor({}, { stonetop: { arcana: { unlock: { "sunken-tablet:calm": 1 } } } });
		actor.typedActor = {
			buildSnapshot: async () => ({
				arcana: {
					minor: { items: [{
						slug: "sunken-tablet", major: false,
						front: { title: "Sunken Tablet", unlock: { requirements: [{ type: "option", slug: "calm", description: long }] } },
						back: { options: [] },
					}] },
					major: { items: [] },
				},
			}),
		};

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.arcana.unlock.sunken-tablet:calm": 0,
		});
		expect(entries.map(e => e.action)).toEqual([
			"Minor Arcana Sunken Tablet: … calm your mind, gaze upon the sigil, and roll +WIS: on a 10+,… unmarked",
		]);
	});

	it("records a marked arcana track box by card name, side, kind, and position", async () => {
		const actor = makeActor({}, { stonetop: { arcana: { boxes: { "blood-quenched-sword:unlock:2": false } } } });
		actor.typedActor = {
			buildSnapshot: async () => ({
				arcana: {
					minor: { items: [] },
					major: { items: [{
						slug: "blood-quenched-sword", major: true,
						front: { title: "Blood-quenched Sword", unlock: { requirements: [] } },
						back: { options: [] },
					}] },
				},
			}),
		};

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.arcana.boxes.blood-quenched-sword:unlock:2": true,
		});
		expect(entries.map(e => e.action)).toEqual([
			"Major Arcana Blood-quenched Sword: unlock 3 marked",
		]);
	});

	it("falls back to a prettified slug when the arcanum is not in the snapshot", async () => {
		const actor = makeActor({}, { stonetop: { arcana: { boxes: { "lost-card:frontDiamond:0": true } } } });
		actor.typedActor = { buildSnapshot: async () => ({ arcana: { minor: { items: [] }, major: { items: [] } } }) };

		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.arcana.boxes.lost-card:frontDiamond:0": false,
		});
		expect(entries.map(e => e.action)).toEqual([
			"Arcana Lost Card: front diamond 1 unmarked",
		]);
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
			"flags.stonetop-pwd.background.choices.enfys": true,
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
			"flags.stonetop-pwd.initiatesLoyalty.enfys": 2,
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
			"flags.stonetop-pwd.animalCompanion.instinct": "to guard the camp",
			"flags.stonetop-pwd.crew.loyalty": 2,
			"flags.stonetop-pwd.crew.individuals.0.tag": "cautious",
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

	it("stays quiet when a custom follower is created (whole-record write, not per-field noise)", async () => {
		// A creation writes every field of the record at once; the follower isn't yet in the
		// pre-update name map, so none of those field writes should become ledger lines.
		const actor = makeActor({}, {});
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.customFollowers.new1": {
				name: "Bran", loyalty: 0, hpCurrent: 6, instinct: "flee", cost: "coin", tags: ["brave"],
			},
		});
		expect(entries).toEqual([]);
	});

	it("records a play-track change to an existing custom follower, but not a detail edit", async () => {
		const actor = makeActor({}, { "stonetop-pwd": { customFollowers: { f1: { name: "Bran", loyalty: 2 } } } });
		// Loyalty (a play track) logs, named by the follower…
		const play = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.customFollowers.f1.loyalty": 1,
		});
		expect(play.map(e => e.action)).toEqual(["Bran loyalty changed from 2 to 1"]);
		// …but a detail edit (name / cost / instinct / tags) stays quiet.
		const detail = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.customFollowers.f1.name": "Brandon",
		});
		expect(detail).toEqual([]);
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
		expect(ledgerNoun("Heroes to the Last - Increase their max HP by 4 each marked")).toBe("Heroes to the Last - Increase their max HP by 4 each");
		expect(ledgerNoun("Veteran Crew - Select 2 new tags for your Crew unmarked")).toBe("Veteran Crew - Select 2 new tags for your Crew");
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

	it("ignores a trailing move attribution when deriving the subject", () => {
		// The ledger dialog renders move-caused entries as "<action> via <move>"; the
		// subject filter must still group them by the action's real subject.
		expect(ledgerNoun("XP changed from 4 to 5 via Defy Danger")).toBe("XP");
		expect(ledgerNoun("Forward changed from 1 to 0 via Defy Danger")).toBe("Forward");
		expect(ledgerNoun("Surplus changed from 2 to 3 via Seasons Change")).toBe("Surplus");
	});

	it("falls back to the whole action when no verb is recognised", () => {
		expect(ledgerNoun("Some freeform note")).toBe("Some freeform note");
		expect(ledgerNoun("")).toBe("");
		expect(ledgerNoun(null)).toBe("");
	});
});

// ── Readability regressions ─────────────────────────────────────────────────
// Every phrasing asserted below is one a real world's ledger actually produced.

function withSnapshot(actor, snapshot, playbookFlags) {
	actor.typedActor = { buildSnapshot: async () => snapshot };
	if (playbookFlags) actor.items = [{ type: "playbook", name: "PB", flags: { "stonetop-pwd": playbookFlags } }];
	return actor;
}

describe("CharacterLedger arcana flags", () => {
	it("names the card gained instead of dumping the whole owned slug list", async () => {
		const actor = withSnapshot(
			makeActor({}, { stonetop: { arcana: { owned: ["azure-hand"] } } }),
			{ arcana: { minor: { items: [{ slug: "the-key", front: { title: "The Key" } }] } } },
		);
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.arcana.owned": ["azure-hand", "the-key"],
		});
		expect(entries.map(e => e.action)).toEqual(["Arcanum gained: Minor Arcana The Key"]);
	});

	it("distinguishes identifying a card from owning it", async () => {
		// The owned and identified lists hold the same slugs, so under the old namespace label
		// both rendered the byte-identical "Arcana changed from a to a, b". They arrive as two
		// separate updates, so coalesceEntries could not collapse them and the pair read as a
		// duplicate-write bug.
		const actor = withSnapshot(
			makeActor({}, { stonetop: { arcana: { identified: [] } } }),
			{ arcana: { minor: { items: [{ slug: "the-key", front: { title: "The Key" } }] } } },
		);
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.arcana.identified": ["the-key"],
		});
		expect(entries.map(e => e.action)).toEqual(["Arcanum identified: Minor Arcana The Key"]);
	});

	it("reports a minor role cleared to null, not just to an empty string", async () => {
		// `typeof null` is "object", so the whole-object guard used to swallow the clear that
		// the same field reported when it arrived as "".
		const actor = withSnapshot(
			makeActor({}, { stonetop: { arcana: { minorRoles: { lead: "the-key" } } } }),
			{ arcana: { minor: { items: [{ slug: "the-key", front: { title: "The Key" } }] } } },
		);
		for (const cleared of [null, ""]) {
			const entries = await CharacterLedger.entriesForActorUpdate(actor, {
				"flags.stonetop-pwd.arcana.minorRoles.lead": cleared,
			});
			expect(entries.map(e => e.action)).toEqual(["Minor arcanum (lead) cleared"]);
		}
	});

	it("stays silent for bookkeeping sub-flags", async () => {
		const actor = makeActor({}, { stonetop: { arcana: { leadBackfilled: false, minorDraw: [] } } });
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.arcana.leadBackfilled": true,
			"flags.stonetop-pwd.arcana.minorDraw": ["a", "b", "c"],
		});
		expect(entries).toEqual([]);
	});
});

describe("CharacterLedger lore", () => {
	it("names the question and answer rather than logging the raw counter", async () => {
		const actor = withSnapshot(
			makeActor({}, { stonetop: { lore: { counts: {} } } }),
			{},
			{ lore: [{ slug: "earth-mother", title: "The Earth Mother", options: [{ slug: "shrine-loved", description: "<p>Loved and well-used.</p>" }] }] },
		);
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.lore.counts.earth-mother:shrine-loved": 1,
		});
		// Was: "Lore set to 1".
		expect(entries.map(e => e.action)).toEqual(["Lore — The Earth Mother: Loved and well-used. marked"]);
	});

	it("previews a written answer instead of pasting the whole paragraph", async () => {
		const long = "A mirror said to show the dead. ".repeat(20);
		const actor = withSnapshot(
			makeActor({}, { stonetop: { lore: { texts: {} } } }),
			{},
			{ lore: [{ slug: "relic", title: "Your Relic" }] },
		);
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.lore.texts.relic:where": "<p>" + long + "</p>",
		});
		expect(entries).toHaveLength(1);
		expect(entries[0].action).toMatch(/^Lore — Your Relic answered: /);
		expect(entries[0].action).toContain("…");
		expect(entries[0].action.length).toBeLessThan(120);
		expect(entries[0].action).not.toContain("<p>");
	});
});

describe("CharacterLedger debilities", () => {
	it("reads as marked/cleared rather than on/off", async () => {
		const actor = makeActor({ attributes: { debilities: { options: { dazed: { value: false } } } } });
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"system.attributes.debilities.options.dazed.value": true,
		});
		expect(entries.map(e => e.action)).toEqual(["Dazed marked"]);
	});
});

describe("CharacterLedger possession choices", () => {
	it("resolves choices nested in subgroups", async () => {
		// The Sacred pouch's "choose 1 on each line" groups keep their options under
		// subgroups[].options; only group.options was read, so every such choice missed the
		// lookup and fell back to its prettified slug, giving the stuttering
		// "Sacred pouch: Sacred Pouch Origin Heirloom selected".
		const actor = withSnapshot(
			makeActor({}, { stonetop: { possessions: { subChoices: { "sacred-pouch": [] } } } }),
			{ inventory: { possessions: { items: [{
				slug: "sacred-pouch",
				label: "Sacred pouch",
				choiceGroups: [{ heading: "Your sacred pouch is...", subgroups: [
					{ options: [{ slug: "origin-heirloom", label: "an heirloom made just for you" }] },
				] }],
			}] } } },
		);
		const entries = await CharacterLedger.entriesForActorUpdate(actor, {
			"flags.stonetop-pwd.possessions.subChoices.sacred-pouch": ["origin-heirloom"],
		});
		expect(entries.map(e => e.action)).toEqual([
			"Sacred pouch: an heirloom made just for you selected",
		]);
	});
});

describe("CharacterLedger item batches", () => {
	it("summarises a bulk move grant instead of one entry per move", () => {
		// Picking a playbook grants every basic move in one create call — 21 for a Blessed.
		const moves = ["Aid", "Clash", "Defend", "Defy Danger", "Interfere", "Know Things"]
			.map(name => ({ type: "move", name, system: {} }));
		expect(CharacterLedger.entriesForCreatedItems(moves).map(e => e.action)).toEqual([
			"Moves learned (6): Aid, Clash, Defend, and 3 more",
		]);
	});

	it("keeps the summary's subject stable regardless of batch size", () => {
		// The count sits after the verb, not at the front, so ledgerNoun derives "Moves" rather
		// than a new subject ("6 moves", "21 moves") for every batch size the dropdown then lists.
		const batch = n => CharacterLedger.entriesForCreatedItems(
			Array.from({ length: n }, (_, i) => ({ type: "move", name: `Move ${i}`, system: {} })),
		)[0].action;
		expect(ledgerNoun(batch(6))).toBe("Moves");
		expect(ledgerNoun(batch(21))).toBe("Moves");
	});

	it("keeps small batches itemised", () => {
		const moves = [{ type: "move", name: "Aid", system: {} }, { type: "move", name: "Clash", system: {} }];
		expect(CharacterLedger.entriesForCreatedItems(moves).map(e => e.action)).toEqual([
			"Aid learned", "Clash learned",
		]);
	});

	it("splits a mixed batch by type so a playbook grant does not swallow the rest", () => {
		const docs = [
			...["Aid", "Clash", "Defend", "Defy Danger", "Interfere"].map(name => ({ type: "move", name, system: {} })),
			{ type: "playbook", name: "The Fox", system: {} },
		];
		expect(CharacterLedger.entriesForCreatedItems(docs).map(e => e.action)).toEqual([
			"Moves learned (5): Aid, Clash, Defend, and 2 more",
			"Playbook added: The Fox",
		]);
	});

	it("files each summarised batch under its own category", () => {
		const docs = [
			...["Aid", "Clash", "Defend", "Defy Danger", "Interfere"].map(name => ({ type: "move", name, system: {} })),
			{ type: "playbook", name: "The Fox", system: {} },
		];
		expect(CharacterLedger.entriesForCreatedItems(docs).map(e => e.category)).toEqual(["moves", "character"]);
	});

	it("only moves are 'learned', and Arcanum pluralises properly", () => {
		// The batch path used to reuse one verb and bolt an `s` on the singular label, so a
		// Seeker's opening draw read "Arcanums learned (5)" — neither word right.
		const cards = Array.from({ length: 5 }, (_, i) =>
			({ type: "move", name: `Card ${i}`, system: { moveType: "arcanum" } }));
		expect(CharacterLedger.entriesForCreatedItems(cards)[0].action).toBe(
			"Arcana added (5): Card 0, Card 1, Card 2, and 2 more",
		);

		const gear = Array.from({ length: 5 }, (_, i) =>
			({ type: "move", name: `Thing ${i}`, system: { moveType: "inventory-custom" } }));
		expect(CharacterLedger.entriesForCreatedItems(gear)[0].action).toBe(
			"Inventory items added (5): Thing 0, Thing 1, Thing 2, and 2 more",
		);
	});

	it("phrases a deleted batch as a loss whatever the type", () => {
		const cards = Array.from({ length: 5 }, (_, i) =>
			({ type: "move", name: `Card ${i}`, system: { moveType: "arcanum" } }));
		expect(CharacterLedger.entriesForDeletedItems(cards)[0].action).toBe(
			"Arcana removed (5): Card 0, Card 1, Card 2, and 2 more",
		);
	});
});
