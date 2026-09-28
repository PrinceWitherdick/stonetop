import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readCss, readRepo, repoFileExists, ownRule } from "../fakes/css.js";
import { fakeEl } from "../fakes/dom.js";
import { contrastRatio, parseColor, ratioText } from "../fakes/contrast.js";
import { applySheetContrast } from "../../module/settings.js";

/**
 * The dark ("Lamplit") palette, checked against the arithmetic it claims.
 *
 * Same discipline as tests/styles/high-contrast.test.js: nothing here reads the ratios written in
 * the stylesheet's comments. Every one is re-derived from the values in the file, so a hex warmed
 * to taste until it no longer clears its bar fails here rather than in front of a reader.
 *
 * The bars:
 *   · Dark: 4.5:1 for text (WCAG AA) on the LIGHTER of the page and the panel, since here the
 *     panels are the raised, lighter surface; 3:1 for a boundary.
 *   · Dark + High Contrast: 7:1 (AAA) on the page, the panel AND the painted grain at both of its
 *     extremes, and no ink brighter than ~0.9 relative luminance nor any page darker than ~0.004,
 *     because pure white on pure black is the halation a dark palette exists to avoid.
 *   · The dead: 4.5:1 on their neutral black, and the ink genuinely neutral, which is the whole of
 *     what "colder" means once "darker" alone turns out to be a 1.1:1 difference.
 */

const CSS = readCss();
const DARK = ":root.stonetop-dark";
const DARK_HC = ":root.stonetop-dark.stonetop-high-contrast";
const HIGH = ":root.stonetop-high-contrast";
const FLAT = ":root.stonetop-no-texture";

/** Every `--custom-property: value` a rule body declares, as a Map. */
function customProperties(body) {
	const out = new Map();
	if (!body) return out;
	for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out.set(m[1].trim(), m[2].trim());
	return out;
}

const D = customProperties(ownRule(CSS, DARK));
const DH = customProperties(ownRule(CSS, DARK_HC));
const HC = customProperties(ownRule(CSS, HIGH));

/** The dark section: from its first rule to the accessibility block's no-texture rule. */
const SECTION = CSS.slice(CSS.indexOf(`${DARK} {`), CSS.indexOf(FLAT));
const RULES = [...SECTION.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => [m[1].trim(), m[2]]);

/** Tokens read as TEXT, and tokens that are a boundary or a mark. */
const INK = name => /(^--st-text(-|$)|^--color-text-|-text$|-ink$|hyperlink)/.test(name);
const BOUNDARY = name => /(-border$|-rule$|^--color-border-)/.test(name);

const lum = value => {
	const { rgb } = parseColor(value);
	const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
	return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
};
const hex = rgb => "#" + rgb.map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("");

/**
 * What the four surfaces actually paint: the grain inverted against white (`difference`), then the
 * tint SCREENED over it. sheet-bg.webp's mean pixel is rgb(251, 250, 250) and its darkest has
 * relative luminance 0.936 (about rgb(248, 248, 248)); "Paper Texture" off is a flat white sheet.
 */
const GRAIN = { mean: [251, 250, 250], darkest: [248, 248, 248], off: [255, 255, 255] };
function painted(tint, grain) {
	const t = parseColor(tint).rgb;
	return hex(t.map((c, i) => 255 - (255 - c) * (255 - (255 - grain[i])) / 255));
}

