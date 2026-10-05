import { describe, expect, it, vi } from "vitest";
import {
	StonetopSteading, HERD_ASSET_NAME, STEADING_DEFAULTS, linkedRequirementSlugs, IMPROVEMENT_DEFINITIONS,
} from "../../../module/actors/steading/StonetopSteading.js";

// What completing, un-completing, editing and removing an improvement does to a steading, against
// a fake actor that writes the way Foundry does: a dotted path MERGES a plain object and replaces
// an array or a value, `-=key` deletes, and (optionally) nothing lands until the server "answers".

const isPlain = v => v && typeof v === "object" && !Array.isArray(v);

function mergeInto(target, value) {
	for (const [k, v] of Object.entries(value)) {
		if (isPlain(v) && isPlain(target[k])) mergeInto(target[k], v);
		else target[k] = structuredClone(v);
	}
}

function writePath(root, path, value) {
	const keys = path.split(".");
	const last = keys.pop();
	let at = root;
	for (const k of keys) at = (at[k] ??= {});
	if (last.startsWith("-=")) { delete at[last.slice(2)]; return; }
	if (isPlain(value) && isPlain(at[last])) mergeInto(at[last], value);
	else at[last] = structuredClone(value);
}

function liveActor(steading = {}, { system = {}, deferred = false } = {}) {
	const actor = {
		id: `st-${Math.random().toString(36).slice(2)}`,
		type: "stonetop",
		system: structuredClone(system),
		flags: { "stonetop_pwd": { steading: structuredClone(steading) } },
		pending: [],
		getFlag: (scope, key) => actor.flags["stonetop_pwd"]?.[key],
	};
	const apply = data => { for (const [path, value] of Object.entries(data)) writePath(actor, path, value); };
	const write = data => {
		if (!deferred) { apply(data); return Promise.resolve(); }
		return new Promise(resolve => actor.pending.push(() => { apply(data); resolve(); }));
	};
	actor.update = vi.fn(data => write(data));
	actor.setFlag = vi.fn((scope, key, value) => write({ [`flags.${scope}.${key}`]: value }));
	actor.flush = async () => {
		while (actor.pending.length) { actor.pending.shift()(); await Promise.resolve(); }
	};
	return actor;
}

