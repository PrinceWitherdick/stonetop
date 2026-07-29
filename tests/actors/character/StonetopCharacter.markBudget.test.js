import { describe, expect, it } from "vitest";
import { TestCharacterBuilder } from "../../fakes/TestCharacterBuilder.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";

// A budgeted move (Veteran Crew): pick 1 per take. Mirrors the shipped three-option
// shape (incl. effect fields), so the cross-option budget and effect summation are
// exercised against the real spread.
const VETERAN_CREW = {
	_id: "vc1",
	name: "Veteran Crew",
	system: {
		playbook: "The Marshal",
		markBudget: { base: 1, perExtra: 1 },
		markOptions: [
			{ slug: "tags",        label: "Select 2 new tags",     marks: 4, crewTags: 2 },
			{ slug: "crew-damage", label: "Damage die d6→d8",      marks: 1, crewDamageStep: 1, crewDamageCap: "d10" },
			{ slug: "crew-hp",     label: "Increase max HP by 2",  marks: 4, crewHp: 2 },
		],
	},
};

// Well Versed: budget grows by TWO per extra copy (2·ownedCount − 1), across single-mark
// topic options — exercises the perExtra != 1 path through the writer.
const WELL_VERSED = {
	_id: "wv1",
	name: "Well Versed",
	system: {
		playbook: "The Seeker",
		markBudget: { base: 1, perExtra: 2 },
		markOptions: [
			{ slug: "fae",        label: "The Fae",          marks: 1 },
			{ slug: "makers",     label: "The Makers",       marks: 1 },
			{ slug: "primordial", label: "Primordial powers", marks: 1 },
			{ slug: "wild",       label: "The wild world",   marks: 1 },
		],
	},
};

// A budgeted move mixing a stat-choice option (Potential-for-Greatness shape) with a
// checkbox option — stat slots must NOT consume the checkbox pick budget.
const STAT_MIX = {
	_id: "sm1",
	name: "Stat Mix Move",
	system: {
		playbook: "The Marshal",
		markBudget: { base: 1, perExtra: 1 },
		markOptions: [
			{ slug: "pog", label: "Stat slot",  choice: "stat", marks: 2 },
			{ slug: "box", label: "A checkbox", marks: 4 },
		],
	},
};

// Beast of Legend (Ranger): the "tough" pick buffs the Animal Companion's HP/armor.
const BEAST_OF_LEGEND = {
	_id: "bol1",
	name: "Beast of Legend",
	system: {
		playbook: "The Ranger",
		markBudget: { base: 1, perExtra: 1 },
		markOptions: [
			{ slug: "tough",  label: "They get +4 HP and +1 armor", marks: 3, companionHp: 4, companionArmor: 1 },
			{ slug: "unique", label: "They develop some unique ability or trait", marks: 3 },
		],
	},
};

const lvl = () => ({ stat: "", level: 5 });

// An UN-budgeted markOptions move (no markBudget) — must stay uncapped, the prior behavior.
const UNCAPPED = {
	_id: "u1",
	name: "Uncapped Move",
	system: {
		playbook: "The Marshal",
		markOptions: [{ slug: "a", label: "A", marks: 9 }],
	},
};

// One owned move Item per copy the character holds (drives the owned-count budget).
function ownedCopies(def, n) {
	return Array.from({ length: n }, () => ({ type: "move", name: def.name, system: def.system }));
}

function makeChar({ def, copies = 1, marks = {}, level = 5 }) {
	const actor = new FakeActorBuilder()
		.withPlaybook("the-marshal", "The Marshal")
		.withLevel(level)
		.withItems(ownedCopies(def, copies))
		.withFlags({ "moves.moveMarks": { [def.name]: marks } })
		.build();
	const char = new TestCharacterBuilder(actor).addPlaybookMove(def).build();
	return { char, actor };
}

// The moveMarks object written by the last actor.update() call.
function writtenMarks(actor) {
	const frag = actor.update.mock.calls.at(-1)[0];
	return frag["flags.stonetop-pwd.moves.moveMarks"];
}

