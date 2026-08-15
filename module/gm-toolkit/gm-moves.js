// The GM's move lists, transcribed from the GM playbook's first spread ("GM moves",
// "Exploration", "Homefront") and glossed from Book I "Running the Game" (pp. 178-188)
// and "Homefront" (pp. 502-507). Both ranges name the pages the GLOSSES come from, not just
// where the bullet list is printed: the per-move descriptions run well past the list itself.
//
// Reference only. Nothing here rolls, nothing here is stored on the actor: a GM move is
// something you say, not something the sheet resolves, and the playbook prints these as a
// list you glance at mid-sentence. The one-line gloss under each name is the house shape
// the Expedition dialog's exploration list already uses (module/dialogs/ExpeditionDialog.js).
// The exploration glosses ARE that list, word for word, differing only in the leading capital
// (the dialog's run on from an inline dash; these stand alone). A test pins the two together,
// so the same move cannot come to mean two different things on two screens.
//
// Order is the playbook's, not alphabetical. The book's order is a rough ladder from the
// softest move to the hardest, and a GM scanning for "what now?" reads it top-down.

/**
 * @typedef {object} GmMove
 * @property {string} name   The move, worded exactly as the playbook prints it.
 * @property {string} gloss  One line on what making it looks like at the table.
 */

/** The basic list, usable at any moment of play (GM playbook p.1; Book I p.178). */
export const BASIC_GM_MOVES = [
	{ name: "Announce trouble (future or offscreen)", gloss: "Trouble coming, or happening elsewhere. One of your most versatile." },
	{ name: "Reveal an unwelcome truth",              gloss: "Establish something as true that they really wish wasn't." },
	{ name: "Ask a provocative question",             gloss: "Spur a decision or a reaction, even if the reaction is only a feeling." },
	{ name: "Put someone in a spot",                  gloss: "Announce trouble, but sharper: do something now, or it gets ugly." },
	{ name: "Use up their resources",                 gloss: "Whittle away at their gear, supplies, standing, or HP." },
	{ name: "Turn their move back on them",           gloss: "Take the move they just made and flip it against them." },
	{ name: "Demonstrate a downside",                 gloss: "Show the limits of their moves, or the baggage of being who they are." },
	{ name: "Hurt someone",                           gloss: "A specific, problematic wound on a PC or on someone they care about." },
	{ name: "Separate them",                          gloss: "Split the party. Put foes, distance, or a long fall between them." },
	{ name: "Capture someone",                        gloss: "Soft: taken, but still in the scene. Hard: cut to bound and dragged off." },
	{ name: "Offer an opportunity (with or without a cost)", gloss: "An opening to act, free, priced, or maybe priced." },
	{ name: "Tell them the consequences/requirements (then ask)", gloss: "Interrupt to set the stakes. \"If you do that, you realize ___, right?\"" },
	{ name: "Advance towards impending doom",         gloss: "A grim portent of a threat or a hazard comes to pass." },
];

/**
 * Exploration moves, for an expedition or a site (GM playbook p.1; Book I pp. 317, 352).
 *
 * The Expedition walkthrough's "Exploration moves" step RENDERS this list rather than
 * restating it (see ExpeditionDialog's `EXPLORATION_MOVE_LIST`), so the two surfaces cannot
 * teach the same move in different words. Reword one here and both screens change together.
 */
export const EXPLORATION_GM_MOVES = [
	{ name: "Provide a choice of paths",            gloss: "A fork with a meaningful difference." },
	{ name: "Hint at more than meets the eye",      gloss: "Point at something fraught, stay coy." },
	{ name: "Offer riches at a price",              gloss: "Something valuable, but costly or fleeting." },
	{ name: "Present a discovery",                  gloss: "Put an interesting, not-yet-dangerous thing in front of them." },
	{ name: "Point to a looming danger",            gloss: "The clawprint, the distant howl." },
	{ name: "Introduce a danger, person, or faction", gloss: "It's here, not looming." },
	{ name: "Bar the way",                          gloss: "An obstacle, dead end, or missing piece." },
];

/** Homefront moves, for time spent in Stonetop or another steading (GM playbook p.1; Book I p.502). */
export const HOMEFRONT_GM_MOVES = [
	{ name: "Introduce someone interesting",     gloss: "A stranger, someone out of a PC's past, or a local we've not met yet." },
	{ name: "Reveal simmering tensions",         gloss: "Set up a future conflict. Rivalry, attraction and crossed wires all count." },
	{ name: "Present a want or need",            gloss: "Someone asks for help, plainly needs it, or arrives making demands." },
	{ name: "Show how others really feel",       gloss: "Reveal an NPC's inner life in a way that provokes a response." },
	{ name: "Draw out their feelings",           gloss: "An NPC invites a PC to open up, or simply shows them kindness." },
	{ name: "Change a relationship",             gloss: "A friendship lost, a peer turned rival, a couple calling it quits." },
	{ name: "Oppose their wishes",               gloss: "NPCs object, get in the way, or have to be talked round." },
	{ name: "Remind them of their obligations",  gloss: "Name what is expected of them, and what happens if they duck it." },
	{ name: "Start a conflict or crisis",        gloss: "Bring the simmer to a boil, or let the granary collapse." },
	{ name: "Play them against each other",      gloss: "A triangle between two PCs and an NPC." },
];

/**
 * The Moves tab, section by section, in the order the playbook prints them.
 *
 * Each section is its own box in the template. That is not tidiness: the fold walk claims a
 * heading's FOLLOWING SIBLINGS until it meets the next heading (utils/section-editing.js
 * `_sectionFoldTargets`), so three headings in one flat run would let the first caret swallow
 * the two below it.
 *
 * `collapseId` is what the fold state is remembered under, per user and per sheet.
 *
 * A module-level constant rather than a per-call literal: nothing in it varies (every field is
 * either a constant above or an i18n KEY — localization happens at the sheet boundary), so
 * rebuilding it per render and twice per randomizer click bought nothing. Frozen so a caller
 * that treats a shared table as scratch space fails loudly rather than corrupting every later
 * read.
 *
 * @type {ReadonlyArray<{key: string, titleKey: string, noteKey: string, collapseId: string, moves: GmMove[]}>}
 */
export const GM_MOVE_SECTIONS = Object.freeze([
	{
		key:        "basic",
		titleKey:   "stonetop.gmToolkit.moves.basic",
		noteKey:    "stonetop.gmToolkit.moves.basicNote",
		collapseId: "gmMovesBasic",
		moves:      BASIC_GM_MOVES,
	},
	{
		key:        "exploration",
		titleKey:   "stonetop.gmToolkit.moves.exploration",
		noteKey:    "stonetop.gmToolkit.moves.explorationNote",
		collapseId: "gmMovesExploration",
		moves:      EXPLORATION_GM_MOVES,
	},
	{
		key:        "homefront",
		titleKey:   "stonetop.gmToolkit.moves.homefront",
		noteKey:    "stonetop.gmToolkit.moves.homefrontNote",
		collapseId: "gmMovesHomefront",
		moves:      HOMEFRONT_GM_MOVES,
	},
]);

/** @returns {ReadonlyArray} The sections, in the order the playbook prints them. */
export function gmMoveSections() {
	return GM_MOVE_SECTIONS;
}

/**
 * One section by key, or undefined for an unknown one.
 * @param {string} key  "basic" | "exploration" | "homefront"
 */
export function gmMoveSection(key) {
	return GM_MOVE_SECTIONS.find(s => s.key === key);
}
