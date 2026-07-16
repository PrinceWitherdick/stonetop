import { getSetting, setSetting } from "../settings.js";
import { info, error } from "../utils/logger.js";
import { BOOK2_ART_APPLY_MANIFEST } from "./manifest.js";
import { bestiaryDescriptionWithArt, locationSectionsWithArt, textPageWithMap, matchWorldPage } from "./world-journal-art.js";
import { managedHash } from "../hooks/journal-sync-core.js";
import { compendiumSourceOf } from "../utils/foundry-compat.js";

// Re-apply the Book II illustrations to the compendia, the world journals, and the
// world actors, WITHOUT the source PDF.
//
// The "Import Book Art" macro extracts the art from a GM-owned PDF into a DURABLE
// folder outside the system (CONFIG.ROOT / the `book2ArtRoot` setting), then points
// documents at it. A system update replaces the whole `systems/stonetop_pwd` folder,
// so it wipes the compendium edits (the shipped packs overwrite them) but NOT the
// durable image files. This pass re-points documents at those surviving files, so the
// GM only ever runs the macro once. It ships no pixels: the file paths and document ids
// come from the generated manifest (module/book2-art/manifest.js).
//
// Byte-compatible with the macro's own apply pass (shared markup via world-journal-art.js),
// so a re-apply never double-adds art the macro already embedded. Two deliberate
// differences from the macro: `available` is read from disk rather than extraction, and
// the world-actor pass is conservative — it only re-points a portrait that is ALREADY
// one of ours (never a GM's custom art), because unlike the compendium these survive
// the update. World journals are handled like the macro: art is additive + idempotent,
// and a pristine entry's managed-journal baseline is re-stamped so the journal channel
// keeps treating it as pristine (edited entries keep their edited signal).
//
// FOUR triggers, all funnelling through the one idempotent worker `reapplyBook2Art`:
//   1. `reapplyBook2ArtOnVersionChange` (hooks/Ready.js) — the full pass, GM-only, ONCE
//      per system version (guarded by `book2ArtSyncVersion`), only when the durable art
//      is on disk, and BEFORE the journal sync. Re-points the wiped compendium.
//   2. `handleImportedJournalArt` (a debounced createJournalEntry hook, stonetop.js) —
//      when a GM drags a single journal in from the compendium mid-version, add its art
//      right away. Scoped to the imported entries; skips the compendium/actor re-point.
//   3. an every-GM-load self-heal (Ready.js) with { worldOnly, cheapWorldSkip } — adds
//      any durable art still MISSING from world journals (e.g. art that landed on disk
//      AFTER a journal was imported). Cheap: it reads a world entry's own pages first and
//      only touches the compendium for a row whose art is actually absent.
//   4. `game.stonetop.reapplyBook2Art()` (Ready.js API) — a manual, un-gated re-run for
//      the dev loop after re-assigning art in the picker + regenerating the manifest.

const DEFAULT_ROOT = "stonetop-book-art";
const BES_PACK = "stonetop_pwd.stonetop-bestiary";
const JRN_PACK = "stonetop_pwd.stonetop-journal";
const TOKEN_FIT = "cover"; // matches the macro's CONFIG.TOKEN_FIT
const JRN_SOURCE_PREFIX = "Compendium.stonetop_pwd.stonetop-journal.";

const jrnSource = (entryId) => `Compendium.stonetop_pwd.stonetop-journal.JournalEntry.${entryId}`;

// Fully-qualified paths of the durable art currently on disk. A missing directory
// just means nothing to apply from there (the GM hasn't imported yet).
async function browseDurableArt(root) {
	const FP = foundry?.applications?.apps?.FilePicker ?? FilePicker;
	const present = new Set();
	// The three dirs are independent; browse them in parallel. A rejected browse means the
	// directory doesn't exist yet (the GM hasn't imported) -> nothing on disk from there.
	const results = await Promise.all(["assets/bestiary", "assets/locations", "assets/maps"]
		.map(dir => FP.browse("data", `${root}/${dir}`).catch(() => null)));
	for (const res of results) {
		if (!res) continue;
		// A malformed %-escape in a stray filename must not reject the whole art pass — keep
		// the raw name on decode failure so the version still gets stamped this load.
		for (const f of res.files) {
			try { present.add(decodeURIComponent(f)); }
			catch { present.add(f); }
		}
	}
	return present;
}

