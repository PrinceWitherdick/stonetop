import { describe, it, expect, beforeEach, vi } from "vitest";
import { reapplyBook2ArtOnVersionChange } from "../../module/book2-art/reapply.js";
import { BOOK2_ART_APPLY_MANIFEST } from "../../module/book2-art/manifest.js";
import { managedHash } from "../../module/hooks/journal-sync-core.js";

const JRN_SOURCE = (entryId) => `Compendium.stonetop_pwd.stonetop-journal.JournalEntry.${entryId}`;

// Runtime re-apply of Book II art after a system update, driven WITHOUT the PDF from
// the durable art on disk + the generated manifest. These drive the real function
// against fake packs / actors / FilePicker so the apply logic and its guards are
// exercised end to end.

const VERSION = "9.9.9";
const ROOT = "stonetop-book-art";
const { monsters, locations } = BOOK2_ART_APPLY_MANIFEST;
const DEFAULT_ICON = "icons/svg/mystery-man.svg";

function setDotted(obj, path, value) {
	const parts = path.split(".");
	let node = obj;
	for (let i = 0; i < parts.length - 1; i++) node = (node[parts[i]] ??= {});
	node[parts.at(-1)] = value;
}
function applyUpdate(doc, upd) {
	for (const [k, v] of Object.entries(upd)) setDotted(doc, k, v);
}

const uuidOf = (m) => `Compendium.${m.actorPack}.Actor.${m.actorId}`;
const durableOf = (out) => `${ROOT}/${out}`;

function makeWorldActor({ source, img, legacy = false, fit = "cover" }) {
	const actor = {
		img,
		prototypeToken: { texture: { src: img, fit } },
		_stats: legacy ? {} : { compendiumSource: source },
		getFlag: (scope, key) => (legacy && scope === "core" && key === "sourceId" ? source : undefined),
		_writes: 0,
	};
	actor.update = async (upd) => { applyUpdate(actor, upd); actor._writes++; };
	return actor;
}

function makeWorldPage({ id, name, type, system }) {
	const page = { id, _id: id, name, type, system, _writes: 0 };
	page.update = async (upd) => { applyUpdate(page, upd); page._writes++; };
	return page;
}

// A world JournalEntry seeded from our compendium. `pages` are makeWorldPage docs.
// If `stamp` is true its journalSync baseline is set to the hash of its CURRENT content
// (i.e. it reads as pristine); pass an explicit `syncHash` to simulate a GM-edited entry.
function makeWorldJournal({ source, name = "World Entry", pages, stamp = false, syncHash, version = VERSION }) {
	const flags = {};
	const entry = {
		name,
		pages,
		_stats: { compendiumSource: source },
		_flagWrites: 0,
		getFlag: (scope, key) => flags?.[scope]?.[key],
		setFlag: async (scope, key, val) => { (flags[scope] ??= {})[key] = val; entry._flagWrites++; },
		toObject: () => ({ pages: pages.map((p) => ({ _id: p.id, name: p.name, type: p.type, system: p.system })) }),
	};
	entry._flags = flags;
	if (stamp) flags.stonetop_pwd = { journalSync: { hash: managedHash(entry.toObject()), version } };
	else if (syncHash) flags.stonetop_pwd = { journalSync: { hash: syncHash, version } };
	return entry;
}

