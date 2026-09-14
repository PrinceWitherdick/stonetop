import { describe, it, expect } from "vitest";
import Handlebars from "handlebars";
import { readRepo as read, readCss, declarations, ownRule } from "../../fakes/css.js";
import { statRuleIssues, parseStatArray, earnedStatIncreases } from "../../../module/actors/character/stat-rules.js";

/**
 * A stat box takes any number anyone types, and that is the point: a table may be running a
 * variant, converting a character in from another game, or handing out something the book never
 * printed. So the sheet never rejects, clamps or rewrites a score. What it does instead is say
 * which scores the rules as written can't account for, in edit mode, where the reader is in a
 * position to do something about it.
 *
 * The whole thing fails QUIETLY in both directions, which is why it is pinned here. A check that
 * is too loose flags nothing and nobody notices it stopped working; a check that is too tight
 * paints a caution frame on a perfectly legal sheet and teaches its owner to ignore the frame.
 * The second is worse, so most of what follows is legal sheets that must stay silent.
 */

const NOTE     = "Assign these scores to your stats: +2, +1, +1, +0, +0, -1";
const WBH_NOTE = "Assign these scores to your stats: +1, +0, +0, +0, +0, -1";

/** `system.stats` shape from a flat map, so a case reads as the six numbers it is about. */
const stats = map => Object.fromEntries(Object.entries(map).map(([key, value]) => [key, { value }]));

/** The legal array, assigned. */
const ARRAY_AS_ASSIGNED = { str: 2, dex: 1, con: 1, int: 0, wis: 0, cha: -1 };

/** A Judge as onboarding might have left one: the same array, with the +2 in CHA and a +0 in STR. */
const JUDGE = { str: 0, dex: 1, con: 1, int: 0, wis: -1, cha: 2 };

/** The two stat-increase moves as a character owns them. Each carries its own cap. */
const IMPROVED = id => ({ id, name: "Improved Stat", type: "move", system: { cap: 2 } });
const SUPERIOR = id => ({ id, name: "Superior Stat", type: "move", system: { cap: 3 } });

/** Potential for Greatness's stat slots filled with the stats named, where the ledger writes them. */
const pfgMarks = (...statKeys) => ({
	moves: { moveMarks: { "Potential for Greatness": { stat: statKeys.map((stat, i) => ({ stat, level: i + 2 })) } } },
});

const issues = (values, flags = {}, statsNote = NOTE, items = []) =>
	statRuleIssues({ stats: stats(values), flags, statsNote, items });

