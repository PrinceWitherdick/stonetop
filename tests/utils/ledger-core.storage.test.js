import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
	LEDGER_MAX_ENTRIES, LEDGER_FLAG_PATH,
	appendLedgerEntries, deleteLedgerEntries, getLedgerEntries, canDeleteLedgerEntry, pendingLedgerWrites,
	numericMerge, deltaEntry, editMerge, editAction, mergeRuns,
	getActorProperty, isBlank, formatValue, ledgerNoun,
} from "../../module/utils/ledger-core.js";
import { serverNow } from "../../module/utils/foundry-compat.js";
import { SYSTEM_ID, CUTOVER_KEY } from "../../module/system-id.js";
import { makeLedgerActor } from "../fakes/ledger-actor.js";

const actions = actor => actor.entries.map(e => e.action);
const FD = () => new foundry.data.operators.ForcedDeletion();

let counter = 0;
const freshId = (tag) => `${tag}-${++counter}`;

const savedGame = { ...global.game };
afterEach(() => {
	for (const key of Object.keys(global.game)) if (!(key in savedGame)) delete global.game[key];
	Object.assign(global.game, savedGame);
});

describe("the keyed ledger (#5)", () => {
	it("stores one flag key per entry and reads them back newest first", async () => {
		const actor = makeLedgerActor({ id: freshId("keyed") });
		await appendLedgerEntries(actor, [{ action: "Background set to Sheriff" }, { action: "Instinct set to Protective" }]);

		expect(Array.isArray(actor.raw)).toBe(false);
		const [{ data }] = actor.updates;
		expect(Object.keys(data).every(k => k.startsWith(`${LEDGER_FLAG_PATH}.`))).toBe(true);
		expect(actions(actor)).toEqual(["Instinct set to Protective", "Background set to Sheriff"]);
	});

	it("keeps both entries when two CLIENTS append inside one round trip", async () => {
		// Two clients, one stored document: each has its own write chain (they are separate
		// browsers), and both read the ledger before either write lands. With a whole array the
		// later write erased the earlier one's entry.
		const store = { raw: { seed: { id: "seed", action: "Name set to Pim", timestamp: 1, userId: "u0" } } };
		const gm     = makeLedgerActor({ uuid: freshId("client-gm"), store, delay: true });
		const player = makeLedgerActor({ uuid: freshId("client-player"), store, delay: true });

		await Promise.all([
			appendLedgerEntries(gm, [{ action: "HP changed from 6 to 4" }], { userId: "gm" }),
			appendLedgerEntries(player, [{ action: "Longsword selected" }], { userId: "player" }),
		]);

		expect(actions(gm).sort()).toEqual(["HP changed from 6 to 4", "Longsword selected", "Name set to Pim"]);
	});

	it("reads a legacy ARRAY ledger, and converts it on the next write without losing or doubling an entry", async () => {
		const legacy = [
			{ id: "bbb", action: "XP changed from 1 to 2", timestamp: 2000, userId: "u" },
			{ id: "aaa", action: "Level changed from 1 to 2", timestamp: 2000, userId: "u" },
			{ id: "zzz", action: "Name set to Pim", timestamp: 1000, userId: "u" },
		];
		const actor = makeLedgerActor({ id: freshId("legacy"), raw: legacy });
		// Read as-is: same timestamps keep their stored order.
		expect(actions(actor)).toEqual(["XP changed from 1 to 2", "Level changed from 1 to 2", "Name set to Pim"]);

		await appendLedgerEntries(actor, [{ action: "Longsword selected" }]);

		expect(Array.isArray(actor.raw)).toBe(false);
		expect(actions(actor)).toEqual([
			"Longsword selected", "XP changed from 1 to 2", "Level changed from 1 to 2", "Name set to Pim",
		]);
		expect(Object.keys(actor.raw).sort()).toEqual([...new Set(Object.keys(actor.raw))].sort());
		expect(Object.keys(actor.raw)).toHaveLength(4);
		// Written as a forced replacement, so the old array is not merged into the object.
		expect(Object.keys(actor.updates[0].data)).toEqual([`flags.${SYSTEM_ID}.==ledger`]);
	});

	it("re-ids a legacy entry whose id would split a flag path, and two that share an id", async () => {
		const actor = makeLedgerActor({ id: freshId("legacy-ids"), raw: [
			{ id: "1700000000000-0.123", action: "A cleared", timestamp: 3 },
			{ id: "dup", action: "B cleared", timestamp: 2 },
			{ id: "dup", action: "C cleared", timestamp: 1 },
		] });
		await appendLedgerEntries(actor, [{ action: "D cleared" }]);

		const ids = Object.keys(actor.raw);
		expect(ids).toHaveLength(4);
		expect(ids.every(id => /^[A-Za-z0-9_-]+$/.test(id))).toBe(true);
		expect(actions(actor)).toEqual(["D cleared", "A cleared", "B cleared", "C cleared"]);
	});

	it("trims to the cap by dropping the OLDEST entries", async () => {
		const raw = {};
		for (let i = 0; i < LEDGER_MAX_ENTRIES; i++) raw[`e${i}`] = { id: `e${i}`, action: `Old ${i} cleared`, timestamp: 1000 + i };
		const actor = makeLedgerActor({ id: freshId("trim"), raw });

		await appendLedgerEntries(actor, [{ action: "New one cleared" }, { action: "Newer one cleared" }]);

		expect(actor.entries).toHaveLength(LEDGER_MAX_ENTRIES);
		expect(actions(actor)[0]).toBe("Newer one cleared");
		expect(actor.raw.e0).toBeUndefined();
		expect(actor.raw.e1).toBeUndefined();
		expect(actor.raw.e2).toBeDefined();
	});

	it("deletes the stored head when a round trip annihilates it", async () => {
		const now = Date.now();
		const actor = makeLedgerActor({ id: freshId("drop-pair"), raw: {
			old:  { id: "old", action: "Name set to Pim", timestamp: now - 5000 },
			head: { id: "head", action: "HP changed from 5 to 4", timestamp: now, userId: null, move: null,
				merge: numericMerge("HP", "system.attributes.hp.value", 5, 4) },
		} });

		await appendLedgerEntries(actor, [{ action: "HP changed from 4 to 5", merge: numericMerge("HP", "system.attributes.hp.value", 4, 5) }], { userId: null });

		expect(actions(actor)).toEqual(["Name set to Pim"]);
		expect(actor.raw.head).toBeUndefined();
	});

	it("folds the stored run even when a sibling from the same update was diffed first", async () => {
		// One update wrote Level, then XP. mergeRuns folds only adjacent entries, so the Level
		// entry sat between the stored XP run and the new XP change and blocked it.
		const actor = makeLedgerActor({ id: freshId("fold-order"), raw: {
			old: { id: "old", timestamp: Date.now(), userId: null, move: null, action: "XP changed from 0 to 1",
				merge: numericMerge("XP", "system.attributes.xp.value", 0, 1) },
		} });

		await appendLedgerEntries(actor, [
			{ action: "Level changed from 1 to 2", merge: numericMerge("Level", "system.attributes.level.value", 1, 2) },
			{ action: "XP changed from 1 to 2", merge: numericMerge("XP", "system.attributes.xp.value", 1, 2) },
		], { userId: null });

		expect(actions(actor)).toEqual(["Level changed from 1 to 2", "XP changed from 0 to 2"]);
	});

	it("lets the write chain go idle once nothing is in flight", async () => {
		const actor = makeLedgerActor({ id: freshId("idle"), delay: true });
		const pending = appendLedgerEntries(actor, [{ action: "Name set to Pim" }]);
		expect(pendingLedgerWrites()).toBeGreaterThan(0);
		await pending;
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(pendingLedgerWrites()).toBe(0);
	});
});

