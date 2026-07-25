import { getHoverDescriptionSetting } from "../settings.js";
import { JOURNAL_EDITOR_SELECTOR } from "./journal-editor-guard.js";
import { replaceTextMatches } from "./text-nodes.js";

// The three character debilities and what each one does. This is the canonical
// rules text mirrored from `_DEBILITY_DEFS` in
// module/actors/character/StonetopCharacter.js — kept here as a plain string so
// this tiny util doesn't import the heavy character class. If the definitions
// there change, update this too.
export const DEBILITY_TOOLTIP =
	"A debility is a temporary condition from harm, strain, or stress. There are three, each giving disadvantage on rolls with its stats: " +
	"Weakened (+STR / +DEX), Dazed (+INT / +WIS), and Miserable (+CON / +CHA). " +
	"Clear them by resting, recovering, or tending to what ails you.";

// The bare word "debility" / "debilities", case-insensitive. The stateless form
// is for the per-node `.test()` pre-filter; the global form (derived from it)
// drives `matchAll`. Neither carries `lastIndex` between calls.
const _DEBILITY_RE = /\bdebilit(?:y|ies)\b/i;
const _DEBILITY_RE_G = new RegExp(_DEBILITY_RE, "gi");

// Stonetop also has *steading* debilities (diminished, lacking, malcontent),
// which are not Weakened/Dazed/Miserable. When the word is qualified by a nearby
// "steading" — "a steading debility", "the steading's debilities", "the steading
// has no debilities" — leave it alone so we don't attach the character tooltip to
// a steading reference. Tests the text preceding the match within its text node.
// The apostrophe class covers both the straight (') and typographic (’) form the
// authored prose uses.
const _STEADING_QUALIFIED = /steading(?:['’]?s)?(?:\s+\w+){0,3}\s*$/i;

// Never wrap inside editable controls, content links (which carry their own
// tooltip), or an already-wrapped term (idempotency). Also skip the debility
// *tracker* UI and its section title on the character/steading sheets — those
// already explain themselves; this feature is only for inline prose mentions. The
// live-editor fragment is sourced from the shared JOURNAL_EDITOR_SELECTOR so it
// can't drift from the guard.
const _SKIP = `.stonetop-debility-term, .stonetop-debilities, .steading-debilities-section, a, input, textarea, select, code, pre, ${JOURNAL_EDITOR_SELECTOR}`;

/**
 * Give every bare "debility" / "debilities" in `container`'s prose a hover
 * tooltip explaining the three character debilities, and embolden it. Walks text
 * nodes and wraps each match in a `<span class="stonetop-debility-term"
 * data-tooltip="…">`, leaving the surrounding text untouched. Skips mentions
 * qualified by "steading" (those are the steading's own debilities). Idempotent;
 * safe to call on every render.
 *
 * Gated by the `hoverDescriptionsDebilities` setting (and the hover-descriptions
 * master toggle), so every caller honours the one switch.
 * @param {HTMLElement} container
 */
export function markDebilityTooltips(container) {
	if (!container?.querySelectorAll) return;
	if (!getHoverDescriptionSetting("hoverDescriptionsDebilities")) return;

	// Cheap pre-check before the (relatively expensive) text-node walk: most sheet
	// re-renders carry no "debility" at all, so a single textContent regex test
	// lets us skip building the TreeWalker and running `.closest(_SKIP)` per node.
	if (!_DEBILITY_RE.test(container.textContent ?? "")) return;

	replaceTextMatches(container, {
		skip:  _SKIP,
		regex: _DEBILITY_RE_G,
		render: (match, text) => {
			// A steading debility (diminished/lacking/malcontent) — leave the word as plain text.
			if (_STEADING_QUALIFIED.test(text.slice(0, match.index))) return null;
			const span = document.createElement("span");
			span.className = "stonetop-debility-term";
			span.dataset.tooltip = DEBILITY_TOOLTIP;
			span.textContent = match[0];
			return span;
		},
	});
}