describe("what the rules as written allow a stat to be", () => {
	// The two ends the book pins down without reference to a playbook or to what was earned:
	// -1 is the lowest score any array assigns and nothing in play lowers a stat (a debility
	// gives disadvantage instead), while Superior Stat is the only advance that reaches +3.
	describe("the range", () => {
		it("passes both ends of it", () => {
			const flags = { improvedStatChoices: { sup: "str" } };
			expect(issues({ ...ARRAY_AS_ASSIGNED, str: 3 }, flags, NOTE, [SUPERIOR("sup")])).toEqual({});
		});

		it("flags a score past +3, and says where the ceiling comes from", () => {
			const found = issues({ ...ARRAY_AS_ASSIGNED, str: 5 });
			expect(Object.keys(found)).toEqual(["str"]);
			expect(found.str.message).toContain("+5 is past what the rules reach");
			expect(found.str.message).toContain("Superior Stat");
			expect(found.str.message).toContain("-1 to +3");
		});

		it("flags a score below -1", () => {
			const found = issues({ ...ARRAY_AS_ASSIGNED, cha: -2 });
			expect(Object.keys(found)).toEqual(["cha"]);
			expect(found.cha.message).toContain("-2 is below what the rules reach");
			expect(found.cha.message).toContain("-1 to +3");
		});

		// The range holds whether or not anything else is known, so a character with no playbook
		// and no history still gets the one check that never needed either.
		it("holds with no playbook to compare against", () => {
			const found = statRuleIssues({ stats: stats({ ...ARRAY_AS_ASSIGNED, str: 7 }), flags: {}, statsNote: null });
			expect(Object.keys(found)).toEqual(["str"]);
		});
	});

	// Which stat starts on which score is the player's to choose, and to change. Onboarding
	// records the assignment it made, and nothing holds anyone to it: trade two scores and the
	// six still come to the array, which is all the book asks of them.
	describe("moving scores between stats", () => {
		// The case this section exists for. A Judge who put the +2 in CHA and a +0 in STR at
		// creation and later wants them the other way round has a legal sheet the moment both
		// boxes are typed, and a caution frame on it would be accusing correct play.
		it("says nothing about two scores traded after onboarding recorded them", () => {
			expect(issues({ ...JUDGE, str: 2, cha: 0 }, { onboardingStats: JUDGE })).toEqual({});
		});

		it("says nothing about a whole new order either", () => {
			expect(issues({ str: -1, dex: 0, con: 0, int: 1, wis: 1, cha: 2 }, { onboardingStats: ARRAY_AS_ASSIGNED }))
				.toEqual({});
		});

		// Onboarding's record is one legal assignment, not the rule, so a character carrying one
		// reads exactly like a character built by hand. A check that still compared each stat
		// against it would be back to cautioning every trade.
		it("reads a character the same with or without onboarding's record", () => {
			const typed = { ...ARRAY_AS_ASSIGNED, str: 3 };
			expect(issues(typed, { onboardingStats: ARRAY_AS_ASSIGNED })).toEqual(issues(typed));
			expect(issues(typed).str.message).toContain("STR starts at +3, which this playbook's array never assigns.");
		});

		// Halfway through a trade one box has been typed and the other has not, so two stats share
		// the +2. Both are named, and the +0 the trade freed is offered, which is exactly the number
		// the reader is about to type.
		it("flags a trade typed halfway, on both stats sharing the score, and offers the one it freed", () => {
			const found = issues({ ...JUDGE, str: 2 }, { onboardingStats: JUDGE });
			expect(Object.keys(found).sort()).toEqual(["cha", "str"]);
			expect(found.str.message).toBe(
				"STR starts at +2, and so does CHA, but the array assigns +2 once. "
				+ "Array: +2, +1, +1, +0, +0, -1. Still unassigned: +0.");
		});

		// An earned +1 belongs to the stat it was taken for; that is what the pick recorded. Two
		// OTHER stats trading leave it where it is.
		it("leaves an earned +1 on its own stat when two others trade", () => {
			const flags = { onboardingStats: JUDGE, improvedStatChoices: { imp: "dex" } };
			expect(issues({ ...JUDGE, dex: 2, str: 2, cha: 0 }, flags, NOTE, [IMPROVED("imp")])).toEqual({});
		});

		// The raised stat can trade too, and takes its +1 onto whatever it starts at now. DEX
		// started at +1 and Improved Stat made it +2; give DEX the +0 and INT the +1, and DEX reads
		// +1 with its increase still on it.
		it("lets a raised stat trade its start, carrying its +1 with it", () => {
			const flags = { onboardingStats: JUDGE, improvedStatChoices: { imp: "dex" } };
			expect(issues({ ...JUDGE, dex: 1, int: 1 }, flags, NOTE, [IMPROVED("imp")])).toEqual({});
		});
	});

	// Every +1 earned since creation comes back off before the starting scores are compared, and
	// the check has to find all of them, or every character who has ever levelled lights up.
	describe("what a character has earned since", () => {
		it("counts an Improved Stat pick toward what the box may read", () => {
			const flags = { improvedStatChoices: { itemA: "dex" } };
			expect(issues({ ...ARRAY_AS_ASSIGNED, dex: 2 }, flags, NOTE, [IMPROVED("itemA")])).toEqual({});
		});

		it("counts repeat picks on the same stat", () => {
			const flags = { improvedStatChoices: { a: "int", b: "int" } };
			const items = [IMPROVED("a"), IMPROVED("b")];
			expect(issues({ ...ARRAY_AS_ASSIGNED, int: 2 }, flags, NOTE, items)).toEqual({});
			expect(issues({ ...ARRAY_AS_ASSIGNED, int: 1 }, flags, NOTE, items).int.message)
				.toContain("INT starts at -1 (+1 now, less 2 stat increases)");
		});

		// The Would-Be Hero's Potential for Greatness raises a stat from a MARK rather than from a
		// move instance, and writes the same +1 to the same field. A check that only read
		// `improvedStatChoices` would flag every filled slot on the one playbook that has them.
		it("counts a marking move's filled stat slots", () => {
			expect(issues({ str: 2, dex: 0, con: 1, int: 0, wis: 0, cha: -1 }, pfgMarks("str", "con"), WBH_NOTE)).toEqual({});
		});

		// WHERE THE MARKS ACTUALLY LIVE. The two sources sit at different depths in the flag bag:
		// `improvedStatChoices` at the top, the marks under `moves` (CharacterLedger writes
		// `flags.<scope>.moves.moveMarks.*`; WouldBeHeroAsterisk reads "moves.moveMarks"). A read
		// of the wrong one finds nothing, silently, forever. The failure is not an error: it is a
		// gold caution frame on a perfectly legal score, on the one playbook that has stat slots.
		it("does not read the marks from the top level, where they are not", () => {
			const flags = { moveMarks: { "Potential for Greatness": { stat: [{ stat: "str", level: 3 }] } } };
			// Nothing counted, so a +2 STR is unaccounted for and IS flagged. The point is that the
			// shape above is not the shape the ledger writes, and reading it would be reading noise.
			expect(issues({ str: 2, dex: 0, con: 0, int: 0, wis: 0, cha: -1 }, flags, WBH_NOTE).str)
				.toBeTruthy();
		});

		// A count-style mark stores `{ stat: "", level }` in the very same store. Counting one as a
		// stat slot would hand a free +1 to every move with a checkbox track.
		it("does not count a mark that names no stat", () => {
			const flags = { moves: { moveMarks: { "Veteran Crew": { size: [{ stat: "", level: 2 }, { stat: "", level: 3 }] } } } };
			expect(issues({ ...ARRAY_AS_ASSIGNED }, flags)).toEqual({});
		});
	});

	// An earned +1 stays on the stat it was taken for, and the move behind it raises a stat only
	// so far. While each stat kept its own start, a pick made under the cap stayed under it and
	// this never came up. A trade can now carry a raised stat past what its move reaches, and the
	// array check alone would call that legal.
	describe("how far each +1 reaches", () => {
		// DEX started at +1 and Improved Stat took it to +2. Trade DEX's start with CHA's +2 and the
		// six still come to the array, but DEX reads +3, which Improved Stat can't reach.
		it("flags a trade that carries a raised stat past its move's cap", () => {
			const flags = { improvedStatChoices: { imp: "dex" } };
			const found = issues({ ...JUDGE, dex: 3, cha: 1 }, flags, NOTE, [IMPROVED("imp")]);
			expect(Object.keys(found)).toEqual(["dex"]);
			expect(found.dex.message).toBe(
				"DEX starts at +2 (+3 now, less one stat increase), but Improved Stat raises a stat only as far as +2, "
				+ "so for that increase to count, DEX has to start at +1 or lower.");
		});

		// The same six numbers are legal when the pick was Superior Stat, so the cap has to come off
		// the move that made the pick, not off the fact that a pick was made.
		it("reads the cap off the move that made the pick", () => {
			const flags = { improvedStatChoices: { pick: "dex" } };
			expect(issues({ ...JUDGE, dex: 3, cha: 1 }, flags, NOTE, [SUPERIOR("pick")])).toEqual({});
		});

		// Improved Stat then Superior Stat takes a +1 start to +3. The other way round, the second
		// pick would have had nowhere to go, but nothing records the order, and a check that assumed
		// the worst one would caution a legal sheet.
		it("lands the picks in whichever order works", () => {
			const flags = { improvedStatChoices: { sup: "dex", imp: "dex" } };
			const items = [SUPERIOR("sup"), IMPROVED("imp")];
			expect(issues({ str: 2, dex: 3, con: 1, int: 0, wis: 0, cha: -1 }, flags, NOTE, items)).toEqual({});
		});

		// Potential for Greatness writes its +1 whatever the stat already reads, so its +2 is held
		// here and nowhere else. Two marks take a +0 start to +2, and a +1 start past it.
		it("holds Potential for Greatness to +2", () => {
			expect(issues({ str: 1, dex: 2, con: 0, int: 0, wis: 0, cha: -1 }, pfgMarks("dex", "dex"), WBH_NOTE))
				.toEqual({});
			const found = issues({ str: 3, dex: 0, con: 0, int: 0, wis: 0, cha: -1 }, pfgMarks("str", "str"), WBH_NOTE);
			expect(Object.keys(found)).toEqual(["str"]);
			expect(found.str.message).toBe(
				"STR starts at +1 (+3 now, less 2 stat increases), but Potential for Greatness raises a stat only as far "
				+ "as +2, so for both increases to count, STR has to start at +0 or lower.");
		});

		// Four marks on one stat can't all land from any start the book assigns: even -1 reaches +2
		// in three. There is no score to point the reader at, so the message says that instead.
		it("says so when no starting score lets every mark land", () => {
			const found = issues({ str: 1, dex: 3, con: 0, int: 0, wis: 0, cha: 0 }, pfgMarks("dex", "dex", "dex", "dex"), WBH_NOTE);
			expect(Object.keys(found)).toEqual(["dex"]);
			expect(found.dex.message).toContain("so no starting score lets all 4 increases count.");
		});

		// A pick whose move is no longer on the sheet has no cap left to read. It is held to the
		// range, the one limit that never needed its move.
		it("holds a pick whose move is gone from the sheet to the range alone", () => {
			expect(issues({ ...JUDGE, dex: 3, cha: 1 }, { improvedStatChoices: { gone: "dex" } })).toEqual({});
		});
	});

	// Take each stat's earned increases back off, and the six starting scores come back to be
	// checked as a SET against the playbook's printed array.
	describe("the starting scores, against the playbook's array", () => {
		it("says nothing about a legal array", () => {
			expect(issues({ ...ARRAY_AS_ASSIGNED })).toEqual({});
		});

		it("says nothing about scores assigned in a different order", () => {
			expect(issues({ str: -1, dex: 0, con: 0, int: 1, wis: 1, cha: 2 })).toEqual({});
		});

		// The set check can never say WHICH of two stats on the same score is the wrong one, so it
		// names them both, offers what the array has not given out, and leaves the choice alone.
		it("flags every stat crowding one score, and offers what is left over", () => {
			const found = issues({ str: 2, dex: 2, con: 1, int: 0, wis: 0, cha: -1 });
			expect(Object.keys(found).sort()).toEqual(["dex", "str"]);
			expect(found.str.message).toBe(
				"STR starts at +2, and so does DEX, but the array assigns +2 once. "
				+ "Array: +2, +1, +1, +0, +0, -1. Still unassigned: +1.");
			expect(found.dex.message).toContain("and so does STR");
		});

		it("names all of them when three share a score", () => {
			const found = issues({ str: 0, dex: 0, con: 0, int: 1, wis: 1, cha: -1 });
			expect(Object.keys(found).sort()).toEqual(["con", "dex", "str"]);
			expect(found.str.message).toContain("and so do DEX & CON");
			expect(found.str.message).toContain("but the array assigns +0 twice");
			expect(found.str.message).toContain("Still unassigned: +2");
		});

		it("says so plainly when the array never assigns that score at all", () => {
			const found = issues({ str: 2, dex: 1, con: 1, int: 0, wis: 0, cha: 3 });
			expect(Object.keys(found)).toEqual(["cha"]);
			expect(found.cha.message).toContain("CHA starts at +3, which this playbook's array never assigns.");
			expect(found.cha.message).toContain("Still unassigned: -1.");
		});

		// The increases come off FIRST. A levelled character's +3 is a legal +2 that was raised,
		// and flagging it would be the worst kind of false alarm: correct play, cautioned.
		it("takes earned increases off before comparing", () => {
			const flags = { improvedStatChoices: { a: "str", b: "dex" } };
			expect(issues({ str: 3, dex: 2, con: 1, int: 0, wis: 0, cha: -1 }, flags, NOTE, [SUPERIOR("a"), IMPROVED("b")]))
				.toEqual({});
		});

		// The reader sees +3 in the box and is being told about a +2, so the message has to show
		// how it got there or it reads as talking about some other stat.
		it("shows its working when a stat with increases is still wrong", () => {
			const found = issues({ str: 2, dex: 3, con: 1, int: 0, wis: 0, cha: -1 }, { improvedStatChoices: { a: "dex" } });
			expect(Object.keys(found).sort()).toEqual(["dex", "str"]);
			expect(found.dex.message).toContain("DEX starts at +2 (+3 now, less one stat increase), and so does STR");
		});

		// The Would-Be Hero starts lower than everyone else, and a check hardcoded to the common
		// array would flag its whole stat block on a freshly made character.
		it("reads the playbook's own array rather than the common one", () => {
			expect(issues({ str: 1, dex: 0, con: 0, int: 0, wis: 0, cha: -1 }, {}, WBH_NOTE)).toEqual({});
			expect(Object.keys(issues({ str: 2, dex: 1, con: 1, int: 0, wis: 0, cha: -1 }, {}, WBH_NOTE)).length)
				.toBeGreaterThan(0);
		});

		// With no array to compare against there is nothing to say beyond the range, and saying
		// something anyway would mean inventing a rule.
		it("stays quiet with no playbook note to read", () => {
			expect(issues({ str: 2, dex: 2, con: 2, int: 2, wis: 2, cha: 2 }, {}, null)).toEqual({});
		});
	});

	describe("reading a playbook's printed note", () => {
		it("reads the scores off it", () => {
			expect(parseStatArray(NOTE)).toEqual([2, 1, 1, 0, 0, -1]);
			expect(parseStatArray(WBH_NOTE)).toEqual([1, 0, 0, 0, 0, -1]);
		});

		// One score per stat or it is not an array. A note that reads as five or seven has to fall
		// back to a playable default rather than demand an assignment nobody can make.
		it("refuses anything that is not six scores", () => {
			expect(parseStatArray("")).toBeNull();
			expect(parseStatArray(null)).toBeNull();
			expect(parseStatArray("Assign 3 scores: +2, +1, +0")).toBeNull();
		});
	});

	describe("counting what a character has earned", () => {
		it("returns an empty list for every stat on a character who has earned nothing", () => {
			expect(earnedStatIncreases({})).toEqual({ str: [], dex: [], con: [], int: [], wis: [], cha: [] });
		});

		it("ignores a recorded pick that names no stat we know", () => {
			expect(earnedStatIncreases({ improvedStatChoices: { a: "luck", b: "str" } }).str).toHaveLength(1);
		});

		// Both stores, every +1 carrying how far its move reaches: a pick's cap off its own item
		// (the ceiling when the item is gone), a slot's off the one move that has slots.
		it("says how far every +1 reaches, and which move gave it", () => {
			const flags = { improvedStatChoices: { imp: "str", gone: "str" }, ...pfgMarks("str") };
			expect(earnedStatIncreases(flags, [IMPROVED("imp")]).str).toMatchObject([
				{ move: "Improved Stat", cap: 2 },
				{ cap: 3 },
				{ move: "Potential for Greatness", cap: 2 },
			]);
		});

		// The sheet hands over the actor's item collection, not an array. Foundry's collections
		// iterate their documents through `values()`, and so does an array, so both have to read.
		it("reads the items off anything with values()", () => {
			const collection = new Map([["imp", IMPROVED("imp")]]);
			expect(earnedStatIncreases({ improvedStatChoices: { imp: "str" } }, collection).str).toEqual([
				{ move: "Improved Stat", cap: 2 },
			]);
		});
	});
});

