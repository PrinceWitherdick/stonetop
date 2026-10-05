import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
	moveRefreshUpdate, heldRefresh, packEntryFor, packMovesByName, refreshHeldMoves, refreshable, worldEntryFor,
} from "../../module/migration/move-refresh.js";
import { valueHash } from "../../module/migration/superseded-values.js";
import { deletionEntry } from "../../module/utils/foundry-compat.js";
import { SUPERSEDED } from "../../module/migration/data/superseded-move-fields.js";
import { ITEMS_PACK } from "../../module/system-id.js";
import { resetPackIndexFields } from "../../module/utils/pack-index.js";

// Moves and gear characters already hold, brought up to the pack: what it has gained is filled, and
// what it has changed or dropped is corrected where the copy still holds a value the pack once shipped.

const SCOPE = "stonetop_pwd";
const MADE = `flags.${SCOPE}.madeUnder`;
const move = (name, system = {}, extra = {}) => ({ _id: `id-${name}`, type: "move", name, system, flags: {}, ...extra });
const entry = (name, system = {}, extra = {}) => ({ _id: `pack-${name}`, name, type: "move", system, ...extra });
// What an update writes, without its id and the made-under stamp every write carries.
const written = update => {
	if (!update) return update;
	const { _id, [MADE]: _made, ...rest } = update;
	return rest;
};
// Former values as the generator lists them: path -> hashes.
const formerly = values => Object.fromEntries(Object.entries(values)
	.map(([path, list]) => [path, list.map(v => valueHash(v, { top: !path.includes(".") }))]));
// Whether an update deletes `path`, in whichever form the running core takes (deletionEntry).
const deletes = (update, path) => {
	const [key] = deletionEntry(path);
	return key in update;
};
const source = file => JSON.parse(readFileSync(new URL(`../../packs/src/stonetop-items/${file}`, import.meta.url), "utf8"));