describe("timestamps come from the server clock (#16)", () => {
	it("stamps game.time.serverTime when there is one", async () => {
		global.game.time = { serverTime: 4242 };
		expect(serverNow()).toBe(4242);
		const actor = makeLedgerActor({ id: freshId("server-time") });
		await appendLedgerEntries(actor, [{ action: "Name set to Pim" }]);
		expect(actor.entries[0].timestamp).toBe(4242);
	});

	it("falls back to the local clock without one", () => {
		delete global.game.time;
		const before = Date.now();
		expect(serverNow()).toBeGreaterThanOrEqual(before);
	});
});

describe("who may delete an entry (#21c)", () => {
	const gm = { id: "gm", isGM: true, name: "GM" };
	const player = { id: "pl", isGM: false, name: "Pat" };
	const users = new Map([[gm.id, gm], [player.id, player]]);

	it("records whether the author is a GM", async () => {
		global.game.users = { get: id => users.get(id) };
		const actor = makeLedgerActor({ id: freshId("by-gm") });
		await appendLedgerEntries(actor, [{ action: "HP changed from 6 to 4" }], { userId: "gm" });
		await appendLedgerEntries(actor, [{ action: "Longsword selected" }], { userId: "pl" });
		const byAction = Object.fromEntries(actor.entries.map(e => [e.action, e.byGM]));
		expect(byAction).toEqual({ "HP changed from 6 to 4": true, "Longsword selected": false });
	});

	it("lets only a GM delete what a GM wrote; a player keeps their own and legacy unauthored ones", () => {
		global.game.users = { get: id => users.get(id) };
		const actor = { isOwner: true };
		expect(canDeleteLedgerEntry(actor, { byGM: true }, player)).toBe(false);
		expect(canDeleteLedgerEntry(actor, { byGM: true }, gm)).toBe(true);
		expect(canDeleteLedgerEntry(actor, { byGM: false }, player)).toBe(true);
		// Legacy: no byGM, so the author's role decides; no author at all stays deletable.
		expect(canDeleteLedgerEntry(actor, { userId: "gm" }, player)).toBe(false);
		expect(canDeleteLedgerEntry(actor, { userId: null }, player)).toBe(true);
		// Not an owner (#11): nothing.
		expect(canDeleteLedgerEntry({ isOwner: false }, { byGM: false }, player)).toBe(false);
	});

	it("deleteLedgerEntries skips what the user may not delete", async () => {
		const actor = makeLedgerActor({ id: freshId("gated"), isOwner: true, raw: {
			g: { id: "g", action: "HP changed from 6 to 4", timestamp: 2, byGM: true },
			p: { id: "p", action: "Longsword selected", timestamp: 1, byGM: false },
		} });

		const deleted = await deleteLedgerEntries(actor, new Set(["g", "p"]), { user: player });

		expect(deleted).toEqual(["p"]);
		expect(actions(actor)).toEqual(["HP changed from 6 to 4"]);
	});

	it("deletes from a legacy array by converting it", async () => {
		const actor = makeLedgerActor({ id: freshId("gated-legacy"), raw: [
			{ id: "a", action: "A cleared", timestamp: 2 },
			{ id: "b", action: "B cleared", timestamp: 1 },
		] });
		await deleteLedgerEntries(actor, new Set(["a"]), { user: gm });
		expect(actions(actor)).toEqual(["B cleared"]);
		expect(Array.isArray(actor.raw)).toBe(false);
	});
});

