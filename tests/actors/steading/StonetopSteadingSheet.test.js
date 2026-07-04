import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStonetopSteadingSheetClass } from "../../../module/actors/steading/StonetopSteadingSheet.js";

class FakeClassList {
	constructor() { this.set = new Set(); }
	add(...classes) { classes.forEach(c => c && this.set.add(c)); }
	contains(c) { return this.set.has(c); }
}

class FakeEl {
	constructor(tag) {
		this.tagName = (tag || "div").toUpperCase();
		this.children = [];
		this.listeners = [];
		this.attrs = {};
		this.classList = new FakeClassList();
	}
	set className(value) { this.classList.set = new Set(String(value).split(/\s+/).filter(Boolean)); }
	get className() { return [...this.classList.set].join(" "); }
	set innerHTML(value) { this._innerHTML = value; }
	setAttribute(key, value) { this.attrs[key] = String(value); }
	getAttribute(key) { return this.attrs[key] ?? null; }
	addEventListener(type, fn) { this.listeners.push({ type, fn }); }
	click() {
		this.listeners.filter(l => l.type === "click")
			.forEach(l => l.fn({ preventDefault() {}, stopPropagation() {} }));
	}
	appendChild(node) { node.parent = this; this.children.push(node); return node; }
	insertBefore(node, ref) {
		node.parent = this;
		const index = this.children.indexOf(ref);
		if (index < 0) this.children.push(node);
		else this.children.splice(index, 0, node);
		return node;
	}
	_matches(selector) {
		const match = selector.match(/^([a-zA-Z]+)?(?:\.(.+))?$/);
		const tag = match?.[1] ? match[1].toUpperCase() : null;
		const cls = match?.[2] || null;
		if (tag && this.tagName !== tag) return false;
		if (cls && !this.classList.contains(cls)) return false;
		return true;
	}
	querySelector(selector) {
		const selectors = String(selector).split(",").map(s => s.trim()).filter(Boolean);
		if (selectors.length > 1) {
			for (const sel of selectors) {
				const match = this.querySelector(sel);
				if (match) return match;
			}
			return null;
		}
		for (const child of this.children) {
			if (child._matches?.(selector)) return child;
			const descendant = child.querySelector?.(selector);
			if (descendant) return descendant;
		}
		return null;
	}
}

function makeSheet({ players = [], residents = [], neighbors = [], improvements = {}, improvementDef, addResult, removeResult } = {}) {
	const typedActor = {
		_flags: { players, residents, neighbors, improvements },
		setFlags: vi.fn(async updates => {
			typedActor._flags = { ...typedActor._flags, ...updates };
		}),
		improvementDef: vi.fn(() => improvementDef ?? null),
		setImprovementCompleted: vi.fn(async () => ({ label: improvementDef?.label ?? "X", summary: [], reverted: false })),
		addCustomImprovement: vi.fn(async () => addResult ?? { ok: true, slug: "custom-x", label: "X" }),
		removeCustomImprovement: vi.fn(async () => removeResult ?? true),
	};
	const actor = {
		name: "Stonetop",
		type: "stonetop",
		typedActor,
		getFlag: vi.fn(),
	};
	const Base = class {
		constructor() { this._actor = actor; }
		get actor() { return this._actor; }
		get isEditable() { return true; }
		render() {}
	};
	const Sheet = createStonetopSteadingSheetClass(Base);
	return { sheet: new Sheet(), typedActor };
}

