// Up With People (the Would-Be Hero): the hero's 2 Rapport and the partner's 1 are stored APART (the user's
// ruling). A PC partner holds theirs on their own sheet (flag `rapport`, written through the GM's client when
// the hero's player does not own them); an NPC's is a "theirs" pip on the hero's card. A new conversation
// replaces the last on both sides, and every spend posts the four questions.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	CONVERSATION_FLAG, RAPPORT_FLAG, RAPPORT_MAX, SOMEONE_ELSE, UP_WITH_PEOPLE, UP_WITH_PEOPLE_QUERY, rapportQuestions,
	afterHeroPip, conversationOf, conversationPartners, converse, handleUpWithPeopleQuery, rapportChips, rapportHeld,
	rapportHeldWith, shippedRapportTrack, spendPartnerRapport, toggleNpcRapport, upWithPeopleCard,
} from "../../../module/actors/character/up-with-people.js";
import { MoveResourceButton } from "../../../module/actors/character/elements/move-resource-button.js";
import { buildLiveCharacter, makeLiveItem } from "../../fakes/LiveCharacter.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";
import { TestCharacterBuilder } from "../../fakes/TestCharacterBuilder.js";
import { readRepo } from "../../fakes/css.js";
import { SYSTEM_ID } from "../../../module/system-id.js";

const SCOPE = SYSTEM_ID;
const UWP_TRACK = { max: 2, title: "Rapport", spendOptions: rapportQuestions() };

/** A Would-Be Hero with Up With People learned, holding `rapport` on its track. */
function hero({ rapport = 0, id = "wren", track = UWP_TRACK } = {}) {
	const flags = rapport ? { "moves.backgroundChoices": { [UP_WITH_PEOPLE]: rapport } } : {};
	const { actor, char } = buildLiveCharacter({
		slug: "the-would-be-hero", name: "The Would-Be Hero", flags,
		items: [makeLiveItem({ name: UP_WITH_PEOPLE, type: "move", system: { moveType: "playbook", resource: track } })],
	});
	actor.id = id;
	actor.name = "Wren";
	actor.uuid = `Actor.${id}`;
	actor.isOwner = true;
	return { actor, char };
}

/** Another PC, owned by this client or not. */
function pc({ id = "aeron", name = "Aeron", owned = true } = {}) {
	const { actor } = buildLiveCharacter({ slug: "the-heavy", name: "The Heavy" });
	actor.id = id;
	actor.name = name;
	actor.uuid = `Actor.${id}`;
	actor.isOwner = owned;
	return actor;
}

const npc = (id = "maeve", name = "Maeve") => ({ id, name, uuid: `Actor.${id}`, type: "npc", visible: true });

/** A fake actors collection over these actors. */
const world = (...actors) => ({ contents: actors, get: id => actors.find(a => a.id === id) });

let saved;
let posted;
beforeEach(() => {
	saved = { ChatMessage: globalThis.ChatMessage, user: globalThis.game.user, users: globalThis.game.users, actors: globalThis.game.actors };
	posted = [];
	globalThis.ChatMessage = {
		create: vi.fn(async data => { posted.push(data); return data; }),
		getSpeaker: ({ actor }) => ({ actor: actor?.id, alias: actor?.name }),
	};
	globalThis.game.user = { id: "u-wren", isGM: false };
});
afterEach(() => {
	globalThis.ChatMessage = saved.ChatMessage;
	globalThis.game.user = saved.user;
	globalThis.game.users = saved.users;
	globalThis.game.actors = saved.actors;
});

const lastCard = () => posted.at(-1)?.content ?? "";
const asksAllFour = html => rapportQuestions().every(q => html.includes(q.replace("'", "&#39;")) || html.includes(q));