// `present`: "all" | "none" | array of out-paths that exist on disk.
function makeHarness({ isGM = true, syncVersion = "", present = "all", worldActors = [], worldJournals = [] } = {}) {
	const store = { book2ArtSyncVersion: syncVersion, book2ArtRoot: ROOT };
	const besDocs = new Map();
	const pageDocs = new Map();
	const updates = [];

	const besPack = {
		locked: true,
		configure: vi.fn(async ({ locked }) => { besPack.locked = locked; }),
		getDocument: vi.fn(async (id) => {
			if (!besDocs.has(id)) {
				const doc = {
					id, img: DEFAULT_ICON,
					prototypeToken: { texture: { src: DEFAULT_ICON, fit: "contain" } },
				};
				doc.update = async (upd) => { applyUpdate(doc, upd); updates.push({ kind: "actor", id }); };
				besDocs.set(id, doc);
			}
			return besDocs.get(id);
		}),
	};

	const jrnPack = {
		locked: true,
		configure: vi.fn(async ({ locked }) => { jrnPack.locked = locked; }),
		getDocument: vi.fn(async (entryId) => ({
			pages: {
				get: (pageId) => {
					const key = `${entryId}::${pageId}`;
					if (!pageDocs.has(key)) {
						const page = {
							id: pageId, _id: pageId, name: `cmp:${pageId}`, type: "location",
							system: {
								description: "<p>prose</p>",
								sections: Array.from({ length: 64 }, () => ({ body: "<p>loc prose</p>" })),
							},
						};
						page.update = async (upd) => { applyUpdate(page, upd); updates.push({ kind: "page", key }); };
						pageDocs.set(key, page);
					}
					return pageDocs.get(key);
				},
			},
		})),
	};

	const wanted = Array.isArray(present) ? new Set(present) : null;
	const bestiaryFiles = present === "none" ? []
		: monsters.filter((m) => !wanted || wanted.has(m.out)).map((m) => durableOf(m.out));
	const locationFiles = present === "none" ? []
		: locations.flatMap((l) => l.images).filter((im) => !wanted || wanted.has(im.out)).map((im) => durableOf(im.out));

	const browse = vi.fn(async (source, path) => {
		if (path.endsWith("/assets/bestiary")) return { files: bestiaryFiles };
		if (path.endsWith("/assets/locations")) return { files: locationFiles };
		return { files: [] };
	});

	const infoSpy = vi.fn();
	global.FilePicker = { browse };
	global.game = {
		user: { isGM },
		system: { version: VERSION },
		settings: {
			get: (ns, key) => store[key],
			set: async (ns, key, val) => { store[key] = val; },
		},
		packs: { get: (id) => (id === "stonetop_pwd.stonetop-bestiary" ? besPack : id === "stonetop_pwd.stonetop-journal" ? jrnPack : null) },
		actors: worldActors,
			journal: worldJournals,
	};
	global.ui = { notifications: { info: infoSpy, warn: vi.fn(), error: vi.fn() } };

	return { store, besPack, jrnPack, besDocs, pageDocs, updates, browse, infoSpy };
}

