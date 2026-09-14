import { describe, expect, it } from "vitest";
import { readRepo, stripComments } from "../fakes/css.js";
import { seat } from "../fakes/camp.js";
import { CAMP_STATE, campLedger } from "../../module/camp/camp-rules.js";
import { campWindowView } from "../../module/camp/camp-view.js";

/**
 * The shared camp window's template, rendered for real (tests/setup.js#renderTemplate) over the
 * view camp-view.js builds, so what is asserted is the markup that ships.
 */

const TEMPLATE = "systems/stonetop-pwd/templates/dialogs/make-camp.hbs";

const aeliana = (over = {}) => seat({ id: "aeliana", name: "Aeliana", isHost: true, joinedAt: 1, ...over });
const bram    = (over = {}) => seat({ id: "bram", name: "Bram", joinedAt: 2, carried: { provisions: 2 }, ...over });

function render(members, over = {}) {
	return renderTemplate(TEMPLATE, campWindowView({
		state: CAMP_STATE.OPEN, hostName: "Aeliana", ledger: campLedger(members), manages: true,
		editable: ["aeliana"], mine: ["aeliana"], ...over,
	}));
}

/** One row's markup, found by the actor id stamped on its `<li>`, and cut at its own `</li>`. */
function row(html, actorId) {
	const chunk = html.split('<li class="stonetop-camp-row').slice(1).find(c => c.includes(`" data-actor-id="${actorId}">`)) ?? "";
	return chunk.slice(0, chunk.indexOf("</li>"));
}

describe("the camp window's template", () => {
	it("draws steppers a screen reader can name on the rows the reader can change", async () => {
		const html = await render([aeliana(), bram()]);
		expect(row(html, "aeliana")).toContain('data-camp-action="offer-add"');
		expect(row(html, "aeliana")).toContain('aria-label="Share one more use of Supplies"');
		expect(row(html, "aeliana")).toContain('aria-label="Take back one use of Supplies"');
	});

	it("draws everyone else's row as sentences, with nothing to press", async () => {
		const bramsRow = row(await render([aeliana(), bram()]), "bram");
		expect(bramsRow).not.toContain("data-camp-action");
		expect(bramsRow).not.toContain("<input");
		expect(bramsRow).toContain("Sharing no food yet.");
	});

	it("switches off sharing more once the meal is paid for", async () => {
		const html = await render([aeliana({ choices: { offer: { supplies: 1 } } })]);
		expect(row(html, "aeliana")).toMatch(/data-camp-action="offer-add"[^>]*disabled/);
		expect(row(html, "aeliana")).not.toMatch(/data-camp-action="offer-take"[^>]*disabled/);
	});

	it("gives every row its own night radios", async () => {
		const html = await render([aeliana(), bram()], { editable: ["aeliana", "bram"] });
		expect(row(html, "aeliana")).toContain('name="campBenefit-aeliana"');
		expect(row(html, "bram")).toContain('name="campBenefit-bram"');
	});

	// Affirmative on the left, dismissive on the right, like every Stonetop window.
	it("puts Make Camp before Break up the camp, and holds it while the meal is short", async () => {
		const html = await render([aeliana()]);
		expect(html.indexOf('data-camp-action="settle"')).toBeLessThan(html.indexOf('data-camp-action="break"'));
		expect(html).toMatch(/data-camp-action="settle"[^>]*disabled/);
	});

	it("gives a player who cannot settle the camp a sentence instead of its buttons", async () => {
		const html = await render([aeliana(), bram()], { manages: false, editable: ["bram"], mine: ["bram"] });
		expect(html).not.toContain('data-camp-action="settle"');
		expect(html).not.toContain('data-camp-action="break"');
		expect(html).toContain("Aeliana makes camp once everyone is ready.");
	});

	it("says how a camp ended instead of drawing its rows", async () => {
		const html = await render([aeliana()], { state: CAMP_STATE.CANCELLED });
		expect(html).not.toContain('<li class="stonetop-camp-row');
		// Handlebars escapes the apostrophe, so the name is matched apart from it.
		expect(html).toContain("camp broke up before anyone ate.");
	});
});

// The user reads every one of these words, and em dashes read as machine-written to them.
describe("the camp's words", () => {
	it("use no em dashes", () => {
		for (const rel of ["module/camp/camp-view.js", "module/camp/camp-flow.js", "module/camp/CampWindow.js", "templates/dialogs/make-camp.hbs"]) {
			expect(stripComments(readRepo(rel)), rel).not.toContain("—");
		}
	});
});
