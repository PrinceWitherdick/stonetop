import { isDefaultImg } from "./strings.js";

/**
 * The stand-in art for a document with none of its own. All three markers are the same dark
 * octagon token (#141210 / #f0ece3) so a directory of fallbacks reads as one set.
 *
 * Each is a CATEGORY marker, never a fabricated picture of any one thing, so it can head
 * anything un-illustrated without inventing what that thing looks like. `object` is the
 * book's vase-in-octagon "treasure" symbol — also what the journal treasure cells use (see
 * utils/treasure-drops.js), which is why it still lives under `icons/treasures/`. `arcanum`
 * is the triple spiral the books stamp beside an arcanum (Book II p.545).
 */
export const STONETOP_ITEM_ICONS = Object.freeze({
	move:    "systems/stonetop-pwd/assets/icons/move.svg",
	arcanum: "systems/stonetop-pwd/assets/icons/arcanum.svg",
	object:  "systems/stonetop-pwd/assets/icons/treasures/vase.svg",
});

/** Item sub-types that are nothing but moves, whatever their `moveType` says. */
const MOVE_SUBTYPES = new Set(["npcMove", "monsterMove"]);

/**
 * `move` is Stonetop's catch-all Item sub-type — gear, arcana and playbook moves are all
 * stored under it — so `system.moveType` is what actually decides. These are THINGS a
 * character owns rather than moves they trigger; every other moveType (basic, playbook,
 * expedition, homefront, post-death, special, follower, other) is a move. Denylisted rather
 * than allowlisted on purpose: a moveType added later is a move until someone says otherwise,
 * which matches what the sub-type name promises.
 */
const THING_MOVE_TYPES = Object.freeze({ inventory: "object", arcanum: "arcanum" });

/** Which marker fits `item` — the key into {@link STONETOP_ITEM_ICONS}. */
function markerFor(item) {
	if (MOVE_SUBTYPES.has(item?.type)) return "move";
	if (item?.type !== "move") return "object";
	return THING_MOVE_TYPES[item?.system?.moveType] ?? "move";
}

/**
 * The thumbnail to show for `item`: its own art when it has any, else the marker that fits
 * what it is. Foundry's stock `item-bag.svg` makes a directory of art-less items read as one
 * repeated bag glyph; these at least tell a move from a thing from an arcanum at a glance.
 *
 * Display only. Nothing writes the result back, so an item keeps whatever `img` it stores
 * and shows real art the moment it gains some, with no migration. Takes anything shaped like
 * an Item (`img`, `type`, `system.moveType`) so it stays testable without a Foundry document.
 */
export function stonetopThumbnail(item) {
	if (!isDefaultImg(item?.img)) return item.img;
	return STONETOP_ITEM_ICONS[markerFor(item)];
}
