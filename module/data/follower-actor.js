// Follower → NPC Actor: the shape a follower card takes when it steps off the sheet
// and onto the map.
//
// Book I ("NPCs & Followers", p.475) already makes an NPC the substrate of every
// follower — "First, create them as an NPC," then give them the follower-only stats.
// Dragging a follower card onto the canvas reads that sentence backwards: the card's
// stats become an `npc` Actor, so a follower can stand on the battlemap like anyone
// else at the table. The conversion is the mirror of followerFromNpc (follower-build.js),
// and the two agree field for field — HP / armor / damage / instinct / tags / moves —
// so a follower recruited from an NPC and one that became an NPC read the same.
//
// Deliberately framework-free (Foundry globals are read defensively, never imported) so
// the mapping can be unit-tested without a world.

import { normalizeTags, parseFollowerArmor } from "./follower-build.js";
import { creatureTypeIcon, creatureTypeForFaIcon } from "../bestiary/creature-types.js";
import { escHtml, isDefaultImg } from "../utils/strings.js";
import { SYSTEM_ID } from "../system-id.js";

/** dataTransfer `type` for a follower card dragged off a character sheet. */
export const FOLLOWER_DRAG_TYPE = "StonetopFollower";

/** Where followers-turned-actors are filed, so they don't scatter through the sidebar. */
export const FOLLOWER_FOLDER = { name: "Followers", color: "#6b5a3e" };

// Read defensively: this module is unit-tested outside Foundry, where CONST doesn't exist.
const _const = (group, key, fallback) => globalThis.CONST?.[group]?.[key] ?? fallback;

/** The sprout an initiate of Danu wears — the one follower glyph outside the taxonomy. */
export const SPROUT_MARKER = `systems/${SYSTEM_ID}/assets/icons/followers/sprout.svg`;

// Follower cards show a Font Awesome glyph where they have no portrait, and most of those
// glyphs are the monster taxonomy's own (a converted monster literally carries its type's
// glyph), so the marks in assets/icons/bestiary/ answer for nearly all of them. These are
// the ones that aren't: two animals the taxonomy would call natural beasts, an initiate's
// sprout, and the generic monster glyph creatureTypeFaIcon falls back to.
const FOLLOWER_GLYPH_TYPES = Object.freeze({
	"fa-dog":        "natural-beast",     // a beast follower (the dog, the Hounds)
	"fa-wheat-awn":  "natural-beast",     // livestock
	"fa-dragon":     "unknown-origin",    // creatureTypeFaIcon's fallback glyph
});

// Most followers are people, so an unrecognised glyph stands in as one rather than as a
// question mark.
const DEFAULT_MARKER_TYPE = "human-individual";

// Font Awesome style/utility classes, which sit alongside the icon class ("fas fa-paw") and
// must not be mistaken for it.
const FA_NON_ICON = /^fa-(solid|regular|light|thin|duotone|brands|sharp|fw|lg|sm|xs|xl|2xl|spin|pulse|border|inverse|stack|beat|fade|flip|shake|bounce|rotate|pull)/;

/**
 * The stand-in art for a follower with no portrait of their own: the same mark their card
 * shows as a glyph, as a real image.
 *
 * A card's glyph can't be an Actor's `img` — Font Awesome is a font — so it resolves to the
 * nearest of the circular marks the rest of the system already uses for art-less creatures
 * (the Book I p.392 creature-type discs, which is what a monster created in this system gets
 * too). Nothing is invented: these are category marks that say what kind of thing this is,
 * never a picture of this particular follower.
 *
 * @param {string} portraitIcon  the card's icon classes, e.g. "fas fa-paw"
 */
export function followerMarkerImg(portraitIcon) {
	const glyph = String(portraitIcon ?? "").split(/\s+/)
		.find(c => c.startsWith("fa-") && !FA_NON_ICON.test(c));
	if (glyph === "fa-seedling") return SPROUT_MARKER;
	const type = FOLLOWER_GLYPH_TYPES[glyph] ?? creatureTypeForFaIcon(glyph) ?? DEFAULT_MARKER_TYPE;
	return creatureTypeIcon(type) ?? creatureTypeIcon(DEFAULT_MARKER_TYPE);
}

/** Lines of an HTML paragraph run, escaped; blank input yields nothing. */
function _paragraphs(text) {
	return String(text ?? "")
		.split("\n")
		.map(l => l.trim())
		.filter(Boolean)
		.map(l => `<p>${escHtml(l)}</p>`);
}

/**
 * The NPC's `system.notes`: everything the follower card carries that the NPC sheet has
 * no field of its own for — what they're owed (Cost), what they're carrying (Gear), and
 * the card's own free notes. Written as prose rather than dropped, so the token's actor
 * is a complete record of the follower and nothing has to be re-typed.
 *
 * Only TICKED gear is listed, which is what a ticked box on a follower card means — they
 * have it on them (the same reading `_followerBearsShield` takes of the same field). It
 * also keeps a Marshal's crew from dropping its entire printed inventory list in here when
 * it is carrying six things. Crew gear labels are the rulebook's marked-up strings, so the
 * markup is stripped before the text is escaped.
 */
export function followerNotesHtml(follower = {}) {
	const out = [];
	const cost = String(follower.cost ?? "").trim();
	if (cost) out.push(`<p><strong>Cost:</strong> ${escHtml(cost)}</p>`);
	const gear = (Array.isArray(follower.gear) ? follower.gear : [])
		.filter(g => (typeof g === "string" ? true : !!g?.checked))
		.map(g => (typeof g === "string" ? g : g.label))
		.map(l => String(l ?? "").replace(/<[^>]*>/g, "").trim())
		.filter(Boolean);
	if (gear.length) out.push(`<p><strong>Gear:</strong> ${escHtml(gear.join(", "))}</p>`);
	out.push(..._paragraphs(follower.notes));
	return out.join("");
}