describe("moveRefreshUpdate: filling", () => {
	it("fills a track and a no-XP miss the held copy lacks", () => {
		const update = moveRefreshUpdate(move("Battle Joy"), entry("Battle Joy", { noXpOnMiss: true, resource: { max: 2, title: "Joy" } }));
		expect(written(update)).toEqual({ "system.noXpOnMiss": true, "system.resource": { max: 2, title: "Joy" } });
	});

	it("leaves a field the copy already has when the pack never shipped that value", () => {
		const held = move("Stentorian", { resource: { max: 2, title: "Orders" } });
		expect(moveRefreshUpdate(held, entry("Stentorian", { resource: { max: 2, title: "Command" } }))).toBeNull();
	});

	it("counts an empty track and an explicit false as missing", () => {
		const held = move("Battle Joy", { resource: { max: 0 }, noXpOnMiss: false });
		expect(moveRefreshUpdate(held, entry("Battle Joy", { noXpOnMiss: true, resource: { max: 1 } })))
			.toMatchObject({ "system.noXpOnMiss": true, "system.resource": { max: 1 } });
	});

	it("never touches a player's own move, or a move the pack does not know", () => {
		const custom = move("Stentorian", {}, { flags: { [SCOPE]: { custom: true } } });
		expect(moveRefreshUpdate(custom, entry("Stentorian", { resource: { max: 2 } }))).toBeNull();
		expect(moveRefreshUpdate(move("Stentorian"), null)).toBeNull();
	});

	// The Ranger's: Pack Horse's +1 load (a stale copy read 3/6/9) and Walk It Off's one box, off the pack source.
	it("fills Pack Horse's load bonus and Walk It Off's box on copies taken before they shipped", () => {
		const packHorse = source("playbook-moves/the-ranger/pack-horse.json");
		const walkItOff = source("playbook-moves/the-ranger/walk-it-off.json");
		const held = s => move(s.name, { ...structuredClone(s.system), resource: null, loadBonus: 0 });
		expect(written(moveRefreshUpdate(held(packHorse), packHorse))).toEqual({ "system.loadBonus": 1 });
		expect(written(moveRefreshUpdate(held(walkItOff), walkItOff))).toEqual({ "system.resource": { max: 1, title: "Marked" } });
		expect(moveRefreshUpdate(move("Pack Horse", structuredClone(packHorse.system)), packHorse)).toBeNull();
	});

	// Armored's shield at ◆: a Marshal's copy from before it shipped still marked ◆◆ for a shield.
	// Three playbooks print the move, so each is matched by its own playbook.
	it("fills Armored's shield reduction on every playbook's copy, off the pack source", () => {
		const entries = ["the-heavy", "the-judge", "the-marshal"].map(p => source(`playbook-moves/${p}/armored.json`));
		const byName = packMovesByName(entries);
		for (const e of entries) {
			const held = move("Armored", { ...structuredClone(e.system), shieldLoadReduction: 0 });
			expect(packEntryFor(held, byName)).toBe(e);
			expect(written(moveRefreshUpdate(held, e))).toEqual({ "system.shieldLoadReduction": 1 });
		}
	});

	// Every other field a rule reads off the held copy, off the pack source: a copy holding only its
	// playbook (taken before any of them shipped) gets each one the pack carries.
	it.each([
		["the-heavy/cut-from-granite.json", { hpBonus: 2, armorBonus: 1 }],
		["the-heavy/uncanny-reflexes.json", { maxLoad: "normal", requiresUnarmored: true }],
		["the-fox/improved-stat.json", { cap: 2 }],
		["the-seeker/initiate-of-the-secret-arts.json", { crossPlaybook: { playbooks: ["The Blessed"], grantsPossession: "sacred-pouch" } }],
		["the-judge/a-mighty-rampart.json", { replaces: "Bulwark" }],
		["the-fox/ambush.json", { isStartingMove: true }],
		["the-marshal/veteran-crew.json", { markBudget: { base: 1, perExtra: 1 } }],
	])("fills %s on a copy taken before it shipped", (file, expected) => {
		const e = source(`playbook-moves/${file}`);
		const update = moveRefreshUpdate(move(e.name, { playbook: e.system.playbook }), e);
		for (const [field, value] of Object.entries(expected)) expect(update[`system.${field}`]).toEqual(value);
		// A copy already up to date is left alone.
		expect(moveRefreshUpdate(move(e.name, structuredClone(e.system)), e)).toBeNull();
	});

	it("fills the outcomes and the roll a hand-built post-death copy never had", () => {
		const e = entry("Unliving", { rollType: "CON", moveResults: { success: { value: "<p>Up.</p>" } }, description: "<p>D</p>" });
		const update = moveRefreshUpdate(move("Unliving", { moveType: "post-death", rollType: "", description: "<p>D</p>" }), e);
		expect(written(update)).toEqual({ "system.rollType": "CON", "system.moveResults": { success: { value: "<p>Up.</p>" } } });
	});

	it("hands out a copy, never the pack's own object", () => {
		const resource = { max: 2 };
		const update = moveRefreshUpdate(move("Stentorian"), entry("Stentorian", { resource }));
		expect(update["system.resource"]).toEqual(resource);
		expect(update["system.resource"]).not.toBe(resource);
	});
});

