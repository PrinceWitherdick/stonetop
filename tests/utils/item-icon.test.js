import { describe, expect, it } from "vitest";
import { STONETOP_ITEM_ICONS, stonetopThumbnail } from "../../module/utils/item-icon.js";

/** An art-less item of the given sub-type / moveType. */
const bare = (type, moveType) => ({ img: "icons/svg/item-bag.svg", type, system: { moveType } });

describe("stonetopThumbnail", () => {
	describe("art the item chose for itself", () => {
		it("wins over any fallback", () => {
			const art = "systems/stonetop_pwd/assets/icons/arcana/icon-arcana-mindgem.webp";
			expect(stonetopThumbnail({ ...bare("move", "arcanum"), img: art })).toBe(art);
		});

		it("still wins for a move", () => {
			const art = "icons/weapons/swords/sword-broad.webp";
			expect(stonetopThumbnail({ ...bare("move", "basic"), img: art })).toBe(art);
		});
	});

	describe("moves fall back to the move marker", () => {
		it.each(["basic", "playbook", "expedition", "homefront", "post-death", "special", "follower", "other"])(
			"moveType %s", (moveType) => {
				expect(stonetopThumbnail(bare("move", moveType))).toBe(STONETOP_ITEM_ICONS.move);
			});

		it.each(["npcMove", "monsterMove"])("sub-type %s, whatever its moveType", (type) => {
			expect(stonetopThumbnail(bare(type, undefined))).toBe(STONETOP_ITEM_ICONS.move);
			expect(stonetopThumbnail(bare(type, "inventory"))).toBe(STONETOP_ITEM_ICONS.move);
		});

		it("treats an unrecognised moveType as a move — the sub-type name is the promise", () => {
			expect(stonetopThumbnail(bare("move", "some-future-type"))).toBe(STONETOP_ITEM_ICONS.move);
		});
	});

	describe("arcana fall back to the triple-spiral marker", () => {
		it("moveType arcanum is a thing, not a move", () => {
			expect(stonetopThumbnail(bare("move", "arcanum"))).toBe(STONETOP_ITEM_ICONS.arcanum);
		});

		it("has its own marker, distinct from gear and from moves", () => {
			expect(STONETOP_ITEM_ICONS.arcanum).not.toBe(STONETOP_ITEM_ICONS.object);
			expect(STONETOP_ITEM_ICONS.arcanum).not.toBe(STONETOP_ITEM_ICONS.move);
		});
	});

	describe("things fall back to the object marker", () => {
		it("moveType inventory is gear, not a move", () => {
			expect(stonetopThumbnail(bare("move", "inventory"))).toBe(STONETOP_ITEM_ICONS.object);
		});

		it("covers sub-types that are neither moves nor gear", () => {
			expect(stonetopThumbnail(bare("playbook", undefined))).toBe(STONETOP_ITEM_ICONS.object);
		});
	});

	describe("placeholders count as no art", () => {
		it.each(["", null, undefined, "icons/svg/item-bag.svg", "icons/svg/mystery-man.svg"])(
			"%s", (img) => {
				expect(stonetopThumbnail({ img, type: "move", system: { moveType: "basic" } }))
					.toBe(STONETOP_ITEM_ICONS.move);
			});
	});

	it("survives a malformed item rather than throwing", () => {
		expect(stonetopThumbnail(undefined)).toBe(STONETOP_ITEM_ICONS.object);
		expect(stonetopThumbnail({})).toBe(STONETOP_ITEM_ICONS.object);
	});
});
