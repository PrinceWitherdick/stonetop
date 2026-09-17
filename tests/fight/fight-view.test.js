import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import { fightTrackerView } from "../../module/fight/fight-view.js";
import { snapshotFight } from "../../module/fight/fight-state.js";
import { combatantVitals } from "../../module/fight/fight-vitals.js";
import { bookPageCites } from "../../module/gm-toolkit/book-ref.js";
import { fakeActor, fakeToken, fakeScene, fakeCombatant, fakeCombat } from "../fakes/fight.js";

// The Fight tab, built from a fight and RENDERED through its real templates.

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
Handlebars.registerPartial("stonetop.fight-row", read("templates/sidebar/fight-row.hbs"));
Handlebars.registerPartial("stonetop.fight-rules", read("templates/sidebar/fight-rules.hbs"));
Handlebars.registerPartial("stonetop.book-page-cite", read("templates/actor/partials/book-page-cite.hbs"));
const tracker = Handlebars.compile(read("templates/sidebar/fight-tracker.hbs"));
const header = Handlebars.compile(read("templates/sidebar/fight-header.hbs"));

const format = (key, data) => globalThis.game.i18n.format(key, data);

let saved;
beforeEach(() => { saved = { user: globalThis.game.user }; });
afterEach(() => { globalThis.game.user = saved.user; });

/**
 * Bram and Aeliana both on one crinwin; Cadi facing two wolves; a hidden ambusher nobody engages;
 * a horde of six at 2 of 4 HP off on its own; and Pim, knocked out.
 */
function fight() {
	const actor = (id, type, system = {}) => fakeActor({ id, name: id[0].toUpperCase() + id.slice(1), type, system });
	const tokens = {
		bram: fakeToken({ id: "tBram", col: 0, row: 1, actor: actor("bram", "character", { attributes: { hp: { value: 7, max: 10 }, armor: { value: 2 } } }) }),
		aeliana: fakeToken({ id: "tAel", col: 0, row: 3, actor: actor("aeliana", "character") }),
		crinwin: fakeToken({ id: "tCrin", col: 0, row: 2, actor: actor("crinwin", "monster", { attributes: { hp: { value: 5, max: 9 }, armor: { value: 1 } } }) }),
		cadi: fakeToken({ id: "tCadi", col: 6, row: 1, actor: actor("cadi", "character") }),
		wolf1: fakeToken({ id: "tW1", col: 5, row: 1, actor: actor("wolf", "monster") }),
		wolf2: fakeToken({ id: "tW2", col: 7, row: 1, actor: actor("wolf", "monster") }),
		ambusher: fakeToken({ id: "tAmb", col: 12, row: 12, hidden: true, actor: actor("ambusher", "monster") }),
		horde: fakeToken({ id: "tHorde", col: 20, row: 20, actor: actor("horde", "monster", { organization: "horde", fightAsGroup: true, count: 6, attributes: { hp: { value: 2, max: 4 } } }) }),
		pim: fakeToken({ id: "tPim", col: 30, row: 30, actor: actor("pim", "character", { attributes: { hp: { value: 0, max: 10 } } }) }),
	};
	const scene = fakeScene({ tokens: Object.values(tokens) });
	const c = (id, token, extra = {}) => fakeCombatant({ id, token, scene, ...extra });
	const combat = fakeCombat({
		scene,
		combatants: [
			c("cBram", tokens.bram), c("cAel", tokens.aeliana), c("cCrin", tokens.crinwin), c("cCadi", tokens.cadi),
			c("cW1", tokens.wolf1), c("cW2", tokens.wolf2), c("cAmb", tokens.ambusher, { hidden: true, visible: false }),
			c("cHorde", tokens.horde), c("cPim", tokens.pim),
		],
	});
	return { scene, combat };
}

