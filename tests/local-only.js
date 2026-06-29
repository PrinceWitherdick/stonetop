// Helpers for tests that depend on LOCAL-ONLY generator source.
//
// scripts/local/** is gitignored: the content generators ship only their packs/src
// JSON output, not their source (see .gitignore). A few generator UNIT tests import
// those modules directly, so they can only run where the generator source is present
// (a developer's working tree) and must be skipped where it is absent (a fresh CI
// checkout) rather than crashing the whole suite with ERR_MODULE_NOT_FOUND.
import { describe, it } from "vitest";

// Load one or more local-only ESM modules. Each argument is an import THUNK
// (`() => import("../../scripts/local/...")`) so the specifier resolves relative to the
// calling test file. Returns the module namespace for a single thunk, an array of
// namespaces for several, or null if ANY of them is absent in this checkout. A failure
// that is NOT a missing module (e.g. a syntax error in a present generator) is rethrown
// so real breakage still surfaces loudly.
export async function loadLocal(...thunks) {
	try {
		const mods = await Promise.all(thunks.map((thunk) => thunk()));
		return thunks.length === 1 ? mods[0] : mods;
	} catch (err) {
		if (err?.code === "ERR_MODULE_NOT_FOUND") return null;
		throw err;
	}
}

// A describe() that runs the suite when its generator(s) loaded, or — when they are
// absent — registers a single skipped placeholder WITHOUT executing the suite body.
// (vitest runs a describe body at collection time even under .skip, which would call
// into the missing module; dropping the body is what keeps the file from crashing.)
export function describeLocal(loaded) {
	if (loaded) return describe;
	return (name) =>
		describe.skip(name, () => {
			it("skipped — scripts/local generator source not present in this checkout", () => {});
		});
}
