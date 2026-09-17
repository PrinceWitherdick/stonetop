// "What the book says about fights": Book I's advice on fights as a whole, in its own words, in a
// window of its own. Opened from the Fight tab's header (templates/sidebar/fight-header.hbs).
//
// WHY A WINDOW. These passages hold for every fight, whoever is in it, and used to sit folded at the
// foot of the tab. Opened, they made a column that is already as tall as the fight is big taller
// still. The passages that speak to ONE engagement, or to the foes nobody has engaged, stay folded
// beside what they describe.
//
// ONE PER READER. Pressing the button again brings the open window forward rather than stacking a
// second copy of the same three paragraphs.

import { StonetopDialog } from "../utils/stonetop-dialog.js";
import { fightBookView } from "./fight-view.js";
import { bookPageCites } from "../gm-toolkit/book-ref.js";
import { wireBookCites } from "../books/rulebook-icons.js";
import { localize } from "../utils/i18n.js";
import { openOrFocus } from "../utils/open-or-focus.js";

export class FightBookWindow extends StonetopDialog {
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-fight-book",
			template:  "systems/stonetop-pwd/templates/dialogs/fight-book.hbs",
			width:     380,
			height:    "auto",
			resizable: true,
			classes:   ["stonetop", "stonetop-fight-book-window"],
		});
	}

	get title() {
		return localize("stonetop.fight.book.title");
	}

	getData() {
		return fightBookView({ isGM: !!globalThis.game?.user?.isGM, cites: bookPageCites });
	}

	activateListeners(html) {
		super.activateListeners(html);
		// Citations open the GM's copy of the book at that page.
		wireBookCites(html?.[0] ?? html);
	}
}

/** Open the window, or bring it forward (and back up from minimized) when it is open already. */
export function openFightBook() {
	return openOrFocus("stonetop-fight-book", () => new FightBookWindow().render(true));
}