const stored = actor => actor.flags["stonetop_pwd"].steading;
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe("B3: a write issued inside a completion's round trip", () => {
	// Complete the Palisade, and before the server answers, tick a Resources box. The tick used to
	// write the WHOLE steading rebuilt from the cached flags, which put back the steading as it
	// was before the completion: the Fortification gone and Fortunes' mirror back down, while the
	// `applied` record survived to be reversed again later.
	it("no longer puts back the steading as it was before the completion", async () => {
		const actor = liveActor({
			system: { stats: { fortunes: { value: 1 } } },
			fortifications: [{ name: "Village militia", checked: true }, { name: "", checked: false }],
			resources: [{ name: "Farming", checked: true }],
		}, { deferred: true });
		const steading = new StonetopSteading(actor);

		const completing = steading.setImprovementCompleted("palisade", true);
		await vi.waitFor(() => expect(actor.pending).toHaveLength(1));
		// The cache still says the Palisade is not built: exactly the window the bug lived in.
		expect(steading.improvementCompleted("palisade")).toBe(false);
		const ticking = steading.setFlags({ resources: [{ name: "Farming", checked: false }] });
		await vi.waitFor(() => expect(actor.pending).toHaveLength(2));
		await actor.flush();
		await Promise.all([completing, ticking]);

		const after = stored(actor);
		expect(after.improvements.palisade.completed).toBe(true);
		expect(after.fortifications.map(f => f.name)).toContain("Palisade");
		expect(after.system.stats.fortunes.value).toBe(2);
		expect(after.resources[0].checked).toBe(false);
		// And the write named only the key it changed.
		expect(Object.keys(actor.update.mock.calls.at(-1)[0])).toEqual(["flags.stonetop_pwd.steading.resources"]);
	});

	// The sheet's own list writes (a Resources/Fortifications/Assets tick, add or delete) used to
	// copy the list from the cache BEFORE queueing, so a tick pressed inside a completion's round
	// trip wrote back the list without the completion's entry. editList reads it inside the turn.
	it("keeps a completion's Fortification when a list tick lands inside its round trip", async () => {
		const actor = liveActor({
			fortifications: [{ name: "Village militia", checked: true }, { name: "", checked: false }],
		}, { deferred: true });
		const steading = new StonetopSteading(actor);

		const completing = steading.setImprovementCompleted("palisade", true);
		await vi.waitFor(() => expect(actor.pending).toHaveLength(1));
		const ticking = steading.editList("fortifications", arr => { arr[0].checked = false; });
		await settle();
		// The tick waits its turn rather than writing the stale list now.
		expect(actor.pending).toHaveLength(1);
		await actor.flush();
		await vi.waitFor(() => expect(actor.pending).toHaveLength(1));
		await actor.flush();
		await Promise.all([completing, ticking]);

		const names = stored(actor).fortifications.map(f => f.name);
		expect(names).toContain("Palisade");
		expect(stored(actor).fortifications[0]).toEqual({ name: "Village militia", checked: false });
	});

	it("writes nothing when the list edit declines", async () => {
		const actor = liveActor({ resources: [{ name: "Farming", checked: true }] });
		const wrote = await new StonetopSteading(actor).editList("resources", arr => (arr[5] ? undefined : false));
		expect(wrote).toBe(false);
		expect(actor.update).not.toHaveBeenCalled();
	});

	it("queues an added improvement behind a completion in flight", async () => {
		const actor = liveActor({}, { deferred: true });
		const steading = new StonetopSteading(actor);
		const completing = steading.setImprovementCompleted("heroicReputation", true);
		const adding = steading.addCustomImprovement({ name: "Bell Tower" });
		await vi.waitFor(() => expect(actor.pending).toHaveLength(1));
		await settle();
		// The add waits its turn: nothing of it is written until the completion has landed.
		expect(actor.pending).toHaveLength(1);
		await actor.flush();
		await vi.waitFor(() => expect(actor.pending).toHaveLength(1));
		await actor.flush();
		await Promise.all([completing, adding]);
		expect(stored(actor).improvements.heroicReputation.completed).toBe(true);
		expect(stored(actor).customImprovements.map(d => d.label)).toEqual(["Bell Tower"]);
	});

	it("removes a completed custom improvement in one turn without waiting on itself", async () => {
		const actor = liveActor({
			customImprovements: [{ slug: "custom-tower", label: "Tower", sections: [], effect: "", grants: { stats: { defenses: 1 } } }],
			improvements: { "custom-tower": { completed: true, r: [], applied: { stats: { defenses: 1 } } } },
			system: { stats: { defenses: { value: 2 } } },
		});
		const result = await new StonetopSteading(actor).removeCustomImprovement("custom-tower");
		expect(result).toEqual({ label: "Tower", reverted: ["Defenses +2 → +1"] });
		expect(stored(actor).customImprovements).toEqual([]);
		expect(stored(actor).improvements).not.toHaveProperty("custom-tower");
		expect(stored(actor).system.stats.defenses.value).toBe(1);
	});
});

describe("B1: a custom improvement's `applied` record", () => {
	const tower = (extra = {}) => ({ slug: "custom-tower", label: "Tower", sections: [], effect: "", grants: null, ...extra });

	it("is written as null when completing it applied nothing", async () => {
		const actor = liveActor({ customImprovements: [tower()] });
		await new StonetopSteading(actor).setImprovementCompleted("custom-tower", true);
		expect(stored(actor).improvements["custom-tower"]).toMatchObject({ completed: true, applied: null });
	});

	// Completed with no grants, then edited to carry some: un-completing must not take back a
	// Fortunes and a Fortification it never gave.
	it("never presumes grants an edit added after completion", async () => {
		const actor = liveActor({
			customImprovements: [tower({ grants: { stats: { fortunes: 1 }, fortifications: ["Tower"] } })],
			// Completed before `applied` was always written: no key at all.
			improvements: { "custom-tower": { completed: true, r: [] } },
			system: { stats: { fortunes: { value: 1 } } },
		});
		const steading = new StonetopSteading(actor);
		expect(steading.improvementGivesBack("custom-tower")).toEqual([]);
		const result = await steading.setImprovementCompleted("custom-tower", false);
		expect(result).toMatchObject({ reverted: false, summary: [] });
		expect(stored(actor).system.stats.fortunes.value).toBe(1);
	});

	it("removes such an improvement giving back nothing, as its confirm says", async () => {
		const actor = liveActor({
			customImprovements: [tower({ grants: { stats: { fortunes: 1 } } })],
			improvements: { "custom-tower": { completed: true, r: [] } },
			system: { stats: { fortunes: { value: 1 } } },
		});
		expect(await new StonetopSteading(actor).removeCustomImprovement("custom-tower")).toEqual({ label: "Tower", reverted: [] });
		expect(stored(actor).system.stats.fortunes.value).toBe(1);
	});
});

