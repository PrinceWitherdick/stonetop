import { describe, expect, it, vi } from "vitest";
import { TestCharacterBuilder } from "../../fakes/TestCharacterBuilder.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";

// The one slot that says which Invocation a Lightbearer is holding open. The rules it has to
// keep are in ongoing-invocation.js; what is asserted here is the STORAGE — the flag scope, the
// no-op contract, and the one rule the model owns outright: the light going out takes the
// Invocation with it, wherever the light was put out from.
//
// FakeActorBuilder aliases both flag scopes ("stonetop_pwd" and the legacy "stonetop") to ONE
// object, so reading a flag back can never prove which scope it was written under. The scope is
// therefore asserted through the spy's literal arguments.
function makeChar({ ongoing = "", lit = false } = {}) {
	const builder = new FakeActorBuilder();
	if (lit) builder.withFlag("holyLight", true);
	if (ongoing) builder.withFlag("ongoingInvocation", ongoing);
	const actor = builder.build();
	return { char: new TestCharacterBuilder(actor).build(), actor };
}

describe("StonetopCharacter ongoing Invocation", () => {
	it("is nothing until one is invoked", () => {
		expect(makeChar().char.ongoingInvocation).toBe("");
	});

	it("reads the running Invocation back off the flag", () => {
		expect(makeChar({ ongoing: "warmth-of-the-sun" }).char.ongoingInvocation).toBe("warmth-of-the-sun");
	});

	it("stores it under the system's own flag scope", async () => {
		const { char, actor } = makeChar();
		await expect(char.setOngoingInvocation("warmth-of-the-sun")).resolves.toBe(true);
		expect(actor.update).toHaveBeenCalledWith({ "flags.stonetop_pwd.ongoingInvocation": "warmth-of-the-sun" });
		expect(char.ongoingInvocation).toBe("warmth-of-the-sun");
	});

	// UNSET, not `setFlag(..., "")`: an Invocation that has ended should leave no trace on the
	// actor, the same way a snuffed light doesn't.
	it("ends it by dropping the flag", async () => {
		const { char, actor } = makeChar({ ongoing: "warmth-of-the-sun" });
		await expect(char.setOngoingInvocation("")).resolves.toBe(true);
		expect(actor.update).toHaveBeenCalledWith({ "flags.stonetop_pwd.-=ongoingInvocation": null });
		expect(actor.setFlag).not.toHaveBeenCalled();
		expect(char.ongoingInvocation).toBe("");
	});

	// Renewing the Invocation already running is the common case at the table — a Lightbearer
	// re-invokes to keep it up — and writing anyway would broadcast a document update to every
	// connected client for no change at all.
	it("writes nothing when the Invocation asked for is already the one running", async () => {
		const { char, actor } = makeChar({ ongoing: "warmth-of-the-sun" });
		await expect(char.setOngoingInvocation("warmth-of-the-sun")).resolves.toBe(false);
		expect(actor.update).not.toHaveBeenCalled();
	});

	it("writes nothing when nothing was running and nothing was asked for", async () => {
		const { char, actor } = makeChar();
		await expect(char.setOngoingInvocation("")).resolves.toBe(false);
		expect(actor.update).not.toHaveBeenCalled();
	});

	// "It will end immediately if your holy light is extinguished." Enforced by the model rather
	// than by the button that snuffs the flame, so no other way of putting a light out can leave
	// a Lightbearer concentrating on an Invocation that has no light to run on.
	it("drops the Invocation when the light is snuffed", async () => {
		const { char, actor } = makeChar({ ongoing: "warmth-of-the-sun", lit: true });
		await expect(char.setHolyLight(false)).resolves.toBe(true);
		expect(char.ongoingInvocation).toBe("");
		expect(char.holyLight).toBe(false);
		expect(actor.update).toHaveBeenCalledWith(expect.objectContaining({ "flags.stonetop_pwd.-=ongoingInvocation": null }));
	});

	// Reported as a change even though the light itself didn't move, so the sheet repaints: a
	// stranded Invocation on a sheet with no light is exactly the state this feature exists to
	// stop, and it must not survive a click that was meant to clear it.
	it("clears a stranded Invocation even when the light was already out", async () => {
		const { char } = makeChar({ ongoing: "warmth-of-the-sun" });
		await expect(char.setHolyLight(false)).resolves.toBe(true);
		expect(char.ongoingInvocation).toBe("");
	});

	it("leaves the Invocation alone when a light is lit", async () => {
		const { char } = makeChar({ ongoing: "warmth-of-the-sun" });
		await expect(char.setHolyLight(true)).resolves.toBe(true);
		expect(char.ongoingInvocation).toBe("warmth-of-the-sun");
	});
});