// Embed missing art into every world copy of a compendium journal page. `buildNext(wp)`
// returns the page's new field value, or null when the page already has the art (skip).
// `noteEntry` marks a touched world entry so pristine tracking stays honest. Returns how
// many world pages were updated. Shared by the bestiary / location / setting-map passes,
// which differ only in the build function and the field key.
async function applyWorldPages(worldEntries, page, updateKey, buildNext, noteEntry) {
	let count = 0;
	for (const entry of worldEntries) {
		const wp = matchWorldPage(entry.pages, page.id, page.name, page.type);
		if (!wp) continue;
		const next = buildNext(wp);
		if (next != null) { noteEntry(entry); await wp.update({ [updateKey]: next }); count++; }
	}
	return count;
}

// Minimal portrait + prototype-token update pointing `doc` at `src`, forcing the token
// fit. For COMPENDIUM docs, which an update resets to the shipped defaults every time.
// Returns null when nothing would change, so no-op writes are skipped.
function artUpdate(doc, src) {
	const upd = {};
	if (doc.img !== src) upd.img = src;
	const tex = doc.prototypeToken?.texture;
	if (tex && tex.src !== src) upd["prototypeToken.texture.src"] = src;
	if (tex && tex.fit !== TOKEN_FIT) upd["prototypeToken.texture.fit"] = TOKEN_FIT;
	return Object.keys(upd).length ? upd : null;
}

// Conservative update for a WORLD actor, which survives the update (so a GM's choices
// must be preserved). Re-points the portrait and/or token src ONLY when that field is
// already one of ours (ends with this monster's art path, i.e. a stale pointer the root
// change broke) - never a custom portrait/token. Never touches the token `fit`, so a
// GM's "contain" is not reverted to "cover" on every update. Null when nothing to fix.
function worldActorUpdate(actor, src, tail) {
	const upd = {};
	if (String(actor.img ?? "").endsWith(tail) && actor.img !== src) upd.img = src;
	const tex = actor.prototypeToken?.texture;
	if (tex && String(tex.src ?? "").endsWith(tail) && tex.src !== src) upd["prototypeToken.texture.src"] = src;
	return Object.keys(upd).length ? upd : null;
}

// True if any page of `entry` already carries this exact art `src` anywhere (bestiary
// description, a location section body, or a plain text page). A cheap, compendium-free
// pre-check: it reads only the world entry's own in-memory pages, so the every-load
// self-heal can decide "this row's art is already here, skip it" without a getDocument.
function entryHasSrc(entry, src) {
	for (const p of entry?.pages ?? []) {
		if (String(p.system?.description ?? "").includes(src)) return true;
		for (const s of p.system?.sections ?? []) if (String(s?.body ?? "").includes(src)) return true;
		if (String(p.text?.content ?? "").includes(src)) return true;
	}
	return false;
}

// Re-render the OPEN world-journal sheets among `entries` so freshly-embedded art appears
// without an F5. Targeted (only entries we touched) so an unrelated journal a GM is editing
// is never disturbed, and best-effort (a failed render must not fail the pass). Covers both
// the AppV2 sheet registry (v13+ journals) and the legacy AppV1 windows. Mirrored inline by
// the bring-your-own-book macro (scripts/local/book2-art/import-book2-art.js, section 7c).
function rerenderOpenJournals(entries) {
	const ids = new Set();
	for (const e of entries) if (e?.id) ids.add(e.id);
	if (!ids.size) return;
	const apps = [...(foundry.applications?.instances?.values?.() ?? []), ...Object.values(ui.windows ?? {})];
	for (const app of apps) {
		const doc = app?.document ?? app?.object;
		if (doc?.documentName === "JournalEntry" && ids.has(doc.id) && app.rendered) {
			try { app.render(); } catch (_) { /* best-effort refresh */ }
		}
	}
}

