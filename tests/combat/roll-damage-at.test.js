import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SCOPE, installCombatChatFakes, uninstallCombatChatFakes, cardWithFlag, makeMessage } from "../fakes/combat-chat.js";
import { fakeActor, fakeToken, fakeScene, fakeCombatant, fakeCombat, collection } from "../fakes/fight.js";
import { attackWeapon, parseMonsterAttacks } from "../../module/utils/damage.js";

// The plain card is RollDialog's business and has its own tests; here it only matters that it is what
// a roll with nobody to hit falls back to.
vi.mock("../../module/dialogs/RollDialog.js", async importOriginal => ({
	...(await importOriginal()),
	rollDamagePrompted: vi.fn(async () => true),
}));
const { rollDamagePrompted } = await import("../../module/dialogs/RollDialog.js");
const { rollDamageAt, maybeBeginAttack, wireApplyDamage, withSeedTags } = await import("../../module/combat/attack-flow.js");

// Rolls aimed by the fight: a monster's damage at the character it is fighting, a character's at the
// foe, the "Who does this hit?" question when there are several, and the plain card when nobody is there.

const I18N = globalThis.game?.i18n;
let posted;
let saved;

/** A character with HP to lose and 2 armor. */
const hero = (id, name) => ({
	...fakeActor({ id, name, type: "character" }),
	documentName: "Actor",
	uuid: `Actor.${id}`,
	isOwner: true,
	items: [],
	getFlag: () => ({}),
	system: { attributes: { armor: { value: 2 }, hp: { value: 10, max: 10 }, damage: { value: "d8" } } },
	update: vi.fn(async function (changes) { this.system.attributes.hp.value = changes["system.attributes.hp.value"]; }),
});

/** A crinwin that bites for a d6, 1 piercing. */
const crinwin = id => ({
	...fakeActor({ id, name: "Crinwin", type: "monster" }),
	system: { attributes: { damage: { value: "bite d6 (close, 1 piercing)", rollFormula: "d6" }, armor: { value: 1 }, hp: { value: 3, max: 3 } } },
});

/**
 * Tokens on one row of the canvas scene, all in one fight. `row` lists [key, actor] left to right, one
 * square apart, so neighbours are in melee.
 */
function fightInARow(row) {
	const tokens = {};
	row.forEach(([key, actor], col) => {
		tokens[key] = Object.assign(fakeToken({ id: `t${key}`, col, row: 1, actor, name: actor.name }), {
			uuid: `Scene.scene1.Token.t${key}`, documentName: "Token", disposition: actor.type === "character" ? 1 : -1,
		});
	});
	const scene = fakeScene({ tokens: Object.values(tokens) });
	const combat = fakeCombat({ scene, combatants: Object.entries(tokens).map(([key, t]) => fakeCombatant({ id: `c${key}`, token: t, scene })) });
	globalThis.game.combats = collection([combat]);
	globalThis.game.settings = { get: (scope, key) => (key === "fightTab" ? true : "roll") };
	globalThis.ui.combat = { viewed: combat };
	globalThis.canvas = { scene };
	const byUuid = new Map(Object.values(tokens).map(t => [t.uuid, t]));
	globalThis.fromUuid = async uuid => byUuid.get(uuid) ?? null;
	globalThis.fromUuidSync = uuid => byUuid.get(uuid) ?? null;
	/** The token's own actor, as a click on an unlinked monster token hands it over. */
	const tokenActor = key => ({ ...tokens[key].actor, token: tokens[key] });
	return { tokens, combat, tokenActor };
}

beforeEach(() => {
	posted = installCombatChatFakes();
	globalThis.game.i18n = I18N;
	saved = { canvas: globalThis.canvas, fromUuidSync: globalThis.fromUuidSync, document: globalThis.document, applications: globalThis.foundry?.applications };
	globalThis.CONST = { ...globalThis.CONST, GRID_TYPES: { GRIDLESS: 0, SQUARE: 1 } };
	globalThis.ui.notifications.info = vi.fn();
	vi.mocked(rollDamagePrompted).mockClear();
});
afterEach(() => {
	uninstallCombatChatFakes();
	globalThis.canvas = saved.canvas;
	globalThis.fromUuidSync = saved.fromUuidSync;
	globalThis.document = saved.document;
	if (globalThis.foundry) globalThis.foundry.applications = saved.applications;
});

const damageFlag = () => cardWithFlag(posted, "damage")?.flags[SCOPE].damage;

