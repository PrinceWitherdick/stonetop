import { describe, it, expect } from "vitest";
import { buildAggregateVM, buildTrackVM, seasonGlyphClass } from "../../module/timeline/timeline-view.js";
import { periodLabel } from "../../module/seasons/current-season.js";

// The shape a template is handed. One view model serves the tab, the aggregate window and the
// journal page, so what is pinned here is that the three cannot disagree about which season a card
// is filed under or what that season is called.

function entry(over = {}) {
	return { id: "e1", year: 1, season: "spring", order: 0, title: "A thing", ...over };
}

describe("seasonGlyphClass", () => {
	// The clock says autumn; the icons and the stylesheet say fall. Two places in the system already
	// carry this swap and this is the third.
	it("maps autumn onto the fall art the stylesheet actually has", () => {
		expect(seasonGlyphClass("autumn")).toBe("stonetop-season--fall");
	});

	it("passes the other three straight through", () => {
		expect(seasonGlyphClass("spring")).toBe("stonetop-season--spring");
		expect(seasonGlyphClass("summer")).toBe("stonetop-season--summer");
		expect(seasonGlyphClass("winter")).toBe("stonetop-season--winter");
	});

	it("gives an undated block no glyph at all", () => {
		expect(seasonGlyphClass("")).toBe("");
		expect(seasonGlyphClass("harvest")).toBe("");
	});
});

describe("periodLabel", () => {
	it("names a period the way the Seasons Change journal names its pages", () => {
		expect(periodLabel({ season: "autumn", year: 2 })).toBe("Autumn, Year Two");
	});

	it("names the block for entries that predate the record", () => {
		expect(periodLabel({ season: "", year: 0 })).toBe("Before the record");
	});
});

describe("buildTrackVM", () => {
	it("builds one block per period, oldest first", () => {
		const vm = buildTrackVM({ trackId: "pc", name: "Ellis", entries: [
			entry({ id: "b", year: 2, season: "spring" }),
			entry({ id: "a", year: 1, season: "winter" }),
		] });
		expect(vm.periods.map(p => p.label)).toEqual(["Winter, Year One", "Spring, Year Two"]);
		expect(vm.count).toBe(2);
	});

	it("reports an empty track, so the tab can show its invitation", () => {
		expect(buildTrackVM({ trackId: "pc", name: "Ellis", entries: [] })).toMatchObject({ isEmpty: true, count: 0 });
	});

	// A reader must always be able to tell the record from the bookkeeping.
	it("marks a row the system wrote for itself as auto", () => {
		const vm = buildTrackVM({ trackId: "s", name: "Stonetop", entries: [
			entry({ id: "a", source: "hand" }),
			entry({ id: "b", source: "season" }),
		] });
		const [typed, auto] = vm.periods[0].entries;
		expect(typed.isAuto).toBe(false);
		expect(auto.isAuto).toBe(true);
	});

	// Every row is STORED now: a milestone is the table's history with a first draft written by the
	// system, and a GM fixing a mis-credited kill or a wrong date edits it like anything typed.
	it("gives a milestone the same controls as a typed row", () => {
		const vm = buildTrackVM({ trackId: "pc", name: "Ellis", entries: [
			entry({ id: "a", source: "hand" }),
			entry({ id: "b", source: "levelup", key: "levelup:2" }),
		] }, { canEdit: true });
		const [typed, milestone] = vm.periods[0].entries;
		expect(typed.canEdit).toBe(true);
		expect(milestone.canEdit).toBe(true);
	});

	// The chip is the kind NAMED, not just drawn: an icon alone is a guess on a magnifier.
	it("names a milestone's kind in words beside its glyph", () => {
		const vm = buildTrackVM({ trackId: "pc", name: "Ellis", entries: [entry({ source: "kills", foes: ["Crinwin"] })] });
		const [card] = vm.periods[0].entries;
		expect(card.kind).toBe("kills");
		expect(card.kindIcon).toBe("fa-skull");
		expect(card.kindLabel).toBe("Kills");
	});

	it("files a kind it has never heard of as a typed row rather than failing", () => {
		const vm = buildTrackVM({ trackId: "pc", name: "Ellis", entries: [entry({ source: "from-the-future" })] });
		expect(vm.periods[0].entries[0].kind).toBe("hand");
		expect(vm.periods[0].entries[0].isAuto).toBe(false);
	});
});

