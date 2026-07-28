import { vi } from "vitest";

// Shared stand-ins for the system-id migration tests (module/migration/**).
//
// Fixture ids rather than the live constants: this machinery has to work for ANY pair, and
// RENAME_TARGET_ID becomes null once the rename has actually been performed — at which
// point tests pinned to it would silently stop exercising anything.

export const OLD_ID = "legacy-sys";
export const NEW_ID = "renamed-sys";
export const MIGRATION_IDS = Object.freeze({ source: OLD_ID, target: NEW_ID });

/** A WorldCollection stand-in: iterable, with the documentClass the writer goes through. */
export function collection(docs, documentClass = { updateDocuments: vi.fn().mockResolvedValue([]) }) {
	const arr = [...docs];
	arr.documentClass = documentClass;
	return arr;
}

/** `game.settings.storage`, whose "world" entry is the Setting document collection. */
export function settingsStorage(docs) {
	const arr = [...docs];
	arr.documentClass = {
		createDocuments: vi.fn().mockResolvedValue([]),
		updateDocuments: vi.fn().mockResolvedValue([])
	};
	return { get: (scope) => (scope === "world" ? arr : null) };
}

/** A Map-backed localStorage: same surface (length/key/getItem/setItem), no browser. */
export class FakeStorage {
	constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
	get length() { return this.map.size; }
	key(i) { return [...this.map.keys()][i]; }
	getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
	setItem(k, v) { this.map.set(k, v); }
}

/** A world that passes preflight and has exactly one migratable actor and one setting. */
export function makeGame(over = {}) {
	return {
		user: { isGM: true },
		users: [{ name: "GM", active: true, isSelf: true }],
		modules: [],
		release: { generation: 14 },
		actors: Object.assign(
			collection([{ _id: "a1", flags: { [OLD_ID]: { herd: 1 } } }]),
			{ invalidDocumentIds: new Set() }
		),
		data: { options: {} },
		world: { id: "my-world" },
		settings: { storage: settingsStorage([{ _id: "s1", key: `${OLD_ID}.seeded`, _source: { value: "true" } }]) },
		packs: [],
		shutDown: vi.fn().mockResolvedValue(),
		...over
	};
}
