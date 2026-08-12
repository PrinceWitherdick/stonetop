/**
 * The Judge's brand — Condemn, the level 2-5 move that turns a Censure into something that
 * outlasts the scene: "they are marked with a mystical brand that cannot be removed or hidden
 * UNTIL YOU DISMISS IT."
 *
 * That last clause is the whole reason this module exists. Every other Judge move resolves and
 * is over; this one leaves state behind, the Judge is the only person who can end it, and
 * nothing on any sheet recorded it. A Judge four sessions in is carrying an unwritten list.
 *
 * A LIST, not a boolean — which is the one structural difference from the Lightbearer's holy
 * light (holy-light.js), whose "one slot, never a counter" note is worth reading beside this
 * one. Consecrated Flame replaces the flame before it, so one slot says everything. Condemn
 * names no cap at all, and Proclamation explicitly widens a single Censure to "a group or
 * faction ... regardless of distance", so the store has to hold many at once and each has to be
 * dismissible on its own.
 *
 * WHERE IT LIVES: on the JUDGE, as one flag array, and nowhere else. The obvious alternative —
 * stamping a flag on each branded actor, so their sheet can read its own state locally — cannot
 * work here: a player-owned Judge branding a GM-owned NPC has no write permission on that
 * document, so half the brands in a real game would silently fail to store. Reading is
 * unrestricted, so the target sheets ask the question the other way round (condemnersOf) and
 * everybody can render the tag regardless of who owns what.
 *
 * Kept out of the sheet and the character model so the predicates below can be tested without a
 * Foundry global in sight. The one function that DOES need the world, condemnersOf, takes its
 * population as an argument for the same reason; condemnedContext is the thin wrapper that fills
 * that argument from `game`, and it is the only line in this file that touches a global — read
 * lazily, inside the call, so importing the module still costs nothing.
 */

import { SYSTEM_ID } from "../../system-id.js";
import { ownsMoveNamed } from "./owns-move.js";

// Re-exported so this playbook's tests keep reaching the predicate through the feature module.
export { ownsMoveNamed };

export const CONDEMNED_FLAG = "condemned";
export const CONDEMN        = "Condemn";
export const CENSURE        = "Censure";
export const PROCLAMATION   = "Proclamation";

/**
 * Whether this character can brand anyone. ONLY Condemn — deliberately narrower than the family
 * of moves involved.
 *
 * Censure alone marks nobody: it is a reaction move whose four options all resolve on the spot.
 * Proclamation widens Condemn's reach but creates no brand without it, and it requires Censure,
 * not Condemn — so a Judge can own Proclamation and still have nothing to list. Condemn is the
 * only move in the playbook that leaves a mark behind, so it is the only one that earns the icon.
 */
export function canCondemn(actor) {
	return ownsMoveNamed(actor, CONDEMN);
}

/**
 * Whether to render the scales at all.
 *
 * A non-empty list is always shown, even on a sheet that no longer owns Condemn — otherwise
 * dropping a new playbook over a Judge strands live brands with nothing left on the sheet that
 * could dismiss them. Exactly the reason showHolyLight keeps a lit candle on a sheet that can no
 * longer make one.
 */
export function showCondemn({ owns, count }) {
	return !!owns || (Number(count) || 0) > 0;
}

/**
 * One stored brand, normalised.
 *
 * `uuid` is the link to an Actor and is what the target sheets match on; it is empty for a brand
 * on somebody with no actor in the world, which is the common case at the table (a Censure lands
 * on whoever is standing there) and the only possible case for a Proclamation against a faction.
 * A name-only entry is a perfectly good roster row — it simply cannot carry a tag, because there
 * is no sheet to put one on.
 *
 * `id` is this row's own handle, used by the dialog to dismiss it. Never the target's id: two
 * brands can name the same faction, and a name-only row has no document id to borrow.
 *
 * Everything is defensive because this comes back out of a flag, which validates nothing — a
 * hand-edited world must not be able to put `undefined` into the template or throw on `.trim()`.
 */
