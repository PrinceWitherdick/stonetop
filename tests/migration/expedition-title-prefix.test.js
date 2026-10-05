import { describe, expect, it } from "vitest";
import { withoutExpeditionPrefix } from "../../module/migration/expedition-title-prefix.js";

// Older expedition rows were titled "Expedition: <trip>"; the card's chip already names the kind.
// The prefix comes off once, and only on the rows the expedition writer made.

const row = (fields) => ({ id: fields.id ?? "r", source: "expedition", key: "expedition:t1", title: "", ...fields });

describe("withoutExpeditionPrefix", () => {
	it("takes the prefix off an expedition row the writer made", () => {
		const result = withoutExpeditionPrefix([row({ title: "Expedition: The Ford" })]);
		expect(result.changed).toBe(1);
		expect(result.entries[0].title).toBe("The Ford");
	});

	it("leaves a typed row, a row without the prefix, and an unkeyed row alone", () => {
		const entries = [
			{ id: "a", source: "hand", key: "", title: "Expedition: The Ford" },
			row({ id: "b", title: "Expedition 2" }),
			row({ id: "c", key: "", title: "Expedition: Hand-made" }),
		];
		expect(withoutExpeditionPrefix(entries)).toBeNull();
	});

	it("keeps every other row as it was", () => {
		const other = { id: "x", source: "levelup", key: "levelup:2", title: "Reached level 2" };
		const result = withoutExpeditionPrefix([other, row({ id: "y", title: "Expedition: Marshedge" })]);
		expect(result.entries[0]).toBe(other);
		expect(result.entries[1].title).toBe("Marshedge");
	});
});
