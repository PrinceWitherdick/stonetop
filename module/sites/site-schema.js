// The shape of a site's keyed-row lists, and the one rule for what a row is worth keeping.
//
// A leaf module on purpose. Four things need this — the wizard (blank rows, seeding, row
// view-models, live capture), the shaper that decides what is SAVED, the card view-model that
// decides what is SHOWN, and the wizard's own review tally — and any of them importing another
// would be a cycle. Written out per consumer, a list named in only some of them was collected on
// the wizard and then silently dropped, at save time or at re-open time, with nothing failing.

/**
 * Which keys each paired list's rows hold, in the order they render.
 *
 * `multiline` names the keys backed by a textarea: their interior line breaks are the GM's own
 * paragraphing, so those keys are kept exactly as typed rather than trimmed. Every other key is
 * a single-line field, where leading and trailing space is only ever a slip.
 */
export const SITE_PAIR_LISTS = {
	questions: { keys: ["prompt", "answer"] },
	timeline:  { keys: ["when", "text"] },
	denizens:  { keys: ["name", "notes"] },
	areas:     { keys: ["title", "description", "contents", "exits"], multiline: ["description", "contents"] },
};

/** The keys of a paired list, or null if that list is not one. */
export const pairKeys = (list) => SITE_PAIR_LISTS[list]?.keys ?? null;

/** The plain string-list fields, keyed by the `data-list` value their rows carry. */
export const SITE_LINE_LISTS = ["connections", "dangers", "discoveries", "outside", "inside", "plans"];

/** Keep a row only if at least one of its fields carries text. */
export const someText = (row, keys) => keys.some(k => String(row?.[k] ?? "").trim());

/**
 * Keyed rows from a stored or collected list, dropping rows where every key is blank.
 *
 * ONE spelling of "what a keyed row is, and which of them are worth keeping", shared by the
 * shaper and the card view-model. Written twice, the two drifted over which blank counted as
 * blank, and a row could be saved and then never rendered.
 *
 * @param {Array} arr
 * @param {string[]} keys
 * @param {string[]} [keep]  keys whose interior whitespace is the author's own (textareas)
 */
export function keyedRows(arr, keys, keep = []) {
	return (Array.isArray(arr) ? arr : [])
		.map(row => Object.fromEntries(keys.map(k => {
			const raw = String(row?.[k] ?? "");
			return [k, keep.includes(k) ? raw : raw.trim()];
		})))
		.filter(row => someText(row, keys));
}

/** Keyed rows for one named paired list, honouring its own multiline keys. */
export function shapePairList(list, arr) {
	const spec = SITE_PAIR_LISTS[list];
	if (!spec) return [];
	return keyedRows(arr, spec.keys, spec.multiline ?? []);
}

/** A list of trimmed, non-empty strings from a seed's list field. */
export const cleanLines = (arr) => (Array.isArray(arr) ? arr : []).map(s => String(s ?? "").trim()).filter(Boolean);

// ── Random-table rows that cover several faces ─────────────────────────────────
//
// The book prints Die of Fate tables with ranged rows ("1-3 In shrine, alert; 4-5 Off hunting;
// 6 Asleep"). A table is stored as one row per FACE, so a ranged row is that many identical
// rows in a row: the die stays "one face per stored row", every table saved before this still
// reads, and no schema change was needed. The functions below are the whole translation.

/** Ceiling on how many faces one row may cover, so a slip cannot mint a d1000. */
export const MAX_ROW_SPAN = 20;

/** A typed or stored span as a whole number of faces, 1..MAX_ROW_SPAN. */
export const clampRowSpan = span => Math.min(MAX_ROW_SPAN, Math.max(1, Math.trunc(Number(span) || 1)));

/**
 * Ranged rows numbered by the faces they cover, in order.
 * @param {{span: number}[]} ranged
 * @returns {object[]}  each row plus `from`, `to` and `roll`, the label the card prints beside
 *   it: "4" or "1-3".
 */
export function numberTableRows(ranged) {
	let face = 0;
	return ranged.map(r => {
		const from = face + 1;
		face += r.span;
		return { ...r, from, to: face, roll: from === face ? `${from}` : `${from}-${face}` };
	});
}

/**
 * Stored rows (one per face) as ranged rows: consecutive identical rows merge.
 * @param {string[]} rows
 * @param {object} [opts]
 * @param {number} [opts.maxSpan=Infinity]  merge no more than this many faces into one row. The
 *   wizard passes MAX_ROW_SPAN, so a longer run it could not hold in one row opens as two rather
 *   than being clamped, and losing faces, on the next save.
 * @returns {{text: string, span: number, from: number, to: number, roll: string}[]}
 */
export function tableRowRanges(rows, { maxSpan = Infinity } = {}) {
	const out = [];
	for (const raw of Array.isArray(rows) ? rows : []) {
		const text = String(raw ?? "");
		const last = out.at(-1);
		if (last && text && last.text === text && last.span < maxSpan) last.span++;
		else out.push({ text, span: 1 });
	}
	return numberTableRows(out);
}

/**
 * Ranged rows back into stored rows, one per face.
 * @param {{text?: string, span?: number}[]} ranged
 * @returns {string[]}
 */
export function expandTableRows(ranged) {
	return (Array.isArray(ranged) ? ranged : []).flatMap(r => Array(clampRowSpan(r?.span)).fill(String(r?.text ?? "")));
}
