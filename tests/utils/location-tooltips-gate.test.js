import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
	applyLocationTooltips,
	invalidateLocationSummaryIndex,
} from "../../module/locations/location-tooltips.js";

// Journal cross-link summaries are a hover description, so they answer to the "On Hover
// Info" menu (`hoverDescriptionsJournalLinks`, under the `hoverDescriptionsEnabled`
// master). They used to be ungated, which made the master switch a lie: a reader could
// turn every listed toggle off and still get a tooltip on every cross-link.
//
// The catch is that restrict-content-links.js reads the summary to decide whether a
// player who can't open an entry keeps its text as a hoverable span or has it flattened
// to plain text. So the summary is RECORDED either way (`data-stonetop-summary`) and only
// the hover (`data-tooltip`) follows the setting — what a player may read must never
// depend on their hover preference.

let settings;

function link(uuid, extra = {}) {
	return { dataset: { uuid, ...extra } };
}

function rootWith(links) {
	return { querySelectorAll: () => links };
}

beforeEach(() => {
	invalidateLocationSummaryIndex();
	settings = { hoverDescriptionsEnabled: true, hoverDescriptionsJournalLinks: true };
	global.game = {
		settings: { get: (_ns, key) => settings[key] },
		// One summarized world journal; no packs, so the index is built from it alone.
		packs: { get: () => undefined },
		journal: [{ uuid: "JournalEntry.place1", flags: { stonetop: { summary: "A fortified town." } } }],
	};
});

afterEach(() => { invalidateLocationSummaryIndex(); });

describe("applyLocationTooltips", () => {
	it("stamps both the record and the hover when cross-link hovers are on", async () => {
		const a = link("JournalEntry.place1");
		await applyLocationTooltips(rootWith([a]));
		expect(a.dataset.stonetopSummary).toBe("A fortified town.");
		expect(a.dataset.tooltip).toBe("A fortified town.");
	});

	it("records the summary but stamps no hover when the toggle is off", async () => {
		settings.hoverDescriptionsJournalLinks = false;
		const a = link("JournalEntry.place1");
		await applyLocationTooltips(rootWith([a]));
		// Still recorded — restrictContentLinks needs it to classify the link.
		expect(a.dataset.stonetopSummary).toBe("A fortified town.");
		expect(a.dataset.tooltip).toBeUndefined();
	});

	it("obeys the master switch too", async () => {
		settings.hoverDescriptionsEnabled = false;
		const a = link("JournalEntry.place1");
		await applyLocationTooltips(rootWith([a]));
		expect(a.dataset.stonetopSummary).toBe("A fortified town.");
		expect(a.dataset.tooltip).toBeUndefined();
	});

	it("clears a tooltip left by an earlier pass when the toggle is flipped off", async () => {
		// The settings menu re-renders sheets, so a link can be re-enriched in place.
		const a = link("JournalEntry.place1");
		await applyLocationTooltips(rootWith([a]));
		expect(a.dataset.tooltip).toBe("A fortified town.");

		settings.hoverDescriptionsJournalLinks = false;
		await applyLocationTooltips(rootWith([a]));
		expect(a.dataset.tooltip).toBeUndefined();
	});

	it("leaves an unsummarized link alone", async () => {
		const a = link("JournalEntry.nosuch");
		await applyLocationTooltips(rootWith([a]));
		expect(a.dataset.stonetopSummary).toBeUndefined();
		expect(a.dataset.tooltip).toBeUndefined();
	});

	it("resolves even with hovers off, so the caller's restrictContentLinks chain still runs", async () => {
		settings.hoverDescriptionsJournalLinks = false;
		let chained = false;
		await applyLocationTooltips(rootWith([link("JournalEntry.place1")])).then(() => { chained = true; });
		expect(chained).toBe(true);
	});
});
