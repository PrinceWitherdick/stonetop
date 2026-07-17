/**
 * Shape a custom inventory item's document data, shared by every save target: the
 * actor-embedded item (moveType "inventory-custom", via createCustomInventoryItem)
 * and the reusable world Item the GM drags onto any sheet (moveType "inventory",
 * whose drop re-plants an "inventory-custom" copy). Returns `{ name, type, system }`.
 * Pure (no Foundry calls) so it stays unit-testable.
 *
 * @param {object}  input
 * @param {string}  input.name
 * @param {string} [input.column="regular"]   "regular" | "small"
 * @param {number} [input.weight=1]           ◇ load (regular column only)
 * @param {string} [input.note=""]            freeform tags/notes (already <em>-wrapped)
 * @param {object|null} [input.resource=null] { max, title, labels } uses/ammo track
 * @param {object|null} [input.armor=null]    { modifier } worn armor
 * @param {string} [input.moveType="inventory"] item's moveType
 * @param {boolean} [input.isTreasure=false]  a Book II journal treasure — groups the
 *        item under the gear tab's "Treasures" heading rather than the write-in columns
 * @param {string|null} [input.img=null]      document art. Omitted when falsy so Foundry
 *        applies its own default rather than being pinned to an empty path.
 */
export function buildInventoryItemData({ name, column = "regular", weight = 1, note = "", resource = null, armor = null, moveType = "inventory", isTreasure = false, img = null }) {
	const isRegular = column !== "small";
	const system = {
		moveType,
		inventoryColumn: isRegular ? "regular" : "small",
	};
	if (isRegular) {
		const w = Number(weight);
		system.weight = Math.max(1, Number.isFinite(w) ? w : 1);
	}
	if (note) system.note = note;
	if (resource) system.resource = resource;
	if (armor) system.armor = armor;
	if (isTreasure) system.isTreasure = true;
	const data = { name: String(name ?? "").trim() || "New Item", type: "move", system };
	if (img) data.img = img;
	return data;
}
