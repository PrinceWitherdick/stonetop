import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { moveBodyHtml, parseTiersFromProse, splitClauses } from "../../module/utils/move-tiers.js";
import { parseArcanumMoves } from "../../module/data/arcana-moves.js";
import { decodeEntities, stripHtmlToText } from "../../module/utils/strings.js";

// EVERY shipped move that the tier ladder lays out (utils/move-tiers.js), read from the pack
// SOURCE and held to the invariants a 2026-10-02 audit found broken one move at a time: a rung's
// own sentence left behind in the prose, two rolls merged into one ladder, a colon joining two
// statements, a ladder hung after the wrong trigger. The per-move tests in
// tests/utils/move-tiers.test.js pin the moves that were wrong; this pins the rule over all of
// them, so a pack edit or a parser change that breaks a move nobody thought to test still fails.
//
// The source dirs are named, and only these are read: never dist/ or a built pack.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ITEM_DIRS = ["packs/src/stonetop-items"];
const ARCANA_DIRS = ["packs/src/stonetop-arcana"];

function jsonFiles(rel) {
	const out = [];
	const walk = dir => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith(".json")) out.push(p);
		}
	};
	walk(path.join(ROOT, rel));
	return out;
}

/** Every move the ladder can lay out: item moves, arcana mysteries, arcana condensed moves. */
function shippedMoves() {
	const moves = [];
	for (const file of ITEM_DIRS.flatMap(jsonFiles)) {
		const doc = JSON.parse(fs.readFileSync(file, "utf8"));
		if (doc.type !== "move" || typeof doc.system?.description !== "string") continue;
		moves.push({ name: doc.name, description: doc.system.description, moveResults: doc.system.moveResults ?? null });
	}
	for (const file of ARCANA_DIRS.flatMap(jsonFiles)) {
		const back = JSON.parse(fs.readFileSync(file, "utf8")).flags?.stonetop?.back;
		if (!back) continue;
		for (const m of parseArcanumMoves(back.description ?? "")) moves.push({ name: m.name, description: m.description, moveResults: null });
		if (back.move?.description) moves.push({ name: back.move.name, description: back.move.description, moveResults: null });
	}
	return moves;
}

const plain = html => decodeEntities(stripHtmlToText(html)).replace(/\s+/g, " ").trim();
const paragraphs = html => html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [];
// A rung head opening a clause ("on a 10+", "and on a 7-9", "On 7+"), and one anywhere in a row.
const OPENS_ON_RUNG = /^(?:(?:and|then|also|but|or|otherwise)\b[,;:]?\s+)*on\s+(?:an?\s+)?(?:10|[6-9])\s*(?:\+|\p{Pd})/iu;
const RUNG_IN_TEXT = /\bon\s+(?:an?\s+)?(?:10|[6-9])\s*(?:\+|\p{Pd})/iu;
// Sentences that speak for the whole move, which a rung's paragraph may leave in the prose.
const GENERAL = /^(?:either way|regardless|in any case|whatever|you (?:can|may) spend)/i;

/** Rolls with tiers of their own: each "roll +X" followed by a rung head before the next roll. */
function tieredRolls(description) {
	const t = paragraphs(description).map(plain).join(" \n ");
	let count = 0, open = false;
	for (const m of t.matchAll(/(\b(?:roll|rolls|rolling)\s+(?:\+|\d*d\d))|\bon\s+(?:an?\s+)?(?:10|[6-9])\s*(?:\+|\p{Pd})/giu)) {
		if (m[1]) open = true;
		else if (open) { count++; open = false; }
	}
	return count;
}

