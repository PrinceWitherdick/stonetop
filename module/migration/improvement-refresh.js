// Bring the Book II improvement cards a steading already holds up to the cards the packs ship now.
//
// A built-in improvement is looked up by slug every time it is read, so a steading only ever stores
// its ticks. A CARD is different: dropping one (Trade with Barrier Pass, off the Barrier Pass page)
// copies its whole definition into the steading's `customImprovements`, and nothing revisits the
// copy. So every card taken before the cards gained their categories, their "1 of the following"
// minimums and their automatic effects is still the old card: completing it applies nothing, its
// either/or asks for both alternatives, and dropping the corrected card on top is refused as a
// duplicate name.
//
// THE SAME RULE AS THE HELD MOVES (move-refresh.js): a copy is brought up to date only while it is
// still exactly a card some release shipped (the list is generated from git history by
// scripts/gen-superseded-fields.js). A card the GM changed in the builder matches none and is left
// alone. The update goes through StonetopSteading#updateCustomImprovement, the builder's own edit
// path, so ticks carry across by their text, a completed card's ongoing rules switch on from now
// (the user's call, 2026-10-03), and nothing one-time is applied again. The GM is told which.

import { normalizeImprovementSections, normalizeImprovementGrants, sanitizeImprovementDef } from "../utils/improvement-def.js";
import { valueHash, loadGenerated } from "./superseded-values.js";
import { escHtml, decodeEntities } from "../utils/strings.js";
import { SweepFailures } from "./sweep-failures.js";
import { improvementCategoryKey } from "../data/improvement-categories.js";

/** Bumped when comparableImprovement changes, so stale generated data is refused. */
export const CARDS_FORMAT = 1;

/**
 * A card's definition as it compares: the card's payload and the copy a steading stores (which
 * _addCustomImprovement normalizes and sanitizes) read the same when one came from the other. The
 * name compares case-blind, as improvementNameTaken does, the category through the steading's own
 * rule (an unknown one is stored as ""), and the slug, which the steading makes, is left out. PURE.
 */
export function comparableImprovement(def) {
	const { effect, sections } = sanitizeImprovementDef({
		effect: String(def?.effect ?? ""),
		sections: normalizeImprovementSections(def?.sections),
	});
	return {
		label: cardKey(def),
		category: improvementCategoryKey(def?.category),
		flavor: String(def?.flavor ?? ""),
		effect,
		sections,
		grants: normalizeImprovementGrants(def?.grants),
	};
}

/** The hash a card is listed under. PURE. */
export function improvementHash(def) {
	return valueHash(comparableImprovement(def));
}

const ATTR = /data-steading-improvement="([^"]*)"/g;

/**
 * Every improvement card baked into a journal document's HTML, parsed: the payload of each
 * `data-steading-improvement` attribute (renderImprovementCardHtml writes it escHtml'd). PURE.
 */
export function improvementCardsIn(doc) {
	const cards = [];
	const visit = value => {
		if (typeof value === "string") {
			if (!value.includes("data-steading-improvement")) return;
			for (const [, raw] of value.matchAll(ATTR)) {
				try { cards.push(JSON.parse(decodeEntities(raw))); } catch { /* a malformed card is nobody's to refresh */ }
			}
		} else if (value && typeof value === "object") {
			for (const v of Object.values(value)) visit(v);
		}
	};
	visit(doc);
	return cards;
}

/** The key a card is known by across releases: its name, case-blind. PURE. */
export const cardKey = def => String(def?.label ?? def?.name ?? "").trim().toLowerCase();

/**
 * What to rewrite a held card with, or null: the shipped card, when the copy is one an earlier
 * release shipped and is not already the current one. PURE.
 *
 * @param {object} held   a steading's stored custom improvement
 * @param {Record<string, {def: object, former: string[]}>} cards  the shipped cards by cardKey
 */
export function improvementRefreshFor(held, cards) {
	const card = cards?.[cardKey(held)];
	if (!card) return null;
	const hash = improvementHash(held);
	if (hash === improvementHash(card.def) || !card.former.includes(hash)) return null;
	return structuredClone(card.def);
}

/**
 * Refresh every steading's held Book II cards. Per version, from Ready.
 *
 * @param {object} [options]
 * @param {Iterable} [options.actors]
 * @param {object}   [options.cards]   the shipped cards (tests); the generated data otherwise
 * @param {Function} [options.notify]  how the GM is told (tests); a GM whisper otherwise
 * @returns {Promise<Array<{steading: string, label: string, completed: boolean}>>} what was refreshed
 */
export async function refreshSteadingImprovements({ actors = globalThis.game?.actors ?? [], cards = null, notify = null } = {}) {
	const shipped = cards ?? await loadGenerated(() => import("./data/superseded-improvement-cards.js"), {
		formatKey: "CARDS_FORMAT", expected: CARDS_FORMAT, exportName: "IMPROVEMENT_CARDS",
		stale: "the improvement-card data is out of date; held cards are left as they are",
	});
	const refreshed = [];
	const failures = new SweepFailures("refreshing steading improvement cards");
	for (const actor of actors) {
		const steading = actor?.typedActor;
		if (typeof steading?.updateCustomImprovement !== "function") continue;
		for (const held of [...(steading.customImprovements ?? [])]) {
			const def = improvementRefreshFor(held, shipped);
			if (!def) continue;
			const result = await failures.attempt(`${held.label} on ${actor.name}`, () => steading.updateCustomImprovement(held.slug, def));
			if (result?.ok) refreshed.push({ steading: actor.name, label: result.label, completed: !!result.completed });
		}
	}
	// Told even when something else failed: what did change has changed.
	if (refreshed.length) await (notify ?? notifyGm)(refreshed);
	failures.throwIfAny();
	return refreshed;
}

async function notifyGm(refreshed) {
	const { whisperGm } = await import("../utils/chat.js");
	const line = r => `<li><strong>${escHtml(r.label)}</strong> on ${escHtml(r.steading)}${r.completed
		? ": already built, so its ongoing rules apply from now on. What completing it gives once (Fortunes, a resource) was not given again."
		: ""}</li>`;
	await whisperGm(`<p>These steading improvements were brought up to the card the book prints now:</p><ul>${refreshed.map(line).join("")}</ul>`);
}