describe("value helpers", () => {
	it("never reads the legacy scope for a cut-over actor (#9)", () => {
		const stale = { flags: { stonetop: { inventory: { resources: { rope: 2 } } } } };
		expect(getActorProperty(stale, `flags.${SYSTEM_ID}.inventory.resources.rope`)).toBe(2);
		const cut = { flags: { stonetop: { inventory: { resources: { rope: 2 } } }, [SYSTEM_ID]: { [CUTOVER_KEY]: "stonetop" } } };
		expect(getActorProperty(cut, `flags.${SYSTEM_ID}.inventory.resources.rope`)).toBeUndefined();
	});

	it("treats a v14 deletion as blank, never as a value (#1)", () => {
		expect(isBlank(FD())).toBe(true);
		expect(formatValue(FD())).toBe("blank");
	});

	it("words a stored delta as the signed change it made (#21a), and folds a run of them", () => {
		expect(deltaEntry("Max HP (permanent)", 0, 4, "k").action).toBe("Max HP (permanent) +4");
		expect(deltaEntry("Max HP (permanent)", 4, 2, "k").action).toBe("Max HP (permanent) -2");
		const now = Date.now();
		const run = mergeRuns([
			{ ...deltaEntry("Max HP (permanent)", 4, 6, "k"), timestamp: now },
			{ ...deltaEntry("Max HP (permanent)", 0, 4, "k"), timestamp: now },
		]);
		expect(run.map(e => e.action)).toEqual(["Max HP (permanent) +6"]);
	});

	it("folds repeated edits of one thing into one line naming every field", () => {
		const now = Date.now();
		const run = mergeRuns([
			{ action: editAction("Longsword", ["uses"]), merge: editMerge("Longsword", "item:x", ["uses"]), timestamp: now },
			{ action: editAction("Longsword", ["description"]), merge: editMerge("Longsword", "item:x", ["description"]), timestamp: now },
		]);
		expect(run.map(e => e.action)).toEqual(["Longsword edited: description, uses"]);
	});
});