describe("moveRefreshUpdate: correcting what the pack shipped before", () => {
	it("corrects a track's size, and keeps a title the GM changed", () => {
		const e = entry("Unstoppable", { resource: { max: 5, title: "Marks" } });
		const former = formerly({ resource: [{ max: 6, title: "Marks" }], "resource.max": [6] });
		expect(written(moveRefreshUpdate(move("Unstoppable", { resource: { max: 6, title: "Marks" } }), e, former)))
			.toEqual({ "system.resource": { max: 5, title: "Marks" } });
		expect(written(moveRefreshUpdate(move("Unstoppable", { resource: { max: 6, title: "Circles" } }), e, former)))
			.toEqual({ "system.resource": { max: 5, title: "Circles" } });
		// A size no release shipped is the GM's.
		expect(moveRefreshUpdate(move("Unstoppable", { resource: { max: 7, title: "Marks" } }), e, former)).toBeNull();
	});

	it("reports a track it made smaller, and not one it made bigger", () => {
		const e = entry("Unstoppable", { resource: { max: 5 } });
		expect(heldRefresh(move("Unstoppable", { resource: { max: 6 } }), e, formerly({ "resource.max": [6] })).trackMax).toBe(5);
		expect(heldRefresh(move("Unstoppable", { resource: { max: 4 } }), e, formerly({ "resource.max": [4] })).trackMax).toBeNull();
	});

	it("retitles Rites of the Land's Favor, and titles an untitled one, as Boon", () => {
		const e = entry("Rites of the Land", { resource: { max: 4, title: "Boon" } });
		const former = formerly({ "resource.title": ["Favor", undefined] });
		for (const held of [{ max: 4, title: "Favor" }, { max: 4 }]) {
			expect(written(moveRefreshUpdate(move("Rites of the Land", { resource: held }), e, former)))
				.toEqual({ "system.resource": { max: 4, title: "Boon" } });
		}
	});

	it("adds a spend list to a track that predates it", () => {
		const e = entry("Stentorian", { resource: { max: 2, title: "Command", spendOptions: ["Go"] } });
		const former = formerly({ "resource.spendOptions": [undefined] });
		expect(written(moveRefreshUpdate(move("Stentorian", { resource: { max: 2, title: "Command" } }), e, former)))
			.toEqual({ "system.resource": { max: 2, title: "Command", spendOptions: ["Go"] } });
	});

	it("takes away a track the pack dropped, unless the GM made it their own", () => {
		const e = entry("Guardian", { description: "<p>G</p>" });
		const former = formerly({ resource: [{ max: 1, title: "Readiness" }] });
		expect(written(moveRefreshUpdate(move("Guardian", { description: "<p>G</p>", resource: { max: 1, title: "Readiness" } }), e, former)))
			.toEqual({ "system.resource": null });
		expect(moveRefreshUpdate(move("Guardian", { description: "<p>G</p>", resource: { max: 2, title: "Readiness" } }), e, former)).toBeNull();
	});

	it("brings a description up to the pack, through whitespace and markup the round trip changed", () => {
		const e = entry("Seek Insight", { description: "<p>Take advantage on your next move to act.</p>" });
		const former = formerly({ description: ["<p>Gain advantage on your next move that acts.</p>"] });
		const stale = move("Seek Insight", { description: "  <p>Gain advantage\non your  next move that acts.</p>" });
		expect(written(moveRefreshUpdate(stale, e, former))).toEqual({ "system.description": e.system.description });
		// A GM's own wording is left alone.
		expect(moveRefreshUpdate(move("Seek Insight", { description: "<p>House rule.</p>" }), e, former)).toBeNull();
		// Up to date is nothing to do.
		expect(moveRefreshUpdate(move("Seek Insight", { description: `${e.system.description} ` }), e, former)).toBeNull();
	});

	// A merge reaches every depth: a key gone from inside one tier must be deleted there, or the copy
	// ends up half old, half new.
	it("deletes a key the pack dropped from inside an outcome tier", () => {
		const e = entry("Hard to Kill", { moveResults: { partial: { value: "New 7-9" } } });
		const former = formerly({ "moveResults.partial": [{ value: "Old 7-9", pick: 2 }] });
		const update = written(moveRefreshUpdate(move("Hard to Kill", { moveResults: { partial: { value: "Old 7-9", pick: 2 } } }), e, former));
		expect(update["system.moveResults"]).toEqual({ partial: { value: "New 7-9" } });
		expect(deletes(update, "system.moveResults.partial.pick")).toBe(true);
		expect(deletes(update, "system.moveResults.partial.value")).toBe(false);
	});

	it("corrects the roll outcomes tier by tier", () => {
		const e = entry("Hard to Kill", { moveResults: { success: { value: "S" }, partial: { value: "New 7-9" } } });
		const former = formerly({ "moveResults.partial": [{ value: "Old 7-9" }] });
		const held = move("Hard to Kill", { moveResults: { success: { value: "My 10+" }, partial: { value: "Old 7-9" } } });
		expect(written(moveRefreshUpdate(held, e, former)))
			.toEqual({ "system.moveResults": { success: { value: "My 10+" }, partial: { value: "New 7-9" } } });
	});

	it("corrects a requirement and a mark list, and never the name, moveType or playbook", () => {
		const e = entry("Alpha", { playbook: "The Ranger", requirement: { level: 6, anyMoves: ["A", "B"] }, markOptions: [{ slug: "x", marks: 1 }] });
		const former = formerly({ requirement: [{ level: 6, moves: ["A", "B"] }], markOptions: [[{ slug: "x", marks: 3 }]] });
		const held = move("Alpha", { playbook: "The Ranger", moveType: "other", requirement: { level: 6, moves: ["A", "B"] }, markOptions: [{ slug: "x", marks: 3 }] });
		const update = written(moveRefreshUpdate(held, e, former));
		expect(update["system.markOptions"]).toEqual([{ slug: "x", marks: 1 }]);
		// `moves` must go, so the requirement is replaced rather than merged.
		expect(Object.entries(update).find(([k]) => k.endsWith("requirement"))[1]).toEqual({ level: 6, anyMoves: ["A", "B"] });
		expect(Object.keys(update).some(k => /moveType|playbook|name/.test(k))).toBe(false);
	});

	it("stamps the release a copy was made under once, before the write restamps it", () => {
		const e = entry("Battle Joy", { noXpOnMiss: true });
		const old = move("Battle Joy", {}, { _stats: { systemVersion: "1.6.0" } });
		expect(moveRefreshUpdate(old, e)[MADE]).toBe("1.6.0");
		const stamped = move("Battle Joy", {}, { _stats: { systemVersion: "1.7.1" }, flags: { [SCOPE]: { madeUnder: "1.6.0" } } });
		expect(moveRefreshUpdate(stamped, e)).not.toHaveProperty(MADE);
		// A copy older than `_stats` was stamped "", which reads as made before any release; the
		// next refresh must not overwrite it with the release the first one was restamped under.
		const blank = move("Battle Joy", {}, { _stats: { systemVersion: "1.7.1" }, flags: { [SCOPE]: { madeUnder: "" } } });
		expect(moveRefreshUpdate(blank, e)).not.toHaveProperty(MADE);
	});

	// Off the real generated data, against values the pack shipped before (git history).
	it.each([
		["playbook-moves/the-heavy/unstoppable.json", { resource: { max: 6, title: "Marks" } }, { "system.resource": { max: 5, title: "Marks" } }],
		["playbook-moves/the-heavy/guardian.json", { resource: { max: 1, title: "Readiness" } }, { "system.resource": null }],
		["playbook-moves/the-blessed/rites-of-the-land.json", { resource: { max: 4, title: "Favor" } }, { "system.resource": { max: 4, title: "Boon" } }],
	])("brings an old %s up to the pack, off the generated history", (file, stale, expected) => {
		const e = source(file);
		const held = move(e.name, { ...structuredClone(e.system), ...stale });
		expect(written(moveRefreshUpdate(held, e, SUPERSEDED[e._id]))).toEqual(expected);
	});

	it("brings an old Alpha's requirement up to the pack, off the generated history", () => {
		const e = source("playbook-moves/the-ranger/alpha.json");
		const held = move(e.name, { ...structuredClone(e.system), requirement: { level: 6, moves: ["Wild Speech", "Spirit Tongue"] } });
		const update = written(moveRefreshUpdate(held, e, SUPERSEDED[e._id]));
		expect(update["system.requirement"]).toEqual(e.system.requirement);
		// `moves` is gone from the pack's, so it is deleted rather than left to merge back in.
		expect(deletes(update, "system.requirement.moves")).toBe(true);
	});
});

