// The Judge's Prophet background, through the real sheet and a stateful character (LiveCharacter), with
// the playbooks and moves as the pack ships them. "When you spend a few days communing with Aratis ...
// roll +WIS: on a 7+, Aratis reveals the course of action she would have you take; on a 10+, you also hold
// 2 Sanction." A move only the background gives, the way the Heavy's Sheriff gives Bark an Order.

import { afterEach, describe, it, expect, vi } from "vitest";
import { buildLiveCharacter, ownedMoveNames, sourceMovesFor, STANDARD_ARRAY } from "../../fakes/LiveCharacter.js";
import { loadPlaybookPackDocs } from "../../fakes/sourcePack.js";
import { stubConfirm } from "../../fakes/confirm.js";
import { createStonetopCharacterSheetClass } from "../../../module/actors/character/StonetopCharacterSheet.js";
import { holdSanctionOnHit, COMMUNE_WITH_ARATIS } from "../../../module/actors/character/roll-boosts.js";
import { settleTierEffects, recordTierEffects, reconcileTierEffects } from "../../../module/actors/character/tier-effects.js";
import { SYSTEM_ID } from "../../../module/system-id.js";

const PACK = new Map(loadPlaybookPackDocs().map(doc => [doc.system.slug, doc]));
const playbookDoc = slug => ({ ...structuredClone(PACK.get(slug)), uuid: `Compendium.test.${slug}` });
const judgeId = name => sourceMovesFor("The Judge").find(d => d.name === name)._id;
const itemNamed = (actor, name) => actor.items.find(i => i.name === name);

function sheetFor(char, actor) {
	actor.typedActor = char;
	const Base = class {
		constructor() { this._actor = actor; }
		get actor() { return this._actor; }
		get isEditable() { return true; }
		async getData() { return {}; }
		activateListeners() {}
		render = vi.fn();
	};
	const sheet = new (createStonetopCharacterSheetClass(Base))();
	sheet._openPossessionChoices = vi.fn();
	sheet._applyBackgroundNeighbors = vi.fn();
	return sheet;
}

function fresh({ flags = {} } = {}) {
	const made = buildLiveCharacter({ slug: "the-judge", name: "The Judge", seedStartingMoves: false, flags });
	return { ...made, sheet: sheetFor(made.char, made.actor) };
}

const JUDGE_RUN = (over = {}) => ({
	backgroundSlug: "prophet",
	stats:          STANDARD_ARRAY,
	moves:          [judgeId("Bear Witness"), judgeId("Well-Read")],
	lore:           { picks: {}, texts: {} },
	...over,
});

const onboard = (sheet, selections) => sheet._applyPlaybookSelections(playbookDoc("the-judge"), selections);
const choose  = (sheet, slug) => sheet._onBackgroundChange({ currentTarget: { value: slug } });

afterEach(() => { vi.restoreAllMocks(); });

describe("the Prophet's Commune with Aratis", () => {
	it("is a +WIS move with a 2-pip Sanction track that the background gives, not a pick", async () => {
		const { char, actor, sheet } = fresh();
		// No free picks: the harness's budget leaves out the starting-moves note (LiveCharacter.js), so the
		// only move that could count against it is the background's.
		await onboard(sheet, JUDGE_RUN({ moves: [] }));

		const commune = itemNamed(actor, COMMUNE_WITH_ARATIS);
		expect(commune.system.rollType).toBe("wis");
		expect(Object.keys(commune.system.moveResults)).toEqual(["success", "partial", "failure"]);
		expect(commune.system.moveResults.failure.value).toBe("The GM makes a move.");
		expect(commune.system.resource).toEqual({ max: 2, title: "Sanction" });
		const { movelist } = await char.buildSnapshot();
		expect(movelist.levelMovesShortfall).toBe(0);
		expect(movelist.levelMovesOverage).toBe(0);
	});

	it("goes when the Judge leaves the Prophet, and no other background gives it", async () => {
		const { actor, sheet } = fresh();
		await onboard(sheet, JUDGE_RUN());
		stubConfirm(true);

		await choose(sheet, "legacy");
		expect(ownedMoveNames(actor)).not.toContain(COMMUNE_WITH_ARATIS);

		const other = fresh();
		await onboard(other.sheet, JUDGE_RUN({ backgroundSlug: "missionary" }));
		expect(ownedMoveNames(other.actor)).not.toContain(COMMUNE_WITH_ARATIS);
	});

	it("is never a level-up pick for another Judge, not even a locked one", async () => {
		const { char } = buildLiveCharacter({ slug: "the-judge", name: "The Judge", flags: { "background.selected": "legacy" } });
		const data = await char.getLevelUpData();
		expect(data.availableMoves.map(m => m.name)).not.toContain(COMMUNE_WITH_ARATIS);
		expect(data.lockedMoves.map(m => m.name)).not.toContain(COMMUNE_WITH_ARATIS);
	});

	it("on a 10+ holds 2 Sanction (a full track), and on a 7-9 holds none", async () => {
		const { char, actor, sheet } = fresh();
		await onboard(sheet, JUDGE_RUN());
		const commune = itemNamed(actor, COMMUNE_WITH_ARATIS);
		const held = () => char.moveResources.getMoveResources()[COMMUNE_WITH_ARATIS] ?? 0;

		expect(await holdSanctionOnHit(actor, commune, "partial")).toBe(false);
		expect(held()).toBe(0);
		expect(await holdSanctionOnHit(actor, commune, "success")).toBe(true);
		expect(held()).toBe(2);
		// Already full: nothing to write.
		expect(await holdSanctionOnHit(actor, commune, "success")).toBe(false);
		// Another move's 10+ holds nothing.
		await char.moveResources.setUses(COMMUNE_WITH_ARATIS, 0);
		expect(await holdSanctionOnHit(actor, itemNamed(actor, "Well-Read"), "success")).toBe(false);
		expect(held()).toBe(0);
	});

	// The card's tier moved after the dice (a GM's Shift, a +1 on it): the Sanction follows it
	// (actors/character/tier-effects.js).
	it("fills when its 7-9 is lifted to a 10+, and gives back only what it filled when lowered", async () => {
		const { char, actor, sheet } = fresh();
		await onboard(sheet, JUDGE_RUN());
		const held = () => char.moveResources.getMoveResources()[COMMUNE_WITH_ARATIS] ?? 0;
		const flags = { [SYSTEM_ID]: { move: COMMUNE_WITH_ARATIS } };
		const message = {
			getFlag: (scope, key) => flags[scope]?.[key],
			setFlag: vi.fn(async (scope, key, value) => { flags[scope][key] = value; }),
		};

		await recordTierEffects(message, await settleTierEffects(actor, COMMUNE_WITH_ARATIS, "partial"));
		expect(held()).toBe(0);
		await reconcileTierEffects(message, 10, { actor });
		expect(held()).toBe(2);
		await reconcileTierEffects(message, 9, { actor });
		expect(held()).toBe(0);

		// Holding 1 before a 10+ that is then lowered: the 1 stays.
		await char.moveResources.setUses(COMMUNE_WITH_ARATIS, 1);
		flags[SYSTEM_ID] = { move: COMMUNE_WITH_ARATIS };
		await recordTierEffects(message, await settleTierEffects(actor, COMMUNE_WITH_ARATIS, "success"));
		expect(held()).toBe(2);
		await reconcileTierEffects(message, 8, { actor });
		expect(held()).toBe(1);
	});
});
