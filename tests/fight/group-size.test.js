import { describe, it, expect, vi } from "vitest";
import { askGroupSize, groupSizeQuestion, groupSizeQuestions, groupSizeWindow, numberedNames, spotsAround, SCALE_FIELD } from "../../module/fight/group-size.js";
import { GRID } from "../fakes/fight.js";

// How many of a monster that comes in numbers join a fight.

const sq = (col, row) => ({ x: col * GRID, y: row * GRID, w: GRID, h: GRID });

describe("groupSizeQuestion", () => {
	it("offers a group 2 to 5 and a horde 6 to 12, with the stat block's count as the usual", () => {
		expect(groupSizeQuestion({ organization: "group", count: 3 })).toEqual({ organization: "group", sizes: [2, 3, 4, 5], usual: 3 });
		expect(groupSizeQuestion({ organization: "horde", count: 6 })).toEqual({ organization: "horde", sizes: [6, 8, 10, 12], usual: 6 });
	});

	it("adds a stat block's own count when the usual sizes leave it out", () => {
		expect(groupSizeQuestion({ organization: "horde", count: 20 })).toEqual({ organization: "horde", sizes: [6, 8, 10, 12, 20], usual: 20 });
	});

	it("takes the smallest size as the usual when no count was recorded", () => {
		expect(groupSizeQuestion({ organization: "Horde", count: 0 }).usual).toBe(6);
	});

	it("asks nothing about a solitary monster, one whose stat block says 1, or one fought as a single group token", () => {
		expect(groupSizeQuestion({ organization: "solitary", count: 1 })).toBeNull();
		expect(groupSizeQuestion({ organization: "", count: 1 })).toBeNull();
		expect(groupSizeQuestion({ organization: "group", count: 1 })).toBeNull();
		expect(groupSizeQuestion({ organization: "horde", count: 6, fightAsGroup: true })).toBeNull();
	});
});

describe("groupSizeQuestions", () => {
	const info = {
		"token:tCrin": { kind: "Actor.crinwin", organization: "horde", count: 6 },
		"actor:Actor.crinwin": { kind: "Actor.crinwin", organization: "horde", count: 6 },
		"actor:Actor.bandit": { kind: "Actor.bandit", organization: "group", count: 3 },
		"actor:Actor.wolf": { kind: "Actor.wolf", organization: "group", count: 3 },
		"token:tWolf": { kind: "Actor.wolf", organization: "group", count: 3 },
	};
	const infoFor = pick => info[pick.id] ?? null;

	it("asks once per monster, in the order they were picked, about the first pick of each", () => {
		const questions = groupSizeQuestions([
			{ id: "token:tBram", name: "Bram" },
			{ id: "actor:Actor.bandit", name: "Bandit" },
			{ id: "token:tCrin", name: "Crinwin" },
		], infoFor);
		expect(questions.map(q => [q.pickId, q.name, q.usual])).toEqual([["actor:Actor.bandit", "Bandit", 3], ["token:tCrin", "Crinwin", 6]]);
	});

	it("leaves a monster alone when the GM already ticked more than one of it, token or not", () => {
		const questions = groupSizeQuestions([
			{ id: "actor:Actor.wolf", name: "Wolf" },
			{ id: "token:tWolf", name: "Wolf" },
		], infoFor);
		expect(questions).toEqual([]);
	});
});

describe("spotsAround", () => {
	it("fills the ring touching the token first, nearest squares before corners", () => {
		const spots = spotsAround({ anchor: sq(5, 5), count: 4, size: GRID });
		expect(spots).toHaveLength(4);
		for (const spot of spots) expect(Math.abs(spot.x - 500) + Math.abs(spot.y - 500)).toBe(GRID);
	});

	it("goes a ring further out when the first is full, and never onto another token", () => {
		const others = [sq(4, 4), sq(5, 4), sq(6, 4), sq(4, 5), sq(6, 5), sq(4, 6), sq(5, 6)];
		const spots = spotsAround({ anchor: sq(5, 5), count: 3, size: GRID, others });
		expect(spots[0]).toEqual({ x: 600, y: 600 });
		for (const spot of spots.slice(1)) expect(Math.max(Math.abs(spot.x - 500), Math.abs(spot.y - 500))).toBe(2 * GRID);
		const all = spots.map(s => `${s.x},${s.y}`);
		expect(new Set(all).size).toBe(all.length);
	});

	it("takes the spots `prefer` picks first, from any ring (a split horde stays on the hero it was fighting)", () => {
		// Live: a merged horde beside Bram split, and one member landed two squares from him, out of the fight.
		const hero = sq(4, 5);
		const others = [hero, sq(5, 4)];
		const touchesHero = at => Math.max(Math.abs(at.x - hero.x), Math.abs(at.y - hero.y)) <= GRID;
		const preferred = spotsAround({ anchor: sq(5, 5), count: 5, size: GRID, others, prefer: touchesHero });
		expect(preferred).toHaveLength(5);
		expect(preferred.every(touchesHero)).toBe(true);
		const plain = spotsAround({ anchor: sq(5, 5), count: 5, size: GRID, others });
		expect(plain.every(touchesHero)).toBe(false);
	});

	it("falls back to the nearest spots when the preferred ones run out", () => {
		const hero = sq(4, 5);
		const touchesHero = at => Math.max(Math.abs(at.x - hero.x), Math.abs(at.y - hero.y)) <= GRID;
		const spots = spotsAround({ anchor: sq(5, 5), count: 8, size: GRID, others: [hero], prefer: touchesHero });
		expect(spots).toHaveLength(8);
		expect(spots.slice(0, 7).every(touchesHero)).toBe(true);
		expect(Math.max(Math.abs(spots[7].x - 500), Math.abs(spots[7].y - 500))).toBe(GRID);
	});

	it("keeps inside the scene, and gives back fewer when there is no more room", () => {
		const spots = spotsAround({ anchor: sq(0, 0), count: 20, size: GRID, sceneRect: { x: 0, y: 0, w: 2 * GRID, h: 2 * GRID } });
		expect(spots).toEqual([{ x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }]);
	});
});

