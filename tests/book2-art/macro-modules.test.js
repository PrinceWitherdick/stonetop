import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MACRO_MODULES } from "../../module/book2-art/macro-modules.js";
import * as journalSyncCore from "../../module/hooks/journal-sync-core.js";
import * as worldJournalArt from "../../module/book2-art/world-journal-art.js";
import * as posterMaps from "../../module/book2-art/poster-maps.js";
import * as timelineStore from "../../module/timeline/timeline-store.js";

// The Import Book Art macro borrows three system modules. In a bundled release, importing them by
// path would load second copies with their own caches, so the system hands them over on
// game.stonetop.macroModules instead. See module/book2-art/macro-modules.js.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const COMMAND = JSON.parse(read("packs/src/stonetop-macros/import-book2-art.json")).command;
const FIXTURES = read("scripts/local/create-test-characters.js");

// Each loader, what the macro destructures from it, and the module it has to be.
const BORROWED = [
	{ key: "journalSyncCore", name: "managedHash", module: journalSyncCore },
	{ key: "worldJournalArt", name: "codexFieldWithArt", module: worldJournalArt },
	{ key: "posterMaps", name: "upsertPosterMapScene", module: posterMaps },
];

describe("the modules the Import Book Art macro borrows", () => {
	it("are these three, beside the test-fixtures macro's timeline", () => {
		expect(Object.keys(MACRO_MODULES).sort()).toEqual([...BORROWED.map((b) => b.key), "timeline"].sort());
	});

	it.each(BORROWED)("$key loads the system's own copy of the module, with $name on it", async ({ key, name, module }) => {
		const loaded = await MACRO_MODULES[key]();
		expect(typeof loaded[name]).toBe("function");
		// The same function object, so the same module instance: no second copy.
		expect(loaded[name]).toBe(module[name]);
	});

	it.each(BORROWED)("the shipped macro takes $name from macroModules.$key before importing its path", ({ key, name }) => {
		expect(COMMAND).toContain(`({ ${name} } = await (game.stonetop?.macroModules?.${key}?.() ?? import(route)));`);
		expect(COMMAND).not.toContain(`({ ${name} } = await import(route));`);
	});

	it("are put on game.stonetop at ready", () => {
		expect(read("module/hooks/Ready.js")).toMatch(/game\.stonetop\.macroModules\s*=\s*MACRO_MODULES;/);
	});

	it("leave the shipped macro a command that still parses", () => {
		const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
		expect(() => new AsyncFunction(COMMAND)).not.toThrow();
	});
});

describe("the timeline the test-fixtures macro borrows", () => {
	it("is the system's own store, so its writes take turns with the system's", async () => {
		const loaded = await MACRO_MODULES.timeline();
		expect(loaded.mutateTrack).toBe(timelineStore.mutateTrack);
		for (const name of ["findTrackPage", "trackForActor", "readEntries", "upsertByKey", "patchEntry", "removeEntry",
			"seasonLabel", "seasonEntryBody", "expeditionMilestone", "siteVisitMilestone"]) {
			expect(typeof loaded[name], name).toBe("function");
		}
		// The cleanup keeps the journal holding the world's custom tags.
		expect(loaded.TIMELINE_TAGS_FLAG).toBe("timelineTags");
	});

	it("is taken from macroModules rather than imported by path", () => {
		expect(FIXTURES).toContain("game.stonetop?.macroModules?.timeline?.()");
		expect(FIXTURES).not.toMatch(/import\(["'`][^"'`]*timeline/);
	});
});
