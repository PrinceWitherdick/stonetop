// @vitest-environment happy-dom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import { describe, expect, it, vi } from "vitest";

import { StonetopSteading, IMPROVEMENT_DEFINITIONS } from "../../../module/actors/steading/StonetopSteading.js";
import { improvementRequirementProgress, statChangeLine, listChangeLine } from "../../../module/utils/improvement-def.js";

// The Improvements tab for a player on a magnifier and a keyboard (audit 2026-10-03): a card that
// opens from the keyboard and says whether it is open, a complete box with a name, where each
// improvement stands said in words rather than in opacity and border colour, and stat changes
// said as the transition they make. The snapshot computes the words; the template only prints them.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = rel => fs.readFileSync(path.resolve(HERE, "../../..", rel), "utf8");
const TPL = read("templates/actor/partials/steading-tab-improvements.hbs");
const SHEET_JS = read("module/actors/steading/StonetopSteadingSheet.js");
const CSS = read("styles/stonetop.css");

function actorWith(steading = {}) {
	const actor = {
		id: "st-a11y",
		type: "stonetop",
		system: {},
		flags: { "stonetop-pwd": { steading: structuredClone(steading) } },
		getFlag: (scope, key) => actor.flags["stonetop-pwd"]?.[key],
		update: vi.fn(() => Promise.resolve()),
		setFlag: vi.fn(() => Promise.resolve()),
	};
	return actor;
}