function laidOut(move) {
	const body = moveBodyHtml(move.description, move.moveResults);
	const rows = [...body.matchAll(/data-tier="(\w+)"[\s\S]*?tier-text">([\s\S]*?)<\/span><\/li>/g)].map(([, key, row]) => [key, plain(row)]);
	const prose = plain(body
		.replace(/<ul class="stonetop-move-tiers"[\s\S]*?<\/span><\/li><\/ul>/, " @@LADDER@@ ")
		.replace(/<ul class="stonetop-move-shared-options">[\s\S]*?<\/ul>/, " ")
		.replace(/<p class="stonetop-move-tiers-note">[\s\S]*?<\/p>/g, " "));
	return { body, rows, prose, hasLadder: rows.length > 0 };
}

const MOVES = shippedMoves();
const LAID = MOVES.map(move => ({ move, ...laidOut(move) }));
const WITH_LADDER = LAID.filter(l => l.hasLadder);
const failures = (check) => WITH_LADDER.flatMap(l => check(l) ? [`${l.move.name}: ${check(l)}`] : []);

describe("the tier ladder over every shipped move", () => {
	// So none of the checks below can pass by finding nothing to check.
	it("reads the shipped moves and lays a ladder out for over a hundred of them", () => {
		expect(MOVES.length).toBeGreaterThan(300);
		expect(WITH_LADDER.length).toBeGreaterThan(100);
	});

	it("never merges two tiered rolls into one prose ladder", () => {
		const merged = MOVES.filter(m => tieredRolls(m.description) > 1 && parseTiersFromProse(m.description, m.moveResults))
			.map(m => m.name);
		expect(merged).toEqual([]);
	});

	it("never prints another tier head inside a row", () => {
		expect(failures(({ rows }) => rows
			.find(([, row]) => RUNG_IN_TEXT.test(row.replace(/\bas on an? /gi, "")))?.[0])).toEqual([]);
	});

	it("never joins two statements across a colon in a row", () => {
		expect(failures(({ rows }) => rows.find(([, row]) => /\d:\s+(?:you|when)\b/i.test(row))?.[0])).toEqual([]);
	});

	it("leaves no sentence of a paragraph that opens with a tier in the prose", () => {
		expect(failures(({ move, prose }) => {
			for (const p of paragraphs(move.description)) {
				const clauses = splitClauses(p.replace(/^<p[^>]*>|<\/p>$/g, "")).map(plain).filter(Boolean);
				if (!OPENS_ON_RUNG.test(clauses[0] ?? "")) continue;
				const left = clauses.slice(1).find(c => !OPENS_ON_RUNG.test(c) && !GENERAL.test(c) && c.length >= 12
					&& prose.includes(c.slice(0, 40)));
				if (left) return left;
			}
			return null;
		})).toEqual([]);
	});

	it("leaves no list that a rung's colon introduced in the prose", () => {
		expect(failures(({ move, prose }) => {
			for (const p of paragraphs(move.description)) {
				const clauses = splitClauses(p.replace(/^<p[^>]*>|<\/p>$/g, "")).map(plain).filter(Boolean);
				const left = clauses.find((c, i) => i > 0 && OPENS_ON_RUNG.test(clauses[i - 1]) && /:$/.test(clauses[i - 1])
					&& !OPENS_ON_RUNG.test(c) && c.length >= 12 && prose.includes(c.slice(0, 40)));
				if (left) return left;
			}
			return null;
		})).toEqual([]);
	});

	it("never leaves a rung naming a count while another rung keeps the options to itself", () => {
		expect(failures(({ rows, body }) => {
			const counts = rows.some(([, row]) => /^(?:gm\s+)?(?:also\s+)?(?:picks?|chooses?|ask)\s+\d+\.?$/i.test(row));
			const inline = rows.find(([, row]) => /:\s*[^:;]+;[^:]+$/.test(row));
			return counts && inline && !body.includes("stonetop-move-shared-options") ? inline[0] : null;
		})).toEqual([]);
	});

	it("hangs the ladder before any trigger that follows the tiers", () => {
		expect(failures(({ move, prose }) => {
			const ps = paragraphs(move.description);
			let last = -1;
			ps.forEach((p, i) => { if (RUNG_IN_TEXT.test(plain(p))) last = i; });
			if (last < 0) return null;
			const at = prose.indexOf("@@LADDER@@");
			const early = ps.slice(last + 1).map(plain)
				.find(t => /^When\b/.test(t) && prose.indexOf(t.slice(0, 40)) >= 0 && prose.indexOf(t.slice(0, 40)) < at);
			return early ?? null;
		})).toEqual([]);
	});

	it("never opens a sentence in lower case where a cut left a full stop", () => {
		const lowerAfterStop = s => (s.match(/[a-z]\.\s+[a-z]/g) ?? []).length;
		expect(failures(({ move, prose }) =>
			lowerAfterStop(prose) > lowerAfterStop(plain(move.description)) ? "lower case after a full stop" : null)).toEqual([]);
	});
});
