// Every Application currently on screen, across BOTH registries.
//
// Foundry keeps them in two places: V1 Applications register in `ui.windows`, while
// ApplicationV2 instances live in `foundry.applications.instances`. Any code that asks
// "is this window already open?" has to look in both, or it silently stops working the
// day the dialog it guards is migrated to V2 — the guard doesn't fail loudly, it just
// starts answering "no" and lets duplicates stack.
//
// Both lookups are defensive: `ui` exists from very early, but `foundry.applications`
// does not exist on older cores, and neither is present in the unit-test environment.

export function openApplications() {
	const v1 = Object.values(globalThis.ui?.windows ?? {});
	const v2 = Array.from(globalThis.foundry?.applications?.instances?.values?.() ?? []);
	return [...v1, ...v2];
}

/** The first open Application matching `predicate`, or null. */
export function findOpenApp(predicate) {
	return openApplications().find(app => { try { return predicate(app); } catch { return false; } }) ?? null;
}