const hbs = Handlebars.create();
for (const [, name] of TPL.matchAll(/\{\{>\s*"([^"]+)"/g)) hbs.registerPartial(name, "");
hbs.registerHelper("and", (a, b) => a && b);
const renderTab = hbs.compile(TPL);

/** The tab, rendered off the file that ships over the snapshot's own cards. */
async function tabFor(steading, { open = [] } = {}) {
	const snapshot = await new StonetopSteading(actorWith(steading)).buildSnapshot();
	const improvements = snapshot.improvements.map(imp => ({
		...imp, isOpen: open.includes(imp.slug), domId: `sheet-imp-${imp.slug}`,
	}));
	const html = renderTab({ stonetop: { improvements, improvementCategories: [], canEdit: true, edit: { improvements: false } } });
	const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
	return { snapshot, doc, card: slug => doc.querySelector(`.steading-improvement[data-slug="${slug}"]`) };
}

describe("how far along an improvement is, counted the way it is met", () => {
	const def = sections => ({ sections });

	it("counts every box of an all-of section", () => {
		expect(improvementRequirementProgress(def([{ items: ["a", "b", "c"] }]), [true, false, true]))
			.toEqual({ ticked: 2, needed: 3 });
	});

	it("counts a min-of section to its minimum, not past it", () => {
		const d = def([{ min: 2, items: ["a", "b", "c", "d"] }]);
		expect(improvementRequirementProgress(d, [true, false, false, false])).toEqual({ ticked: 1, needed: 2 });
		expect(improvementRequirementProgress(d, [true, true, true, false])).toEqual({ ticked: 2, needed: 2 });
	});

	it("counts the either/or closest to met, once, rather than both ways", () => {
		const d = def([
			{ group: "g", items: ["one way"] },
			{ group: "g", items: ["x", "y", "z"] },
			{ items: ["and this"] },
		]);
		// Both ways are one box short; the one with more done is the one being pursued.
		expect(improvementRequirementProgress(d, [false, true, true, false, false])).toEqual({ ticked: 2, needed: 4 });
		expect(improvementRequirementProgress(d, [true, true, true, false, false])).toEqual({ ticked: 1, needed: 2 });
		expect(improvementRequirementProgress(d, [false, false, false, false, true])).toEqual({ ticked: 1, needed: 2 });
	});

	it("is 0 of 0 for an improvement with no requirements", () => {
		expect(improvementRequirementProgress(def([]), [])).toEqual({ ticked: 0, needed: 0 });
	});
});

describe("the card's status, in words, off the snapshot", () => {
	it("says Built, Ready, or N of M ticked", async () => {
		const { snapshot } = await tabFor({
			improvements: {
				palisade: { completed: true, r: [true], applied: null },
				raincatching: { completed: false, r: [true, true] },
				mill: { completed: false, r: [] },
			},
		});
		const status = slug => snapshot.improvements.find(i => i.slug === slug).status;
		expect(status("palisade")).toEqual({ kind: "built", text: "Built" });
		const rain = IMPROVEMENT_DEFINITIONS.find(d => d.slug === "raincatching");
		const millDef = IMPROVEMENT_DEFINITIONS.find(d => d.slug === "mill");
		const millNeed = improvementRequirementProgress(millDef, []).needed;
		expect(status("mill")).toEqual({ kind: "progress", text: `0 of ${millNeed} ticked` });
		// Raincatching's two boxes ticked: whatever it needs, the words agree with the rule.
		const rainProgress = improvementRequirementProgress(rain, [true, true]);
		expect(status("raincatching").text).toBe(rainProgress.ticked >= rainProgress.needed
			? "Ready to mark complete" : `${rainProgress.ticked} of ${rainProgress.needed} ticked`);
	});

	it("offers the built Inn's name, and the name it already has", async () => {
		const { snapshot } = await tabFor({
			improvements: { inn: { completed: true, r: [], applied: { resources: ["The Wisent's Rest (the inn)"] }, name: "The Wisent's Rest" } },
		});
		expect(snapshot.improvements.find(i => i.slug === "inn").innName).toEqual({ name: "The Wisent's Rest" });
		const unbuilt = (await tabFor({})).snapshot.improvements.find(i => i.slug === "inn");
		expect(unbuilt.innName).toBeNull();
	});
});

describe("the card, rendered off the template that ships", () => {
	it("opens from a real button that says whether it is open, and what it opens", async () => {
		const { card } = await tabFor({}, { open: ["mill"] });
		const shut = card("palisade").querySelector(".steading-improvement-header > button.steading-improvement-toggle");
		expect(shut.getAttribute("type")).toBe("button");
		expect(shut.getAttribute("aria-expanded")).toBe("false");
		expect(shut.getAttribute("aria-label")).toMatch(/^Palisade/);
		const body = card("palisade").querySelector(".steading-improvement-body");
		expect(shut.getAttribute("aria-controls")).toBe(body.id);
		expect(card("mill").querySelector(".steading-improvement-toggle").getAttribute("aria-expanded")).toBe("true");
		// Down while shut; the open card's rotation turns it up (see the stylesheet pin below).
		expect(shut.querySelector("i").classList.contains("fa-chevron-down")).toBe(true);
	});

	it("names the complete box and points it at the status line", async () => {
		const { card, doc } = await tabFor({ improvements: { mill: { completed: false, r: [] } } });
		const box = card("mill").querySelector("input.steading-improvement-complete");
		expect(box.getAttribute("aria-label")).toBe("Mark Mill complete");
		const status = doc.getElementById(box.getAttribute("aria-describedby"));
		expect(status?.textContent.trim()).toMatch(/^0 of \d+ ticked$/);
		// Locked: a lock glyph in the box, not a halved opacity.
		expect(card("mill").querySelector(".steading-improvement-complete-label .steading-improvement-lock")).not.toBeNull();
	});

	it("says Built on a built card, without a lock", async () => {
		const { card } = await tabFor({ improvements: { palisade: { completed: true, r: [true], applied: null } } });
		expect(card("palisade").querySelector(".steading-improvement-status").textContent.trim()).toBe("Built");
		expect(card("palisade").querySelector(".steading-improvement-lock")).toBeNull();
	});

	it("hides every decorative glyph from a screen reader", async () => {
		const { doc } = await tabFor({
			herd: { grown: 12, yearlings: 0, foals: 0 },
			improvements: {
				herdOfHorses: { completed: true, r: [], applied: null },
				inn: { completed: true, r: [], applied: { resources: ["Inn"] } },
			},
		});
		const loud = [...doc.querySelectorAll("i")].filter(i => i.getAttribute("aria-hidden") !== "true");
		expect(loud.map(i => i.className)).toEqual([]);
	});

	it("names the herd's count boxes", async () => {
		const { card } = await tabFor({
			herd: { grown: 12, yearlings: 0, foals: 0 },
			improvements: { herdOfHorses: { completed: true, r: [], applied: null } },
		});
		const inputs = [...card("herdOfHorses").querySelectorAll("input.steading-herd-input")];
		expect(inputs.length).toBe(3);
		for (const input of inputs) expect(input.getAttribute("aria-label")).toMatch(/: how many$/);
	});

	it("gives the built Inn a button to name it later", async () => {
		const { card } = await tabFor({ improvements: { inn: { completed: true, r: [], applied: { resources: ["Inn"] } } } });
		const btn = card("inn").querySelector("button.steading-inn-name-btn");
		expect(btn.textContent.trim()).toBe("Name the inn");
		expect(btn.dataset.current).toBe("");
	});

	it("labels the filter by what it hides", () => {
		expect(TPL).toContain("Hide improvements not started");
		expect(TPL).not.toContain("un-earned improvements\n");
	});
});

describe("the sheet's wiring", () => {
	it("keeps the toggle button's aria-expanded in step with the card", () => {
		expect(SHEET_JS).toMatch(/\.steading-improvement-toggle"\)\?\.setAttribute\("aria-expanded"/);
	});

	it("routes every list write through the steading's turn", () => {
		for (const name of ["_onListItemCheck", "_onListItemDelete"]) {
			const body = SHEET_JS.slice(SHEET_JS.indexOf(`async ${name}(`), SHEET_JS.indexOf(`async ${name}(`) + 400);
			expect(body, name).toContain("editList(");
			expect(body, name).not.toContain("setFlags(");
		}
	});

	it("names the Inn from its card through the same ask as at build time", () => {
		expect(SHEET_JS).toMatch(/closest\("\.steading-inn-name-btn"\)/);
		expect(SHEET_JS).toMatch(/async _onNameInn\(current = ""\)/);
	});
});

describe("the stylesheet", () => {
	const rule = sel => {
		const at = CSS.indexOf(`\n${sel} {`);
		return at < 0 ? "" : CSS.slice(at, CSS.indexOf("}", at));
	};

	it("no longer dims a locked box", () => {
		expect(CSS).not.toMatch(/is-locked \.steading-improvement-complete[^{]*\{\s*opacity:\s*0\.5/);
	});

	it("keeps a shut card its own height", () => {
		expect(rule(".steading-improvements-grid")).toMatch(/align-items:\s*start/);
	});

	it("rings the tab's controls on keyboard focus", () => {
		const at = CSS.indexOf(".steading-improvement-toggle:focus-visible,");
		expect(at).toBeGreaterThan(-1);
		const block = CSS.slice(at, CSS.indexOf("}", at));
		for (const sel of [".steading-improvement-edit:focus-visible", ".steading-improvement-remove:focus-visible",
			"input[type=\"checkbox\"].steading-improvement-complete:focus-visible", ".stonetop-prep-add-btn:focus-visible"]) {
			expect(block).toContain(sel);
		}
		expect(block).toMatch(/outline:\s*2px solid var\(--st-btn-primary-border/);
		expect(CSS).toMatch(/\.stonetop-tab-search:has\(:focus-visible\)\s*\{\s*outline:\s*2px solid/);
	});

	it("never paints the bare light hover grey, which vanished under a dark-mode label", () => {
		expect(CSS).not.toMatch(/background:\s*hsl\(210 10% 92%\)/);
	});

	it("moved the herd-count width off the two templates' inline styles", () => {
		for (const file of ["templates/dialogs/requisition-picker.hbs", "templates/dialogs/expedition.hbs"]) {
			const src = read(file);
			expect(src).toContain("stonetop-requisition-herd-count");
			expect(src).not.toMatch(/name="herdCount"[^>]*style=/);
		}
		expect(rule(".stonetop-requisition-herd-count")).toMatch(/width:\s*4em/);
	});
});

describe("words on the cards and in the notices", () => {
	it("prints no em dash on a built-in card", () => {
		for (const def of IMPROVEMENT_DEFINITIONS) {
			const text = [def.label, def.flavor, def.effect, ...def.sections.flatMap(s => [s.heading, ...s.items])].join("\n");
			expect(text, def.slug).not.toContain("—");
		}
	});

	it("says a stat change as before → after, and a list change as a sentence", () => {
		expect(statChangeLine("fortunes", 1, 2)).toBe("Fortunes +1 → +2");
		expect(statChangeLine("prosperity", 0, -1)).toBe("Prosperity +0 → −1");
		expect(listChangeLine("Mill", "resources", true)).toBe("Mill added to Resources");
		expect(listChangeLine("Palisade", "fortifications", false)).toBe("Palisade removed from Fortifications");
	});

	it("reads a revert's stats off the live values, the other way round", async () => {
		const actor = actorWith({
			system: { stats: { fortunes: { value: 3 } } },
			fortifications: [{ name: "Palisade", checked: true }],
			improvements: { palisade: { completed: true, r: [true], applied: { stats: { fortunes: 1 }, fortifications: ["Palisade"] } } },
		});
		expect(new StonetopSteading(actor).improvementGivesBack("palisade"))
			.toEqual(["Fortunes +3 → +2", "Palisade removed from Fortifications"]);
	});
});
