import { describe, it, expect, beforeEach } from "vitest";
import {
	TIMELINE_COLOUR_GROUNDS, TIMELINE_COLOUR_KINDS, TIMELINE_COLOUR_MODES, TIMELINE_COLOURS_STYLE_ID,
	TIMELINE_KIND_PALETTE, applyTimelineKindColours, currentColourMode, kindColourSet, kindColoursCss,
	normalizeKindColours, readableKindColour,
} from "../../module/timeline/timeline-colours.js";
import { TIMELINE_CARD_SOURCES } from "../../module/timeline/timeline-core.js";
import { declared, ownRule, readCss } from "../fakes/css.js";

// THE KINDS' COLOURS. The stylesheet carries the shipped palette as tokens, one value per skin, and
// timeline-colours.js carries a COPY of it (and of the grounds behind it) to seed the GM's picker
// and to walk a chosen colour until it reads on every skin. Nothing but this file holds the two
// copies together.

const css = readCss();

const SKIN_SELECTOR = {
	light:     ":root",
	dark:      ":root.stonetop-dark",
	lightHigh: ":root.stonetop-high-contrast",
	darkHigh:  ":root.stonetop-dark.stonetop-high-contrast",
};

describe("the kinds", () => {
	// Restated rather than imported (the module's header says why), so held together here.
	it("are every source the system records as a card, in the Filter menu's order", () => {
		expect([...TIMELINE_COLOUR_KINDS]).toEqual(TIMELINE_CARD_SOURCES.filter(source => source !== "hand"));
	});

	// A Seasons Change prints inside its season's heading (user, 2026-10-03), which wears the
	// season's own colour; a kind colour for it would paint nothing.
	it("leave the season out", () => {
		expect(TIMELINE_COLOUR_KINDS).not.toContain("season");
		expect(TIMELINE_KIND_PALETTE).not.toHaveProperty("season");
		expect(css).not.toContain("--st-timeline-kind-season");
		expect(css).not.toContain(".stonetop-timeline-kind--season");
	});
});

describe("the module's palette is the stylesheet's", () => {
	for (const mode of TIMELINE_COLOUR_MODES) {
		it(`on the ${mode} skin`, () => {
			const body = ownRule(css, SKIN_SELECTOR[mode]);
			for (const kind of TIMELINE_COLOUR_KINDS) {
				expect(declared(body, `--st-timeline-kind-${kind}`)?.toLowerCase(), `${kind} on ${mode}`)
					.toBe(TIMELINE_KIND_PALETTE[kind][mode]);
			}
		});
	}

	it("and every shipped colour clears its skin's floor as it stands", () => {
		for (const mode of TIMELINE_COLOUR_MODES) {
			for (const kind of TIMELINE_COLOUR_KINDS) {
				const shipped = TIMELINE_KIND_PALETTE[kind][mode];
				const read = readableKindColour(shipped, mode);
				expect(read.nudged, `${kind} on ${mode} (${read.ratio.toFixed(2)}:1)`).toBe(false);
			}
		}
	});

	// The grounds the module checks a colour against are the ones each skin paints. `deg` is optional
	// in hsl(), so it is dropped from both sides before they are compared.
	it("checked against the grounds each skin actually paints", () => {
		const same = value => String(value ?? "").replace(/deg/g, "").replace(/\s+/g, " ").trim();
		for (const mode of TIMELINE_COLOUR_MODES) {
			const body = ownRule(css, SKIN_SELECTOR[mode]);
			const ground = TIMELINE_COLOUR_GROUNDS[mode];
			expect(same(declared(body, "--st-page")), `page on ${mode}`).toBe(same(ground.page));
			expect(same(declared(body, "--stonetop-bg")), `panel on ${mode}`).toBe(same(ground.panel));
			expect(same(declared(body, "--st-card-fill")), `card on ${mode}`).toBe(same(ground.card));
		}
	});

	it("over the same chip and card washes", () => {
		const light = ownRule(css, ":root");
		const percent = prop => parseFloat(declared(light, prop)) / 100;
		expect(percent("--st-timeline-card-wash")).toBeCloseTo(TIMELINE_COLOUR_GROUNDS.light.cardWash);
		expect(percent("--st-timeline-chip-wash")).toBeCloseTo(TIMELINE_COLOUR_GROUNDS.light.chipWash);
	});
});

describe("a GM's colours", () => {
	it("keep only known kinds with real hex colours", () => {
		expect(normalizeKindColours({ arcana: "#AA00ff", wound: "red", nonsense: "#000000", hand: "#123456" }))
			.toEqual({ arcana: "#aa00ff" });
		expect(normalizeKindColours(null)).toEqual({});
	});

	it("come out as one colour per skin, darkened where a pale one would vanish", () => {
		const set = kindColourSet("#ffff66");
		expect(Object.keys(set)).toEqual([...TIMELINE_COLOUR_MODES]);
		expect(set.light.nudged).toBe(true);
		expect(set.lightHigh.ratio).toBeGreaterThanOrEqual(TIMELINE_COLOUR_GROUNDS.lightHigh.floor);
		expect(kindColourSet("not a colour")).toBeNull();
	});

	it("are written for all four skins at once, and nothing when nothing is repainted", () => {
		expect(kindColoursCss({})).toBe("");
		const out = kindColoursCss({ arcana: "#7b31a7" });
		for (const selector of Object.values(SKIN_SELECTOR)) expect(out).toContain(`${selector} {`);
		expect(out).toContain("--st-timeline-kind-arcana: #7b31a7;");
		expect(out).not.toContain("--st-timeline-kind-wound");
	});
});

describe("painting them onto the page", () => {
	let doc;
	beforeEach(() => {
		const head = { children: [], appendChild(el) { this.children = this.children.filter(c => c !== el).concat(el); } };
		doc = {
			head,
			getElementById: id => head.children.find(el => el.id === id) ?? null,
			createElement: () => ({ id: "", textContent: "", remove() { head.children = head.children.filter(c => c !== this); } }),
		};
	});

	it("writes one <style>, rewrites it, and takes it away when every kind is back to default", () => {
		applyTimelineKindColours({ arcana: "#7b31a7" }, doc);
		expect(doc.head.children).toHaveLength(1);
		expect(doc.getElementById(TIMELINE_COLOURS_STYLE_ID).textContent).toContain("--st-timeline-kind-arcana");

		applyTimelineKindColours({ wound: "#7c300a" }, doc);
		expect(doc.head.children).toHaveLength(1);
		expect(doc.getElementById(TIMELINE_COLOURS_STYLE_ID).textContent).not.toContain("arcana");

		applyTimelineKindColours({}, doc);
		expect(doc.head.children).toHaveLength(0);
	});
});

describe("which skin the page is in", () => {
	const page = (...classes) => ({ documentElement: { classList: { contains: c => classes.includes(c) } } });
	it("reads the contrast classes off the root", () => {
		expect(currentColourMode(page())).toBe("light");
		expect(currentColourMode(page("stonetop-dark"))).toBe("dark");
		expect(currentColourMode(page("stonetop-high-contrast"))).toBe("lightHigh");
		expect(currentColourMode(page("stonetop-dark", "stonetop-high-contrast"))).toBe("darkHigh");
	});
});
