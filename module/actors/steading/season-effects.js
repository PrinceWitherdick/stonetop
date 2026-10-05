import { flatRequirementItems, improvementRequirementCount, yieldRuleLine, signed } from "../../utils/improvement-def.js";
import { rulesHas, yieldStepKey } from "./improvement-rules.js";

// ── What the steading's improvements do when the Seasons Change ──────────────────
// Ten of the book's improvements end in a "Henceforth…" clause that fires on the turning of a
// season, and until now the Seasons Change window knew about three of them: the Herd of Horses,
// the Standing Watch and the Weapons of War. The other seven were prose on an improvement card
// and nothing else, so a steading that had built a Mill and a Market and won a Township rolled
// the same 1d4 for its harvest as a village with none of them, and consumed the same 1d4 in
// winter behind a stone wall as it had before the wall existed.
//
// They divide into three kinds, and the division is what this module is shaped around, because
// the three want completely different things from the window:
//
//   • MODIFIERS to a roll the season already makes. The autumn harvest and the winter
//     consumption are single rolls whose formula several improvements rewrite. There is nothing
//     for a GM to click here — the button that was already there simply rolls the right dice.
//
//   • YIELDS: Surplus an improvement generates on its own, alongside the season's roll. Each is
//     its own thing to take, so each is its own button and its own once-per-season marker.
//
//   • DUES: an upkeep that costs something if it goes unpaid, which is the Well-Trained Militia
//     and its summer of drills. That is the Standing Watch's shape exactly, so it is wired the
//     Standing Watch's way, right down to the second button naming what happens if you decline.
//
// EVERYTHING HERE IS THE BOOK'S ARITHMETIC, not ours, so each entry carries the printed line it
// implements. A rule this file gets wrong is a rule that is wrong four times a year forever, and
// nobody at the table would have any way of noticing.
//
// Pure — no Actor, no globals, no Roll. It is handed plain numbers and the steading's RULES LIST
// (improvement-rules.js: the improvements in force, each with its grants) and answers with formulas
// and rows, so every combination is testable without a world and the window is left with nothing
// to do but render and roll.
//
// WHICH improvement does WHAT is no longer written here. Each rule is a grant on the improvement
// itself (`harvestBonus`, `winterConsumption`, `winterPopulation`, `seasonalYield`; see
// LIVE_GRANT_KEYS in utils/improvement-def.js), so a homebrew improvement can carry any of them,
// and the book's own carry theirs in IMPROVEMENT_GRANTS. What stays here is the arithmetic, and
// the rulings that are no one improvement's (Size's dice, the first-bite ruling, the fields).

/** A signed tail for a dice formula: "" for 0, " + 2", " - 1". Foundry's Roll wants the spaces
 *  and will not take "1d4 + -1", which is what a template literal produces if you let it. */
function term(n) {
	const value = Math.trunc(Number(n) || 0);
	if (!value) return "";
	return value > 0 ? ` + ${value}` : ` - ${Math.abs(value)}`;
}

/**
 * The autumn harvest, and everything that changes it.
 *
 *   Base (Book I, Seasons Change, autumn) — "the steading generates 1d4 Surplus".
 *   Each improvement in force with a `harvestBonus`, in definition order. Dice join the formula
 *     (Greater Harvest's "when the autumn harvest is complete, gain +1d4 Surplus"); a flat bonus is
 *     summed at the end (the Mill's "+1 Surplus", Book II's Rhoillyg Orchard's "another +1 Surplus
 *     when the autumn harvest is complete").
 *   Additional Housing, and ONLY if the steading took that requirement — "Building on parts of
 *     the fields, resulting in −1 Surplus generated with each autumn's harvest". It is a cost
 *     the steading chose while building, so it is read off the requirement box that records the
 *     choice, not off a grant. Bespoke: no other improvement prices one way of building it.
 *
 * @param {object}  state
 * @param {Array}   state.rules                       improvement-rules.js#improvementRulesFrom
 * @param {boolean} [state.builtOnTheFields=false]    did Additional Housing take the fields?
 * @returns {{formula: string, parts: Array<{label: string, amount: string}>}}
 *   `parts` names each contribution for the button and the notice, so a GM can see WHY the
 *   harvest is 1d4+1d4+1 rather than being handed a formula and asked to trust it.
 */
