import { describe, it, expect } from "vitest";
import { planPortraitRepoints } from "../../module/book2-art/repoint-portraits.js";

// Moving art a GM already chose onto the square face, once the squares are on disk. The pure
// planning half; the update half needs Foundry.

const ROOT = "stonetop-book-art";
const full = `${ROOT}/assets/people/b1-p135-x526.webp`;
const square = `${ROOT}/assets/people/b1-p135-x526-q000-000-1000-720.webp`;
const other = `${ROOT}/assets/people/b1-p156-x594.webp`;
const otherSquare = `${ROOT}/assets/people/b1-p156-x594-q100-000-900-500.webp`;

// Stands in for the manifest+on-disk join: only these two illustrations have a square.
const squareFor = (src) => ({ [full]: square, [other]: otherSquare }[src] ?? null);

// Type matters: only an NPC's own portrait is re-pointed. Default to that so each test says only
// what it is about, and name the type explicitly where the point IS the type.
const actor = (props) => ({ name: "someone", type: "npc", ...props });

describe("planning the re-point", () => {
	it("moves an actor portrait onto its square", () => {
		const plan = planPortraitRepoints([actor({ img: full })], squareFor);
		expect(plan).toHaveLength(1);
		expect(plan[0].updates).toEqual({ img: square });
	});

	it("takes the token along only when it was following the portrait", () => {
		const following = actor({ img: full, prototypeToken: { texture: { src: full } } });
		expect(planPortraitRepoints([following], squareFor)[0].updates)
			.toEqual({ img: square, "prototypeToken.texture.src": square });

		// Deliberately different token art is a choice, and a portrait change is no reason to
		// overrule it.
		const custom = actor({ img: full, prototypeToken: { texture: { src: "worlds/mine/token.webp" } } });
		expect(planPortraitRepoints([custom], squareFor)[0].updates).toEqual({ img: square });
	});

	it("finds follower portraits nested in flags, whatever the path", () => {
		// A card's art lives at flags.stonetop-pwd.<shape>.img, and the shape differs per
		// follower type — walking for the key is what covers a type added later. On a PLAYER
		// CHARACTER, which is where follower cards live: the flag walk is deliberately not
		// gated by type even though the actor's own portrait is.
		const pc = actor({
			type: "character",
			img: "systems/stonetop-pwd/assets/playbooks/blessed.webp",
			flags: { "stonetop-pwd": { followers: { "npc:enfys": { img: full, name: "Enfys" } } } },
		});
		const plan = planPortraitRepoints([pc], squareFor);
		expect(plan[0].updates).toEqual({ "flags.stonetop-pwd.followers.npc:enfys.img": square });
	});

	it("leaves a player character's own portrait alone", () => {
		// The character sheet gives the portrait a whole panel and has no fallback from a square
		// back to the illustration, so bumping a PC would strand it low-resolution. The follower
		// card on the same actor is still re-pointed — that IS a small round surface.
		const pc = actor({
			type: "character",
			img: full,
			prototypeToken: { texture: { src: full } },
			flags: { "stonetop-pwd": { customFollowers: { enfys: { img: other } } } },
		});
		const plan = planPortraitRepoints([pc], squareFor);
		expect(plan[0].updates).toEqual({ "flags.stonetop-pwd.customFollowers.enfys.img": otherSquare });
	});

	it("leaves a monster and the steading actor alone", () => {
		const pool = [actor({ type: "monster", img: full }), actor({ type: "stonetop", img: full })];
		expect(planPortraitRepoints(pool, squareFor)).toHaveLength(0);
	});

	it("re-points several holdings on one actor at once", () => {
		const npc = actor({
			img: full,
			flags: { "stonetop-pwd": { crew: { a: { img: other } }, hirelings: { b: { img: full } } } },
		});
		const plan = planPortraitRepoints([npc], squareFor);
		expect(plan[0].updates).toEqual({
			img: square,
			"flags.stonetop-pwd.crew.a.img": otherSquare,
			"flags.stonetop-pwd.hirelings.b.img": square,
		});
		expect(plan[0].changes).toHaveLength(3);
	});

	it("is idempotent: a portrait already on its square is not planned again", () => {
		// The whole reason this needs no version flag. After the bump the path no longer
		// resolves as an illustration, so a second run matches nothing.
		expect(planPortraitRepoints([actor({ img: square })], squareFor)).toHaveLength(0);
	});

	it("leaves alone anything that is not People art", () => {
		const pool = [
			actor({ img: "icons/svg/mystery-man.svg" }),
			actor({ img: "worlds/mine/art/my-own-villager.webp" }),
			actor({ img: `${ROOT}/assets/bestiary/kleztigr.webp` }),
			actor({}),
			actor({ img: "" }),
		];
		expect(planPortraitRepoints(pool, squareFor)).toHaveLength(0);
	});

	it("leaves a portrait whose square is not on disk yet", () => {
		// squareFor is the manifest joined against what was actually extracted, so a world that
		// has not run the rebuild plans nothing rather than pointing at a missing file.
		const notCut = `${ROOT}/assets/people/b1-p166-x630.webp`;
		expect(planPortraitRepoints([actor({ img: notCut })], squareFor)).toHaveLength(0);
	});

	it("ignores other modules' flags", () => {
		const pc = actor({ flags: { "some-module": { thing: { img: full } } } });
		expect(planPortraitRepoints([pc], squareFor)).toHaveLength(0);
	});

	it("survives hostile flag data", () => {
		// Flags are arbitrary: other modules write here, and a cycle or a silly depth must not
		// be able to hang the pass.
		const cyclic = { img: full };
		cyclic.self = cyclic;
		const deep = { a: { b: { c: { d: { e: { f: { g: { img: full } } } } } } } };
		const pool = [
			actor({ flags: { "stonetop-pwd": cyclic } }),
			actor({ flags: { "stonetop-pwd": deep } }),
			actor({ flags: { "stonetop-pwd": { list: [{ img: full }] } } }),
			actor({ flags: { "stonetop-pwd": { thing: { img: 42 } } } }),
			actor({ flags: null }),
		];
		expect(() => planPortraitRepoints(pool, squareFor)).not.toThrow();
		// The cyclic one still finds its own img; the over-deep one is cut off by the limit.
		const plan = planPortraitRepoints(pool, squareFor);
		expect(plan).toHaveLength(1);
		expect(plan[0].updates).toEqual({ "flags.stonetop-pwd.img": square });
	});

	it("handles an empty pool", () => {
		expect(planPortraitRepoints([], squareFor)).toEqual([]);
		expect(planPortraitRepoints(null, squareFor)).toEqual([]);
	});
});
