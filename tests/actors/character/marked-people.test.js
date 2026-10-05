import { describe, it, expect } from "vitest";
import {
	createRoster, tokenKey, trailingActorId, actorMatchKeys, normalizeName, showStandingList,
} from "../../../module/actors/character/marked-people.js";

// The shared algebra behind Condemn, Binding Arbitration and the Blessed's marks. Each feature's own
// tests drive it through that feature's names; these pin the options the three differ by.

const ids = () => { let n = 0; return () => `r${n++}`; };

describe("the small helpers", () => {
	it("folds a name's case and spacing", () => {
		expect(normalizeName("  The  CLAWS ")).toBe("the claws");
		expect(normalizeName(null)).toBe("");
	});

	it("reads the actor id at the end of a uuid", () => {
		expect(trailingActorId("Actor.a")).toBe("a");
		expect(trailingActorId("Scene.s.Token.t.Actor.a")).toBe("a");
	});

	it("keys a token, reached as the token or as its actor, and nothing else", () => {
		expect(tokenKey("Scene.s.Token.t.Actor.a")).toBe("token:Scene.s.Token.t");
		expect(tokenKey("Scene.s.Token.t")).toBe("token:Scene.s.Token.t");
		expect(tokenKey("Actor.a")).toBe("");
		expect(tokenKey("")).toBe("");
		expect(tokenKey(undefined)).toBe("");
	});

	it("matches an actor by its trailing id and its own id", () => {
		expect([...actorMatchKeys({ uuid: "Scene.s.Token.t.Actor.a", id: "a" })]).toEqual(["a"]);
		expect(actorMatchKeys(null).size).toBe(0);
	});

	it("shows a standing list to an owner, or to anyone still holding rows", () => {
		expect(showStandingList({ owns: true, count: 0 })).toBe(true);
		expect(showStandingList({ owns: false, count: 2 })).toBe(true);
		expect(showStandingList({ owns: false, count: "x" })).toBe(false);
	});
});

describe("the same person, reached two ways", () => {
	// The Blessed's fold: a token's row and the sidebar's row are one person.
	const folding = createRoster({ prefix: "mark" });

	it("refuses a token row for somebody already listed from the sidebar, and the reverse", () => {
		const fromSidebar = folding.add([], { name: "Brennan", uuid: "Actor.x" }, ids()).entries;
		expect(folding.add(fromSidebar, { name: "Brennan", uuid: "Scene.s.Token.t.Actor.x" }).added).toBeNull();
		const fromToken = folding.add([], { name: "Brennan", uuid: "Scene.s.Token.t.Actor.x" }, ids()).entries;
		expect(folding.add(fromToken, { name: "Brennan", uuid: "Actor.x" }).added).toBeNull();
	});

	it("gives a name-only row the link when the same name comes back with an actor", () => {
		const named = folding.add([], { name: "Brennan", note: "at the ford" }, ids()).entries;
		const { entries, added, changed } = folding.add(named, { name: "Brennan", uuid: "Actor.x" }, ids());
		expect(added).toBeNull();
		expect(changed).toEqual({ id: "r0", name: "Brennan", uuid: "Actor.x", note: "at the ford" });
		expect(entries).toEqual([changed]);
	});

	it("refuses a name-only row spelling somebody already listed by link", () => {
		const linked = folding.add([], { name: "Brennan", uuid: "Actor.x" }, ids()).entries;
		const { entries, added } = folding.add(linked, { name: " brennan " }, ids());
		expect(added).toBeNull();
		expect(entries).toHaveLength(1);
	});

	it("still lists two different actors who share a name", () => {
		const one = folding.add([], { name: "Guard", uuid: "Actor.g1" }, ids()).entries;
		expect(folding.add(one, { name: "Guard", uuid: "Actor.g2" }, ids()).entries).toHaveLength(2);
	});

	// Scoped rosters compare within the scope only, so the link goes to the row of the same kind.
	it("links and refuses only within a row's scope", () => {
		const scoped = createRoster({ prefix: "mark", fields: { kind: raw => String(raw ?? "") }, scope: e => e.kind });
		const named = scoped.add([], { name: "Aeronwen", kind: "barkskin" }, ids()).entries;
		const charm = scoped.add(named, { name: "Aeronwen", uuid: "Actor.a", kind: "charm" }, ids());
		expect(charm.added).toMatchObject({ kind: "charm", uuid: "Actor.a" });
		expect(charm.entries[0].uuid).toBe("");
		const bark = scoped.add(charm.entries, { name: "Aeronwen", uuid: "Actor.a", kind: "barkskin" }, ids());
		expect(bark.changed).toMatchObject({ id: "r0", kind: "barkskin", uuid: "Actor.a" });
		expect(bark.entries).toHaveLength(2);
	});
});

