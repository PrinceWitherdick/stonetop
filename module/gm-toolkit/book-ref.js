// "Book I, page 180" — where to go and read the whole entry.
//
// Its own module rather than a private line in either place that prints it, because the same
// citation is shown on two surfaces (the sheet's expanded entry and the whispered chat card) for
// the same move, and by three catalogs (the moves, the agenda, the principles). Written twice, it
// would be formatted two ways within a session of the same GM's reading.
//
// The page lives on the DATA (`gm-moves.js`, `gm-agenda.js`), which is the only place that knows
// which page it came off. This module only knows how to say it.
import { format } from "../utils/i18n.js";

/**
 * @param   {{page?: number, pageAlt?: number}} entry  Anything transcribed out of Book I.
 * @returns {string}  Empty for an entry with no page, so a caller can print it unconditionally.
 */
export function bookPageRef(entry) {
	if (!entry?.page) return "";
	// A second printing, which only the exploration moves have: the sites chapter re-frames the
	// same seven for a dungeon rather than a journey, and a GM reading one wants to know the
	// other exists.
	return entry.pageAlt
		? format("stonetop.gmToolkit.moves.bookPageAlt", { page: entry.page, alt: entry.pageAlt })
		: format("stonetop.gmToolkit.moves.bookPage", { page: entry.page });
}
