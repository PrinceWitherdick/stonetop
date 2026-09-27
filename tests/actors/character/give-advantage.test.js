// Seeker audit A13 (the user's ruling of 2026-09-26): "you or an ally gain advantage on your next roll"
// (Countermeasures, Everything Burns 10+, Work With What You've Got's opportunity, Sage Advice) is a
// "Give advantage to..." button that holds advantage on the chosen character's next roll through the
// held-advantage store, named for the move, once per card, pressed only by the move's owner or the GM.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Window } from "happy-dom";
import {
	GIVE_ADVANTAGE_MOVES, giveAdvantageRollOptions, giveAdvantageCardHtml, givenSource, advantageRecipients,
} from "../../../module/actors/character/give-advantage.js";
import {
	giveAdvantage, handleGiveAdvantageQuery, offerAdvantage, wireGiveAdvantage, GIVE_ADVANTAGE_QUERY, GIVEN_FLAG, GIVING_FLAG,
} from "../../../module/actors/character/give-advantage-flow.js";
import { moveRollOptions } from "../../../module/actors/character/move-roll-options.js";
import { buildLiveCharacter, makeLiveItem, sourceMovesFor } from "../../fakes/LiveCharacter.js";
import { readRepo } from "../../fakes/css.js";

const SCOPE = "stonetop-pwd";

function pc({ id, name = id, moves = [], unlearned = [], owner = true } = {}) {
	const actor = {
		id, uuid: `Actor.${id}`, name, type: "character", isOwner: owner,
		items: moves.map(move => ({ type: "move", name: move, flags: unlearned.includes(move) ? { [SCOPE]: { learned: false } } : {} })),
		testUserPermission: vi.fn(user => !!user?.isGM || user?.id === `u-${id}`),
	};
	actor.typedActor = { holdAdvantage: vi.fn(async () => {}) };
	return actor;
}

function message({ flags = {} } = {}) {
	const data = { [SCOPE]: { ...flags } };
	return {
		id: "msg1", flags: data,
		getFlag: (scope, key) => data[scope]?.[key],
		setFlag: vi.fn(async (scope, key, value) => { (data[scope] ??= {})[key] = value; }),
		unsetFlag: vi.fn(async (scope, key) => { delete data[scope]?.[key]; }),
	};
}

const player = id => ({ id: `u-${id}`, isGM: false });
const GM = { id: "u-gm", isGM: true };

let saved;
beforeEach(() => { saved = { user: globalThis.game.user, users: globalThis.game.users }; });
afterEach(() => { globalThis.game.user = saved.user; globalThis.game.users = saved.users; });

