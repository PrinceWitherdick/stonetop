import { markQuestionBullets } from "./question-bullets.js";

// Give this system's journal prose the same spiral bullets (and question-spiral
// on list items that pose a question) as the actor sheets, applied live at render
// time so it works on whatever is in the shipped pack — no per-list baked wrapper
// and no pack rebuild required.
//
// The locations/lore generators still bake a `.stonetop-location-body` wrapper
// into their content; that keeps working. This covers the hand-authored / other
// generated journals (the Setting Overview, plus the reference and arcana
// journals) that have no such wrapper.

// This system's plain-prose JournalEntry packs. The bestiary pack is deliberately
// absent: it renders through a custom page sheet with its own list styling. The
// pattern matches both a live pack id (`stonetop_pwd.stonetop-lore`) and the
// `Compendium.…` source uuid stamped on a world copy imported from such a pack.
const PROSE_PACK = /stonetop_pwd\.stonetop-(journals|locations|lore)\b/;

/** The JournalEntry behind a rendered journal- or page-sheet app. */
function resolveEntry(app) {
	const doc = app?.document ?? app?.object;
	if (!doc) return null;
	return doc.documentName === "JournalEntryPage" ? doc.parent : doc;
}

/** True for journals this system ships as plain prose (i.e. not the bestiary). */
function isStonetopProseJournal(entry, page) {
	if (!entry || page?.type === "bestiary") return false;
	// Open from the compendium → `pack`. A world copy (e.g. seeded by
	// SeedCompendiums) keeps Foundry's import stamp pointing back at the source
	// pack — this is what survives the bundled journals' empty `flags` scope being
	// dropped at compile time. Matching on the source pack (rather than a
	// `flags.stonetop` namespace, which the bestiary pages also carry) keeps the
	// bestiary cleanly excluded.
	const source = entry.pack
		|| entry._stats?.compendiumSource
		|| entry.flags?.core?.sourceId
		|| "";
	return PROSE_PACK.test(source);
}

/**
 * Mark the prose of a rendered Stonetop journal so its bullet lists use the
 * spiral icon, and the question-spiral on items that end in "?". Idempotent;
 * safe to run on every journal render hook.
 * @param {Application} app   The journal- or page-sheet application.
 * @param {HTMLElement|jQuery} html  Its rendered root.
 */
export function applyJournalSpiralBullets(app, html) {
	const root = html?.jquery ? html[0] : html;
	if (!root?.querySelectorAll) return;

	const doc = app?.document;
	const page = doc?.documentName === "JournalEntryPage" ? doc : null;
	if (!isStonetopProseJournal(resolveEntry(app), page)) return;

	for (const section of root.querySelectorAll(".journal-page-content")) {
		// The bestiary's custom page sheet also uses `.journal-page-content`; never
		// restyle it (it has its own, differently-classed lists).
		if (section.closest(".stonetop-bestiary-page")) continue;
		section.classList.add("stonetop-journal-body");
		markQuestionBullets(section);
	}
}
