import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { oathbreakerAgainst, foeAdvantage, HERO_MOVES } from "../../module/fight/hero-moves.js";
import { BINDING_ARBITRATION, OATHS_FLAG } from "../../module/actors/character/oaths.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// Binding Arbitration: "If they have broken their word, you gain advantage on all rolls against them
// until they admit their wrongdoing." The oath's broken tick is the whole condition, so an attack at an
// oathbreaker is simply at advantage, named on the card.

function judge(oaths, moves = [BINDING_ARBITRATION]) {
	const flags = { [SYSTEM_ID]: { [OATHS_FLAG]: oaths } };
	return {
		id: "hafgan", name: "Hafgan", type: "character",
		items: moves.map(name => ({ type: "move", name, flags: {} })),
		flags,
		getFlag: (scope, key) => flags[scope]?.[key],
	};
}

let saved;
beforeEach(() => {
	saved = globalThis.fromUuidSync;
	// A token for Brennan whose world actor is "Brennan the Claw", and one for a stranger.
	const brennan = { documentName: "Actor", id: "brennanActor", uuid: "Actor.brennanActor", name: "Brennan the Claw" };
	const docs = new Map([
		["Scene.s.Token.tb", { documentName: "Token", uuid: "Scene.s.Token.tb", name: "Brennan", actor: brennan, actorLink: true }],
		["Scene.s.Token.tx", { documentName: "Token", uuid: "Scene.s.Token.tx", name: "Stranger", actor: { documentName: "Actor", id: "x", uuid: "Actor.x", name: "Stranger" }, actorLink: true }],
	]);
	globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
});
afterEach(() => { globalThis.fromUuidSync = saved; });

const brennanToken = { uuid: "Scene.s.Token.tb", name: "Brennan", actorId: "brennanActor" };
const stranger = { uuid: "Scene.s.Token.tx", name: "Stranger", actorId: "x" };

describe("an oathbreaker", () => {
	it("gives the Judge advantage against someone whose oath is ticked broken, matched by their actor", () => {
		const hafgan = judge([{ id: "o1", name: "Brennan the Claw", uuid: "Actor.brennanActor", broken: true }]);
		expect(oathbreakerAgainst(hafgan, [brennanToken])).toBe(BINDING_ARBITRATION);
		expect(foeAdvantage(hafgan, [brennanToken])).toBe(BINDING_ARBITRATION);
	});

	it("matches a name-only row by name", () => {
		const hafgan = judge([{ id: "o1", name: "brennan", broken: true }]);
		expect(oathbreakerAgainst(hafgan, [brennanToken])).toBe(BINDING_ARBITRATION);
	});

	it("gives nothing for an oath kept, or once the breach is admitted and the tick is lifted", () => {
		expect(oathbreakerAgainst(judge([{ id: "o1", name: "Brennan", broken: false }]), [brennanToken])).toBeNull();
		expect(oathbreakerAgainst(judge([]), [brennanToken])).toBeNull();
	});

	it("needs every target to be an oathbreaker, and the move switched on", () => {
		const oaths = [{ id: "o1", name: "Brennan", broken: true }];
		expect(oathbreakerAgainst(judge(oaths), [brennanToken, stranger])).toBeNull();
		expect(oathbreakerAgainst(judge(oaths, []), [brennanToken])).toBeNull();
		expect(oathbreakerAgainst(judge(oaths), [])).toBeNull();
	});

	it("gives way to a grudge the move itself names first (Relentless on a Clash)", () => {
		const hafgan = judge([{ id: "o1", name: "Brennan", broken: true }], [BINDING_ARBITRATION, HERO_MOVES.RELENTLESS]);
		hafgan.flags[SYSTEM_ID].clashedWith = [{ key: "Actor.brennanActor", name: "Brennan", since: 0 }];
		expect(foeAdvantage(hafgan, [brennanToken], { clash: true })).toBe(HERO_MOVES.RELENTLESS);
	});
});

// Who a row binds, for the advantage. A row linked to an actor binds that actor (and, laid from the
// sidebar, every token of it); laid through one unlinked token it binds that token alone; only a
// name-only row is matched by spelling. These targets resolve to nothing, so only the token's own
// name, actor id and uuid are asked.
describe("who an oath binds", () => {
	const guardToken = (token, actorId) => ({ uuid: `Scene.s.Token.${token}`, name: "Guard", actorId });

	it("does not bind a second actor who merely shares a linked row's name", () => {
		const hafgan = judge([{ id: "o1", name: "Guard", uuid: "Actor.g1", broken: true }]);
		expect(oathbreakerAgainst(hafgan, [guardToken("t1", "g1")])).toBe(BINDING_ARBITRATION);
		expect(oathbreakerAgainst(hafgan, [guardToken("t2", "g2")])).toBeNull();
	});

	it("binds every token of an actor sworn from the sidebar", () => {
		const hafgan = judge([{ id: "o1", name: "Bandit", uuid: "Actor.bandit", broken: true }]);
		expect(oathbreakerAgainst(hafgan, [guardToken("ta", "bandit")])).toBe(BINDING_ARBITRATION);
		expect(oathbreakerAgainst(hafgan, [guardToken("tb", "bandit")])).toBe(BINDING_ARBITRATION);
	});

	it("binds only the token an oath was sworn through", () => {
		const hafgan = judge([{ id: "o1", name: "Bandit", uuid: "Scene.s.Token.ta.Actor.bandit", broken: true }]);
		expect(oathbreakerAgainst(hafgan, [guardToken("ta", "bandit")])).toBe(BINDING_ARBITRATION);
		expect(oathbreakerAgainst(hafgan, [guardToken("tb", "bandit")])).toBeNull();
	});

	it("needs only one of a person's oaths broken", () => {
		const hafgan = judge([
			{ id: "o1", name: "Guard", uuid: "Actor.g1", note: "kept", broken: false },
			{ id: "o2", name: "Guard", uuid: "Actor.g1", note: "broken", broken: true },
		]);
		expect(oathbreakerAgainst(hafgan, [guardToken("t1", "g1")])).toBe(BINDING_ARBITRATION);
	});
});
