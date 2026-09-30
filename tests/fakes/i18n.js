/**
 * Holding a source's words to languages/en.json from a test.
 *
 * The i18n tests ask the same two questions of a file: does every key it names resolve in the
 * language file (a missing one prints the key on the window or the card), and is none of the
 * English it used to carry inline left behind. Each had grown its own copy of the table, the
 * lookup, the key scan and the comment strippers; one copy here, so they cannot drift apart.
 */
import { readRepo } from "./css.js";

/** languages/en.json, parsed. */
export const EN = JSON.parse(readRepo("languages/en.json"));

/** The string (or subtree) at a dotted key, or undefined. */
export const lookup = key => String(key).split(".").reduce((node, part) => node?.[part], EN);

/**
 * The keys a source hands localize()/format() whole: a quoted key, or a template over a `const` prefix
 * declared in the same source (`const KEY = "stonetop.x"`, or one built on it, `const SUB = \`${KEY}.y\``).
 * A key with a runtime part (`${kind}`) is left to each test's own families.
 */
export function usedKeys(source) {
	const prefixes = new Map();
	for (const m of source.matchAll(/const\s+(\w+)\s*=\s*"(stonetop\.[\w.]+)"/g)) prefixes.set(m[1], m[2]);
	for (const m of source.matchAll(/const\s+(\w+)\s*=\s*`\$\{(\w+)\}\.([\w.]+)`/g)) {
		if (prefixes.has(m[2])) prefixes.set(m[1], `${prefixes.get(m[2])}.${m[3]}`);
	}
	const keys = [];
	for (const m of source.matchAll(/(?:localize|format)\(\s*(["`])((?:(?!\1).)*)\1/g)) {
		const key = m[2].replace(/\$\{(\w+)\}/g, (all, name) => prefixes.get(name) ?? all);
		if (!key.includes("${")) keys.push(key);
	}
	return keys;
}

// Code comments quote the book and name the buttons; only the code is checked for leftover English.
// A `//` counts as a comment only at the start of a line or after whitespace, so a URL keeps its line.

/** JavaScript with its block and line comments taken out. */
export const code = source => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

/** Handlebars with its `{{!-- --}}` and `{{! }}` comments taken out. */
export const markup = source => source.replace(/\{\{!--[\s\S]*?--\}\}/g, "").replace(/\{\{![\s\S]*?\}\}/g, "");
