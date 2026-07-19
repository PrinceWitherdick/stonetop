// Wounds — the 4th harm track (Book I, Harm & Healing). Drives the REAL
// StonetopCharacter CRUD against the stateful LiveCharacter harness (its `update`
// actually writes system.attributes.wounds), then reads the result back through
// buildSnapshot() exactly as the sheet does. Lifecycle *transitions* driven by the
// Recover/Convalesce moves are covered separately once those are wired (Slice 2).

import { describe, it, expect } from "vitest";
import { buildLiveCharacter } from "../../fakes/LiveCharacter.js";

function build() {
	return buildLiveCharacter({ slug: "the-heavy", name: "The Heavy" });
}

async function wounds(char) {
	return (await char.buildSnapshot()).wounds;
}

describe("StonetopCharacter wounds", () => {
	it("starts with no wounds", async () => {
		const { char } = build();
		expect(await wounds(char)).toEqual([]);
	});

	it("addWound stores a problematic 'wound'-origin record and returns its id", async () => {
		const { char } = build();
		const id = await char.addWound({ text: "Twisted ankle" });
		expect(typeof id).toBe("string");
		const list = await wounds(char);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({
			id,
			text: "Twisted ankle",
			status: "problematic",
			origin: "wound",
			healed: false,
			gmOnly: false,
		});
	});

	it("addWound mints a distinct id per wound", async () => {
		const { char } = build();
		const a = await char.addWound({ text: "A" });
		const b = await char.addWound({ text: "B" });
		expect(a).not.toBe(b);
		expect((await wounds(char)).map(w => w.text)).toEqual(["A", "B"]);
	});

	it("updateWound patches fields in place and preserves unmanaged ones", async () => {
		const { char } = build();
		const id = await char.addWound({ text: "Gash", planNote: "keep me" });
		await char.updateWound(id, { text: "Deep gash", status: "stabilized" });
		const w = (await wounds(char))[0];
		expect(w).toMatchObject({ text: "Deep gash", status: "stabilized", planNote: "keep me" });
	});

	it("setWoundStatus moves a wound to permanent", async () => {
		const { char } = build();
		const id = await char.addWound({ text: "Shattered knee" });
		await char.setWoundStatus(id, "permanent");
		expect((await wounds(char))[0].status).toBe("permanent");
		expect((await wounds(char))[0].isPermanent).toBe(true);
	});

	it("healWound keeps the record as a scar rather than deleting it", async () => {
		const { char } = build();
		const id = await char.addWound({ text: "Cracked ribs" });
		await char.healWound(id);
		const list = await wounds(char);
		expect(list).toHaveLength(1);
		expect(list[0].healed).toBe(true);
	});

	it("removeWound deletes the record outright", async () => {
		const { char } = build();
		const id = await char.addWound({ text: "Scratch" });
		await char.removeWound(id);
		expect(await wounds(char)).toEqual([]);
	});

	it("coerces unknown status/origin values back to safe defaults on read", async () => {
		const { char, actor } = build();
		// Simulate a record written by a newer build (or hand-edited world).
		actor.system.attributes.wounds = [
			{ id: "x1", text: "weird", status: "cursed", origin: "aliens" },
		];
		const w = (await wounds(char))[0];
		expect(w.status).toBe("problematic");
		expect(w.origin).toBe("wound");
	});

	it("tolerates a totally malformed wounds value without throwing", async () => {
		const { char, actor } = build();
		actor.system.attributes.wounds = "not-an-array";
		expect(await wounds(char)).toEqual([]);
	});

	it("carries origin, mechanicalTag and reminderMove through a round-trip", async () => {
		const { char } = build();
		const id = await char.addWound({
			text: "Lost eye",
			origin: "deaths-door",
			status: "permanent",
			mechanicalTag: "Volley at disadvantage",
			reminderMove: "Volley",
		});
		const w = (await wounds(char)).find(x => x.id === id);
		expect(w).toMatchObject({
			origin: "deaths-door",
			status: "permanent",
			mechanicalTag: "Volley at disadvantage",
			reminderMove: "Volley",
		});
		expect(w.isDeathsDoor).toBe(true);
	});
});
