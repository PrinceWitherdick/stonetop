// WHAT CHANGED ON A CHARACTER THAT BELONGS ON THEIR TIMELINE.
//
// Pure: a snapshot of the few things a milestone is read off, taken before an update and again
// after, and the milestones the difference amounts to. timeline-watch.js does the Foundry half
// (the hooks, the names, the write).
//
// THE MILESTONES, AND WHAT EACH ONE IS NOT:
//
//   • A level gained -- one row per level, so a two-level jump is two rows. Never a level lost.
//   • A death (Death's Door's "dead"), and coming back as a Ghost, a Revenant or a Thrall. Not
//     dying, not out of the action: those are moments, not the story.
//   • A LASTING wound: one turned permanent, one healed to a scar, a mark left by Death's Door.
//     Never an everyday wound, which is bookkeeping a session clears.
//   • An arcanum found, identified, or taken up as a major. Never a mere LEAD: a lead is a rumour
//     the character has heard, and the card is the thing itself.
//   • A follower gained (a custom follower named, an animal companion named), or one breaking free.
//     A follower's DEATH is recorded where it is decided (the fate dialog), not here: the companion
//     and the initiates keep no stored record of dying for a diff to find.
//
// EVERY MILESTONE CARRIES A KEY, so the same change seen twice -- two concurrent updates that both
// started from the same snapshot, a GM correcting a level down and back up -- is one row.

/** The update option a level-up sets to the move it learned (StonetopCharacter#applyLevelUp). */
export const LEARNED_OPTION = "stonetopTimelineLearned";

/** A level-up's key and title, live or backfilled: one shape, so the two share their key. */
export const levelUpKey = level => `levelup:${level}`;
export const LEVELUP_TITLE_KEY = "stonetop.timeline.milestone.levelup";

/** The paths a milestone is read off. An update touching none of them is not looked at again. */
const SYSTEM_PATHS = ["system.attributes.level", "system.attributes.wounds"];
const FLAG_KEYS = ["deathsDoor", "postDeathInsert", "arcana", "customFollowers", "animalCompanion"];

/**
 * Does an update touch anything a milestone is read off?
 *
 * Asked of EVERY character update at the table, so it is cheap: a key walk, no snapshot. Reads both
 * shapes an update arrives in -- nested (`{system: {attributes: {level: ...}}}`) and dotted
 * (`{"system.attributes.level.value": 4}`), and the two mixed -- by flattening first.
 *
 * @param {object} changed  The update data as `preUpdateActor` receives it.
 * @param {string} scope    The system's flag scope.
 * @param {(o: object) => object} flatten  `foundry.utils.flattenObject`.
 */
export function touchesWatched(changed, scope, flatten) {
	const keys = Object.keys(flatten(changed ?? {}) ?? {});
	const flagPrefixes = FLAG_KEYS.map(key => `flags.${scope}.${key}`);
	return keys.some(key =>
		SYSTEM_PATHS.some(p => key === p || key.startsWith(`${p}.`))
		|| flagPrefixes.some(p => key === p || key.startsWith(`${p}.`) || key.startsWith(`${p}-=`))
		// A whole flag bag replaced (`flags.<scope>` set as one object) flattens to its leaves, but a
		// deletion of a whole key is `flags.<scope>.-=arcana`.
		|| FLAG_KEYS.some(k => key === `flags.${scope}.-=${k}`));
}

/** A list of strings, de-duplicated, for set arithmetic. */
function slugs(value) {
	return Array.isArray(value) ? [...new Set(value.filter(s => typeof s === "string" && s))] : [];
}

/**
 * The few facts a milestone is read off, from a character's system data and its (legacy-aware)
 * flag bag.
 *
 * @param {{system?: object, flags?: object}} source
 */
export function snapshotFrom({ system = {}, flags = {} } = {}) {
	const custom = {};
	for (const [id, card] of Object.entries(flags?.customFollowers ?? {})) {
		if (!card || typeof card !== "object") continue;
		custom[id] = { name: String(card.name ?? "").trim(), dead: !!card.dead, brokenFree: !!card.brokenFree };
	}
	return {
		level:      Math.trunc(Number(system?.attributes?.level?.value) || 0),
		deathsDoor: flags?.deathsDoor ?? null,
		insert:     flags?.postDeathInsert?.slug ?? null,
		wounds:     (Array.isArray(system?.attributes?.wounds) ? system.attributes.wounds : []).map(w => ({
			id:      String(w?.id ?? ""),
			text:    String(w?.text ?? "").trim(),
			status:  String(w?.status ?? ""),
			origin:  String(w?.origin ?? ""),
			healed:  !!w?.healed,
		})).filter(w => w.id),
		arcana: {
			owned:      slugs(flags?.arcana?.owned),
			identified: slugs(flags?.arcana?.identified),
			leads:      slugs(flags?.arcana?.leads),
			major:      flags?.arcana?.major || null,
		},
		followers: {
			custom,
			companion: String(flags?.animalCompanion?.name ?? "").trim(),
		},
	};
}

