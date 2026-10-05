import { describe, it, expect, vi, afterEach } from "vitest";
import { ThreatEditorDialog } from "../../module/threats/threat-editor-dialog.js";

// The editor skips re-rendering under its own rich-text save. The save's option reaches every
// client, and appId is a per-client counter, so a match alone does not make the save this one's.
describe("ThreatEditorDialog page sync", () => {
	const page = { id: "p1", name: "The Hollow King" };
	const dialogFor = () => {
		const dialog = new ThreatEditorDialog(page);
		dialog.appId = 42;
		Object.defineProperty(dialog, "rendered", { get: () => true });
		dialog.render = vi.fn();
		return dialog;
	};

	afterEach(() => { delete game.user; });

	it("does not re-render under its own rich save", () => {
		game.user = { id: "gm-a" };
		const dialog = dialogFor();
		dialog._onUpdate(page, {}, { threatEditorRichSave: 42 }, "gm-a");
		expect(dialog.render).not.toHaveBeenCalled();
	});

	it("re-renders for another user's save, even one tagged with the same appId", () => {
		game.user = { id: "gm-b" };
		const dialog = dialogFor();
		dialog._onUpdate(page, {}, { threatEditorRichSave: 42 }, "gm-a");
		expect(dialog.render).toHaveBeenCalledWith(false);
	});
});
