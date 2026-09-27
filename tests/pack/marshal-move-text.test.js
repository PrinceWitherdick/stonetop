// The Marshal's move text, marked up as the playbook sheet prints it: the whole trigger in bold
// italics, a second trigger too, and the sheet's own words for We Happy Few's 6-.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const move = slug => JSON.parse(fs.readFileSync(
	path.join(ROOT, "packs/src/stonetop-items/playbook-moves/the-marshal", `${slug}.json`), "utf8"));
const exported = name => (JSON.parse(fs.readFileSync(path.join(ROOT, "data/playbook-moves.json"), "utf8"))["The Marshal"] ?? [])
	.find(m => m.name === name);

describe("the Marshal's move text", () => {
	it("bolds Shake It Off's whole trigger, not half its list", () => {
		const text = move("shake-it-off").system.description;
		expect(text).toContain("<strong><em>order an ally to overcome fear, pain, doubt, or delusion</em></strong>, roll +CHA");
	});

	it("marks Shield Wall's second trigger as the sheet does", () => {
		expect(move("shield-wall").system.description)
			.toContain("<strong><em>As long as they maintain formation</em></strong>, they can go on the offensive");
	});

	it("says We Happy Few's 6- in the sheet's words", () => {
		expect(move("we-happy-few").system.description).toContain("until you share your nagging doubts with someone else");
	});

	it("carries the fixes into the generated data export", () => {
		expect(exported("Shake It Off")?.description ?? "").toContain("fear, pain, doubt, or delusion</em></strong>");
		expect(exported("Shield Wall")?.description ?? "").toContain("<strong><em>As long as they maintain formation</em></strong>");
	});
});