describe("B4: names compared as names, slugs minted unique", () => {
	it("lets two names that slugify to nothing both be added, under different slugs", async () => {
		const actor = liveActor();
		const steading = new StonetopSteading(actor);
		const a = await steading.addCustomImprovement({ name: "🏰" });
		const b = await steading.addCustomImprovement({ name: "城壁" });
		expect(a.ok && b.ok).toBe(true);
		expect(a.slug).not.toBe(b.slug);
		expect(a.slug).toMatch(/^custom-[a-z0-9]+$/);
	});

	it("follows a rename: the new name is taken, the old one free", async () => {
		const actor = liveActor();
		const steading = new StonetopSteading(actor);
		const { slug } = await steading.addCustomImprovement({ name: "Roadbuilding" });
		await steading.updateCustomImprovement(slug, { name: "The Maker's Roads" });
		expect(steading.improvementNameTaken("the maker's roads")).toBe(true);
		expect((await steading.addCustomImprovement({ name: "The Maker's Roads" })).reason).toBe("duplicate");
		const old = await steading.addCustomImprovement({ name: "Roadbuilding" });
		expect(old.ok).toBe(true);
		// The old slug is still the renamed one's, so the new card gets its own.
		expect(old.slug).toBe("custom-roadbuilding-2");
		// Built-in labels and an edit's own name, as before.
		expect(steading.improvementNameTaken(" palisade ")).toBe(true);
		expect(steading.improvementNameTaken("The Maker's Roads", { except: slug })).toBe(false);
	});
});

describe("B6: stored HTML is sanitized", () => {
	it("escapes markup a dropped card carries, keeping its emphasis", async () => {
		const actor = liveActor();
		const steading = new StonetopSteading(actor);
		await steading.addCustomImprovement({
			name: "Trap",
			effect: `Gain <em>advantage</em><img src=x onerror="alert(1)">`,
			sections: [{ heading: "<script>alert(1)</script>Requires:", items: ["<b onclick=x>Bold</b>", "<strong>Strong</strong>"] }],
		});
		const [def] = stored(actor).customImprovements;
		expect(def.effect).toBe(`Gain <em>advantage</em>&lt;img src=x onerror="alert(1)"&gt;`);
		expect(def.sections[0].heading).toBe("&lt;script&gt;alert(1)&lt;/script&gt;Requires:");
		expect(def.sections[0].items).toEqual(["&lt;b onclick=x&gt;Bold</b>", "<strong>Strong</strong>"]);

		await steading.updateCustomImprovement(def.slug, { name: "Trap", effect: "<iframe>" });
		expect(stored(actor).customImprovements[0].effect).toBe("&lt;iframe&gt;");
	});

	it("sanitizes a definition stored before, on its way to the sheet", async () => {
		const actor = liveActor({ customImprovements: [{ slug: "custom-old", label: "Old", effect: "<img onerror=x>", sections: [] }] });
		const snapshot = await new StonetopSteading(actor).buildSnapshot();
		expect(snapshot.improvements.find(i => i.slug === "custom-old").effect).toBe("&lt;img onerror=x&gt;");
	});
});