describe("where the button is", () => {
	it("is on Everything Burns' 10+ only, and on Work With What You've Got's 7+", () => {
		const seeker = pc({ id: "s", moves: ["Everything Burns", "Work With What You've Got"] });
		expect(Object.keys(moveRollOptions("Everything Burns", seeker).tierActions)).toEqual(["success"]);
		expect(Object.keys(moveRollOptions("Work With What You've Got", seeker).tierActions)).toEqual(["success", "partial"]);
		expect(moveRollOptions("Everything Burns", seeker).tierActions.success).toContain('data-move="Everything Burns"');
	});

	it("is not there for a move not held learned", () => {
		expect(giveAdvantageRollOptions("Everything Burns")(pc({ id: "s", moves: ["Everything Burns"], unlearned: ["Everything Burns"] }))).toBeNull();
		expect(moveRollOptions("Everything Burns", pc({ id: "s" }))).toBeNull();
	});

	it("is on the posted card of Countermeasures and Sage Advice, and of no rolling move", () => {
		const seeker = pc({ id: "s", moves: ["Countermeasures", "Sage Advice", "Everything Burns"] });
		expect(giveAdvantageCardHtml(seeker, "Countermeasures")).toContain("Give advantage to...");
		expect(giveAdvantageCardHtml(seeker, "Sage Advice")).toContain("Give advantage to another PC...");
		expect(giveAdvantageCardHtml(seeker, "Everything Burns")).toBe("");
		expect(giveAdvantageCardHtml(pc({ id: "x" }), "Countermeasures")).toBe("");
	});

	it("is put on both of the sheet's description-only posts (the Moves tab and the hotbar)", () => {
		const sheet = readRepo("module/actors/character/StonetopCharacterSheet.js");
		expect(sheet.match(/giveAdvantageCardHtml\(this\.actor, /g)).toHaveLength(2);
		const main = readRepo("stonetop.js");
		expect(main).toContain("wireGiveAdvantage(message, html);");
		expect(main).toContain("CONFIG.queries[GIVE_ADVANTAGE_QUERY]");
	});
});

describe("who can be given it, and what it is called", () => {
	it("is the giver or another PC, except for Sage Advice (another PC only)", () => {
		const s = pc({ id: "s" });
		const b = pc({ id: "b" });
		expect(advantageRecipients(s, "Countermeasures", [s, b]).map(a => a.id)).toEqual(["s", "b"]);
		expect(advantageRecipients(s, "Sage Advice", [s, b]).map(a => a.id)).toEqual(["b"]);
		expect(GIVE_ADVANTAGE_MOVES["Sage Advice"].othersOnly).toBe(true);
	});

	it("names the move, and whose it was when given to someone else", () => {
		const s = pc({ id: "s", name: "Maelis" });
		expect(givenSource("Countermeasures", s, s)).toBe("Countermeasures");
		expect(givenSource("Countermeasures", s, pc({ id: "b" }))).toBe("Maelis's Countermeasures");
	});
});

describe("giving it", () => {
	it("holds advantage on a character this client owns", async () => {
		const s = pc({ id: "s", name: "Maelis" });
		const b = pc({ id: "b" });
		expect(await giveAdvantage(s, b, "Work With What You've Got")).toBe(true);
		expect(b.typedActor.holdAdvantage).toHaveBeenCalledWith("Maelis's Work With What You've Got");
		expect(await giveAdvantage(s, s, "Sage Advice")).toBe(false);
	});

	it("asks the GM's client for a character it does not own", async () => {
		const s = pc({ id: "s" });
		const b = pc({ id: "b", owner: false });
		const gm = { query: vi.fn(async () => true) };
		expect(await giveAdvantage(s, b, "Sage Advice", { gm, userId: "u-s" })).toBe(true);
		expect(gm.query).toHaveBeenCalledWith(GIVE_ADVANTAGE_QUERY,
			{ giverUuid: "Actor.s", targetUuid: "Actor.b", moveName: "Sage Advice", userId: "u-s" }, { timeout: 10000 });
		expect(b.typedActor.holdAdvantage).not.toHaveBeenCalled();
		expect(await giveAdvantage(s, b, "Sage Advice", { gm: null })).toBe(false);
	});

	it("the GM's side writes it for the giver's player, with the move learned, and for nobody else", async () => {
		globalThis.game.user = GM;
		globalThis.game.users = { activeGM: GM, get: id => [player("s"), player("b")].find(u => u.id === id) ?? null };
		const s = pc({ id: "s", name: "Maelis", moves: ["Countermeasures"] });
		const b = pc({ id: "b", owner: false });
		const ask = (giver, userId, moveName = "Countermeasures") => handleGiveAdvantageQuery(
			{ giverUuid: giver.uuid, targetUuid: b.uuid, moveName, userId }, {},
			{ resolve: uuid => [giver, b].find(a => a.uuid === uuid) ?? null });
		expect(await ask(s, "u-b")).toBe(false);
		expect(await ask(pc({ id: "s", moves: ["Countermeasures"], unlearned: ["Countermeasures"] }), "u-s")).toBe(false);
		expect(await ask(s, "u-s", "Hack and Slash")).toBe(false);
		expect(b.typedActor.holdAdvantage).not.toHaveBeenCalled();
		expect(await ask(s, "u-s")).toBe(true);
		expect(b.typedActor.holdAdvantage).toHaveBeenCalledWith("Maelis's Countermeasures");
	});

	it("asks who, gives it, and writes it on the card", async () => {
		const s = pc({ id: "s" });
		const b = pc({ id: "b" });
		const card = message();
		const pick = vi.fn(async () => "b");
		expect(await offerAdvantage(card, s, "Countermeasures", { pick, party: () => [b] })).toBe(true);
		expect(pick.mock.calls[0][0].options.map(o => o.id)).toEqual(["s", "b"]);
		expect(b.typedActor.holdAdvantage).toHaveBeenCalledWith("s's Countermeasures");
		expect(card.getFlag(SCOPE, GIVEN_FLAG)).toEqual({ name: "b", move: "Countermeasures" });
	});

	it("gives nothing when another client's press took the card while this one chose", async () => {
		const s = pc({ id: "s" });
		const b = pc({ id: "b" });
		const card = message();
		const give = vi.fn(async () => true);
		expect(await offerAdvantage(card, s, "Countermeasures", { pick: async () => "b", party: () => [b], give, stillMine: () => false })).toBe(true);
		expect(give).not.toHaveBeenCalled();
		expect(card.getFlag(SCOPE, GIVEN_FLAG)).toBeUndefined();
	});

	it("gives nothing when the picker is closed", async () => {
		const s = pc({ id: "s" });
		const card = message();
		expect(await offerAdvantage(card, s, "Countermeasures", { pick: async () => null, party: () => [] })).toBe(false);
		expect(s.typedActor.holdAdvantage).not.toHaveBeenCalled();
		expect(card.setFlag).not.toHaveBeenCalled();
	});

	it("lands in the real held-advantage store, spent by the next roll", async () => {
		const everythingBurns = sourceMovesFor("The Seeker").find(d => d.name === "Everything Burns");
		const { char, actor } = buildLiveCharacter({ slug: "the-seeker", name: "The Seeker",
			items: [makeLiveItem({ name: "Everything Burns", type: "move", system: structuredClone(everythingBurns.system) })] });
		actor.id = "s"; actor.uuid = "Actor.s"; actor.isOwner = true; actor.typedActor = char;
		expect(await giveAdvantage(actor, actor, "Everything Burns")).toBe(true);
		expect(char.heldAdvantage()).toMatchObject({ source: "Everything Burns" });
	});
});

describe("the card's button", () => {
	function rendered(flags = {}) {
		const root = new Window().document.createElement("div");
		root.innerHTML = giveAdvantageCardHtml(pc({ id: "s", moves: ["Countermeasures"] }), "Countermeasures");
		return { root, card: message({ flags }), button: () => root.querySelector(".stonetop-give-advantage") };
	}

	it("is taken off for anyone who cannot write the card and the giver", () => {
		const { root, card, button } = rendered();
		wireGiveAdvantage(card, root, { giver: pc({ id: "s" }), usable: false });
		expect(button()).toBeNull();
	});

	it("is live for the giver's player, and says who has it once given", () => {
		const live = rendered();
		wireGiveAdvantage(live.card, live.root, { giver: pc({ id: "s" }), usable: true });
		expect(live.button().disabled).toBe(false);
		const done = rendered({ [GIVEN_FLAG]: { name: "Bram", move: "Countermeasures" } });
		wireGiveAdvantage(done.card, done.root, { giver: pc({ id: "s" }), usable: true });
		expect(done.button()).toBeNull();
		expect(done.root.querySelector(".stonetop-give-advantage-readout").textContent).toContain("Bram has advantage");
	});

	it("latches the card before the picker opens, and gives the card back when the picker is closed", async () => {
		const { root, card, button } = rendered();
		let latchedAtPick = null;
		const pick = vi.fn(async () => { latchedAtPick = card.getFlag(SCOPE, GIVING_FLAG); return null; });
		wireGiveAdvantage(card, root, { giver: pc({ id: "s" }), usable: true, userId: "u-s", pick, party: () => [pc({ id: "b" })] });
		button().click();
		await vi.waitFor(() => expect(pick).toHaveBeenCalled());
		await vi.waitFor(() => expect(card.unsetFlag).toHaveBeenCalled());
		expect(latchedAtPick).toBe("u-s");
		expect(card.getFlag(SCOPE, GIVING_FLAG)).toBeUndefined();
		expect(button().disabled).toBe(false);
	});

	it("is disabled while another user is choosing, and live for the user whose latch it is", () => {
		const other = rendered({ [GIVING_FLAG]: "u-gm" });
		wireGiveAdvantage(other.card, other.root, { giver: pc({ id: "s" }), usable: true, userId: "u-s" });
		expect(other.button().disabled).toBe(true);
		const mine = rendered({ [GIVING_FLAG]: "u-s" });
		wireGiveAdvantage(mine.card, mine.root, { giver: pc({ id: "s" }), usable: true, userId: "u-s" });
		expect(mine.button().disabled).toBe(false);
	});
});
