import { describe, it, expect, beforeAll } from "vitest";
import { grantsToCreate } from "../../module/actors/character/possession-grants.js";

// MoveModel reads `foundry.data.fields` at IMPORT time (so does the shared fields.js it
// pulls in), and the node suite has no Foundry. Stub the field constructors — the schema
// only has to be enumerable here, never to validate anything — and import the model after.
let MoveModel;

class StubField {
	constructor(...args) {
		this.args = args;
		// StringField(opts) / ArrayField(element, opts): the options are always last.
		this.options = args.at(-1) ?? {};
	}
}

beforeAll(async () => {
	globalThis.foundry ??= {};
	foundry.data ??= {};
	foundry.data.fields = new Proxy({}, { get: () => StubField });
	foundry.abstract ??= {};
	foundry.abstract.TypeDataModel ??= class {};
	({ MoveModel } = await import("../../module/data-models/MoveModel.js"));
});

describe("MoveModel schema", () => {
	// A TypeDataModel silently DROPS any key it doesn't declare, so a field the writer emits
	// and the schema omits never fails loudly — it just never arrives. That is what happened
	// to the possession tags: possession-grants.js wrote them, the schema didn't list them,
	// and so `_grantedItemsFor` matched nothing and deselecting a possession tore down none
	// of its gear. The sync's own tests couldn't see it, because the test actor stores
	// whatever it is handed and only a real data model strips. Comparing the writer against
	// the schema is the check that catches the next one.
	it("declares every system field a possession's bundled gear is written with", () => {
		const written = grantsToCreate(
			[{
				name: "Bee smokers", sourceKey: "smokers", column: "regular",
				weight: 2, armor: { modifier: 1 }, resource: { max: 2, title: null, labels: [] },
			}],
			new Set(),
			{ slug: "apiary", sourceLabel: "Apiary" },
		).flatMap(payload => Object.keys(payload.system));

		expect(written.length).toBeGreaterThan(0);
		expect(Object.keys(MoveModel.defineSchema())).toEqual(expect.arrayContaining(written));
	});

	// possession-grants.js writes `sourceLabel: sourceLabel ?? null` outright, so a
	// non-nullable field would coerce that null to "" and the falsy check downstream would
	// still pass — but the tag pair either side of it must survive as null too, since every
	// hand-written item leaves them unset.
	it("lets the possession tags hold null, which is what an untagged item stores", () => {
		const schema = MoveModel.defineSchema();
		for (const key of ["sourcePossession", "sourceKey", "sourceLabel"]) {
			expect(schema[key].options.nullable, `${key} must be nullable`).toBe(true);
			expect(schema[key].options.initial, `${key} must default to null`).toBe(null);
		}
	});
});
