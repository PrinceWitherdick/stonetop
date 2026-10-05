import { describe, it, expect, vi } from "vitest";
import { buildLiveCharacter } from "../../fakes/LiveCharacter.js";

// The standing lists (brands, oaths, the Blessed's marks) are written whole, one array per flag. The
// document takes a write only once the server answers, so two writes in quick succession (a note
// blurred, then a tick clicked) used to both read the list from before the first, and the second
// put the first's change back. StonetopCharacter#_rosterWrite queues them per actor and flag.

/** A character whose flag writes land a moment late, as they do over a socket. */
function laggedCharacter() {
	const { char, actor } = buildLiveCharacter({ slug: "the-judge", name: "The Judge", seedStartingMoves: false });
	const store = actor.setFlag;
	actor.setFlag = vi.fn(async (...args) => {
		await new Promise(resolve => setTimeout(resolve, 5));
		return store(...args);
	});
	return { char, actor };
}

describe("two roster writes in quick succession", () => {
	it("keeps a note blurred just before the broken tick", async () => {
		const { char } = laggedCharacter();
		const sworn = await char.witnessOath({ name: "Gethin", note: "to bring the herd back" });
		const note  = char.setOathNote(sworn.id, "to bring the herd back by Midsummer");
		const tick  = char.setOathBroken(sworn.id, true);
		await Promise.all([note, tick]);
		expect(char.oaths).toEqual([expect.objectContaining({
			id: sworn.id, note: "to bring the herd back by Midsummer", broken: true,
		})]);
	});

	it("keeps both of two brands laid at once", async () => {
		const { char } = laggedCharacter();
		await Promise.all([
			char.brandCondemned({ name: "Brennan", uuid: "Actor.brennan" }),
			char.brandCondemned({ name: "The Claws" }),
		]);
		expect(char.condemned.map(b => b.name)).toEqual(["Brennan", "The Claws"]);
	});

	it("does not stall behind a write that failed", async () => {
		const { char, actor } = laggedCharacter();
		const lagged = actor.setFlag;
		actor.setFlag = vi.fn().mockRejectedValueOnce(new Error("socket")).mockImplementation(lagged);
		await expect(char.layBlessedMark({ name: "Aeronwen", kind: "barkskin" })).rejects.toThrow("socket");
		expect(await char.layBlessedMark({ name: "Aeronwen", kind: "barkskin" })).toMatchObject({ name: "Aeronwen" });
		expect(char.blessedMarks).toHaveLength(1);
	});

	it("still reports a Loyalty spend's end, and writes nothing for a no-op", async () => {
		const { char, actor } = laggedCharacter();
		const beast = await char.layBlessedMark({ name: "Crow", kind: "beast" });
		actor.setFlag.mockClear();
		expect(await char.setBlessedMarkLoyalty(beast.id, 3)).toEqual({ changed: null, ended: false });
		expect(actor.setFlag).not.toHaveBeenCalled();
		const spent = await char.setBlessedMarkLoyalty(beast.id, 0, { liftOnEnd: true });
		expect(spent.ended).toBe(true);
		expect(char.blessedMarks).toEqual([]);
	});
});
