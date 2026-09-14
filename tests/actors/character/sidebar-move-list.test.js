import { describe, expect, it } from "vitest";
import Handlebars from "handlebars";
import { readRepo } from "../../fakes/css.js";

/**
 * The character sheet's sidebar move lists (templates/actor/partials/sidebar-move-list.hbs).
 *
 * The one thing worth guarding here is the class each row's name carries. The sheet decides that a
 * tap on "Make Camp", "Requisition" or "Outfit" opens that move's own window by looking for
 * `stonetop-expedition-move-open` on the name (StonetopCharacterSheet#_openExpeditionMoveDoor), and
 * the partial is handed that class as a parameter. Read bare inside the `each`, the parameter is
 * looked up on each MOVE, finds nothing, and renders empty, because Foundry compiles templates
 * without Handlebars' compat mode. Compiled the same way here, so the test fails the way the sheet did.
 */

function render(context) {
	const hb = Handlebars.create();
	hb.registerPartial("stonetop.section-heading", "<h3>{{title}}</h3>");
	hb.registerHelper("and", (a, b) => a && b);
	hb.registerHelper("localize", key => String(key));
	hb.registerHelper("moveBody", () => "");
	return hb.compile(readRepo("templates/actor/partials/sidebar-move-list.hbs"), { preventIndent: true })(context);
}

const moves = [
	{ name: "Make Camp", owned: false, rollType: null, compendiumId: "mc" },
	{ name: "Forage", owned: true, rollType: "wis", ownedId: "fo", compendiumId: "fg", rollLabel: "WIS" },
];

describe("the sidebar move list", () => {
	it("puts the list's own class on every row's name, so the sheet can tell which door to open", () => {
		const html = render({ moves, titleKey: "x", openClass: "stonetop-expedition-move-open", sectionId: "expeditionMoves", open: true });
		const names = [...html.matchAll(/<span class="(stonetop-move-name[^"]*)"/g)].map(m => m[1]);
		expect(names).toHaveLength(2);
		for (const cls of names) expect(cls.split(/\s+/)).toContain("stonetop-expedition-move-open");
	});

	it("keeps a rollable row rollable beside that class", () => {
		const html = render({ moves, titleKey: "x", openClass: "stonetop-expedition-move-open", sectionId: "expeditionMoves", open: true });
		expect(html).toMatch(/class="stonetop-move-name stonetop-expedition-move-open rollable move-rollable"[^>]*data-roll="wis"/);
	});
});