describe("kills on the timeline", () => {
	const track = { trackId: "pc", name: "Ellis", entries: [
		entry({ id: "k1", source: "kills", title: "", foes: ["Crinwin", "Bandit Chief", "Crinwin", "Crinwin"] }),
		entry({ id: "k2", source: "kills", season: "summer", title: "The ford", foes: ["Wolf"] }),
		entry({ id: "h", source: "hand", season: "summer" }),
	] };

	// Counted by name in the order each first fell, so a horde reads as one line, not twelve.
	it("sums a season's kills up by name", () => {
		const [card] = buildTrackVM(track).periods[0].entries;
		expect(card.killSummary).toBe("Crinwin ×3, Bandit Chief");
	});

	it("titles an untitled kills row with its count, and keeps a title somebody wrote", () => {
		const vm = buildTrackVM(track);
		expect(vm.periods[0].entries[0].title).toBe("Slew 4");
		expect(vm.periods[1].entries.find(c => c.id === "k2").title).toBe("The ford");
	});

	// The running total is the character's, not this view's: hiding kills must not zero it.
	it("totals every kill on the thread, whatever the reader has hidden", () => {
		expect(buildTrackVM(track).killTotal).toBe(5);
		expect(buildTrackVM(track, { hidden: ["kills"] }).killTotal).toBe(5);
	});

	it("totals each thread's kills on the aggregate's lane heads", () => {
		const vm = buildAggregateVM([track, { trackId: "s", name: "Stonetop", entries: [entry()] }]);
		expect(vm.tracks.map(t => t.killTotal)).toEqual([5, 0]);
	});
});

describe("the reader's Filter menu", () => {
	const track = { trackId: "pc", name: "Ellis", entries: [
		entry({ id: "a", source: "kills", foes: ["Wolf"] }),
		entry({ id: "b", source: "levelup", season: "summer" }),
	] };

	// A season holding nothing but hidden rows leaves nothing behind: no empty block, no column.
	it("drops a season whose every row is hidden", () => {
		const vm = buildTrackVM(track, { hidden: ["kills"] });
		expect(vm.periods.map(p => p.key)).toEqual(["1:summer"]);
	});

	// Told apart from an empty thread, so the page can say "your filter is hiding this" and offer
	// the way back, rather than "nothing has been written".
	it("tells a fully filtered thread from an empty one", () => {
		const hidden = buildTrackVM(track, { hidden: ["kills", "levelup"] });
		expect(hidden.isEmpty).toBe(false);
		expect(hidden.allHidden).toBe(true);
		const empty = buildTrackVM({ trackId: "pc", name: "Ellis", entries: [] });
		expect(empty.isEmpty).toBe(true);
		expect(empty.allHidden).toBe(false);
	});

	it("filters the aggregate the same way", () => {
		const vm = buildAggregateVM([track], { hidden: ["kills", "levelup"] });
		expect(vm.isEmpty).toBe(false);
		expect(vm.allHidden).toBe(true);
		expect(vm.periods).toEqual([]);
	});
});

describe("years and sides", () => {
	const track = { trackId: "pc", name: "Ellis", entries: [
		entry({ id: "u", season: "" }),
		entry({ id: "a", season: "summer", year: 1 }),
		entry({ id: "b", season: "winter", year: 1 }),
		entry({ id: "c", season: "spring", year: 2 }),
	] };

	// A year heading opens at the first dated season and wherever the year moves on. The undated
	// block sits before every year and opens none.
	it("opens a year where the year moves on, and never on the undated block", () => {
		const periods = buildTrackVM(track).periods;
		expect(periods.map(p => [p.key, p.startsYear])).toEqual([
			["undated", false], ["1:summer", true], ["1:winter", false], ["2:spring", true],
		]);
	});

	// Across the page, seasons alternate above and below the line so neighbours never crowd.
	it("alternates the sides a season's cards hang on", () => {
		expect(buildTrackVM(track).periods.map(p => p.above)).toEqual([true, false, true, false]);
	});

	it("marks year starts on the aggregate too", () => {
		const vm = buildAggregateVM([track]);
		expect(vm.periods.filter(p => p.startsYear).map(p => p.key)).toEqual(["1:summer", "2:spring"]);
	});
});