/** Answer "Who does this hit?" by pressing a button: the confirm with `ticks` ticked, or cancel (null). */
function answerWhoItHits(ticks) {
	globalThis.document = { createElement: () => ({ innerHTML: "" }) };
	const wait = vi.fn(async config => {
		if (ticks === null) return config.buttons[1].callback();
		const inputs = ticks.map((checked, i) => ({ value: String(i), checked }));
		return config.buttons[0].callback(null, { form: { querySelectorAll: () => inputs.filter(i => i.checked) } });
	});
	globalThis.foundry.applications = { api: { DialogV2: { wait } } };
	return wait;
}

/** Press Apply on a damage card, as the GM. */
async function apply(flag) {
	const listeners = [];
	const button = { disabled: false, title: "", innerHTML: "", style: {}, addEventListener: (type, fn) => listeners.push(fn) };
	const message = makeMessage({ damage: flag });
	message.canUserModify = () => true;
	wireApplyDamage(message, { querySelector: sel => (sel === ".stonetop-apply-damage" ? button : null) });
	await listeners[0]();
}

describe("Apply damage and the fight's rules", () => {
	/** A horde of twelve crinwin fighting as one token, one crinwin's 3 HP for its pool. */
	const horde = () => ({
		...fakeActor({ id: "horde", name: "Crinwin horde", type: "monster" }),
		flags: {},
		system: { organization: "horde", fightAsGroup: true, count: 12, attributes: { armor: { value: 1 }, hp: { value: 3, max: 3 } } },
		update: vi.fn(async function (changes) {
			if ("system.count" in changes) this.system.count = changes["system.count"];
			if ("system.attributes.hp.value" in changes) this.system.attributes.hp.value = changes["system.attributes.hp.value"];
		}),
	});

	it("drops one member of a horde token for a lone character's blow, and leaves its pool alone (p.416)", async () => {
		const bram = hero("bram", "Bram");
		const crowd = horde();
		const { tokens } = fightInARow([["bram", bram], ["horde", crowd]]);
		await apply({ move: "Clash", attackerUuid: bram.uuid, weapon: null, results: [{ uuid: tokens.horde.uuid, name: "Crinwin horde", raw: 5 }], applied: [] });
		expect(crowd.system.count).toBe(11);
		expect(crowd.system.attributes.hp.value).toBe(3);
		expect(posted.at(-1).content).toContain("one of them goes down, 11 still standing");
	});

	it("halves a blow before armor when Readiness was spent on it (p.216)", async () => {
		const pim = hero("pim", "Pim");
		const { tokens } = fightInARow([["pim", pim]]);
		await apply({ move: "Bite", weapon: null, results: [{ uuid: tokens.pim.uuid, name: "Pim", raw: 9 }], applied: [], halvedBy: [{ uuid: tokens.pim.uuid, name: "Pim", how: "halve" }] });
		// 9 halved, rounded up, to 5; less Pim's 2 armor.
		expect(pim.system.attributes.hp.value).toBe(7);
	});

	it("hands a blow to the defender who took it for their ward, against the defender's armor", async () => {
		const pim = hero("pim", "Pim");
		const aeliana = hero("aeliana", "Aeliana");
		const { tokens } = fightInARow([["pim", pim], ["aeliana", aeliana]]);
		const byToken = globalThis.fromUuid;
		globalThis.fromUuid = async uuid => (uuid === aeliana.uuid ? aeliana : byToken(uuid));
		await apply({ move: "Bite", weapon: null, results: [{ uuid: tokens.pim.uuid, name: "Pim", raw: 6 }], applied: [], standIns: [{ uuid: tokens.pim.uuid, by: aeliana.uuid, name: "Aeliana" }] });
		expect(pim.system.attributes.hp.value).toBe(10);
		expect(aeliana.system.attributes.hp.value).toBe(6);
		expect(posted.at(-1).content).toContain("Aeliana (for Pim)");
	});

	it("lets a blow pass for A Mighty Rampart", async () => {
		const pim = hero("pim", "Pim");
		const { tokens } = fightInARow([["pim", pim]]);
		await apply({ move: "Bite", weapon: null, results: [{ uuid: tokens.pim.uuid, name: "Pim", raw: 9 }], applied: [], ignoredBy: [{ uuid: tokens.pim.uuid, name: "Pim", how: "ignore" }] });
		expect(pim.system.attributes.hp.value).toBe(10);
		expect(posted.at(-1).content).toContain("ignored it (A Mighty Rampart)");
	});

	it("gives an Undaunted hero +1 armor while they are outnumbered", async () => {
		const pim = Object.assign(hero("pim", "Pim"), { items: [{ type: "move", name: "Undaunted" }] });
		const { tokens } = fightInARow([["crin", crinwin("crinwin")], ["pim", pim], ["crin2", crinwin("crinwin2")]]);
		await apply({ move: "Bite", weapon: null, results: [{ uuid: tokens.pim.uuid, name: "Pim", raw: 9 }], applied: [] });
		// 9 less 2 armor and Undaunted's 1.
		expect(pim.system.attributes.hp.value).toBe(4);
		expect(posted.at(-1).content).toContain("+1 armor, Undaunted");
	});

	it("rolls a foe's damage at disadvantage against a hero who locked eyes with it (Big Damn Hero)", async () => {
		const pim = hero("pim", "Pim");
		const { tokenActor, combat } = fightInARow([["crin", crinwin("crinwin")], ["pim", pim]]);
		combat.combatants.get("cpim").flags["stonetop-pwd"].lockedEyes = ["ccrin"];
		await rollDamageAt(tokenActor("crin"), { formula: "d6", label: "Bite", shiftKey: true });
		expect(damageFlag().results[0].formula).toBe("2d6kl1");
	});

	it("rolls straight when the foe's blow already had advantage: locked eyes cancels it (p.230)", async () => {
		const pim = hero("pim", "Pim");
		const { tokenActor, combat } = fightInARow([["crin", crinwin("crinwin")], ["pim", pim]]);
		combat.combatants.get("cpim").flags["stonetop-pwd"].lockedEyes = ["ccrin"];
		await rollDamageAt(tokenActor("crin"), { formula: "d6", label: "Bite", rollMode: "adv", shiftKey: true });
		expect(damageFlag().results[0].formula).toBe("d6");
	});

	it("adds the other attackers' tags and piercing to the blow while the +N is on", () => {
		const weapon = { name: "Sword", range: ["close"], piercing: 0, tags: ["close"] };
		expect(withSeedTags(weapon, { bonus: 1, applied: true, tags: ["forceful"], piercing: 1 }))
			.toEqual({ name: "Sword", range: ["close"], piercing: 1, tags: ["close", "forceful"] });
		expect(withSeedTags(weapon, { bonus: 1, applied: false, tags: ["forceful"], piercing: 1 })).toBe(weapon);
		expect(withSeedTags(weapon, { bonus: 1, applied: true, tags: [], piercing: 0 })).toBe(weapon);
	});
});

