import { getSetting, setSetting } from "../settings.js";
import { info, error } from "../utils/logger.js";
import { BOOK2_ART_APPLY_MANIFEST } from "./manifest.js";
import { bestiaryDescriptionWithArt, locationSectionsWithArt, textPageWithMap, matchWorldPage } from "./world-journal-art.js";
import { managedHash } from "../hooks/journal-sync-core.js";

// Re-apply the Book II illustrations to the compendia, the world journals, and the
// world actors after a system update, WITHOUT the source PDF.
//
// The "Import Book Art" macro extracts the art from a GM-owned PDF into a DURABLE
// folder outside the system (CONFIG.ROOT / the `book2ArtRoot` setting), then points
// documents at it. A system update replaces the whole `systems/stonetop_pwd` folder,
// so it wipes the compendium edits (the shipped packs overwrite them) but NOT the
// durable image files. This pass re-points documents at those surviving files on the
// next GM load, so the GM only ever runs the macro once. It ships no pixels: the file
// paths and document ids come from the generated manifest (module/book2-art/manifest.js).
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
// Runs GM-only, once per system version (guarded by the `book2ArtSyncVersion` setting),
// only when the durable art is on disk, and BEFORE the journal sync (see hooks/Ready.js).

const DEFAULT_ROOT = "stonetop-book-art";
const BES_PACK = "stonetop_pwd.stonetop-bestiary";
const JRN_PACK = "stonetop_pwd.stonetop-journal";
const TOKEN_FIT = "cover"; // matches the macro's CONFIG.TOKEN_FIT

const jrnSource = (entryId) => `Compendium.stonetop_pwd.stonetop-journal.JournalEntry.${entryId}`;

