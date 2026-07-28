#!/usr/bin/env node
/**
 * One-way codemod: rename the system id everywhere in the source tree.
 *
 *   node scripts/rename-system-id.js            # dry run, reports what would change
 *   node scripts/rename-system-id.js --apply    # writes
 *
 * Run this ONLY after the bridge release has shipped under the OLD id. The bridge is
 * what carries every existing world across; if the tree is renamed first there is no
 * old-id release left to publish it from.
 *
 * Close Foundry before applying: the compiled pack LevelDBs are held open while it runs.
 * After applying, rebuild the packs (`npm run pack`) so the compiled output picks up the
 * rewritten UUIDs and asset paths.
 *
 * `module/system-id.js` is special-cased rather than blind-replaced, because a textual
 * swap would collapse SYSTEM_ID and RENAME_TARGET_ID into the same value and would leave
 * the old id off the legacy fallback chain.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bracketizeIdentifierAccess } from "./lib/bracketize.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OLD = "stonetop_pwd";
const NEW = "stonetop-pwd";

const APPLY = process.argv.includes("--apply");

/** Directories never touched. */
const SKIP_DIRS = new Set([".git", "node_modules", ".vscode", "free pdfs"]);

/**
 * Compiled packs are gitignored LevelDB build output — skip them, but NOT `packs/src`,
 * which holds the pack sources and carries the bulk of the UUIDs and asset paths.
 */
const isCompiledPackDir = (relDir) => relDir.startsWith("packs/") && !relDir.startsWith("packs/src");

/** Extensions worth rewriting. Anything else is left alone. */
const EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".json", ".hbs", ".css", ".md", ".html"]);

/**
 * Individually skipped: local backups and THIS FILE.
 *
 * package-lock.json is deliberately NOT skipped. npm reconciles the lockfile's root
 * `name` against package.json's, so renaming one without the other leaves the tree in a
 * state npm wants to rewrite. Both occurrences there are that root name field.
 *
 * Skipping itself matters: the old id is a literal in the OLD constant below, so a run
 * that rewrote this script would leave `OLD === NEW` and every subsequent run would be a
 * silent no-op. (The run doing the rewriting still completes correctly, because Node has
 * already loaded it — which is exactly what makes the breakage easy to miss.)
 */
const SELF = "scripts/rename-system-id.js";
const SKIP_FILE = (rel) => rel === SELF || rel.endsWith(".bak");

/**
 * The bridge release is titled to warn against uninstalling it, since the Setup screen
 * shows a package's title and never its id. The renamed system takes the plain name back.
 */
function rewriteManifest(source) {
	return source
		.split(OLD).join(NEW)
		.replace(/"title":(\s*)"[^"]*"/, `"title":$1"Stonetop"`);
}

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join("/");

function* walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const abs = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			if (isCompiledPackDir(rel(abs))) continue;
			yield* walk(abs);
		} else if (EXTENSIONS.has(path.extname(entry.name))) {
			yield abs;
		}
	}
}

/** Which broad area a file belongs to, for the summary table. */
function area(relPath) {
	if (relPath.startsWith("packs/src/")) return "packs/src";
	if (relPath.startsWith("module/")) return "module";
	if (relPath.startsWith("templates/")) return "templates";
	if (relPath.startsWith("styles/")) return "styles";
	if (relPath.startsWith("tests/")) return "tests";
	if (relPath.startsWith("scripts/")) return "scripts";
	if (relPath.startsWith(".claude/")) return ".claude";
	return "root";
}

/**
 * Rewrite module/system-id.js: the active id becomes the new one, the old id joins the
 * head of the read-only fallback chain, and the rename target is retired.
 */
function rewriteSystemIdModule(source) {
	let out = source;
	out = out.replace(/export const SYSTEM_ID = "[^"]*";/, `export const SYSTEM_ID = "${NEW}";`);
	out = out.replace(
		/export const LEGACY_FLAG_SCOPES = Object\.freeze\(\[[^\]]*\]\);/,
		`export const LEGACY_FLAG_SCOPES = Object.freeze(["${OLD}", "stonetop"]);`
	);
	// The rename is done; leaving a live target would let the assistant re-offer itself.
	out = out.replace(/export const RENAME_TARGET_ID = "[^"]*";/, `export const RENAME_TARGET_ID = null;`);
	return out;
}

const summary = new Map();
const bump = (key, n) => summary.set(key, (summary.get(key) ?? 0) + n);

let filesChanged = 0;
let occurrences = 0;

for (const abs of walk(ROOT)) {
	const relPath = rel(abs);
	if (SKIP_FILE(relPath)) continue;

	const source = fs.readFileSync(abs, "utf8");
	let next;

	if (relPath === "module/system-id.js") {
		next = rewriteSystemIdModule(source);
	} else if (relPath === "system.json") {
		next = rewriteManifest(source);
	} else {
		if (!source.includes(OLD)) continue;
		const ext = path.extname(relPath);
		// JS needs the identifier-access pre-pass; JSON/HBS/CSS hold only strings.
		const prepared = (ext === ".js" || ext === ".mjs" || ext === ".cjs")
			? bracketizeIdentifierAccess(source, OLD)
			: source;
		next = prepared.split(OLD).join(NEW);
	}

	if (next === source) continue;

	const hits = source.split(OLD).length - 1;
	filesChanged += 1;
	occurrences += hits;
	bump(area(relPath), hits);

	if (APPLY) fs.writeFileSync(abs, next);
}

const label = APPLY ? "REWROTE" : "WOULD REWRITE";
console.log(`\n${label}  "${OLD}" -> "${NEW}"\n`);
for (const [key, count] of [...summary.entries()].sort((a, b) => b[1] - a[1])) {
	console.log(`  ${key.padEnd(14)} ${String(count).padStart(6)} occurrences`);
}
console.log(`\n  ${filesChanged} files, ${occurrences} occurrences total`);

if (!APPLY) {
	console.log("\nDry run. Re-run with --apply to write.");
} else {
	console.log("\nDone. Next: close Foundry, run `npm run pack`, then `npx vitest run`.");
}

// Anything still naming the old id after an apply is either deliberate (the legacy
// fallback chain, migration source constants) or an oversight worth eyeballing.
if (APPLY) {
	const stragglers = [];
	for (const abs of walk(ROOT)) {
		const relPath = rel(abs);
		if (SKIP_FILE(relPath)) continue;
		if (fs.readFileSync(abs, "utf8").includes(OLD)) stragglers.push(relPath);
	}
	if (stragglers.length) {
		console.log(`\nStill mention "${OLD}" (expected for the legacy fallback chain):`);
		for (const s of stragglers) console.log(`  ${s}`);
	}
}