describe("B8: a season step closed in the same write", () => {
	it("disbands the watch and settles the season in one update", async () => {
		const actor = liveActor({ improvements: { standingWatch: { completed: true, r: [], applied: { fortifications: ["Standing Watch"] } } } });
		await new StonetopSteading(actor).setImprovementCompleted("standingWatch", false, {
			seasonStep: { step: "standingWatch", year: 2, seasonId: "spring" },
		});
		expect(actor.update).toHaveBeenCalledTimes(1);
		expect(stored(actor).seasonSteps).toEqual({ standingWatch: "2:spring" });
		expect(stored(actor).improvements.standingWatch.completed).toBe(false);
	});

	it("forgets a tactic and settles the summer in one update", async () => {
		const actor = liveActor({ improvements: { wellTrainedMilitia: { completed: true, r: [true, true, false, true, false, false], standing: { defenses: 1 } } } });
		await new StonetopSteading(actor).setImprovementRequirement("wellTrainedMilitia", 1, false, {
			seasonStep: { step: "militiaDrill", year: 1, seasonId: "summer" },
		});
		expect(actor.update).toHaveBeenCalledTimes(1);
		expect(stored(actor).seasonSteps.militiaDrill).toBe("1:summer");
	});
});

describe("B9: the herd row on the Assets list", () => {
	it("replaces the draft pair with a fresh row of its own, and puts the pair back exactly", async () => {
		const pair = { ...STEADING_DEFAULTS.assets[0], checked: false, takenBy: { name: "Wren" } };
		const actor = liveActor({ assets: [pair, { name: "", checked: false }] });
		const steading = new StonetopSteading(actor);
		await steading.setImprovementCompleted("herdOfHorses", true);
		expect(stored(actor).assets[0]).toEqual({ name: HERD_ASSET_NAME, checked: true, beast: { slug: "horse", herd: true } });
		await steading.setImprovementCompleted("herdOfHorses", false);
		expect(stored(actor).assets[0]).toEqual(pair);
	});

	it("reads an older herd row, which carried the pair's two hardy horses across, as the herd", () => {
		const actor = liveActor({ assets: [{ name: HERD_ASSET_NAME, checked: true, beast: { slug: "horse", count: 2, traits: ["hardy"] } }] });
		expect(new StonetopSteading(actor).getNamedAssets()[0].beast).toEqual({ slug: "horse", herd: true });
	});

	it("takes requisitioned horses out of the grown horses, no more than there are", async () => {
		const actor = liveActor({ improvements: { herdOfHorses: { completed: true } }, herd: { grown: 3, yearlings: 4, foals: 2 } });
		const steading = new StonetopSteading(actor);
		expect(steading.herdRequisitionCap()).toBe(3);
		expect(await steading.requisitionFromHerd(2)).toBe(2);
		expect(stored(actor).herd).toEqual({ grown: 1, yearlings: 4, foals: 2 });
		expect(await steading.requisitionFromHerd(5)).toBe(1);
		expect(stored(actor).herd.grown).toBe(0);
		expect(await new StonetopSteading(liveActor()).requisitionFromHerd(2)).toBeNull();
	});
});

