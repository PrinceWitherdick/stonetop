import { describe, expect, it } from "vitest";
import { DEATH_DRIP_FLAG, deathDripStamp, markDeathDrip } from "../../module/hooks/DeathChatDrip.js";
import { DEATHS_DOOR_STATE } from "../../module/actors/character/deaths-door.js";

const SCOPE = "stonetop_pwd";
const FLAG_PATH = `flags.${SCOPE}.${DEATH_DRIP_FLAG}`;

/** An actor carrying the two flags the stamp reads, in the shape Foundry stores them. */
function actor({ state = null, insertSlug = null } = {}) {
	return {
		type: "character",
		flags: { [SCOPE]: { deathsDoor: state, postDeathInsert: { slug: insertSlug } } },
	};
}

/** The message surface the render pass touches: getFlag and a root with a classList. */
function rendered(kind) {
	const classes = new Set();
	const message = { getFlag: (scope, key) => (scope === SCOPE && key === DEATH_DRIP_FLAG ? kind : undefined) };
	const html = { classList: { add: (...names) => names.forEach(n => classes.add(n)) } };
	return { message, html, classes };
}

describe("deathDripStamp — what a message carries from the moment it's made", () => {
	it("stamps nothing for a living speaker", () => {
		expect(deathDripStamp(actor())).toBe(null);
	});

	it("stamps the kind of death under the system scope", () => {
		expect(deathDripStamp(actor({ state: DEATHS_DOOR_STATE.DEAD }))).toEqual({ [FLAG_PATH]: "dead" });
		expect(deathDripStamp(actor({ insertSlug: "thrall" }))).toEqual({ [FLAG_PATH]: "thrall" });
	});

	// A PC at 0 HP hasn't died yet — the drip must not front-run the roll they're about to make.
	it("stamps nothing for a character who is merely dying", () => {
		expect(deathDripStamp(actor({ state: DEATHS_DOOR_STATE.DYING }))).toBe(null);
	});

	// The flags predate the system-id rename, so a world that never cut over still reads.
	it("reads a legacy flag scope", () => {
		// This package's own prior scope (LEGACY_FLAG_SCOPES in module/system-id.js), so the
		// fallback is genuinely exercised rather than the current scope wearing another name.
		const legacy = { type: "character", flags: { stonetop: { postDeathInsert: { slug: "ghost" } } } };
		expect(deathDripStamp(legacy)).toEqual({ [FLAG_PATH]: "ghost" });
	});
});

describe("markDeathDrip — the fringe on a rendered message", () => {
	it("adds nothing to a message with no stamp", () => {
		const { message, html, classes } = rendered(undefined);
		markDeathDrip(message, html);
		expect([...classes]).toEqual([]);
	});

	// The base class carries the whole effect and the modifier only re-tints it, so a kind the
	// CSS has never heard of still drips instead of silently doing nothing.
	it("adds the base class and the kind's modifier", () => {
		const { message, html, classes } = rendered("revenant");
		markDeathDrip(message, html);
		expect([...classes]).toEqual(["stonetop-death-drip", "stonetop-death-drip--revenant"]);
	});

	it("unwraps a jQuery-style handle, like the other chat passes", () => {
		const { message, html, classes } = rendered("dead");
		markDeathDrip(message, { 0: html, length: 1 });
		expect([...classes]).toEqual(["stonetop-death-drip", "stonetop-death-drip--dead"]);
	});

	it("survives a message root it can't touch", () => {
		const { message } = rendered("ghost");
		expect(() => markDeathDrip(message, null)).not.toThrow();
		expect(() => markDeathDrip(message, {})).not.toThrow();
	});
});