describe("conversing", () => {
	it("with a PC: the hero holds 2, the PC holds 1 on their own sheet, and a card names both with the questions", async () => {
		const { actor } = hero();
		const aeron = pc();
		const done = await converse(actor, { actor: aeron, name: aeron.name }, { actors: world(actor, aeron) });
		expect(done).toEqual({ name: "Aeron", pc: true, missed: false, releaseMissed: false });
		expect(rapportHeld(actor)).toBe(2);
		expect(conversationOf(actor)).toMatchObject({ id: "aeron", name: "Aeron", pc: true, theirs: 0 });
		expect(rapportHeldWith(aeron)).toEqual([{ heroId: "wren", name: "Wren", uuid: "Actor.wren" }]);
		expect(lastCard()).toContain("Wren converses with Aeron");
		expect(asksAllFour(lastCard())).toBe(true);
		expect(posted[0].speaker.actor).toBe("wren");
	});

	it("with an NPC: their 1 is a \"theirs\" pip on the hero's card, stored apart from the hero's 2", async () => {
		const { actor } = hero();
		const maeve = npc();
		expect(await converse(actor, { actor: maeve, name: maeve.name }, { actors: world(actor) })).toEqual({ name: "Maeve", pc: false, missed: false, releaseMissed: false });
		expect(rapportHeld(actor)).toBe(2);
		expect(conversationOf(actor)).toMatchObject({ id: "maeve", name: "Maeve", pc: false, theirs: 1 });
		expect(lastCard()).toContain("Wren converses with Maeve");
	});

	it("with somebody who has no sheet, named by hand", async () => {
		const { actor } = hero();
		expect(await converse(actor, { name: "  the innkeeper " }, { actors: world(actor) })).toMatchObject({ name: "the innkeeper", pc: false });
		expect(conversationOf(actor)).toMatchObject({ id: null, name: "the innkeeper", theirs: 1 });
	});

	it("does nothing without the move learned, with nobody named, or with themselves", async () => {
		const { actor } = hero();
		expect(await converse(actor, { actor, name: "Wren" })).toBeNull();
		expect(await converse(actor, { name: "" })).toBeNull();
		const { actor: heavy } = buildLiveCharacter({ slug: "the-heavy", name: "The Heavy" });
		expect(await converse(heavy, { name: "Maeve" })).toBeNull();
		expect(posted).toHaveLength(0);
	});

	it("a new conversation replaces the last on both sides: the old PC lets go, the hero holds 2 again", async () => {
		const { actor, char } = hero();
		const aeron = pc();
		const actors = world(actor, aeron);
		await converse(actor, { actor: aeron }, { actors });
		await char.moveResources.setUses(UP_WITH_PEOPLE, 0);
		await converse(actor, { actor: npc() }, { actors });
		expect(rapportHeldWith(aeron)).toEqual([]);
		expect(rapportHeld(actor)).toBe(2);
		expect(conversationOf(actor)).toMatchObject({ name: "Maeve", theirs: 1 });
		// And back to a PC: the NPC's pip is gone with its conversation.
		await converse(actor, { actor: aeron }, { actors });
		expect(conversationOf(actor)).toMatchObject({ name: "Aeron", pc: true, theirs: 0 });
		expect(rapportHeldWith(aeron)).toHaveLength(1);
	});

	it("talking with the same PC again holds their 1 again, never 2", async () => {
		const { actor } = hero();
		const aeron = pc();
		const actors = world(actor, aeron);
		await converse(actor, { actor: aeron }, { actors });
		await spendPartnerRapport(aeron, "wren");
		await converse(actor, { actor: aeron }, { actors });
		expect(rapportHeldWith(aeron)).toHaveLength(1);
	});
});

describe("the two holds are stored apart", () => {
	it("spending one of the hero's own pips keeps an NPC's theirs, and posts the four questions", async () => {
		const { actor, char } = hero();
		await converse(actor, { actor: npc() }, { actors: world(actor) });
		const before = rapportHeld(actor);
		// A click on the second (ticked) pip, as the sheet's track handler makes it.
		const pip = { dataset: { moveName: UP_WITH_PEOPLE, index: "1" }, classList: { contains: cls => cls === "is-checked" } };
		await char.moveResources.add(new MoveResourceButton({ currentTarget: pip }));
		expect(await afterHeroPip(actor, before)).toBe(true);
		expect(rapportHeld(actor)).toBe(1);
		expect(conversationOf(actor).theirs).toBe(1);
		expect(lastCard()).toContain("Wren spends 1 Rapport to ask Maeve (1 left):");
		expect(asksAllFour(lastCard())).toBe(true);
	});

	it("spending the hero's pips never touches a PC partner's Rapport", async () => {
		const { actor, char } = hero();
		const aeron = pc();
		await converse(actor, { actor: aeron }, { actors: world(actor, aeron) });
		await char.moveResources.setUses(UP_WITH_PEOPLE, 0);
		expect(await afterHeroPip(actor, 2)).toBe(true);
		expect(rapportHeldWith(aeron)).toHaveLength(1);
	});

	it("ticking a pip back on posts nothing", async () => {
		const { actor, char } = hero({ rapport: 1 });
		await char.moveResources.setUses(UP_WITH_PEOPLE, 2);
		expect(await afterHeroPip(actor, 1)).toBe(false);
		expect(posted).toHaveLength(0);
	});

	it("the NPC's pip, pressed: spent with the questions asked of the hero, pressed again to tick it back", async () => {
		const { actor } = hero();
		await converse(actor, { actor: npc() }, { actors: world(actor) });
		posted.length = 0;
		expect(await toggleNpcRapport(actor)).toBe("spent");
		expect(conversationOf(actor).theirs).toBe(0);
		expect(rapportHeld(actor)).toBe(2);
		expect(lastCard()).toContain("Maeve spends Rapport to ask Wren:");
		expect(asksAllFour(lastCard())).toBe(true);
		expect(await toggleNpcRapport(actor)).toBe("restored");
		expect(conversationOf(actor).theirs).toBe(1);
		expect(posted).toHaveLength(1);
	});

	it("has no NPC pip to press while talking with a PC, or with nobody", async () => {
		const { actor } = hero();
		expect(await toggleNpcRapport(actor)).toBeNull();
		const aeron = pc();
		await converse(actor, { actor: aeron }, { actors: world(actor, aeron) });
		expect(await toggleNpcRapport(actor)).toBeNull();
	});
});

