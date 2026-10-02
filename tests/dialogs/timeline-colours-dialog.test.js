import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// THE GM'S COLOURS WINDOW. What is pinned: each row opens on what its kind wears on THIS page, a
// pick and a Default move only that row, a pick that lands back on the shipped colour is no pick,
// and Save writes only the kinds touched here, over the world's colours as they stand at Save.

const saved = { value: {} };
vi.mock("../../module/settings.js", () => ({
	getTimelineKindColours: () => ({ ...saved.value }),
	setTimelineKindColours: vi.fn(async colours => { saved.value = colours; }),
}));

const { TimelineColoursDialog, openTimelineColours } = await import("../../module/dialogs/TimelineColoursDialog.js");
const settings = await import("../../module/settings.js");
const { TIMELINE_KIND_PALETTE, kindColourSet } = await import("../../module/timeline/timeline-colours.js");

const realDocument = globalThis.document;
/** Put the page in one skin, by the classes applySheetContrast sets. */
function skin(...classes) {
	globalThis.document = { documentElement: { classList: { contains: c => classes.includes(c) } } };
}

function makeDialog(world = {}) {
	saved.value = { ...world };
	const dialog = new TimelineColoursDialog();
	dialog.close = vi.fn();
	return dialog;
}

/** A row as the template draws it, enough for `_repaintRow`. */
function fakeRow(kind) {
	const props = new Map();
	const reset = { hidden: true };
	const note = { hidden: true };
	const pick = { value: "" };
	return {
		dataset: { kind },
		style: { setProperty: (k, v) => props.set(k, v) },
		querySelector: sel => ({
			".stonetop-timeline-colours-reset": reset,
			".stonetop-timeline-colours-note": note,
			".stonetop-timeline-colours-pick": pick,
		})[sel] ?? null,
		prop: k => props.get(k),
		reset, note, pick,
	};
}

beforeEach(() => {
	saved.value = {};
	settings.setTimelineKindColours.mockClear();
	globalThis.game = { ...(globalThis.game ?? {}), user: { isGM: true } };
	skin();
});

afterEach(() => {
	globalThis.document = realDocument;
});

describe("the rows", () => {
	it("open on the world's colours", () => {
		const dialog = makeDialog({ wound: "#aa3300" });
		expect(dialog._row("wound").value).toBe("#aa3300");
		expect(dialog._row("wound").repainted).toBe(true);
	});

	it("open each untouched kind on its shipped colour, with no Default to press", () => {
		const row = makeDialog()._row("arcana");
		expect(row.value).toBe(TIMELINE_KIND_PALETTE.arcana.light);
		expect(row.colour).toBe(TIMELINE_KIND_PALETTE.arcana.light);
		expect(row.repainted).toBe(false);
		expect(row.nudged).toBe(false);
	});

	// No one colour reads on both high-contrast pages, so a note about ANY skin would be on every
	// row. It speaks for this page alone.
	it("say a pick was adjusted only when it was adjusted for this page", () => {
		const dialog = makeDialog({ arcana: "#ffff66", wound: "#7c300a" });
		const pale = dialog._row("arcana");
		expect(pale.nudged).toBe(true);
		expect(pale.colour).toBe(kindColourSet("#ffff66").light.hex);
		expect(kindColourSet("#7c300a").darkHigh.nudged).toBe(true);
		expect(dialog._row("wound").nudged).toBe(false);
	});

	it("follow the page into another skin", () => {
		const dialog = makeDialog();
		skin("stonetop-dark");
		expect(dialog._row("site").colour).toBe(TIMELINE_KIND_PALETTE.site.dark);
	});

	it("render, one per kind", async () => {
		const html = await renderTemplate("systems/stonetop-pwd/templates/dialogs/timeline-colours.hbs", makeDialog().getData());
		expect(html.match(/class="stonetop-timeline-colours-row/g)).toHaveLength(9);
		expect(html).toContain('data-kind="arcana" style="--tl-kind: ');
		expect(html).toContain('type="color" class="stonetop-timeline-colours-pick"');
	});
});

describe("picking and putting back", () => {
	it("keeps a pick, and repaints only its row", () => {
		const dialog = makeDialog();
		const row = fakeRow("wound");
		dialog._onPick("wound", "#aa3300");
		dialog._repaintRow(row);
		expect(dialog._chosen.wound).toBe("#aa3300");
		expect(row.reset.hidden).toBe(false);
		expect(row.prop("--tl-kind")).toBe(kindColourSet("#aa3300").light.hex);
	});

	// Kept, it would be walked into the three other skins and replace their own tuned colours.
	it("treats a pick landing on this skin's shipped colour as the default", () => {
		const dialog = makeDialog({ season: "#123456" });
		dialog._onPick("season", TIMELINE_KIND_PALETTE.season.light.toUpperCase());
		expect(dialog._chosen).not.toHaveProperty("season");
	});

	it("puts a kind back to default, picker and all", () => {
		const dialog = makeDialog({ wound: "#aa3300" });
		const row = fakeRow("wound");
		dialog._onReset("wound");
		dialog._repaintRow(row, { syncPicker: true });
		expect(dialog._chosen).not.toHaveProperty("wound");
		expect(row.reset.hidden).toBe(true);
		expect(row.pick.value).toBe(TIMELINE_KIND_PALETTE.wound.light);
	});
});

describe("saving", () => {
	it("writes the kinds touched here over the world's colours as they stand now", async () => {
		const dialog = makeDialog({ wound: "#aa3300", arcana: "#550088" });
		dialog._onPick("site", "#004466");
		dialog._onReset("wound");
		// Changed elsewhere while the window was open: must survive this Save.
		saved.value = { ...saved.value, follower: "#880044" };
		await dialog._save();
		expect(settings.setTimelineKindColours).toHaveBeenCalledWith({ arcana: "#550088", site: "#004466", follower: "#880044" });
		expect(dialog.close).toHaveBeenCalled();
	});

	it("writes nothing when nothing was touched", async () => {
		const dialog = makeDialog({ wound: "#aa3300" });
		await dialog._save();
		expect(settings.setTimelineKindColours).not.toHaveBeenCalled();
		expect(dialog.close).toHaveBeenCalled();
	});

	it("writes nothing for a player who somehow got the window open", async () => {
		const dialog = makeDialog();
		dialog._onPick("wound", "#aa3300");
		globalThis.game.user = { isGM: false };
		await dialog._save();
		expect(settings.setTimelineKindColours).not.toHaveBeenCalled();
	});
});

describe("opening it", () => {
	afterEach(() => { delete globalThis.ui.windows; });

	it("is the GM's alone", () => {
		globalThis.game.user = { isGM: false };
		expect(openTimelineColours()).toBeNull();
	});

	it("brings the open window forward rather than opening a second", () => {
		const open = makeDialog();
		open.id = "stonetop-timeline-colours";
		open.rendered = true;
		open.bringToTop = vi.fn();
		globalThis.ui.windows = { 1: open };
		expect(openTimelineColours()).toBe(open);
		expect(open.bringToTop).toHaveBeenCalled();
	});

	// A double click: the first window is not in `ui.windows` until it draws, and must still be found.
	it("opens no twin for a second press while the first is still drawing", () => {
		globalThis.ui.windows = {};
		const render = vi.spyOn(TimelineColoursDialog.prototype, "render").mockImplementation(function () {
			this._state = Application.RENDER_STATES.RENDERING;
			return this;
		});
		try {
			const first = openTimelineColours();
			expect(openTimelineColours()).toBe(first);
			expect(render).toHaveBeenCalledTimes(1);
		} finally {
			render.mockRestore();
		}
	});
});
