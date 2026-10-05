import { it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CURRENT_FINGERPRINTS, SUPERSEDED_FORMAT as DATA_FORMAT } from "../../module/migration/data/superseded-move-fields.js";
import { entryFingerprint, SUPERSEDED_FORMAT } from "../../module/migration/superseded-values.js";

// module/migration/data/superseded-move-fields.js lists the pack's FORMER values, and is generated from
// git history. A pack edit since it was generated leaves the old value out of the list, so a copy
// holding it is never corrected. This is the reminder: it needs no git history, so it runs anywhere.

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "packs", "src", "stonetop-items");
const readTree = dir => readdirSync(dir).flatMap(name => {
	const p = path.join(dir, name);
	if (statSync(p).isDirectory()) return readTree(p);
	return name.endsWith(".json") && !name.startsWith("_") ? [JSON.parse(readFileSync(p, "utf8"))] : [];
});

it("was generated from the pack as it is now (else run `npm run gen:superseded`)", () => {
	expect(DATA_FORMAT).toBe(SUPERSEDED_FORMAT);
	const now = Object.fromEntries(readTree(root).filter(d => d.type === "move").map(d => [d._id, entryFingerprint(d)]));
	const stale = Object.keys({ ...now, ...CURRENT_FINGERPRINTS }).filter(id => now[id] !== CURRENT_FINGERPRINTS[id]);
	expect(stale).toEqual([]);
});
