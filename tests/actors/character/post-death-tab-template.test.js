import { describe, expect, it } from "vitest";
import Handlebars from "handlebars";
import { Window } from "happy-dom";
import { readRepo } from "../../fakes/css.js";

/**
 * The Post-Death tab's controls as the templates draw them: real <button>s, their words on them, and
 * the aria the tab's low-vision reader relies on. Rendered from the repo's own templates, with the
 * partials that have nothing to do with these controls stubbed out.
 */
function tabHandlebars() {
	const hb = Handlebars.create();
	hb.registerHelper("localize", key => globalThis.game.i18n.localize(key));
	hb.registerHelper("eq", (a, b) => a === b);
	hb.registerHelper("or", (...args) => args.slice(0, -1).find(Boolean) ?? args.at(-2));
	hb.registerHelper("and", (...args) => args.slice(0, -1).every(Boolean));
	hb.registerPartial("stonetop.section-heading", "<h3>{{title}}</h3>");
	hb.registerPartial("stonetop.move-group", "");
	hb.registerPartial("stonetop.lore-arcana-image", "");
	hb.registerPartial("stonetop.lore-section", readRepo("templates/actor/partials/lore-section.hbs"));
	hb.registerPartial("stonetop.lore-options-edit", readRepo("templates/actor/partials/lore-options-edit.hbs"));
	hb.registerPartial("stonetop.lore-options-readonly", readRepo("templates/actor/partials/lore-options-readonly.hbs"));
	return hb;
}

function domOf(html) {
	const doc = new Window().document;
	doc.body.innerHTML = html;
	return doc;
}

function renderTab(stonetop) {
	const html = tabHandlebars().compile(readRepo("templates/actor/partials/tab-post-death.hbs"))({ stonetop });
	return domOf(html);
}

const action = (overrides = {}) => ({
	action: "regain-all", source: "LONGING", label: "Regain all HP", icon: "fa-heart", danger: false, disabled: false, reason: "", ...overrides,
});

describe("tab-post-death.hbs controls", () => {
	it("draws each outcome as a labelled button carrying its action, a dead one aria-disabled with its reason", () => {
		const doc = renderTab({
			postDeathInsert: { activeInsert: { lore: { hasEntries: false } } },
			postDeathTab: {
				outcomes: { rows: [{ title: "Terrible Purpose: LONGING", actions: [
					action(),
					action({ action: "clear-all", label: "Clear all debilities", disabled: true, reason: "No debilities are marked." }),
					action({ action: "last-door", label: "Pass through the Last Door", danger: true }),
				] }] },
			},
		});
		const buttons = [...doc.querySelectorAll(".stonetop-pdi-outcome-btn")];
		expect(buttons.map(b => b.tagName)).toEqual(["BUTTON", "BUTTON", "BUTTON"]);
		expect(buttons.map(b => b.textContent.trim())).toEqual(["Regain all HP", "Clear all debilities", "Pass through the Last Door"]);
		expect(buttons[0].dataset.pdiAction).toBe("regain-all");
		expect(buttons[0].dataset.source).toBe("LONGING");
		expect(buttons[0].hasAttribute("disabled")).toBe(false);
		expect(buttons[1].getAttribute("aria-disabled")).toBe("true");
		expect(buttons[1].dataset.tooltip).toBe("No debilities are marked.");
		expect(buttons[2].classList.contains("stonetop-pdi-outcome-btn--danger")).toBe(true);
		expect(doc.querySelector(".stonetop-pdi-outcome-row").getAttribute("aria-label")).toBe("Terrible Purpose: LONGING");
	});

	it("draws Favor as pressed-or-not pip buttons, each named, and the GM's Gain a Mark", () => {
		const doc = renderTab({
			postDeathInsert: { activeInsert: { lore: { hasEntries: false } } },
			postDeathTab: {
				favor: { canSet: true, heldLabel: "2 of 3 held", pips: [
					{ index: 0, filled: true, label: "Favor 1 of 3" },
					{ index: 1, filled: true, label: "Favor 2 of 3" },
					{ index: 2, filled: false, label: "Favor 3 of 3" },
				] },
				gainMark: true,
			},
		});
		const pips = [...doc.querySelectorAll(".stonetop-pdi-favor-pip")];
		expect(pips.map(p => p.getAttribute("aria-pressed"))).toEqual(["true", "true", "false"]);
		expect(pips.map(p => p.getAttribute("aria-label"))).toEqual(["Favor 1 of 3", "Favor 2 of 3", "Favor 3 of 3"]);
		expect(pips.every(p => p.tagName === "BUTTON" && !p.disabled && p.dataset.pdiAction === "favor-pip")).toBe(true);
		expect(doc.querySelector(".stonetop-pdi-favor-count").textContent).toBe("2 of 3 held");
		expect(doc.querySelector("[data-pdi-action='gain-mark']").textContent.trim()).toBe("Gain a Mark");
	});

	it("disables the pips for a viewer who can't set them", () => {
		const doc = renderTab({
			postDeathInsert: { activeInsert: { lore: { hasEntries: false } } },
			postDeathTab: { favor: { canSet: false, heldLabel: "0 of 3 held", pips: [{ index: 0, filled: false, label: "Favor 1 of 3" }] } },
		});
		expect(doc.querySelector(".stonetop-pdi-favor-pip").disabled).toBe(true);
	});

	it("offers Task complete on the master's task only when asked to", () => {
		const base = { postDeathInsert: { activeInsert: { lore: { hasEntries: false }, masterTask: "Bring me the bell" } } };
		expect(renderTab({ ...base, postDeathTab: { taskComplete: true } })
			.querySelector("[data-pdi-action='task-complete']").textContent.trim()).toBe("Task complete");
		expect(renderTab({ ...base, postDeathTab: { taskComplete: false } })
			.querySelector("[data-pdi-action='task-complete']")).toBeNull();
	});
});