describe("the PC partner's side", () => {
	it("spends it from their own sheet: it goes, and a card asks the hero the four questions", async () => {
		const { actor } = hero();
		const aeron = pc();
		await converse(actor, { actor: aeron }, { actors: world(actor, aeron) });
		expect(await spendPartnerRapport(aeron, "wren")).toBe(true);
		expect(rapportHeldWith(aeron)).toEqual([]);
		expect(lastCard()).toContain("Aeron spends Rapport to ask Wren:");
		expect(asksAllFour(lastCard())).toBe(true);
		expect(posted.at(-1).speaker.actor).toBe("aeron");
		// The hero's own two are untouched, and there is nothing left to spend.
		expect(rapportHeld(actor)).toBe(2);
		expect(await spendPartnerRapport(aeron, "wren")).toBe(false);
	});

	it("shows a chip per hero, the hero named in words, pressable only where the sheet is editable", async () => {
		const { actor } = hero();
		const aeron = pc();
		await converse(actor, { actor: aeron }, { actors: world(actor, aeron) });
		expect(rapportChips(aeron, { editable: true })).toEqual([expect.objectContaining({ heroId: "wren", label: "Rapport with Wren: 1" })]);
		expect(rapportChips(aeron, { editable: true })[0].tooltip).toContain("Press to spend it");
		expect(rapportChips(aeron)[0].tooltip).not.toContain("Press");
		expect(rapportChips(pc({ id: "x" }))).toEqual([]);
	});
});

