// Which release a document was made under, for a repair that must reach only what an older release
// made: Foundry records it on every document as `_stats.systemVersion`.

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
	const made = doc?._stats?.systemVersion;
	return !made || versionAtOrBefore(made, version);
}
