// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readCss, readRepo } from "../fakes/css.js";

// THE YEAR SCRUBBER: one stop per year shown, a slide centres the column on that year (and the
// timeline the other way), and moving the column moves the thumb to the year in the middle.

const { yearStops, scrubTicks, centredScroll, pictureRect, scrollForValue, valueForScroll, wireYearScrubber } = await import("../../module/timeline/timeline-scrub.js");

describe("yearStops", () => {
	it("gives one stop per year, oldest first, and none for the undated block", () => {
		const periods = [
			{ undated: true, year: 0, yearLabel: "" },
			{ year: 1, yearLabel: "Year One" },
			{ year: 1, yearLabel: "Year One" },
			{ year: 3, yearLabel: "Year Three" },
		];
		expect(yearStops(periods)).toEqual([{ year: 1, label: "Year One" }, { year: 3, label: "Year Three" }]);
	});
});

describe("scrubTicks", () => {
	it("places a tick per year as its share of the thumb's travel, first at 0 and last at 1", () => {
		const stops = [1, 2, 3, 4].map(year => ({ year, label: `Year ${year}` }));
		expect(scrubTicks(stops).map(t => t.at)).toEqual([0, 0.3333, 0.6667, 1]);
	});

	it("draws the ticks behind the slider, half a thumb in from each end", () => {
		const main = readRepo("templates/dialogs/timeline.hbs");
		expect(main).toMatch(/\{\{#each scrub\.ticks\}\}<li class="stonetop-timeline-scrub-tick" style="--at: \{\{at\}\};">/);
		expect(main).toMatch(/stonetop-timeline-scrub-ticks" aria-hidden="true"/);
		const css = readCss();
		expect(css).toContain("left: calc(var(--scrub-thumb) / 2 + (100% - var(--scrub-thumb)) * var(--at, 0));");
		expect(css).toMatch(/\.stonetop-timeline-scrub-range::-webkit-slider-thumb \{\s*width: var\(--scrub-thumb\);/);
	});
});

describe("centredScroll", () => {
	it("puts a span that fits in the middle of the view", () => {
		// View 0..1000, span 1500..1700 on screen: its middle (1600) must land on 500.
		expect(centredScroll({ scroll: 200, viewStart: 0, viewSize: 1000, spanStart: 1500, spanSize: 200 })).toBe(1300);
	});

	it("lays a span longer than the view against the near edge, less the inset", () => {
		expect(centredScroll({ scroll: 0, viewStart: 100, viewSize: 400, spanStart: 900, spanSize: 800, inset: 12 })).toBe(788);
	});

	it("still centres a span longer than the view when told not to start from its start", () => {
		// Span 900..1700, middle 1300, onto the view's middle at 300.
		expect(centredScroll({ scroll: 0, viewStart: 100, viewSize: 400, spanStart: 900, spanSize: 800, fromStart: false })).toBe(1000);
	});
});

describe("pictureRect", () => {
	const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

	it("measures what a padded picture holds, not its box (the axis is the window's height)", () => {
		document.body.innerHTML = `<ol class="pic"><li></li><li></li></ol>`;
		const pic = document.querySelector(".pic");
		pic.getBoundingClientRect = () => rect(0, 0, 800, 600);
		const [a, b] = pic.children;
		a.getBoundingClientRect = () => rect(0, 200, 400, 150);
		b.getBoundingClientRect = () => rect(400, 180, 400, 200);
		expect(pictureRect(pic)).toMatchObject({ left: 0, top: 180, right: 800, bottom: 380, height: 200 });
	});

	it("takes the picture's own box when a child is pinned, since a pinned child is drawn where it sticks", () => {
		document.body.innerHTML = `<div class="pic"><span style="position: sticky"></span><div></div></div>`;
		const pic = document.querySelector(".pic");
		pic.getBoundingClientRect = () => rect(0, 0, 800, 600);
		expect(pictureRect(pic)).toMatchObject({ top: 0, height: 600 });
	});
});

describe("scrollForValue", () => {
	it("blends the offsets of the years either side of a fractional value, skipping years with nothing drawn", () => {
		const targets = [0, 400, null, 1000];
		expect(scrollForValue(targets, 0)).toBe(0);
		expect(scrollForValue(targets, 1)).toBe(400);
		expect(scrollForValue(targets, 0.25)).toBe(100);
		// Year 3 has nothing drawn: 1..3 runs straight from 400 to 1000.
		expect(scrollForValue(targets, 2)).toBe(700);
		expect(scrollForValue(targets, 9)).toBe(1000);
		expect(scrollForValue([null], 0)).toBeNull();
	});
});

describe("valueForScroll", () => {
	it("is the inverse: a scroll between two years' offsets puts the thumb as far between their ticks", () => {
		const targets = [0, 400, null, 1000];
		expect(valueForScroll(targets, 100)).toBe(0.25);
		expect(valueForScroll(targets, 700)).toBe(2);
		expect(valueForScroll(targets, -50)).toBe(0);
		expect(valueForScroll(targets, 5000)).toBe(3);
		expect(valueForScroll([null], 10)).toBe(-1);
	});

	it("puts the thumb on the later of two years the scroll range has clamped to one offset", () => {
		expect(valueForScroll([0, 600, 600], 600)).toBe(2);
	});
});

describe("wireYearScrubber", () => {
	let scroll, bar, range, unwire;
	const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

	beforeEach(() => {
		document.body.innerHTML = `
			<div class="scroll">
				<div class="canvas"><ol class="pic">
					<li data-year="1"></li><li data-year="2"></li><li data-year="2"></li>
				</ol></div>
			</div>
			<footer class="bar"><output></output><input type="range" min="0" max="1" step="any" value="0"></footer>`;
		scroll = document.querySelector(".scroll");
		bar = document.querySelector(".bar");
		range = bar.querySelector("input");
		// A 1000x600 view; the picture is drawn as if scrollLeft/Top were 0: year 1 at 0..400,
		// year 2 at 400..1600, everything 0..300 tall.
		const at = (x, y, w, h) => () => rect(x - scroll.scrollLeft, y - scroll.scrollTop, w, h);
		Object.defineProperty(scroll, "clientWidth", { value: 1000 });
		Object.defineProperty(scroll, "clientHeight", { value: 600 });
		scroll.getBoundingClientRect = () => rect(0, 0, 1000, 600);
		const [y1, y2a, y2b] = scroll.querySelectorAll("li");
		y1.getBoundingClientRect = at(0, 0, 400, 300);
		y2a.getBoundingClientRect = at(400, 0, 400, 300);
		y2b.getBoundingClientRect = at(800, 0, 800, 300);
		scroll.querySelector(".pic").getBoundingClientRect = at(0, 0, 1600, 300);
		vi.stubGlobal("requestAnimationFrame", (fn) => { fn(); return 0; });
	});
	afterEach(() => {
		unwire?.();
		vi.unstubAllGlobals();
		document.body.innerHTML = "";
	});

	const stops = [{ year: 1, label: "Year One" }, { year: 2, label: "Year Two" }];

	it("centres the column on the year slid to, and the timeline the other way", () => {
		unwire = wireYearScrubber(scroll, bar, { stops, horizontal: true, picture: ".pic" });
		range.value = "1";
		range.dispatchEvent(new Event("input"));
		// Year 2 spans 400..1600 (1200 wide, wider than the view): laid against the left edge.
		expect(scroll.scrollLeft).toBe(400);
		// The picture is 300 tall in a 600 view: centred, so 150 above it.
		expect(scroll.scrollTop).toBe(-150);
		expect(bar.querySelector("output").textContent).toBe("Year Two");
		expect(range.getAttribute("aria-valuetext")).toBe("Year Two");
	});

	it("scrolls part of the way between two years when the thumb is left between their ticks", () => {
		unwire = wireYearScrubber(scroll, bar, { stops, horizontal: true });
		// Year 1 centres at -300, held to 0; year 2 lies from 400. Halfway is 200.
		range.value = "0.5";
		range.dispatchEvent(new Event("input"));
		expect(scroll.scrollLeft).toBe(200);
		range.value = "0.4";
		range.dispatchEvent(new Event("input"));
		expect(scroll.scrollLeft).toBe(160);
		expect(bar.querySelector("output").textContent).toBe("Year One");
	});

	it("moves the thumb to where the view is, between ticks too, as the column scrolls", () => {
		unwire = wireYearScrubber(scroll, bar, { stops, horizontal: true });
		scroll.scrollLeft = 300;
		scroll.dispatchEvent(new Event("scroll"));
		expect(range.value).toBe("0.75");
		expect(bar.querySelector("output").textContent).toBe("Year Two");
		scroll.scrollLeft = 400;
		scroll.dispatchEvent(new Event("scroll"));
		expect(range.value).toBe("1");
	});

	it("ignores the scroll its own jump fires, but follows the column moved straight after it", () => {
		unwire = wireYearScrubber(scroll, bar, { stops, horizontal: true });
		range.value = "0.4";
		range.dispatchEvent(new Event("input"));
		expect(scroll.scrollLeft).toBe(160);
		// The jump's echo: the thumb stays where the hand put it, not where the place reads back.
		scroll.dispatchEvent(new Event("scroll"));
		expect(range.value).toBe("0.4");
		// A wheel turn at once after: no quiet spell swallows it.
		scroll.scrollLeft = 400;
		scroll.dispatchEvent(new Event("scroll"));
		expect(range.value).toBe("1");
	});

	it("steps a whole year at a time from the keyboard, from wherever the thumb was left", () => {
		unwire = wireYearScrubber(scroll, bar, { stops, horizontal: true });
		range.value = "0.4";
		const key = (k) => range.dispatchEvent(new KeyboardEvent("keydown", { key: k, cancelable: true }));
		key("ArrowRight");
		expect(range.value).toBe("1");
		expect(scroll.scrollLeft).toBe(400);
		range.value = "0.4";
		key("ArrowLeft");
		expect(range.value).toBe("0");
		key("End");
		expect(range.value).toBe("1");
	});

	it("Vertical: lays a timeline wider than the view against the left edge rather than centring it", () => {
		// Read down, the picture (1600 wide) is wider than the 1000 view: from the left, less the inset.
		unwire = wireYearScrubber(scroll, bar, { stops, horizontal: false, picture: ".pic", inset: 12 });
		scroll.scrollLeft = 500;
		range.value = "0";
		range.dispatchEvent(new Event("input"));
		expect(scroll.scrollLeft).toBe(-12);
	});

	it("wires nothing for fewer than two years", () => {
		unwire = wireYearScrubber(scroll, bar, { stops: stops.slice(0, 1), horizontal: true });
		range.value = "1";
		range.dispatchEvent(new Event("input"));
		expect(scroll.scrollLeft).toBe(0);
	});
});

describe("the template", () => {
	const read = (p) => readRepo(`templates/dialogs/${p}`);

	it("stamps a year on every period element in all four shapes", () => {
		expect(read("partials/timeline-hperiod.hbs")).toMatch(/data-year="\{\{year\}\}"/);
		expect(read("partials/timeline-period.hbs")).toMatch(/stonetop-timeline-period" data-period="\{\{key\}\}"\{\{#unless undated\}\} data-year/);
		const main = read("timeline.hbs");
		expect(main).toMatch(/stonetop-timeline-swim-head[^>]*data-year/);
		expect(main).toMatch(/stonetop-timeline-row"[^>]*data-year/);
	});

	it("draws the scrubber only when there is something to slide between", () => {
		expect(read("timeline.hbs")).toMatch(/\{\{#if scrub\}\}\s*<footer class="stonetop-timeline-scrub">/);
	});
});
