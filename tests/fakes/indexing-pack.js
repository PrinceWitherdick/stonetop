import { vi } from "vitest";

// What a v14 Item pack indexes without being asked, plus `system.moveType`, which stonetop.js adds
// to CONFIG.Item.compendiumIndexFields.
const CORE_FIELDS = ["_id", "name", "img", "type", "sort", "folder", "system.moveType"];

const getPath = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);
function setPath(obj, path, value) {
	const keys = path.split(".");
	const last = keys.pop();
	let o = obj;
	for (const k of keys) o = o[k] ??= {};
	o[last] = value;
}

/**
 * A compendium pack whose index holds only the fields asked for, as a live one does. A plain fake
 * that hands back whole entries hides a reader that never requests a field it reads: the field is
 * there in the test and undefined in a world (the catalog shield's `shield` flag was one).
 * `getDocument` returns the whole entry, as the real one loads the whole document.
 */
export function indexingPack(entries = []) {
	const pack = {
		index: [],
		getIndex: vi.fn(async ({ fields = [] } = {}) => {
			pack.index = entries.map(entry => {
				const row = {};
				for (const f of [...CORE_FIELDS, ...fields]) {
					const v = getPath(entry, f);
					if (v !== undefined) setPath(row, f, v);
				}
				return row;
			});
		}),
		getDocument: vi.fn(async id => entries.find(e => e._id === id) ?? null),
	};
	return pack;
}