describe("numberedNames", () => {
	it("numbers a new group from 1", () => {
		expect(numberedNames("Crinwin", [], 3)).toEqual(["Crinwin (1)", "Crinwin (2)", "Crinwin (3)"]);
	});

	it("counts an un-numbered token already there as 1, and skips numbers in use", () => {
		expect(numberedNames("Crinwin", ["Crinwin", "Crinwin (3)"], 3)).toEqual(["Crinwin (2)", "Crinwin (4)", "Crinwin (5)"]);
	});

	it("reads a name with brackets or dots in it literally", () => {
		expect(numberedNames("Mr. (Big)", ["Mr. (Big) (1)", "MrX (Big) (2)"], 1)).toEqual(["Mr. (Big) (2)"]);
	});
});

describe("the group size window", () => {
	const question = { name: "Crinwin", organization: "horde", sizes: [6, 8, 10, 12], usual: 6 };

	it("offers Just one first, then each size, with the usual size as the default", () => {
		const view = groupSizeWindow(question);
		expect(view.title).toBe("Crinwin: how many?");
		expect(view.buttons.map(b => b.label)).toEqual(["Just one", "6", "8", "10", "12"]);
		expect(view.buttons.filter(b => b.default).map(b => b.label)).toEqual(["6"]);
		expect(view.content).toContain("Crinwin is a horde monster, found 6 or more at a time. Its stat block says 6.");
	});

	it("offers both scales, a token each chosen, and one group token beside it", () => {
		const { content } = groupSizeWindow(question);
		expect(content).toMatch(new RegExp(`name="${SCALE_FIELD}" value="tokens" checked`));
		expect(content).toMatch(new RegExp(`name="${SCALE_FIELD}" value="group">`));
		expect(content).toContain("One token for the whole group");
	});

	it("escapes the monster's name", () => {
		expect(groupSizeWindow({ ...question, name: "<b>Crin</b>" }).content).not.toContain("<b>Crin</b>");
	});
});

describe("askGroupSize", () => {
	const question = { name: "Crinwin", organization: "horde", sizes: [6, 8, 10, 12], usual: 6 };
	const document = { createElement: () => ({ innerHTML: "" }) };
	/** A DialogV2 that presses the button with `action`, the scale radio reading `scale`. */
	const pressing = (action, scale) => ({
		wait: vi.fn(async config => {
			const button = config.buttons.find(b => b.action === action);
			const form = { elements: { namedItem: name => (name === SCALE_FIELD ? { value: scale } : null) } };
			return button.callback({}, { form });
		}),
	});

	it("answers the size pressed and the scale chosen, in a themed window with an element for content", async () => {
		const DialogV2 = pressing("size-8", "group");
		expect(await askGroupSize(question, { DialogV2, document })).toEqual({ size: 8, asGroup: true });
		const config = DialogV2.wait.mock.calls[0][0];
		expect(config.classes).toContain("stonetop");
		expect(typeof config.content).toBe("object");
		expect(config.buttons.find(b => b.default).action).toBe("size-6");
		expect(await askGroupSize(question, { DialogV2: pressing("size-6", "tokens"), document })).toEqual({ size: 6, asGroup: false });
	});

	it("makes Just one a single creature whichever scale is chosen, and closing it no answer", async () => {
		expect(await askGroupSize(question, { DialogV2: pressing("size-1", "group"), document })).toEqual({ size: 1, asGroup: false });
		expect(await askGroupSize(question, { DialogV2: { wait: async () => null }, document })).toBeNull();
	});
});
