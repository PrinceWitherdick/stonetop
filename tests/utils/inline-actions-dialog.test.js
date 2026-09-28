import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// No jsdom: core's Dialog and the document are stand-ins, and core's own `_onKeyDown` is
// replaced by a spy. What is under test is only which keys this subclass hands back to the
// browser and which it still passes to core.

let createInlineActionsDialog;
const coreKeyDown = vi.fn();

beforeEach(async () => {
	coreKeyDown.mockReset();
	globalThis.Dialog = class {
		constructor(data, options) { this.data = data; this.options = options; }
		_onKeyDown(event) { coreKeyDown(event); }
	};
	vi.resetModules();
	({ createInlineActionsDialog } = await import("../../module/utils/inline-actions-dialog.js"));
});

afterEach(() => {
	delete globalThis.Dialog;
	delete globalThis.document;
});

/** A dialog whose element holds `inside` elements and, optionally, a footer button. */
function fakeDialog({ buttons = {}, defaultKey, footerButton = false, inside = [] } = {}) {
	const dialog = createInlineActionsDialog({ buttons, default: defaultKey });
	dialog.element = [{
		contains: el => inside.includes(el),
		querySelector: sel => (sel === ".dialog-button" && footerButton ? {} : null),
	}];
	return dialog;
}

const focus = el => { globalThis.document = { activeElement: el }; };

describe("createInlineActionsDialog", () => {
	it("leaves Enter on a content button to the browser, so the button is pressed", () => {
		const btn = { dataset: {} };
		const dialog = fakeDialog({ inside: [btn] });
		focus(btn);
		dialog._onKeyDown({ key: "Enter" });
		expect(coreKeyDown).not.toHaveBeenCalled();
	});

	it("still lets core submit a real footer button", () => {
		const btn = { dataset: { button: "ok" } };
		const dialog = fakeDialog({ buttons: { ok: {} }, inside: [btn] });
		focus(btn);
		dialog._onKeyDown({ key: "Enter" });
		expect(coreKeyDown).toHaveBeenCalledTimes(1);
	});

	it("still lets core run a declared default", () => {
		const input = { dataset: {} };
		const dialog = fakeDialog({ buttons: { ok: {} }, defaultKey: "ok", inside: [input] });
		focus(input);
		dialog._onKeyDown({ key: "Enter" });
		expect(coreKeyDown).toHaveBeenCalledTimes(1);
	});

	it("does not pull Tab into another window's footer when it has none of its own", () => {
		const dialog = fakeDialog();
		focus({ dataset: {} });
		dialog._onKeyDown({ key: "Tab" });
		expect(coreKeyDown).not.toHaveBeenCalled();
	});

	it("passes Escape through to core", () => {
		const dialog = fakeDialog();
		focus({ dataset: {} });
		dialog._onKeyDown({ key: "Escape" });
		expect(coreKeyDown).toHaveBeenCalledTimes(1);
	});
});