function view(isGM, { seesFoeVitals = false } = {}) {
	const { scene, combat } = fight();
	const viewer = { id: isGM ? "gm" : "player", isGM };
	globalThis.game.user = viewer;
	const snapshot = snapshotFight(combat, { scene, viewer, users: [], canvasScene: scene });
	const rows = new Map([...combat.combatants].map(cb => {
		const bodies = cb.id === "cHorde" ? { group: true, standing: 3, size: 6 } : {};
		return [cb.id, { name: cb.actor.name, img: `art/${cb.id}.webp`, hidden: cb.hidden, defeated: false, canPing: true, onCanvas: true, vitals: combatantVitals(cb), seesFoeVitals, ...bodies }];
	}));
	return fightTrackerView({ snapshot, rows, isGM, format, cites: bookPageCites });
}

describe("fightTrackerView", () => {
	it("makes one card per engagement, heroes then foes", () => {
		const v = view(true);
		expect(v.clusters.map(c => [c.heroes.map(r => r.name), c.foes.map(r => r.name)])).toEqual([
			[["Bram", "Aeliana"], ["Crinwin"]],
			[["Cadi"], ["Wolf", "Wolf"]],
		]);
	});

	it("puts each foe under the first hero fighting it, once", () => {
		const v = view(true);
		const pairs = v.clusters.map(c => c.pairs.map(p => [p.hero.name, p.foes.map(r => r.name)]));
		expect(pairs).toEqual([
			[["Bram", ["Crinwin"]], ["Aeliana", []]],
			[["Cadi", ["Wolf", "Wolf"]]],
		]);
		expect(v.clusters[1].pairs[0].label).toBe("Against Cadi");
	});

	it("lets a GM drag capable foes on this map onto capable heroes, and a player neither", () => {
		const gm = view(true);
		expect(gm.clusters[0].foes[0]).toMatchObject({ draggable: true, dropTarget: false });
		expect(gm.clusters[0].heroes[0]).toMatchObject({ draggable: false, dropTarget: true });
		expect(gm.unengaged.foes.every(r => r.draggable)).toBe(true);
		expect(gm.out[0]).toMatchObject({ draggable: false, dropTarget: false });
		expect(gm.dragHint).toBe(true);
		const player = view(false);
		expect([...player.clusters.flatMap(c => [...c.heroes, ...c.foes]), ...player.unengaged.foes].some(r => r.draggable || r.dropTarget)).toBe(false);
		expect(player.dragHint).toBe(false);
	});

	it("says what each row is doing, and badges whoever is ganged up on", () => {
		const v = view(true);
		const [first, second] = v.clusters;
		expect(first.foes[0]).toMatchObject({ readout: "fought by Bram & Aeliana", badge: { count: 2, label: "Fought by 2" } });
		expect(first.heroes[0]).toMatchObject({ readout: "fighting Crinwin", badge: null });
		expect(second.heroes[0]).toMatchObject({ readout: "fighting Wolf & Wolf", badge: { count: 2, label: "Facing 2 in melee" } });
		expect(first.facts).toEqual(["+1 damage on Crinwin (2 attackers)"]);
		expect(second.facts).toEqual(["+1 damage on Cadi (2 foes)"]);
	});

	it("shows HP and armor under each name, a foe's only to a GM or a player who can observe it", () => {
		const gm = view(true);
		expect(gm.clusters[0].heroes[0].vitals).toBe("HP 7/10 · Armor 2");
		expect(gm.clusters[0].foes[0].vitals).toBe("HP 5/9 · Armor 1");
		expect(gm.clusters[0].heroes[1].vitals).toBe("");
		const player = view(false);
		expect(player.clusters[0].heroes[0].vitals).toBe("HP 7/10 · Armor 2");
		expect(player.clusters[0].foes[0].vitals).toBe("");
		expect(view(false, { seesFoeVitals: true }).clusters[0].foes[0].vitals).toBe("HP 5/9 · Armor 1");
	});

	it("hides a foe's HP on another map from a player, and still shows a hero's", () => {
		const { scene, combat } = fight();
		const viewer = { id: "player", isGM: false };
		globalThis.game.user = viewer;
		const snapshot = snapshotFight(combat, { scene, viewer, users: [], canvasScene: scene });
		const away = [{ id: "cGone", side: "foes" }, { id: "cFar", side: "heroes" }, { id: "cWho", side: null }];
		const rows = new Map(away.map(({ id, side }) => [id, { name: id, vitals: { hp: 4, hpMax: 6, armor: 1 }, seesFoeVitals: false, side }]));
		const v = fightTrackerView({ snapshot: { ...snapshot, elsewhere: away.map(({ id }) => ({ id })) }, rows, isGM: false, format, cites: bookPageCites });
		expect(v.elsewhere.map(r => [r.id, r.vitals])).toEqual([["cGone", ""], ["cFar", "HP 4/6 · Armor 1"], ["cWho", ""]]);
	});

	it("quotes the book with a page to open", () => {
		const v = view(true);
		const quote = v.clusters[0].quotes.find(q => q.key === "pileOnDamage");
		expect(quote.text).toContain("add +1 extra damage for each capable attacker after the first");
		expect(quote.cites).toEqual([expect.objectContaining({ book: 1, page: 414 })]);
	});

	it("lists who nobody is engaged with, who is out, and a group's casualties", () => {
		const v = view(true);
		expect(v.unengaged.foes.map(r => r.name)).toEqual(["Ambusher", "Horde"]);
		expect(v.unengaged.foes[1].standing).toBe("3 of 6 standing");
		expect(v.unengaged.quotes.map(q => q.key)).toEqual(["unengagedFoes"]);
		expect(v.out.map(r => r.name)).toEqual(["Pim"]);
	});

	it("shows a player neither the hidden ambusher nor the GM's advice", () => {
		const v = view(false);
		expect(v.unengaged.foes.map(r => r.name)).toEqual(["Horde"]);
		expect(v.unengaged.quotes).toEqual([]);
		expect(v.clusters[1].quotes.map(q => q.key)).not.toContain("engagesMultiple");
		expect(v.general.quotes.map(q => q.key)).toEqual(["noTurns"]);
	});

	it("remembers which folds the reader left open", () => {
		const { scene, combat } = fight();
		globalThis.game.user = { id: "gm", isGM: true };
		const snapshot = snapshotFight(combat, { scene, viewer: globalThis.game.user, users: [], canvasScene: scene });
		const rows = new Map([...combat.combatants].map(cb => [cb.id, { name: cb.actor.name }]));
		const first = fightTrackerView({ snapshot, rows, isGM: true, format, cites: bookPageCites });
		const open = new Set([first.clusters[0].ruleKey, "general"]);
		const again = fightTrackerView({ snapshot, rows, isGM: true, format, cites: bookPageCites, openRules: open });
		expect(again.clusters[0].rulesOpen).toBe(true);
		expect(again.clusters[1].rulesOpen).toBe(false);
		expect(again.general.rulesOpen).toBe(true);
	});
});

