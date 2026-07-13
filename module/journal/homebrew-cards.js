// Shared plumbing for "homebrew" draggable cards authored in-app (custom steading
// improvements and threats). Each kind collects its cards as text pages inside a
// single GM-only world JournalEntry, tagged with a flag so we reuse the same entry
// rather than spawning a new one per card. The card HTML carries a data-attribute
// payload that the steading sheet's drop handlers recognize (see
// steading-improvement-cards.js / threats/threat-seed-cards.js); the generic journal
// render hook makes the cards draggable wherever the entry is opened.
import { STONETOP_SCOPE } from "../actors/character/StonetopFlags.js";

const OWN = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;

/**
 * Find-or-create the GM-only world JournalEntry that collects homebrew cards of one
 * `kind` ("improvement" | "threat"). `ensureFolder`, when given, resolves the folder
 * the entry should live in (created lazily). Returns null for a non-GM (who can't
 * create it).
 * @param {{title: string, kind: string, ensureFolder?: () => Promise<Folder|null>}} opts
 */
export async function ensureHomebrewEntry({ title, kind, ensureFolder }) {
	const existing = game.journal?.find(e => e.getFlag?.(STONETOP_SCOPE, "homebrewCards") === kind);
	if (existing) return existing;
	if (!game.user?.isGM) return null;
	const folder = ensureFolder ? await ensureFolder() : null;
	return JournalEntry.create({
		name: title,
		folder: folder?.id ?? null,
		ownership: { default: OWN().NONE },
		flags: { [STONETOP_SCOPE]: { homebrewCards: kind } },
	});
}

/** Append a text page holding `html` to `entry` and return the created page. */
export async function addHomebrewCardPage(entry, { name, html }) {
	if (!entry) return null;
	const sort = (entry.pages?.contents ?? []).reduce((m, p) => Math.max(m, p.sort ?? 0), 0) + 10;
	const [page] = await entry.createEmbeddedDocuments("JournalEntryPage", [{
		name: String(name ?? "").trim() || "Untitled",
		type: "text",
		sort,
		text: { content: html, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML },
	}]);
	return page ?? null;
}

/** Open the entry's sheet, scrolled to `page` when given. */
export function openHomebrewEntry(entry, page) {
	entry?.sheet?.render(true, page ? { pageId: page.id } : {});
}

/**
 * Full author-a-card flow: ensure the collecting entry, append a page with `html`,
 * open it so the fresh draggable card is on screen. Returns the page (or null).
 */
export async function createHomebrewCard({ title, kind, name, html, ensureFolder }) {
	const entry = await ensureHomebrewEntry({ title, kind, ensureFolder });
	if (!entry) {
		globalThis.ui?.notifications?.warn?.("Only the GM can create Stonetop content.");
		return null;
	}
	const page = await addHomebrewCardPage(entry, { name, html });
	openHomebrewEntry(entry, page);
	return page;
}

/**
 * Read + parse a homebrew card's JSON payload from `card.dataset[datasetKey]`, or null
 * if absent, malformed, or nameless. Shared by every card kind's read helper.
 */
export function readHomebrewCardPayload(card, datasetKey) {
	const raw = card?.dataset?.[datasetKey];
	if (!raw) return null;
	try {
		const data = JSON.parse(raw);
		return data && data.name ? data : null;
	} catch (_e) {
		return null;
	}
}

/**
 * Attach `dragstart` to every homebrew card under `root` matching `selector`
 * (idempotent via `boundFlag`). Baked HTML can't populate `dataTransfer`, so this
 * serializes each card's parsed payload into `{ type: dragType, [payloadKey]: data }`,
 * the shape the steading sheet's drop handlers recognize.
 * @param {HTMLElement|jQuery} root
 * @param {{selector:string, datasetKey:string, boundFlag:string, dragType:string, payloadKey:string}} cfg
 */
export function bindHomebrewCardDrag(root, { selector, datasetKey, boundFlag, dragType, payloadKey }) {
	const el = root?.jquery ? root[0] : root;
	if (!el?.querySelectorAll) return;

	for (const card of el.querySelectorAll(selector)) {
		if (card.dataset[boundFlag]) continue;
		card.dataset[boundFlag] = "1";
		card.addEventListener("dragstart", ev => {
			const data = readHomebrewCardPayload(card, datasetKey);
			if (!data) return;
			ev.dataTransfer.setData("text/plain", JSON.stringify({ type: dragType, [payloadKey]: data }));
			ev.dataTransfer.effectAllowed = "copy";
		});
	}
}
