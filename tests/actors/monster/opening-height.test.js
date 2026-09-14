import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStonetopMonsterSheetClass } from "../../../module/actors/monster/StonetopMonsterSheet.js";

/**
 * The monster sheet takes ONE opening measurement: the window is fitted to the Stat Block tab it
 * opens on, and never refitted afterwards (tests/actors/tabbed-sheet-height.test.js holds the
 * "never on a tab change" half at the source level). What this pins is the two ways that one
 * chance used to be carried forward to a later render, where it resized a window the reader was
 * already using.
 */

// A frame that is showing, over a Stat Block panel that may or may not be. 30px of title bar, the
// panel ending 470px below the content's top, and 10px of content padding under it: 510px.
function makeSheet() {
	const view = { statBlockShowing: true };
	const parts = {
		".window-content": { getBoundingClientRect: () => ({ top: 30 }) },
		".stonetop-monster-statblock": {
			getClientRects: () => (view.statBlockShowing ? [{}] : []),
			getBoundingClientRect: () => ({ bottom: 500 }),
		},
		".window-header": { getBoundingClientRect: () => ({ height: 30 }) },
	};
	const frame = {
		classList: { toggle() {} },
		getClientRects: () => [{}],
		querySelector: sel => parts[sel] ?? null,
	};
	const Base = class {
		get actor() { return { system: {} }; }
		async _render() {}
	};
	const sheet = new (createStonetopMonsterSheetClass(Base))();
	sheet.element = [frame];
	sheet.setPosition = vi.fn();
	// _render's header work needs a real window, and none of it is under test here.
	Object.assign(sheet, { _injectHeaderToggle() {}, _stripHeaderChrome() {}, _hideBrokenPortrait() {} });
	return { sheet, view };
}

let saved;
beforeEach(() => {
	saved = { raf: globalThis.requestAnimationFrame, style: globalThis.getComputedStyle };
	globalThis.requestAnimationFrame = cb => cb();
	globalThis.getComputedStyle = () => ({ paddingBottom: "10px" });
});
afterEach(() => {
	globalThis.requestAnimationFrame = saved.raf;
	globalThis.getComputedStyle = saved.style;
});

describe("the monster sheet's opening height", () => {
	it("fits the window to the Stat Block it opens on, once", async () => {
		const { sheet } = makeSheet();
		await sheet._render(true, {});
		expect(sheet.setPosition).toHaveBeenCalledWith({ height: 510 });
		await sheet._render(false, {});
		expect(sheet.setPosition).toHaveBeenCalledTimes(1);
	});

	// A window restored onto Notes. Left waiting, the chance was taken by the first render after
	// the reader clicked back to the Stat Block (an HP change, say), resizing the window under them.
	it("gives the chance up, rather than carrying it forward, when the window opens on another tab", async () => {
		const { sheet, view } = makeSheet();
		view.statBlockShowing = false;
		await sheet._render(true, {});
		view.statBlockShowing = true;
		await sheet._render(false, {});
		expect(sheet.setPosition).not.toHaveBeenCalled();
	});

	// The window restore hands back the height the window was left at. That is a size somebody
	// chose, and it outranks a measurement, as a remembered size already does.
	it("keeps a height the caller handed over", async () => {
		const { sheet } = makeSheet();
		await sheet._render(true, { left: 10, top: 20, width: 760, height: 620 });
		expect(sheet.setPosition).not.toHaveBeenCalled();
	});
});