describe("a roster that keeps every row", () => {
	const everyRow = createRoster({ prefix: "oath", dedupe: false });

	it("adds the same person again as a row of its own, and never links over an older one", () => {
		const one = everyRow.add([], { name: "Gethin" }, ids()).entries;
		const two = everyRow.add(one, { name: "Gethin", uuid: "Actor.g" }, ids());
		expect(two.added).not.toBeNull();
		expect(two.entries.map(e => e.uuid)).toEqual(["", "Actor.g"]);
	});

	it("still refuses a nameless row", () => {
		expect(everyRow.add([], { name: " " }).added).toBeNull();
	});
});

describe("a token-scoped roster", () => {
	const scoped = createRoster({ prefix: "condemned", tokenScoped: true });
	const base   = { name: "Bandit", id: "bandit", uuid: "Actor.bandit" };
	const tokenA = { name: "Bandit", id: "bandit", uuid: "Scene.s.Token.ta.Actor.bandit" };
	const tokenB = { name: "Bandit", id: "bandit", uuid: "Scene.s.Token.tb.Actor.bandit" };
	const holder = rows => ({ name: "Aldric", rows });
	const read = h => h.rows;

	it("puts a row laid through one token on that token alone", () => {
		const judge = holder([{ name: "Bandit", uuid: tokenA.uuid }]);
		expect(scoped.holdersOf(tokenA, [judge], read)).toEqual([judge]);
		expect(scoped.holdersOf(tokenB, [judge], read)).toEqual([]);
		expect(scoped.holdersOf(base, [judge], read)).toEqual([]);
	});

	it("puts a row laid from the sidebar on the actor and every token of it", () => {
		const judge = holder([{ name: "Bandit", uuid: base.uuid }]);
		for (const who of [base, tokenA, tokenB]) expect(scoped.holdersOf(who, [judge], read)).toEqual([judge]);
	});

	it("lists two different tokens of one actor as two people", () => {
		const one = scoped.add([], { name: "Bandit", uuid: tokenA.uuid }, ids()).entries;
		expect(scoped.add(one, { name: "Bandit", uuid: tokenB.uuid }, ids()).added).not.toBeNull();
		expect(scoped.add(one, { name: "Bandit", uuid: tokenA.uuid }, ids()).added).toBeNull();
	});

	it("leaves a folding roster folding", () => {
		const folding = createRoster({ prefix: "mark" });
		const blessed = holder([{ name: "Bandit", uuid: tokenA.uuid }]);
		expect(folding.holdersOf(tokenB, [blessed], read)).toEqual([blessed]);
		expect(folding.holdersOf(base, [blessed], read)).toEqual([blessed]);
	});
});

describe("whether a row names somebody, for a mechanical state", () => {
	const roster = createRoster({ prefix: "oath", dedupe: false, tokenScoped: true });

	it("matches a linked row on its document only, never on the spelling", () => {
		const index = roster.buildIndex([{ name: "Guard", uuid: "Actor.g1" }]);
		expect(roster.isHeldOnIndex(index, { name: "Guard", id: "g1", uuid: "Actor.g1" })).toBe(true);
		expect(roster.isHeldOnIndex(index, { name: "Guard", id: "g2", uuid: "Actor.g2" })).toBe(false);
		// The looser suggestions test still hides the name, which is what it is for.
		expect(roster.isOnIndex(index, { name: "Guard", id: "g2", uuid: "Actor.g2" })).toBe(true);
	});

	it("matches a name-only row by name", () => {
		const index = roster.buildIndex([{ name: "the Claws" }]);
		expect(roster.isHeldOnIndex(index, { name: "The Claws", id: "c", uuid: "Actor.c" })).toBe(true);
		expect(roster.isHeldOnIndex(index, { name: "Brennan", id: "b", uuid: "Actor.b" })).toBe(false);
	});
});
