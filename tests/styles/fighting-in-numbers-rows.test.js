import { describe, it, expect } from "vitest";
import { readRepo } from "../fakes/css.js";

/**
 * ONE ROW PER RULE, on every card that abstracts a group.
 *
 * The book pays a side for having more bodies in two different ways:
 *
 *   the swarm rule       several attackers on a SINGLE foe roll "one attacker's damage, +1 per
 *                        each additional attacker" — damage only, no armor.
 *   the abstraction      in a group-vs-group exchange each side fights as one combatant and the
 *                        larger side gets "+1 damage and +1 armor for each multiple they
 *                        outnumber their foe by".
 *
 * They agree only when the foe is a single target, which is why a single "Outnumber: N vs M" box
 * could stand here for years looking right: six creatures on four PCs is +0 under the abstraction
 * and +5 against whichever one they pile onto, and one box has to answer one of those with the
 * other's number. These tests hold the two rows apart — separate labels, separate counts,
 * separate dice — and hold the readouts to what each rule actually pays.
 */

const MONSTER  = readRepo("templates/actor/monster.hbs");
const FOLLOWER = readRepo("templates/actor/partials/tab-followers.hbs");
const SHEET    = readRepo("module/actors/character/StonetopCharacterSheet.js");
const MSHEET   = readRepo("module/actors/monster/StonetopMonsterSheet.js");
const BUILD    = readRepo("module/data/follower-build.js");

describe("both rules get their own row", () => {
	it("gives the monster stat block a swarm row and an exchange row", () => {
		expect(MONSTER).toContain('data-rule="swarm"');
		expect(MONSTER).toContain('data-rule="exchange"');
		expect(MONSTER).toContain("Swarm one foe:");
		expect(MONSTER).toContain("Group vs group:");
	});

	it("gives the crew and every custom group the same pair, from one shared partial", () => {
		expect(FOLLOWER).toContain('{{#*inline "stonetopFightingInNumbers"}}');
		// Rendered once for the crew and once for a custom group; defined once.
		expect(FOLLOWER.match(/\{\{> stonetopFightingInNumbers /g)).toHaveLength(2);
		expect(FOLLOWER.match(/data-rule="swarm"/g)).toHaveLength(1);
		expect(FOLLOWER.match(/data-rule="exchange"/g)).toHaveLength(1);
	});

	it("leaves no lone 'Outnumber' box standing in for both rules", () => {
		for (const tpl of [MONSTER, FOLLOWER]) {
			expect(tpl).not.toContain(">Outnumber:<");
			expect(tpl).not.toContain("stonetop-group-fight-outnumber-row");
		}
	});
});

describe("each row pays what its own rule pays", () => {
	// The swarm rule grants damage and nothing else. A readout offering armor here would hand a
	// swarming horde a defence the book never gives it.
	it("promises no armor on the swarm row", () => {
		for (const tpl of [MONSTER, FOLLOWER]) {
			const swarm = tpl.slice(tpl.indexOf('data-rule="swarm"'), tpl.indexOf('data-rule="exchange"'));
			expect(swarm).toContain("Damage only; this rule grants no armor.");
			expect(swarm).not.toMatch(/\+1 armor/);
		}
	});

	it("states the abstraction's armor half, and its worked example, on the exchange row", () => {
		for (const tpl of [MONSTER, FOLLOWER]) {
			const idx = tpl.indexOf('data-rule="exchange"');
			const exchange = tpl.slice(idx, idx + 1400);
			expect(exchange).toContain("+1 damage and +1 armor for each whole multiple");
			expect(exchange).toContain("3:1");
		}
	});
});

describe("a keystroke in one row cannot answer the other row's question", () => {
	// Both listeners scope to the ROW that owns the input. Scoped to the section instead, a
	// change to the swarm count would reach the exchange row's shared damage button and rewrite
	// it with the swarm's number, which is the conflation the split exists to end.
	it("scopes both sheets' calculators to the row, not the section", () => {
		expect(BUILD).toContain('ev.target.closest("[data-rule]")');
		expect(BUILD).toContain('row.dataset.rule === "swarm"');
		for (const js of [SHEET, MSHEET]) expect(js).toContain("wireFightingInNumbers(html[0]");
	});

	// The listener rewrites the formula a row PRINTS only where it is named. Unnamed, the swarm
	// row's label kept saying "d6+5" while its readout and its roll had moved on to "d6+2".
	it("names each row's printed formula, so a typed count rewrites what the row says", () => {
		for (const tpl of [MONSTER, FOLLOWER]) {
			const swarm = tpl.slice(tpl.indexOf('data-rule="swarm"'), tpl.indexOf('data-rule="exchange"'));
			const exchangeAt = tpl.indexOf('data-rule="exchange"');
			expect(swarm).toContain("data-numbers-formula");
			expect(tpl.slice(exchangeAt, exchangeAt + 2000)).toContain("data-numbers-formula");
		}
	});
});

describe("the abstracted pool is ONE member's HP", () => {
	// "Each group deals damage and has HP/armor as per a single individual member." A size x HP
	// pool is the un-abstracted total the roster already tracks member by member, and as an
	// "abstraction" it made a group roughly `size` times harder to break than the rule it was
	// named after. Damage to this pool is read as casualties instead.
	it("never scales the crew or a custom group's pool by the roster size", () => {
		expect(SHEET).not.toMatch(/crewSize \* crewMaxHp/);
		expect(SHEET).not.toMatch(/size \* memberHpMax/);
		expect(SHEET).toContain("const crewGroupHpMax     = crewMaxHp;");
		expect(SHEET).toContain("const groupHpMax     = memberHpMax;");
	});

	// Both cards build their fold summaries through the one shared builder, so the casualty
	// read happens once, where it is written, rather than being spelled out per call site and
	// left free to drift. What is pinned here is that BOTH cards go through it, and that it
	// divides the GROUP POOL — not the roster's summed HP, which is the un-abstracted total.
	it("reads that pool back as bodies, in both group-fight summaries", () => {
		// Both cards record their inputs, and the one builder reads them in finalize.
		expect(SHEET.match(/groupFightInputs\.set\((crew|card), \{/g)).toHaveLength(2);
		expect(SHEET).toContain("groupFightCardSummaries({ ...input, damageRoll: card.damageRoll })");
		expect(BUILD).toMatch(/casualtyNote\(\{ hpMax: groupHpMax, hpCurrent: groupHpCurrent/);
	});

	// A hand-edited Damage lands in withStatOverrides. The readouts fold their bonus into the die,
	// so they have to be built after it, or a crew set to d8 offers a "d6+5" button that rolls d6.
	it("builds the readouts after a hand-edited Damage has replaced the rules die", () => {
		const finalize = SHEET.match(/const finalize = \(card\) => ([^;]*);/)?.[1] ?? "";
		expect(finalize).toMatch(/withGroupFight\(withStatOverrides\(card\)\)/);
	});
});