describe("StonetopCharacter.setCountMark — repeat-scaling budget", () => {
	it("clamps an increase that would exceed the budget (1 owned ⇒ 1 pick total)", async () => {
		// tags already holds the single allowed pick; checking crew-hp must be refused.
		const { char, actor } = makeChar({ def: VETERAN_CREW, copies: 1, marks: { tags: [{ stat: "", level: 5 }] } });
		await char.setCountMark("Veteran Crew", "crew-hp", 1);
		expect(writtenMarks(actor)["Veteran Crew"]["crew-hp"]).toEqual([]);
	});

	it("allows the increase once another copy raises the budget (2 owned ⇒ 2 picks)", async () => {
		const { char, actor } = makeChar({ def: VETERAN_CREW, copies: 2, marks: { tags: [{ stat: "", level: 5 }] } });
		await char.setCountMark("Veteran Crew", "crew-hp", 1);
		const written = writtenMarks(actor)["Veteran Crew"]["crew-hp"];
		expect(written).toHaveLength(1);
		expect(written[0].level).toBe(5); // newly checked box stamps the current level
	});

	it("never clamps a DEcrease, so a grandfathered over-budget mark can be cleared", async () => {
		// 1 owned ⇒ budget 1, but tags is already over budget at 3 (legacy data).
		const { char, actor } = makeChar({ def: VETERAN_CREW, copies: 1, marks: { tags: [{}, {}, {}].map(() => ({ stat: "", level: 5 })) } });
		await char.setCountMark("Veteran Crew", "tags", 2);
		expect(writtenMarks(actor)["Veteran Crew"]["tags"]).toHaveLength(2);
	});

	it("leaves an unbudgeted markOptions move uncapped", async () => {
		const { char, actor } = makeChar({ def: UNCAPPED, copies: 1 });
		await char.setCountMark("Uncapped Move", "a", 5);
		expect(writtenMarks(actor)["Uncapped Move"]["a"]).toHaveLength(5);
	});

	it("counts picks across all of the move's options against the shared budget", async () => {
		// 2 owned ⇒ budget 2; tags holds 2 already, so crew-hp can add none.
		const { char, actor } = makeChar({
			def: VETERAN_CREW, copies: 2,
			marks: { tags: [{ stat: "", level: 5 }, { stat: "", level: 5 }] },
		});
		await char.setCountMark("Veteran Crew", "crew-hp", 1);
		expect(writtenMarks(actor)["Veteran Crew"]["crew-hp"]).toEqual([]);
	});

	it("sums picks across all THREE options (tags + crew-damage block crew-hp at budget 2)", async () => {
		const { char, actor } = makeChar({
			def: VETERAN_CREW, copies: 2,
			marks: { tags: [lvl()], "crew-damage": [lvl()] },
		});
		await char.setCountMark("Veteran Crew", "crew-hp", 1);
		expect(writtenMarks(actor)["Veteran Crew"]["crew-hp"]).toEqual([]);
	});

	it("partial-fills to the remaining budget when the requested jump overshoots", async () => {
		// 2 owned ⇒ budget 2; tags empty; asking for 5 lands on 2 (not 0, not 5).
		const { char, actor } = makeChar({ def: VETERAN_CREW, copies: 2 });
		await char.setCountMark("Veteran Crew", "tags", 5);
		expect(writtenMarks(actor)["Veteran Crew"]["tags"]).toHaveLength(2);
	});

	it("Well Versed (perExtra:2): 2 owned ⇒ budget 3 — allows a 3rd topic", async () => {
		const { char, actor } = makeChar({ def: WELL_VERSED, copies: 2, marks: { fae: [lvl()], makers: [lvl()] } });
		await char.setCountMark("Well Versed", "primordial", 1);
		expect(writtenMarks(actor)["Well Versed"]["primordial"]).toHaveLength(1);
	});

	it("Well Versed (perExtra:2): 2 owned ⇒ budget 3 — blocks a 4th topic", async () => {
		const { char, actor } = makeChar({
			def: WELL_VERSED, copies: 2,
			marks: { fae: [lvl()], makers: [lvl()], primordial: [lvl()] },
		});
		await char.setCountMark("Well Versed", "wild", 1);
		expect(writtenMarks(actor)["Well Versed"]["wild"]).toEqual([]);
	});

	it("does not count filled stat-choice slots against the checkbox budget", async () => {
		// 1 owned ⇒ checkbox budget 1; a filled Potential-for-Greatness-style stat slot
		// must NOT consume it (would clamp 'box' to [] if the stat guard were dropped).
		const { char, actor } = makeChar({ def: STAT_MIX, copies: 1, marks: { pog: [{ stat: "str", level: 5 }] } });
		await char.setCountMark("Stat Mix Move", "box", 1);
		expect(writtenMarks(actor)["Stat Mix Move"]["box"]).toHaveLength(1);
	});

	it("applies effects for ALL checked marks even when grandfathered over budget", async () => {
		// 1 owned ⇒ budget 1, but crew-hp is marked 3× (legacy over-budget). _ownedMoveBonuses
		// sums the full checked count — effects are never clamped to the budget.
		const { char } = makeChar({ def: VETERAN_CREW, copies: 1, marks: { "crew-hp": [lvl(), lvl(), lvl()] } });
		const totals = await char._ownedMoveBonuses({ name: "The Marshal" }, new Set(["Veteran Crew"]));
		expect(totals.crewHp).toBe(6); // 3 marks × crewHp 2, not clamped to 1
	});

	it("sums crewTags so 'Select 2 new tags' raises the Crew tag allowance (+2 per pick)", async () => {
		// 2 copies (budget 2), the tags option picked twice ⇒ +4 crew tag slots.
		const { char } = makeChar({ def: VETERAN_CREW, copies: 2, marks: { tags: [lvl(), lvl()] } });
		const totals = await char._ownedMoveBonuses({ name: "The Marshal" }, new Set(["Veteran Crew"]));
		expect(totals.crewTags).toBe(4);
	});

	it("sums companionHp/companionArmor from Beast of Legend's 'tough' pick", async () => {
		// 2 copies (budget 2), the tough option picked twice ⇒ +8 HP / +2 armor to the companion.
		const { char } = makeChar({ def: BEAST_OF_LEGEND, copies: 2, marks: { tough: [lvl(), lvl()] } });
		const totals = await char._ownedMoveBonuses({ name: "The Ranger" }, new Set(["Beast of Legend"]));
		expect(totals.companionHp).toBe(8);
		expect(totals.companionArmor).toBe(2);
	});
});
