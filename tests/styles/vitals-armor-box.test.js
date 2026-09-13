import { describe, expect, it } from "vitest";
import { beats, declarations, readCss, readRepo, specificity, splitSelectorList, stripComments } from "../fakes/css.js";

/**
 * The Armor field on the character sheet wears the same number box as the vitals beside it.
 *
 * The vitals number skin is written as a DIRECT-CHILD rule,
 * `.sheet-attributes-top .cell--Number .stonetop-vital-inner > input`, and that shape is
 * deliberate: the monster and NPC stat bars put a second, non-numeric input (the armor source)
 * under the same wrapper, and it is restated with the same shape so it can beat the skin.
 *
 * Armor on the character sheet then grew a wrapper. Its hover note cannot live on the field
 * itself, because outside edit mode the input is `disabled` and a disabled control fires no
 * pointer events, so the tooltip would never open — the same reason Max HP hangs its note on
 * `.cell__max`. The wrapper broke the `>` and the skin silently stopped reaching the field: it
 * fell back to core's input chrome (a grey fill where the others are transparent), lost
 * `text-align: center` and `width: 100%`, and lost the `margin-top: 4px` that puts it level with
 * its neighbours, so it sat high and dark in a row of matching boxes. Nothing was logged, and
 * every other cell looked right.
 *
 * Neither half of the pairing is derivable from the other, so both are pinned here: the template
 * must keep the wrapper (the note depends on it), and every rule written for the direct-child
 * shape must name the wrapper alongside it.
 */

const CSS = readCss();
const VITALS = stripComments(readRepo("templates/actor/partials/actor-vitals.hbs"));

const SKIN = ".sheet-attributes-top .cell--Number .cell__number > input";
const WRAPPER = ".sheet-attributes-top .cell--Number .cell__number";

/** Every rule in the sheet, as its split selector list. */
const RULES = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
	.map(([, prelude, body]) => ({ selectors: splitSelectorList(prelude), body }));

/** The bare direct-child form of the number skin, with any trailing pseudo-class captured. */
const BARE = /^\.sheet-attributes-top \.cell--Number \.stonetop-vital-inner > input(:[\w-]+)?$/;

describe("the armor input is wrapped, and the wrapper carries the note", () => {
	const armorCell = VITALS.slice(VITALS.indexOf("cell--attr-armor"));
	const wrapper = armorCell.indexOf('class="cell__number"');
	const input = armorCell.indexOf("data-armor");
	const closed = armorCell.indexOf("</span>");

	it("wraps the field in a span the tooltip can hang off", () => {
		expect(wrapper).toBeGreaterThan(-1);
		expect(wrapper).toBeLessThan(input);
		expect(input).toBeLessThan(closed);
	});

	it("puts the note on the wrapper, not on the disabled input", () => {
		const openTag = armorCell.slice(wrapper, armorCell.indexOf(">", wrapper));
		expect(openTag).toContain("armorNote");
	});
});

describe("every rule written for the direct-child skin names the wrapper too", () => {
	const shaped = RULES.filter(r => r.selectors.some(s => BARE.test(s)));

	it("finds the rules that skin the vitals number box", () => {
		// The skin, the margin that sets it below the title, and the hover/focus affordance.
		expect(shaped.length).toBe(3);
	});

	for (const rule of shaped) {
		for (const selector of rule.selectors.filter(s => BARE.test(s))) {
			const pseudo = BARE.exec(selector)[1] || "";
			it(`${selector} is paired with the wrapped armor field`, () => {
				const wanted = pseudo ? [SKIN + pseudo] : [SKIN, WRAPPER];
				expect(rule.selectors.some(s => wanted.includes(s))).toBe(true);
			});
		}
	}
});

describe("the wrapped field reads as the box its neighbours wear", () => {
	it("is transparent, centred and full width", () => {
		const skin = declarations(CSS, SKIN);
		expect(skin).toBeTruthy();
		expect(skin).toMatch(/background:\s*transparent/);
		expect(skin).toMatch(/text-align:\s*center/);
		expect(skin).toMatch(/width:\s*100%/);
		expect(skin).toMatch(/border:\s*1px solid/);
	});

	it("lays the wrapper out as the bare input did, so the field keeps its width and its line", () => {
		const wrapper = declarations(CSS, WRAPPER);
		expect(wrapper).toBeTruthy();
		expect(wrapper).toMatch(/display:\s*block/);
		expect(wrapper).toMatch(/width:\s*100%/);
		expect(wrapper).toMatch(/margin-top:\s*4px/);
	});
});