describe("the dark palette", () => {
	it("parses at all (guards every scan below)", () => {
		expect(D.size, "the dark block declares no custom properties").toBeGreaterThan(40);
		expect(DH.size, "the dark + high contrast block declares no custom properties").toBeGreaterThan(30);
		expect(D.get("--st-page")).toBeTruthy();
		expect(D.get("--stonetop-bg")).toBeTruthy();
		expect(RULES.length, "the dark section did not parse into rules").toBeGreaterThan(8);
	});

	// Before the accessibility block, whose tests treat everything from the no-texture rule to the
	// end as white paper, and whose "sits last" guard would otherwise have to make room for it.
	it("sits before the accessibility block, not inside it", () => {
		const at = CSS.indexOf(`${DARK} {`);
		expect(at).toBeGreaterThan(-1);
		expect(at, "the dark section moved after the no-texture rule").toBeLessThan(CSS.indexOf(FLAT));
		expect(CSS.indexOf(`${DARK_HC} {`)).toBeLessThan(CSS.indexOf(FLAT));
	});

	it("keeps the panel a step LIGHTER than the page, the raised-surface convention", () => {
		const page = D.get("--st-page"), panel = D.get("--stonetop-bg");
		expect(lum(panel)).toBeGreaterThan(lum(page));
		expect(contrastRatio(page, panel), "page and panel have become one colour").toBeGreaterThan(1.05);
		// And the page is a dark GREY, not black: the halation floor.
		expect(lum(page)).toBeGreaterThan(0.004);
	});

	it("gives every step of the ink ramp 4.5:1 on the lighter of page and panel", () => {
		const grounds = [D.get("--st-page"), D.get("--stonetop-bg")];
		for (const name of ["--st-text", "--st-text-body", "--st-text-secondary", "--st-text-muted", "--st-text-faint"]) {
			const ink = D.get(name);
			expect(ink, `${name} is not re-pointed, so it stays paper-dark on the dark page`).toBeTruthy();
			for (const g of grounds) {
				expect(contrastRatio(ink, g), `${name} (${ink}) is ${ratioText(ink, g)} on ${g}`)
					.toBeGreaterThanOrEqual(4.5);
			}
		}
	});

	it("keeps the ramp a ramp, brightest first", () => {
		const steps = ["--st-text", "--st-text-body", "--st-text-secondary", "--st-text-muted", "--st-text-faint"]
			.map(name => lum(D.get(name)));
		for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
	});

	it("gives every ink it re-points 4.5:1 and every boundary 3:1", () => {
		const panel = D.get("--stonetop-bg");
		let checked = 0;
		for (const [name, value] of D) {
			if (!parseColor(value) || parseColor(value).alpha < 1) continue;
			const bar = INK(name) ? 4.5 : BOUNDARY(name) ? 3 : null;
			if (!bar || /^--st-btn-primary-border/.test(name)) continue;
			checked++;
			expect(contrastRatio(value, panel), `${name} (${value}) is ${ratioText(value, panel)}`)
				.toBeGreaterThanOrEqual(bar);
		}
		expect(checked, "the scan found no inks at all").toBeGreaterThan(15);
	});

	it("keeps the primary button's bone label readable on its near-black fill", () => {
		expect(contrastRatio(D.get("--st-btn-primary-text"), D.get("--st-btn-primary-bg"))).toBeGreaterThanOrEqual(7);
		expect(lum(D.get("--st-btn-primary-bg")), "the button is no longer darker than the page")
			.toBeLessThan(lum(D.get("--st-page")));
	});

	it("re-points core's colour names on the window roots and the chat cards, never at :root", () => {
		const stranded = [...D.keys()].filter(n => n.startsWith("--color-") && !/^--color-the-/.test(n));
		expect(stranded, "core names set on :root are shadowed by core's own element declarations").toEqual([]);
		const tier = RULES.filter(([sel, body]) => /--color-text-dark-primary\s*:/.test(body)
			&& /\.stonetop\b/.test(sel) && /#chat/.test(sel) && !/past-death/.test(sel));
		expect(tier.length, "no dark rule re-declares core's text colours on the roots and cards").toBeGreaterThanOrEqual(1);
		// Only the Stonetop cards: a plain message keeps core's parchment, and bone ink on it vanishes.
		for (const [sel] of tier) expect(sel).toMatch(/\.message:is\(:has\(/);
	});
});

describe("the lamplit paper", () => {
	const tint = D.get("--st-paper-tint");

	it("lands the painted grain on the page token", () => {
		expect(tint, "the dark block names no paper tint").toBeTruthy();
		const mean = painted(tint, GRAIN.mean);
		expect(contrastRatio(mean, D.get("--st-page")), `the grain paints ${mean}, not ${D.get("--st-page")}`)
			.toBeLessThan(1.05);
	});

	it("keeps the spirals faint: well under 1.2:1 across the grain, and with the grain off", () => {
		const [mean, darkest, off] = [GRAIN.mean, GRAIN.darkest, GRAIN.off].map(g => painted(tint, g));
		expect(contrastRatio(mean, darkest)).toBeLessThan(1.2);
		expect(contrastRatio(mean, off)).toBeLessThan(1.2);
	});

	it("keeps the whole ramp readable at both extremes of the grain", () => {
		for (const g of Object.values(GRAIN)) {
			const ground = painted(tint, g);
			for (const name of ["--st-text", "--st-text-muted", "--st-text-faint"]) {
				expect(contrastRatio(D.get(name), ground)).toBeGreaterThanOrEqual(4.5);
			}
		}
	});

	// The four surfaces the light paper is painted on, each restated behind a zero-weight :where()
	// so a surface that already out-specifies it (a love letter, a dead character's black) keeps
	// its own look.
	it("repaints every surface the grain is painted on, and adds no weight doing it", () => {
		const paints = RULES.filter(([, body]) => /#fff\s+var\(--st-inverted-paper\)/.test(body));
		const selectors = paints.map(([sel]) => sel).join("\n");
		for (const surface of [/\.stonetop:not\(/, /\.stonetop-themed \.window-content/,
			/\.message:has\(\.stonetop-roll-card\)/, /\.message:has\(\.stonetop-dying-card\)/]) {
			expect(selectors, `${surface.source} keeps the white paper in dark mode`).toMatch(surface);
		}
		for (const [sel, body] of paints) {
			for (const one of sel.split(/,(?![^(]*\))/)) {
				expect(one.trim(), "a paint rule weighs more than the rule it replaces").toMatch(/^:where\(:root\.stonetop-dark\)/);
			}
			expect(body, "the blend list no longer matches the layers").toMatch(/background-blend-mode:[^;]*screen,\s*difference;/);
		}
	});

	it("never touches the grain tokens, which answer to Paper Texture alone", () => {
		for (const map of [D, DH]) {
			expect(map.has("--stonetop-bg-texture")).toBe(false);
			expect(map.has("--st-inverted-paper")).toBe(false);
		}
	});
});

describe("the art", () => {
	const ICONS = {
		"--stonetop-spiral-icon": "steading/check-spiral-light.svg",
		"--stonetop-question-spiral-icon": "steading/question-spiral-light.svg",
		"--stonetop-checkbox-icon": "steading/checkbox-light.svg",
		"--stonetop-checkbox-checked-icon": "steading/checkbox-checked-light.svg",
		"--stonetop-checkbox-partial-icon": "steading/checkbox-partial-light.svg",
		"--stonetop-diamond-icon": "playbooks/diamond-light.svg",
		"--stonetop-diamond-selected-icon": "playbooks/diamond_selected-light.svg",
		"--stonetop-playbook-arrow-icon": "playbooks/arrow_icon-light.svg",
		"--stonetop-blood-icon": "playbooks/blood-light.svg",
		"--stonetop-blood-filled-icon": "playbooks/blood-filled-light.svg",
		"--stonetop-blood-dotted-icon": "playbooks/blood-dotted-light.svg",
	};

	it("swaps every piece of fixed near-black art for a twin that exists", () => {
		for (const [token, file] of Object.entries(ICONS)) {
			expect(D.get(token), `${token} is not swapped, so it paints black on the dark page`).toContain(file);
			expect(repoFileExists(`assets/icons/${file}`), `${file} is missing`).toBe(true);
		}
	});

	// A twin is a recolour and nothing else: same path, same viewBox, so anything using the art as a
	// MASK is unaffected by which file it reads.
	it("makes each twin a recolour of its original and nothing more", () => {
		for (const file of Object.values(ICONS)) {
			const twin = readRepo(`assets/icons/${file}`);
			const original = readRepo(`assets/icons/${file.replace("-light.svg", ".svg")}`);
			const shape = svg => svg.replace(/<!--[\s\S]*?-->/g, "").replace(/<title>[^<]*<\/title>/g, "")
				.replace(/(fill|stroke)="#[0-9a-f]{3,6}"/gi, "$1=\"X\"").replace(/\s+/g, " ").trim();
			expect(shape(twin), `${file} is not a recolour of its original`).toBe(shape(original));
		}
	});

	it("paints the blood marks at 3:1 or better on the dark page", () => {
		const page = D.get("--st-page");
		for (const file of ["blood-light.svg", "blood-filled-light.svg"]) {
			const fill = /(?:fill|stroke)="(#[0-9a-f]{6})"/i.exec(readRepo(`assets/icons/playbooks/${file}`))[1];
			expect(contrastRatio(fill, page), `${file} is ${ratioText(fill, page)}`).toBeGreaterThanOrEqual(3);
		}
	});

	// A background that spells one of these urls out again is a mark the swap cannot reach.
	it("leaves no background painting the art from a literal url", () => {
		const literal = /^\s*background(-image)?\s*:[^;]*url\(['"]?[^)'"]*\/(checkbox|checkbox-checked|question-spiral|arrow_icon)\.svg/gm;
		expect([...CSS.matchAll(literal)].map(m => m[0].trim())).toEqual([]);
	});

	// The two panels that were ALWAYS dark invert the ink spiral with a filter; the swap would hand
	// them bone, which the filter turns back to black. They are pinned to the ink original.
	it("keeps the always-dark panels on the ink spiral their filter inverts", () => {
		const pin = RULES.find(([sel]) => /stonetop-basic-move-panel/.test(sel) && /stonetop-rel-value/.test(sel));
		expect(pin, "the pin for the always-dark panels is gone").toBeTruthy();
		expect(pin[1]).toMatch(/--stonetop-spiral-icon:\s*url\([^)]*check-spiral\.svg/);
	});
});

describe("the dead, darker and colder", () => {
	const rule = RULES.find(([sel]) => /stonetop-past-death/.test(sel));
	const dead = customProperties(rule?.[1]);
	const paper = "#0e0e0e";

	it("has its own rule, heavier than the past-death sheet's", () => {
		expect(rule, "the dark palette does not reach a dead character's sheet").toBeTruthy();
		expect(rule[0]).toMatch(/^:root\.stonetop-dark \.vtt \.stonetop\.app\.stonetop-past-death\.window-app \.window-content$/);
	});

	it("sits BELOW the lamplit page, and on neutral black", () => {
		expect(lum(dead.get("--st-page"))).toBeLessThan(lum(D.get("--st-page")));
		const { rgb } = parseColor(dead.get("--st-page"));
		expect(Math.max(...rgb) - Math.min(...rgb), "the dead page has picked up a hue").toBeLessThanOrEqual(2);
		// The lift every dead surface builds from comes DOWN in the dark palette.
		const base = customProperties(ownRule(CSS, ":root")).get("--st-black-lift")
			?? /--st-black-lift:\s*([^;]+);/.exec(CSS)[1];
		const alpha = v => Number(/,\s*([\d.]+)\)\s*$/.exec(v)[1]);
		expect(alpha(D.get("--st-black-lift"))).toBeLessThan(alpha(base));
	});

	it("reads its ink in neutral grey, not the living's bone, at 4.5:1 or better", () => {
		let checked = 0;
		for (const [name, value] of dead) {
			if (!INK(name) || !parseColor(value)) continue;
			checked++;
			const { rgb } = parseColor(value);
			expect(Math.max(...rgb) - Math.min(...rgb), `${name} (${value}) is warm, not cold`).toBeLessThanOrEqual(2);
			expect(contrastRatio(value, paper), `${name} (${value}) is ${ratioText(value, paper)}`).toBeGreaterThanOrEqual(4.5);
		}
		expect(checked).toBeGreaterThanOrEqual(6);
	});
});

describe("love letters and threat cards, on darker parchment", () => {
	const rule = RULES.find(([sel]) => /stonetop-love-letter/.test(sel) && /threat-card/.test(sel) && !/high-contrast/.test(sel));
	const tc = customProperties(rule?.[1]);

	it("darkens the shared --tc-* paper for both", () => {
		expect(rule, "the dark palette leaves the letters and threat cards on light paper").toBeTruthy();
		for (const name of ["--tc-paper", "--tc-paper-hi", "--tc-paper-lo", "--tc-ink", "--tc-ink-soft", "--tc-rule-hard"]) {
			expect(tc.has(name), `${name} is not re-pointed`).toBe(true);
		}
	});

	it("still reads as a separate sheet laid on the page", () => {
		expect(lum(tc.get("--tc-paper"))).toBeGreaterThan(lum(D.get("--st-page")));
		expect(contrastRatio(tc.get("--tc-paper"), D.get("--st-page"))).toBeGreaterThan(1.2);
		expect(contrastRatio(tc.get("--tc-rule-hard"), D.get("--st-page"))).toBeGreaterThanOrEqual(3);
	});

	it("keeps its ink readable on every stop of the paper", () => {
		for (const stop of ["--tc-paper", "--tc-paper-hi", "--tc-paper-lo"]) {
			expect(contrastRatio(tc.get("--tc-ink"), tc.get(stop))).toBeGreaterThanOrEqual(7);
			expect(contrastRatio(tc.get("--tc-ink-soft"), tc.get(stop))).toBeGreaterThanOrEqual(4.5);
		}
	});

	// The seal stays maroon; its label used to borrow the paper's highlight, which is now dark.
	it("keeps the seal's label light on the maroon", () => {
		const seal = /--ll-accent:\s*(#[0-9a-f]{6})/i.exec(CSS)[1];
		expect(tc.get("--ll-seal-text")).toBeTruthy();
		expect(contrastRatio(tc.get("--ll-seal-text"), seal)).toBeGreaterThanOrEqual(4.5);
		// And on paper nothing moved: the seal text IS the highlight there.
		expect(CSS).toMatch(/--ll-seal-text:\s*var\(--tc-paper-hi\)/);
		expect(CSS, "a seal label still reads the paper highlight directly").not.toMatch(/color:\s*var\(--tc-paper-hi\)/);
	});
});

describe("dark + high contrast", () => {
	const page = DH.get("--st-page"), panel = DH.get("--stonetop-bg");
	const grounds = () => [page, panel, ...Object.values(GRAIN).map(g => painted(DH.get("--st-paper-tint"), g))];

	// High contrast's own values are pitched for WHITE paper and come later in the file; any it
	// re-points that this block does not restate lands dark ink on the dark page.
	it("restates every token the high-contrast palette re-points", () => {
		const missing = [...HC.keys()].filter(name => !name.startsWith("--stonetop-fight-") && !DH.has(name));
		expect(missing, `left to high contrast's white-paper values: ${missing.join(", ")}`).toEqual([]);
	});

	it("gives every ink 7:1 on the page, the panel and both extremes of the grain", () => {
		let checked = 0;
		for (const [name, value] of DH) {
			if (!INK(name) || !parseColor(value)) continue;
			checked++;
			for (const g of grounds()) {
				expect(contrastRatio(value, g), `${name} (${value}) is ${ratioText(value, g)} on ${g}`)
					.toBeGreaterThanOrEqual(7);
			}
		}
		expect(checked).toBeGreaterThanOrEqual(15);
	});

	it("stops short of white on black, the halation case", () => {
		for (const [name, value] of DH) {
			if (!INK(name) || !parseColor(value)) continue;
			expect(lum(value), `${name} (${value}) is effectively white`).toBeLessThan(0.9);
		}
		expect(lum(page), "the page is effectively black").toBeGreaterThan(0.004);
	});

	it("outweighs both single-class palettes on the window roots and the letters", () => {
		const roots = RULES.find(([sel, body]) => sel.startsWith(DARK_HC) && /--color-text-dark-primary/.test(body));
		expect(roots, "core's names are left at high contrast's black on the dark page").toBeTruthy();
		const letters = RULES.find(([sel]) => sel.startsWith(DARK_HC) && /threat-card/.test(sel));
		expect(letters, "the letters keep high contrast's paper-dark rules").toBeTruthy();
		for (const name of ["--tc-rule", "--tc-rule-hard", "--tc-ink-soft"]) expect(letters[1]).toContain(name);
		const ring = RULES.find(([sel]) => sel.startsWith(DARK_HC) && /focus-visible/.test(sel));
		expect(ring, "the focus ring stays high contrast's navy, under 2:1 here").toBeTruthy();
	});
});

// The first dialog migrated, after it was reported unreadable: bone ink on a 55% white wash,
// dark-brown date headings on the dark page, white search and filter boxes. A literal written for
// paper anywhere in its rules brings one of those back.
describe("the ledger window", () => {
	const RULE = /([^{}]+)\{([^{}]*)\}/g;
	const ledger = [...CSS.matchAll(RULE)]
		.filter(([, sel]) => /\.stonetop-ledger-(toolbar|search|sort|noun|delete-selected|date-header|entry)\b/.test(sel)
			&& !/\.stonetop-ledger-row-check|\.stonetop-ledger-edit-check|\.stonetop-ledger-select-all\b/.test(sel));

	it("paints no colour the dark palette cannot turn over", () => {
		expect(ledger.length, "the ledger's rules did not parse").toBeGreaterThan(8);
		for (const [, sel, body] of ledger) {
			expect(body, `${sel.trim()} paints a paper-only literal`)
				.not.toMatch(/#fff\b|#a02020|#2f2a24|rgba\(\s*(0|255)\s*,\s*(0|255)\s*,\s*(0|255)\s*,/i);
		}
	});

	it("lifts its red and its headings on the dark page", () => {
		const panel = D.get("--stonetop-bg");
		for (const name of ["--st-danger-ink", "--st-heading-ink"]) {
			expect(D.get(name), `${name} is not re-pointed`).toBeTruthy();
			expect(DH.get(name), `${name} is not restated for dark + high contrast`).toBeTruthy();
			expect(contrastRatio(D.get(name), panel)).toBeGreaterThanOrEqual(4.5);
			expect(contrastRatio(DH.get(name), DH.get("--st-page"))).toBeGreaterThanOrEqual(7);
		}
	});
});

describe("the setting", () => {
	let saved;
	beforeEach(() => { saved = globalThis.document; globalThis.document = { documentElement: fakeEl() }; });
	afterEach(() => { globalThis.document = saved; });
	const classes = () => globalThis.document.documentElement.classes;

	it("turns the two axes on independently for all four palettes, and neither for anything else", () => {
		const expected = {
			normal: [false, false], high: [true, false], dark: [false, true], "dark-high": [true, true],
			"": [false, false], DARK: [false, false], "dark high": [false, false],
		};
		for (const [value, [hc, dark]] of Object.entries(expected)) {
			applySheetContrast(value);
			expect(classes().includes("stonetop-high-contrast"), `${value}: high contrast`).toBe(hc);
			expect(classes().includes("stonetop-dark"), `${value}: dark`).toBe(dark);
		}
		for (const junk of [undefined, null, 0]) {
			applySheetContrast(junk);
			expect(classes().includes("stonetop-dark")).toBe(false);
		}
	});

	it("has a label for every palette, offered or not", () => {
		const en = JSON.parse(readRepo("languages/en.json"));
		const labels = en.stonetop?.settings?.sheetContrast ?? {};
		// The value is "dark-high"; its label key is camelCase, like every other key in en.json.
		for (const key of ["normal", "high", "dark", "darkHigh"]) expect(labels[key], key).toBeTruthy();
	});

	// Offered since the sheet, the chat cards and the dialogs were migrated. The setting's label is
	// "Dark Mode & Contrast" (key still `sheetContrast`), so a search for "dark" finds it.
	it("offers all four palettes on the setting", () => {
		const src = readRepo("module/settings.js");
		const choices = src.match(/register\(SYSTEM_ID, "sheetContrast"[\s\S]*?choices: \{([^}]*)\}/)?.[1] ?? "";
		for (const value of ["normal", "high", "dark", "dark-high"]) expect(choices, value).toContain(`"${value}":`);
	});
});
