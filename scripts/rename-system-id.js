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
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bracketizeIdentifierAccess } from "./lib/bracketize.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OLD = "stonetop_pwd";
const NEW = "stonetop-pwd";

const APPLY = process.argv.includes("--apply");

/**
 * Directories never touched.
 *
 * `.claude` is skipped because it is entirely untracked AND because the old id appears
 * there as a FILESYSTEM PATH, not as a package id: the permission allowlists in
 * `.claude/settings*.json` and the ~74 `systems/stonetop_pwd/` references in the
 * verifier-foundry driver scripts all name the install directory, which this codemod does
 * not rename. Rewriting them points every entry at a path that does not exist, costing the
 * maintainer their whole permission allowlist and a working verifier, and buying the
 * package nothing, since none of it is tracked or shipped.
 */
const SKIP_DIRS = new Set([".git", "node_modules", ".vscode", "free pdfs", ".claude"]);

/**
 * Compiled packs are gitignored LevelDB build output — skip them, but NOT `packs/src`,
 * which holds the pack sources and carries the bulk of the UUIDs and asset paths.
 */
const isCompiledPackDir = (relDir) => relDir.startsWith("packs/") && !relDir.startsWith("packs/src");

/** Extensions worth rewriting. Anything else is left alone. */
const EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".json", ".hbs", ".css", ".md", ".html"]);

/**
 * package-lock.json is deliberately NOT skipped. npm reconciles the lockfile's root
 * `name` against package.json's, so renaming one without the other leaves the tree in a
 * state npm wants to rewrite. Both occurrences there are that root name field.
 */

/**
 * This codemod's own toolchain, skipped for one reason: every occurrence of the old id in
 * these three files is a description of the OLD -> NEW transform itself, so rewriting them
 * makes each one state that it converts a thing into itself.
 *
 * `rename-system-id.js` matters most, because the old id is a literal in the OLD constant
 * below: a run that rewrote this script would leave `OLD === NEW` and every subsequent run
 * would be a silent no-op. (The run doing the rewriting still completes correctly, because
 * Node has already loaded it, which is exactly what makes the breakage easy to miss.)
 *
 * `bracketize.js` and its test are the same class of mistake one step out. Rewritten, the
 * helper's doc comment reads "a textual rename of `stonetop-pwd` to `stonetop-pwd` would
 * turn `flags.stonetop-pwd.x` into `flags.stonetop-pwd.x`", and every fixture in the test
 * feeds it input that is already hyphenated, so the suite stays green while no longer
 * exercising the hazard it exists to prove. Both were caught by rehearsing the rename.
 */
const SELF = [
	"scripts/rename-system-id.js",
	"scripts/lib/bracketize.js",
	"tests/scripts/bracketize.test.js"
];

/**
 * MIGRATION.md is the document that EXPLAINS this rename, so both of its mentions of the
 * old id are deliberate narrative, not references to be updated: "changing the ID from
 * `stonetop_pwd` to `stonetop-pwd`" and "ship the bridge under `stonetop_pwd`". A blind
 * swap collapses the first into "from `stonetop-pwd` to `stonetop-pwd`" and makes the
 * second claim the bridge shipped under the new id, which is the one instruction a reader
 * must not get wrong.
 */
const SKIP_DOCS = new Set(["MIGRATION.md"]);
const SKIP_FILE = (rel) => SELF.includes(rel) || SKIP_DOCS.has(rel) || rel.endsWith(".bak");

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

/**
 * Every path git tracks, so the report below can name the files a `git reset --hard` will
 * NOT undo. `scripts/local/` is gitignored and holds ~2,960 occurrences: rewriting it is
 * correct, since those generators would otherwise point at an id that no longer exists,
 * but it is also unrevertible. Rehearsing this in the real tree rather than a scratch copy
 * cost exactly that, and the reset looked clean because git had nothing to say about it.
 */
function trackedPaths() {
	try {
		return new Set(execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean));
	} catch {
		return null; // Not a git checkout, or no git. The warning is a courtesy, not a gate.
	}
}

const summary = new Map();
const bump = (key, n) => summary.set(key, (summary.get(key) ?? 0) + n);
const touched = [];

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
	touched.push({ path: relPath, hits });

	if (APPLY) fs.writeFileSync(abs, next);
}

const label = APPLY ? "REWROTE" : "WOULD REWRITE";
console.log(`\n${label}  "${OLD}" -> "${NEW}"\n`);
for (const [key, count] of [...summary.entries()].sort((a, b) => b[1] - a[1])) {
	console.log(`  ${key.padEnd(14)} ${String(count).padStart(6)} occurrences`);
}
console.log(`\n  ${filesChanged} files, ${occurrences} occurrences total`);

// Untracked files are the ones a `git reset --hard` silently leaves rewritten, so name them
// BEFORE the apply as well as after. Grouped by directory: the list is otherwise dozens of
// generated files under one gitignored tree.
const tracked = trackedPaths();
if (tracked) {
	const untracked = touched.filter((t) => !tracked.has(t.path));
	if (untracked.length) {
		const byDir = new Map();
		for (const { path: p, hits } of untracked) {
			const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ".";
			const prev = byDir.get(dir) ?? { files: 0, hits: 0 };
			byDir.set(dir, { files: prev.files + 1, hits: prev.hits + hits });
		}
		const totalHits = untracked.reduce((n, t) => n + t.hits, 0);
		console.log(`\n⚠ ${untracked.length} of those files are NOT tracked by git (${totalHits} occurrences).`);
		console.log("  git cannot restore them — `git reset --hard` will leave them rewritten:");
		for (const [dir, { files, hits }] of [...byDir.entries()].sort((a, b) => b[1].hits - a[1].hits)) {
			console.log(`    ${dir.padEnd(34)} ${String(files).padStart(3)} files, ${String(hits).padStart(5)} occurrences`);
		}
		console.log("  Rehearse in a scratch copy of the tree, not here. See MIGRATION.md > Rehearsing.");
	}
}

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