export function autumnHarvest({ rules = [], builtOnTheFields = false } = {}) {
	const parts = [{ label: "Harvest", amount: "1d4" }];
	let formula = "1d4";
	let flat = 0;
	for (const rule of rules ?? []) {
		const bonus = rule.grants?.harvestBonus;
		if (!bonus) continue;
		if (typeof bonus === "string") {
			formula += ` + ${bonus}`;
			parts.push({ label: rule.label, amount: `+${bonus}` });
		} else {
			flat += bonus;
			parts.push({ label: rule.label, amount: signed(bonus) });
		}
	}
	// The fields that were built on. Only reachable through Additional Housing, so it is gated on
	// the improvement as well as on the box: an un-built improvement's half-ticked requirements
	// are a plan, not a change to this year's harvest.
	if (rulesHas(rules)("additionalHousing") && builtOnTheFields) {
		flat -= 1;
		parts.push({ label: "Homes built on the fields", amount: "−1" });
	}
	return { formula: formula + term(flat), parts };
}

/** Winter's dice by Size, and the line naming why they are not the book's 1d4. */
const WINTER_DICE = {
	town:     { dice: "2d6", part: { label: "A town", amount: "2d6 in place of 1d4" } },
	city:     { dice: "2d6", part: { label: "A city (the book leaves its Surplus to the table)", amount: "2d6, as a town" } },
	hamlet:   { dice: "1d2", part: { label: "A hamlet", amount: "1d2 in place of 1d4" } },
	village:  { dice: "1d4", part: null },
};

/**
 * Winter's consumption roll, and everything that changes it.
 *
 *   Base (Book I, Seasons Change, winter) — "rolls 1d4+Population (min 0); the steading consumes
 *     that much Surplus".
 *   Size (Book I p. 509, p. 518) — "If Stonetop has shrunk to a hamlet, it consumes only
 *     1d2 + Population. If it has grown to a town, it consumes 2d6 + Population." The move box
 *     prints the village's dice. A city is "out of scope" for Surplus in the book, so it rolls the
 *     town's rather than nothing, and the part line says the table may rule otherwise.
 *   An improvement in force that SET the Size (`setSize`): the Township's "Change Size to town",
 *     whose own text then says "roll 2d6+Population to consume Surplus instead of 1d4+Population".
 *     It rolls that Size's dice whatever the Size radio says, named after the improvement, so a
 *     steading whose radio was never moved still rolls a town's dice.
 *   `winterPopulation` — Additional Housing's "when you consume Surplus in winter, consider
 *     Population to be 1 lower than it is".
 *   `winterConsumption` — the Stone Wall's "the steading consumes 1 less Surplus than normal", and
 *     Book II's Permanent Logging Camp ("1 less Surplus than usual in winter") and Great Wood
 *     Timber ("1 less Surplus every winter"). Several STACK: each is its own saving, and none is
 *     worded as a cap on another.
 *
 * @param {object} state
 * @param {number} state.population
 * @param {Array}  state.rules                 improvement-rules.js#improvementRulesFrom
 * @param {string} [state.size="village"]  the steading's Size (hamlet, village, town, city)
 * @param {boolean} [state.second=false]  Is this winter's SECOND bite — the 7-9's "consume
 *   1d4+Population more Surplus before winter ends"?
 *
 *   The dice and the Population adjustment carry over to it, because both are stated as how a
 *   winter consumption is rolled at all. A flat `winterConsumption` does NOT: the Stone Wall says
 *   the steading consumes one less than normal over a winter, and charging it against both rolls
 *   would let one wall pay twice for a single winter. That is a ruling rather than a quotation,
 *   which is why it is written down here and surfaced in the window rather than left implicit.
 * @returns {{formula: string, parts: Array<{label: string, amount: string}>}}
 */