// Lightbearer audit R1: two running at once (Burn Twice as Bright, an empowered Dancing Light).
describe("StonetopCharacter two ongoing Invocations", () => {
	function makeTwo({ lit = true, flags = {} } = {}) {
		const builder = new FakeActorBuilder();
		if (lit) builder.withFlag("holyLight", true);
		for (const [k, v] of Object.entries(flags)) builder.withFlag(k, v);
		const actor = builder.build();
		return { char: new TestCharacterBuilder(actor).build(), actor };
	}

	it("writes the second slot and the empowered mark as scalar flags of their own", async () => {
		const { char, actor } = makeTwo();
		const out = await char.setInvocationState({ primary: "dancing-light", empowered: true, second: "blinding-light" });
		expect(out.changed).toBe(true);
		// One write for both, so no hook sees a first slot without its second.
		expect(actor.update).toHaveBeenCalledTimes(1);
		expect(actor.update).toHaveBeenCalledWith(expect.objectContaining({
			"flags.stonetop_pwd.ongoingInvocationSecond": "blinding-light",
			"flags.stonetop_pwd.ongoingInvocationEmpowered": true,
		}));
		expect(char.ongoingInvocations).toEqual(["dancing-light", "blinding-light"]);
		expect(char.ongoingInvocationSecond).toBe("blinding-light");
		expect(char.ongoingInvocationEmpowered).toBe(true);
	});

	// "It will end immediately if your holy light is extinguished": both of them.
	it("ends BOTH when the light is snuffed", async () => {
		const { char } = makeTwo({ flags: { ongoingInvocation: "warmth-of-the-sun", ongoingInvocationSecond: "blinding-light" } });
		await char.setHolyLight(false);
		expect(char.ongoingInvocations).toEqual([]);
	});

	it("ends one of two by its slug, keeping the other", async () => {
		const { char } = makeTwo({ flags: { ongoingInvocation: "warmth-of-the-sun", ongoingInvocationSecond: "blinding-light" } });
		const out = await char.endOngoingInvocation("warmth-of-the-sun");
		expect(out).toEqual({ changed: true, ended: ["warmth-of-the-sun"], snuffed: false });
		expect(char.ongoingInvocations).toEqual(["blinding-light"]);
	});

	// The seam for the Invoke consequence "the light is snuffed out when the Invocation is complete".
	it("snuffs the light when a stamped Invocation ends, however it ends", async () => {
		const { char } = makeTwo({ flags: { ongoingInvocation: "warmth-of-the-sun", ongoingInvocationSecond: "blinding-light" } });
		await expect(char.markInvocationSnuff("blinding-light")).resolves.toBe(true);
		const out = await char.endOngoingInvocation("blinding-light");
		expect(out.snuffed).toBe(true);
		expect(char.holyLight).toBe(false);
		// The light going out took the other one with it.
		expect(out.ended).toEqual(["blinding-light", "warmth-of-the-sun"]);
		expect(char.ongoingInvocations).toEqual([]);
	});

	it("drops the second slot when told to hold just one", async () => {
		const { char } = makeTwo({ flags: { ongoingInvocation: "warmth-of-the-sun", ongoingInvocationSecond: "blinding-light" } });
		await expect(char.setOngoingInvocation("warmth-of-the-sun")).resolves.toBe(true);
		expect(char.ongoingInvocations).toEqual(["warmth-of-the-sun"]);
	});
});

