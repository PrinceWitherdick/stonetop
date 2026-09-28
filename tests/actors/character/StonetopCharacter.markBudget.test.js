import { describe, expect, it } from "vitest";
import { TestCharacterBuilder } from "../../fakes/TestCharacterBuilder.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";
import { buildLiveCharacter, sourceMovesFor } from "../../fakes/LiveCharacter.js";

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

// Beast of Legend (Ranger): "pick 1" each take, one box per option as the insert prints them; the
// "tough" pick buffs the Animal Companion's HP/armor, "exceptional" makes it exceptional.
const BEAST_OF_LEGEND = {
	_id: "bol1",
	name: "Beast of Legend",
	system: {
		playbook: "The Ranger",
		markBudget: { base: 1, perExtra: 1 },
		markOptions: [
			{ slug: "exceptional", label: "They are exceptional (and roll +2 instead of +1)", marks: 1 },
			{ slug: "tough",  label: "They get +4 HP and +1 armor", marks: 1, companionHp: 4, companionArmor: 1 },
			{ slug: "unique", label: "They develop some unique ability or trait", marks: 1 },
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
		const totals = await char._ownedMoveBonuses({ name: "The Marshal" }, char._buildOwnedMovesMap());
		expect(totals.crewHp).toBe(6); // 3 marks × crewHp 2, not clamped to 1
	});

	it("sums crewTags so 'Select 2 new tags' raises the Crew tag allowance (+2 per pick)", async () => {
		// 2 copies (budget 2), the tags option picked twice ⇒ +4 crew tag slots.
		const { char } = makeChar({ def: VETERAN_CREW, copies: 2, marks: { tags: [lvl(), lvl()] } });
		const totals = await char._ownedMoveBonuses({ name: "The Marshal" }, char._buildOwnedMovesMap());
		expect(totals.crewTags).toBe(4);
	});

	it("sums companionHp/companionArmor from Beast of Legend's 'tough' pick", async () => {
		// 2 copies (budget 2): exceptional and tough, one each ⇒ +4 HP / +1 armor to the companion.
		const { char } = makeChar({ def: BEAST_OF_LEGEND, copies: 2, marks: { exceptional: [lvl()], tough: [lvl()] } });
		const totals = await char._ownedMoveBonuses({ name: "The Ranger" }, char._buildOwnedMovesMap());
		expect(totals.companionHp).toBe(4);
		expect(totals.companionArmor).toBe(1);
	});
});

describe("StonetopCharacter.setCountMark: an option's own boxes", () => {
	it("never marks an option past its boxes, however much budget is left", async () => {
		// Beast of Legend's options are one box each; 3 copies give a budget of 3, but "tough" holds 1.
		const { char, actor } = makeChar({ def: BEAST_OF_LEGEND, copies: 3 });
		await char.setCountMark("Beast of Legend", "tough", 2);
		expect(writtenMarks(actor)["Beast of Legend"]["tough"]).toHaveLength(1);
	});

	it("keeps an over-full option already stored (a decrease is never clamped)", async () => {
		const { char, actor } = makeChar({ def: BEAST_OF_LEGEND, copies: 3, marks: { tough: [lvl(), lvl()] } });
		await char.setCountMark("Beast of Legend", "tough", 1);
		expect(writtenMarks(actor)["Beast of Legend"]["tough"]).toHaveLength(1);
	});
});

