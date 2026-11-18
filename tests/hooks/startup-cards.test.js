import { describe, it, expect, vi, beforeEach } from "vitest";

// The welcome greeting and the "import your book art" reminder are latched once per world, but the
// latch is read on every GM client: two GMs whose `ready` lands together would both read it unset
// and both post. Only the primary GM posts them, the same gate the art offers use.

const settings = new Map();
vi.mock("../../module/settings.js", () => ({
	getSetting: key => settings.get(key),
	setSetting: async (key, value) => { settings.set(key, value); },
}));
const whisperGm = vi.fn(async () => {});
vi.mock("../../module/utils/chat.js", () => ({
	stonetopChatCard: (title, body) => `${title}${body}`,
	whisperGm: (...args) => whisperGm(...args),
}));
vi.mock("../../module/dialogs/walkthrough-resume.js", () => ({ pastWelcomeGuide: () => true }));
vi.mock("../../module/book2-art/reapply.js", () => ({ hasImportedBook2Art: async () => false }));
vi.mock("../../module/book2-art/offer-once.js", () => ({ offerDurableArtOnce: async () => {} }));
vi.mock("../../module/seasons/fxmaster-suggestion.js", () => ({ postFxMasterSuggestionOnce: async () => {} }));
vi.mock("../../module/combat/attack-fx-suggestion.js", () => ({ postAttackFxSuggestionOnce: async () => {} }));
vi.mock("../../module/hooks/StonetopSingleton.js", () => ({ remindDestinedOmenRoll: async () => {} }));

const { postStartupCards } = await import("../../module/hooks/startup-cards.js");

const PRIMARY = { id: "gm1", isGM: true, active: true };
const SECOND = { id: "gm2", isGM: true, active: true };

function asUser(user) {
	const users = [PRIMARY, SECOND];
	global.game = { ...global.game, user, users: Object.assign(users, { activeGM: PRIMARY }) };
}

describe("postStartupCards", () => {
	let create;
	beforeEach(() => {
		settings.clear();
		whisperGm.mockClear();
		create = vi.fn(async () => ({}));
		global.ChatMessage = { create };
	});

	it("posts the greeting and the art reminder on the primary GM's client", async () => {
		asUser(PRIMARY);
		await postStartupCards();
		expect(create).toHaveBeenCalledTimes(1);
		expect(whisperGm).toHaveBeenCalledTimes(1);
		expect(settings.get("startupWelcomeShown")).toBe(true);
		expect(settings.get("book2ArtReminderShown")).toBe(true);
	});

	it("posts neither on a second GM's client, and leaves the latches for the primary", async () => {
		asUser(SECOND);
		await postStartupCards();
		expect(create).not.toHaveBeenCalled();
		expect(whisperGm).not.toHaveBeenCalled();
		expect(settings.has("startupWelcomeShown")).toBe(false);
		expect(settings.has("book2ArtReminderShown")).toBe(false);
	});

	it("posts neither on a player's client", async () => {
		asUser({ id: "p1", isGM: false, active: true });
		await postStartupCards();
		expect(create).not.toHaveBeenCalled();
		expect(whisperGm).not.toHaveBeenCalled();
	});
});