describe("gear and treasures", () => {
	const SHIELD = "treasures-and-wonders/aratis-the-lawkeeper/aratis-the-lawkeeper-a-shield-of-makerglass-etched-with-aratis-s-symb.json";

	it("brings a treasure dropped on a sheet before the armor data up to the pack, flags and all", () => {
		const e = source(SHIELD);
		const oldNote = "indestructible, <em>+1 armor</em>, +1 Readiness of a Defend 7+, Value 2";
		const held = move(e.name, { moveType: "inventory-custom", isTreasure: true, inventoryColumn: "regular", weight: 2, note: oldNote },
			{ flags: { stonetop: { isTreasure: true, inventoryColumn: "regular", weight: 2, note: oldNote } } });
		const update = written(moveRefreshUpdate(held, e, SUPERSEDED[e._id]));
		expect(update).toMatchObject({
			"system.note": e.system.note, "flags.stonetop.note": e.system.note,
			"system.armor": { modifier: 1 }, "system.shield": true,
		});
	});

	it("turns a catalog armor's old stacking bonus into a base, dropping the bonus", () => {
		const e = source("inventory-items/cuirass-boiled-leather.json");
		const held = move(e.name, { moveType: "inventory" }, { flags: { stonetop: { ...structuredClone(e.flags.stonetop), armor: { modifier: 1 } } } });
		const update = written(moveRefreshUpdate(held, e, SUPERSEDED[e._id]));
		expect(update["flags.stonetop.armor"]).toEqual({ base: 1 });
		// The old modifier is deleted, not merged past, so it does not survive to stack on top.
		expect(deletes(update, "flags.stonetop.armor.modifier")).toBe(true);
	});

	// The treasure dialog lets a GM clear a treasure's armor, shield or track. Gear is filled only
	// where the pack itself once shipped it without, so a cleared field stays cleared.
	it("fills gear only where the pack once shipped it without, so what a GM cleared stays cleared", () => {
		const e = entry("A gold ring", { moveType: "inventory", isTreasure: true, armor: { modifier: 1 }, shield: true });
		const cleared = move("A gold ring", { moveType: "inventory-custom", isTreasure: true, armor: null, shield: false });
		expect(moveRefreshUpdate(cleared, e, {})).toBeNull();
		const predates = formerly({ armor: [undefined], shield: [undefined] });
		expect(written(moveRefreshUpdate(cleared, e, predates))).toEqual({ "system.armor": { modifier: 1 }, "system.shield": true });
	});

	it("leaves a write-up the GM edited", () => {
		const e = entry("A gold ring", { moveType: "inventory", isTreasure: true, artifactLore: "<p>Book.</p>" });
		const held = move("A gold ring", { moveType: "inventory-custom", isTreasure: true, artifactLore: "" }, { flags: { stonetop: { writeupEdited: true } } });
		expect(moveRefreshUpdate(held, e)).toBeNull();
	});

	it("never touches hand-written gear or what a special possession granted", () => {
		const e = entry("Shield", { moveType: "inventory", armor: { modifier: 1 }, shield: true });
		expect(refreshable(move("Shield", { moveType: "inventory-custom" }))).toBe(false);
		expect(refreshable(move("Shield", { moveType: "inventory-custom", isTreasure: true, sourcePossession: "x" }))).toBe(false);
		expect(moveRefreshUpdate(move("Shield", { moveType: "inventory-custom" }), e)).toBeNull();
	});
});

