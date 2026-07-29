import { describe, expect, it } from "vitest";
import { isStonetopJournalEntry } from "../../module/utils/journal-spiral-bullets.js";

// isStonetopJournalEntry decides whether a rendered journal is one of ours, which gates
// every render-time enhancer (roll-table dice, requirement checkboxes, spiral bullets).
// The regression it guards: a world whose journals were re-imported WITHOUT Foundry's
// `_stats.compendiumSource` stamp (a GM who deleted the world journals and dropped the
// compiled pack's documents straight in) must still be recognised — via the baked
// `flags.stonetop` marker the gazetteer writes into every shipped entry.

const PACK = "stonetop-pwd.stonetop-journal";
const SRC = `Compendium.${PACK}.JournalEntry.abc123`;

describe("isStonetopJournalEntry", () => {
	it("matches an entry open from our compendium (pack id)", () => {
		expect(isStonetopJournalEntry({ pack: PACK })).toBe(true);
	});

	it("matches a properly-seeded world copy (v12+ _stats.compendiumSource stamp)", () => {
		expect(isStonetopJournalEntry({ _stats: { compendiumSource: SRC } })).toBe(true);
	});

	it("matches a world copy carrying the legacy flags.core.sourceId stamp", () => {
		expect(isStonetopJournalEntry({ flags: { core: { sourceId: SRC } } })).toBe(true);
	});

	it("matches an un-stamped world copy by its baked flags.stonetop marker", () => {
		// The bug: no source stamp at all, but the content is ours.
		expect(isStonetopJournalEntry({ flags: { stonetop: { summary: "…" } }, _stats: { compendiumSource: null } })).toBe(true);
		// Even an empty stonetop namespace counts — the 3 gazetteer entries with no summary.
		expect(isStonetopJournalEntry({ flags: { stonetop: {} } })).toBe(true);
	});

	it("does NOT match a foreign compendium or a plain GM journal", () => {
		expect(isStonetopJournalEntry({ pack: "dnd5e.rules" })).toBe(false);
		expect(isStonetopJournalEntry({ _stats: { compendiumSource: "Compendium.dnd5e.rules.JournalEntry.x" } })).toBe(false);
		expect(isStonetopJournalEntry({ flags: { core: {} } })).toBe(false);
		expect(isStonetopJournalEntry({})).toBe(false);
	});

	it("is null/undefined safe", () => {
		expect(isStonetopJournalEntry(null)).toBe(false);
		expect(isStonetopJournalEntry(undefined)).toBe(false);
	});
});
