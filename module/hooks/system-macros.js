// The system's macros at `ready`: the GM's hotbar set (placed, kept up and snapped into order),
// the player's share of it, and the two Macro Directory entries that never touch the hotbar.
// Called from onReady (hooks/Ready.js).

import { getSetting, setSetting } from "../settings.js";
import { BOOK2_ART_MACRO_NAME, findBook2ArtWorldMacro, loadBook2ArtMacroSource } from "../book2-art/macro.js";
import { bestEffort } from "../utils/best-effort.js";

// The "(TEST ONLY) Populate World" dev macro, added to the Macro Directory but never
// the hotbar. Its body is the create-test-characters dev script — that file is the single
// source of truth, fetched at runtime (see _ensureTestPopulateMacro). It SHIPS: it is
// un-ignored in .gitignore and named explicitly in the release zip step, so released
// worlds get the macro too. A build that omits it still skips seeding, silently.
const _TEST_MACRO_NAME   = "(TEST ONLY) Populate World";
const _TEST_MACRO_SRC    = "systems/stonetop_pwd/scripts/local/create-test-characters.js";
const _TEST_MACRO_IMG    = "systems/stonetop_pwd/assets/icons/macros/hazard-sign.svg";
const _TEST_MACRO_FOLDER = "For Testing Purposes";

// Retired hotbar macros, deleted rather than slotted (see _retireSystemMacros). Name AND command
// identify the system-created ones, so a GM's own macro that happens to share a name is left alone.
const _RETIRED_MACROS = [
	// The Introductions walkthrough now launches from the Welcome guide.
	{
		name: "Character Introductions",
		command: `\
const w = Object.values(ui.windows).find(w => w.id === "stonetop-introductions");
if (w?.rendered) { w.bringToTop(); return; }
game.stonetop?.openIntroductions?.();`,
	},
	// The two catalogue browsers became one window with a tab each, so "Browse Stonetop"
	// replaces both.
	{ name: "Browse the Arcana",   command: "game.stonetop?.openArcanaBrowser?.()" },
	{ name: "Browse the Bestiary", command: "game.stonetop?.openBestiaryBrowser?.()" },
];

// The ordered system hotbar macros, in their canonical order. The single source of truth
// for both _ensureHotbarMacro (places any that are missing) and _reorderSystemMacros (snaps
// them into this order). Chronicle (7) / End of Session (10, the key marked 0) are handled
// separately below because they also key on their command. "Browse Stonetop" reads
// GM-hidden compendia and the GM's own NPC notes — the GM-only pass places these, so they
// never reach a player's hotbar.
//
// `shared` marks a macro the whole table uses: the Die of Fate is rolled by whoever
// the fiction points at, not just the GM, so it is created readable by everyone and placed
// on each player's own hotbar at `playerSlot` (see ensurePlayerHotbarMacros). A player's
// bar is otherwise empty of system macros, so it starts at slot 1 rather than the GM's 4.
//
// `legacy` marks the two a new world no longer gets: Seasons Change and Weather, which the
// time banner across the top of the screen opens (seasons/time-banner.js). A legacy
// macro is never CREATED, only kept up where a world already has one, so an older world's bar
// is left exactly as it was. Their slots sit after the Chronicle, so a GM's bar in an older
// world still fills 1-10 with no gap when it is placed or re-snapped; in a new world 8-9 are
// simply empty. The rest moved left into the slots they vacated (2 and 4); that is NOT a
// layout-version bump, because an older world's arrangement is not wrong and re-snapping it
// would undo any arrangement its GM had made.
const _SYSTEM_MACROS = [
	{ name: "Welcome to Stonetop", img: "systems/stonetop_pwd/assets/icons/macros/direction-signs.svg", command: "game.stonetop?.openWelcome?.()",        slot: 1 },
	{ name: "Run an Expedition",   img: "systems/stonetop_pwd/assets/icons/macros/treasure-map.svg",     command: "game.stonetop?.openExpedition?.()",     slot: 2 },
	// GM prep (Book I p.568), and its only door: the character sheet reads, edits and deletes a
	// letter but never writes a new one.
	{ name: "Write a Love Letter", img: "systems/stonetop_pwd/assets/icons/macros/love-letter.svg",      command: "game.stonetop?.openLoveLetter?.()",     slot: 3 },
	{ name: "Die of Fate",         img: "systems/stonetop_pwd/assets/icons/macros/die-of-fate.svg",      command: "game.stonetop?.rollDieOfFate?.()",      slot: 4, shared: true, playerSlot: 1 },
	// One window over the arcana, the bestiary and the world's people (see
	// dialogs/StonetopBrowserDialog.js), so a magnifying glass rather than any one list's
	// symbol — it is the LOOKING that all three tabs have in common.
	{ name: "Browse Stonetop",     img: "systems/stonetop_pwd/assets/icons/macros/magnifying-glass.svg", command: "game.stonetop?.openBrowser?.()",        slot: 5 },
	// Shared, unlike its neighbours: everyone at the table owns the relationship maps and edits
	// them, so a macro only the GM could reach would be a window most of its users could not open.
	// The picture is the board itself: boxed people joined by lines. Not the truce handshake End
	// of Session already wears, because two macros on one picture are indistinguishable on the bar.
	{ name: "Relationship Map",    img: "systems/stonetop_pwd/assets/icons/macros/relationship-map.svg", command: "game.stonetop?.openRelationshipMap?.()", slot: 6, shared: true, playerSlot: 2 },
	// Seasons Change took the spring icon that Welcome used to carry; Welcome now uses the
	// direction-signs.
	{ name: "Seasons Change",      img: "systems/stonetop_pwd/assets/icons/macros/spring.svg",           command: "game.stonetop?.openSeasonsChange?.()", slot: 8, legacy: true },
	{ name: "Weather",             img: "systems/stonetop_pwd/assets/icons/macros/sun-cloud.svg",        command: "game.stonetop?.openWeather?.()",        slot: 9, legacy: true },
];

