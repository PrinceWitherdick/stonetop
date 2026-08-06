import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { stampWorldLayoutBaseline, setWorldSheetLayout, showLayoutCard } from "../../module/utils/sheet-layout.js";

// Which layout a world starts on, and how the table moves between them.
//
// The rule this file exists to hold still: a world created on this release opens MODERN,
// and a world that already existed when the two layouts landed opens CLASSIC, keeping the
// sheets exactly where its table left them. Both halves fail silently if they break - the
// wrong layout is a working sheet, just not the one anyone expected - and the second half
// is unrecoverable in the sense that matters, because by the time the GM notices, their
// players have already had their sheets rearranged mid-campaign.
//
// The rest guards the card: ONE per world, EDITED in place, always naming the layout actually
// in force. Every part of that was learned the hard way. See showLayoutCard.

const original = globalThis.game;
const originalUi = globalThis.ui;
const originalChat = globalThis.ChatMessage;

/** The registered defaults, so a store only has to name what it disagrees with. */
const DEFAULTS = {
	worldSheetLayout: "modern",
	worldSheetLayoutChosen: false,
	classicLayoutNoticeShown: false,
	seedingComplete: false,
	sheetLayout: "world",
	classicLayoutCharacter: true,
	classicLayoutSteading: true,
	classicLayoutNpc: true,
	layoutCardId: "",
};

let store;      // the settings
let messages;   // id -> message doc, standing in for game.messages
let created;    // how many messages were CREATED (vs edited) this test
let edited;     // ...and how many edits landed
let deleted;    // ids swept by _retireStrayCards
let warnings;
let infos;
let nextId;

/**
 * @param {object} [overrides]  Setting values this world disagrees with.
 * @param {{isGM?: boolean, chat?: boolean}} [opts]  `chat: false` stands in for a load where
 *   ChatMessage is not up yet, which is the case that must NOT latch the notice flag.
 */
function withWorld(overrides = {}, { isGM = true, chat = true } = {}) {
	store = { ...DEFAULTS, ...overrides };
	messages = new Map();
	created = edited = 0;
	deleted = [];
	warnings = [];
	infos = [];
	nextId = 0;
	globalThis.game = {
		...original,
		user: { isGM },
		settings: {
			get: (_ns, key) => store[key],
			set: async (_ns, key, value) => { store[key] = value; },
		},
		messages: {
			get: id => messages.get(id) ?? null,
			filter: fn => [...messages.values()].filter(fn),
		},
	};
	globalThis.ui = { notifications: {
		info: msg => infos.push(msg), warn: msg => warnings.push(msg), error: () => {},
	} };
	if (chat) withChat(); else globalThis.ChatMessage = undefined;
}

/** Bring chat up (again), keeping whatever is already in the log. */
function withChat() {
	globalThis.ChatMessage = {
		create: async data => {
			created++;
			const doc = { id: `msg${++nextId}`, ...data };
			doc.update = async changes => { edited++; Object.assign(doc, changes); };
			messages.set(doc.id, doc);
			return doc;
		},
		getWhisperRecipients: () => [{ id: "gm1" }],
		deleteDocuments: async ids => { for (const id of ids) { messages.delete(id); deleted.push(id); } },
	};
}

/** Put a message in the log without going through the system (a stray from an older build). */
function seedMessage(content) {
	const doc = { id: `seed${++nextId}`, content, update: async c => { edited++; Object.assign(doc, c); } };
	messages.set(doc.id, doc);
	return doc;
}

/** Every layout card currently in the log. There must never be more than one. */
const cards = () => [...messages.values()].filter(m => m.content?.includes("stonetop-layout-offer-card"));
/** The layout the card's button switches TO. */
const offeredLayout = () => /data-layout="(\w+)"/.exec(cards()[0]?.content ?? "")?.[1] ?? null;
/** Its headline, which has to name the layout now in force. */
const cardTitle = () => /<h2 class="cell__title">([^<]*)</.exec(cards()[0]?.content ?? "")?.[1] ?? null;

beforeEach(() => withWorld());
afterEach(() => {
	globalThis.game = original;
	globalThis.ui = originalUi;
	globalThis.ChatMessage = originalChat;
});

