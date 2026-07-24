// A "fill-in blank" in the rulebook is a run of 2+ underscores in an option's text —
// e.g. "… running for your life from ___" or "◇◇ A shield, bearing ___'s crest". The
// player writes what belongs in the blank, and the finished sentence reads as one line.
//
// splitFillBlank() splits the text at its FIRST blank so a text input can sit inline
// where the blank was: { hasBlank, before, after }. Any HTML on either side is preserved
// verbatim (the callers already treat these fragments as trusted markup). Only the first
// blank is split — the book never puts two blanks in one option.

import { escHtml } from "./strings.js";

const FILL_BLANK_RE = /_{2,}/;

export function hasFillBlank(text) {
	return FILL_BLANK_RE.test(String(text ?? ""));
}

export function splitFillBlank(text) {
	const s = String(text ?? "");
	const m = s.match(FILL_BLANK_RE);
	if (!m) return { hasBlank: false, before: s, after: "" };
	return { hasBlank: true, before: s.slice(0, m.index), after: s.slice(m.index + m[0].length) };
}

// Splice a written value into the FIRST blank, for the read-only "finished sentence"
// views. The value is player-entered free text spliced into trusted label/description
// markup that every caller renders as raw HTML (triple-stache), so it is HTML-escaped
// here — the surrounding markup is preserved, only the value is neutralized. A function
// replacer is used (not a bare string) so a `$` in the value isn't taken as a `$&`/`$1`
// replacement pattern. An empty value leaves the blank in place (reads as unfilled).
export function fillBlank(text, value) {
	const s = String(text ?? "");
	const v = String(value ?? "");
	return v ? s.replace(FILL_BLANK_RE, () => escHtml(v)) : s;
}