describe("packEntryFor", () => {
	it("tells two playbooks' moves of one name apart by playbook", () => {
		const byName = packMovesByName([
			entry("Twin", { playbook: "The Fox" }), entry("Twin", { playbook: "The Heavy" }), entry("Lone"),
			{ name: "Twin", type: "equipment" },
		]);
		expect(packEntryFor(move("Twin", { playbook: "The Heavy" }), byName).system.playbook).toBe("The Heavy");
		expect(packEntryFor(move("Twin", { playbook: "The Seeker" }), byName)).toBeNull();
		expect(packEntryFor(move("Lone"), byName).name).toBe("Lone");
	});

	it("matches a move to a move and gear to gear only", () => {
		const byName = packMovesByName([entry("Shield", { moveType: "inventory" })]);
		expect(packEntryFor(move("Shield", { moveType: "other" }), byName)).toBeNull();
		expect(packEntryFor(move("Shield", { moveType: "inventory" }), byName).name).toBe("Shield");
	});

	it("matches a playbook-less post-death copy to a name two inserts share only when they are the same move", () => {
		const same = packMovesByName([
			entry("Unliving", { playbook: "ghost", description: "<p>U</p>" }), entry("Unliving", { playbook: "revenant", description: "<p>U</p>" }),
		]);
		expect(packEntryFor(move("Unliving", { moveType: "post-death" }), same)?.system.playbook).toBe("ghost");
		const differ = packMovesByName([
			entry("Twin", { playbook: "ghost", description: "<p>A</p>" }), entry("Twin", { playbook: "revenant", description: "<p>B</p>" }),
		]);
		expect(packEntryFor(move("Twin", { moveType: "post-death" }), differ)).toBeNull();
	});

	it("matches a lore move by its lore option", () => {
		const byName = packMovesByName([
			entry("Fury", { playbook: "ghost", loreOption: "consequences:a" }), entry("Fury", { playbook: "revenant", loreOption: "consequences:b" }),
		]);
		expect(packEntryFor(move("Fury", { loreOption: "consequences:b" }), byName).system.playbook).toBe("revenant");
	});

	it("finds a sidebar copy by the compendium it came from first", () => {
		const e = entry("A gold ring", { moveType: "inventory", isTreasure: true });
		const byId = new Map([[e._id, e]]);
		const item = move("Renamed ring", { moveType: "inventory", isTreasure: true }, { _stats: { compendiumSource: `Compendium.${SCOPE}.stonetop-items.Item.${e._id}` } });
		expect(worldEntryFor(item, packMovesByName([e]), byId)).toBe(e);
	});

	it("leaves a sidebar item copied from some other pack, whatever its name", () => {
		const e = entry("A gold ring", { moveType: "inventory", isTreasure: true });
		const item = move("A gold ring", { moveType: "inventory" }, { _stats: { compendiumSource: `Compendium.${SCOPE}.stonetop-arcana.Item.zzz` } });
		expect(worldEntryFor(item, packMovesByName([e]), new Map([[e._id, e]]))).toBeNull();
	});
});

