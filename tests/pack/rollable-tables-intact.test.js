import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { PACKS } from "../../scripts/packs.js";

// Guards the random-tables baked into the journal compendium against the parsing
// failure that flattened several of them (Book II "Death & Dying" Themes, "Other
// gods" theme/observance, faction "1d6 site" tables, the-makers site table, etc.):
// the PDF-to-HTML pass would drop the tail rows of a <table> into loose <p> text,
// or never build the <table> at all. Either way the rollable-table enhancer
// (module/utils/journal-roll-tables.js) can't roll the missing rows.
//
// Two signatures, mirrored from the one-off audit that found the originals:
//   A. a <table> that stops short of its "1dN" caption, or whose next <p> begins
//      with the row number that should have been its next <tr>; and
//   B. a "1dN" caption <p> immediately followed by a numbered "<p>1 …" row rather
//      than a <table> — the whole table flattened to paragraphs.

const SRC = path.resolve("packs/src");
const JOURNAL_DIRS = (PACKS.find(p => p.name === "stonetop-journal")?.sources ?? [])
	.map(s => path.join(SRC, s));

// Every HTML string that can hold a table: location-page section bodies (+ Q&A
// and grouped Dangers) and plain text-page content.
function* htmlBodies(doc, file) {
	for (const [i, page] of (doc.pages ?? []).entries()) {
		const where = `${file}#page${i}`;
		if (page.type === "location") {
			for (const [j, s] of (page.system?.sections ?? []).entries()) {
				if (typeof s.body === "string") yield { where: `${where}.section${j}`, html: s.body };
				for (const [k, g] of (s.groups ?? []).entries())
					if (typeof g.body === "string") yield { where: `${where}.section${j}.group${k}`, html: g.body };
			}
		} else if (typeof page.text?.content === "string") {
			yield { where, html: page.text.content };
		}
	}
}

// Highest row number a table's tbody covers (last <tr>'s first-cell range hi), or
// null when the first column isn't a clean number/range — i.e. not a roll table.
function tableMaxRow(tableHtml) {
	const rows = [...tableHtml.matchAll(/<tr>\s*<td>(.*?)<\/td>/g)]
		.map(m => m[1].replace(/<[^>]+>/g, "").trim());
	if (!rows.length) return null;
	let max = 0;
	for (const cell of rows) {
		const m = cell.match(/^(\d+)\s*[-–—]\s*(\d+)$|^(\d+)$/);
		if (!m) return null;
		max = Math.max(max, m[3] !== undefined ? +m[3] : +m[2]);
	}
	return max;
}

async function readDocs(dirs) {
	const out = [];
	async function walk(d) {
		let entries;
		try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
		for (const e of entries) {
			if (e.name === "_folders") continue;
			const full = path.join(d, e.name);
			if (e.isDirectory()) await walk(full);
			else if (e.name.endsWith(".json"))
				out.push({ file: path.relative(SRC, full), doc: JSON.parse(await fs.readFile(full, "utf8")) });
		}
	}
	for (const d of dirs) await walk(d);
	return out;
}

let entries;
beforeAll(async () => { entries = await readDocs(JOURNAL_DIRS); });

describe("journal rollable tables are intact (not flattened by parsing)", () => {
	it("found journal source entries to scan", () => {
		expect(entries.length).toBeGreaterThan(0);
	});

	it("no <table> is truncated relative to its caption, or spills rows into a following paragraph", () => {
		const bad = [];
		for (const { file, doc } of entries) {
			for (const { where, html } of htmlBodies(doc, file)) {
				const re = /<table>[\s\S]*?<\/table>/g;
				let m;
				while ((m = re.exec(html))) {
					const maxRow = tableMaxRow(m[0]);
					if (maxRow == null) continue; // not a numeric roll table
					// Caption die "1dN" in the text just before the table.
					const before = html.slice(Math.max(0, m.index - 160), m.index);
					const cap = [...before.matchAll(/(\d+)\s*d\s*(\d+)/gi)].pop();
					const dieN = cap ? +cap[2] : null;
					if (dieN != null && maxRow < dieN)
						bad.push(`${where}: table stops at ${maxRow} but caption says 1d${dieN}`);
					// A <p> right after the table that begins with the next row number.
					const after = html.slice(re.lastIndex);
					const pm = after.match(/^<p>\s*(?:<strong>)?\s*(\d+)\b/);
					if (pm && +pm[1] === maxRow + 1)
						bad.push(`${where}: table ends at ${maxRow}, row ${pm[1]} spilled into a <p>`);
				}
			}
		}
		expect(bad).toEqual([]);
	});

	it("no '1dN' caption is followed by a flattened numbered paragraph instead of a <table>", () => {
		const bad = [];
		for (const { file, doc } of entries) {
			for (const { where, html } of htmlBodies(doc, file)) {
				// caption <p> (bold or not) holding just a die notation, then the next element
				const re = /<p>\s*(?:<strong>)?\s*(\d+d\d+)\b[^<]*(?:<\/strong>)?\s*<\/p>\s*(<table>|<p>)/gi;
				let m;
				while ((m = re.exec(html))) {
					if (m[2].toLowerCase() !== "<p>") continue; // a real <table> follows — fine
					// Flattened when that <p> opens with a "1 …" / "1-… " row.
					if (/^<p>\s*(?:<strong>)?\s*1\s*[-–—\s]/.test(html.slice(re.lastIndex - 3)))
						bad.push(`${where}: caption "${m[1]}" is followed by a numbered <p> row, not a <table>`);
				}
			}
		}
		expect(bad).toEqual([]);
	});
});
