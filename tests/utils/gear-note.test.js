import { describe, expect, it } from "vitest";
import { GEAR_TERMS } from "../../module/data/gear-terms.js";
import { gearNoteChips, wrapGearNoteTerms, buildUsesResource } from "../../module/utils/gear-note.js";

describe("wrapGearNoteTerms", () => {
	it("wraps each recognised comma-separated tag in <em>", () => {
		expect(wrapGearNoteTerms("near, +1 damage, reload"))
			.toBe("<em>near</em>, <em>+1 damage</em>, <em>reload</em>");
	});

	it("keeps the count outside <em> for piercing so the steading transform still matches", () => {
		expect(wrapGearNoteTerms("x piercing")).toBe("x <em>piercing</em>");
		expect(wrapGearNoteTerms("2 piercing")).toBe("2 <em>piercing</em>");
	});

	it("leaves prose that isn't a known term untouched", () => {
		const prose = "recover 1d6 extra HP when you Make Camp";
		expect(wrapGearNoteTerms(prose)).toBe(prose);
	});

	it("only wraps the parts that are terms, leaving prose parts alone", () => {
		expect(wrapGearNoteTerms("far, and it looks impressive"))
			.toBe("<em>far</em>, and it looks impressive");
	});

	it("returns an empty string for empty input", () => {
		expect(wrapGearNoteTerms("")).toBe("");
		expect(wrapGearNoteTerms(null)).toBe("");
	});

	it("HTML-escapes prose so raw {{{note}}} rendering can't execute injected markup", () => {
		expect(wrapGearNoteTerms("<img src=x onerror=alert(1)>"))
			.toBe("&lt;img src=x onerror=alert(1)&gt;");
		// A recognised term stays wrapped, but any stray markup around it is escaped.
		expect(wrapGearNoteTerms("near, <script>bad</script>"))
			.toBe("<em>near</em>, &lt;script&gt;bad&lt;/script&gt;");
	});
});

describe("gearNoteChips", () => {
	it("attaches each chip's tooltip from GEAR_TERMS", () => {
		const chips = gearNoteChips();
		const reload = chips.find(c => c.insert === "reload");
		expect(reload.tooltip).toBe(GEAR_TERMS.reload);
		const piercing = chips.find(c => c.insert === "x piercing");
		expect(piercing.tooltip).toBe(GEAR_TERMS.piercing);
	});

	it("groups range, quality and bonus tags", () => {
		const groups = new Set(gearNoteChips().map(c => c.group));
		expect(groups).toEqual(new Set(["range", "tag", "bonus"]));
	});
});

describe("buildUsesResource", () => {
	it("labels the last two circles low-ammo / all-out for a 2-circle ammo track", () => {
		expect(buildUsesResource(2, true))
			.toEqual({ max: 2, title: null, labels: ["low ammo", "all out"] });
	});

	it("puts low-ammo second-to-last on a longer ammo track", () => {
		expect(buildUsesResource(3, true))
			.toEqual({ max: 3, title: null, labels: ["", "low ammo", "all out"] });
	});

	it("marks a single ammo circle all-out", () => {
		expect(buildUsesResource(1, true))
			.toEqual({ max: 1, title: null, labels: ["all out"] });
	});

	it("leaves a plain uses track unlabelled", () => {
		expect(buildUsesResource(3, false))
			.toEqual({ max: 3, title: null, labels: ["", "", ""] });
	});
});