describe("the GM relay", () => {
	const player = { id: "u-wren", isGM: false };
	const gmUser = { id: "u-gm", isGM: true };

	/** The GM's client, answering the query through the real handler, as the player who asked. */
	function relayingGM(actors) {
		const resolve = uuid => actors.find(a => a.uuid === uuid) ?? null;
		return {
			query: vi.fn(async (query, data) => {
				expect(query).toBe(UP_WITH_PEOPLE_QUERY);
				const as = globalThis.game.user;
				globalThis.game.user = gmUser;
				globalThis.game.users = { activeGM: gmUser };
				try { return await handleUpWithPeopleQuery(data, { user: player }, { resolve }); } finally { globalThis.game.user = as; }
			}),
		};
	}

	it("writes a PC partner the hero's player does not own through the GM's client, and lets go the same way", async () => {
		const { actor } = hero();
		actor.testUserPermission = (user, level) => user === player && level === "OWNER";
		const aeron = pc({ owned: false });
		const gm = relayingGM([actor, aeron]);
		const actors = world(actor, aeron);
		expect(await converse(actor, { actor: aeron }, { actors, gm })).toMatchObject({ pc: true, missed: false });
		expect(gm.query).toHaveBeenCalledWith(UP_WITH_PEOPLE_QUERY, expect.objectContaining({ action: "hold", heroUuid: "Actor.wren", partnerUuid: "Actor.aeron" }), expect.anything());
		expect(rapportHeldWith(aeron)).toHaveLength(1);
		await converse(actor, { actor: npc() }, { actors, gm });
		expect(gm.query).toHaveBeenLastCalledWith(UP_WITH_PEOPLE_QUERY, expect.objectContaining({ action: "release" }), expect.anything());
		expect(rapportHeldWith(aeron)).toEqual([]);
	});

	it("warns and says so when no GM is online to write it", async () => {
		const { actor } = hero();
		const aeron = pc({ owned: false });
		globalThis.ui.notifications.warn = vi.fn();
		expect(await converse(actor, { actor: aeron }, { actors: world(actor, aeron), gm: null })).toMatchObject({ missed: true });
		expect(globalThis.ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("No GM is online to give Aeron"));
		expect(rapportHeldWith(aeron)).toEqual([]);
		// The hero's side stands: the conversation happened.
		expect(rapportHeld(actor)).toBe(2);
	});

	it("warns and says so when no GM is online to take the last PC's Rapport back", async () => {
		const { actor } = hero();
		actor.testUserPermission = (user, level) => user === player && level === "OWNER";
		const aeron = pc({ owned: false });
		const actors = world(actor, aeron);
		await converse(actor, { actor: aeron }, { actors, gm: relayingGM([actor, aeron]) });
		expect(rapportHeldWith(aeron)).toHaveLength(1);
		globalThis.ui.notifications.warn = vi.fn();
		expect(await converse(actor, { actor: npc() }, { actors, gm: null })).toMatchObject({ releaseMissed: true, missed: false });
		expect(globalThis.ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("take back the Rapport Aeron holds with Wren"));
	});

	it("says nothing when the last PC had already spent theirs", async () => {
		const { actor } = hero();
		actor.testUserPermission = (user, level) => user === player && level === "OWNER";
		const aeron = pc({ owned: false });
		const actors = world(actor, aeron);
		await converse(actor, { actor: aeron }, { actors, gm: relayingGM([actor, aeron]) });
		aeron.isOwner = true;
		await spendPartnerRapport(aeron, "wren");
		aeron.isOwner = false;
		globalThis.ui.notifications.warn = vi.fn();
		expect(await converse(actor, { actor: npc() }, { actors, gm: null })).toMatchObject({ releaseMissed: false });
		expect(globalThis.ui.notifications.warn).not.toHaveBeenCalled();
	});

	it("refuses an asker who does not play the hero, a hero without the move, and a partner who is not a PC", async () => {
		const { actor } = hero();
		const aeron = pc({ owned: false });
		const resolve = uuid => [actor, aeron].find(a => a.uuid === uuid) ?? null;
		globalThis.game.user = gmUser;
		globalThis.game.users = { activeGM: gmUser };
		const data = { action: "hold", heroUuid: actor.uuid, partnerUuid: aeron.uuid };
		actor.testUserPermission = () => false;
		expect(await handleUpWithPeopleQuery(data, { user: player }, { resolve })).toBe(false);
		actor.testUserPermission = user => user === player;
		expect(await handleUpWithPeopleQuery({ ...data, partnerUuid: actor.uuid }, { user: player }, { resolve })).toBe(false);
		const { actor: heavy } = buildLiveCharacter({ slug: "the-heavy", name: "The Heavy" });
		heavy.uuid = "Actor.heavy";
		heavy.testUserPermission = () => true;
		expect(await handleUpWithPeopleQuery({ ...data, heroUuid: "Actor.heavy" }, { user: player }, { resolve: u => (u === "Actor.heavy" ? heavy : resolve(u)) })).toBe(false);
		expect(rapportHeldWith(aeron)).toEqual([]);
		expect(await handleUpWithPeopleQuery(data, { user: player }, { resolve })).toBe(true);
		expect(rapportHeldWith(aeron)).toHaveLength(1);
		// Only a GM's client answers.
		globalThis.game.user = player;
		expect(await handleUpWithPeopleQuery({ ...data, action: "release" }, { user: player }, { resolve })).toBe(false);
	});
});

describe("a copy taken while the move printed a third pip", () => {
	it("reads the track as 2, and a stale count of 3 as 2 held", () => {
		const { actor } = hero({ rapport: 3, track: { max: 3, title: "Rapport", labels: ["", "", "theirs"] } });
		expect(rapportHeld(actor)).toBe(RAPPORT_MAX);
		expect(shippedRapportTrack(UP_WITH_PEOPLE, { max: 3, title: "Rapport", labels: ["", "", "theirs"] }))
			.toEqual({ max: 2, title: "Rapport", labels: ["", ""] });
		expect(shippedRapportTrack(UP_WITH_PEOPLE, UWP_TRACK)).toBe(UWP_TRACK);
		const other = { max: 3, labels: ["a", "b", "c"] };
		expect(shippedRapportTrack("Command", other)).toBe(other);
	});

	it("spending from a stale 3 asks, and leaves 1", async () => {
		const { actor, char } = hero({ rapport: 3 });
		const before = rapportHeld(actor);
		const pip = { dataset: { moveName: UP_WITH_PEOPLE, index: "1" }, classList: { contains: cls => cls === "is-checked" } };
		await char.moveResources.add(new MoveResourceButton({ currentTarget: pip }));
		expect(await afterHeroPip(actor, before)).toBe(true);
		expect(rapportHeld(actor)).toBe(1);
		expect(lastCard()).toContain("Wren spends 1 Rapport to ask them (1 left):");
	});

	it("shows two pips in Other Moves, where a copy learned off-playbook is read from the held item", async () => {
		const move = {
			_id: "m1", type: "move", name: UP_WITH_PEOPLE,
			system: { moveType: "other", playbook: "The Would-Be Hero", resource: { max: 3, title: "Rapport", labels: ["", "", "theirs"] } },
		};
		const char = new TestCharacterBuilder(new FakeActorBuilder().withItems([move]).build()).build();
		const data = await char.buildSnapshot();
		expect(data.movelist.otherMoves[0].resource).toMatchObject({ max: 2, labels: ["", ""] });
	});

	it("the Moves tab's own track comes from the shipped data, which prints 2", () => {
		const exported = JSON.parse(readRepo("data/playbook-moves.json"));
		const list = Array.isArray(exported) ? exported : Object.values(exported).flat();
		expect(list.find(m => m?.name === UP_WITH_PEOPLE).resource.max).toBe(RAPPORT_MAX);
	});
});

