import { describe, it, expect, vi, afterEach } from "vitest";
import { composeDamageFormula, damageSeedBonus } from "../../module/utils/damage.js";
import { damageConditionPills } from "../../module/utils/roll-engine.js";
import { promptDamage } from "../../module/dialogs/RollDialog.js";

// The fight's +N as it reaches a damage roll: the formula, the pills that name it, and the window.

const seed = (extra = {}) => ({
	bonus: 1, count: 2, direction: "onFoe", target: "Crinwin", names: ["Bram", "Aeliana"],
	label: "+1: Bram & Aeliana are both fighting Crinwin", pill: "+1 for 2 attackers",
	pillLeftOff: "+1 for 2 attackers, left off", cite: "Book I, page 414", applied: true, ...extra,
});

describe("the seed in a damage formula", () => {
	it("adds its bonus while applied, and nothing once left off or absent", () => {
		expect(damageSeedBonus(seed())).toBe(1);
		expect(damageSeedBonus(seed({ applied: false }))).toBe(0);
		expect(damageSeedBonus(null)).toBe(0);
		expect(damageSeedBonus(seed({ bonus: -3 }))).toBe(0);
	});

	it("joins the roller's own flat bonus as one term, the base die first", () => {
		expect(composeDamageFormula("d8", { seed: seed() })).toBe("d8+1");
		expect(composeDamageFormula("d8", { bonus: 2, extraDice: "1d4", seed: seed({ bonus: 3 }) })).toBe("d8+1d4+5");
		expect(composeDamageFormula("d8", { seed: seed({ applied: false }) })).toBe("d8");
	});

	it("is named apart on the card, and still named when left off", () => {
		expect(damageConditionPills({ bonus: 1, seed: seed() })).toEqual([
			'<li class="stonetop-condition-situational">Damage +1</li>',
			'<li class="stonetop-condition-situational stonetop-condition-numbers">+1 for 2 attackers</li>',
		]);
		expect(damageConditionPills({ seed: seed({ applied: false }) })).toEqual([
			'<li class="stonetop-condition-situational stonetop-condition-numbers is-left-off">+1 for 2 attackers, left off</li>',
		]);
		expect(damageConditionPills({})).toEqual([]);
	});

	it("escapes the words it prints", () => {
		const [pill] = damageConditionPills({ seed: seed({ pill: "<b>+1</b>" }) });
		expect(pill).toContain("&lt;b&gt;+1&lt;/b&gt;");
	});
});

// A window stand-in answering only what the damage window's render and read touch.
function openWindow({ seedBox = null, ...opts } = {}) {
	let data;
	global.Dialog = vi.fn(function (d) { data = d; this.render = vi.fn(); });
	const pending = promptDamage({ ask: true, ...opts });
	const input = { value: "0", listeners: [], addEventListener(t, fn) { this.listeners.push(fn); }, focus() {}, select() {}, classList: { toggle() {} } };
	const extra = { value: "", listeners: [], addEventListener(t, fn) { this.listeners.push(fn); }, classList: { toggle() {} } };
	const preview = { textContent: "" };
	const normal = { dataset: { rollMode: "normal" }, classList: { toggle() {}, contains: n => n === "is-active" }, setAttribute() {}, addEventListener() {} };
	const root = {
		querySelector(sel) {
			if (sel === ".stonetop-roll-mode-btn.is-active") return normal;
			if (sel === '[name="modifier"]') return input;
			if (sel === '[name="extraDice"]') return extra;
			if (sel === ".stonetop-damage-preview strong") return preview;
			if (sel === '[name="seedApplied"]') return seedBox;
			return null;
		},
		querySelectorAll: sel => (sel === ".stonetop-roll-mode-btn" ? [normal] : []),
	};
	data.render([root]);
	return { pending, data, root, preview };
}

describe("the damage window with a seed", () => {
	afterEach(() => { delete global.Dialog; });

	it("keeps its old answer, key for key, when there is no seed", async () => {
		expect(await promptDamage({ shiftKey: true, rollMode: "dis" })).toEqual({ rollMode: "dis", bonus: 0, extraDice: "" });
	});

	it("applies the seed when the window does not open (Shift, or the setting off)", async () => {
		expect(await promptDamage({ shiftKey: true, seed: seed() })).toEqual({ rollMode: "normal", bonus: 0, extraDice: "", seed: seed() });
		expect((await promptDamage({ ask: false, seed: seed({ applied: false }) })).seed.applied).toBe(true);
	});

	it("draws the seed as its own ticked line with the book's page, above the player's adjustment", () => {
		const { data } = openWindow({ seed: seed() });
		expect(data.content).toContain('name="seedApplied" checked');
		expect(data.content).toContain("+1: Bram &amp; Aeliana are both fighting Crinwin");
		expect(data.content).toContain("Book I, page 414");
		expect(data.content.indexOf("stonetop-damage-seed")).toBeLessThan(data.content.indexOf("Add to the damage"));
	});

	it("previews the formula with the seed in it, and without once unticked", () => {
		const box = { checked: true, listeners: [], addEventListener(t, fn) { this.listeners.push(fn); } };
		const { preview } = openWindow({ seed: seed(), formula: "d8", seedBox: box });
		expect(preview.textContent).toBe("d8+1");
		box.checked = false;
		box.listeners.forEach(fn => fn());
		expect(preview.textContent).toBe("d8");
	});

	it("answers with the seed ticked or unticked, as the reader left it", async () => {
		const box = { checked: false, addEventListener() {} };
		const { pending, data, root } = openWindow({ seed: seed(), formula: "d8", seedBox: box });
		data.buttons.roll.callback([root]);
		expect((await pending).seed).toMatchObject({ bonus: 1, applied: false });
	});

	it("draws no seed line without a seed", () => {
		expect(openWindow({}).data.content).not.toContain("seedApplied");
	});
});