// ── What the reader actually sees ─────────────────────────────────────────────────────────────

describe("the stat box", () => {
	const STATS_HBS = read("templates/actor/partials/actor-stats.hbs");

	const render = (statIssues, statsEdit = true) => {
		const hb = Handlebars.create();
		hb.registerHelper("statLabel", key => String(key).toUpperCase());
		return hb.compile(STATS_HBS)({
			system: { stats: stats(ARRAY_AS_ASSIGNED) },
			stonetop: { statsEdit, statIssues },
		});
	};

	it("wears the caution frame and carries the sentence, for the stat that earned it", () => {
		const html = render({ str: { value: 3, message: "STR starts at +3." } });
		expect(html).toMatch(/<div class="stonetop-stat-box stonetop-stat-box--off-rules" data-tooltip="STR starts at \+3\."/);
		expect(html).toContain('data-tooltip-direction="DOWN"');
	});

	it("leaves every other box alone", () => {
		const html = render({ str: { value: 3, message: "STR starts at +3." } });
		expect((html.match(/stonetop-stat-box--off-rules/g) ?? []).length).toBe(1);
		expect((html.match(/data-tooltip=/g) ?? []).length).toBe(1);
	});

	// The cell ALREADY takes a hover description of the stat itself, hung on the `<li>` by
	// applyLabelTooltips. The nearest `[data-tooltip]` under the pointer is the one that shows,
	// so an empty one left on every box would swallow that description and pop a blank tooltip
	// in its place.
	it("emits no tooltip attribute at all when there is nothing to say", () => {
		expect(render({})).not.toContain("data-tooltip");
	});

	// The frame is a caution, not a lock: the input is what it always was.
	it("does not disable or lock the box it is cautioning", () => {
		const html = render({ str: { value: 3, message: "STR starts at +3." } });
		expect(html).not.toContain("disabled");
		expect(html).not.toContain("readonly");
	});
});

