// Which release a document was made under, for a repair that must reach only what an older release
// made: Foundry records it on every document as `_stats.systemVersion`.
//
// But the server RESTAMPS that on any write to the document's `system` (or its type, or the system's
// own flags): a held move the refresh brought up to date (move-refresh.js) reads as made under the
// running release from then on. So that refresh keeps the version it found under MADE_UNDER_FLAG,
// before its own write, and this reads the flag first.

import { SYSTEM_ID } from "../system-id.js";

/** `flags.<system>.<this>`: the release a document was made under, kept from before a refresh restamped it. */
export const MADE_UNDER_FLAG = "madeUnder";

// Whether dotted version `a` is at or before `b`, part by part ("1.6.10" is after "1.6.9"). PURE.
export function versionAtOrBefore(a, b) {
	const pa = String(a).split(".").map(n => parseInt(n, 10) || 0);
	const pb = String(b).split(".").map(n => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d) return d < 0;
	}
	return true;
}

/** Whether `doc` was made under release `version` or earlier. No recorded version counts as earlier. PURE. */
export function madeAtOrBefore(doc, version) {
	const kept = doc?.flags?.[SYSTEM_ID]?.[MADE_UNDER_FLAG];
	const made = kept != null ? kept : doc?._stats?.systemVersion;
	return !made || versionAtOrBefore(made, version);
}