describe("a stat block's damage, aimed by the fight", () => {
	it("lands on the character the monster is fighting, and Apply takes their armor off less its piercing", async () => {
		const pim = hero("pim", "Pim");
		const { tokens, tokenActor } = fightInARow([["crin", crinwin("crinwin")], ["pim", pim]]);
		const bite = parseMonsterAttacks("bite d6 (close, 1 piercing)")[0];

		expect(await rollDamageAt(tokenActor("crin"), {
			formula: "d6", label: "Bite", keywords: "close, 1 piercing", rollMode: "normal", weapon: attackWeapon(bite), shiftKey: true,
		})).toBe(true);

		const flag = damageFlag();
		expect(flag).toMatchObject({ move: "Bite", weapon: { name: "", piercing: 1, ignoresArmor: false } });
		expect(flag.results).toEqual([expect.objectContaining({ uuid: tokens.pim.uuid, name: "Pim", raw: 9, formula: "d6" })]);
		const content = cardWithFlag(posted, "damage").content;
		expect(content).toContain("Bite: damage");
		expect(content).toContain("piercing");
		expect(content).toContain("Apply damage");
		expect(rollDamagePrompted).not.toHaveBeenCalled();

		await apply(flag);
		// 9, less Pim's 2 armor pierced by 1.
		expect(pim.system.attributes.hp.value).toBe(2);
	});

	it("carries the +1 when another foe is on the same character", async () => {
		const pim = hero("pim", "Pim");
		const { tokenActor } = fightInARow([["crin", crinwin("crinwin")], ["pim", pim], ["crin2", crinwin("crinwin2")]]);
		await rollDamageAt(tokenActor("crin"), { formula: "d6", label: "Bite", shiftKey: true });
		expect(damageFlag()).toMatchObject({ seed: { bonus: 1, direction: "onHero", target: "Pim" } });
		expect(damageFlag().results[0].formula).toBe("d6+1");
	});

	it("leaves the fight's +N off a row whose formula already has it", async () => {
		const pim = hero("pim", "Pim");
		const { tokenActor } = fightInARow([["crin", crinwin("crinwin")], ["pim", pim], ["crin2", crinwin("crinwin2")]]);
		await rollDamageAt(tokenActor("crin"), { formula: "d6+1", label: "Crinwin (swarm)", seeded: false, shiftKey: true });
		expect(damageFlag()).not.toHaveProperty("seed");
	});

	it("hits the roller's own target rather than whoever it is fighting", async () => {
		const pim = hero("pim", "Pim");
		const { tokens, tokenActor } = fightInARow([["crin", crinwin("crinwin")], ["pim", pim], ["gap", crinwin("far")], ["cadi", hero("cadi", "Cadi")]]);
		globalThis.game.user.targets = new Set([{ document: tokens.cadi, actor: tokens.cadi.actor }]);
		await rollDamageAt(tokenActor("crin"), { formula: "d6", label: "Bite", shiftKey: true });
		expect(damageFlag().results.map(r => r.name)).toEqual(["Cadi"]);
	});

	it("posts the plain card, as before, when there is nobody to hit", async () => {
		const loner = crinwin("loner");
		globalThis.game.combats = collection([]);
		expect(await rollDamageAt(loner, { formula: "d6", label: "Bite", keywords: "close", rollMode: "dis", shiftKey: true })).toBe(true);
		expect(rollDamagePrompted).toHaveBeenCalledWith("d6", loner, {
			label: "Bite", keywords: "close", description: "", rollMode: "dis", shiftKey: true, offers: [],
		});
		expect(damageFlag()).toBeUndefined();
	});
});

