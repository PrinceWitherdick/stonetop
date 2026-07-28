import { describe, it, expect, vi } from "vitest";
import {
	makeStringRewriter, deepRewrite, planDocumentRewrite, rewriteSheetClassValue,
	rewriteSheetClasses, rewriteCompendiumConfiguration, finishDocuments, residualCount
} from "../../module/migration/finish.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import { PRIOR_SYSTEM_IDS } from "../../module/migration/compat.js";

const OLD = PRIOR_SYSTEM_IDS[0];
const opts = { systemId: SYSTEM_ID, priorIds: [OLD] };
const rewrite = makeStringRewriter(opts);

describe("makeStringRewriter", () => {
	it("rewrites asset paths", () => {
		expect(rewrite(`systems/${OLD}/assets/icons/a.svg`)).toBe(`systems/${SYSTEM_ID}/assets/icons/a.svg`);
	});

	it("rewrites compendium references", () => {
		expect(rewrite(`Compendium.${OLD}.stonetop-items.Item.abc`)).toBe(`Compendium.${SYSTEM_ID}.stonetop-items.Item.abc`);
	});

	// The case hand-enumerating document fields always misses.
	it("rewrites inside HTML", () => {
		const html = `<p><img src="systems/${OLD}/assets/a.webp"> see @UUID[Compendium.${OLD}.stonetop-journal.JournalEntry.x]</p>`;
		expect(rewrite(html)).toBe(`<p><img src="systems/${SYSTEM_ID}/assets/a.webp"> see @UUID[Compendium.${SYSTEM_ID}.stonetop-journal.JournalEntry.x]</p>`);
	});

	it("rewrites every occurrence in one string", () => {
		expect(rewrite(`systems/${OLD}/a systems/${OLD}/b`)).toBe(`systems/${SYSTEM_ID}/a systems/${SYSTEM_ID}/b`);
	});

	it("leaves other packages alone", () => {
		expect(rewrite("systems/dnd5e/icons/a.svg")).toBe("systems/dnd5e/icons/a.svg");
		expect(rewrite("worlds/my-world/assets/a.webp")).toBe("worlds/my-world/assets/a.webp");
	});

	it("passes non-strings through", () => {
		expect(rewrite(42)).toBe(42);
		expect(rewrite(null)).toBeNull();
	});
});

describe("deepRewrite", () => {
	it("reports no change and keeps identity when nothing is stale", () => {
		const input = { a: { b: "clean" } };
		const result = deepRewrite(input, rewrite);
		expect(result.changed).toBe(false);
		expect(result.value).toBe(input);
	});

	it("rewrites nested objects and arrays", () => {
		const input = { tokens: [{ texture: { src: `systems/${OLD}/a.webp` } }] };
		const result = deepRewrite(input, rewrite);
		expect(result.changed).toBe(true);
		expect(result.value.tokens[0].texture.src).toBe(`systems/${SYSTEM_ID}/a.webp`);
	});

	it("does not mutate the input", () => {
		const input = { img: `systems/${OLD}/a.webp` };
		deepRewrite(input, rewrite);
		expect(input.img).toBe(`systems/${OLD}/a.webp`);
	});

	it("leaves nulls and numbers intact", () => {
		expect(deepRewrite({ a: null, b: 3, c: false }, rewrite).changed).toBe(false);
	});
});

describe("planDocumentRewrite", () => {
	it("sends only the branches that changed", () => {
		const data = { _id: "a1", name: "Ari", img: `systems/${OLD}/a.webp`, system: { hp: 3 } };
		const update = planDocumentRewrite(data, { rewrite });
		expect(update).toEqual({ _id: "a1", img: `systems/${SYSTEM_ID}/a.webp` });
	});

	it("returns null for a clean document", () => {
		expect(planDocumentRewrite({ _id: "a1", img: "icons/svg/mystery-man.svg" }, { rewrite })).toBeNull();
	});

	// The rest of _stats is server-managed and would be rejected.
	it("sends compendiumSource alone out of _stats", () => {
		const data = {
			_id: "a1",
			_stats: { compendiumSource: `Compendium.${OLD}.stonetop-bestiary.Actor.x`, systemId: OLD, createdTime: 1 }
		};
		const update = planDocumentRewrite(data, { rewrite });
		expect(update._stats).toEqual({ compendiumSource: `Compendium.${SYSTEM_ID}.stonetop-bestiary.Actor.x` });
		expect(update._stats.systemId).toBeUndefined();
	});

	it("ignores a clean compendiumSource", () => {
		const data = { _id: "a1", _stats: { compendiumSource: `Compendium.${SYSTEM_ID}.stonetop-items.Item.x` } };
		expect(planDocumentRewrite(data, { rewrite })).toBeNull();
	});

	it("rewrites embedded arrays wholesale", () => {
		const data = { _id: "s1", tokens: [{ _id: "t1", texture: { src: `systems/${OLD}/a.webp` } }] };
		const update = planDocumentRewrite(data, { rewrite });
		expect(update.tokens[0].texture.src).toBe(`systems/${SYSTEM_ID}/a.webp`);
	});

	// "<packageId>.<ClassName>" is neither an asset path nor a compendium ref, so the
	// string rewriter cannot see it. Left stale, the document silently falls back to
	// Foundry's generic sheet with no error anywhere.
	it("rewrites a stale per-document sheet class", () => {
		const data = { _id: "a1", flags: { core: { sheetClass: `${OLD}.StonetopCharacterSheet` } } };
		const update = planDocumentRewrite(data, { ...opts, rewrite });
		expect(update.flags.core.sheetClass).toBe(`${SYSTEM_ID}.StonetopCharacterSheet`);
	});

	it("leaves a core sheet class alone", () => {
		const data = { _id: "a1", flags: { core: { sheetClass: "core.JournalSheet" } } };
		expect(planDocumentRewrite(data, { ...opts, rewrite })).toBeNull();
	});

	// update() deep-merges objects, so sending only the changed key is what PRESERVES the
	// siblings. Echoing them back would be redundant, and would risk writing a stale copy.
	it("sends only the sheet class, leaving sibling core flags to the merge", () => {
		const data = { _id: "a1", flags: { core: { sheetClass: `${OLD}.Sheet`, sourceId: "keep-me" } } };
		const update = planDocumentRewrite(data, { ...opts, rewrite });
		expect(update.flags.core).toEqual({ sheetClass: `${SYSTEM_ID}.Sheet` });
	});

	it("folds the sheet class into an existing flags rewrite rather than clobbering it", () => {
		const data = {
			_id: "a1",
			flags: { core: { sheetClass: `${OLD}.Sheet` }, mine: { art: `systems/${OLD}/a.webp` } }
		};
		const update = planDocumentRewrite(data, { ...opts, rewrite });
		expect(update.flags.core.sheetClass).toBe(`${SYSTEM_ID}.Sheet`);
		expect(update.flags.mine.art).toBe(`systems/${SYSTEM_ID}/a.webp`);
	});

	it("tolerates junk input", () => {
		expect(planDocumentRewrite(null, { rewrite })).toBeNull();
		expect(planDocumentRewrite("nope", { rewrite })).toBeNull();
	});
});

