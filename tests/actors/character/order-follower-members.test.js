import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture what the Order dialog is handed, without drawing it.
const opened = [];
vi.mock("../../../module/actors/character/dialogs/OrderFollowersDialog.js", () => ({
	OrderFollowersDialog: class {
		static defaultOptions = { classes: ["stonetop"] };
		constructor(actor, follower, onRoll) { opened.push({ actor, follower, onRoll }); }
		render() { return this; }
	},
}));

import fs from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import { createStonetopCharacterSheetClass } from "../../../module/actors/character/StonetopCharacterSheet.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";

/**
 * The character sheet's `orderFollower`, the one door every Order goes through (the Followers tab's
 * buttons and a follower's token on the map), hands a GROUP's members to the dialog, so one of them can
 * be directed on their own: "When a PC directs an individual member of a group, they can trigger moves as
 * if they were a follower themselves" (Book I p.471). That is how Glaw Lets Fly while the rest of the
 * crew Clashes. An order that already names a member (a crew individual's own button) is left alone.
 */

function makeSheet(flags = {}) {
	const actor = new FakeActorBuilder().withFlags(flags).build();
	actor.id = "rhianna";
	actor.isOwner = true;
	actor.typedActor = { onOrderFollowersRoll: vi.fn(async () => ({ total: 8 })) };
	const Base = class {
		constructor() { this._actor = actor; }
		get actor() { return this._actor; }
		get isEditable() { return true; }
		async getData() { return {}; }
		activateListeners() {}
		render = vi.fn();
	};
	const Sheet = createStonetopCharacterSheetClass(Base);
	return { sheet: new Sheet(), actor };
}

const crewFlags = {
	crew: {
		name: "The Crew", size: 3,
		individuals: [{ name: "Glaw", tag: "small", traits: ["too serious"] }],
		individualsHp: {}, memberHp: [5, 0],
	},
};

beforeEach(() => { opened.length = 0; });

describe("orderFollower", () => {
	it("offers a crew ordered as a whole each member still standing, with their own tags", async () => {
		const { sheet } = makeSheet(crewFlags);
		await sheet.orderFollower({ name: "The Crew", tags: ["archers"], moves: [], exceptional: false, moveKey: "clash" }, { ftype: "crew", slug: "" });
		expect(opened).toHaveLength(1);
		expect(opened[0].follower).toMatchObject({
			name: "The Crew", tags: ["archers"], moveKey: "clash",
			members: [
				{ key: "named:0", name: "Glaw", tags: ["small", "too serious"] },
				{ key: "anon:0", name: "Crew member 2", tags: [] },
			],
		});
	});

	it("offers no members when the order already names one (a crew individual's own button)", async () => {
		const { sheet } = makeSheet(crewFlags);
		await sheet.orderFollower({ name: "Glaw", tags: ["archers", "small"], member: "Glaw" }, { ftype: "crew", slug: "" });
		expect(opened[0].follower.members).toBeUndefined();
	});

	it("offers no members for a follower who is one person", async () => {
		const { sheet } = makeSheet({ initiateDetails: { enfys: {} } });
		await sheet.orderFollower({ name: "Enfys", tags: ["brave"] }, { ftype: "initiate", slug: "enfys" });
		expect(opened[0].follower.members).toBeUndefined();
	});

	it("offers a custom group's members too", async () => {
		const { sheet } = makeSheet({ customFollowers: { posse: { name: "The Posse", isGroup: true, size: 2 } } });
		await sheet.orderFollower({ name: "The Posse", tags: [] }, { ftype: "custom", slug: "posse" });
		expect(opened[0].follower.members.map(m => m.name)).toEqual(["Member 1", "Member 2"]);
	});

	it("is told by a crew individual's own button that the order is theirs, and by no other button", () => {
		// The Followers tab's real Order-button partial, rendered the two ways the tab calls it.
		const source = fs.readFileSync(path.resolve(import.meta.dirname, "../../../templates/actor/partials/tab-followers.hbs"), "utf8");
		const inline = /\{\{#\*inline "stonetopOrderButton"\}\}[\s\S]*?\{\{\/inline\}\}/.exec(source)?.[0];
		expect(inline).toBeTruthy();
		const render = Handlebars.compile(`${inline}{{> stonetopOrderButton ftype="crew" slug="" moveKey="clash" caption="Clash"}}`
			+ `{{#each individuals}}{{> stonetopOrderButton ftype="crew" slug="" member=orderName caption="Order"}}{{/each}}`);
		const html = render({ orderName: "The Crew", orderTagsCsv: "archers", individuals: [{ orderName: "Glaw", orderTagsCsv: "archers|small" }] });
		const buttons = html.match(/<button[\s\S]*?>/g);
		expect(buttons).toHaveLength(2);
		expect(buttons[0]).not.toContain("data-member");
		expect(buttons[1]).toContain('data-member="Glaw"');
	});

	it("rolls whatever the dialog decides as the character's own Order Followers roll", async () => {
		const { sheet, actor } = makeSheet(crewFlags);
		await sheet.orderFollower({ name: "The Crew", tags: ["archers"] }, { ftype: "crew", slug: "" });
		const result = { bonus: 1, rollMode: "normal", moveName: "Glaw: Let Fly", moveKey: "let-fly", followerName: "Glaw", member: "named:0" };
		await opened[0].onRoll(result);
		expect(actor.typedActor.onOrderFollowersRoll).toHaveBeenCalledWith(result);
	});
});
