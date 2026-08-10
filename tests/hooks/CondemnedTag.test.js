import { afterEach, describe, expect, it, vi } from "vitest";
import { onUpdateCondemned } from "../../module/hooks/CondemnedTag.js";
import { CONDEMNED_FLAG } from "../../module/actors/character/condemn.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// The brand is stored on the JUDGE but WORN by the person branded, so Foundry re-renders the
// wrong sheets: the one document that changed is the Judge's. This hook repaints the targets.
//
// What it must NOT do is repaint all of them on every touch of the flag. A note typed into the
// roster fires an update per blur, and a target's tag renders only `by` / `byLabel` — the
// Judges' names — so a note can never change what any target sheet draws.

const uuidOf = (id) => `Actor.${id}`;

/** A rendered actor sheet standing in for an open window. */
function sheet(id, { tagged = false } = {}) {
	return {
		document: { documentName: "Actor", uuid: uuidOf(id), id },
		rendered: true,
		render: vi.fn(),
		// The DOM probe the unseeded fallback path uses.
		element: { querySelector: (sel) => (tagged && sel === ".stonetop-condemned-tag" ? {} : null) },
	};
}

/** A Judge whose stored list is `entries`. */
function judge(entries) {
	return {
		id: "judge-1",
		type: "character",
		getFlag: (scope, key) => (scope === SYSTEM_ID && key === CONDEMNED_FLAG ? entries : undefined),
	};
}

const brand = (id, note = "") => ({ id: `b-${id}`, name: `Target ${id}`, uuid: uuidOf(id), note });

/** The update payload shape this hook gates on. */
const wrote = (entries) => ({ flags: { [SYSTEM_ID]: { [CONDEMNED_FLAG]: entries } } });

function openSheets(...sheets) {
	globalThis.ui = { windows: Object.fromEntries(sheets.map((s, i) => [i, s])) };
	return sheets;
}

afterEach(() => { globalThis.ui = {}; });

describe("onUpdateCondemned", () => {
	// The first change seen for a Judge has nothing to diff against, so it falls back to the
	// conservative sweep: everyone currently listed, plus anyone already wearing a stale tag.
	it("repaints the listed target and a sheet showing a now-stale tag on the first change", () => {
		const a = sheet("a");
		const stale = sheet("b", { tagged: true });
		const untouched = sheet("c");
		openSheets(a, stale, untouched);

		onUpdateCondemned(judge([brand("a")]), wrote([brand("a")]));

		expect(a.render).toHaveBeenCalledWith(false);
		expect(stale.render).toHaveBeenCalledWith(false);
		expect(untouched.render).not.toHaveBeenCalled();
	});

	// Once the list is known, only the person whose brand was laid or lifted can be showing the
	// wrong thing — everyone else's tag is already correct.
	it("repaints only the target whose brand was laid, once the list is known", () => {
		const a = sheet("a");
		const b = sheet("b");
		openSheets(a, b);
		const j = judge([brand("a")]);
		onUpdateCondemned(j, wrote([brand("a")]));      // seeds
		a.render.mockClear(); b.render.mockClear();

		const both = [brand("a"), brand("b")];
		onUpdateCondemned(judge(both), wrote(both));

		expect(b.render).toHaveBeenCalledWith(false);
		expect(a.render).not.toHaveBeenCalled();
	});

	it("repaints the target whose brand was lifted", () => {
		const a = sheet("a");
		const b = sheet("b");
		openSheets(a, b);
		const both = [brand("a"), brand("b")];
		onUpdateCondemned(judge(both), wrote(both));    // seeds
		a.render.mockClear(); b.render.mockClear();

		onUpdateCondemned(judge([brand("a")]), wrote([brand("a")]));

		expect(b.render).toHaveBeenCalledWith(false);
		expect(a.render).not.toHaveBeenCalled();
	});

	// The reason the diff exists: a note fires an update on every blur, and no target sheet
	// draws a note. Before this, each one cost a full getData + render on every open sheet.
	it("repaints nothing when only a note changed", () => {
		const a = sheet("a");
		openSheets(a);
		onUpdateCondemned(judge([brand("a")]), wrote([brand("a")]));    // seeds
		a.render.mockClear();

		const noted = [brand("a", "burned the mill")];
		onUpdateCondemned(judge(noted), wrote(noted));

		expect(a.render).not.toHaveBeenCalled();
	});

	it("ignores updates that did not touch the brand list", () => {
		const a = sheet("a", { tagged: true });
		openSheets(a);

		onUpdateCondemned(judge([brand("a")]), { flags: { [SYSTEM_ID]: { holyLight: true } } });
		onUpdateCondemned(judge([brand("a")]), { name: "Aldric the Just" });
		onUpdateCondemned({ ...judge([]), type: "npc" }, wrote([]));

		expect(a.render).not.toHaveBeenCalled();
	});

	// A sheet must never re-render itself out from under the Judge who is mid-edit in the roster.
	it("never repaints the Judge's own sheet", () => {
		const j = judge([]);
		const own = { ...sheet("judge-1"), document: j };
		openSheets(own);

		onUpdateCondemned(j, wrote([]));

		expect(own.render).not.toHaveBeenCalled();
	});
});