// B3: the invoke window's empower choice reaches the roll card through the model, around one roll.
describe("StonetopCharacter pick context", () => {
	it("holds the context for the named move only, and only while the roll runs", async () => {
		const { char } = makeChar();
		let seen = null, other = "unset";
		await char.withPickContext("Invoke the Sun God", { empowered: true }, async () => {
			seen = char.pickContextFor("Invoke the Sun God");
			other = char.pickContextFor("Clash");
		});
		expect(seen).toMatchObject({ empowered: true });
		expect(other).toBeNull();
		expect(char.pickContextFor("Invoke the Sun God")).toBeNull();
	});

	it("lets go even when the roll throws", async () => {
		const { char } = makeChar();
		await expect(char.withPickContext("Invoke the Sun God", { empowered: true }, async () => { throw new Error("x"); })).rejects.toThrow("x");
		expect(char.pickContextFor("Invoke the Sun God")).toBeNull();
	});
});

// B9: an off-playbook Invoke the Sun God stamps the level it was taken at, for the "N of M" cue.
describe("StonetopCharacter Invoke the Sun God grant level", () => {
	function takes(name, { level = 4, stamped = null } = {}) {
		const builder = new FakeActorBuilder();
		if (stamped != null) builder.withFlag("invocations.grantedAtLevel", stamped);
		const actor = builder.build();
		actor.system.attributes = { ...(actor.system.attributes ?? {}), level: { value: level } };
		const char = new TestCharacterBuilder(actor).build();
		char.addMove = vi.fn(async () => ({ name, setFlag: vi.fn(async () => {}) }));
		return { char, actor };
	}

	it("stamps the level Invoke the Sun God was taken at", async () => {
		const { char, actor } = takes("Invoke the Sun God", { level: 4 });
		await char._applyForeignMoveChoice({ name: "Versatile", id: "v1" }, "pack.invoke", null);
		expect(actor.setFlag).toHaveBeenCalledWith("stonetop_pwd", "invocations.grantedAtLevel", 4);
	});

	it("keeps the earliest stamp, and stamps nothing for another move", async () => {
		const early = takes("Invoke the Sun God", { level: 8, stamped: 2 });
		await early.char._applyForeignMoveChoice({ name: "Versatile", id: "v1" }, "pack.invoke", null);
		expect(early.actor.setFlag).not.toHaveBeenCalledWith("stonetop_pwd", "invocations.grantedAtLevel", 8);
		const other = takes("Ambush", { level: 4 });
		await other.char._applyForeignMoveChoice({ name: "Versatile", id: "v1" }, "pack.ambush", null);
		expect(other.actor.setFlag).not.toHaveBeenCalledWith("stonetop_pwd", "invocations.grantedAtLevel", 4);
	});
});

// R2: "You must bask in sunlight for an hour or so before using that Invocation again". A list of
// slugs under the invocations flag, so losing Invoke the Sun God clears it with the rest.
describe("StonetopCharacter Invocations waiting on the sun", () => {
	function withSun(list) {
		const builder = new FakeActorBuilder();
		if (list) builder.withFlag("invocations.needsSun", list);
		const actor = builder.build();
		return { char: new TestCharacterBuilder(actor).build(), actor };
	}

	it("adds to the list, answering only what it added", async () => {
		const { char, actor } = withSun(["blinding-flash"]);
		await expect(char.markNeedsSun(["warmth-of-the-sun", "blinding-flash"])).resolves.toEqual(["warmth-of-the-sun"]);
		expect(actor.setFlag).toHaveBeenCalledWith("stonetop_pwd", "invocations.needsSun", ["blinding-flash", "warmth-of-the-sun"]);
		expect(char.invocationsNeedingSun).toEqual(["blinding-flash", "warmth-of-the-sun"]);
	});

	it("writes nothing when every one is already waiting", async () => {
		const { char, actor } = withSun(["blinding-flash"]);
		await expect(char.markNeedsSun(["blinding-flash"])).resolves.toEqual([]);
		expect(actor.setFlag).not.toHaveBeenCalled();
	});

	it("takes them back off, and drops the flag once the list is empty", async () => {
		const { char, actor } = withSun(["blinding-flash", "warmth-of-the-sun"]);
		await expect(char.clearNeedsSun(["warmth-of-the-sun", "dancing-light"])).resolves.toEqual(["warmth-of-the-sun"]);
		expect(char.invocationsNeedingSun).toEqual(["blinding-flash"]);
		await char.clearNeedsSun(["blinding-flash"]);
		expect(actor.unsetFlag).toHaveBeenCalledWith("stonetop_pwd", "invocations.needsSun");
		expect(char.invocationsNeedingSun).toEqual([]);
	});
});