describe("damage at several", () => {
	it("asks who a blow hits when the roller is fighting two, and rolls nothing when that is backed out of", async () => {
		const pim = hero("pim", "Pim");
		fightInARow([["crin", crinwin("crinwin")], ["pim", pim], ["crin2", crinwin("crinwin2")]]);
		const wait = answerWhoItHits(null);
		expect(await rollDamageAt(pim, { formula: "d8", label: "Damage", shiftKey: true })).toBe(false);
		expect(wait).toHaveBeenCalledTimes(1);
		expect(posted).toEqual([]);
		expect(rollDamagePrompted).not.toHaveBeenCalled();
	});

	it("rolls separately against each one ticked, and says why on the card", async () => {
		const pim = hero("pim", "Pim");
		const { tokens } = fightInARow([["crin", crinwin("crinwin")], ["pim", pim], ["crin2", crinwin("crinwin2")]]);
		answerWhoItHits([true, true]);
		await rollDamageAt(pim, { formula: "d8", label: "Damage", shiftKey: true });
		expect(damageFlag().results.map(r => r.uuid)).toEqual([tokens.crin.uuid, tokens.crin2.uuid]);
		// One card, one +N: a pile-on is against a single target.
		expect(damageFlag()).not.toHaveProperty("seed");
		expect(cardWithFlag(posted, "damage").content).toContain("damage is rolled separately against each");
	});

	it("rolls at the one ticked, with the +N for the other character on that foe", async () => {
		const pim = hero("pim", "Pim");
		const { tokens } = fightInARow([["cadi", hero("cadi", "Cadi")], ["crin", crinwin("crinwin")], ["pim", pim], ["crin2", crinwin("crinwin2")]]);
		answerWhoItHits([true, false]);
		await rollDamageAt(pim, { formula: "d8", label: "Damage", shiftKey: true });
		expect(damageFlag().results.map(r => r.uuid)).toEqual([tokens.crin.uuid]);
		expect(damageFlag()).toMatchObject({ seed: { bonus: 1, direction: "onFoe", target: "Crinwin" } });
	});
});

describe("a Clash with nothing targeted", () => {
	it("freezes the foe the character is fighting as its target", async () => {
		const pim = hero("pim", "Pim");
		const { tokens } = fightInARow([["pim", pim], ["crin", crinwin("crinwin")]]);
		const begun = await maybeBeginAttack(pim, { name: "Clash" });
		expect(begun.messageFlags[SCOPE].attack.targets).toEqual([
			{ uuid: tokens.crin.uuid, name: "Crinwin", actorId: "crinwin", disposition: -1, hasActor: true },
		]);
		expect(globalThis.ui.notifications.info).not.toHaveBeenCalled();
	});

	it("is called off when the player backs out of who it hits", async () => {
		const pim = hero("pim", "Pim");
		fightInARow([["crin", crinwin("crinwin")], ["pim", pim], ["crin2", crinwin("crinwin2")]]);
		answerWhoItHits(null);
		expect(await maybeBeginAttack(pim, { name: "Clash" })).toBe("cancel");
	});

	it("still says nothing is targeted when the character is fighting nobody", async () => {
		const pim = hero("pim", "Pim");
		fightInARow([["pim", pim], ["gap", hero("cadi", "Cadi")]]);
		const begun = await maybeBeginAttack(pim, { name: "Clash" });
		expect(begun.messageFlags[SCOPE].attack.targets).toEqual([]);
		expect(globalThis.ui.notifications.info).toHaveBeenCalled();
	});
});
