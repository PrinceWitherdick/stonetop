import { describe, it, expect, beforeAll } from "vitest";
import { codexAddLine, codexRemoveLine } from "../../module/actors/bestiary/codex.js";

// A prep-line field ("Hooks"/"Origins") stores its rows as one newline-joined string,
// so the "Add Line" button adds a row by appending a trailing "\n". A default Foundry
// StringField trims trailing whitespace, which silently ate that newline — the write was
// a no-op and the button appeared dead. These tests guard both halves of the fix:
//   1. the schema opts those fields out of trimming, and
//   2. add/remove operate on the joined string as expected.

// Option-capturing stand-ins so BestiaryPageModel.defineSchema() runs under the node
// harness (which has no real Foundry data layer). We only read back the declared options.
class FakeField {
	constructor(opts = {}) { Object.assign(this, opts); }
}

function fakeActor(system = {}) {
	const actor = { system, updates: [] };
	actor.update = async (data) => {
		actor.updates.push(data);
		for (const [key, value] of Object.entries(data)) actor.system[key.replace(/^system\./, "")] = value;
	};
	return actor;
}

// Stand-in for the sheet root: querySelector(section) -> querySelectorAll(line inputs).
function fakeRoot(field, values) {
	const inputs = values.map(value => ({ value }));
	return {
		querySelector: sel => sel === `[data-line-field="${field}"]` ? { querySelectorAll: () => inputs } : null,
	};
}

describe("bestiary page prep-line fields", () => {
	let schema;
	beforeAll(async () => {
		global.foundry.data.fields = {
			StringField: FakeField,
			HTMLField: FakeField,
			ArrayField: class { constructor(element, opts = {}) { this.element = element; Object.assign(this, opts); } },
			SchemaField: class { constructor(fields, opts = {}) { this.fields = fields; Object.assign(this, opts); } },
		};
		global.foundry.abstract = { TypeDataModel: class {} };
		const { BestiaryPageModel } = await import("../../module/journal/BestiaryPageModel.js");
		schema = BestiaryPageModel.defineSchema();
	});

	it("hooks and origins opt out of string trimming so a trailing blank line survives", () => {
		expect(schema.origins.trim).toBe(false);
		expect(schema.hooks.trim).toBe(false);
	});

	it("leaves other string fields on the default (trimming) behaviour", () => {
		expect(schema.concept.trim).toBeUndefined();
	});

	it("codexAddLine appends a blank line to the joined string", async () => {
		const actor = fakeActor({ origins: "first" });
		await codexAddLine(actor, "origins");
		expect(actor.updates).toEqual([{ "system.origins": "first\n" }]);
	});

	it("codexAddLine ignores fields that are not prep-line fields", async () => {
		const actor = fakeActor({ description: "x" });
		await codexAddLine(actor, "description");
		expect(actor.updates).toEqual([]);
	});

	it("codexRemoveLine drops the clicked row and re-joins the rest", async () => {
		const actor = fakeActor({ origins: "a\nb\nc" });
		await codexRemoveLine(actor, fakeRoot("origins", ["a", "b", "c"]), "origins", 1);
		expect(actor.updates).toEqual([{ "system.origins": "a\nc" }]);
	});

	it("codexRemoveLine reads the live inputs so unsaved edits in other rows survive", async () => {
		const actor = fakeActor({ origins: "a\nb\nc" });
		// The DOM holds an edit ("aX") not yet persisted; deleting row 2 must keep it.
		await codexRemoveLine(actor, fakeRoot("origins", ["aX", "b", "c"]), "origins", 2);
		expect(actor.updates).toEqual([{ "system.origins": "aX\nb" }]);
	});

	it("codexRemoveLine ignores a NaN index and unknown fields", async () => {
		const actor = fakeActor({ origins: "a\nb" });
		await codexRemoveLine(actor, fakeRoot("origins", ["a", "b"]), "origins", NaN);
		await codexRemoveLine(actor, fakeRoot("nope", ["a"]), "nope", 0);
		expect(actor.updates).toEqual([]);
	});
});