describe("sheet class rewrites", () => {
	it("rewrites the package prefix only", () => {
		expect(rewriteSheetClassValue(`${OLD}.StonetopCharacterSheet`, opts)).toBe(`${SYSTEM_ID}.StonetopCharacterSheet`);
	});

	it("leaves core sheets alone", () => {
		expect(rewriteSheetClassValue("core.JournalSheet", opts)).toBe("core.JournalSheet");
	});

	// A stale entry suppresses makeDefault on the newly registered sheets.
	it("walks the nested sheetClasses setting", () => {
		const setting = { Actor: { character: `${OLD}.StonetopCharacterSheet`, npc: "core.ActorSheet" } };
		const result = rewriteSheetClasses(setting, opts);
		expect(result.changed).toBe(true);
		expect(result.value.Actor.character).toBe(`${SYSTEM_ID}.StonetopCharacterSheet`);
		expect(result.value.Actor.npc).toBe("core.ActorSheet");
	});

	it("reports no change for an already-current setting", () => {
		const setting = { Actor: { character: `${SYSTEM_ID}.StonetopCharacterSheet` } };
		expect(rewriteSheetClasses(setting, opts).changed).toBe(false);
	});
});

describe("rewriteCompendiumConfiguration", () => {
	it("re-keys our packs onto the new id", () => {
		const config = { [`${OLD}.stonetop-items`]: { locked: true }, "core.x": { locked: false } };
		const result = rewriteCompendiumConfiguration(config, opts);
		expect(result.changed).toBe(true);
		expect(result.value[`${SYSTEM_ID}.stonetop-items`]).toEqual({ locked: true });
		expect(result.value["core.x"]).toEqual({ locked: false });
	});

	it("never clobbers configuration the new id already has", () => {
		const config = {
			[`${OLD}.stonetop-items`]: { locked: true },
			[`${SYSTEM_ID}.stonetop-items`]: { locked: false }
		};
		const result = rewriteCompendiumConfiguration(config, opts);
		expect(result.value[`${SYSTEM_ID}.stonetop-items`]).toEqual({ locked: false });
	});

	it("reports no change when nothing is stale", () => {
		expect(rewriteCompendiumConfiguration({ "core.x": {} }, opts).changed).toBe(false);
	});
});

describe("finishDocuments", () => {
	it("applies rewrites per target and counts them", async () => {
		const apply = vi.fn().mockResolvedValue([]);
		const targets = [{
			label: "Actors",
			docs: [
				{ _id: "a1", img: `systems/${OLD}/a.webp` },
				{ _id: "a2", img: "icons/svg/mystery-man.svg" }
			],
			apply
		}];

		const result = await finishDocuments(targets, { rewrite });
		expect(result.updated).toBe(1);
		expect(apply.mock.calls[0][0]).toEqual([{ _id: "a1", img: `systems/${SYSTEM_ID}/a.webp` }]);
	});

	it("prefers toObject() when the document provides one", async () => {
		const apply = vi.fn().mockResolvedValue([]);
		const doc = { toObject: () => ({ _id: "a1", img: `systems/${OLD}/a.webp` }) };
		await finishDocuments([{ label: "Actors", docs: [doc], apply }], { rewrite });
		expect(apply).toHaveBeenCalled();
	});

	it("skips a target with nothing to do", async () => {
		const apply = vi.fn();
		await finishDocuments([{ label: "Actors", docs: [{ _id: "a1", img: "clean" }], apply }], { rewrite });
		expect(apply).not.toHaveBeenCalled();
	});
});

describe("residualCount", () => {
	it("counts leftovers of every kind", () => {
		const data = { img: `systems/${OLD}/a.webp`, src: `Compendium.${OLD}.stonetop-items.Item.x` };
		expect(residualCount(data, { systemIds: [SYSTEM_ID, OLD], systemId: SYSTEM_ID })).toBe(2);
	});

	it("is zero for clean data", () => {
		expect(residualCount({ img: `systems/${SYSTEM_ID}/a.webp` }, { systemIds: [SYSTEM_ID, OLD], systemId: SYSTEM_ID })).toBe(0);
	});
});
