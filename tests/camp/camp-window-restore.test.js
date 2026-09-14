import { afterEach, describe, expect, it, vi } from "vitest";

// Passed straight through to the opener, so what is asserted is the window the reopen mints.
vi.mock("../../module/utils/open-or-focus.js", () => ({ openOrFocus: vi.fn((_id, open) => open()) }));

import { readRepo } from "../fakes/css.js";
import { breakCamp, hostCamp, joinCamp } from "../../module/camp/camp-store.js";
import { CampWindow, campWindowId, reopenCampWindow } from "../../module/camp/CampWindow.js";
import { openOrFocus } from "../../module/utils/open-or-focus.js";
import { StonetopDialog } from "../../module/utils/stonetop-dialog.js";
import { campParty, restoreCampWorld } from "../fakes/camp.js";

/**
 * A camp window left open when Foundry reloads comes back with the sheets (utils/window-restore.js),
 * and only while there is still a camp for this client to be at.
 */

afterEach(() => {
	restoreCampWorld();
	openOrFocus.mockClear();
});

describe("a camp window across a reload", () => {
	it("is saved under its camp and its host", () => {
		expect(new CampWindow({ campId: "c1", hostId: "aeliana" }).restoreKey).toBe("camp:c1:aeliana");
	});

	it("comes back for a player whose character is still at the open camp", async () => {
		const { aeliana } = campParty();
		const camp = await hostCamp(aeliana);
		const app = reopenCampWindow(`camp:${camp.campId}:aeliana`);
		expect(app).toBeInstanceOf(CampWindow);
		expect(app.restoreKey).toBe(`camp:${camp.campId}:aeliana`);
		// Through openOrFocus, so an Open the camp pressed before the restore draws it finds this window.
		expect(openOrFocus).toHaveBeenCalledWith(campWindowId(camp.campId), expect.any(Function));
	});

	it("stays shut once the camp is over", async () => {
		const { aeliana } = campParty();
		const camp = await hostCamp(aeliana);
		await breakCamp(aeliana);
		expect(reopenCampWindow(`camp:${camp.campId}:aeliana`)).toBeNull();
	});

	// The same rule that closes an open window on a player: nobody they own is left at the fire.
	it("stays shut for a player with nobody at the fire, and comes back for the GM", async () => {
		const { aeliana, bram, act } = campParty({ me: "player-2" });
		const camp = await hostCamp(aeliana);
		expect(reopenCampWindow(`camp:${camp.campId}:aeliana`)).toBeNull();
		act("gm");
		expect(reopenCampWindow(`camp:${camp.campId}:aeliana`)).toBeInstanceOf(CampWindow);
		act("player-2");
		await joinCamp(bram, camp);
		expect(reopenCampWindow(`camp:${camp.campId}:aeliana`)).toBeInstanceOf(CampWindow);
	});

	// A reload mints the window at once and draws it a moment later, staggered behind the other windows,
	// and the watch that closes a window over a camp that is over is only wired by a draw.
	it("draws nothing if the camp is over by the time the restore gets round to drawing it", async () => {
		const { aeliana } = campParty();
		const camp = await hostCamp(aeliana);
		const app = reopenCampWindow(`camp:${camp.campId}:aeliana`);
		const draw = vi.spyOn(StonetopDialog.prototype, "_render").mockImplementation(async () => {});
		try {
			await breakCamp(aeliana);
			await app._render(true);
			expect(draw).not.toHaveBeenCalled();
		} finally {
			draw.mockRestore();
		}
	});

	it("draws as usual while the camp is still open", async () => {
		const { aeliana } = campParty();
		const camp = await hostCamp(aeliana);
		const app = reopenCampWindow(`camp:${camp.campId}:aeliana`);
		const draw = vi.spyOn(StonetopDialog.prototype, "_render").mockImplementation(async () => {});
		try {
			await app._render(true);
			expect(draw).toHaveBeenCalledTimes(1);
		} finally {
			draw.mockRestore();
		}
	});

	it("reopens nothing from a key that is not a whole camp's", () => {
		campParty();
		expect(reopenCampWindow("camp:c1")).toBeNull();
		expect(reopenCampWindow("other:c1:aeliana")).toBeNull();
		expect(openOrFocus).not.toHaveBeenCalled();
	});

	it("is registered with window restore when the system loads", () => {
		expect(readRepo("stonetop.js")).toMatch(/^registerCampWindowRestore\(\);$/m);
	});
});