describe("lore-options-edit.hbs on a post-death insert", () => {
	function renderOptions(options) {
		const html = tabHandlebars().compile(readRepo("templates/actor/partials/lore-options-edit.hbs"))({ slug: "marks", options });
		return domOf(html);
	}
	const opt = (overrides) => ({ slug: "x", type: "checkbox", checks: [false], description: "<p>X</p>", ...overrides });

	it("frames a cautioned pick and names the caution to a screen reader", () => {
		const doc = renderOptions([opt({ caution: "UNSTABLE requires BREAKDOWN" })]);
		expect(doc.querySelector(".stonetop-lore-option").classList.contains("is-cautioned")).toBe(true);
		const icon = doc.querySelector(".stonetop-lore-option-caution");
		expect(icon.getAttribute("aria-label")).toBe("UNSTABLE requires BREAKDOWN");
		expect(icon.getAttribute("role")).toBe("img");
	});

	it("draws the GM's Cross off and Restore as labelled buttons naming the Mark", () => {
		const doc = renderOptions([
			opt({ slug: "death-mask", pdiCrossOff: { label: "Cross off DEATH MASK: this Thrall can never gain it" } }),
			opt({ slug: "ravenous", crossedOff: true, pdiUncross: { label: "Restore RAVENOUS: it was crossed off by mistake" } }),
			opt({ slug: "red-wrath" }),
		]);
		const [cross, restore] = doc.querySelectorAll(".stonetop-pdi-crossoff-btn");
		expect(cross.tagName).toBe("BUTTON");
		expect(cross.textContent).toBe("Cross off");
		expect(cross.dataset).toMatchObject({ pdiAction: "cross-off", slug: "death-mask" });
		expect(cross.getAttribute("aria-label")).toContain("DEATH MASK");
		expect(restore.textContent).toBe("Restore");
		expect(restore.dataset).toMatchObject({ pdiAction: "uncross", slug: "ravenous" });
		expect(doc.querySelectorAll(".stonetop-pdi-crossoff-btn")).toHaveLength(2);
	});
});
