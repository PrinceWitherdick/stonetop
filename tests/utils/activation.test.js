// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { onCapture, onActivate } from "../../module/utils/activation.js";

// The capture-phase delegation the character sheet, the section fold caret and the relationship
// board's name links share: the control is claimed before anything bound deeper sees the event.

function mount(html) {
	const root = document.createElement("div");
	root.innerHTML = html;
	document.body.appendChild(root);
	return root;
}

const key = (el, k) => {
	const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
	el.dispatchEvent(ev);
	return ev;
};

describe("onCapture", () => {
	it("claims the control's event before a handler bound on the control itself", () => {
		const root = mount(`<span class="ctl"><i class="inner"></i></span>`);
		const deeper = vi.fn();
		root.querySelector(".ctl").addEventListener("click", deeper);
		const fn = vi.fn();
		onCapture(root, "click", ".ctl", fn);
		root.querySelector(".inner").click();
		expect(fn).toHaveBeenCalledWith(root.querySelector(".ctl"), expect.any(Event));
		expect(deeper).not.toHaveBeenCalled();
	});

	it("lets a refused control's event travel on untouched", () => {
		const root = mount(`<span class="ctl"></span>`);
		const deeper = vi.fn();
		root.querySelector(".ctl").addEventListener("click", deeper);
		const fn = vi.fn();
		onCapture(root, "click", ".ctl", fn, () => false);
		root.querySelector(".ctl").click();
		expect(fn).not.toHaveBeenCalled();
		expect(deeper).toHaveBeenCalled();
	});
});

describe("onActivate", () => {
	it("acts on a click, and on Enter and Space with their default prevented", () => {
		const root = mount(`<span class="ctl" tabindex="0"></span>`);
		const fn = vi.fn();
		onActivate(root, ".ctl", fn);
		const ctl = root.querySelector(".ctl");
		ctl.click();
		expect(key(ctl, "Enter").defaultPrevented).toBe(true);
		expect(key(ctl, " ").defaultPrevented).toBe(true);
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it("leaves other keys, and keys outside the control, alone", () => {
		const root = mount(`<span class="ctl" tabindex="0"></span><input class="field">`);
		const fn = vi.fn();
		onActivate(root, ".ctl", fn);
		expect(key(root.querySelector(".ctl"), "a").defaultPrevented).toBe(false);
		expect(key(root.querySelector(".field"), " ").defaultPrevented).toBe(false);
		expect(fn).not.toHaveBeenCalled();
	});
});
