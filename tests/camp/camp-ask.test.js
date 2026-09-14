import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { CAMP_STATUS } from "../../module/camp/camp-rules.js";
import { hostCamp, joinCamp } from "../../module/camp/camp-store.js";
import { askWithButtons, confirmLeavingOwnCamp } from "../../module/camp/camp-ask.js";
import { campParty, restoreCampWorld } from "../fakes/camp.js";

/**
 * The questions a camp asks: a dialog whose buttons name what they do, and the one question that
 * stands between another camp and whoever would break it up by walking away from it.
 */

const SETUP_APPLICATIONS = globalThis.foundry.applications;
let wait;

beforeEach(() => {
	wait = vi.fn(async () => null);
	globalThis.foundry.applications = {
		...SETUP_APPLICATIONS,
		api: { ...SETUP_APPLICATIONS?.api, DialogV2: { wait } },
	};
});

afterEach(() => {
	globalThis.foundry.applications = SETUP_APPLICATIONS;
	restoreCampWorld();
});

describe("a camp's question", () => {
	it("answers with the value of the button pressed", async () => {
		wait.mockResolvedValue("host");
		const answer = await askWithButtons({
			title:   "Make Camp",
			content: "<p>Which fire?</p>",
			buttons: [
				{ key: "join0", icon: "fa-campground", label: "Join Aeliana's camp", value: { camp: 1 } },
				{ key: "host", label: "Make a separate camp", value: { host: true } },
			],
		});
		expect(answer).toEqual({ host: true });
	});

	// Closing the window is not pressing anything, and must not throw either.
	it("answers null when the window is closed without a button", async () => {
		wait.mockResolvedValue(null);
		expect(await askWithButtons({ title: "Make Camp", content: "", buttons: [{ key: "go", label: "Go", value: true }] })).toBeNull();
		expect(wait).toHaveBeenCalledWith(expect.objectContaining({ rejectClose: false }));
	});

	// DialogV2 writes the label as innerText, so escaping it too would print "Aeliana's" as "Aeliana&#x27;s".
	it("names each button in plain text, in the system's dialog chrome, with Enter on the button asked for", async () => {
		await askWithButtons({
			title:   "Break up the camp?",
			content: "<p>Nobody eats.</p>",
			buttons: [
				{ key: "break", icon: "fa-person-walking", label: "Break up Aeliana's camp", value: true },
				{ key: "keep", label: "Keep the camp", value: false },
			],
			defaultKey: "keep",
		});
		const options = wait.mock.calls[0][0];
		expect(options.classes).toEqual(expect.arrayContaining(["stonetop", "stonetop-camp-ask"]));
		expect(options.window).toEqual({ title: "Break up the camp?" });
		expect(options.buttons).toEqual([
			{ action: "break", label: "Break up Aeliana's camp", default: false, icon: "fas fa-person-walking" },
			{ action: "keep", label: "Keep the camp", default: true },
		]);
	});
});

describe("leaving a camp you opened", () => {
	it("asks nothing of somebody who is not hosting", async () => {
		const { aeliana, bram } = campParty();
		await joinCamp(bram, await hostCamp(aeliana));
		expect(await confirmLeavingOwnCamp(bram, "another-camp")).toBe(true);
		expect(wait).not.toHaveBeenCalled();
	});

	it("asks nothing of a host sitting alone", async () => {
		const { aeliana } = campParty();
		await hostCamp(aeliana);
		expect(await confirmLeavingOwnCamp(aeliana, "another-camp")).toBe(true);
		expect(wait).not.toHaveBeenCalled();
	});

	it("keeps a host with company at their fire unless told to break it up", async () => {
		const { aeliana, bram } = campParty();
		await joinCamp(bram, await hostCamp(aeliana));
		wait.mockResolvedValue("stay");
		expect(await confirmLeavingOwnCamp(aeliana, "another-camp")).toBe(false);
		expect(wait.mock.calls[0][0].content).toContain("Bram is sitting at");
		expect(aeliana.flags[SYSTEM_ID].camp.status).toBe(CAMP_STATUS.OPEN);
	});

	it("breaks the host's camp up when told to", async () => {
		const { aeliana, bram } = campParty();
		await joinCamp(bram, await hostCamp(aeliana));
		wait.mockResolvedValue("leave");
		expect(await confirmLeavingOwnCamp(aeliana, "another-camp")).toBe(true);
		expect(aeliana.flags[SYSTEM_ID].camp.status).toBe(CAMP_STATUS.CANCELLED);
	});
});
