import { getSetting, setSetting, setWorldSetting, worldKey } from "../settings.js";

// ── Walkthrough reload-resume ──────────────────────────────────────────────────
// The session-zero walkthroughs (Character Introductions, Let Spring Burst Forth)
// are plain Applications that don't survive a browser refresh. Each one records, in
// a single client-scoped setting, where it is and whether it's currently open; a
// browser reload never runs the dialog's close(), so an `open: true` left behind
// means it was open when the page unloaded. hooks/Ready.js calls
// reopenOpenWalkthroughs() to bring those back at the page they were on. See
// settings.js for the stored shape.

const SETTING = "walkthroughResume";
// Which session-zero walkthroughs THIS world has finished. World-scoped (see
// settings.js) so completion resets in a fresh world rather than leaking across every
// world opened in the same browser the way the client-scoped resume above does.
const DONE_SETTING = "sessionZeroDone";

// The walkthrough keys stored per world (used by the flat-shape migration below).
const WALKTHROUGH_KEYS = ["introductions", "springBurst"];

// Every record is stored under the current world's id (see settings.js's worldKey, shared with
// the Setting Overview gate, which nests for the same reason). The setting is client-scoped, so
// it survives per-browser across every world opened here; nesting by world means a record left
// `open: true` in one world can never reopen its dialog in an unrelated (even brand-new) world
// that never started session zero. A world with no entry simply starts fresh.

// One walkthrough's record ({ open, … }) for THIS world, or null if nothing's stored yet.
export function getWalkthroughResume(key) {
	return getSetting(SETTING)?.[worldKey()]?.[key] ?? null;
}

// Merge `patch` into one walkthrough's record for THIS world (creating it if absent), or
// drop the record entirely with `patch === null`. Returns the settings-write promise.
export function patchWalkthroughResume(key, patch) {
	const wk    = worldKey();
	const all   = { ...(getSetting(SETTING) ?? {}) };
	const world = { ...(all[wk] ?? {}) };
	if (patch === null) delete world[key];
	else world[key] = { ...(world[key] ?? {}), ...patch };
	all[wk] = world;
	return setSetting(SETTING, all);
}

// Record that a walkthrough was finished via its final button. Two writes: the client
// resume record is closed (open:false) and its saved position dropped — `positionKeys`
// names those fields ("phase"/"pcIndex", or "step") — so a later manual reopen starts
// fresh rather than resuming a finished run; and the completion itself is flagged in the
// world-scoped `sessionZeroDone` setting, which is what stops the first-session Welcome
// guide once both walkthroughs are complete (see sessionZeroComplete / hooks/Ready.js).
// Only the GM ever finishes a walkthrough (and only the GM can write world settings); that
// guard now lives in setWorldSetting, shared with every other world write in the system.
export function markWalkthroughDone(key, positionKeys = []) {
	const patch = { open: false };
	for (const k of positionKeys) patch[k] = null;
	const resumeWrite = patchWalkthroughResume(key, patch);
	const done = { ...(getSetting(DONE_SETTING) ?? {}), [key]: true };
	// setWorldSetting no-ops for a non-GM rather than throwing: the resume half above is
	// client-scoped and must still land for them (see settings.js).
	return Promise.all([resumeWrite, setWorldSetting(DONE_SETTING, done)]);
}

// True once both session-zero walkthroughs — Character Introductions and Let Spring
// Burst Forth — have been finished via their final button (each marked with
// markWalkthroughDone). World-scoped, so a fresh world starts session zero over again
// instead of inheriting completion from another world opened in the same browser.
export function sessionZeroComplete() {
	const done = getSetting(DONE_SETTING) ?? {};
	return !!(done.introductions && done.springBurst);
}

// Open an app and resolve once it has actually rendered. The v1 Application render()
// is fire-and-forget (it returns `this`, not the render promise), so we listen for
// its `render<ClassName>` hook; a safety timeout resolves anyway so the chain can
// never hang if a render fails to fire.
function openThenRendered(open, renderHook) {
	return new Promise(resolve => {
		let settled = false;
		let hookId  = null;
		const finish = () => {
			if (settled) return;
			settled = true;
			if (hookId !== null) Hooks.off(renderHook, hookId);
			clearTimeout(timer);
			resolve();
		};
		hookId = Hooks.once(renderHook, finish);
		const timer = setTimeout(finish, 3000);
		Promise.resolve(open()).catch(() => finish());
	});
}

// One-time migration of the pre-world-keying flat shape. Records used to live at the top
// level ({ introductions:{…}, springBurst:{…} }); after world-keying those keys can't be
// read by the world-scoped getters and would linger forever. Fold any flat record under
// THIS world (the one this browser most likely had it open in — the flat shape carried no
// world attribution) and drop the stale top-level keys. Idempotent: after it runs the flat
// keys are gone; a value that already looks like a world bucket (holds intro/springBurst
// sub-records) is left alone, so it can't swallow a world whose id happens to be
// "introductions"/"springBurst"; and an existing world record is never clobbered.
export function migrateFlatWalkthroughResume() {
	const all = getSetting(SETTING);
	if (!all || typeof all !== "object") return;
	const looksFlat = v => v && typeof v === "object"
		&& !("introductions" in v) && !("springBurst" in v);
	const flatKeys = WALKTHROUGH_KEYS.filter(k => looksFlat(all[k]));
	if (!flatKeys.length) return;
	const next  = { ...all };
	const wk    = worldKey();
	const world = { ...(next[wk] ?? {}) };
	for (const k of flatKeys) {
		if (world[k] === undefined) world[k] = next[k]; // keep a newer world record if present
		delete next[k];
	}
	next[wk] = world;
	return setSetting(SETTING, next);
}

// Reopen any walkthrough that was open when the page last unloaded, each at the page
// it was on (the dialogs restore their own position on open). We let one fully render
// before opening the next so the last — Spring Burst, if it was open on top of
// Introductions — lands frontmost instead of being buried by a slower-rendering
// sibling. Called from ready (after the Welcome guide renders; see hooks/Ready.js).
export async function reopenOpenWalkthroughs() {
	// Fold any pre-world-keying flat record under this world first, so an upgrade mid-session
	// still finds its `open: true` (see migrateFlatWalkthroughResume).
	await migrateFlatWalkthroughResume();
	// getWalkthroughResume reads only THIS world's records (see worldKey), so a stray
	// `open: true` left behind in another world can never reopen its dialog here.
	if (getWalkthroughResume("introductions")?.open === true) {
		await openThenRendered(() => game.stonetop?.openIntroductions?.(), "renderIntroductionsDialog");
	}
	if (getWalkthroughResume("springBurst")?.open === true) {
		await openThenRendered(() => game.stonetop?.openSpringBurst?.(), "renderSpringBurstDialog");
	}
}