// Placed like the set above but never re-snapped by _reorderSystemMacros. Found, like every
// system macro, by command as well as name, so neither collides with a user macro of the same name.
const _COMMAND_KEYED_MACROS = [
	// The Chronicle (slot 7): compiles the recorded Introductions + Spring Burst answers and
	// expedition log into the shared "The Chronicle" journal and opens it (GM-only —
	// saveChronicle is seed-once, so re-running it preserves inline edits). Sits straight after
	// the _SYSTEM_MACROS a new world gets. It was slot 9 until the two legacy macros left new
	// worlds' bars; a world that already has it placed keeps it where it is.
	{ name: "The Chronicle",  img: "systems/stonetop_pwd/assets/icons/macros/bookmarklet.svg", command: "game.stonetop?.saveChronicle?.()",    slot: 7 },
	{ name: "End of Session", img: "systems/stonetop_pwd/assets/icons/macros/truce.svg",       command: "game.stonetop?.openEndOfSession?.()", slot: 10 },
];

// Bump to re-snap the system macros into their canonical slots once, on every client
// (the per-client `systemHotbarLayoutVersion` setting trails this until then). Bumped
// to 2 when Seasons Change was inserted at slot 2 and the rest shifted right; to 3 when
// Write a Love Letter took slot 5 and Die of Fate moved to slot 6.
//
// Deliberately NOT bumped for the browsers, in either direction: they were APPENDED at slots
// 7-8 rather than inserted, and merging them back into one at slot 7 leaves slots 1-6 exactly
// where they were. _ensureHotbarMacro places a missing macro whatever the layout version, and
// _retireSystemMacros frees slot 7 for it. Re-snapping would lift every system macro
// off the hotbar and put it back — undoing any arrangement a GM had made — to fix an order
// that isn't wrong. Not bumped either when the two legacy macros left new worlds and the
// rest moved left (see _SYSTEM_MACROS), for the same reason.
const _HOTBAR_LAYOUT_VERSION = 3;

/**
 * The GM's macro pass. GM-only caller: it creates, updates and deletes world Macros.
 *
 * The hotbar steps run serially and in this order — each assignHotbarMacro writes the same
 * user.hotbar document, so concurrent calls would clobber each other, and the retirement and the
 * dangling-slot sweep both come first so the slot the old "Browse the Arcana" held is free for the
 * "Browse Stonetop" that replaced it: deleting a macro leaves its id sitting in `user.hotbar`,
 * and the sweep is what takes it out. That sweep is world-wide rather than scoped to the retired
 * macros — see its own comment for why it has to be.
 *
 * Each step is caught on its own, and so is each macro's placement: none of them needs the one
 * before it to have SUCCEEDED, only to have finished, so one macro that will not create or place
 * must not leave every macro after it off the bar. (A failed retirement or sweep at worst lets a
 * new macro flow into the next free slot instead of its own.)
 *
 * The two Macro Directory entries go last and in the BACKGROUND: neither touches the hotbar or
 * anything else the load reads, and one is a fetch of a script file and the other a compendium
 * document read, two round trips that have no business in front of the first window the GM sees.
 */
