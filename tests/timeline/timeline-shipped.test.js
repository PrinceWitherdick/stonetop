import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { readRepo } from "../fakes/css.js";

// THE TIMELINE IS SHIPPED. It spent a release dark behind a world switch (`timelineEnabled`) with
// its page type cut from the manifest, and both halves of that had to come out together: a manifest
// with the type but code still gated is a "Timeline" in core's Create Page menu that nothing draws,
// and code ungated with no manifest type is a tab that says its thread has no page, forever.
//
// So this pins the shipped state from both sides, and pins that the switch is GONE rather than
// defaulted on: a switch left lying around is a door somebody turns off again by accident.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function filesUnder(rel, ext) {
	const out = [];
	const walk = dir => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) walk(full);
			else if (ext.some(x => e.name.endsWith(x))) out.push(full);
		}
	};
	walk(path.join(ROOT, rel));
	return out;
}

describe("the manifest declares the timeline", () => {
	// ⚠ A new subtype here needs a WORLD RELAUNCH, not a reload: the valid-type list is built when
	// the world is launched. A GM updating mid-session sees the tab say it has no page until then.
	it("declares the timeline page type", () => {
		const manifest = JSON.parse(readRepo("system.json"));
		expect(manifest.documentTypes.JournalEntryPage).toHaveProperty("timeline");
	});

	it("labels it, so core's Create Page menu does not print a raw key", () => {
		const en = JSON.parse(readRepo("languages/en.json"));
		expect(en.TYPES.JournalEntryPage.timeline).toBe("Timeline");
	});
});

describe("the dark switch is gone", () => {
	it("leaves no trace of the old switches in the shipped code", () => {
		const files = [
			...filesUnder("module", [".js"]),
			...filesUnder("templates", [".hbs"]),
			path.join(ROOT, "stonetop.js"),
		];
		const offenders = files.filter(file => /isTimelineEnabled|timelineEnabled|timelineAutoRows/.test(fs.readFileSync(file, "utf8")));
		expect(offenders.map(f => path.relative(ROOT, f))).toEqual([]);
	});

	// The page model and sheet registration used to sit inside `if (isTimelineEnabled())`.
	it("registers the page model and its sheet unconditionally", () => {
		const src = readRepo("stonetop.js");
		const line = src.split("\n").find(l => l.includes('CONFIG.JournalEntryPage.dataModels["timeline"]'));
		expect(line, "the timeline page model is not registered").toBeTruthy();
		// One tab deep: the init hook's own body, not inside a nested block.
		expect(line.match(/^\t*/)[0]).toBe("\t");
	});

	it("draws the Timeline tab on both sheets in the modern layout", () => {
		for (const rel of ["templates/actor/character.hbs", "templates/actor/steading.hbs"]) {
			const lines = readRepo(rel).split("\n").filter(l => l.includes("timeline"));
			expect(lines.length, `${rel} has no timeline tab`).toBeGreaterThanOrEqual(2);
			for (const l of lines) expect(l.trim().startsWith("{{#unless stonetop.classicLayout}}"), l).toBe(true);
		}
	});
});

describe("the season log", () => {
	it("keeps logging when each season began", () => {
		// `seasonLogUpdate` rides along with the one write that moves the campaign's clock. It is the
		// system's only record of WHEN a season turned, and it can only be collected as it happens:
		// the level-up backfill dates a world's past from it. See timeline/timeline-seasons.js.
		const src = readRepo("module/seasons/current-season.js");
		expect(src).toContain("Object.assign(flags, seasonLogUpdate(actor, next) ?? {});");
	});
});
