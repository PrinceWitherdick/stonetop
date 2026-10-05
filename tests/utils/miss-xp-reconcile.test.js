import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reconcileMissXp, liveMissReceipt } from "../../module/utils/roll-engine.js";
import { pressRollCard } from "../../module/utils/roll-card-writer.js";
import { XP_MARK_FLAG, XP_UNDONE_FLAG, XP_MARK_FOR_FLAG, MISS_XP_FLAG } from "../../module/utils/undo-xp-mark.js";
import { ROLLED_FLAG } from "../../module/utils/counted-tier.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// "On a miss, mark XP" follows the total a roll card ends on (the user's ruling, 2026-09-30): a Burn
// Brightly or a Shift that lifts a 6- to a 7+ takes the miss's XP back, one that brings a 7+ down to
// a 6- marks it. Only on a card whose miss earns XP.

const flush = () => new Promise(resolve => setImmediate(resolve));

function fakeMessage(id, flags) {
	return {
		id,
		flags,
		getFlag: (scope, key) => (scope === SYSTEM_ID ? flags[key] : undefined),
		setFlag: vi.fn(async (scope, key, value) => { flags[key] = value; }),
		unsetFlag: vi.fn(async (scope, key) => { delete flags[key]; }),
	};
}

let messages, actor;
beforeEach(() => {
	messages = [];
	actor = {
		name: "Torwyn", uuid: "Actor.a1", type: "character", isOwner: true,
		system: { attributes: { xp: { value: 10 }, level: { value: 1 } } },
		update: vi.fn(async (data) => { await flush(); actor.system.attributes.xp.value = data["system.attributes.xp.value"]; }),
	};
	global.game = {
		user: { isGM: true }, actors: { get: () => actor },
		messages: { get contents() { return messages; } },
		settings: { get: () => "publicroll" },
	};
	global.ChatMessage = {
		getSpeaker: () => ({ actor: "a1" }),
		create: vi.fn(async (data) => { const m = fakeMessage(`r${messages.length}`, { ...data.flags[SYSTEM_ID] }); messages.push(m); return m; }),
	};
	global.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
});
afterEach(() => { delete global.game; delete global.ChatMessage; delete global.ui; });

const card = (extra = {}) => fakeMessage("c1", { [MISS_XP_FLAG]: true, [ROLLED_FLAG]: { move: "Defy Danger" }, ...extra });
const receiptFor = (cardId, extra = {}) => {
	const r = fakeMessage(`r${messages.length}`, { [XP_MARK_FLAG]: 1, [XP_MARK_FOR_FLAG]: cardId, ...extra });
	messages.push(r);
	return r;
};

describe("reconcileMissXp", () => {
	it("takes the miss's XP back when the card is lifted to a 7+", async () => {
		const c = card();
		const r = receiptFor("c1");
		await reconcileMissXp(c, 7, { actor });
		expect(actor.system.attributes.xp.value).toBe(9);
		expect(r.flags[XP_UNDONE_FLAG]).toBe(true);
		expect(liveMissReceipt(c)).toBeNull();
	});

	it("marks XP with a receipt of its own when the card is brought down to a 6-", async () => {
		const c = card();
		await reconcileMissXp(c, 6, { actor });
		expect(actor.system.attributes.xp.value).toBe(11);
		expect(ChatMessage.create).toHaveBeenCalledTimes(1);
		expect(liveMissReceipt(c)?.flags[XP_MARK_FOR_FLAG]).toBe("c1");
	});

	it("does nothing when the card stays on the same side of the line", async () => {
		const c = card();
		receiptFor("c1");
		await reconcileMissXp(c, 5, { actor });
		const hit = fakeMessage("c3", { [MISS_XP_FLAG]: true, [ROLLED_FLAG]: { move: "Defy Danger" } });
		await reconcileMissXp(hit, 8, { actor });
		expect(actor.system.attributes.xp.value).toBe(10);
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("follows the card back and forth, one receipt standing at a time", async () => {
		const c = card();
		receiptFor("c1");
		await reconcileMissXp(c, 7, { actor });   // up: taken back
		await reconcileMissXp(c, 6, { actor });   // down: marked again
		expect(actor.system.attributes.xp.value).toBe(10);
		expect(messages.filter(m => !m.flags[XP_UNDONE_FLAG])).toHaveLength(1);
	});

	it("leaves a card alone whose miss earns no XP, or a non-character's", async () => {
		const noXp = fakeMessage("c2", { [ROLLED_FLAG]: { move: "Death's Door" } });
		await reconcileMissXp(noXp, 6, { actor });
		await reconcileMissXp(card(), 6, { actor: { ...actor, type: "npc" } });
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("reads the tier the card COUNTS as: a 6- treated as a 7-9 is no miss", async () => {
		const c = card({ [ROLLED_FLAG]: { move: "Herd", missCountsAsPartial: true } });
		await reconcileMissXp(c, 6, { actor });
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("only counts a receipt marked for this card", async () => {
		receiptFor("other");
		expect(liveMissReceipt(card())).toBeNull();
	});
});

// The roll's own miss is marked on the card's writer, in the card's turn, where rewrites run too.
describe("the roll's miss mark, pressed on the card's writer", () => {
	const gmUser = { id: "gm", isGM: true };
	const rolled = (total) => Object.assign(card(), { rolls: [{ total }], speaker: { actor: "a1" } });
	beforeEach(() => {
		actor.testUserPermission = () => true;
		global.canvas = { tokens: { get: () => null } };
	});
	afterEach(() => { delete global.canvas; });

	it("marks the miss once, with the roller's roll mode", async () => {
		const c = rolled(5);
		await pressRollCard(c, "missXp", { rollMode: "gmroll" }, { user: gmUser, gm: null });
		await pressRollCard(c, "missXp", { rollMode: "gmroll" }, { user: gmUser, gm: null });
		expect(actor.system.attributes.xp.value).toBe(11);
		expect(ChatMessage.create).toHaveBeenCalledTimes(1);
		expect(ChatMessage.create.mock.calls[0][0].rollMode).toBe("gmroll");
	});

	it("marks nothing when a rewrite lifted the card off the miss first", async () => {
		await pressRollCard(rolled(7), "missXp", {}, { user: gmUser, gm: null });
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("refuses a user who does not play the character", async () => {
		actor.testUserPermission = () => false;
		expect(await pressRollCard(rolled(5), "missXp", {}, { user: gmUser, gm: null })).toBeNull();
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});
});