describe("StonetopSteadingSheet", () => {
	beforeEach(() => {
		globalThis.ui = {
			notifications: {
				info: vi.fn(),
				warn: vi.fn(),
			},
		};
	});

	it("adds dropped character actors to the players list", async () => {
		const { sheet, typedActor } = makeSheet();

		await sheet._onDropPlayerCharacter({
			id: "hero-id",
			uuid: "Actor.hero",
			name: "Wren",
			img: "wren.webp",
			type: "character",
		});

		expect(typedActor.setFlags).toHaveBeenCalledWith({
			players: [{
				id: "hero-id",
				uuid: "Actor.hero",
				name: "Wren",
				img: "wren.webp",
				checked: true,
				traits: "",
				relations: "",
				notes: "",
			}],
		});
	});

	it("does not add the same dropped character twice", async () => {
		const { sheet, typedActor } = makeSheet({
			players: [{ id: "hero-id", uuid: "Actor.hero", name: "Wren", img: "wren.webp", checked: true }],
		});

		await sheet._onDropPlayerCharacter({
			id: "hero-id",
			uuid: "Actor.hero",
			name: "Wren",
			img: "wren.webp",
			type: "character",
		});

		expect(typedActor.setFlags).not.toHaveBeenCalled();
		expect(globalThis.ui.notifications.info).toHaveBeenCalledWith("Wren is already in the players list.");
	});

	it("stores a resident portrait override from the image popout picker", async () => {
		const { sheet, typedActor } = makeSheet({
			residents: [{ name: "Wren", img: "" }],
		});

		await sheet._onMemberAvatarImageChange("residents", 0, "worlds/stonetop/wren.webp");

		expect(typedActor.setFlags).toHaveBeenCalledWith({
			residents: [{ name: "Wren", img: "worlds/stonetop/wren.webp" }],
		});
	});

	it("stores a neighbor portrait override from the image popout picker", async () => {
		const { sheet, typedActor } = makeSheet({
			neighbors: [{ name: "Tor", img: "" }],
		});

		await sheet._onMemberAvatarImageChange("neighbors", 0, "worlds/stonetop/tor.webp");

		expect(typedActor.setFlags).toHaveBeenCalledWith({
			neighbors: [{ name: "Tor", img: "worlds/stonetop/tor.webp" }],
		});
	});

	it("injects a visible edit-photo header control into editable resident image popouts", () => {
		const { sheet } = makeSheet();
		globalThis.document = { createElement: tag => new FakeEl(tag) };
		class MockImagePopout {
			constructor(src, options) {
				this.src = src;
				this.options = options;
				const header = new FakeEl("header");
				header.className = "window-header";
				const close = new FakeEl("button");
				close.className = "header-control";
				header.appendChild(close);
				this.element = new FakeEl("div");
				this.element.appendChild(header);
			}
		}
		globalThis.ImagePopout = MockImagePopout;
		const anchor = {
			src: "systems/stonetop_pwd/assets/icons/people/default_profile.svg",
			dataset: { name: "Wren", list: "residents", index: "0" },
		};
		sheet._onMemberAvatarPickImage = vi.fn();

		const popout = sheet._createEditableMemberImagePopout(anchor);
		sheet._injectMemberImageHeaderControl(popout);
		sheet._injectMemberImageHeaderControl(popout);
		const header = popout.element.querySelector(".window-header");
		const button = header.querySelector(".stonetop-edit-member-photo");

		expect(button).not.toBeNull();
		expect(button.classList.contains("header-control")).toBe(true);
		expect(button.classList.contains("fa-camera")).toBe(true);
		expect(button.getAttribute("aria-label")).toBe("Edit Photo");
		expect(header.children.filter(c => c.classList.contains("stonetop-edit-member-photo"))).toHaveLength(1);
		expect(header.children[0]).toBe(button);

		button.click();
		expect(sheet._onMemberAvatarPickImage).toHaveBeenCalledWith({
			list: "residents",
			index: 0,
			current: anchor.src,
			popout,
		});

		delete globalThis.ImagePopout;
	});

	it("refreshes the already-open member image popout after choosing a new photo", () => {
		const { sheet } = makeSheet();
		const root = new FakeEl("div");
		const img = new FakeEl("img");
		img.src = "old.webp";
		root.appendChild(img);
		const popout = {
			src: "old.webp",
			options: {},
			object: {},
			element: root,
			render: vi.fn(),
			_stonetopMemberImageEdit: { current: "old.webp" },
		};

		sheet._refreshMemberImagePopout(popout, "new.webp");

		expect(popout.src).toBe("new.webp");
		expect(popout.options.src).toBe("new.webp");
		expect(popout.object.src).toBe("new.webp");
		expect(popout._stonetopMemberImageEdit.current).toBe("new.webp");
		expect(img.src).toBe("new.webp");
		expect(img.getAttribute("src")).toBe("new.webp");
		expect(popout.render).not.toHaveBeenCalled();
	});

	it("adds a dropped steading-improvement card as a tracked improvement", async () => {
		const { sheet, typedActor } = makeSheet({ addResult: { ok: true, slug: "custom-roadbuilding", label: "ROADBUILDING" } });
		const improvement = { name: "ROADBUILDING", sections: [], effect: "..." };

		await sheet._onDropSteadingImprovement(improvement);

		expect(typedActor.addCustomImprovement).toHaveBeenCalledWith(improvement);
		expect(globalThis.ui.notifications.info).toHaveBeenCalledWith("Added steading improvement: ROADBUILDING.");
	});

	it("warns instead of adding when the improvement is already present", async () => {
		const { sheet, typedActor } = makeSheet({ addResult: { ok: false, reason: "duplicate", label: "ROADBUILDING" } });

		await sheet._onDropSteadingImprovement({ name: "ROADBUILDING" });

		expect(typedActor.addCustomImprovement).toHaveBeenCalled();
		expect(globalThis.ui.notifications.warn).toHaveBeenCalledWith("ROADBUILDING is already a steading improvement.");
	});

	it("ignores a malformed drop payload", async () => {
		const { sheet, typedActor } = makeSheet();
		await sheet._onDropSteadingImprovement(undefined);
		await sheet._onDropSteadingImprovement({ flavor: "no name" });
		expect(typedActor.addCustomImprovement).not.toHaveBeenCalled();
	});

	it("removes a custom improvement by slug", async () => {
		const { sheet, typedActor } = makeSheet();
		await sheet._onRemoveCustomImprovement("custom-roadbuilding");
		expect(typedActor.removeCustomImprovement).toHaveBeenCalledWith("custom-roadbuilding");
	});

	describe("completing an improvement whose requirements aren't all met", () => {
		const lockedDef = {
			slug: "palisade",
			label: "PALISADE",
			sections: [{ heading: "Requires:", items: ["A", "B", "C"] }],
			effect: "...",
		};

		it("offers to mark every requirement complete, then earns it when accepted", async () => {
			const { sheet, typedActor } = makeSheet({ improvementDef: lockedDef });
			globalThis.Dialog = { confirm: vi.fn(async () => true) };
			sheet.render = vi.fn();

			await sheet._onImprovementComplete("palisade", true);

			expect(globalThis.Dialog.confirm).toHaveBeenCalledTimes(1);
			// Force-completing passes the filled requirement array through to the model,
			// which persists completion and auto-applies the improvement's grants.
			expect(typedActor.setImprovementCompleted).toHaveBeenCalledWith("palisade", true, { forceR: [true, true, true] });
		});

		it("does nothing but revert the checkbox when declined", async () => {
			const { sheet, typedActor } = makeSheet({ improvementDef: lockedDef });
			globalThis.Dialog = { confirm: vi.fn(async () => false) };
			sheet.render = vi.fn();

			await sheet._onImprovementComplete("palisade", true);

			expect(typedActor.setImprovementCompleted).not.toHaveBeenCalled();
			expect(sheet.render).toHaveBeenCalledWith(false); // re-render resets the tapped checkbox
		});

		it("marks complete without prompting once the requirements are already met", async () => {
			const { sheet, typedActor } = makeSheet({
				improvementDef: lockedDef,
				improvements: { palisade: { completed: false, r: [true, true, true] } },
			});
			globalThis.Dialog = { confirm: vi.fn(async () => true) };
			sheet.render = vi.fn();

			await sheet._onImprovementComplete("palisade", true);

			expect(globalThis.Dialog.confirm).not.toHaveBeenCalled();
			expect(typedActor.setImprovementCompleted).toHaveBeenCalledWith("palisade", true, { forceR: undefined });
		});

		it("always allows un-completing a finished improvement without prompting", async () => {
			const { sheet, typedActor } = makeSheet({
				improvementDef: lockedDef,
				improvements: { palisade: { completed: true, r: [true, true, true] } },
			});
			globalThis.Dialog = { confirm: vi.fn(async () => true) };
			sheet.render = vi.fn();

			await sheet._onImprovementComplete("palisade", false);

			expect(globalThis.Dialog.confirm).not.toHaveBeenCalled();
			expect(typedActor.setImprovementCompleted).toHaveBeenCalledWith("palisade", false, { forceR: undefined });
		});

		it("surfaces a notification summarizing the auto-applied grants", async () => {
			const { sheet, typedActor } = makeSheet({
				improvementDef: lockedDef,
				improvements: { palisade: { completed: false, r: [true, true, true] } },
			});
			typedActor.setImprovementCompleted.mockResolvedValueOnce({
				label: "Palisade", summary: ["Fortunes +1", "Fortifications +Palisade"], reverted: false,
			});
			sheet.render = vi.fn();

			await sheet._onImprovementComplete("palisade", true);

			expect(globalThis.ui.notifications.info)
				.toHaveBeenCalledWith("Applied Palisade: Fortunes +1; Fortifications +Palisade.");
		});
	});
});