export function winterConsumption({ population = 0, rules = [], size = "village", second = false } = {}) {
	const sizer = (rules ?? []).find(r => r.grants?.setSize && r.grants.setSize !== "village" && WINTER_DICE[r.grants.setSize]);
	const sized = sizer ? WINTER_DICE[sizer.grants.setSize] : null;
	const { dice, part } = sized
		? { dice: sized.dice, part: { label: sizer.label, amount: `${sized.dice} in place of 1d4` } }
		: WINTER_DICE[size] ?? WINTER_DICE.village;
	const parts = [{ label: second ? "Winter is not done" : "Winter", amount: dice }];
	if (part) parts.push(part);

	let pop = Math.trunc(Number(population) || 0);
	for (const rule of rules ?? []) {
		const n = Math.trunc(Number(rule.grants?.winterPopulation) || 0);
		if (!n) continue;
		pop += n;
		parts.push({ label: rule.label, amount: `Population counts ${Math.abs(n)} ${n < 0 ? "lower" : "higher"}` });
	}
	let flat = pop;
	if (!second) {
		for (const rule of rules ?? []) {
			const n = Math.trunc(Number(rule.grants?.winterConsumption) || 0);
			if (!n) continue;
			flat += n;
			parts.push({ label: rule.label, amount: `${signed(n)} Surplus consumed` });
		}
	}
	return { formula: dice + term(flat), parts };
}

/**
 * A Surplus roll as the window's prompt left it: advantage and disadvantage roll the season's
 * formula twice and keep the higher or lower (a 1d4 has no third die to add), and the modifier
 * lands on top. Foundry's dice pool, so one chat card shows both rolls.
 *
 * @param {string} formula  the season's own roll ("1d4 - 1", autumnHarvest's formula)
 * @param {object} [o]
 * @param {string} [o.rollMode]  "adv" | "dis" | anything else for normal
 * @param {number} [o.modifier]
 * @returns {string}
 */
export function surplusRollFormula(formula, { rollMode = "normal", modifier = 0 } = {}) {
	const base = rollMode === "adv" ? `{${formula}, ${formula}}kh`
		: rollMode === "dis" ? `{${formula}, ${formula}}kl`
		: formula;
	return base + term(modifier);
}

/**
 * Surplus an improvement generates when the season turns — the third of the three kinds: each
 * improvement in force whose `seasonalYield` names this season, in definition order.
 *
 * `needsHit` is the fork that keeps two of the book's from being taken automatically: Raincatching
 * and Harnessing the Stream both pay out only "when you roll a 7+ with Fortunes", and this window
 * cannot read that roll. The +Fortunes roll is posted to chat by the roll engine, or made from
 * the Moves tab, or handed to a player entirely — so, exactly like winter's debt, the tier is a
 * thing the GM tells the window rather than a thing the window works out. Their buttons say the
 * condition out loud instead of pretending to know.
 *
 * The other conditions are ones the window CAN check, so it does:
 *   whileMet       the Market's "and the market is active": a Market that has ceased to meet its
 *                  requirements has lapsed (its Prosperity is already taken back, see the `lapse`
 *                  grant) and trades nothing
 *   minPopulation  the Market's "and Population is +1 or better"
 *   minSurplus     Book II's Trade with Barrier Pass, "when spring bursts forth and Stonetop has at
 *                  least 1 Surplus": read off the Surplus the season OPENED with (`surplus`)
 *
 * A row whose condition fails is still RETURNED, carrying `blocked` and the sentence saying why. A
 * steading that has built a Market and sees no Market row cannot tell whether the rule is
 * satisfied elsewhere, was forgotten, or does not apply this season — so the row stays and
 * explains itself, and only the button goes.
 *
 * `key` is the yield's once-a-season marker (improvement-rules.js#yieldStepKey): the book's keep
 * the keys they were stamped under before, so a season already taken stays taken.
 *
 * @param {object} o
 * @param {string} o.seasonId
 * @param {number} o.population
 * @param {number} [o.surplus]  the Surplus the season opened with, for `minSurplus`
 * @param {Array}  o.rules      improvement-rules.js#improvementRulesFrom
 * @returns {Array<{key, slug, label, rule, amount, needsHit, blocked, unmet}>}
 */
