import { describe, it, expect } from "vitest";
import { ARCANA_SUMMONS, arcanaSummon, arcanaSummonFollowers, hasArcanaSummon } from "../../module/data/arcana-summons.js";
import { joinNames } from "../../module/utils/strings.js";
import { buildCustomFollower } from "../../module/data/follower-build.js";

describe("ARCANA_SUMMONS registry", () => {
	const entries = Object.entries(ARCANA_SUMMONS);

	it("covers the known summoning arcana", () => {
		expect(Object.keys(ARCANA_SUMMONS).sort()).toEqual([
			"beautiful-scroll", "blackwood-fetishes", "cloak-richly-embroidered",
			"cracked-flute", "demonhide-cloak", "metal-man", "mindgem",
			"oversized-crown", "ring-of-daagon", "rusty-cauldron",
			"scroll-and-bone-flute", "stone-idol", "tattered-mantle",
		].sort());
	});

	it("every follower builds into a valid custom-follower shape", () => {
		for (const [slug, entry] of entries) {
			expect(entry.followers.length, slug).toBeGreaterThan(0);
			for (const input of entry.followers) {
				const f = buildCustomFollower(input);
				expect(f.name, slug).toBeTruthy();
				expect(f.sourceUuid, slug).toBe(input.sourceUuid);
				expect(Number.isInteger(f.hpMax), slug).toBe(true);
				expect(f.loyalty, slug).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it("uses globally unique, slug-prefixed sourceUuids", () => {
		const uuids = entries.flatMap(([slug, entry]) =>
			entry.followers.map(f => {
				expect(f.sourceUuid.startsWith(`${slug}:`), f.sourceUuid).toBe(true);
				return f.sourceUuid;
			})
		);
		expect(new Set(uuids).size).toBe(uuids.length);
	});

	it("carries the rulebook starting Loyalty for the spirits that have one", () => {
		expect(buildCustomFollower(arcanaSummon("cracked-flute").followers[0]).loyalty).toBe(1);
		expect(buildCustomFollower(arcanaSummon("oversized-crown").followers[0]).loyalty).toBe(3);
	});

	it("hasArcanaSummon / arcanaSummon agree", () => {
		expect(hasArcanaSummon("metal-man")).toBe(true);
		expect(hasArcanaSummon("red-scepter")).toBe(false);
		expect(arcanaSummon("red-scepter")).toBeNull();
	});
});

describe("arcanaSummonFollowers (homebrew-first resolution)", () => {
	it("uses homebrew followers from flags.stonetop.summon and derives a slug:name sourceUuid", () => {
		const out = arcanaSummonFollowers({ slug: "my-charm", summon: { followers: [{ name: "Wisp Friend", hp: 8 }] } });
		expect(out).toHaveLength(1);
		expect(out[0].name).toBe("Wisp Friend");
		expect(out[0].sourceUuid).toBe("my-charm:wisp-friend");
	});

	it("keeps an explicit sourceUuid if the homebrew follower already has one", () => {
		const out = arcanaSummonFollowers({ slug: "x", summon: { followers: [{ name: "A", sourceUuid: "custom:id" }] } });
		expect(out[0].sourceUuid).toBe("custom:id");
	});

	it("drops homebrew followers with a blank name", () => {
		const out = arcanaSummonFollowers({ slug: "x", summon: { followers: [{ name: "" }, { name: "Real" }] } });
		expect(out).toHaveLength(1);
		expect(out[0].name).toBe("Real");
	});

	it("falls back to the shipped ARCANA_SUMMONS map when no homebrew followers", () => {
		const out = arcanaSummonFollowers({ slug: "metal-man" });
		expect(out).toBe(arcanaSummon("metal-man").followers);
	});

	it("returns null for a non-summoning slug with no homebrew followers", () => {
		expect(arcanaSummonFollowers({ slug: "red-scepter" })).toBeNull();
		expect(arcanaSummonFollowers({ slug: "x", summon: { followers: [] } })).toBeNull();
	});
});

describe("joinNames", () => {
	it("formats one, two, and many names", () => {
		expect(joinNames(["Astor"])).toBe("Astor");
		expect(joinNames(["Astor", "Halix"])).toBe("Astor & Halix");
		expect(joinNames(["A", "B", "C"])).toBe("A, B & C");
		expect(joinNames([])).toBe("");
		expect(joinNames([null, "X"])).toBe("X");
	});
});
