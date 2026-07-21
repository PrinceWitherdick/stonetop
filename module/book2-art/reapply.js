import { getSetting, setSetting } from "../settings.js";
import { info, error } from "../utils/logger.js";
import { BOOK2_ART_APPLY_MANIFEST } from "./manifest.js";
import { bestiaryDescriptionWithArt, codexFieldWithArt, locationSectionsWithArt, textPageWithManagedMap, matchWorldPage } from "./world-journal-art.js";
import { managedHash } from "../hooks/journal-sync-core.js";
import { compendiumSourceOf } from "../utils/foundry-compat.js";
import { book2ArtRoot } from "./art-root.js";
import { STEADING_ACTOR_TYPE, isSteadingPlaceholderImg } from "../actors/steading/steading-portrait.js";
import { isBestiaryPlaceholderImg } from "../bestiary/monster-portrait.js";

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
	// The dirs are independent; browse them in parallel. A rejected browse means the
	// directory doesn't exist yet (the GM hasn't imported) -> nothing on disk from there.
	const results = await Promise.all(["assets/bestiary", "assets/locations", "assets/maps", "assets/treasures", "assets/people", "assets/steading"]
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

// Whether the GM has already imported book art: any durable illustration present on disk
// in the art folder. This is the very signal reapplyBook2Art uses to decide there is
// document art to wire (`present.size` below). Exported so the ready flow can nudge a GM
// who is past the first-session Welcome guide but never imported (hooks/Ready.js). Cheap
// (a few FilePicker.browse calls against the durable folder) and best-effort — a failed
// browse reads as "nothing on disk", the safe default for the nudge. GM-only, since only
// a GM can browse the data files.
export async function hasImportedBook2Art() {
	const present = await browseDurableArt(book2ArtRoot());
	return present.size > 0;
}

// Publish which document-less art rows have their illustration on disk into a world-scoped
// index `setting`. Treasures and "People of Stonetop" portraits are not documents: a treasure's
// Item is built at drag time (treasure-drops.js reads this index instead), and the steading
// sheet's portrait gallery reads it rather than browsing files (so even players get it broadcast).
// `entryOf(row)` returns the `[key, value]` pair to record, keyed the way each consumer looks it
// up: treasures map catalog slug -> manifest `out` path; portraits map `out` -> display name.
// Recording the manifest's own path means the consumer resolves the file we actually checked for,
// instead of re-deriving it from the naming convention and drifting when a row's `out` changes.
// Authoritative (not additive): a row whose file is gone is dropped, so nothing ever points at a
// missing image. Only writes when the index actually changed, since this runs on every GM load.
// No `!rows.length` fast path: an empty manifest list is a real state that must still clear a
// previously-published index, and the changed-only check already makes the steady-state call a
// single setting read.
async function refreshArtIndex(setting, rows, present, srcOf, entryOf, label) {
	try {
		const have = {};
		for (const row of rows.filter((r) => present.has(srcOf(r.out)))) {
			const [key, value] = entryOf(row);
			have[key] = value;
		}
		const prev = getSetting(setting);
		// Key order is the manifest's on both sides, so a plain stringify compares faithfully.
		if (JSON.stringify(prev ?? {}) === JSON.stringify(have)) return;
		await setSetting(setting, have);
		const count = Object.keys(have).length;
		info(`Book II art: ${label} art index updated (${count} of ${rows.length} on disk)`);
	} catch (e) {
		error(`Book II art: could not update the ${label} art index`, e);
	}
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

// Update for a WORLD bestiary actor, which survives a system update (so a GM's choices must
// be preserved). Two safe cases, per field:
//   • re-point a stale pointer that is ALREADY one of ours (ends with this monster's art path,
//     i.e. a path the root change broke) — never a custom portrait/token; OR
//   • ADOPT the durable art over a shipped creature-type placeholder the seeded actor still
//     carries. SeedActors copies the compendium's placeholder icon into the world, and nothing
//     ELSE ever replaces it — the runtime self-heal is otherwise conservative — so a monster
//     with book art would stay on its type icon forever. This is the mirror of the steading
//     portrait's adopt-over-placeholder net (§3.5), keyed on isBestiaryPlaceholderImg.
// A portrait/token the group chose is left untouched. The token `fit` is forced ONLY when
// adopting over a placeholder token, so a GM's "contain" on art that was already ours is never
// reverted to "cover" on every load. Null when nothing to change.
function worldMonsterArtUpdate(actor, src, tail) {
	const upd = {};
	const imgPlaceholder = isBestiaryPlaceholderImg(actor.img);
	if ((String(actor.img ?? "").endsWith(tail) || imgPlaceholder) && actor.img !== src) upd.img = src;
	const tex = actor.prototypeToken?.texture;
	if (tex) {
		const tokPlaceholder = isBestiaryPlaceholderImg(tex.src);
		if ((String(tex.src ?? "").endsWith(tail) || tokPlaceholder) && tex.src !== src) upd["prototypeToken.texture.src"] = src;
		if (tokPlaceholder && tex.fit !== TOKEN_FIT) upd["prototypeToken.texture.fit"] = TOKEN_FIT;
	}
	return Object.keys(upd).length ? upd : null;
}

// True if any page of `entry` already carries this exact art `src` anywhere (bestiary
// description, a location section body, or a plain text page). A cheap, compendium-free
// pre-check: it reads only the world entry's own in-memory pages, so the every-load
// self-heal can decide "this row's art is already here, skip it" without a getDocument.
function entryHasSrc(entry, src) {
	for (const p of entry?.pages ?? []) {
		if (String(p.system?.description ?? "").includes(src)) return true;
		if (String(p.system?.nests ?? "").includes(src)) return true;
		for (const s of p.system?.sections ?? []) if (String(s?.body ?? "").includes(src)) return true;
		if (String(p.text?.content ?? "").includes(src)) return true;
	}
	return false;
}

// True if any bestiary page of this world entry would change under `curation` — the cheap,
// compendium-free precheck for the curated-codex pass below, and the reason that pass stays
// as free as the others on a steady-state load. entryHasSrc cannot answer this: it only asks
// "is this src anywhere on the entry?", which can see neither art sitting in the WRONG slot
// nor art the manifest no longer names (both of which need a write).
function codexEntryNeedsWork(entry, curation) {
	for (const p of entry?.pages ?? []) {
		if (p.type !== "bestiary") continue;
		if (codexFieldWithArt(p.system?.description, "description", curation) != null) return true;
		if (codexFieldWithArt(p.system?.nests, "nests", curation) != null) return true;
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

// Re-render any OPEN views of the compendia we just wrote to, so the new art shows without an
// F5. UNLIKE a world document, a compendium document update does NOT live-refresh the pack
// browser window or a sheet opened from it (Foundry keeps the pack in memory), so a GM who
// runs the import — or the once-per-version re-point — with the Monsters/journal compendium
// open would otherwise see the old art until a reload. This closes that gap for non-technical
// GMs. Best-effort: a failed render must never fail the pass. `packs` are the CompendiumCollection
// objects we edited. Mirrored inline by the bring-your-own-book macro.
function rerenderOpenCompendia(packs) {
	const set = new Set((packs ?? []).filter(Boolean));
	if (!set.size) return;
	// The pack browser window(s): a collection re-renders its bound applications.
	for (const pack of set) for (const app of pack.apps ?? []) { try { app.render(false); } catch (_) { /* best-effort */ } }
	// Sheets opened FROM these compendia — a compendium doc's sheet shows its own img/token,
	// which the doc update above does not refresh. Matched by the doc's `pack` id.
	const ids = new Set([...set].map((p) => p.collection ?? p.metadata?.id).filter(Boolean));
	const apps = [...(foundry.applications?.instances?.values?.() ?? []), ...Object.values(ui.windows ?? {})];
	for (const app of apps) {
		const doc = app?.document ?? app?.object;
		if (doc?.pack && ids.has(doc.pack) && app.rendered) {
			try { app.render(); } catch (_) { /* best-effort */ }
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

	const root = book2ArtRoot();
	const present = await browseDurableArt(root);

	// book2ArtSrc with the root hoisted: this runs once per manifest row per pass, and the
	// root cannot change mid-pass, so there's no reason to re-read the setting each time.
	const srcOf = (out) => `${root}/${out}`;
	const { monsters, locations, settingOverviewMaps = [], treasures = [], people = [], codex = [], steadings = [] } = BOOK2_ART_APPLY_MANIFEST;

	// Treasures first, and BEFORE the nothing-on-disk return below. They are not documents,
	// so publishing which of them have a file on disk, and where, is their whole apply step —
	// treasure-drops.js reads the index when a player drags the item off the journal. The
	// index is AUTHORITATIVE, which makes the empty-folder case the one that most needs to
	// run, not the one to skip: a GM who deleted or renamed the art folder must have the
	// index cleared, or every drag keeps baking `img` to a file that is gone. Clearing is
	// also the safe failure mode if a browse fails transiently — a dropped item falls back
	// to its load-class icon, and the next load restores the index.
	await refreshArtIndex("treasureArt", treasures, present, srcOf, (t) => [t.slug, t.out], "treasure");
	// People-of-Stonetop portraits are document-less too. But UNLIKE treasures, this reapply is
	// NOT their publisher: a portrait's display name lives only in the Import Book Art macro's
	// manifest (`kind:"person"` rows), so the macro publishes `peopleArt` itself, additively, from
	// the files it just wrote. This system's own `people` manifest is populated in lockstep only
	// when portrait art is authored. So guard on it: while it's empty we have no names to index and
	// must NOT run the authoritative refresh (it would compute `{}` and wipe the macro's index on
	// every load, emptying the steading gallery). Once `people` is populated it matches the macro,
	// and the refresh becomes authoritative again — dropping a portrait whose file is gone.
	if (people.length) await refreshArtIndex("peopleArt", people, present, srcOf, (p) => [p.out, p.name], "people");

	if (!present.size) return null; // nothing imported yet -> no document art to wire

	// Codex pages the user has CURATED in the picker: they choose which of the page's
	// illustrations show and under which heading, so the additive per-monster embed below
	// must keep its hands off them (it would re-add art they hid, and could never relocate
	// anything). Pass 1.5 owns these pages instead, authoritatively. Every other codex page
	// is untouched by this and keeps the additive behaviour, so `codex: []` — the shipped
	// default — is a literal no-op.
	const curated = new Set(codex.map((c) => c.journalEntryId));

	// Only wire art that is actually on disk (a partial import must not point a
	// document at a file that isn't there).
	const available = new Set();
	for (const m of monsters) if (present.has(srcOf(m.out))) available.add(m.out);
	for (const l of locations) for (const im of l.images) if (present.has(srcOf(im.out))) available.add(im.out);

	// Setting Overview maps resolve their preference chain HERE rather than in pass 2.5, so
	// the rule is stated once and the early return below can see their work. Each row is an
	// ORDERED preference: the Book II page crop (`out`) first, then `replaces` — the
	// user-supplied poster map an earlier release embedded here. Show the best one on disk
	// and supersede the rest. Preferring `out` is the upgrade (a world still showing the
	// poster map gets the labelled Book II map instead); falling back matters just as much,
	// because a GM who has not re-run the macro — or who has no Book II PDF at all — still
	// has only the poster map on disk, and skipping the row outright would leave them
	// staring at a blank page where their map used to be. The poster map file is never
	// touched: it still backs its Scene.
	const mapPicks = settingOverviewMaps.flatMap((s) => {
		const chain = [s.out, ...(s.replaces ?? [])];
		const pick = chain.find((o) => present.has(srcOf(o)));
		return pick ? [{ s, src: srcOf(pick), replaces: chain.filter((o) => o !== pick).map(srcOf) }] : [];
	});
	// Nothing of ours on disk at all — not a document image, not a map, not the steading
	// portrait. (Maps count even though they never enter `available`: a GM who only ever
	// supplied poster maps still has work for us to do, and must not be turned away here.
	// The steading portrait is document-less too and lives in its own folder, so check it
	// directly — otherwise a world with only the steading art on disk would be turned away
	// before the safety-net pass below could adopt it. Skipped on a scoped import, which
	// never touches actors.)
	const steadingOnDisk = !Array.isArray(entries) && steadings.some((s) => present.has(srcOf(s.out)));
	// Monster art on disk is actor work for pass 3 (adopt over the creature-type placeholder),
	// independent of whether this world has any seeded journals. Disk-only, like steadingOnDisk:
	// it may let a world through that turns out to have no bestiary actors of ours, which pass 3
	// then no-ops over — the cheap, correct failure mode. Skipped on a scoped import (no actors).
	const monstersOnDisk = !Array.isArray(entries) && monsters.some((m) => present.has(srcOf(m.out)));
	if (!available.size && !mapPicks.length && !steadingOnDisk) return null;

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
	// world targets and no compendium work to do: bail before touching packs. But a world
	// with the steading portrait OR a bestiary monster's book art on disk still has actor work
	// (pass 3.5 steading / pass 3 monsters) even with no world journals, so let it through here
	// too — otherwise the every-load worldOnly self-heal would turn such a world away before it
	// could adopt art onto actors that were seeded after the version was stamped.
	if (onlyWorld && !worldBySource.size && !steadingOnDisk && !monstersOnDisk) return null;

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
	let actors = 0, besPages = 0, codexPages = 0, locPages = 0, soPages = 0, worldActors = 0, worldJournalPages = 0, steadingActors = 0, errors = 0;
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
			// The journal half only — the portrait/token above is per-actor and always applies.
			// A curated page is owned by pass 1.5; several actors can share one codex page, so
			// this is what stops their portraits stacking on it.
			if (m.journalEntryId && m.journalPageId && !curated.has(m.journalEntryId)) {
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

		// 1.5 CURATED codex pages (+ their world copies). Where several creatures share one
		//    codex page, the additive pass above would stack every portrait on it. Here the
		//    manifest is authoritative instead: it names every illustration the page owns
		//    (`managed`) and exactly which of them show, and where (`slots`). Art the user
		//    hid is in `managed` but in no slot, which is how it gets stripped rather than
		//    merely not re-added.
		for (const c of codex) {
			// Nothing of this entry's art on disk: this GM never imported it, so leave the
			// page alone rather than stripping art they do have (mirrors the locations pass).
			if (!(c.managed ?? []).some((out) => available.has(out))) continue;
			try {
				// Resolve to page srcs. `slots` is filtered to what is on disk, so a partial
				// import never embeds a broken <img>; `managed` stays COMPLETE so a missing
				// file can still be stripped off a page that already carries it.
				const curation = {
					managed: (c.managed ?? []).map(srcOf),
					slots: (c.slots ?? []).map((s) => ({
						slot: s.slot,
						images: (s.images ?? []).filter((i) => available.has(i.out))
							.map((i) => ({ src: srcOf(i.out), name: i.name })),
					})),
				};
				const worldEntries = worldBySource.get(jrnSource(c.journalEntryId)) ?? [];
				const worldNeedsArt = worldEntries.length
					&& (!cheapWorldSkip || worldEntries.some((e) => codexEntryNeedsWork(e, curation)));
				if (onlyWorld && !worldNeedsArt) continue;
				const page = (await jrnPack.getDocument(c.journalEntryId))?.pages?.get(c.journalPageId);
				if (!page) continue;
				if (!onlyWorld) {
					// Both fields in ONE update: they are two keys of the same page.
					const upd = {};
					const nd = codexFieldWithArt(page.system?.description, "description", curation);
					if (nd != null) upd["system.description"] = nd;
					const nn = codexFieldWithArt(page.system?.nests, "nests", curation);
					if (nn != null) upd["system.nests"] = nn;
					if (Object.keys(upd).length) { await page.update(upd); codexPages++; }
				}
				// Two applyWorldPages calls rather than one merged write: it takes a single
				// updateKey, and widening its signature would drag the location + map passes
				// into the blast radius for nothing. noteEntry is deduped by touchedEntries, so
				// the pristine baseline is still captured exactly once and BEFORE the first
				// write — which is what keeps a removal-only touch from marking a seeded entry
				// GM-edited and silently opting it out of every future prose update.
				worldJournalPages += await applyWorldPages(worldEntries, page, "system.description",
					(wp) => codexFieldWithArt(wp.system?.description, "description", curation), noteEntry);
				worldJournalPages += await applyWorldPages(worldEntries, page, "system.nests",
					(wp) => codexFieldWithArt(wp.system?.nests, "nests", curation), noteEntry);
			} catch (e) { errors++; error(`Book II art re-apply: curated codex page "${c.name ?? c.journalEntryId}"`, e); }
		}

		// 2. Compendium location journal pages (+ their world copies). Append missing art
		//    into the target section body in book order.
		for (const l of locations) {
			try {
				const srcs = l.images.filter((im) => available.has(im.out)).map((im) => srcOf(im.out));
				// Retired art: a src a PRIOR manifest embedded that this system no longer names
				// (e.g. a duplicate extraction we removed). Resolved regardless of disk presence
				// — it keys on the embed, not a file — so it clears even after the file is gone,
				// which is why the skip below also lets a retired-only row through: a location
				// whose kept image is off disk still needs its stranded duplicate stripped.
				const retired = (l.retired ?? []).map(srcOf);
				if (!srcs.length && !retired.length) continue; // nothing to place and nothing to retire
				const worldEntries = worldBySource.get(jrnSource(l.journalEntryId)) ?? [];
				const worldNeedsArt = worldEntries.length && (!cheapWorldSkip || worldEntries.some(
					(e) => srcs.some((src) => !entryHasSrc(e, src)) || retired.some((r) => entryHasSrc(e, r))));
				if (onlyWorld && !worldNeedsArt) continue;
				const page = (await jrnPack.getDocument(l.journalEntryId))?.pages?.get(l.journalPageId);
				if (!page) continue;
				if (!onlyWorld) {
					const cns = locationSectionsWithArt(page.system?.sections, l.sectionIndex, srcs, l.name, retired);
					if (cns) { await page.update({ "system.sections": cns }); locPages++; }
				}
				worldJournalPages += await applyWorldPages(worldEntries, page, "system.sections",
					(wp) => locationSectionsWithArt(wp.system?.sections, l.sectionIndex, srcs, l.name, retired), noteEntry);
			} catch (e) { errors++; error(`Book II art re-apply: location "${l.slug}"`, e); }
		}

		// 2.5 Setting Overview maps embedded into the setting journal's plain text pages
		//    (+ their world copies). An update resets the compendium to the shipped (art-less)
		//    page and re-seeds pristine world copies from it, so this pass is the ONLY thing
		//    putting the map back. Idempotent, and a no-op on any page showing a map we don't
		//    own (a GM's own labelled variant). Which file each row shows, and which it
		//    supersedes, was resolved once up front (see `mapPicks`).
		for (const { s, src, replaces } of mapPicks) {
			try {
				const worldEntries = worldBySource.get(jrnSource(s.journalEntryId)) ?? [];
				// "Has the map" is not enough to call an entry done: a page carrying this map AND
				// a superseded one still needs the old one stripped, so ask about both. Missing
				// this would re-shadow exactly what textPageWithManagedMap's strip-first order fixes.
				const worldNeedsArt = worldEntries.length && (!cheapWorldSkip || worldEntries.some(
					(e) => !entryHasSrc(e, src) || replaces.some((old) => entryHasSrc(e, old))));
				if (onlyWorld && !worldNeedsArt) continue;
				const page = (await jrnPack.getDocument(s.journalEntryId))?.pages?.get(s.journalPageId);
				if (!page) continue;
				if (!onlyWorld) {
					const nd = textPageWithManagedMap(page.text?.content, src, s.name, replaces);
					if (nd != null) { await page.update({ "text.content": nd }); soPages++; }
				}
				worldJournalPages += await applyWorldPages(worldEntries, page, "text.content",
					(wp) => textPageWithManagedMap(wp.text?.content, src, s.name, replaces), noteEntry);
			} catch (e) { errors++; error(`Book II art re-apply: setting-overview map "${s.slug}"`, e); }
		}

		// 3. World actors imported from the bestiary. Unlike the compendium docs these SURVIVE
		//    an update, so this pass is conservative (worldMonsterArtUpdate): re-point a stale
		//    "already ours" pointer the root change broke, OR adopt the art over a shipped
		//    creature-type placeholder the seeded actor still carries — never a custom portrait.
		//    Runs on the full pass AND the every-load world-only self-heal (like the steading
		//    §3.5, and for the same reason: an established world whose bestiary actors were
		//    seeded AFTER the version was stamped never sees the full pass again, so the
		//    self-heal is the only thing that adopts their art). Skipped only on a scoped
		//    journal import (Array.isArray(entries)), which must not touch actors.
		if (!Array.isArray(entries)) {
			// Index the world actors by their compendium source ONCE, so the per-monster loop is a
			// map lookup instead of a full game.actors rescan per monster. This pass runs on every GM
			// load via the world-only self-heal, so an O(monsters × actors) rescan is real per-load
			// work; the index makes it O(actors + monsters). An actor is filed under BOTH its
			// `_stats.compendiumSource` and its legacy `core.sourceId` (deduped) to match the old
			// OR check exactly, since either can be the pointer at our compendium actor.
			const actorsBySource = new Map();
			for (const a of game.actors) {
				for (const s of new Set([a._stats?.compendiumSource, a.getFlag?.("core", "sourceId")])) {
					if (!s) continue;
					if (!actorsBySource.has(s)) actorsBySource.set(s, []);
					actorsBySource.get(s).push(a);
				}
			}
			for (const m of monsters) {
				if (!available.has(m.out)) continue;
				const src = srcOf(m.out);
				const uuid = `Compendium.${m.actorPack ?? BES_PACK}.Actor.${m.actorId}`;
				const tail = `/${m.out}`;
				for (const a of actorsBySource.get(uuid) ?? []) {
					try {
						const upd = worldMonsterArtUpdate(a, src, tail);
						if (upd) { await a.update(upd); worldActors++; }
					} catch (e) { errors++; error(`Book II art re-apply: world actor "${a.name ?? a.id}"`, e); }
				}
			}
		}

		// 3.5 The steading portrait — the world "Stonetop" sheet. A durable WORLD actor created
		//    at runtime with no compendium id (found by type), and until now the ONE piece of
		//    book art with no re-apply safety net: the Import Book Art macro's one-shot pass was
		//    the only thing that ever wired it, so if that single swap didn't land the portrait
		//    stayed the shipped "S" emblem forever. This is that safety net. The monster world
		//    actors above adopt over their creature-type placeholder the same way (worldMonsterArtUpdate),
		//    but they carry a stable compendium id, so this pass differs by finding its target: the
		//    steading is a document-less singleton with no compendium id, matched by type. The guard is
		//    placeholder-based (isSteadingPlaceholderImg): take the book art over a shipped placeholder
		//    only, never a portrait the group chose.
		//    Idempotent. Runs on the full pass AND the every-load self-heal, but not on a scoped
		//    journal import (Array.isArray(entries)) — that must not touch actors. artUpdate forces
		//    the token fit like the macro does; safe here because we only ever touch a placeholder.
		if (!Array.isArray(entries)) for (const s of steadings) {
			const src = srcOf(s.out);
			if (!present.has(src)) continue;
			try {
				const actor = game.actors?.find((a) => a.type === STEADING_ACTOR_TYPE);
				if (!actor || !isSteadingPlaceholderImg(actor.img)) continue;
				const upd = artUpdate(actor, src);
				if (upd) { await actor.update(upd); steadingActors++; }
			} catch (e) { errors++; error(`Book II art re-apply: steading "${s.slug}"`, e); }
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
	// Same for the compendia: if we re-pointed any compendium actor or journal page, refresh
	// its open browser/sheet so the art appears live (the compendium does not auto-refresh).
	if (actors + besPages + codexPages + locPages + soPages > 0) rerenderOpenCompendia([besPack, jrnPack]);

	const total = actors + besPages + codexPages + locPages + soPages + worldActors + worldJournalPages + steadingActors;
	if (total) {
		info(`Book II art applied: ${actors} actors, ${besPages + codexPages + locPages + soPages} compendium journal pages, ${worldJournalPages} world journal pages, ${worldActors} world actors${steadingActors ? ", steading portrait" : ""}.`);
		ui.notifications?.info(`Stonetop: added Book II art to ${total} ${total === 1 ? "entry" : "entries"}.`);
	}
	return { errors, total, actors, besPages, codexPages, locPages, soPages, worldActors, worldJournalPages, steadingActors };
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