export function readEntry(raw, index = 0) {
	const name = String(raw?.name ?? "").trim();
	return {
		id:    String(raw?.id ?? "").trim() || `condemned-${index}`,
		name,
		uuid:  String(raw?.uuid ?? "").trim(),
		// No person/faction distinction is stored. A Proclamation's target ("the Claws", "House
		// Kadros") is a body of people rather than a person, but nothing downstream did anything
		// different with that fact — it labelled a row and swapped an icon — and it cost the add
		// form a tick box that had to be got right before typing a name. The name says which it is.
		note:  String(raw?.note ?? "").trim(),
	};
}

/**
 * Every brand this character is holding, normalised and in stored order.
 *
 * Rows with no name at all are dropped rather than rendered as a blank line: a nameless brand
 * names nobody, so there is nothing for the Judge to recognise and nothing to dismiss.
 */
export function readCondemned(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map(readEntry).filter(e => e.name);
}

/**
 * The identity two brands are compared on, so the same person cannot be branded twice.
 *
 * An actor-backed row is its uuid; a name-only row is its case-folded name. The two never
 * collide, because the name key is prefixed — otherwise a faction literally called after an
 * Actor uuid would be a very silly bug to chase.
 */
export function condemnKey(entry) {
	return entry?.uuid ? `uuid:${entry.uuid}` : `name:${String(entry?.name ?? "").trim().toLowerCase()}`;
}

/**
 * Add a brand to a list, or report why not. Returns `{ entries, added }` — `added` is null when
 * the list is unchanged, so a caller can tell "branded" from "already branded" without
 * re-comparing, and can skip the document write entirely.
 *
 * `makeId` is injected rather than reaching for foundry.utils.randomID, so this module keeps
 * holy-light.js's property of being testable without a Foundry global in sight. The character
 * model passes the real one.
 *
 * The row is normalised at the first FREE positional slot so that readEntry's fallback can't
 * collide when `makeId` yields nothing — normalising at the default index 0 would hand every such
 * row the same `condemned-0`, and two rows sharing an id means one Dismiss lifts both brands.
 *
 * The length alone isn't a free slot, because readCondemned numbers by the RAW stored index and
 * then DROPS nameless rows: a stored `[{name:""}, {name:"Gethin"}]` leaves one entry, `condemned-1`,
 * at length 1. So the taken ids are asked directly rather than assumed from the count.
 */
export function addCondemned(list, entry, makeId = () => "") {
	const entries = readCondemned(list);
	const taken = new Set(entries.map(e => e.id));
	let slot = entries.length;
	while (taken.has(`condemned-${slot}`)) slot++;
	const next = readEntry({ ...entry, id: entry?.id || makeId() }, slot);
	if (!next.name) return { entries, added: null };
	const key = condemnKey(next);
	if (entries.some(e => condemnKey(e) === key)) return { entries, added: null };
	return { entries: [...entries, next], added: next };
}

/**
 * Dismiss ONE brand. Returns `{ entries, removed }`, `removed` null when the id matched nothing —
 * again so the caller can skip a write that would change nothing but still re-render every sheet
 * showing this actor.
 *
 * Cut by POSITION rather than by filtering on the id: addCondemned guarantees fresh ids are
 * unique, but a hand-edited flag can still hold two rows spelling the same one, and a filter
 * would take both people off the roster for a single Dismiss click. Same reason noteCondemned
 * patches by index below.
 */
export function removeCondemned(list, id) {
	const entries = readCondemned(list);
	const at = entries.findIndex(e => e.id === id);
	if (at < 0) return { entries, removed: null };
	return { entries: entries.filter((_, i) => i !== at), removed: entries[at] };
}

/** Patch one row's note in place, same no-op contract as the two above. */
export function noteCondemned(list, id, note) {
	const entries = readCondemned(list);
	const text = String(note ?? "").trim();
	const at = entries.findIndex(e => e.id === id);
	if (at < 0 || entries[at].note === text) return { entries, changed: null };
	const changed = { ...entries[at], note: text };
	return { entries: entries.map((e, i) => (i === at ? changed : e)), changed };
}