describe("refreshHeldMoves", () => {
	const character = (items, extra = {}) => ({ type: "character", name: "PC", items, updateEmbeddedDocuments: vi.fn(async () => {}), update: vi.fn(async () => {}), ...extra });

	it("writes each character with something stale once, and skips everyone else", async () => {
		const stale = character([move("Stentorian"), move("Clash")]);
		const fresh = character([move("Stentorian", { resource: { max: 2 } })]);
		const npc = { type: "npc", items: [move("Stentorian")], updateEmbeddedDocuments: vi.fn() };
		const entries = [entry("Stentorian", { resource: { max: 2, title: "Command" } }), entry("Clash")];
		expect(await refreshHeldMoves({ actors: [stale, fresh, npc], items: [], entries, superseded: {} })).toBe(1);
		// Quiet in the ledger: the pack's text refreshing is not an edit anybody made.
		expect(stale.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [
			{ _id: "id-Stentorian", [MADE]: "", "system.resource": { max: 2, title: "Command" } },
		], { stonetopLedger: true });
		expect(fresh.updateEmbeddedDocuments).not.toHaveBeenCalled();
		expect(npc.updateEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("clamps the pips on a track it made smaller, in one quiet write", async () => {
		const clamp = { "flags.stonetop_pwd.moves.backgroundChoices.Unstoppable": 5 };
		const heldTrackClampData = vi.fn(() => clamp);
		const pc = character([move("Unstoppable", { resource: { max: 6 } })], { typedActor: { heldTrackClampData } });
		const entries = [entry("Unstoppable", { resource: { max: 5 } })];
		await refreshHeldMoves({ actors: [pc], items: [], entries, superseded: { "pack-Unstoppable": formerly({ "resource.max": [6] }) } });
		expect(heldTrackClampData).toHaveBeenCalledWith([{ item: pc.items[0], max: 5 }]);
		expect(pc.update).toHaveBeenCalledWith(clamp, { stonetopLedger: true });
	});

	it("plans without writing on a dry run, and finds nothing the second time", async () => {
		const pc = character([move("Stentorian")]);
		const entries = [entry("Stentorian", { resource: { max: 2 } })];
		const plan = await refreshHeldMoves({ actors: [pc], items: [], entries, superseded: {}, dryRun: true });
		expect(plan).toEqual([{ where: "PC", updates: [expect.objectContaining({ "system.resource": { max: 2 } })] }]);
		expect(pc.updateEmbeddedDocuments).not.toHaveBeenCalled();
		const done = character([move("Stentorian", { resource: { max: 2 } }, { flags: { [SCOPE]: { madeUnder: "" } } })]);
		expect(await refreshHeldMoves({ actors: [done], items: [], entries, superseded: {}, dryRun: true })).toEqual([]);
	});

	it("refreshes the Items sidebar's copies in one call", async () => {
		const saved = globalThis.Item;
		globalThis.Item = { updateDocuments: vi.fn(async () => []) };
		try {
			const entries = [entry("Shield", { moveType: "inventory", shield: true })];
			const items = [move("Shield", { moveType: "inventory" })];
			// The pack once shipped the Shield with no `shield`, so a copy without one is filled.
			const superseded = { "pack-Shield": formerly({ shield: [undefined] }) };
			expect(await refreshHeldMoves({ actors: [], items, entries, superseded })).toBe(1);
			expect(globalThis.Item.updateDocuments).toHaveBeenCalledWith([expect.objectContaining({ "system.shield": true })]);
		} finally { globalThis.Item = saved; }
	});

	// One document refusing its write: the others are still written, and the sweep throws so the
	// once-per-version gate tries again next load rather than stamping it done.
	it("writes every other character when one refuses, then fails so it is tried again", async () => {
		const broken = character([move("Stentorian")], { name: "Broken" });
		broken.updateEmbeddedDocuments = vi.fn(async () => { throw new Error("locked"); });
		const fine = character([move("Stentorian")], { name: "Fine" });
		const entries = [entry("Stentorian", { resource: { max: 2 } })];
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(refreshHeldMoves({ actors: [broken, fine], items: [], entries, superseded: {} })).rejects.toThrow(/Broken/);
		expect(fine.updateEmbeddedDocuments).toHaveBeenCalled();
		spy.mockRestore();
	});

	describe("reading the pack", () => {
		let savedPacks;
		beforeEach(() => { savedPacks = globalThis.game.packs; resetPackIndexFields(); });
		afterEach(() => { globalThis.game.packs = savedPacks; resetPackIndexFields(); });

		it("reads the items pack's index", async () => {
			const index = [entry("Stentorian", { resource: { max: 2 } })];
			globalThis.game.packs = new Map([[ITEMS_PACK, { index, getIndex: vi.fn(async () => index) }]]);
			const stale = character([move("Stentorian")]);
			expect(await refreshHeldMoves({ actors: [stale], items: [] })).toBe(1);
		});

		// Thrown, so the once-per-version gate retries on the next load rather than stamping a sweep
		// that never looked.
		it("throws with no pack to read", async () => {
			globalThis.game.packs = new Map();
			await expect(refreshHeldMoves({ actors: [] })).rejects.toThrow(/not available/);
		});
	});
});
