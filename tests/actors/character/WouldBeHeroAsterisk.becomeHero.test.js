// A Would-Be Hero's "hero-making" moves are marked with system.asterisk. Owning one
// crosses off "Would-be" automatically (the sheet header derives "The Hero" via
// ownsAsteriskMove + heroDisplayName), and the first time a Would-Be Hero gains such a
// move, maybeAnnounceBecameHero posts a one-time chat announcement.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	ownsAsteriskMove,
	heroDisplayName,
	maybeAnnounceBecameHero,
	WBH_HERO_FLAG,
} from "../../../module/actors/character/WouldBeHeroAsterisk.js";

function makeActor({ playbook = "The Would-Be Hero", isHero = false } = {}) {
	const flags = { [WBH_HERO_FLAG]: isHero || undefined };
	return {
		type: "character",
		name: "Wren",
		system: { playbook: { name: playbook } },
		getFlag: (_scope, key) => flags[key],
		setFlag: vi.fn(async (_scope, key, value) => { flags[key] = value; }),
	};
}

function makeMove(actor, { type = "move", asterisk = { basicMove: "Defy Danger", minTotal: 12 } } = {}) {
	return { type, system: { asterisk }, parent: actor };
}

describe("ownsAsteriskMove", () => {
	it("is true when the actor owns a move carrying system.asterisk", () => {
		const actor = { items: [{ type: "move", system: { asterisk: { basicMove: "Clash" } } }] };
		expect(ownsAsteriskMove(actor)).toBe(true);
	});

	it("is false when no owned move is asterisked", () => {
		const actor = { items: [
			{ type: "move", system: {} },
			{ type: "equipment", system: { asterisk: { basicMove: "Clash" } } },
		] };
		expect(ownsAsteriskMove(actor)).toBe(false);
	});

	it("is false for a null/empty actor", () => {
		expect(ownsAsteriskMove(null)).toBe(false);
		expect(ownsAsteriskMove({})).toBe(false);
	});
});

describe("heroDisplayName", () => {
	it("renames the Would-Be Hero to The Hero once crossed off", () => {
		expect(heroDisplayName("The Would-Be Hero", true)).toBe("The Hero");
	});

	it("keeps the Would-Be Hero name until crossed off", () => {
		expect(heroDisplayName("The Would-Be Hero", false)).toBe("The Would-Be Hero");
	});

	it("leaves other playbooks untouched", () => {
		expect(heroDisplayName("The Blessed", true)).toBe("The Blessed");
	});
});

describe("maybeAnnounceBecameHero", () => {
	beforeEach(() => {
		global.game = { userId: "u1" };
		global.ChatMessage = { create: vi.fn(), getSpeaker: vi.fn(() => ({})) };
	});

	it("crosses off Would-be and announces when a Would-Be Hero gains an asterisked move", async () => {
		const actor = makeActor();
		await maybeAnnounceBecameHero(makeMove(actor), "u1");
		expect(actor.setFlag).toHaveBeenCalledWith("stonetop-pwd", WBH_HERO_FLAG, true);
		expect(ChatMessage.create).toHaveBeenCalledTimes(1);
		expect(ChatMessage.create.mock.calls[0][0].content).toContain("A Would-Be Hero No Longer");
	});

	it("only the responsible client writes/announces", async () => {
		const actor = makeActor();
		await maybeAnnounceBecameHero(makeMove(actor), "someone-else");
		expect(actor.setFlag).not.toHaveBeenCalled();
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("ignores moves without an asterisk trigger", async () => {
		const actor = makeActor();
		await maybeAnnounceBecameHero(makeMove(actor, { asterisk: null }), "u1");
		expect(actor.setFlag).not.toHaveBeenCalled();
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("ignores non-move items", async () => {
		const actor = makeActor();
		await maybeAnnounceBecameHero(makeMove(actor, { type: "equipment" }), "u1");
		expect(actor.setFlag).not.toHaveBeenCalled();
	});

	it("ignores asterisked moves owned by a different playbook", async () => {
		const actor = makeActor({ playbook: "The Heavy" });
		await maybeAnnounceBecameHero(makeMove(actor), "u1");
		expect(actor.setFlag).not.toHaveBeenCalled();
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("does not re-announce for someone who is already a Hero", async () => {
		const actor = makeActor({ isHero: true });
		await maybeAnnounceBecameHero(makeMove(actor), "u1");
		expect(actor.setFlag).not.toHaveBeenCalled();
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});
});
