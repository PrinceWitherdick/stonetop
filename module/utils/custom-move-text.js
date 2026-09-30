// Player-authored custom-move descriptions are authored as PLAIN TEXT (v1 / Tier
// 0). They render RAW on the sheet (triple-stache `{{{ }}}`) and in chat, so they
// must never carry live markup — otherwise a player could inject script into the
// GM's / other players' browsers. formatCustomMoveDescription escapes the text (via
// the shared, audited escHtml) and wraps it into paragraphs for storage;
// customMoveDescriptionToPlainText reverses that — including every entity escHtml can
// emit — so the edit form shows the author's plain text, not stored HTML, and the
// pair round-trips losslessly.
//
// The one piece of formatting allowed is the book's own: a move's trigger in bold italic. It is
// typed as asterisks (***trigger***, **bold**, *italic*) and turned into tags AFTER escaping, so
// the only markup that can ever come out is <strong> and <em> around already-escaped text.

import { escHtml } from "./strings.js";

// Longest run first, so ***x*** is bold italic rather than *(**x**)*. A run never spans a line.
const _EMPHASIS = [
	[/\*\*\*([^*\n]+?)\*\*\*/g, "<strong><em>$1</em></strong>"],
	[/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>"],
	[/\*([^*\n]+?)\*/g, "<em>$1</em>"],
];

function _emphasis(escaped) {
	return _EMPHASIS.reduce((out, [re, tag]) => out.replace(re, tag), escaped);
}

export function formatCustomMoveDescription(raw) {
	const text = String(raw ?? "").trim();
	if (!text) return "";
	return text
		.split(/\n{2,}/)
		.map((para) => `<p>${_emphasis(escHtml(para)).replace(/\n/g, "<br>")}</p>`)
		.join("");
}

export function customMoveDescriptionToPlainText(html) {
	// Deliberately NOT stripHtmlToText: this round-trips into a textarea, so the line structure
	// is the point — the shared helper collapses every run of whitespace to a single space.
	return String(html ?? "")
		// Emphasis back to the asterisks it was typed as, in either nesting order.
		.replace(/<strong>\s*<em>([\s\S]*?)<\/em>\s*<\/strong>/gi, "***$1***")
		.replace(/<em>\s*<strong>([\s\S]*?)<\/strong>\s*<\/em>/gi, "***$1***")
		.replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**")
		.replace(/<em>([\s\S]*?)<\/em>/gi, "*$1*")
		.replace(/<\s*br\s*\/?>/gi, "\n")
		.replace(/<\/\s*p\s*>/gi, "\n\n")
		.replace(/<[^>]*>/g, "")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'")
		.replace(/&amp;/g, "&") // must be last: reverses the escape applied first
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