describe("a hand-set adjustment still shows its dashed rule", () => {
	// The skin sets the whole `border` shorthand and sits later in the sheet, so the dashed
	// override has to outrank it. Both halves of the shared rule are checked, because the pair is
	// written as one selector list precisely so the two cannot drift apart.
	const pairs = [
		[
			".sheet-attributes-top .cell--attr-armor .cell__number > input.stonetop-armor--adjusted",
			SKIN,
		],
		[
			".sheet-attributes-top .cell--Resource .cell__resource input.stonetop-hp-max--adjusted",
			".sheet-attributes-top .cell--Resource .cell__resource input",
		],
	];

	for (const [adjusted, base] of pairs) {
		it(`${adjusted} outranks its base skin`, () => {
			expect(declarations(CSS, adjusted)).toMatch(/border-style:\s*dashed/);
			expect(beats(specificity(adjusted), specificity(base))).toBe(true);
		});
	}
});

describe("the vitals hover/focus accent is slate, not core's hyperlink orange", () => {
	// --color-text-hyperlink reads #ff6400 inside any window: Foundry declares it on an ELEMENT
	// (@layer variables.base { body.game .app { ... } }), and a value set on an ancestor element
	// beats the :root slate this system asks for, whatever the layer. Every rule below wrote
	// var(--color-text-hyperlink, slategrey) and got the orange instead, which is what the
	// monster and NPC stat bars showed on hover -- their HP and Armor fields are never disabled,
	// so they are hovered far more often than the character sheet's.
	const accents = [
		".sheet-attributes-top .cell--Roll .cell__roll .rollable:hover",
		".sheet-attributes-top .cell--Roll .cell__roll .rollable:hover input.attr-value",
		".sheet-attributes-top .cell--Number .cell__number > input:focus",
		// The two the monster and NPC stat bars actually land on -- HP nests
		// .cell__resource > .cell__value > input, Armor is a DIRECT child of the vital wrapper.
		".sheet-attributes-top .cell--Resource .cell__resource input:hover",
		".sheet-attributes-top .cell--Number .stonetop-vital-inner > input:hover",
	];

	for (const selector of accents) {
		it(selector + " takes the slate token", () => {
			const rule = declarations(CSS, selector);
			expect(rule).toBeTruthy();
			expect(rule).toMatch(/var\(--st-btn-primary-border/);
			expect(rule).not.toMatch(/--color-text-hyperlink/);
		});
	}
});

describe("the monster and NPC stat bars nest into the shared vitals rules", () => {
	// The hover/focus accent, the number skin and the boxed-resource skin are all written for
	// the character sheet's shapes; the two stat bars reuse them by matching that nesting rather
	// than restating a rule of their own. Nothing warns when that drifts -- the armor wrapper
	// broke the direct-child skin once already, which is what the top of this file is about --
	// so the nesting is pinned here for both sheets.
	const hosts = [
		["monster", stripComments(readRepo("templates/actor/monster.hbs"))],
		["npc", stripComments(readRepo("templates/actor/npc.hbs"))],
	];

	for (const [name, html] of hosts) {
		const bar = html.slice(html.indexOf("sheet-attributes-top"));
		const hp = bar.slice(bar.indexOf("cell--attr-hp"));
		const armor = bar.slice(bar.indexOf("cell--attr-armor"));

		it(name + ": the stat bar carries the ancestor every vitals rule starts from", () => {
			expect(html).toMatch(/class="sheet-attributes-top /);
			expect(bar).toMatch(/cell cell--Resource cell--attr-hp/);
			expect(bar).toMatch(/cell cell--Number cell--attr-armor/);
		});

		it(name + ": HP sits inside .cell__resource, which is what the boxed skin matches", () => {
			const resource = hp.indexOf("cell__resource");
			const value = hp.indexOf("cell__value");
			const input = hp.indexOf("<input");
			expect(resource).toBeGreaterThan(-1);
			expect(value).toBeGreaterThan(resource);
			expect(input).toBeGreaterThan(value);
		});

		it(name + ": the armor number is a DIRECT child of .stonetop-vital-inner", () => {
			const wrapper = armor.indexOf("stonetop-vital-inner");
			expect(wrapper).toBeGreaterThan(-1);
			// The label is allowed between them; another wrapper element is not, because the
			// skin and the hover accent are both written with `>`.
			const input = armor.indexOf("<input", wrapper);
			expect(input).toBeGreaterThan(wrapper);
			const between = armor.slice(wrapper, input);
			expect(between).not.toMatch(/<(span|div)\b/);
		});
	}
});
