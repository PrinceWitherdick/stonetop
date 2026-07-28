// Release guard: shipped packs must carry NO _stats.coreVersion stamp.
//
// `npm run pack` produces clean, version-agnostic packs. A stamp means Foundry opened
// them AFTER packing and re-stamped them in place, and a v13 client then refuses to
// migrate every record in the pack ("Documents from a core version newer than the
// running version cannot be migrated"). Harmless in effect but it buries the log, and
// it is invisible unless something checks.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// classic-level ships with Foundry, not with this repo; point at the running install.
const FOUNDRY_APP = process.env.FOUNDRY_APP ?? "z:/Foundry/Foundry Virtual Tabletop/resources/app";
const require = createRequire(FOUNDRY_APP + "/package.json");
const { ClassicLevel } = require("classic-level");

const root = process.argv[2] ?? process.cwd();
const packsDir = path.join(root, "packs");

// Only the packs system.json actually declares. `packs/` also accumulates stale output
// from older versions that Foundry never loads and that must not ship.
const manifest = JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8"));
const declared = manifest.packs.map((p) => p.path.split("/").pop());

let stamped = 0;
let checked = 0;
const bad = [];

for (const name of declared) {
	const dir = path.join(packsDir, name);
	if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
		console.log("MISSING declared pack: " + name);
		process.exit(1);
	}

	// Not every directory under packs/ is a LevelDB; skip anything that will not open.
	const db = new ClassicLevel(dir, { keyEncoding: "utf8", valueEncoding: "json" });
	let local = 0;
	let n = 0;
	try {
		await db.open();
	} catch {
		console.log("  (skipped " + name + ": not a readable LevelDB)");
		continue;
	}
	try {
		for await (const [, v] of db.iterator()) {
			if (!v || typeof v !== "object") continue;
			n += 1;
			if (v?._stats?.coreVersion) local += 1;
		}
	} finally { await db.close(); }

	checked += n;
	stamped += local;
	if (local) bad.push(name + ": " + local + "/" + n + " stamped");
}

console.log("checked " + checked + " documents across the compiled packs");
if (stamped) {
	console.log("FAIL - coreVersion stamps present (Foundry opened these after packing):");
	for (const b of bad) console.log("  " + b);
	process.exit(1);
}
console.log("PASS - no coreVersion stamps; safe for v13");
