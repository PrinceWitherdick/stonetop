// @vitest-environment happy-dom
// Potential for Greatness is marked in play, "once per level, when you roll a stat and get
// a 10+." maybeRemindPotentialForGreatness posts a chat reminder when a Would-Be Hero who
// still has an unmarked box rolls a 10+ on an actual stat roll and hasn't marked it this level.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	maybeRemindPotentialForGreatness, remindPotentialForGreatnessOnCard, markPotentialForGreatness,
	pfgOpenMarks, wirePotentialForGreatnessReminder,
	PFG_REMINDED_FLAG, PFG_REMINDER_FLAG, PFG_MARKED_FLAG,
} from "../../../module/actors/character/WouldBeHeroAsterisk.js";
import { ROLLED_FLAG, rolledRecord } from "../../../module/utils/counted-tier.js";

const SCOPE = "stonetop_pwd";
const PFG_OPTIONS = [
	{ slug: "stat", marks: 4, choice: "stat" },
	{ slug: "hp", marks: 1, hp: 4 },
	{ slug: "damage", marks: 1, damageDie: "d8" },
];

// `slug` is what the guard reads; `playbook` is the label, and they are separable on purpose.
function makeActor({ playbook = "The Would-Be Hero", slug = "the-would-be-hero", level = 3, ownsPfg = true, marks = {},
	stats = {}, learned = true, ownedOptions = PFG_OPTIONS, packOptions = null, owner = true } = {}) {
	const items = ownsPfg ? [{
		type: "move", name: "Potential for Greatness",
		flags: learned ? {} : { [SCOPE]: { learned: false } },
		system: { markOptions: ownedOptions },
	}] : [];
	return {
		type: "character", name: "Wren", id: "a1", isOwner: owner,
		system: {
			playbook: { name: playbook, slug }, attributes: { level: { value: level } },
			stats: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, { value: v }])),
		},
		items,
		getFlag: (_scope, key) => key === "moves.moveMarks" ? { "Potential for Greatness": marks } : null,
		typedActor: {
			_moveMarkDefinition: vi.fn(async () => (packOptions ? { markBudget: null, markOptions: packOptions, ownedCount: 1 } : null)),
			setStatSlot: vi.fn(async () => {}),
			setCountMark: vi.fn(async () => {}),
		},
	};
}

// A roll card: its flags, what rollStat stamped, and a whisper list.
function rollCard({ record = rolledRecord("str"), flags = {}, whisper = [] } = {}) {
	const store = { [ROLLED_FLAG]: record, ...flags };
	return {
		whisper,
		getFlag: (scope, key) => (scope === SCOPE ? store[key] : undefined),
		setFlag: vi.fn(async (_scope, key, value) => { store[key] = value; }),
		store,
	};
}