// The re-apply worker. Idempotent (every write is a no-op when the target already
// matches), so it is safe to run repeatedly. Options select what it touches:
//   • entries      — an explicit list of world JournalEntry docs to (re)apply art to.
//                    Implies worldOnly: a single imported journal doesn't need the whole
//                    compendium or the world actors re-pointed.
//   • worldOnly    — skip the compendium re-point (actors + compendium journal pages) and
//                    the world-actor pass; only embed art into world journals.
//   • cheapWorldSkip — in the world-journal passes, skip the compendium read for any row
//                    whose art is already present in every matching world entry. Makes the
//                    every-load self-heal near-free once everything is applied.
// Returns a stats object ({ errors, total, … }) on a completed pass, or null when it could
// not run (not GM / nothing on disk / packs missing) so the caller can decide about stamping.
export async function reapplyBook2Art({ entries = null, worldOnly = false, cheapWorldSkip = false } = {}) {
	if (!game.user?.isGM) return null;
	const version = game.system.version;
	const onlyWorld = worldOnly || Array.isArray(entries);

	// Normalize away trailing slashes so `${root}/${out}` never yields a double slash
	// that wouldn't match the paths FilePicker.browse returns (which would silently
	// leave `available` empty and no-op the whole pass).
	const root = (getSetting("book2ArtRoot") || DEFAULT_ROOT).replace(/\/+$/, "");
	const present = await browseDurableArt(root);
	if (!present.size) return null; // nothing imported yet -> nothing to apply

	const srcOf = (out) => `${root}/${out}`;
	const { monsters, locations, settingOverviewMaps = [] } = BOOK2_ART_APPLY_MANIFEST;

	// Only wire art that is actually on disk (a partial import must not point a
	// document at a file that isn't there).
	const available = new Set();
	for (const m of monsters) if (present.has(srcOf(m.out))) available.add(m.out);
	for (const l of locations) for (const im of l.images) if (present.has(srcOf(im.out))) available.add(im.out);
	for (const s of settingOverviewMaps) if (present.has(srcOf(s.out))) available.add(s.out);
	if (!available.size) return null; // durable folder exists but holds none of our art

	const besPack = game.packs.get(monsters[0]?.actorPack ?? BES_PACK);
	const jrnPack = game.packs.get(JRN_PACK);
	if (!besPack || !jrnPack) return null;

	// World journals seeded/imported from our compendiums, indexed by the compendium
	// source uuid core stamps on import. Scoped to `entries` when given (a single import),
	// otherwise every world journal (empty until the gazetteer / bestiary codex is seeded).
	const worldBySource = new Map();
	for (const j of entries ?? game.journal ?? []) {
		const s = compendiumSourceOf(j);
		if (!s || !s.startsWith("Compendium.stonetop_pwd.")) continue;
		if (!worldBySource.has(s)) worldBySource.set(s, []);
		worldBySource.get(s).push(j);
	}
	// A scoped import over journals that aren't ours (or aren't from our packs) has no
	// world targets and no compendium work to do: bail before touching packs.
	if (onlyWorld && !worldBySource.size) return null;

	// Per-entry pre-injection pristine state, captured the FIRST time we touch an entry
	// (before the embed changes its fingerprint). A pristine entry is re-stamped after;
	// an edited one keeps its edited signal so the managed channel stays hands-off.
	const touchedEntries = new Map();
	const noteEntry = (entry) => {
		if (touchedEntries.has(entry)) return;
		const base = entry.getFlag?.("stonetop_pwd", "journalSync");
		let pristine = false;
		try { pristine = !!base?.hash && base.hash === managedHash(entry.toObject()); } catch (_) { /* treat as edited */ }
		touchedEntries.set(entry, { base, pristine });
	};

	const relock = [];
	let actors = 0, besPages = 0, locPages = 0, soPages = 0, worldActors = 0, worldJournalPages = 0, errors = 0;
	try {
		// Unlock inside the try so the finally relocks whatever we opened even if the
		// second unlock (or any later step) throws. Only the compendium-writing passes
		// need it: a world-only pass reads the (locked) compendium and writes world docs.
		if (!onlyWorld) for (const p of [besPack, jrnPack]) if (p.locked) { await p.configure({ locked: false }); relock.push(p); }

		// 1. Compendium bestiary actors + bestiary journal pages (+ the same pages in any
		//    seeded world journal). Unconditional on the compendium: an update resets it to
		//    the shipped (art-less) defaults every time, so always re-point.
		for (const m of monsters) {
			if (!available.has(m.out)) continue;
			const src = srcOf(m.out);
			if (!onlyWorld) {
				try {
					const actor = await besPack.getDocument(m.actorId);
					const upd = actor && artUpdate(actor, src);
					if (upd) { await actor.update(upd); actors++; }
				} catch (e) { errors++; error(`Book II art re-apply: actor "${m.slug}"`, e); }
			}
			if (m.journalEntryId && m.journalPageId) {
				const worldEntries = worldBySource.get(jrnSource(m.journalEntryId)) ?? [];
				// Skip the compendium read when this is a world-only pass with no world work:
				// no matching world entries, or (in cheap mode) every one already has the art.
				const worldNeedsArt = worldEntries.length && (!cheapWorldSkip || worldEntries.some((e) => !entryHasSrc(e, src)));
				if (onlyWorld && !worldNeedsArt) continue;
				try {
					const page = (await jrnPack.getDocument(m.journalEntryId))?.pages?.get(m.journalPageId);
					if (page) {
						if (!onlyWorld) {
							const nd = bestiaryDescriptionWithArt(page.system?.description, src, m.name);
							if (nd != null) { await page.update({ "system.description": nd }); besPages++; }
						}
						worldJournalPages += await applyWorldPages(worldEntries, page, "system.description",
							(wp) => bestiaryDescriptionWithArt(wp.system?.description, src, m.name), noteEntry);
					}
				} catch (e) { errors++; error(`Book II art re-apply: bestiary journal "${m.slug}"`, e); }
			}
		}

		// 2. Compendium location journal pages (+ their world copies). Append missing art
		//    into the target section body in book order.
		for (const l of locations) {
			try {
				const srcs = l.images.filter((im) => available.has(im.out)).map((im) => srcOf(im.out));
				if (!srcs.length) continue; // none of this location's art is on disk
				const worldEntries = worldBySource.get(jrnSource(l.journalEntryId)) ?? [];
				const worldNeedsArt = worldEntries.length && (!cheapWorldSkip || worldEntries.some((e) => srcs.some((src) => !entryHasSrc(e, src))));
				if (onlyWorld && !worldNeedsArt) continue;
				const page = (await jrnPack.getDocument(l.journalEntryId))?.pages?.get(l.journalPageId);
				if (!page) continue;
				if (!onlyWorld) {
					const cns = locationSectionsWithArt(page.system?.sections, l.sectionIndex, srcs, l.name);
					if (cns) { await page.update({ "system.sections": cns }); locPages++; }
				}
				worldJournalPages += await applyWorldPages(worldEntries, page, "system.sections",
					(wp) => locationSectionsWithArt(wp.system?.sections, l.sectionIndex, srcs, l.name), noteEntry);
			} catch (e) { errors++; error(`Book II art re-apply: location "${l.slug}"`, e); }
		}

		// 2.5 Setting Overview regional maps embedded into the setting journal's plain
		//    text pages (+ their world copies). The map is a user-supplied file the macro's
		//    map step wrote to assets/maps and turned into a Scene; this re-embeds it into
		//    the journal page after an update wiped the compendium edit. Idempotent, and a
		//    no-op on any page that already shows a map (never stacks a second one).
		for (const s of settingOverviewMaps) {
			if (!available.has(s.out)) continue;
			const src = srcOf(s.out);
			try {
				const worldEntries = worldBySource.get(jrnSource(s.journalEntryId)) ?? [];
				const worldNeedsArt = worldEntries.length && (!cheapWorldSkip || worldEntries.some((e) => !entryHasSrc(e, src)));
				if (onlyWorld && !worldNeedsArt) continue;
				const page = (await jrnPack.getDocument(s.journalEntryId))?.pages?.get(s.journalPageId);
				if (!page) continue;
				if (!onlyWorld) {
					const nd = textPageWithMap(page.text?.content, src, s.name);
					if (nd != null) { await page.update({ "text.content": nd }); soPages++; }
				}
				worldJournalPages += await applyWorldPages(worldEntries, page, "text.content",
					(wp) => textPageWithMap(wp.text?.content, src, s.name), noteEntry);
			} catch (e) { errors++; error(`Book II art re-apply: setting-overview map "${s.slug}"`, e); }
		}

		// 3. World actors imported from the bestiary. Unlike the compendium docs these
		//    SURVIVE an update, so this pass is conservative (worldActorUpdate): re-point a
		//    portrait/token only when it is already one of ours (a stale path the root
		//    change broke), never a custom one, and never force the token `fit`. Skipped on
		//    a world-only / scoped-import pass (a journal import doesn't touch actors).
		if (!onlyWorld) for (const m of monsters) {
			if (!available.has(m.out)) continue;
			const src = srcOf(m.out);
			const uuid = `Compendium.${m.actorPack ?? BES_PACK}.Actor.${m.actorId}`;
			const tail = `/${m.out}`;
			for (const a of game.actors) {
				const fromUs = a._stats?.compendiumSource === uuid || a.getFlag?.("core", "sourceId") === uuid;
				if (!fromUs) continue;
				try {
					const upd = worldActorUpdate(a, src, tail);
					if (upd) { await a.update(upd); worldActors++; }
				} catch (e) { errors++; error(`Book II art re-apply: world actor "${a.name ?? a.id}"`, e); }
			}
		}

		// 4. Keep the managed-journal baseline in sync for the pristine world journals we
		//    added art to, so the journal channel keeps treating them as pristine and
		//    keeps delivering future prose updates. Edited entries keep their edited hash.
		//    A per-entry failure here isn't counted as a retryable error: the embed already
		//    landed and is idempotent, so a retry would not re-touch the entry to re-stamp it.
		for (const [entry, { base, pristine }] of touchedEntries) {
			if (!pristine) continue;
			try { await entry.setFlag("stonetop_pwd", "journalSync", { hash: managedHash(entry.toObject()), version: base?.version ?? version }); }
			catch (e) { error(`Book II art re-apply: journal re-stamp "${entry?.name}"`, e); }
		}
	} finally {
		for (const p of relock) { try { await p.configure({ locked: true }); } catch (_) { /* best-effort relock */ } }
	}

	// Re-render any world journals we embedded art into that are OPEN right now, so the art
	// shows without a reload. page.update() only live-refreshes a journal that was already
	// open at the instant of the write; the sidebar is interactive before this pass finishes,
	// so a GM who opens a journal mid-pass would otherwise see its pre-art render until an F5.
	rerenderOpenJournals(touchedEntries.keys());

	const total = actors + besPages + locPages + soPages + worldActors + worldJournalPages;
	if (total) {
		info(`Book II art applied: ${actors} actors, ${besPages + locPages + soPages} compendium journal pages, ${worldJournalPages} world journal pages, ${worldActors} world actors.`);
		ui.notifications?.info(`Stonetop: added Book II art to ${total} ${total === 1 ? "entry" : "entries"}.`);
	}
	return { errors, total, actors, besPages, locPages, soPages, worldActors, worldJournalPages };
}