export async function ensureSystemMacros() {
	await bestEffort("retired macro cleanup", _retireSystemMacros);
	await bestEffort("dangling hotbar slot sweep", _clearDanglingHotbarSlots);
	// Place any missing system macros at their default slots (existing placements
	// are left alone, so a manual rearrangement sticks). Their fixed starting order
	// — 1 Welcome · 2 Run an Expedition · 3 Write a Love Letter · 4 Die of Fate ·
	// 5 Browse Stonetop · 6 Relationship Map · 7 The Chronicle · 10 End of Session, plus
	// 8 Seasons Change · 9 Weather in an older world that already has them — is
	// applied for the _SYSTEM_MACROS set per layout version by _reorderSystemMacros, below;
	// Chronicle and End of Session are placed (but not reordered).
	for (const macro of [..._SYSTEM_MACROS, ..._COMMAND_KEYED_MACROS]) {
		await bestEffort(`"${macro.name}" hotbar macro`, () => _ensureHotbarMacro(macro));
	}
	await bestEffort("system hotbar re-snap", _reorderSystemMacros);

	_ensureTestPopulateMacro()
		.catch(err => console.error("Stonetop | test populate macro seed failed", err));
	_ensureBook2ArtMacro()
		.catch(err => console.error("Stonetop | Import Book Art macro seed failed", err));
}

// Is a hotbar slot empty? The hotbar is a sparse map of slot → macro id, so an
// absent key means free. (`in` stringifies the slot, matching the string keys.)
function _isHotbarSlotFree(slot) {
	return !(slot in game.user.hotbar);
}

// The first empty hotbar slot at or after `from` (1–50, across all five pages), or
// null if the hotbar is somehow full. Lets us place a macro without evicting one
// the GM put in our default slot.
function _firstFreeHotbarSlot(from = 1) {
	for (let s = from; s <= 50; s++) if (_isHotbarSlotFree(s)) return s;
	return null;
}

function _isOnHotbar(macro) {
	return Object.values(game.user.hotbar).includes(macro.id);
}

// Put a macro at `slot` if that slot is free, else at the first free slot, so it never evicts a
// macro somebody else put there. Silently does nothing on a full hotbar.
async function _placeOnHotbar(macro, slot) {
	const target = _isHotbarSlotFree(slot) ? slot : _firstFreeHotbarSlot();
	if (target) await game.user.assignHotbarMacro(macro, target);
}

// Find-or-create a global script macro and place it on the hotbar. Idempotent:
// refreshes the icon if it drifted, and only places the macro when it isn't already
// on the user's hotbar — so once it's placed, a manual rearrangement sticks. It
// takes its default `slot` only if that slot is free; otherwise it falls back to the
// first empty slot, so we never bump a macro the GM put there. The fixed system
// order is applied per layout version by _reorderSystemMacros. The lookup keys on the
// command as well as the name (_findSystemMacro), the same match the re-snap and the
// player pass use, so a GM's own macro that happens to be called "Die of Fate" is never
// adopted and has its icon overwritten; ours is created beside it. (The commands have never
// changed since these shipped, so no world's real system copy is missed.) Run these serially — each
// assignHotbarMacro writes the same user.hotbar document, so concurrent calls would
// clobber each other.
//
// GM-only (ensureSystemMacros' caller is), which is what lets it
// set ownership: a Macro is created at ownership.default NONE, and only a GM may change
// that. A `shared` macro is raised to OBSERVER — on creation AND on an existing macro in
// a world that predates the flag, so the fix reaches tables already playing.
//
// A `legacy` macro is only ever found, never created (see _SYSTEM_MACROS), so a GM's own
// "Weather" in a new world is neither adopted nor joined by a new one of ours.
async function _ensureHotbarMacro({ name, img, command, slot, shared, legacy }) {
	const OBSERVER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
	let macro = _findSystemMacro({ name, command });
	if (!macro && legacy) return;
	if (!macro) {
		macro = await Macro.create({
			name, type: "script", img, command, scope: "global",
			...(shared ? { ownership: { default: OBSERVER } } : {}),
		});
	} else {
		const update = {};
		if (macro.img !== img) update.img = img;
		// Dotted, so a per-user grant the GM added by hand survives.
		if (shared && (macro.ownership?.default ?? 0) < OBSERVER) update["ownership.default"] = OBSERVER;
		if (Object.keys(update).length) await macro.update(update);
	}

	if (!_isOnHotbar(macro)) await _placeOnHotbar(macro, slot);
}

// The system-created copy of one of ours: name AND command, so a user macro sharing the name
// is never adopted, retired or re-snapped.
function _findSystemMacro({ name, command }) {
	return game.macros.find(m => m.name === name && m.command === command);
}