describe("maybeRemindPotentialForGreatness", () => {
	beforeEach(() => {
		global.ChatMessage = { create: vi.fn(), getSpeaker: vi.fn(() => ({})) };
	});

	it("reminds a Would-Be Hero on a 10+ stat roll with an unmarked box this level", async () => {
		await maybeRemindPotentialForGreatness(makeActor(), "str", 11);
		expect(ChatMessage.create).toHaveBeenCalledTimes(1);
		expect(ChatMessage.create.mock.calls[0][0].content).toContain("Potential for Greatness");
	});

	it("does not remind on a 7-9 (only a 10+ qualifies)", async () => {
		await maybeRemindPotentialForGreatness(makeActor(), "str", 9);
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	// Same reason as the announcement's own retitle case: the reminder is a rule, and a rule
	// must not switch itself off because the label above it changed.
	it("still reminds a Would-Be Hero whose playbook has been retitled", async () => {
		await maybeRemindPotentialForGreatness(makeActor({ playbook: "The Hero" }), "wis", 12);
		expect(ChatMessage.create).toHaveBeenCalledTimes(1);
	});

	it("does not remind a non-Would-Be-Hero", async () => {
		await maybeRemindPotentialForGreatness(makeActor({ playbook: "The Heavy", slug: "the-heavy" }), "str", 11);
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("does not remind on a follower/crew roll (not 'rolling a stat')", async () => {
		await maybeRemindPotentialForGreatness(makeActor(), "follower", 11);
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("does not remind when a box was already marked THIS level (once per level)", async () => {
		const actor = makeActor({ level: 3, marks: { hp: [{ stat: "", level: 3 }] } });
		await maybeRemindPotentialForGreatness(actor, "str", 11);
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("reminds when the only existing mark is from a PREVIOUS level", async () => {
		const actor = makeActor({ level: 4, marks: { hp: [{ stat: "", level: 3 }] } });
		await maybeRemindPotentialForGreatness(actor, "wis", 12);
		expect(ChatMessage.create).toHaveBeenCalledTimes(1);
	});

	it("does not remind when all six boxes are filled", async () => {
		const marks = {
			stat: [1, 2, 3, 4].map(() => ({ stat: "str", level: 2 })),
			hp: [{ stat: "", level: 2 }],
			damage: [{ stat: "", level: 2 }],
		};
		await maybeRemindPotentialForGreatness(makeActor({ marks }), "str", 11);
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("does not remind a Would-Be Hero who doesn't own Potential for Greatness", async () => {
		await maybeRemindPotentialForGreatness(makeActor({ ownsPfg: false }), "str", 11);
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	// A stat slot picked third pads the first two with empty entries: six STORED entries, three marks.
	it("counts FILLED marks, so padded empty stat slots still leave boxes open", async () => {
		const marks = {
			stat: [{ stat: "", level: null }, { stat: "", level: null }, { stat: "dex", level: 2 }, { stat: "", level: null }],
			hp: [{ stat: "", level: 1 }],
			damage: [{ stat: "", level: 2 }],
		};
		await maybeRemindPotentialForGreatness(makeActor({ marks }), "str", 11);
		expect(ChatMessage.create).toHaveBeenCalledTimes(1);
	});

	it("does not remind when Potential for Greatness is un-learned", async () => {
		await maybeRemindPotentialForGreatness(makeActor({ learned: false }), "str", 11);
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("reads the mark options off the pack definition when the owned copy has none", async () => {
		await maybeRemindPotentialForGreatness(makeActor({ ownedOptions: [], packOptions: PFG_OPTIONS }), "str", 11);
		expect(ChatMessage.create).toHaveBeenCalledTimes(1);
	});

	it("leaves the stat out when the rolled stat is already +2", async () => {
		await maybeRemindPotentialForGreatness(makeActor({ stats: { str: 2 } }), "str", 11);
		const content = ChatMessage.create.mock.calls[0][0].content;
		expect(content).not.toContain("increase the stat you rolled");
		expect(content).toContain("already +2");
		expect(content).toContain("increase your max HP by 4 or increase your damage die to a d8");
		expect(content).not.toContain('data-pfg-kind="stat"');
	});

	it("skips the reminder when the stat is at +2 and the HP and damage boxes are filled", async () => {
		const marks = { hp: [{ stat: "", level: 1 }], damage: [{ stat: "", level: 2 }] };
		await maybeRemindPotentialForGreatness(makeActor({ stats: { str: 2 }, marks }), "str", 11);
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("offers a button for each open box", async () => {
		await maybeRemindPotentialForGreatness(makeActor({ stats: { wis: 1 } }), "wis", 10);
		const { content, flags } = ChatMessage.create.mock.calls[0][0];
		expect(content).toContain("+1 WIS");
		expect(content).toContain("+4 max HP");
		expect(content).toContain("d8 damage die");
		expect(flags[SCOPE][PFG_REMINDER_FLAG]).toEqual({ stat: "wis" });
	});

	it("goes where the roll went: a whispered roll's reminder is whispered", async () => {
		ChatMessage.applyRollMode = vi.fn();
		await maybeRemindPotentialForGreatness(makeActor(), "str", 11, { whisper: ["gm", "u1", ""], rollMode: "gmroll" });
		const data = ChatMessage.create.mock.calls[0][0];
		expect(data.whisper).toEqual(["gm", "u1"]);
		expect(ChatMessage.applyRollMode).not.toHaveBeenCalled();
	});

	it("a private or blind roll's reminder follows the roll card's whisper and blindness", async () => {
		const card = { ...rollCard({ whisper: ["gm"] }), blind: true };
		await maybeRemindPotentialForGreatness(makeActor(), "str", 11, { rollMode: "blindroll", message: card });
		const data = ChatMessage.create.mock.calls[0][0];
		expect(data.whisper).toEqual(["gm"]);
		expect(data.blind).toBe(true);
	});

	it("with no whisper to copy, the chat mode is applied the way core does it, never passed as a data key", async () => {
		ChatMessage.applyRollMode = vi.fn((data, mode) => { if (mode === "gmroll") data.whisper = ["gm"]; });
		await maybeRemindPotentialForGreatness(makeActor(), "str", 11, { rollMode: "gmroll" });
		const data = ChatMessage.create.mock.calls[0][0];
		expect(ChatMessage.applyRollMode).toHaveBeenCalledWith(expect.any(Object), "gmroll");
		expect(data.whisper).toEqual(["gm"]);
		expect(data.rollMode).toBeUndefined();
	});

	it("reads the COUNTED tier: a 7-9 treated as a 10+ reminds, and a 10+ counted lower does not", async () => {
		await maybeRemindPotentialForGreatness(makeActor(), "str", 8, { tier: "success" });
		expect(ChatMessage.create).toHaveBeenCalledTimes(1);
		await maybeRemindPotentialForGreatness(makeActor(), "str", 10, { tier: "partial" });
		expect(ChatMessage.create).toHaveBeenCalledTimes(1);
	});

	it("latches on the roll card, and never reminds twice for one card", async () => {
		const card = rollCard();
		await maybeRemindPotentialForGreatness(makeActor(), "str", 11, { message: card });
		expect(card.store[PFG_REMINDED_FLAG]).toBe(true);
		await maybeRemindPotentialForGreatness(makeActor(), "str", 12, { message: card });
		expect(ChatMessage.create).toHaveBeenCalledTimes(1);
	});
});

describe("remindPotentialForGreatnessOnCard (a rewrite lifting a card to 10+)", () => {
	beforeEach(() => {
		global.ChatMessage = { create: vi.fn(), getSpeaker: vi.fn(() => ({})) };
	});

	it("reminds when a rewrite lifts the card to 10+, with the stat off the card", async () => {
		const card = rollCard({ record: rolledRecord("dex") });
		expect(await remindPotentialForGreatnessOnCard(card, makeActor(), 10)).toBe(true);
		expect(ChatMessage.create.mock.calls[0][0].content).toContain("+1 DEX");
	});

	it("does nothing below 10, or for a card that recorded no stat roll", async () => {
		expect(await remindPotentialForGreatnessOnCard(rollCard(), makeActor(), 9)).toBe(false);
		expect(await remindPotentialForGreatnessOnCard(rollCard({ record: null }), makeActor(), 11)).toBe(false);
		expect(ChatMessage.create).not.toHaveBeenCalled();
	});

	it("counts a 7-9 the roll treats as a 10+ (Let's Make a Deal)", async () => {
		const card = rollCard({ record: rolledRecord("cha", { partialCountsAsSuccess: "Let's Make a Deal" }) });
		expect(await remindPotentialForGreatnessOnCard(card, makeActor(), 8)).toBe(true);
	});

	it("does not remind again for a card the roll already reminded on", async () => {
		const card = rollCard({ flags: { [PFG_REMINDED_FLAG]: true } });
		expect(await remindPotentialForGreatnessOnCard(card, makeActor(), 11)).toBe(false);
	});

	it("whispers to the whispered card's own list", async () => {
		await remindPotentialForGreatnessOnCard(rollCard({ whisper: ["gm", "u2"] }), makeActor(), 10);
		expect(ChatMessage.create.mock.calls[0][0].whisper).toEqual(["gm", "u2"]);
	});
});

describe("marking Potential for Greatness from the reminder", () => {
	it("fills the first open stat slot with the rolled stat", async () => {
		const actor = makeActor({ marks: { stat: [{ stat: "dex", level: 1 }, { stat: "", level: null }] } });
		expect(await markPotentialForGreatness(actor, "str", "stat")).toBe(true);
		expect(actor.typedActor.setStatSlot).toHaveBeenCalledWith("Potential for Greatness", "stat", 1, "str");
	});

	it("ticks the next HP or damage box", async () => {
		const actor = makeActor();
		await markPotentialForGreatness(actor, "str", "hp");
		expect(actor.typedActor.setCountMark).toHaveBeenCalledWith("Potential for Greatness", "hp", 1);
		await markPotentialForGreatness(actor, "str", "damage");
		expect(actor.typedActor.setCountMark).toHaveBeenCalledWith("Potential for Greatness", "damage", 1);
	});

	it("marks nothing once a box was marked this level, or for a stat already at +2", async () => {
		const marked = makeActor({ level: 3, marks: { hp: [{ stat: "", level: 3 }] } });
		expect(await markPotentialForGreatness(marked, "str", "damage")).toBe(false);
		const capped = makeActor({ stats: { str: 2 } });
		expect(await markPotentialForGreatness(capped, "str", "stat")).toBe(false);
		expect(capped.typedActor.setStatSlot).not.toHaveBeenCalled();
	});

	it("says what is open: the stat slot's index and each box's next count", async () => {
		const offer = await pfgOpenMarks(makeActor({ level: 4 }), "con");
		expect(offer).toEqual({ level: 4, statCapped: false, open: [
			{ kind: "stat", slug: "stat", index: 0 },
			{ kind: "hp", slug: "hp", count: 1 },
			{ kind: "damage", slug: "damage", count: 1 },
		] });
	});
});

describe("the reminder card's buttons", () => {
	function reminderHtml() {
		const root = document.createElement("div");
		root.innerHTML = `<section class="stonetop-roll-card"><div class="card-buttons stonetop-roll-actions stonetop-pfg-mark-buttons">
			<button type="button" class="stonetop-pfg-mark-btn" data-pfg-kind="stat">+1 STR</button>
			<button type="button" class="stonetop-pfg-mark-btn" data-pfg-kind="hp">+4 max HP</button></div></section>`;
		return root;
	}
	const reminder = (flags = {}) => {
		const store = { [PFG_REMINDER_FLAG]: { stat: "str" }, ...flags };
		return {
			getFlag: (scope, key) => (scope === SCOPE ? store[key] : undefined),
			setFlag: vi.fn(async (_s, key, value) => { store[key] = value; }),
			canUserModify: () => true,
			store,
		};
	};

	it("are taken off the card for anyone who does not own the character", () => {
		const html = reminderHtml();
		wirePotentialForGreatnessReminder(reminder(), html, { actor: makeActor({ owner: false }) });
		expect(html.querySelector(".stonetop-pfg-mark-buttons")).toBeNull();
	});

	it("mark the box pressed and latch the card", async () => {
		const html = reminderHtml();
		const actor = makeActor();
		const message = reminder();
		wirePotentialForGreatnessReminder(message, html, { actor });
		html.querySelector('[data-pfg-kind="hp"]').click();
		await vi.waitFor(() => expect(message.store[PFG_MARKED_FLAG]).toBe("hp"));
		expect(actor.typedActor.setCountMark).toHaveBeenCalledWith("Potential for Greatness", "hp", 1);
		for (const b of html.querySelectorAll("button")) expect(b.disabled).toBe(true);
	});

	it("are drawn spent once this level's box is marked", () => {
		const html = reminderHtml();
		wirePotentialForGreatnessReminder(reminder(), html, { actor: makeActor({ level: 3, marks: { hp: [{ stat: "", level: 3 }] } }) });
		for (const b of html.querySelectorAll("button")) expect(b.disabled).toBe(true);
	});
});