// Fully-qualified paths of the durable art currently on disk. A missing directory
// just means nothing to apply from there (the GM hasn't imported yet).
async function browseDurableArt(root) {
	const FP = foundry?.applications?.apps?.FilePicker ?? FilePicker;
	const present = new Set();
	for (const dir of ["assets/bestiary", "assets/locations", "assets/maps"]) {
		try {
			const res = await FP.browse("data", `${root}/${dir}`);
			for (const f of res.files) present.add(decodeURIComponent(f));
		} catch (_) { /* directory doesn't exist yet -> nothing on disk */ }
	}
	return present;
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

export async function reapplyBook2ArtOnVersionChange() {
	if (!game.user?.isGM) return;
	const version = game.system.version;
	if (getSetting("book2ArtSyncVersion") === version) return;

	// Normalize away trailing slashes so `${root}/${out}` never yields a double slash
	// that wouldn't match the paths FilePicker.browse returns (which would silently
	// leave `available` empty and no-op the whole pass).
	const root = (getSetting("book2ArtRoot") || DEFAULT_ROOT).replace(/\/+$/, "");
	const present = await browseDurableArt(root);
	// Nothing imported yet: leave the version unstamped so this retries on the next
	// load (self-heals once the GM runs the macro or drops in a shared art folder).
	if (!present.size) return;

	const srcOf = (out) => `${root}/${out}`;
	const { monsters, locations, settingOverviewMaps = [] } = BOOK2_ART_APPLY_MANIFEST;

	// Only wire art that is actually on disk (a partial import must not point a
	// document at a file that isn't there).
	const available = new Set();
	for (const m of monsters) if (present.has(srcOf(m.out))) available.add(m.out);
	for (const l of locations) for (const im of l.images) if (present.has(srcOf(im.out))) available.add(im.out);
	for (const s of settingOverviewMaps) if (present.has(srcOf(s.out))) available.add(s.out);
	if (!available.size) return; // durable folder exists but holds none of our art

	const besPack = game.packs.get(monsters[0]?.actorPack ?? BES_PACK);
	const jrnPack = game.packs.get(JRN_PACK);
	if (!besPack || !jrnPack) return;

	// World journals seeded from our compendiums, indexed by the compendium source uuid
	// core stamps on import. Empty until the gazetteer / bestiary codex has been seeded.
	const worldBySource = new Map();
	for (const j of game.journal ?? []) {
		const s = j._stats?.compendiumSource ?? j.getFlag?.("core", "sourceId");
		if (!s || !s.startsWith("Compendium.stonetop_pwd.")) continue;
		if (!worldBySource.has(s)) worldBySource.set(s, []);
		worldBySource.get(s).push(j);
	}

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
		// second unlock (or any later step) throws.
		for (const p of [besPack, jrnPack]) if (p.locked) { await p.configure({ locked: false }); relock.push(p); }

		// 1. Compendium bestiary actors + bestiary journal pages (+ the same pages in any
		//    seeded world journal). Unconditional on the compendium: an update resets it to
		//    the shipped (art-less) defaults every time, so always re-point.
		for (const m of monsters) {
			if (!available.has(m.out)) continue;
			const src = srcOf(m.out);
			try {
				const actor = await besPack.getDocument(m.actorId);
				const upd = actor && artUpdate(actor, src);
				if (upd) { await actor.update(upd); actors++; }
			} catch (e) { errors++; error(`Book II art re-apply: actor "${m.slug}"`, e); }
			if (m.journalEntryId && m.journalPageId) {
				try {
					const page = (await jrnPack.getDocument(m.journalEntryId))?.pages?.get(m.journalPageId);
					if (page) {
						const nd = bestiaryDescriptionWithArt(page.system?.description, src, m.name);
						if (nd != null) { await page.update({ "system.description": nd }); besPages++; }
						for (const entry of worldBySource.get(jrnSource(m.journalEntryId)) ?? []) {
							const wp = matchWorldPage(entry.pages, page.id, page.name, page.type);
							if (!wp) continue;
							const wnd = bestiaryDescriptionWithArt(wp.system?.description, src, m.name);
							if (wnd != null) { noteEntry(entry); await wp.update({ "system.description": wnd }); worldJournalPages++; }
						}
					}
				} catch (e) { errors++; error(`Book II art re-apply: bestiary journal "${m.slug}"`, e); }
			}
		}

		// 2. Compendium location journal pages (+ their world copies). Append missing art
		//    into the target section body in book order.
		for (const l of locations) {
			try {
				const page = (await jrnPack.getDocument(l.journalEntryId))?.pages?.get(l.journalPageId);
				if (!page) continue;
				const srcs = l.images.filter((im) => available.has(im.out)).map((im) => srcOf(im.out));
				const cns = locationSectionsWithArt(page.system?.sections, l.sectionIndex, srcs, l.name);
				if (cns) { await page.update({ "system.sections": cns }); locPages++; }
				for (const entry of worldBySource.get(jrnSource(l.journalEntryId)) ?? []) {
					const wp = matchWorldPage(entry.pages, page.id, page.name, page.type);
					if (!wp) continue;
					const wns = locationSectionsWithArt(wp.system?.sections, l.sectionIndex, srcs, l.name);
					if (wns) { noteEntry(entry); await wp.update({ "system.sections": wns }); worldJournalPages++; }
				}
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
				const page = (await jrnPack.getDocument(s.journalEntryId))?.pages?.get(s.journalPageId);
				if (!page) continue;
				const nd = textPageWithMap(page.text?.content, src, s.name);
				if (nd != null) { await page.update({ "text.content": nd }); soPages++; }
				for (const entry of worldBySource.get(jrnSource(s.journalEntryId)) ?? []) {
					const wp = matchWorldPage(entry.pages, page.id, page.name, page.type);
					if (!wp) continue;
					const wnd = textPageWithMap(wp.text?.content, src, s.name);
					if (wnd != null) { noteEntry(entry); await wp.update({ "text.content": wnd }); worldJournalPages++; }
				}
			} catch (e) { errors++; error(`Book II art re-apply: setting-overview map "${s.slug}"`, e); }
		}

		// 3. World actors imported from the bestiary. Unlike the compendium docs these
		//    SURVIVE an update, so this pass is conservative (worldActorUpdate): re-point a
		//    portrait/token only when it is already one of ours (a stale path the root
		//    change broke), never a custom one, and never force the token `fit`.
		for (const m of monsters) {
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

	// Stamp the version only on a clean pass, so a transient failure retries on the next
	// load (every write is idempotent) instead of poisoning the version with a partial apply.
	if (errors) error(`Book II art re-apply: ${errors} item(s) failed; leaving the version unstamped to retry next load.`);
	else await setSetting("book2ArtSyncVersion", version);

	const total = actors + besPages + locPages + soPages + worldActors + worldJournalPages;
	if (total) {
		info(`Book II art re-applied after update: ${actors} actors, ${besPages + locPages + soPages} compendium journal pages, ${worldJournalPages} world journal pages, ${worldActors} world actors.`);
		ui.notifications?.info(`Stonetop: re-applied Book II art to ${total} entries after the update.`);
	}
}