describe("ledgerNoun (#12)", () => {
	it("never cuts the subject inside somebody's quoted words", () => {
		expect(ledgerNoun("Wound recorded: \"Arm marked by fire\"")).toBe("Wound");
		expect(ledgerNoun("Lore: The Earth Mother answered: “She is set to return”")).toBe("Lore: The Earth Mother");
	});

	it("finds a subject in the phrasings that used to leave the whole line as one", () => {
		expect(ledgerNoun("Notes edited: “Fixed the mill”")).toBe("Notes");
		expect(ledgerNoun("Arcanum gained: The Key")).toBe("Arcanum");
		expect(ledgerNoun("Major arcanum chosen: The Hand")).toBe("Major arcanum");
		expect(ledgerNoun("Minor arcanum (found): The Key")).toBe("Minor arcanum (found)");
		expect(ledgerNoun("Max HP (permanent) +4")).toBe("Max HP (permanent)");
		expect(ledgerNoun("Sacred pouch: Heirloom carried")).toBe("Sacred pouch: Heirloom");
	});

	it("keeps the subjects it always found", () => {
		expect(ledgerNoun("HP changed from 5 to 3")).toBe("HP");
		expect(ledgerNoun("Asset added: Wagon")).toBe("Asset");
		expect(ledgerNoun("Lore: The Earth Mother: She provides marked")).toBe("Lore: The Earth Mother: She provides");
	});
});

describe("the ledger's own writes are marked as such (#15)", () => {
	it("tags appends and deletes with stonetopLedgerWrite", async () => {
		const actor = makeLedgerActor({ id: freshId("marked") });
		await appendLedgerEntries(actor, [{ action: "Name set to Pim" }]);
		await deleteLedgerEntries(actor, new Set([actor.entries[0].id]));
		expect(actor.updates.map(u => u.options.stonetopLedgerWrite)).toEqual([true, true]);
	});

	it("is not repainted for on other clients", () => {
		// The remote-repaint hook in stonetop.js: render:false updates repaint other clients'
		// sheets, and the ledger's write is render:false while drawing nothing on a sheet.
		const src = fs.readFileSync(path.resolve("stonetop.js"), "utf8");
		const at = src.indexOf("if (options?.render !== false || userId === game.user?.id) return;");
		expect(at).toBeGreaterThan(-1);
		const hook = src.slice(at, src.indexOf("\n});", at));
		expect(hook).toContain("if (options?.stonetopLedgerWrite) return;");
		expect(hook.indexOf("stonetopLedgerWrite")).toBeLessThan(hook.indexOf("app?.render?.(false)"));
	});
});

describe("getLedgerEntries", () => {
	it("takes the key as the id and skips anything that is not an entry", () => {
		const actor = makeLedgerActor({ raw: { k1: { id: "stale", action: "A cleared", timestamp: 1 }, junk: 5 } });
		expect(getLedgerEntries(actor)).toEqual([{ id: "k1", action: "A cleared", timestamp: 1 }]);
	});
});
