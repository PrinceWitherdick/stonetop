import { markQuestionBullets } from "./question-bullets.js";
import { markCheckBullets } from "./check-bullets.js";
import { markFaqItems } from "./faq-bullets.js";
import { wrapStonetopGlyphsInEl } from "./glyphs.js";
import { compendiumSourceOf } from "./foundry-compat.js";
import { markValueTooltips } from "./value-tooltips.js";
import { markDebilityTooltips } from "./debility-tooltips.js";

// Give this system's journal prose the same spiral bullets (and question-spiral
// on list items that pose a question) as the actor sheets, applied live at render
// time so it works on whatever is in the shipped pack — no per-list baked wrapper
// and no pack rebuild required.
//
// The locations/lore generators still bake a `.stonetop-location-body` wrapper
// into their content; that keeps working. This covers the hand-authored / other
// generated journals (the Setting Overview, plus the reference and arcana
// journals) that have no such wrapper.

// This system's merged "Stonetop" JournalEntry pack. Its bestiary pages are
// excluded separately (by `page.type === "bestiary"` in isStonetopProseJournal),
// since they render through a custom page sheet with their own list styling. The
// pattern matches both a live pack id (`stonetop_pwd.stonetop-journal`) and the
// `Compendium.…` source uuid stamped on a world copy imported from the pack.
const PROSE_PACK = /stonetop_pwd\.stonetop-journal\b/;

/** The JournalEntry behind a rendered journal- or page-sheet app. */
export function resolveEntry(app) {
	const doc = app?.document ?? app?.object;
	if (!doc) return null;
	return doc.documentName === "JournalEntryPage" ? doc.parent : doc;
}

/**
 * True when `entry` is one of this system's shipped journals (the merged Stonetop
 * pack), regardless of page type. Open from the compendium → `pack`; a world copy
 * normally keeps Foundry's import stamp (`_stats.compendiumSource`, or the legacy
 * `flags.core.sourceId`) pointing back at the source pack.
 *
 * But that stamp is only set when the copy goes through Foundry's import flow
 * (`fromCompendium`, which the seed uses). A GM who deletes the world journals and
 * re-imports the pack another way — dropping the compiled pack's documents straight
 * in, an older seed — ends up with world copies that have NO source stamp, and the
 * render-time enhancers (roll tables, requirement checkboxes) would silently skip
 * them. So we ALSO recognise our own `flags.stonetop` namespace: the gazetteer
 * generator bakes it into every shipped entry, and — unlike the import stamp — it
 * travels with the entry's data through any copy path. (`restampSeededJournalSources`
 * separately restores the missing source stamp so the managed update channel, which
 * still keys on it, keeps working too.)
 */
export function isStonetopJournalEntry(entry) {
	if (!entry) return false;
	const source = entry.pack || compendiumSourceOf(entry) || "";
	if (PROSE_PACK.test(source)) return true;
	// Baked marker: present on our content regardless of how it reached the world.
	return !!entry.flags?.stonetop;
}

/** True for journals this system ships as plain prose (i.e. not the bestiary). */
function isStonetopProseJournal(entry, page) {
	// Bestiary and location pages render through their own custom page sheets with
	// their own list styling — never apply the runtime prose spiral-bullet pass. This
	// page-type gate is what excludes the bestiary (whose entries otherwise match
	// isStonetopJournalEntry, via source stamp or baked `flags.stonetop` alike).
	if (page?.type === "bestiary" || page?.type === "location") return false;
	return isStonetopJournalEntry(entry);
}

/**
 * Apply this system's prose spiral-bullet treatment to a single rendered prose
 * element: the spiral icon for bullets, the question-spiral on items that pose a
 * question, and the checkbox marker on requirement/option check-lists. The
 * `.stonetop-journal-body` class supplies the spiral CSS (a currentColor mask, so
 * it adapts to the surrounding text colour); the two mark passes add the
 * `question-bullet` / `check-bullet` classes that swap the icon. The glyph pass
 * swaps inline ◇/◆/▶/○/□ ASCII for this system's styled SVG glyphs (e.g. the gear
 * terms on "Gear: Terms & Value"). The FAQ pass tags the Character Creation FAQ's
 * `<p><strong>Question?</strong>…` Q&A blocks so they share a spiral bullet too.
 * The Value pass gives every "Value N" trade-tier mention a hover tooltip.
 * Idempotent.
 *
 * Used by the journal render pass below, and by the prose dialogs (Setting
 * Overview, Level-Up) that render the same kind of content outside a journal.
 * @param {HTMLElement} el
 */
export function markProseSpiralBullets(el) {
	if (!el?.classList) return;
	el.classList.add("stonetop-journal-body");
	markQuestionBullets(el);
	markCheckBullets(el);
	markFaqItems(el);
	wrapStonetopGlyphsInEl(el);
	markValueTooltips(el);
	markDebilityTooltips(el);
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
		markProseSpiralBullets(section);
	}
}
