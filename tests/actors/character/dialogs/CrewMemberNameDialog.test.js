import { describe, it, expect, vi } from "vitest";
import Handlebars from "handlebars";
import { Window } from "happy-dom";
import { readRepo } from "../../../fakes/css.js";
import {
	CrewMemberNameDialog, crewNameLists, tokenizeTrait, crewNameTraitChips, filledTrait, crewMemberNameResult,
	readCrewMemberNameForm,
} from "../../../../module/actors/character/dialogs/CrewMemberNameDialog.js";
import { CREW_INDIVIDUAL_NAMES, CREW_INDIVIDUAL_TAGS, CREW_INDIVIDUAL_TRAITS } from "../../../../module/data/steading-members.js";

// "Name this Crew Member" (Crew insert, p.144): an anonymous member of the Roster becomes a named
// individual with a name, a tag and any of the insert's traits, some of which have blanks to fill.

function render(lists) {
	const view = new CrewMemberNameDialog({ individualOptions: lists }).getData();
	const html = Handlebars.create().compile(readRepo("templates/dialogs/crew-member-name.hbs"))(view);
	const doc = new Window().document;
	doc.body.innerHTML = `<div class="window-content">${html}</div>`;
	return doc.body.firstElementChild;
}

describe("the suggestion lists", () => {
	it("are the Crew insert's own, each falling back to the shared list when it has none", () => {
		expect(crewNameLists({ names: ["Bryn"], tags: [], traits: undefined })).toEqual({
			names: ["Bryn"], tags: CREW_INDIVIDUAL_TAGS, traits: CREW_INDIVIDUAL_TRAITS,
		});
		expect(crewNameLists(undefined).names).toBe(CREW_INDIVIDUAL_NAMES);
	});
});

describe("tokenizeTrait", () => {
	it("splits text, standalone blanks and slash groups, in order", () => {
		expect(tokenizeTrait("missing eye/finger/hand/__")).toEqual([
			{ type: "text", text: "missing" }, { type: "text", text: " " },
			{ type: "opts", opts: ["eye", "finger", "hand", "__"] },
		]);
		expect(tokenizeTrait("__'s kid/sibling/__")).toEqual([
			{ type: "blank" }, { type: "text", text: "'s" }, { type: "text", text: " " },
			{ type: "opts", opts: ["kid", "sibling", "__"] },
		]);
		expect(tokenizeTrait("crush on __").at(-1)).toEqual({ type: "blank" });
		expect(tokenizeTrait("bald")).toEqual([{ type: "text", text: "bald" }]);
	});
});

describe("crewNameTraitChips", () => {
	it("draws a plain trait bare, and numbers a trait's slots in reading order", () => {
		const [plain, kin] = crewNameTraitChips(["bald", "__'s kid/sibling/__"]);
		expect(plain).toEqual({ value: "bald", simple: true, parts: [] });
		expect(kin.simple).toBe(false);
		expect(kin.parts).toEqual([
			{ blank: true, slot: 0 },
			{ text: "'s" }, { text: " " },
			{ opts: true, slot: 1, display: "kid/sibling/___", listId: "trait-opts-1-1", options: ["kid", "sibling"] },
		]);
	});
});

describe("filling a ticked trait", () => {
	it("puts each slot's answer back in, by slot", () => {
		expect(filledTrait("__'s kid/sibling/__", ["Wren", "cousin"])).toBe("Wren's cousin");
		expect(filledTrait("grudge against __", [" the miller "])).toBe("grudge against the miller");
	});

	it("leaves an empty blank as __, and an empty slash group at its first real choice", () => {
		expect(filledTrait("__'s kid/sibling/__", [])).toBe("__'s kid");
		expect(filledTrait("missing eye/hand/__", ["  "])).toBe("missing eye");
		expect(filledTrait("bald")).toBe("bald");
	});
});

describe("the dialog's answer", () => {
	it("is the trimmed name and tag and the filled traits", () => {
		expect(crewMemberNameResult({
			name: " Aled ", tag: " eager ", picks: [{ trait: "bald" }, { trait: "crush on __", slots: ["Eira"] }],
		})).toEqual({ name: "Aled", tag: "eager", traits: ["bald", "crush on Eira"] });
	});

	it("is nothing without a name, so a nameless Save writes nothing", () => {
		expect(crewMemberNameResult({ name: "   ", tag: "eager" })).toBeNull();
		expect(crewMemberNameResult()).toBeNull();
	});
});