describe("B10: a reversal takes back only what is still as completion left it", () => {
	it("leaves a Township's Size and Population alone once they have moved on", async () => {
		const actor = liveActor({
			size: "city",
			improvements: { township: { completed: true, r: [], applied: { setSize: { from: "village", to: "town" }, setPopulation: { from: 3, to: 0 } } } },
			system: { attributes: { population: { value: 2 } } },
		});
		const result = await new StonetopSteading(actor).setImprovementCompleted("township", false);
		expect(stored(actor).size).toBe("city");
		expect(stored(actor).system.attributes.population.value).toBe(2);
		expect(result.summary).toEqual(["Size stays city (it has changed since)", "Population stays +2 (it has changed since)"]);
	});

	it("still restores them while they hold what completion set", async () => {
		const actor = liveActor({
			size: "town",
			improvements: { township: { completed: true, r: [], applied: { setSize: { from: "village", to: "town" }, setPopulation: { from: 3, to: 0 } } } },
			system: { attributes: { population: { value: 0 } } },
		});
		await new StonetopSteading(actor).setImprovementCompleted("township", false);
		expect(stored(actor).size).toBe("village");
		expect(stored(actor).system.attributes.population.value).toBe(3);
	});

	it("puts the Palisade back after a Stone Wall only while the Palisade is built", async () => {
		const wall = { completed: true, r: [], applied: { fortifications: ["Stone Wall"], removedFortifications: [{ name: "Palisade", checked: true }] } };
		const lost = liveActor({ improvements: { stoneWall: structuredClone(wall), palisade: { completed: false } }, fortifications: [{ name: "Stone Wall", checked: true }] });
		const result = await new StonetopSteading(lost).setImprovementCompleted("stoneWall", false);
		expect(stored(lost).fortifications.map(f => f.name)).not.toContain("Palisade");
		expect(result.summary).toContain("Palisade not put back (Palisade is not built)");

		const standing = liveActor({ improvements: { stoneWall: structuredClone(wall), palisade: { completed: true } }, fortifications: [{ name: "Stone Wall", checked: true }] });
		await new StonetopSteading(standing).setImprovementCompleted("stoneWall", false);
		expect(stored(standing).fortifications).toEqual([{ name: "Palisade", checked: true }]);
	});

	it("puts the Palisade back while a built homebrew improvement adds it, though the book's is not built", async () => {
		const wall = { completed: true, r: [], applied: { fortifications: ["Stone Wall"], removedFortifications: [{ name: "Palisade", checked: true }] } };
		const actor = liveActor({
			customImprovements: [{ slug: "custom-rampart", label: "Earthwork Rampart", sections: [], grants: { fortifications: ["Palisade"] } }],
			improvements: { stoneWall: wall, palisade: { completed: false }, "custom-rampart": { completed: true } },
			fortifications: [{ name: "Stone Wall", checked: true }],
		});
		const result = await new StonetopSteading(actor).setImprovementCompleted("stoneWall", false);
		expect(stored(actor).fortifications).toEqual([{ name: "Palisade", checked: true }]);
		expect(result.summary.join("\n")).not.toContain("not put back");
	});
});

describe("F2: the Fortunes reset spends the one-time Fortunes", () => {
	const built = () => liveActor({
		improvements: {
			palisade: { completed: true, r: [], applied: { stats: { fortunes: 1 }, fortifications: ["Palisade"] } },
			weaponsOfWar: { completed: true, r: [], applied: { stats: { defenses: 1 }, fortifications: ["Weapons of War"] } },
		},
		fortifications: [{ name: "Palisade", checked: true }, { name: "Weapons of War", checked: true }],
		system: { stats: { fortunes: { value: 3 }, defenses: { value: 1 } } },
	});

	it("zeroes each completed improvement's Fortunes in the reset's own write", async () => {
		const actor = built();
		await new StonetopSteading(actor).resetFortunes(1, { flags: () => ({ seasonSteps: { fortunesReset: "1:spring" } }), options: { stonetopMove: "Seasons Change" } });
		expect(actor.update).toHaveBeenCalledTimes(1);
		expect(stored(actor).system.stats.fortunes.value).toBe(1);
		expect(stored(actor).improvements.palisade.applied.stats).toEqual({ fortunes: 0 });
		expect(stored(actor).improvements.weaponsOfWar.applied.stats).toEqual({ defenses: 1 });
		expect(stored(actor).seasonSteps.fortunesReset).toBe("1:spring");
	});

	it("then takes back only what lasts when the improvement is lost", async () => {
		const actor = built();
		const steading = new StonetopSteading(actor);
		await steading.resetFortunes(1);
		expect(steading.improvementGivesBack("palisade")).toEqual(["Palisade removed from Fortifications"]);
		const result = await steading.setImprovementCompleted("palisade", false);
		expect(result.summary).toEqual(["Palisade removed from Fortifications"]);
		expect(stored(actor).system.stats.fortunes.value).toBe(1);
	});
});