// Place the shared system macros (currently just the Die of Fate) on a PLAYER's hotbar.
// The player never creates the Macro — a player-created copy would be a second document
// owned by them alone, one per player — so this only slots the world macro the GM's pass
// already made, and only once it is actually theirs to run: a world whose GM has not
// loaded since this shipped still has the macro at ownership NONE, and skipping it there
// keeps a dead icon off the bar. Both cases fix themselves on the player's next reload.
//
// Same non-destructive placement as the GM's: never evicts whatever is in the target slot,
// and never moves a macro that is already on the bar, so a player's own arrangement sticks.
//
// Exported for its test — onReady is the only caller.
//
// Each placement caught on its own, for the GM pass's reason: one that fails must not leave the
// rest off the bar.
export async function ensurePlayerHotbarMacros() {
	for (const spec of _SYSTEM_MACROS.filter(m => m.shared)) {
		const macro = _findSystemMacro(spec);
		if (!macro?.canExecute || _isOnHotbar(macro)) continue;
		await bestEffort(`"${spec.name}" player hotbar placement`, () => _placeOnHotbar(macro, spec.playerSlot));
	}
}

// Snap the system macros into their canonical order (the _SYSTEM_MACROS slots; a legacy
// macro the world never had is simply absent from the set), then leave the arrangement alone
// so the GM is free to rearrange the hotbar. Guarded by a per-client layout version
// (the hotbar is per-user): it runs once per layout, so bumping _HOTBAR_LAYOUT_VERSION
// re-snaps everyone once (e.g. when Seasons Change was inserted) but later manual moves
// at the same version are left alone.
//
// Non-destructive: it never evicts a macro the GM placed in one of our slots. We
// first lift our own macros off the bar (freeing their slots), then re-place each at
// its canonical slot if free, else the first empty slot. So a personal macro sitting
// in slot 2 keeps its spot and ours flows around it.
async function _reorderSystemMacros() {
	if (getSetting("systemHotbarLayoutVersion") >= _HOTBAR_LAYOUT_VERSION) return;

	const macros = _SYSTEM_MACROS
		.map(spec => ({ macro: _findSystemMacro(spec), slot: spec.slot }))
		.filter(o => o.macro);

	// Lift our macros off the hotbar so their canonical slots open up (a user macro
	// in one of those slots stays put). assignHotbarMacro(null, slot) clears a slot.
	for (const { macro } of macros) {
		const slot = Object.entries(game.user.hotbar).find(([, id]) => id === macro.id)?.[0];
		if (slot) await game.user.assignHotbarMacro(null, Number(slot));
	}

	// Re-place each at its canonical slot if free, else the first open slot.
	for (const { macro, slot } of macros) await _placeOnHotbar(macro, slot);

	await setSetting("systemHotbarLayoutVersion", _HOTBAR_LAYOUT_VERSION);
}

// Add the "(TEST ONLY) Populate World" script macro to the world's Macro Directory,
// inside a "For Testing Purposes" folder — but never to the hotbar (creating a Macro
// document doesn't slot it; only assignHotbarMacro does, which we deliberately skip).
// Its body is the create-test-characters dev script, fetched at runtime so that one file
// stays the single source of truth: a missing file (a build that omits scripts/) skips
// silently, leaving those worlds untouched. It ships in the release zip, so released
// worlds seed it as well. Seeded once — a GM who deletes it keeps it gone — but while it
// exists its command is re-synced so edits to the script propagate.
//
// GM-only twice over: the call site sits inside a game.user.isGM block, and the macro is
// created with default ownership NONE so it stays out of a player's Macro Directory even
// though Foundry lets players hold macros. Both matter now that it reaches real tables —
// running it seeds (and, on a re-run, DELETES) a roster of [TEST] fixtures.
async function _ensureTestPopulateMacro() {
	let command;
	try {
		const res = await fetch(_TEST_MACRO_SRC);
		if (!res.ok) return;
		command = await res.text();
	} catch { return; }
	if (!command?.trim()) return;

	// Find-or-create the "For Testing Purposes" Macro folder the macro lives in.
	let folder = game.folders.find(f => f.type === "Macro" && f.name === _TEST_MACRO_FOLDER);
	if (!folder) folder = await Folder.create({ name: _TEST_MACRO_FOLDER, type: "Macro" });

	const existing = game.macros.find(m => m.name === _TEST_MACRO_NAME);
	if (existing) {
		const update = {};
		if (existing.command !== command) update.command = command;
		if (existing.img !== _TEST_MACRO_IMG) update.img = _TEST_MACRO_IMG;
		if (folder && existing.folder?.id !== folder.id) update.folder = folder.id;
		if (Object.keys(update).length) await existing.update(update);
		return;
	}
	if (getSetting("testPopulateMacroSeeded")) return; // deleted on purpose — leave it gone

	await Macro.create({
		name: _TEST_MACRO_NAME, type: "script", img: _TEST_MACRO_IMG, command,
		scope: "global", folder: folder?.id ?? null,
		ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
	});
	await setSetting("testPopulateMacroSeeded", true);
}