// The version-change trigger: run the full re-apply ONCE per system version, then stamp
// the version so it doesn't repeat until the next update. Guards (non-GM, already-synced)
// come before any disk work. A pass that couldn't run (nothing on disk yet) or that hit a
// per-item error leaves the version UNSTAMPED so the next load retries (every write is
// idempotent) instead of poisoning the version with a partial apply.
export async function reapplyBook2ArtOnVersionChange() {
	if (!game.user?.isGM) return;
	const version = game.system.version;
	if (getSetting("book2ArtSyncVersion") === version) return;

	const result = await reapplyBook2Art();
	if (!result) return; // nothing on disk yet -> retry next load, version left unstamped
	if (result.errors) {
		error(`Book II art re-apply: ${result.errors} item(s) failed; leaving the version unstamped to retry next load.`);
		return;
	}
	await setSetting("book2ArtSyncVersion", version);
}

// --- Manual-import trigger (a debounced createJournalEntry hook) -----------------------
//
// When a GM drags one (or a folder) of our journals in from the compendium mid-version,
// the once-per-version re-apply above won't fire again, so the fresh world copy would
// come in art-less. This catches it: collect the imported entries, and on a short debounce
// (so a folder-import burst — and our own seed's create storm — collapse to a single pass)
// embed their durable art. cheapWorldSkip keeps it free for entries that already match.
const _pendingImportIds = new Set();
let _importFlushTimer = null;
function _scheduleImportFlush() {
	if (_importFlushTimer) clearTimeout(_importFlushTimer);
	_importFlushTimer = setTimeout(async () => {
		_importFlushTimer = null;
		const entries = [..._pendingImportIds].map((id) => game.journal?.get?.(id)).filter(Boolean);
		_pendingImportIds.clear();
		if (!entries.length) return;
		try { await reapplyBook2Art({ entries, cheapWorldSkip: true }); }
		catch (err) { console.error("Stonetop | Book II art on journal import failed:", err); }
	}, 400);
}

// createJournalEntry hook handler. GM-only, and only for the user who did the import (so a
// second GM's client doesn't redundantly re-run it). No-op unless the new entry is a world
// copy of one of our journal-pack entries.
export function handleImportedJournalArt(entry, _options, userId) {
	if (!game.user?.isGM || game.user.id !== userId) return;
	const src = compendiumSourceOf(entry);
	if (typeof src !== "string" || !src.startsWith(JRN_SOURCE_PREFIX)) return;
	if (!entry?.id) return;
	_pendingImportIds.add(entry.id);
	_scheduleImportFlush();
}
