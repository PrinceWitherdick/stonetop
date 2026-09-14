import { describe, expect, it } from "vitest";
import { declarations, ownRule, readCss, stripComments } from "../fakes/css.js";

/**
 * The problematic-wound prompt's CSS contract (Book I p.243, "Problematic wounds in play"), and
 * the per-tier group shape it shares with the tier actions and the homefront pick lists.
 *
 * All three hold one row per tier inside a `data-active-tier` group so a GM's Shift Up/Down can
 * reveal the row matching the new tier (stonetop.js `_shiftRollCardFlavor`). Both of the things
 * that shape has to get right fail SILENTLY:
 *
 *   - A group whose rows are ALL hidden must take no space. None of the three covers every tier,
 *     so each routinely renders fully hidden, and `.cell--chat` is a flex column with a gap: a
 *     wrapper left alone collects a full 8px for a zero-height box. Measured on a 10+ Requisition
 *     card before the rule landed: 162.78px with the hidden wrapper against 154.78px without.
 *     `.card-buttons:empty` cannot catch it, since the wrapper holds a hidden ELEMENT.
 *   - The ROWS must NOT be given an author `display`. Author beats UA whatever the specificity,
 *     so a `display` reaching them kills `[hidden] { display: none }` and prints every tier at
 *     once. `tests/styles/losing-overrides.test.js` makes the same argument for the panels that
 *     shipped broken that way.
 */

const CHAT = ":is(#chat, #chat-notifications, #chat-popout) .message";
const NOTICE = `${CHAT} .stonetop-roll-wound-justify-notice`;

const CSS = readCss();
const RULES = [...stripComments(CSS).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
	.map(([, prelude, body]) => ({ prelude: prelude.trim().replace(/\s+/g, " "), body }));

/** The rules that set `display` and would reach something inside a per-tier group. */
const displayRules = RULES.filter(r => /(^|[;\s])display\s*:/.test(r.body));

describe("a per-tier group with nothing to show", () => {
	// Keyed on the ATTRIBUTE rather than the three class names, so a fourth per-tier block gets
	// the behaviour for free. That is the whole point of the rule, so the test asserts it.
	const hider = displayRules.find(r =>
		/\[data-active-tier\]/.test(r.prelude) && /:not\(:has\(/.test(r.prelude));

	it("is hidden by a rule keyed on [data-active-tier]", () => {
		expect(hider, "nothing hides a fully-hidden per-tier group; every such card gains 8px")
			.toBeTruthy();
		expect(hider.body).toMatch(/display:\s*none/);
	});

	it("is matched by whether a row is visible, not by which group it is", () => {
		// `> [data-tier]:not([hidden])` is the test. Naming a class here would quietly leave the
		// other two groups (and any future one) paying the gap.
		expect(hider.prelude).toMatch(/>\s*\[data-tier\]:not\(\[hidden\]\)/);
		for (const cls of ["stonetop-roll-tier-actions", "stonetop-roll-tier-picklists",
			"stonetop-roll-wound-justify"]) {
			expect(hider.prelude, `the rule singles out .${cls} instead of the shared shape`)
				.not.toContain(cls);
		}
	});

	it("hides the GROUP rather than dissolving it", () => {
		// `.stonetop-roll-tier-actions` is also a `.card-buttons` flex row; `display: contents`
		// would drop that flex and stack its buttons down the card.
		expect(hider.body).not.toMatch(/display:\s*contents/);
	});

	it("leaves the rows themselves to the UA's [hidden]", () => {
		const onRows = displayRules.filter(r =>
			/\[data-tier\]/.test(r.prelude) && !/\[data-active-tier\]/.test(r.prelude));
		expect(onRows.map(r => r.prelude)).toEqual([]);
	});
});

describe("problematic-wound prompt styling", () => {
	it("gives the prompt its own ink, distinct from the lasting-injury notice beside it", () => {
		// Both can sit on one 6- card, and they ask for different things -- what the injury does
		// to the roll, versus whether it is why the roll went wrong -- so they must not read as
		// one block in one colour.
		const prompt = /--st-notice-accent:\s*([^;]+)/.exec(ownRule(CSS, NOTICE))?.[1].trim();
		const reminder = /--st-notice-accent:\s*([^;]+)/
			.exec(ownRule(CSS, `${CHAT} .stonetop-roll-wound-notice`))?.[1].trim();
		expect(prompt).toBeTruthy();
		expect(reminder).toBeTruthy();
		expect(prompt).not.toBe(reminder);
	});

	it("declares the lead sentence's colour rather than inheriting core's", () => {
		// The card's paper is pinned parchment in every theme, so ink left to core turns
		// bone-white on it the moment the user picks a dark interface.
		expect(declarations(CSS, `${CHAT} .stonetop-card-notice-lead`)).toMatch(/(^|[;\s])color\s*:/);
	});
});