describe("stampWorldLayoutBaseline", () => {
	it("leaves a fresh world on modern and says nothing", async () => {
		withWorld({ seedingComplete: false });
		await stampWorldLayoutBaseline();
		expect(store.worldSheetLayout).toBe("modern");
		expect(store.worldSheetLayoutChosen).toBe(true);
		expect(cards()).toEqual([]);
		// Latched even with nothing to say, so it never speaks up later either.
		expect(store.classicLayoutNoticeShown).toBe(true);
	});

	// The whole point. `seedingComplete` means the gazetteer was seeded on some earlier load,
	// i.e. this world predates the redesign.
	it("keeps an established world on classic and whispers the offer", async () => {
		withWorld({ seedingComplete: true });
		await stampWorldLayoutBaseline();
		expect(store.worldSheetLayout).toBe("classic");
		expect(cards()).toHaveLength(1);
		expect(offeredLayout()).toBe("modern");
		expect(cards()[0].whisper).toEqual(["gm1"]);
		expect(store.classicLayoutNoticeShown).toBe(true);
		// ...and the card is remembered, or every later flip would post another one.
		expect(store.layoutCardId).toBe(cards()[0].id);
	});

	it("never stamps or offers twice", async () => {
		withWorld({ seedingComplete: true });
		await stampWorldLayoutBaseline();
		// The GM tries the modern layout; the next load must not drag the world back to
		// classic, nor re-offer what they already took.
		store.worldSheetLayout = "modern";
		await stampWorldLayoutBaseline();
		expect(store.worldSheetLayout).toBe("modern");
		expect(created).toBe(1);
	});

	// Both settings are world-scoped, so a player reaching this would only get a permission
	// error - and five players logging in would race to stamp the same world.
	it("does nothing for a player", async () => {
		withWorld({ seedingComplete: true }, { isGM: false });
		await stampWorldLayoutBaseline();
		expect(store.worldSheetLayout).toBe("modern");
		expect(store.worldSheetLayoutChosen).toBe(false);
		expect(cards()).toEqual([]);
	});

	// The card is the only notice an upgraded table gets that the modern layout exists, so a
	// load where chat is not up yet has to leave the flag alone and try again next time.
	it("re-offers next load when chat could not take the card", async () => {
		withWorld({ seedingComplete: true }, { chat: false });
		await stampWorldLayoutBaseline();
		expect(store.worldSheetLayout).toBe("classic");   // the stamp still happened
		expect(store.classicLayoutNoticeShown).toBe(false);

		withChat();   // next load
		await stampWorldLayoutBaseline();
		expect(cards()).toHaveLength(1);
		expect(store.classicLayoutNoticeShown).toBe(true);
	});

	// ...but it must not describe a world that has since moved on. A GM who switched from the
	// settings window before the card ever posted would otherwise be told their sheets stayed
	// classic while looking at the modern ones.
	it("drops an undelivered offer once the world is modern anyway", async () => {
		withWorld({ seedingComplete: true }, { chat: false });
		await stampWorldLayoutBaseline();
		store.worldSheetLayout = "modern";

		withChat();   // next load
		await stampWorldLayoutBaseline();
		expect(cards()).toEqual([]);
		expect(store.classicLayoutNoticeShown).toBe(true);
	});
});