describe("the caution frame", () => {
	const CSS = readCss();

	// The caution tier that isn't yet a failure. Taking the palette from the shared tokens is also
	// what gets the high-contrast mode for nothing: it re-points the family's stops itself.
	it("is built from the shared gold family, not a fresh literal", () => {
		const rule = ownRule(CSS, ".stonetop-stat-box--off-rules");
		expect(rule).toBeTruthy();
		expect(rule).toMatch(/var\(--st-gold-/);
		expect(rule).not.toMatch(/#[0-9a-f]{3,6}/i);
	});

	// The stop matters. `--st-gold-border` is pitched to sit on its own `-bg` wash and is 2.32:1
	// alone on the page: below the 3:1 floor for a non-text cue, and LIGHTER than the plain frame
	// it replaces, so the cautioned box would read as less framed than the five beside it.
	// `-text` is the family's only stop pitched to carry against paper. Verified for real in
	// z:/tmp/foundry-verify/stat-off-rules-verify.mjs (4.71:1 normal, 8.53:1 high contrast).
	it("takes the frame from the stop that carries against the page", () => {
		expect(ownRule(CSS, ".stonetop-stat-box--off-rules")).toMatch(/background:\s*var\(--st-gold-text\)/);
	});

	// A hue change alone is the weakest signal this sheet can send, and there is a reader at a
	// real table on Windows Magnifier. The frame's padding IS its border width (the box is a
	// clip-path frame), so this is the cue that survives a magnifier and a colourblind reader.
	it("thickens the frame as well as recolouring it", () => {
		expect(ownRule(CSS, ".stonetop-stat-box--off-rules")).toMatch(/padding:\s*3px/);
		expect(ownRule(CSS, ".stonetop-stat-box")).toMatch(/padding:\s*2px/);
	});

	it("washes the well behind the number without touching the number's own ink", () => {
		const inner = declarations(CSS, ".stonetop-stat-box--off-rules .stonetop-stat-inner");
		expect(inner).toContain("--st-gold-border");
		expect(inner).not.toContain("color:");
	});

	// Equal specificity, so the modifier only wins by sitting later. It is the whole of what makes
	// the frame paint, and it fails by painting nothing at all.
	it("sits after the base rule it overrides", () => {
		expect(CSS.indexOf(".stonetop-stat-box--off-rules"))
			.toBeGreaterThan(CSS.indexOf(".stonetop-stat-box {"));
	});
});

describe("when the caution is shown", () => {
	const SHEET_JS = read("module/actors/character/StonetopCharacterSheet.js");

	// Edit mode only. A caution ring around a number nobody is editing is noise on a sheet being
	// played from, and the reader can do nothing about it there anyway.
	it("is built only while the stats section is being edited", () => {
		expect(SHEET_JS).toMatch(/context\.stonetop\.statIssues = context\.stonetop\.statsEdit\s*\n\s*\? statRuleIssues\(/);
		// And the other branch hands the template nothing to look up, rather than being left out.
		expect(SHEET_JS).toMatch(/\}\)\s*\n\s*: \{\};/);
	});

	// How far an Improved / Superior Stat pick reaches is read off the move it was taken with, so
	// the sheet has to hand the items over. Leave them off and nothing breaks loudly: every pick
	// just reads as reaching +3, and a trade past Improved Stat's +2 goes uncautioned.
	it("hands the check the actor's items, which say how far each pick reaches", () => {
		expect(SHEET_JS).toMatch(/statRuleIssues\(\{[^}]*items:\s*this\.actor\.items,/);
	});
});
