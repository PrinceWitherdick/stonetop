import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/camp/CampWindow.js", () => ({ openCampWindow: vi.fn() }));
// The break-up question is camp-ask.test.js's; here every host with company agrees to it.
vi.mock("../../module/camp/camp-ask.js", () => ({ askWithButtons: vi.fn(), confirmLeavingOwnCamp: vi.fn(async () => true) }));

import { SYSTEM_ID } from "../../module/system-id.js";
import { CAMP_STATUS } from "../../module/camp/camp-rules.js";
import { hostCamp, joinCamp } from "../../module/camp/camp-store.js";
import { openCampWindow } from "../../module/camp/CampWindow.js";
import { askWithButtons } from "../../module/camp/camp-ask.js";
import { openMakeCamp, wireCampCard } from "../../module/camp/camp-flow.js";
import { campParty, restoreCampWorld } from "../fakes/camp.js";

/**
 * The two ways into a camp: the Make Camp move on a sheet, and the Join button on the card a new
 * camp posts. The window itself is stubbed; what is tested is who sits down, where, and when.
 */

beforeEach(() => {
	openCampWindow.mockReset();
	askWithButtons.mockReset();
});

afterEach(restoreCampWorld);

describe("Make Camp, from a sheet", () => {
	it("makes no camp for the dead", async () => {
		const { aeliana } = campParty({ aeliana: { pastDeath: "dead" } });
		await openMakeCamp(aeliana);
		expect(ui.notifications.warn).toHaveBeenCalledWith("Aeliana is dead, and cannot make camp.");
		expect(aeliana.update).not.toHaveBeenCalled();
		expect(openCampWindow).not.toHaveBeenCalled();
	});

	it("opens the camp a character is already sitting at, writing nothing", async () => {
		const { aeliana, bram, act } = campParty();
		const camp = await hostCamp(aeliana);
		await joinCamp(bram, camp);
		bram.update.mockClear();
		act("player-2");
		await openMakeCamp(bram);
		expect(openCampWindow).toHaveBeenCalledWith(camp.campId, "aeliana");
		expect(bram.update).not.toHaveBeenCalled();
	});

	it("opens a new camp and tells the table, when nobody else is making one", async () => {
		const { aeliana } = campParty();
		await openMakeCamp(aeliana);
		const record = aeliana.flags[SYSTEM_ID].camp;
		expect(record).toMatchObject({ host: "aeliana", status: CAMP_STATUS.OPEN });
		expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
			flags: { [SYSTEM_ID]: { campJoin: { campId: record.id, hostId: "aeliana" } } },
		}));
		expect(openCampWindow).toHaveBeenCalledWith(record.id, "aeliana");
		expect(askWithButtons).not.toHaveBeenCalled();
	});

	// A split party makes two camps, and the move cannot tell a second fire from a mistake.
	it("asks before sitting a character down at somebody else's camp", async () => {
		const { aeliana, bram, act } = campParty();
		const camp = await hostCamp(aeliana);
		act("player-2");
		askWithButtons.mockResolvedValue({ camp: { ...camp, hostName: "Aeliana" } });
		await openMakeCamp(bram);
		expect(askWithButtons).toHaveBeenCalledTimes(1);
		expect(bram.flags[SYSTEM_ID].camp).toMatchObject({ id: camp.campId, host: "aeliana" });
		expect(openCampWindow).toHaveBeenCalledWith(camp.campId, "aeliana");
	});

	it("does nothing when that question is closed without an answer", async () => {
		const { aeliana, bram, act } = campParty();
		await hostCamp(aeliana);
		act("player-2");
		askWithButtons.mockResolvedValue(null);
		await openMakeCamp(bram);
		expect(bram.update).not.toHaveBeenCalled();
		expect(openCampWindow).not.toHaveBeenCalled();
	});

	it("sits nobody down for a player who cannot write the character", async () => {
		const { bram } = campParty({ me: "player-1" });
		await openMakeCamp(bram);
		expect(ui.notifications.warn).toHaveBeenCalledWith("Only Bram's player or the GM can bring Bram to a camp.");
		expect(bram.update).not.toHaveBeenCalled();
	});
});

/** A join card's message, flagged with the camp its button leads to. */
function cardFor(camp) {
	return { getFlag: (scope, key) => (scope === SYSTEM_ID && key === "campJoin" ? camp : undefined) };
}

/** Just enough of a rendered join card for the wiring: the slot and its one button. */
function cardDom() {
	let onClick = null;
	const button = {
		innerHTML: '<i class="fas fa-campground"></i> Join the camp',
		disabled: false,
		addEventListener: (type, fn) => { if (type === "click") onClick = fn; },
		click: () => onClick?.({ preventDefault() {} }),
	};
	const slot = { innerHTML: "", querySelector: sel => (sel === ".stonetop-camp-join" ? button : null) };
	return { root: { querySelector: sel => (sel === "[data-camp-join]" ? slot : null) }, slot, button };
}

describe("a camp's join card", () => {
	it("says how the camp ended, in place of its button", async () => {
		const { aeliana } = campParty();
		const camp = await hostCamp(aeliana);
		aeliana.flags[SYSTEM_ID].camp.status = CAMP_STATUS.CANCELLED;
		const { root, slot } = cardDom();
		wireCampCard(cardFor(camp), root);
		// Escaped into the card, apostrophe and all, so the name is matched apart from it.
		expect(slot.innerHTML).toContain("Aeliana");
		expect(slot.innerHTML).toContain("camp broke up before anyone ate.");
	});

	it("opens the camp for someone already sitting at it", async () => {
		const { aeliana } = campParty();
		const camp = await hostCamp(aeliana);
		const { root, button } = cardDom();
		wireCampCard(cardFor(camp), root);
		expect(button.innerHTML).toContain("Open the camp");
		await button.click();
		expect(openCampWindow).toHaveBeenCalledWith(camp.campId, "aeliana");
	});

	it("sits the reader's own character down, then opens the camp", async () => {
		const { aeliana, bram, act } = campParty();
		const camp = await hostCamp(aeliana);
		act("player-2");
		const { root, button } = cardDom();
		wireCampCard(cardFor(camp), root);
		expect(button.innerHTML).toContain("Join the camp");
		await button.click();
		expect(bram.flags[SYSTEM_ID].camp).toMatchObject({ id: camp.campId, host: "aeliana" });
		expect(openCampWindow).toHaveBeenCalledWith(camp.campId, "aeliana");
	});

	it("lets a GM with no character of their own open the camp to run it", async () => {
		const { aeliana, bram, act } = campParty();
		const camp = await hostCamp(aeliana);
		act("gm");
		const { root, button } = cardDom();
		wireCampCard(cardFor(camp), root);
		expect(button.innerHTML).toContain("Open the camp");
		await button.click();
		expect(bram.update).not.toHaveBeenCalled();
		expect(openCampWindow).toHaveBeenCalledWith(camp.campId, "aeliana");
	});
});