describe("the window", () => {
	it("keeps the v1 Dialog's shell, which the .stonetop-individual-dialog rules are written against", () => {
		const root = render({});
		expect([...root.children].map(el => el.className)).toEqual(["dialog-content", "dialog-buttons"]);
		const save = root.querySelector(".dialog-buttons > button");
		expect(save.dataset.button).toBe("save");
		expect(save.classList.contains("dialog-button")).toBe(true);
		expect(save.querySelector("i.fas.fa-user-pen")).not.toBeNull();
		expect(save.textContent.trim()).toBe("Save");
		expect(CrewMemberNameDialog.defaultOptions).toMatchObject({
			title: "Name this Crew Member", width: 540, height: "auto",
			classes: ["dialog", "stonetop", "stonetop-individual-dialog"],
		});
		expect(CrewMemberNameDialog.defaultOptions.id).toBeUndefined();
	});

	it("draws the name and tag combos and a chip per trait, slots hidden until ticked", () => {
		const root = render({ names: ["Bryn", "Cadi"], tags: ["eager"], traits: ["bald", "missing eye/hand/__", "crush on __"] });
		const form = root.querySelector(".dialog-content > form.stonetop-individual-form");
		expect([...form.querySelectorAll("#ind-names option")].map(o => o.value)).toEqual(["Bryn", "Cadi"]);
		expect(form.querySelector("[name='ind-name']").getAttribute("list")).toBe("ind-names");
		expect(form.querySelector("[name='ind-tag']").getAttribute("list")).toBe("ind-tags");
		const groups = [...form.querySelectorAll(".stonetop-individual-traits-grid > .stonetop-trait-chip-group")];
		expect(groups.map(g => g.querySelector("[name='traits']").value)).toEqual(["bald", "missing eye/hand/__", "crush on __"]);
		// A plain trait is a bare chip; one with slots carries its trait and draws part by part.
		expect(groups[0].hasAttribute("data-trait")).toBe(false);
		expect(groups[0].querySelector(".stonetop-individual-trait-chip").textContent.trim()).toBe("bald");
		expect(groups[1].dataset.trait).toBe("missing eye/hand/__");
		const combo = groups[1].querySelector(".stonetop-trait-select");
		expect(combo.dataset.slot).toBe("0");
		expect(combo.getAttribute("list")).toBe("trait-opts-1-0");
		expect(combo.style.display).toBe("none");
		expect([...groups[1].querySelectorAll("#trait-opts-1-0 option")].map(o => o.value)).toEqual(["eye", "hand"]);
		expect(groups[1].querySelector(".stonetop-trait-blank").textContent).toBe("eye/hand/___");
		expect(groups[2].querySelector(".stonetop-trait-fill").dataset.slot).toBe("0");
	});

	it("reads the ticked traits and their slots back off the form", () => {
		const root = render({ traits: ["bald", "__'s kid/sibling/__", "snores"] });
		root.querySelector("[name='ind-name']").value = "Aled";
		root.querySelector("[name='ind-tag']").value = "eager";
		const [bald, kin] = root.querySelectorAll("[name='traits']");
		bald.checked = true;
		kin.checked = true;
		const group = kin.closest(".stonetop-trait-chip-group");
		group.querySelector(".stonetop-trait-fill[data-slot='0']").value = "Wren";
		group.querySelector(".stonetop-trait-select[data-slot='1']").value = "";
		const form = readCrewMemberNameForm(root);
		expect(form).toEqual({
			name: "Aled", tag: "eager",
			picks: [{ trait: "bald", slots: [] }, { trait: "__'s kid/sibling/__", slots: ["Wren", ""] }],
		});
		expect(crewMemberNameResult(form)).toEqual({ name: "Aled", tag: "eager", traits: ["bald", "Wren's kid"] });
	});

	it("Save settles promise() with the answer read off its own window", () => {
		const root = render({ traits: ["bald"] });
		root.querySelector("[name='ind-name']").value = "Cadi";
		const dialog = new CrewMemberNameDialog({ individualOptions: { traits: ["bald"] } });
		dialog.element = [root];
		const settle = vi.spyOn(dialog, "_resolveWith").mockImplementation(() => {});
		dialog._save();
		expect(settle).toHaveBeenCalledWith({ name: "Cadi", tag: "", traits: [] });
	});
});