describe("the sheet", () => {
	it("offers the other PCs, the people this viewer can see, and somebody with no sheet", () => {
		const { actor } = hero();
		const aeron = pc();
		const hidden = { ...npc("h", "Hidden"), visible: false };
		const beast = { id: "b", name: "Beast", type: "monster" };
		const rows = conversationPartners(actor, { actors: world(actor, aeron, npc(), hidden, beast) });
		expect(rows.map(r => r.id)).toEqual(["aeron", "maeve", SOMEONE_ELSE]);
		expect(rows.at(-1).actor).toBeNull();
	});

	it("draws the card from the conversation: an NPC's pip with its tooltip, a PC's note", async () => {
		const { actor } = hero();
		expect(upWithPeopleCard(actor)).toMatchObject({ partner: null, npc: false, pc: false });
		await converse(actor, { actor: npc() }, { actors: world(actor) });
		expect(upWithPeopleCard(actor, { editable: true })).toMatchObject({ partner: "Maeve", npc: true, theirs: true, editable: true });
		expect(upWithPeopleCard(actor).theirsTooltip).toContain("Maeve holds 1 Rapport with you");
		const aeron = pc();
		await converse(actor, { actor: aeron }, { actors: world(actor, aeron) });
		expect(upWithPeopleCard(actor)).toMatchObject({ partner: "Aeron", pc: true, npc: false, theirs: false });
	});

	it("wires the card, the chip, the pip spend and the relay", () => {
		const hbs = readRepo("templates/actor/partials/move-group.hbs");
		expect(hbs).toContain("(lookup @root.stonetop.upWithPeople name)");
		expect(hbs).toContain("stonetop-up-with-people-converse");
		expect(hbs).toContain("stonetop-up-with-people-theirs");
		// The NPC's pip must NOT wear the track pip's class: the sheet's track click handler answers that.
		expect(hbs).not.toMatch(/stonetop-item-resource-check[^"]*stonetop-up-with-people-theirs|stonetop-up-with-people-theirs[^"]*stonetop-item-resource-check/);
		const header = readRepo("templates/actor/partials/actor-header.hbs");
		expect(header).toContain("{{#each stonetop.rapport as |r|}}");
		expect(header).toContain("{{#if ../editable}}");
		const sheet = readRepo("module/actors/character/StonetopCharacterSheet.js");
		expect(sheet).toContain("context.stonetop.upWithPeople =");
		expect(sheet).toContain("context.stonetop.rapport = rapportChips(");
		expect(sheet).toContain('html.find("button.stonetop-rapport-chip").on("click", this._onSpendRapport.bind(this));');
		expect(sheet).toContain("if (rapport !== null) await afterHeroPip(this.actor, rapport);");
		const main = readRepo("stonetop.js");
		expect(main).toContain("CONFIG.queries[UP_WITH_PEOPLE_QUERY] = (data, context) => handleUpWithPeopleQuery(data, context);");
	});

	it("keeps its flags where the sheet reads them", async () => {
		const { actor } = hero();
		const aeron = pc();
		await converse(actor, { actor: aeron }, { actors: world(actor, aeron) });
		expect(actor.getFlag(SCOPE, CONVERSATION_FLAG)).toMatchObject({ name: "Aeron" });
		expect(aeron.getFlag(SCOPE, RAPPORT_FLAG)).toEqual({ wren: { name: "Wren", uuid: "Actor.wren" } });
	});
});