describe("setWorldSheetLayout", () => {
	it("moves the table and offers the way back", async () => {
		withWorld({ worldSheetLayout: "classic" });
		expect(await setWorldSheetLayout("modern")).toBe(true);
		expect(store.worldSheetLayout).toBe("modern");
		expect(offeredLayout()).toBe("classic");
	});

	it("offers the way forward again when switched back", async () => {
		withWorld({ worldSheetLayout: "modern" });
		await setWorldSheetLayout("classic");
		expect(store.worldSheetLayout).toBe("classic");
		expect(offeredLayout()).toBe("modern");
	});

	// The reason the card is edited rather than re-posted: a GM trying both layouts a few times
	// would otherwise leave a column of near-identical cards, all but the last describing a
	// state the table had already left.
	it("edits the one card however many times the table flips", async () => {
		withWorld({ seedingComplete: true });
		await stampWorldLayoutBaseline();
		for (const mode of ["modern", "classic", "modern", "classic"]) await setWorldSheetLayout(mode);
		expect(created, "a flip posted a second card").toBe(1);
		expect(edited).toBe(4);
		expect(cards()).toHaveLength(1);
		// ...and the survivor is current, not a stale copy.
		expect(cardTitle()).toBe("Back on the Classic Layout");
		expect(offeredLayout()).toBe("modern");
	});

	// A GM who deletes the card has not opted out of ever seeing it again; the next flip should
	// still have somewhere to say what it did.
	it("posts a fresh card if the tracked one is gone", async () => {
		withWorld({ seedingComplete: true });
		await stampWorldLayoutBaseline();
		messages.clear();
		await setWorldSheetLayout("modern");
		expect(cards()).toHaveLength(1);
		expect(store.layoutCardId).toBe(cards()[0].id);
	});

	// Their buttons are live (the handler binds by class, not by message), so a stale card is a
	// working control under a description of a layout the table is not on. Also the migration
	// for a world that collected a few before the card became editable.
	it("sweeps stray cards left by an earlier build", async () => {
		withWorld({ worldSheetLayout: "classic" });
		const strays = [seedMessage(`<section class="stonetop-layout-offer-card">old</section>`),
		                seedMessage(`<section class="stonetop-layout-offer-card">older</section>`)];
		const bystander = seedMessage("<p>someone said something</p>");
		await setWorldSheetLayout("modern");
		expect(cards()).toHaveLength(1);
		expect(deleted.sort()).toEqual(strays.map(m => m.id).sort());
		expect(messages.has(bystander.id), "swept a message that was not ours").toBe(true);
	});

	// A button that says "switch the sheets" has to switch the presser's own sheets, or it
	// reads as broken rather than as a personal setting quietly winning.
	it("drops a personal override that contradicts the change", async () => {
		withWorld({ worldSheetLayout: "classic", sheetLayout: "classic" });
		await setWorldSheetLayout("modern");
		expect(store.sheetLayout).toBe("world");
	});

	it("leaves a personal override that already agrees alone", async () => {
		withWorld({ worldSheetLayout: "classic", sheetLayout: "modern" });
		await setWorldSheetLayout("modern");
		expect(store.sheetLayout).toBe("modern");
	});

	// The same rule one level down, and the sharper failure of the two: effective classic is
	// `<master> AND <this sheet's box>`, so a GM who unticked all three per-sheet boxes had a card
	// on which BOTH buttons did nothing they could see - modern because their sheets were already
	// modern, classic because their own boxes held them there - while the world setting flipped
	// correctly under each press.
	it("ticks per-sheet boxes back on when the change contradicts them", async () => {
		withWorld({ worldSheetLayout: "modern", classicLayoutCharacter: false, classicLayoutNpc: false });
		await setWorldSheetLayout("classic");
		expect(store.classicLayoutCharacter).toBe(true);
		expect(store.classicLayoutNpc).toBe(true);
		expect(store.classicLayoutSteading).toBe(true);
		// ...and says which ones it touched, or the sheets that moved are a mystery.
		expect(infos.join(" ")).toContain("Character Sheets and NPC Sheets");
	});

	// A modern master is modern everywhere whatever the children say, so there is nothing for them
	// to contradict on the way to modern - and a deliberate per-sheet preference outlives the trip.
	it("leaves per-sheet boxes alone on the way to modern", async () => {
		withWorld({ worldSheetLayout: "classic", classicLayoutCharacter: false });
		await setWorldSheetLayout("modern");
		expect(store.classicLayoutCharacter).toBe(false);
		expect(infos.join(" ")).not.toContain("ticked back on");
	});

	// The end of it: after one press of each button the presser is actually looking at the layout
	// the card says the table is on, whatever they had set before.
	it("makes both directions reach the presser's own sheets", async () => {
		withWorld({ worldSheetLayout: "classic", sheetLayout: "modern",
		            classicLayoutCharacter: false, classicLayoutSteading: false, classicLayoutNpc: false });
		await setWorldSheetLayout("classic");
		const classicFor = sheet => store.sheetLayout !== "modern"
			&& (store.sheetLayout === "classic" || store.worldSheetLayout === "classic")
			&& store[{ character: "classicLayoutCharacter", steading: "classicLayoutSteading", npc: "classicLayoutNpc" }[sheet]];
		for (const sheet of ["character", "steading", "npc"]) expect(classicFor(sheet), sheet).toBe(true);
		await setWorldSheetLayout("modern");
		for (const sheet of ["character", "steading", "npc"]) expect(classicFor(sheet), sheet).toBe(false);
	});

	// The signal that survives having nothing open and never scrolling chat.
	it("says so out loud, naming the layout", async () => {
		withWorld({ worldSheetLayout: "classic" });
		await setWorldSheetLayout("modern");
		expect(infos.join(" ")).toContain("modern");
	});

	it("refuses a player and changes nothing", async () => {
		withWorld({ worldSheetLayout: "classic" }, { isGM: false });
		expect(await setWorldSheetLayout("modern")).toBe(false);
		expect(store.worldSheetLayout).toBe("classic");
		expect(cards()).toEqual([]);
		expect(warnings).toHaveLength(1);
	});
});

describe("showLayoutCard", () => {
	// The setting behind the button is world-scoped: a public card would hand most of the
	// people reading it a button that answers with a permission error.
	it("whispers to the GMs", async () => {
		expect(await showLayoutCard("classic", { firstRun: true })).toBe(true);
		expect(cards()[0].whisper).toEqual(["gm1"]);
	});

	it("reports back rather than throwing when chat is not up", async () => {
		withWorld({}, { chat: false });
		expect(await showLayoutCard("classic")).toBe(false);
	});

	// Named for where the table IS; the button always offers the other one. Getting this
	// backwards is what made a working button look dead.
	it("offers the layout the table is not on, both ways", async () => {
		await showLayoutCard("classic");
		expect(offeredLayout()).toBe("modern");
		await showLayoutCard("modern");
		expect(offeredLayout()).toBe("classic");
	});

	it("has a distinct headline for each of its three cases", async () => {
		const titles = [];
		for (const [now, opts] of [["classic", { firstRun: true }], ["classic", {}], ["modern", {}]]) {
			withWorld();   // a fresh log each time, so each headline is read off its own card
			await showLayoutCard(now, opts);
			titles.push(cardTitle());
		}
		expect(new Set(titles).size, `repeated headline: ${titles.join(" / ")}`).toBe(3);
	});
});