// Add the "Import Book Art" macro to the world's Macro Directory — but never
// the hotbar. The shipped compendium doc is the single source of truth: its
// command/img are copied on first seed and re-synced while the world copy exists,
// so a system update refreshes it. Seeded once — a GM who deletes it keeps it
// gone. GM-only (called from the isGM block in onReady).
async function _ensureBook2ArtMacro() {
	const src = await loadBook2ArtMacroSource();
	if (!src?.command) return;

	const existing = findBook2ArtWorldMacro();
	if (existing) {
		const update = {};
		if (existing.name !== BOOK2_ART_MACRO_NAME) update.name = BOOK2_ART_MACRO_NAME;
		if (existing.command !== src.command) update.command = src.command;
		if (existing.img !== src.img) update.img = src.img;
		if (Object.keys(update).length) await existing.update(update);
		return;
	}
	if (getSetting("book2ArtMacroSeeded")) return; // deleted on purpose — leave it gone

	await Macro.create({ name: BOOK2_ART_MACRO_NAME, type: "script", img: src.img, command: src.command, scope: "global" });
	await setSetting("book2ArtMacroSeeded", true);
}

// Delete the system macros that were retired (_RETIRED_MACROS). Runs before _ensureHotbarMacro,
// and only ever touches macros this system created (name AND command must both match). No-op once
// done, so it's safe to run every load. GM-only: only a GM may delete a world Macro.
//
// Deleting them is only half of freeing their slots — see _clearDanglingHotbarSlots, which the
// ready sequence calls straight after this and which is what the placement below depends on.
async function _retireSystemMacros() {
	const ids = _RETIRED_MACROS.map(spec => _findSystemMacro(spec)?.id).filter(Boolean);
	// One request for the lot rather than one apiece: this runs inside the awaited `ready`
	// chain, where every round trip is a beat before the world is usable.
	if (ids.length) await Macro.deleteDocuments(ids);
}

// Clear every hotbar slot pointing at a Macro that no longer exists.
//
// Its own call in the ready sequence rather than a tail call inside the macro retirement above,
// because it is not that migration's business and it is not scoped to it: this sweeps the WHOLE
// hotbar, including a slot orphaned months ago by a module the GM uninstalled. Hidden under a
// name about two specific macros, that breadth read as an accident.
//
// It is nonetheless what makes the placement below work. Deleting a Macro leaves its id sitting
// in `user.hotbar`, where _isHotbarSlotFree still counts the slot as taken — so without this the
// new "Browse Stonetop" would flow past slot 7 into the first genuinely empty slot and land
// somewhere arbitrary. And `user.hotbar` is PER-USER, so the delete only frees the slots on the
// hotbar of the GM who happened to load first; a second GM arrives to find the macros already
// gone and two tiles that draw nothing but still count as occupied. Which is exactly why it
// cannot be narrowed to the ids retired above: by then there is no macro left to read them off.
//
// Nothing visible is lost. A slot pointing at a deleted macro already draws a blank tile that
// opens nothing, and slots are fixed positions, so clearing one moves nothing else.
//
// GM-only, which is what makes the "no longer exists" test safe: a player is never sent macros
// they can't observe, so for them a live macro can look missing — for a GM, missing is missing.
//
// One write for the lot, the same shape core's own assignHotbarMacro uses. Slot by slot, this was
// a User-document round trip apiece on the blocking ready path, for a bar that can hold fifty.
async function _clearDanglingHotbarSlots() {
	// Off toObject(), like core's own assignHotbarMacro, so what we hand back is a plain source
	// object rather than the live one being mutated under the document.
	const hotbar = game.user.toObject?.().hotbar ?? foundry.utils.deepClone(game.user.hotbar ?? {});
	let dropped = false;
	for (const [slot, id] of Object.entries(hotbar)) {
		if (game.macros.get(id)) continue;
		delete hotbar[slot];
		dropped = true;
	}
	// `recursive: false` is what makes a REMOVED key a removal rather than a no-op: a merge would
	// only ever add slots back.
	if (dropped) await game.user.update({ hotbar }, { diff: false, recursive: false, noHook: true });
}