/**
 * Split a follower's display name into the name they're called and the epithet trailing
 * it. Several followers are written as a name plus a descriptive tail — the Blessed's
 * initiates of Danu are printed exactly that way ("Enfys, your acolyte, beloved by
 * birds") — which reads well on the follower card, where it's set on stacked lines, and
 * badly as an Actor's name, where it becomes a title bar and a token label.
 *
 * The first comma is the seam: what precedes it is the name, everything after it is
 * descriptive and belongs in the NPC's own `traits` field, which prints right below the
 * name in the sheet header. A name with no comma is left whole, and a string that opens
 * with a comma is treated as having no name to lift out rather than yielding an empty one.
 *
 * @returns {{name: string, traits: string}}
 */
export function splitFollowerName(fullName) {
	const full = String(fullName ?? "").trim();
	const comma = full.indexOf(",");
	if (comma < 0) return { name: full, traits: "" };
	const name = full.slice(0, comma).trim();
	if (!name) return { name: full, traits: "" };
	return { name, traits: full.slice(comma + 1).trim().replace(/^[,\s]+|[,\s]+$/g, "") };
}

/**
 * Actor creation data for one follower snapshot (see the character sheet's
 * `_followerDragSnapshot`, which is the only writer of that shape).
 *
 * `hasStats` is always true: a follower is by definition someone who "regularly acts on a
 * PC's orders" (p.459), which is exactly the case the NPC sheet's optional stat block
 * exists for — and the card has real numbers to put in it.
 *
 * The token is FRIENDLY (they follow a PC) and shows its name on hover, matching what
 * StonetopActor#_preCreate gives every other NPC. A group follower — a crew, a warband, a
 * summoned batch — is left UNLINKED so its several tokens each track their own HP against
 * the shared max, the way the card's roster does; a single follower is linked, so the one
 * token and the one actor stay the same creature.
 *
 * No art is invented. A follower with a portrait wears it; one without gets the same
 * category mark their card shows as a glyph (see followerMarkerImg) rather than Foundry's
 * mystery-man silhouette — a symbol for what kind of thing they are, never a picture of
 * this particular follower.
 */
export function followerNpcActorData(follower = {}, { folder = null, origin = null } = {}) {
	// "Enfys, your acolyte, beloved by birds" is a card heading, not a name: the epithet
	// comes off and lands in `traits`, where the NPC sheet prints it under the name.
	const split = splitFollowerName(follower.name);
	const name  = split.name || "Follower";
	const own   = String(follower.img ?? "").trim();
	const img   = own && !isDefaultImg(own) ? own : followerMarkerImg(follower.portraitIcon);
	const hpMax = Math.max(0, Math.trunc(Number(follower.hp?.max) || 0));
	const hpValue = follower.hp?.value == null
		? hpMax
		: Math.min(hpMax, Math.max(0, Math.trunc(Number(follower.hp.value) || 0)));
	const moves = (Array.isArray(follower.moves) ? follower.moves : [])
		.map(m => String(m ?? "").trim())
		.filter(Boolean);

	const data = {
		name,
		type: "npc",
		folder,
		system: {
			pronouns:   String(follower.pronoun ?? "").trim(),
			// The card's type line ("animal companion", "group follower") is this NPC's lot
			// in life — the same slot the steading's people use for "farmer, ex-mercenary".
			occupation: String(follower.typeLabel ?? "").trim(),
			// The epithet the name was carrying ("your acolyte, beloved by birds"), which is
			// precisely what this field is for — the memorable descriptors that print beside
			// the name rather than inside it.
			traits:     split.traits,
			instinct:   String(follower.instinct ?? "").trim(),
			tags:       normalizeTags(follower.tags).join(", "),
			hasStats:   true,
			attributes: {
				hp:     { value: hpValue, max: hpMax },
				armor:  {
					value:  parseFollowerArmor(follower.armor),
					source: String(follower.armorSource ?? "").trim(),
				},
				damage: {
					value:       String(follower.damage ?? "").trim(),
					// The card's rollable die, so the NPC sheet's damage roll works straight away.
					rollFormula: String(follower.damageRoll ?? "").trim(),
				},
			},
			notes: followerNotesHtml(follower),
		},
		// A follower's moves become GM moves, the same `npcMove` items NpcToFollowerDialog
		// reads back when an NPC is recruited — so the round trip loses nothing.
		items: moves.map(m => ({ name: m, type: "npcMove" })),
		prototypeToken: {
			name,
			displayName: _const("TOKEN_DISPLAY_MODES", "HOVER", 30),
			disposition: _const("TOKEN_DISPOSITIONS", "FRIENDLY", 1),
			actorLink:   !follower.isGroup,
		},
		flags: {
			[SYSTEM_ID]: {
				// Provenance: which character's follower card this actor was made from
				// ({characterUuid, ftype, slug}). Nothing reads it back today — it's here so a
				// GM tidying the sidebar can tell where an actor came from, and so a future
				// sync has the link it would need.
				followerOrigin: origin ?? null,
			},
		},
	};
	if (img) {
		data.img = img;
		data.prototypeToken.texture = { src: img };
		// Carry the chosen face across, but ONLY when the follower's own portrait survived the
		// placeholder check above: if `img` fell back to the type's marker disc, a rect measured
		// against a picture this actor no longer wears is dead weight. The stamp would neutralise
		// it anyway; not writing it is simply honest.
		if (own && !isDefaultImg(own) && follower.portraitFrame) {
			data.flags[SYSTEM_ID].portraitFrame = follower.portraitFrame;
		}
	}
	return data;
}