describe("the Fight tab's templates", () => {
	it("keep the hooks core's own listeners look for", () => {
		const html = tracker({ fight: view(true), isGM: true });
		expect(html).toMatch(/^<div class="combat-tracker stonetop-fight-tracker">/m);
		expect(html).toContain('<li class="combatant stonetop-fight-row');
		expect(html).toContain('data-combatant-id="cBram" data-action="activateCombatant"');
	});

	it("indent each hero's foes under them, marked for dragging, with the hint where the loose foes are", () => {
		const html = tracker({ fight: view(true), isGM: true });
		expect(html).toMatch(/data-combatant-id="cCadi"[^>]*data-fight-drop[\s\S]*?<ul class="stonetop-fight-side stonetop-fight-side--foes stonetop-fight-attached plain" aria-label="Against Cadi">[\s\S]*?data-combatant-id="cW1"[^>]*draggable="true" data-fight-drag/);
		expect(html).toContain("Drag a foe onto a hero");
		const player = tracker({ fight: view(false), isGM: false });
		expect(player).not.toContain("data-fight-drag");
		expect(player).not.toContain("data-fight-drop");
		expect(player).not.toContain("Drag a foe onto a hero");
	});

	it("give a GM the hide and out controls, and a player neither", () => {
		const gm = tracker({ fight: view(true), isGM: true });
		expect(gm).toContain('data-action="toggleHidden"');
		expect(gm).toContain('data-action="toggleDefeated"');
		const player = tracker({ fight: view(false), isGM: false });
		expect(player).not.toContain('data-action="toggleHidden"');
		expect(player).not.toContain('data-action="toggleDefeated"');
		expect(player).toContain('data-action="pingCombatant"');
	});

	it("print HP and armor under the name, and who they are fighting on the name's tooltip", () => {
		const html = tracker({ fight: view(true), isGM: true });
		expect(html).toContain('<strong class="name stonetop-fight-name" data-tooltip-text="fought by Bram &amp; Aeliana" aria-description="fought by Bram &amp; Aeliana">Crinwin</strong>');
		expect(html).toContain('<span class="stonetop-fight-readout stonetop-fight-vitals">HP 5/9 · Armor 1</span>');
		expect(html).not.toContain(">fought by Bram");
	});

	it("print the count on a badge with a label a screen reader says", () => {
		const html = tracker({ fight: view(true), isGM: true });
		expect(html).toContain('<span class="stonetop-fight-badge" role="img" aria-label="Fought by 2" data-tooltip-text="Fought by 2">&times;2</span>');
	});

	it("fold the book's words away, with clickable citations", () => {
		const html = tracker({ fight: view(true), isGM: true });
		expect(html).toContain('<details class="stonetop-fight-rules"');
		expect(html).toContain("What the book says");
		expect(html).toContain('class="stonetop-book-cite" data-book="1" data-page="414"');
	});

	it("say there is no fight when there is none", () => {
		expect(tracker({ fight: null, isGM: true })).toContain("No fight on this scene. Start one");
		expect(tracker({ fight: null, isGM: false })).toContain("No fight on this scene.");
	});

	it("offer a GM Start when there is no fight, and a player nothing to press", () => {
		const gm = header({ hasCombat: false, isGM: true });
		expect(gm).toContain('data-action="startFight"');
		const player = header({ hasCombat: false, isGM: false });
		expect(player).not.toContain("data-action");
	});

	it("never offer initiative, rounds or turns", () => {
		const html = header({ hasCombat: true, isGM: true, combat: { name: "" }, overlayShown: true }).toLowerCase();
		for (const word of ["initiative", "rollall", "nextturn", "begincombat", "startcombat", "round"]) expect(html).not.toContain(word);
		for (const action of ["addToFight", "lineUpFight", "toggleFightOverlay", "endFight"]) {
			expect(html).toContain(`data-action="${action.toLowerCase()}"`);
		}
	});

	it("keep the map-lines toggle on screen whatever its state, reporting it through aria-pressed", () => {
		const on = header({ hasCombat: true, isGM: false, combat: {}, overlayShown: true });
		const off = header({ hasCombat: true, isGM: false, combat: {}, overlayShown: false });
		expect(on).toContain('data-action="toggleFightOverlay"');
		expect(on).toContain('aria-pressed="true"');
		expect(off).toContain('data-action="toggleFightOverlay"');
		expect(off).toContain('aria-pressed="false"');
		expect(off).not.toContain('data-action="endFight"');
	});

	it("tell a GM about rounds only when core's tracker started some", () => {
		expect(header({ hasCombat: true, isGM: true, combat: {}, roundsStarted: true })).toContain('data-action="stopRounds"');
		expect(header({ hasCombat: true, isGM: true, combat: {}, roundsStarted: false })).not.toContain("stopRounds");
	});
});