/** Casefolded, whitespace-collapsed name, so "  The  CLAWS " and "the claws" are one thing. */
function normalizeName(name) {
	return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Which world actor a typed name means. The point of it: a brand that carries a uuid tags that
 * person's sheet, and a brand that carries only a name tags nobody — so a Judge who types
 * "brennan" for an NPC actually called "Brennan the Claw" should still end up branding HIM, not
 * creating a second, inert Brennan that looks branded on the roster and nowhere else.
 *
 * Three tiers, each only consulted when the one above found nothing:
 *
 *  1. EXACT (casefolded). Several actors can genuinely share a name — a world with four "Guard"
 *     NPCs is ordinary — and the typed text carries nothing that could tell them apart, so this
 *     tier takes the first and flags `ambiguous` rather than refusing. Refusing would leave the
 *     Judge with a name they cannot brand by typing at all. Dropping the actor is the way to say
 *     WHICH guard, and the notice points at it.
 *  2. PREFIX, then 3. SUBSTRING. These are guesses rather than statements, so they only resolve
 *     when EXACTLY ONE actor matches. More than one and the caller gets `candidates` to name back
 *     at the player instead of a coin-flip: quietly branding the wrong Aeronwen is worse than
 *     asking which.
 *
 * `actors` is passed in already filtered (brandable types, self excluded) so this stays pure and
 * general; returns `{ match, candidates, ambiguous }` with match null when nothing was found,
 * which is the ordinary case for a bandit nobody has made an Actor for.
 */
export function findBrandTarget(name, actors) {
	const wanted = normalizeName(name);
	const none = { match: null, candidates: [], ambiguous: false };
	if (!wanted) return none;

	const scored = [...(actors ?? [])]
		.filter(Boolean)
		.map(actor => ({ actor, key: normalizeName(actor.name) }))
		.filter(e => e.key);

	const exact = scored.filter(e => e.key === wanted);
	if (exact.length) return { match: exact[0].actor, candidates: [], ambiguous: exact.length > 1 };

	for (const test of [e => e.key.startsWith(wanted), e => e.key.includes(wanted)]) {
		const hits = scored.filter(test);
		if (hits.length === 1) return { match: hits[0].actor, candidates: [], ambiguous: false };
		if (hits.length > 1) return { match: null, candidates: hits.map(e => e.actor), ambiguous: true };
	}
	return none;
}

/**
 * Is this actor already on the roster? Used to keep people who have been branded out of the add
 * field's suggestions — offering somebody the Judge has already condemned is offering a click
 * whose only outcome is an "already bears your brand" refusal.
 *
 * DELIBERATELY LOOSER THAN condemnersOf, which is the other "is this person branded" question in
 * this file, and the two must not be merged:
 *
 *  • condemnersOf decides whether a SHEET WEARS THE TAG, so it matches on uuid alone. A name-only
 *    brand names nobody in particular and must never put a mark on a document that merely shares
 *    the spelling.
 *  • this decides whether to OFFER A NAME, and the roster the Judge is reading lists that name
 *    either way. Matching the name too keeps the promise the list makes — what is visibly on it is
 *    not offered again — and stops a second, near-identical row for the same person appearing under
 *    a different key.
 *
 * Only the suggestions are filtered, never the SEARCH: typing an already-branded name still
 * resolves and still gets told "already bears your brand", which is a better answer than the name
 * silently failing to match anybody.
 */
export function isBranded(brands, actor) {
	return isBrandedBy(brandIndex(brands), actor);
}

/**
 * The comparison form of a brand list: the actor ids branded, and the case-folded names.
 *
 * Built once and asked many times. `isBranded` re-reads and re-normalises the WHOLE list on every
 * call, which is fine for a single question but is O(actors x brands) when a caller is filtering
 * a world's worth of actors against it — the roster's add-suggestions list does exactly that, on
 * every render. Callers in a loop build this above the loop and use `isBrandedBy`.
 */
export function brandIndex(brands) {
	const ids = new Set();
	const names = new Set();
	for (const b of readCondemned(brands)) {
		if (b.uuid) ids.add(trailingActorId(b.uuid));
		const name = normalizeName(b.name);
		if (name) names.add(name);
	}
	return { ids, names };
}

/** Is this actor on a prepared `brandIndex`? Same rule as `isBranded`, without rebuilding it. */
export function isBrandedBy(index, actor) {
	const name = normalizeName(actor?.name);
	if (name && index.names.has(name)) return true;
	for (const key of actorMatchKeys(actor)) if (index.ids.has(key)) return true;
	return false;
}

/**
 * Who is holding a brand on this actor, given the characters to search. Returns the judges, so a
 * tooltip can name them ("Condemned by Aldric") rather than asserting a bare state.
 *
 * `judges` is passed in rather than read off `game.actors` so this is testable and so the caller
 * owns the (cheap, but repeated) collection scan. `readFlag` reads one character's stored list;
 * the character model supplies it, and the tests supply a plain lookup.
 *
 * Matched on UUID, and ALSO on the bare document id embedded in it. A world Actor's uuid is
 * `Actor.<id>`, but the same person reached through a token gives `Scene.<id>.Token.<id>.Actor.<id>`
 * — so a brand recorded from a token drop and a brand recorded from the sidebar would otherwise
 * be two different people. Comparing the trailing id folds both onto the document, which is what
 * the sheet is showing either way.
 */
export function condemnersOf(actor, judges, readFlag) {
	const target = actorMatchKeys(actor);
	if (!target.size) return [];
	const found = [];
	for (const judge of judges ?? []) {
		if (!judge || judge === actor) continue;
		const brands = readCondemned(readFlag?.(judge));
		if (brands.some(b => b.uuid && target.has(trailingActorId(b.uuid)))) found.push(judge);
	}
	return found;
}

/**
 * Every string that should resolve to this actor: its uuid, and the bare id inside it.
 *
 * Exported because the REPAINT side has to fold identically or it repaints the wrong sheets — see
 * hooks/CondemnedTag.js. Two functions deciding "is this the branded person" by different rules is
 * how the tag came to be derived correctly and then never drawn.
 */
export function actorMatchKeys(actor) {
	const keys = new Set();
	const uuid = String(actor?.uuid ?? "").trim();
	const id   = String(actor?.id ?? "").trim();
	if (uuid) keys.add(trailingActorId(uuid));
	if (id) keys.add(id);
	keys.delete("");
	return keys;
}

/** The document id at the end of an Actor uuid, whatever it was reached through. */
export function trailingActorId(uuid) {
	const parts = String(uuid ?? "").split(".");
	return parts[parts.length - 1] ?? "";
}

/**
 * What a BRANDED actor's own sheet needs in order to wear the tag: whether anyone has condemned
 * them, and who. Called from the NPC, monster and character sheets' getData.
 *
 * Asked of the world rather than of a flag on the actor itself, for the permission reason in this
 * file's header.
 *
 * PRE-FILTERED TO JUDGES WHO HAVE ACTUALLY BRANDED SOMEBODY, and bailing outright when there are
 * none, because of where this is called from: the getData of every character, NPC and monster
 * sheet, which re-runs on every HP tick, every note blur, every flag write, and on every open
 * sheet at once when onUpdateCondemned re-renders them. Left unfiltered, a world with no Judge in
 * it still paid a readCondemned — a rebuild-and-trim of every stored row — per character per
 * render. The filter is a bare property read, so the empty case is now a single pass and no
 * normalisation at all.
 *
 * A COMPENDIUM actor is never branded. Its `game.actors` counterpart (if any) is a different
 * document, and matching the two would put the tag on every unmodified copy of a bestiary entry
 * the moment one instance of it was condemned.
 *
 * `judges` / `readFlag` are injectable so the tests can drive this without a world.
 */
export function condemnedContext(actor, { judges, readFlag } = {}) {
	if (!actor || actor.pack) return { condemned: false, by: [], byLabel: "" };
	const pool = judges ?? [...(globalThis.game?.actors ?? [])]
		.filter(a => a?.type === "character" && a.flags?.[SYSTEM_ID]?.[CONDEMNED_FLAG]?.length);
	if (!pool.length) return { condemned: false, by: [], byLabel: "" };
	const read = readFlag ?? (judge => judge?.getFlag?.(SYSTEM_ID, CONDEMNED_FLAG));
	const by = condemnersOf(actor, pool, read).map(j => j?.name).filter(Boolean);
	// Joined HERE rather than in the template, so the tag's tooltip needs no `join` helper and the
	// two-Judges case (rare, but a party can hold two) says both names instead of the first.
	return { condemned: by.length > 0, by, byLabel: by.join(", ") };
}