describe("F6: boxes that name another improvement", () => {
	it("records the links on the book's own definitions", () => {
		const links = slug => linkedRequirementSlugs(IMPROVEMENT_DEFINITIONS.find(d => d.slug === slug));
		expect(links("expandedTrades").slice(0, 3)).toEqual([["harnessingStream"], ["raincatching"], ["mill"]]);
		expect(links("township")[4]).toEqual(["additionalHousing"]);
		expect(links("township")[5]).toEqual(["raincatching", "harnessingStream"]);
		expect(links("aurochsHunting")[0]).toEqual(["herdOfHorses"]);
		expect(links("wellTrainedMilitia")[2]).toEqual(["herdOfHorses"]);
		expect(links("palisade").every(l => l === null)).toBe(true);
	});

	// Book I p. 157: Expanded Trades, "If you cease to meet the requirements, decrease Prosperity by 1."
	it("unticks Expanded Trades' Mill when the Mill is lost, and its Prosperity lapses with it", async () => {
		const actor = liveActor({
			improvements: {
				mill: { completed: true, r: [], applied: { resources: ["Mill"] } },
				expandedTrades: { completed: true, r: [false, false, true, true, true, true, false, false, false], standing: null },
			},
			resources: [{ name: "Mill", checked: true }],
			system: { attributes: { prosperity: { value: 2 } } },
		});
		const result = await new StonetopSteading(actor).setImprovementCompleted("mill", false);
		expect(actor.update).toHaveBeenCalledTimes(1);
		expect(stored(actor).improvements.expandedTrades.r[2]).toBe(false);
		expect(stored(actor).improvements.expandedTrades.standing).toEqual({ prosperity: -1 });
		expect(stored(actor).system.attributes.prosperity.value).toBe(1);
		expect(result.summary).toContain(`Expanded Trades: unticked "Mill"`);
		expect(result.summary).toContain("Prosperity +2 → +1 (its requirements are no longer met)");
	});

	it("keeps Township's either/or ticked while the other improvement it names still stands", async () => {
		const r = Array(11).fill(true);
		const actor = liveActor({ improvements: {
			raincatching: { completed: true, applied: null }, harnessingStream: { completed: true, applied: null },
			township: { completed: false, r },
		} });
		const steading = new StonetopSteading(actor);
		await steading.setImprovementCompleted("raincatching", false);
		expect(stored(actor).improvements.township.r[5]).toBe(true);
		await steading.setImprovementCompleted("harnessingStream", false);
		expect(stored(actor).improvements.township.r[5]).toBe(false);
	});

	it("takes the militia's Cavalry with the herd, and the +1 Defenses if that leaves one tactic", async () => {
		const actor = liveActor({
			improvements: {
				herdOfHorses: { completed: true, applied: null },
				// Archery and Cavalry: two tactics, so the +1 Defenses stands.
				wellTrainedMilitia: { completed: true, r: [true, true, true, false, false, false], standing: { defenses: 1 } },
			},
			system: { stats: { defenses: { value: 2 } } },
		});
		const result = await new StonetopSteading(actor).setImprovementCompleted("herdOfHorses", false);
		expect(stored(actor).improvements.wellTrainedMilitia.r[2]).toBe(false);
		expect(stored(actor).system.stats.defenses.value).toBe(1);
		expect(result.summary).toContain(`Well-Trained Militia: unticked "Cavalry (requires a Herd of Horses)"`);
	});

	it("ticks nothing on completion", async () => {
		const actor = liveActor({ improvements: { expandedTrades: { completed: false, r: [] } } });
		await new StonetopSteading(actor).setImprovementCompleted("mill", true);
		expect(stored(actor).improvements.expandedTrades.r).toEqual([]);
	});
});

describe("B2: what completing would apply, said before it is", () => {
	it("previews the grant and any standing effect without writing", () => {
		const actor = liveActor({ fortifications: [{ name: "", checked: false }] });
		const steading = new StonetopSteading(actor);
		expect(steading.improvementCompletionPreview("palisade")).toEqual(["Fortunes +0 → +1", "Palisade added to Fortifications"]);
		expect(steading.improvementCompletionPreview("wellTrainedMilitia", { forceR: [true, true, true, false, false, false] }))
			.toEqual(["Defenses +0 → +1 (the militia trains in 2+ tactics)"]);
		expect(actor.update).not.toHaveBeenCalled();
	});
});