describe("the aggregate laid across the page", () => {
	const tracks = [
		{ trackId: "s", name: "Stonetop", entries: [entry({ id: "a" })] },
		{ trackId: "pc", name: "Ellis", entries: [entry({ id: "b", season: "summer" })] },
	];

	// Handlebars cannot index one table by the other, so the board is transposed here: a row per
	// thread, a cell per season, in the periods' order.
	it("transposes the board into one swimlane per thread", () => {
		const vm = buildAggregateVM(tracks);
		expect(vm.swimlanes.map(l => l.trackId)).toEqual(["s", "pc"]);
		expect(vm.swimlanes[0].cells.map(c => c.entries.map(e => e.id))).toEqual([["a"], []]);
		expect(vm.swimlanes[1].cells.map(c => c.entries.map(e => e.id))).toEqual([[], ["b"]]);
	});

	// The SAME objects in both shapes, so enriching the board down enriches it across.
	it("shares its cells with the board read down", () => {
		const vm = buildAggregateVM(tracks);
		expect(vm.swimlanes[1].cells[1]).toBe(vm.periods[1].lanes[1]);
	});

	// The Seasons Change row IS stored, so a GM can rewrite or delete it like any other entry, even
	// though it renders as quietly as a derived one.
	it("leaves a season row editable, unlike a derived one", () => {
		const vm = buildTrackVM({ trackId: "s", name: "Stonetop", entries: [
			entry({ id: "a", source: "season" }),
		] }, { canEdit: true });
		expect(vm.periods[0].entries[0]).toMatchObject({ isAuto: true, canEdit: true });
	});

	it("carries the body through raw, for the host to enrich", () => {
		const vm = buildTrackVM({ trackId: "s", name: "Stonetop", entries: [entry({ body: "<p>@UUID[Actor.x]{Ellis}</p>" })] });
		expect(vm.periods[0].entries[0].body).toBe("<p>@UUID[Actor.x]{Ellis}</p>");
	});
});

describe("buildAggregateVM", () => {
	const tracks = [
		{ trackId: "steading", name: "Stonetop", entries: [entry({ id: "s1", year: 1, season: "spring", title: "The thaw" })] },
		{ trackId: "pc-ellis", name: "Ellis", entries: [entry({ id: "e1", year: 2, season: "summer", title: "The barrow" })] },
	];

	// A row of the aggregate is one season across every thread. Without the union, two tracks that
	// never shared a season would render as two separate ladders.
	it("takes the union of every track's periods, oldest first", () => {
		const vm = buildAggregateVM(tracks);
		expect(vm.periods.map(p => p.label)).toEqual(["Spring, Year One", "Summer, Year Two"]);
	});

	it("gives every period a lane per track, so the columns stay level", () => {
		const vm = buildAggregateVM(tracks);
		for (const period of vm.periods) {
			expect(period.lanes.map(l => l.trackId)).toEqual(["steading", "pc-ellis"]);
		}
	});

	it("marks the lanes with nothing in that season as empty rather than dropping them", () => {
		const vm = buildAggregateVM(tracks);
		const spring = vm.periods[0];
		expect(spring.lanes[0]).toMatchObject({ trackId: "steading", isEmpty: false });
		expect(spring.lanes[1]).toMatchObject({ trackId: "pc-ellis", isEmpty: true });
	});

	// An empty column under a character's name is how a reader sees there is a thread to write in.
	it("keeps a track with no entries at all as a lane", () => {
		const vm = buildAggregateVM([...tracks, { trackId: "pc-kefta", name: "Kefta", entries: [] }]);
		expect(vm.tracks.map(t => t.trackId)).toContain("pc-kefta");
		expect(vm.periods[0].lanes.map(l => l.trackId)).toContain("pc-kefta");
	});

	it("asks per track whether this reader may edit it", () => {
		const vm = buildAggregateVM(tracks, { canEdit: (id) => id === "pc-ellis" });
		const summer = vm.periods[1];
		expect(summer.lanes.find(l => l.trackId === "pc-ellis").entries[0].canEdit).toBe(true);
		const spring = vm.periods[0];
		expect(spring.lanes.find(l => l.trackId === "steading").entries[0].canEdit).toBe(false);
	});

	it("reports empty for a world where nothing has been written yet", () => {
		expect(buildAggregateVM([{ trackId: "s", name: "Stonetop", entries: [] }])).toMatchObject({ isEmpty: true });
	});
});
