import { describe, it, expect } from "vitest";
import {
	ALL_SYSTEM_IDS, PRIOR_SYSTEM_IDS, buildUuidRedirects, registerUuidRedirects,
	isOurCompendiumRef, compendiumRefTail, seededSourceKeys, systemLinkPattern,
	systemAssetVariants
} from "../../module/migration/compat.js";
import { SYSTEM_ID, PACK_NAMES } from "../../module/system-id.js";

const OTHER = PRIOR_SYSTEM_IDS[0];

describe("ALL_SYSTEM_IDS", () => {
	it("leads with the active id", () => {
		expect(ALL_SYSTEM_IDS[0]).toBe(SYSTEM_ID);
	});

	it("excludes the active id from the prior list", () => {
		expect(PRIOR_SYSTEM_IDS).not.toContain(SYSTEM_ID);
	});
});

describe("buildUuidRedirects", () => {
	it("maps every pack from every prior id onto the active id", () => {
		const redirects = buildUuidRedirects("new-id", ["old-id"]);
		expect(Object.keys(redirects)).toHaveLength(PACK_NAMES.length);
		expect(redirects["Compendium.old-id.stonetop-items"]).toBe("Compendium.new-id.stonetop-items");
	});

	it("never maps an id onto itself", () => {
		expect(buildUuidRedirects("same", ["same"])).toEqual({});
	});

	it("handles several historical ids", () => {
		const redirects = buildUuidRedirects("c", ["a", "b"]);
		expect(Object.keys(redirects)).toHaveLength(PACK_NAMES.length * 2);
	});
});

describe("registerUuidRedirects", () => {
	it("merges into an existing table rather than replacing it", () => {
		const config = { compendium: { uuidRedirects: { "Compendium.other.pack": "Compendium.x.pack" } } };
		registerUuidRedirects(config);
		expect(config.compendium.uuidRedirects["Compendium.other.pack"]).toBe("Compendium.x.pack");
		expect(Object.keys(config.compendium.uuidRedirects).length).toBeGreaterThan(1);
	});

	it("creates the table when absent", () => {
		const config = { compendium: {} };
		expect(registerUuidRedirects(config)).toBeGreaterThan(0);
		expect(config.compendium.uuidRedirects).toBeTruthy();
	});

	it("no-ops on a Foundry build with no compendium config", () => {
		expect(registerUuidRedirects({})).toBe(0);
		expect(registerUuidRedirects(undefined)).toBe(0);
	});
});

describe("isOurCompendiumRef", () => {
	it("accepts our packs under the active id", () => {
		expect(isOurCompendiumRef(`Compendium.${SYSTEM_ID}.stonetop-items.Item.abc`)).toBe(true);
	});

	it("accepts our packs under a historical id", () => {
		expect(isOurCompendiumRef(`Compendium.${OTHER}.stonetop-bestiary.Actor.abc`)).toBe(true);
	});

	it("rejects another package's pack", () => {
		expect(isOurCompendiumRef("Compendium.dnd5e.items.Item.abc")).toBe(false);
	});

	it("rejects a pack name we do not ship", () => {
		expect(isOurCompendiumRef(`Compendium.${SYSTEM_ID}.homebrew.Item.abc`)).toBe(false);
	});

	it("rejects non-compendium references", () => {
		expect(isOurCompendiumRef("Actor.abc")).toBe(false);
		expect(isOurCompendiumRef(null)).toBe(false);
	});
});

describe("compendiumRefTail", () => {
	it("strips the package id", () => {
		expect(compendiumRefTail(`Compendium.${SYSTEM_ID}.stonetop-items.Item.abc`)).toBe("stonetop-items.Item.abc");
	});

	it("returns null for a malformed reference", () => {
		expect(compendiumRefTail("Compendium.only.three")).toBeNull();
		expect(compendiumRefTail("nonsense")).toBeNull();
	});

	// This is what stops the seeder duplicating ~180 monsters and ~168 treasures.
	it("gives the same document under two system ids the same identity", () => {
		expect(compendiumRefTail(`Compendium.${SYSTEM_ID}.stonetop-bestiary.Actor.abc`))
			.toBe(compendiumRefTail(`Compendium.${OTHER}.stonetop-bestiary.Actor.abc`));
	});

	it("still distinguishes genuinely different documents", () => {
		expect(compendiumRefTail(`Compendium.${SYSTEM_ID}.stonetop-bestiary.Actor.abc`))
			.not.toBe(compendiumRefTail(`Compendium.${SYSTEM_ID}.stonetop-bestiary.Actor.xyz`));
	});
});

describe("seededSourceKeys", () => {
	const worldDoc = (source) => ({ _stats: { compendiumSource: source } });

	it("keys world documents by their package-id-free source", () => {
		const keys = seededSourceKeys([worldDoc(`Compendium.${OTHER}.stonetop-bestiary.Actor.abc`)]);
		expect(keys.has("stonetop-bestiary.Actor.abc")).toBe(true);
	});

	// The whole point: a monster seeded under the old id must still read as "already here".
	it("matches a pack document seeded under a different system id", () => {
		const keys = seededSourceKeys([worldDoc(`Compendium.${OTHER}.stonetop-bestiary.Actor.abc`)]);
		expect(keys.has(compendiumRefTail(`Compendium.${SYSTEM_ID}.stonetop-bestiary.Actor.abc`))).toBe(true);
	});

	it("skips hand-made documents that never came from a compendium", () => {
		expect(seededSourceKeys([{}, worldDoc(null), worldDoc("nonsense")]).size).toBe(0);
	});

	it("tolerates a missing collection", () => {
		expect(seededSourceKeys(undefined).size).toBe(0);
	});
});

describe("systemLinkPattern", () => {
	it("matches links under any historical id", () => {
		const text = `see @UUID[Compendium.${OTHER}.stonetop-journal.JournalEntry.a] and @UUID[Compendium.${SYSTEM_ID}.stonetop-items.Item.b]`;
		expect([...text.matchAll(systemLinkPattern())]).toHaveLength(2);
	});

	it("ignores another package's links", () => {
		const text = "@UUID[Compendium.dnd5e.items.Item.a]";
		expect([...text.matchAll(systemLinkPattern())]).toHaveLength(0);
	});

	it("escapes regex metacharacters in ids", () => {
		// A hyphenated id must not be read as a character range.
		const pattern = systemLinkPattern(["a-c"]);
		expect(pattern.test("@UUID[Compendium.a-c.pack.Item.x]")).toBe(true);
		expect(systemLinkPattern(["a-c"]).test("@UUID[Compendium.b.pack.Item.x]")).toBe(false);
	});
});

describe("systemAssetVariants", () => {
	it("lists one variant per historical id, active first", () => {
		const variants = systemAssetVariants("assets/icons/threat-note.svg");
		expect(variants).toHaveLength(ALL_SYSTEM_IDS.length);
		expect(variants[0]).toBe(`systems/${SYSTEM_ID}/assets/icons/threat-note.svg`);
		expect(variants).toContain(`systems/${OTHER}/assets/icons/threat-note.svg`);
	});
});