/**
 * The milestones between two snapshots of one character.
 *
 * Each is `{ source, key, titleKey, data, body?, refresh?, arcanaSlug? }`: a localisation key and its
 * data rather than finished words, so this stays pure. An arcanum's milestone carries its slug, and
 * the caller resolves the card's FRONT title before formatting (never the back, which would name an
 * unidentified card's secret).
 *
 * @param {object} before  snapshotFrom(...)
 * @param {object} after   snapshotFrom(...)
 * @param {object} [opts]
 * @param {string} [opts.learned]          The move a level-up learned, when the update said.
 * @param {string} [opts.markPlaceholder]  The text a Death's Door mark is seeded with before the
 *                                         player writes their own; a mark still saying it is skipped.
 */
export function detectMilestones(before, after, { learned = "", markPlaceholder = "" } = {}) {
	if (!before || !after) return [];
	const out = [];

	// A level gained. One row per level; the move learned goes on the highest one.
	if (before.level >= 1 && after.level > before.level) {
		for (let level = before.level + 1; level <= after.level; level++) {
			const body = level === after.level && learned ? { bodyKey: "stonetop.timeline.milestone.learned", bodyData: { move: learned } } : {};
			out.push({ source: "levelup", key: levelUpKey(level), titleKey: LEVELUP_TITLE_KEY, data: { level }, ...body });
		}
	}

	// Through the Last Door. Keyed by what they were when they died, so a character who comes back
	// and dies again gets the second death too, and the same death seen twice is one row.
	if (after.deathsDoor === "dead" && before.deathsDoor !== "dead") {
		out.push({ source: "death", key: `death:${after.insert ?? before.insert ?? "mortal"}`, titleKey: "stonetop.timeline.milestone.death", data: {} });
	}

	// Coming back.
	if (after.insert && after.insert !== before.insert) {
		out.push({ source: "death", key: `insert:${after.insert}`, titleKey: `stonetop.timeline.milestone.insert.${after.insert}`, data: {} });
	}

	// Lasting wounds.
	const was = new Map(before.wounds.map(w => [w.id, w]));
	for (const wound of after.wounds) {
		const prior = was.get(wound.id);
		if (wound.origin === "deaths-door") {
			// Seeded with a placeholder, then rewritten with the player's words: record the words,
			// and follow them if they are rewritten again.
			const placeholder = markPlaceholder && wound.text === markPlaceholder;
			if (wound.text && !placeholder && (!prior || prior.text !== wound.text)) {
				out.push({
					source: "wound", key: `wound:${wound.id}:mark`, titleKey: "stonetop.timeline.milestone.woundMark", data: {},
					body: wound.text, refresh: ["body"],
				});
			}
			continue;
		}
		if (wound.status === "permanent" && prior?.status !== "permanent") {
			out.push({ source: "wound", key: `wound:${wound.id}:permanent`, titleKey: "stonetop.timeline.milestone.woundPermanent", data: { text: wound.text } });
		}
		if (wound.healed && prior && !prior.healed) {
			out.push({ source: "wound", key: `wound:${wound.id}:scar`, titleKey: "stonetop.timeline.milestone.woundScar", data: { text: wound.text } });
		}
	}

	// Arcana. "Found" is a card newly in hand that is not a mere lead, or a lead that became one.
	const ownedBefore = new Set(before.arcana.owned);
	const leadsBefore = new Set(before.arcana.leads);
	const leadsAfter = new Set(after.arcana.leads);
	for (const slug of after.arcana.owned) {
		if (leadsAfter.has(slug)) continue;
		if (!ownedBefore.has(slug) || leadsBefore.has(slug)) {
			out.push({ source: "arcana", key: `arcana:${slug}:found`, titleKey: "stonetop.timeline.milestone.arcanaFound", data: {}, arcanaSlug: slug });
		}
	}
	const identifiedBefore = new Set(before.arcana.identified);
	for (const slug of after.arcana.identified) {
		if (identifiedBefore.has(slug)) continue;
		out.push({ source: "arcana", key: `arcana:${slug}:identified`, titleKey: "stonetop.timeline.milestone.arcanaIdentified", data: {}, arcanaSlug: slug });
	}
	// The major arcanum is ONE row, refreshed when it is re-picked, rather than a row per choice.
	if (after.arcana.major && after.arcana.major !== before.arcana.major) {
		out.push({
			source: "arcana", key: "arcana:major", titleKey: "stonetop.timeline.milestone.arcanaMajor", data: {},
			arcanaSlug: after.arcana.major, refresh: ["title"],
		});
	}

	// Followers gained: a custom follower once it has a name, and an animal companion once named.
	for (const [id, card] of Object.entries(after.followers.custom)) {
		const prior = before.followers.custom[id];
		if (card.name && !card.dead && !prior?.name) {
			out.push({ source: "follower", key: `follower:gain:${id}`, titleKey: "stonetop.timeline.milestone.followerGained", data: { name: card.name } });
		}
		if (card.brokenFree && !prior?.brokenFree) {
			out.push({ source: "follower", key: `follower:free:${id}`, titleKey: "stonetop.timeline.milestone.followerFree", data: { name: card.name || id } });
		}
	}
	if (after.followers.companion && !before.followers.companion) {
		out.push({
			source: "follower", key: "follower:gain:animalCompanion", titleKey: "stonetop.timeline.milestone.followerGained",
			data: { name: after.followers.companion },
		});
	}

	return out;
}

/** Milestones still worth writing while a character is being CREATED: the major arcanum only. */
export function creationMilestones(milestones) {
	return milestones.filter(m => m.key === "arcana:major");
}