describe("reapplyBook2ArtOnVersionChange", () => {
	beforeEach(() => { vi.restoreAllMocks(); });

	it("does nothing for a non-GM", async () => {
		const h = makeHarness({ isGM: false });
		await reapplyBook2ArtOnVersionChange();
		expect(h.browse).not.toHaveBeenCalled();
		expect(h.updates).toHaveLength(0);
		expect(h.store.book2ArtSyncVersion).toBe("");
	});

	it("early-returns (no browse) when the version was already synced", async () => {
		const h = makeHarness({ syncVersion: VERSION });
		await reapplyBook2ArtOnVersionChange();
		expect(h.browse).not.toHaveBeenCalled();
		expect(h.besPack.getDocument).not.toHaveBeenCalled();
		expect(h.updates).toHaveLength(0);
	});

	it("does not stamp the version when no durable art is on disk (self-heals next load)", async () => {
		const h = makeHarness({ present: "none" });
		await reapplyBook2ArtOnVersionChange();
		expect(h.browse).toHaveBeenCalled();
		expect(h.besPack.getDocument).not.toHaveBeenCalled();
		expect(h.updates).toHaveLength(0);
		expect(h.store.book2ArtSyncVersion).toBe(""); // unstamped -> retries
	});

	it("re-points every compendium actor + journal page and stamps the version", async () => {
		const mon0 = monsters[0];
		const worldActors = [
			// our own broken in-system pointer -> re-pointed to the durable path
			makeWorldActor({ source: uuidOf(mon0), img: `systems/stonetop_pwd/${mon0.out}` }),
			// same monster via the legacy core.sourceId flag -> re-pointed
			makeWorldActor({ source: uuidOf(mon0), img: `systems/stonetop_pwd/${mon0.out}`, legacy: true }),
			// a GM's custom portrait -> left untouched
			makeWorldActor({ source: uuidOf(mon0), img: "worlds/mine/custom-crinwin.png" }),
			// not one of ours -> ignored
			makeWorldActor({ source: "Compendium.other.Actor.zzz", img: "whatever.png" }),
		];
		const h = makeHarness({ worldActors });

		await reapplyBook2ArtOnVersionChange();

		// compendium actors: all present -> all re-pointed to durable portrait + token
		expect(h.besDocs.size).toBe(monsters.length);
		for (const m of monsters) {
			const doc = h.besDocs.get(m.actorId);
			expect(doc.img).toBe(durableOf(m.out));
			expect(doc.prototypeToken.texture.src).toBe(durableOf(m.out));
			expect(doc.prototypeToken.texture.fit).toBe("cover");
		}
		// bestiary journal pages: art prepended once
		const besPage = h.pageDocs.get(`${mon0.journalEntryId}::${mon0.journalPageId}`);
		expect(besPage.system.description).toContain(`src="${durableOf(mon0.out)}"`);
		expect(besPage.system.description.indexOf("<img")).toBeLessThan(besPage.system.description.indexOf("<p>prose"));
		// location journal pages: art appended into the section body
		const loc0 = locations[0];
		const locPage = h.pageDocs.get(`${loc0.journalEntryId}::${loc0.journalPageId}`);
		expect(locPage.system.sections[loc0.sectionIndex].body).toContain(`src="${durableOf(loc0.images[0].out)}"`);

		// world actors: only OUR pointers fixed, custom/unrelated left alone
		expect(worldActors[0].img).toBe(durableOf(mon0.out));
		expect(worldActors[1].img).toBe(durableOf(mon0.out));
		expect(worldActors[2].img).toBe("worlds/mine/custom-crinwin.png");
		expect(worldActors[2]._writes).toBe(0);
		expect(worldActors[3]._writes).toBe(0);

		// packs unlocked then relocked; version stamped; GM notified
		expect(h.besPack.locked).toBe(true);
		expect(h.jrnPack.locked).toBe(true);
		expect(h.store.book2ArtSyncVersion).toBe(VERSION);
		expect(h.infoSpy).toHaveBeenCalled();
	});

	it("is idempotent: a second pass at the same version makes no further writes", async () => {
		const worldActors = [makeWorldActor({ source: uuidOf(monsters[0]), img: `systems/stonetop_pwd/${monsters[0].out}` })];
		const h = makeHarness({ worldActors });

		await reapplyBook2ArtOnVersionChange();
		const writesAfterFirst = h.updates.length;
		const worldWritesAfterFirst = worldActors[0]._writes;

		// force it to run again (as a new version bump would) against already-correct docs
		h.store.book2ArtSyncVersion = "";
		await reapplyBook2ArtOnVersionChange();

		expect(h.updates.length).toBe(writesAfterFirst); // no new doc writes
		expect(worldActors[0]._writes).toBe(worldWritesAfterFirst);
		expect(h.store.book2ArtSyncVersion).toBe(VERSION);
	});

	it("only wires art that is actually on disk (partial import)", async () => {
		const mon0 = monsters[0];
		const worldActors = [makeWorldActor({ source: uuidOf(mon0), img: `systems/stonetop_pwd/${mon0.out}` })];
		const h = makeHarness({ present: [mon0.out], worldActors }); // only crinwin's bestiary art present

		await reapplyBook2ArtOnVersionChange();

		const actorWrites = h.updates.filter((u) => u.kind === "actor").length;
		const pageWrites = h.updates.filter((u) => u.kind === "page").length;
		expect(actorWrites).toBe(1); // just crinwin
		expect(pageWrites).toBe(1); // just crinwin's bestiary page; no location pages (none present)
		expect(worldActors[0].img).toBe(durableOf(mon0.out));
		expect(h.store.book2ArtSyncVersion).toBe(VERSION);
	});

	it("embeds art into pristine world journals and re-stamps their baseline", async () => {
		const mon0 = monsters[0];
		const loc0 = locations[0];
		const secIdx = loc0.sectionIndex ?? 0;

		const besPage = makeWorldPage({ id: mon0.journalPageId, name: `cmp:${mon0.journalPageId}`, type: "bestiary", system: { description: "<p>world bestiary prose</p>" } });
		const worldBes = makeWorldJournal({ source: JRN_SOURCE(mon0.journalEntryId), name: mon0.name, pages: [besPage], stamp: true });

		const locPage = makeWorldPage({ id: loc0.journalPageId, name: `cmp:${loc0.journalPageId}`, type: "location", system: { sections: Array.from({ length: 64 }, () => ({ kind: "prose", body: "<p>world loc prose</p>" })) } });
		const worldLoc = makeWorldJournal({ source: JRN_SOURCE(loc0.journalEntryId), name: loc0.name, pages: [locPage], stamp: true });

		// A world journal seeded from a DIFFERENT compendium -> never touched.
		const foreignPage = makeWorldPage({ id: "foreign", name: "Foreign", type: "location", system: { sections: [{ kind: "prose", body: "<p>x</p>" }] } });
		const foreign = makeWorldJournal({ source: "Compendium.other.pack.JournalEntry.zzz", pages: [foreignPage], stamp: true });

		const preBesHash = worldBes._flags.stonetop_pwd.journalSync.hash;
		const preLocHash = worldLoc._flags.stonetop_pwd.journalSync.hash;

		const h = makeHarness({ worldJournals: [worldBes, worldLoc, foreign] });
		await reapplyBook2ArtOnVersionChange();

		// art embedded into the world copies
		expect(besPage.system.description).toContain(`src="${durableOf(mon0.out)}"`);
		expect(locPage.system.sections[secIdx].body).toContain(`src="${durableOf(loc0.images[0].out)}"`);

		// pristine entries re-stamped to the NEW (art-bearing) fingerprint
		expect(worldBes._flags.stonetop_pwd.journalSync.hash).toBe(managedHash(worldBes.toObject()));
		expect(worldBes._flags.stonetop_pwd.journalSync.hash).not.toBe(preBesHash);
		expect(worldLoc._flags.stonetop_pwd.journalSync.hash).toBe(managedHash(worldLoc.toObject()));
		expect(worldLoc._flags.stonetop_pwd.journalSync.hash).not.toBe(preLocHash);

		// unrelated journal untouched
		expect(foreignPage._writes).toBe(0);
		expect(foreign._flagWrites).toBe(0);
		expect(h.store.book2ArtSyncVersion).toBe(VERSION);
	});

	it("adds art to an EDITED world journal but leaves its edited baseline intact", async () => {
		const loc0 = locations[0];
		const secIdx = loc0.sectionIndex ?? 0;
		const locPage = makeWorldPage({ id: loc0.journalPageId, name: `cmp:${loc0.journalPageId}`, type: "location", system: { sections: Array.from({ length: 64 }, () => ({ kind: "prose", body: "<p>GM edited prose</p>" })) } });
		// baseline hash that does NOT match current content -> reads as GM-edited
		const worldLoc = makeWorldJournal({ source: JRN_SOURCE(loc0.journalEntryId), name: loc0.name, pages: [locPage], syncHash: "EDITED-HASH" });

		makeHarness({ worldJournals: [worldLoc] });
		await reapplyBook2ArtOnVersionChange();

		// art still applied (additive, never clobbers prose)
		expect(locPage.system.sections[secIdx].body).toContain(`src="${durableOf(loc0.images[0].out)}"`);
		expect(locPage.system.sections[secIdx].body).toContain("GM edited prose");
		// edited baseline left untouched: the managed channel keeps hands off future prose
		expect(worldLoc._flags.stonetop_pwd.journalSync.hash).toBe("EDITED-HASH");
		expect(worldLoc._flagWrites).toBe(0);
	});

	it("matches a refreshed world page by name+type when its id no longer matches", async () => {
		const loc0 = locations[0];
		const secIdx = loc0.sectionIndex ?? 0;
		// A managed refresh recreated the page with a fresh id, so id-matching misses it;
		// name+type still line up with the compendium page (harness name `cmp:<pageId>`).
		const locPage = makeWorldPage({ id: "regenerated-id", name: `cmp:${loc0.journalPageId}`, type: "location", system: { sections: Array.from({ length: 64 }, () => ({ kind: "prose", body: "<p>world loc prose</p>" })) } });
		const worldLoc = makeWorldJournal({ source: JRN_SOURCE(loc0.journalEntryId), name: loc0.name, pages: [locPage], stamp: true });

		makeHarness({ worldJournals: [worldLoc] });
		await reapplyBook2ArtOnVersionChange();

		expect(locPage.system.sections[secIdx].body).toContain(`src="${durableOf(loc0.images[0].out)}"`);
	});

	it("is idempotent on world journals: a second pass makes no further writes", async () => {
		const loc0 = locations[0];
		const locPage = makeWorldPage({ id: loc0.journalPageId, name: `cmp:${loc0.journalPageId}`, type: "location", system: { sections: Array.from({ length: 64 }, () => ({ kind: "prose", body: "<p>world loc prose</p>" })) } });
		const worldLoc = makeWorldJournal({ source: JRN_SOURCE(loc0.journalEntryId), name: loc0.name, pages: [locPage], stamp: true });

		const h = makeHarness({ worldJournals: [worldLoc] });
		await reapplyBook2ArtOnVersionChange();
		const pageWritesAfterFirst = locPage._writes;

		h.store.book2ArtSyncVersion = ""; // force another run as a version bump would
		await reapplyBook2ArtOnVersionChange();

		expect(locPage._writes).toBe(pageWritesAfterFirst); // art already present -> no new write
	});

	it("re-points world-actor art/token conservatively and never reverts the GM's token fit", async () => {
		const mon0 = monsters[0];
		const stale = `systems/stonetop_pwd/${mon0.out}`; // the pre-durable path an update broke
		const durable = durableOf(mon0.out);
		const mk = ({ img, tokenSrc, tokenFit }) => {
			const a = {
				img,
				prototypeToken: { texture: { src: tokenSrc, fit: tokenFit } },
				_stats: { compendiumSource: uuidOf(mon0) },
				getFlag: () => undefined,
			};
			a.update = async (upd) => { applyUpdate(a, upd); };
			return a;
		};
		const a1 = mk({ img: stale, tokenSrc: stale, tokenFit: "contain" }); // our art, GM chose contain
		const a2 = mk({ img: stale, tokenSrc: "worlds/mine/tok.png", tokenFit: "cover" }); // custom token src
		const a3 = mk({ img: "worlds/mine/portrait.png", tokenSrc: stale, tokenFit: "cover" }); // custom portrait

		makeHarness({ worldActors: [a1, a2, a3] });
		await reapplyBook2ArtOnVersionChange();

		// a1: both our stale paths re-pointed; the GM's fit:"contain" is preserved
		expect(a1.img).toBe(durable);
		expect(a1.prototypeToken.texture.src).toBe(durable);
		expect(a1.prototypeToken.texture.fit).toBe("contain");
		// a2: portrait fixed, custom token src left alone
		expect(a2.img).toBe(durable);
		expect(a2.prototypeToken.texture.src).toBe("worlds/mine/tok.png");
		// a3: token fixed, custom portrait left alone
		expect(a3.img).toBe("worlds/mine/portrait.png");
		expect(a3.prototypeToken.texture.src).toBe(durable);
	});

	it("does not stamp the version if an item write throws (retries next load, other docs still applied)", async () => {
		const mon0 = monsters[0];
		const boom = {
			img: `systems/stonetop_pwd/${mon0.out}`,
			prototypeToken: { texture: { src: `systems/stonetop_pwd/${mon0.out}`, fit: "cover" } },
			_stats: { compendiumSource: uuidOf(mon0) },
			getFlag: () => undefined,
			update: async () => { throw new Error("actor locked out"); },
		};
		const h = makeHarness({ worldActors: [boom] });
		await reapplyBook2ArtOnVersionChange();

		// the throwing world actor does NOT abort the pass: compendium art still applied
		expect(h.besDocs.get(mon0.actorId).img).toBe(durableOf(mon0.out));
		// but the version is left unstamped so the next load retries
		expect(h.store.book2ArtSyncVersion).toBe("");
	});
});