export function seasonalYields({ seasonId = "", population = 0, surplus = 0, rules = [] } = {}) {
	return (rules ?? [])
		.filter(rule => rule.grants?.seasonalYield?.seasons?.includes(seasonId))
		.map(rule => {
			const y = rule.grants.seasonalYield;
			const lapsed = !!y.whileMet && !rule.requirementsMet;
			const lowPopulation = Number.isFinite(y.minPopulation) && population < y.minPopulation;
			const lowSurplus = Number(y.minSurplus) > 0 && surplus < y.minSurplus;
			const blocked = lapsed || lowPopulation || lowSurplus;
			let unmet = "";
			if (lapsed) unmet = "It is not active (its requirements are no longer met), so it generates nothing this season.";
			else if (lowPopulation) unmet = `Population is below ${y.minPopulation >= 0 ? "+" : ""}${y.minPopulation}, so it generates nothing this season.`;
			else if (lowSurplus) unmet = `The steading had less than ${y.minSurplus} Surplus when the season turned, so it generates nothing this season.`;
			// Floored at 0: a town at Population −1 generates nothing, and a negative yield would be
			// a Surplus the season quietly took away, which no improvement describes.
			const amount = (y.plusPopulation ? population : 0) + (Number(y.surplus) || 0);
			return {
				key: yieldStepKey(rule.slug),
				slug: rule.slug,
				label: rule.label,
				rule: yieldRuleLine(y),
				needsHit: !!y.needsHit,
				blocked,
				unmet,
				amount: blocked ? 0 : Math.max(0, Math.trunc(amount)),
			};
		});
}

/** The militia's once-per-season marker key. Same shape as the other season steps. */
export const MILITIA_SEASON_STEP = "militiaDrill";

/**
 * The Well-Trained Militia's trained tactics, as rows the window can offer for the losing.
 *
 * "Each summer, the militia must spend 1 Surplus and a week or so practicing or else lose its
 * training in 1 tactic." Which tactic is not the book's to say and not ours either, so the window
 * lists what the militia knows and the table picks.
 *
 * The tactics are the improvement's LAST requirement section — the one you tick once per tactic
 * drilled — and the index returned is the FLAT index into the stored `r` array, which is what
 * writes a requirement box. Derived from the definition rather than hard-coded, so a reworded
 * requirement moves the offsets and this moves with it; a test pins the shape it expects.
 *
 * @param {{sections?: Array<{items?: string[]}>}} def  the wellTrainedMilitia definition
 * @param {Array<boolean>} r                            its stored requirement state
 * @returns {Array<{index: number, label: string}>}  the tactics currently trained
 */
export function militiaTactics(def, r = []) {
	const sections = def?.sections ?? [];
	if (!sections.length) return [];
	const last = sections[sections.length - 1];
	const offset = improvementRequirementCount({ sections: sections.slice(0, -1) });
	return (last.items ?? [])
		.map((label, i) => ({ index: offset + i, label }))
		.filter(t => r[t.index] === true);
}

/**
 * Whether Additional Housing was built the way that costs the harvest.
 *
 * Its penalty is not a consequence of the improvement, it is the consequence of one of the two
 * ways it could be BUILT - "Building on parts of the fields, resulting in -1 Surplus generated
 * with each autumn's harvest" - so it is read off the requirement box that recorded which way the
 * steading went, the same as the militia's tactics above.
 *
 * Found by its text rather than by a bare index so a reordered section cannot silently point this
 * at the engineer instead; the test pins it against the real definition, which is what keeps the
 * wording it looks for honest. A reword that loses the match reads as "not on the fields", which
 * is the harmless direction: the harvest is simply not docked.
 *
 * @param {{sections?: Array<{items?: string[]}>}} def  the additionalHousing definition
 * @param {Array<boolean>} r                            its stored requirement state
 * @returns {boolean}
 */
export function builtOnTheFields(def, r = []) {
	const at = flatRequirementItems(def).findIndex(t => /parts of the fields/i.test(t));
	return at >= 0 && r[at] === true;
}