// The Seeker, off the shipped pack: the background's Well Versed topic ("Well Versed in the Things
// Below", the Patriot's) is one of the move's seven boxes, ticked by the background and outside the
// budget ("Mark 1 topic, in addition to the one noted in your Background").
describe("Well Versed: the background's topic", () => {
	const wellVersedDoc = () => sourceMovesFor("The Seeker").find(d => d.name === "Well Versed");
	const patriot = (moveMarks = {}) => buildLiveCharacter({
		slug: "the-seeker", name: "The Seeker",
		flags: {
			"background.selected": "patriot",
			"moves.backgroundAnswers": { "Well Versed": { label: "Well Versed in", value: "the Things Below" } },
			"moves.moveMarks": { "Well Versed": moveMarks },
		},
	});
	const liveMarks = actor => actor.getFlag("stonetop-pwd", "moves.moveMarks")["Well Versed"];
	const card = async char => (await char.buildSnapshot()).movelist.playbookMoves.find(m => m.name === "Well Versed");

	it("names the background's box, from the stored answer or the background's fixed one", async () => {
		expect(await patriot().char.backgroundMarkOptions()).toEqual({ "Well Versed": "things-below" });
		// A first background picked before the answer was ever written still counts.
		const { char } = buildLiveCharacter({ slug: "the-seeker", name: "The Seeker", flags: { "background.selected": "antiquarian" } });
		expect(await char.backgroundMarkOptions()).toEqual({ "Well Versed": "makers" });
	});

	it("refuses to mark the background's box, and marks another topic within the budget", async () => {
		const { char, actor } = patriot();
		await char.setCountMark("Well Versed", "things-below", 1);
		expect(liveMarks(actor)["things-below"] ?? []).toEqual([]);
		await char.setCountMark("Well Versed", "fae", 1);
		expect(liveMarks(actor).fae).toHaveLength(1);
	});

	it("shows the background's box ticked and locked, outside the budget, on the card", async () => {
		const { char } = patriot({ fae: [lvl()] });
		const wv = await card(char);
		const things = wv.markOptions.find(o => o.slug === "things-below");
		expect(things.background).toMatchObject({ label: "Background" });
		expect(things.checks).toEqual([]); // its one box is the background's
		expect(things.duplicateNote).toBeNull();
		expect(wv.markBudget).toMatchObject({ used: 1, max: 1, needsChoice: false });
		expect(wv.markOptions.find(o => o.slug === "fae").background).toBeNull();
	});

	it("flags, never clears, a mark an old character stored on the background's box", async () => {
		const { char, actor } = patriot({ "things-below": [lvl()] });
		const things = (await card(char)).markOptions.find(o => o.slug === "things-below");
		expect(things.duplicateNote).toBeTruthy();
		expect(things.checks).toHaveLength(1);
		expect(things.checks[0]).toMatchObject({ checked: true, disabled: false });
		expect(liveMarks(actor)["things-below"]).toHaveLength(1);
	});

	// Onboarding's "1 topic, in addition": a re-run replaces its own mark and nothing else.
	it("a re-run of onboarding's topic replaces its own mark", async () => {
		const { char, actor } = patriot();
		await char.setCreationMark("Well Versed", "fae");
		expect(liveMarks(actor).fae).toEqual([{ stat: "", level: 1, creation: true }]);
		expect(char.creationMarkOption("Well Versed")).toBe("fae");
		await char.setCreationMark("Well Versed", "wild");
		expect(liveMarks(actor).fae).toEqual([]);
		expect(liveMarks(actor).wild).toEqual([{ stat: "", level: 1, creation: true }]);
	});

	it("reads a topic ticked by hand at 1st level as onboarding's pick, and a re-run takes only it", async () => {
		const first = { stat: "", level: 1 };
		const { char, actor } = patriot({ fae: [first], makers: [first] });
		expect(char.creationMarkOption("Well Versed")).toBe("fae");
		await char.setCreationMark("Well Versed", "");
		expect(liveMarks(actor).fae).toEqual([]);
		expect(liveMarks(actor).makers).toEqual([first]);
	});

	it("the level-up data names the background's box for the mark step", async () => {
		const { char } = patriot();
		expect((await char.getLevelUpData()).backgroundMarks).toEqual({ "Well Versed": "things-below" });
		expect(wellVersedDoc().system.markOptions.map(o => o.slug)).toContain("things-below");
	});
});

// A move of another playbook taken more than once (a Fox's Well Versed, twice through Dabbler) is ONE
// learned card, its budget scaling with both copies, as the writer's clamp reads it.
describe("a learned move held twice", () => {
	const wellVersed = () => sourceMovesFor("The Seeker").find(d => d.name === "Well Versed");
	const foxWithTwo = () => buildLiveCharacter({
		slug: "the-fox", name: "The Fox", level: 5,
		items: [1, 2].map(() => ({
			name: "Well Versed", type: "move",
			// An old copy without the budget: the pack's definition is read first.
			system: { ...structuredClone(wellVersed().system), markBudget: null },
			flags: { "stonetop-pwd": { grantedBy: { move: "Dabbler" } } },
		})),
	});

	it("is one card with both copies and a budget of 3", async () => {
		const { char } = foxWithTwo();
		const cards = (await char.buildSnapshot()).movelist.learnedMoves.filter(m => m.name === "Well Versed");
		expect(cards).toHaveLength(1);
		expect(cards[0].ownedIds).toHaveLength(2);
		expect(cards[0].markBudget).toMatchObject({ used: 0, max: 3 });
	});

	// Granters from other playbooks, so neither copy is shown inside a card of the Fox's own (a
	// Dabbler grant is). The first granter is switched off, the second is on.
	it("names every granter, and notes a copy switched off with its granter while another is on", async () => {
		const GRANTERS = [["Worldly", "The Ranger"], ["Seasoned Warrior", "The Heavy"]];
		const { char } = buildLiveCharacter({
			slug: "the-fox", name: "The Fox", level: 5,
			items: [
				...GRANTERS.map(([name, playbook], n) => ({
					_id: `granter${n}`, name, type: "move", system: { moveType: "playbook", playbook },
					...(n === 0 ? { flags: { "stonetop-pwd": { learned: false } } } : {}),
				})),
				...GRANTERS.map(([move], n) => ({
					_id: `wv${n}`, name: "Well Versed", type: "move", system: structuredClone(wellVersed().system),
					flags: { "stonetop-pwd": { grantedBy: { move, instanceId: `granter${n}` } } },
				})),
			],
		});
		const [card] = (await char.buildSnapshot()).movelist.learnedMoves.filter(m => m.name === "Well Versed");
		expect(card.sourceLabel).toBe("Granted by Worldly, Seasoned Warrior · The Seeker");
		expect(card.granterOff).toBeNull();
		expect(card.granterOffCopy).toBe("Worldly");
		// Unticking the card takes the copy that is still on.
		expect(card.ownedId).toBe("wv1");
	});

	it("takes 3 topics and refuses a 4th", async () => {
		const { char, actor } = foxWithTwo();
		for (const slug of ["fae", "makers", "wild", "primordial"]) await char.setCountMark("Well Versed", slug, 1);
		const marks = actor.getFlag("stonetop-pwd", "moves.moveMarks")["Well Versed"];
		expect(["fae", "makers", "wild"].map(s => marks[s]?.length)).toEqual([1, 1, 1]);
		expect(marks.primordial ?? []).toEqual([]);
	});
});
