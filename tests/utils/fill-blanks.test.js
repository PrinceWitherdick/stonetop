import { describe, it, expect } from "vitest";
import { splitFillBlank, hasFillBlank, fillBlank } from "../../module/utils/fill-blanks.js";
import { LoreOptionSnapshotBuilder } from "../../module/model/CharacterSnapshot.js";

describe("splitFillBlank / hasFillBlank", () => {
	it("treats a run of 2+ underscores as a blank, a single one as literal", () => {
		expect(hasFillBlank("… running for your life from ___.")).toBe(true);
		expect(hasFillBlank("… first laid eyes upon the _______.")).toBe(true);
		expect(hasFillBlank("… landing a well-placed blow.")).toBe(false);
		expect(hasFillBlank("snake_case is not a blank")).toBe(false);
	});

	it("splits at the first blank, preserving the space on each side", () => {
		expect(splitFillBlank("… running for your life from ___.")).toEqual({
			hasBlank: true, before: "… running for your life from ", after: ".",
		});
		expect(splitFillBlank("… getting ___ to fight them for you.")).toEqual({
			hasBlank: true, before: "… getting ", after: " to fight them for you.",
		});
		expect(splitFillBlank("◇◇ A shield, bearing ___'s crest")).toEqual({
			hasBlank: true, before: "◇◇ A shield, bearing ", after: "'s crest",
		});
	});

	it("returns the whole text as `before` when there is no blank", () => {
		expect(splitFillBlank("no blank here")).toEqual({ hasBlank: false, before: "no blank here", after: "" });
	});
});

describe("fillBlank", () => {
	it("splices the value into the first blank, preserving surrounding markup", () => {
		expect(fillBlank("◇◇ A shield, bearing ___'s crest", "House Dunmer"))
			.toBe("◇◇ A shield, bearing House Dunmer's crest");
	});

	it("leaves the blank in place for an empty value", () => {
		expect(fillBlank("… from ___.", "")).toBe("… from ___.");
	});

	it("HTML-escapes the player-entered value (the output is rendered as raw HTML)", () => {
		// The result flows into a triple-stache sink, so an injected tag must be neutralized.
		expect(fillBlank("bearing ___'s crest", '<img src=x onerror="alert(1)">'))
			.toBe("bearing &lt;img src=x onerror=&quot;alert(1)&quot;&gt;'s crest");
	});

	it("does not treat a `$` in the value as a replacement pattern", () => {
		// A bare string replacement would turn `$&`/`$1` into the match / capture groups.
		expect(fillBlank("worth ___ to me", "$5 & a $$")).toBe("worth $5 &amp; a $$ to me");
	});
});

describe("LoreOptionSnapshot inline fill-in blank", () => {
	const blankOption = (textValue) => new LoreOptionSnapshotBuilder()
		.withSlug("running")
		.withDescription("… running for your life from ___.")
		.withType("checkbox")
		.withMax(2)
		.withCount(1)
		.withTextValue(textValue)
		.build();

	it("exposes before/after/value and a trailing-space-preserving read-only lead", () => {
		const snap = blankOption("a pack of ghouls");
		expect(snap.hasBlank).toBe(true);
		expect(snap.fillBefore).toBe("… running for your life from ");
		expect(snap.fillAfter).toBe(".");
		expect(snap.fillValue).toBe("a pack of ghouls");
		// The read-only lead drops the ellipsis but keeps the space before the value, so the
		// spliced sentence reads "running for your life from a pack of ghouls."
		expect(snap.readonlyFillBefore).toBe("running for your life from ");
	});

	it("still counts as answered via its checkbox count, not the fill text", () => {
		expect(blankOption("").hasAnswer).toBe(true);   // count 1 → picked, even with an empty blank
		expect(blankOption("x").count).toBe(1);
	});

	it("leaves plain checkbox options with no fill fields", () => {
		const snap = new LoreOptionSnapshotBuilder()
			.withSlug("blow").withDescription("… landing a well-placed blow.")
			.withType("checkbox").withMax(1).withCount(0).build();
		expect(snap.hasBlank).toBe(false);
		expect(snap.fillValue).toBe("");
	});

	it("does not treat a text option's underscores as a fill blank", () => {
		const snap = new LoreOptionSnapshotBuilder()
			.withType("text").withDescription("write ___ here").withTextValue("done").build();
		expect(snap.hasBlank).toBe(false);
		expect(snap.textValue).toBe("done");
	});
});
