import { describe, it, expect, beforeEach, vi } from "vitest";
import { reapplyBook2ArtOnVersionChange, reapplyBook2Art, handleImportedJournalArt } from "../../module/book2-art/reapply.js";
import { BOOK2_ART_APPLY_MANIFEST } from "../../module/book2-art/manifest.js";
import { managedHash } from "../../module/hooks/journal-sync-core.js";

const JRN_SOURCE = (entryId) => `Compendium.stonetop_pwd.stonetop-journal.JournalEntry.${entryId}`;

// Runtime re-apply of Book II art after a system update, driven WITHOUT the PDF from
// the durable art on disk + the generated manifest. These drive the real function
// against fake packs / actors / FilePicker so the apply logic and its guards are
// exercised end to end.

const VERSION = "9.9.9";
const ROOT = "stonetop-book-art";
const { monsters, locations, settingOverviewMaps = [] } = BOOK2_ART_APPLY_MANIFEST;
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
		toObject: () => ({ pages: pages.map((p) => ({ _id: p.id, name: p.name, type: p.type, system: p.system, text: p.text })) }),
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
	const mapFiles = present === "none" ? []
		: settingOverviewMaps.filter((s) => !wanted || wanted.has(s.out)).map((s) => durableOf(s.out));

	const browse = vi.fn(async (source, path) => {
		if (path.endsWith("/assets/bestiary")) return { files: bestiaryFiles };
		if (path.endsWith("/assets/locations")) return { files: locationFiles };
		if (path.endsWith("/assets/maps")) return { files: mapFiles };
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

	it("gives every image of a multi-section page its own section (no row clobbers another)", async () => {
		// Regression guard for the Forge Lords bug: a journal page assigned art in several
		// sections is processed as one manifest row PER section, each doing its own
		// getDocument -> update on the same page. If a later row rebuilt from a stale read
		// it would drop an earlier row's placement. Assert every image lands in its assigned
		// section and appears nowhere else on the page.
		const byPage = new Map();
		for (const l of locations) {
			const key = `${l.journalEntryId}::${l.journalPageId}`;
			if (!byPage.has(key)) byPage.set(key, []);
			byPage.get(key).push(l);
		}
		const multi = [...byPage.entries()].find(([, rows]) => {
			const secs = new Set(rows.map((r) => r.sectionIndex ?? 0));
			return secs.size > 1 && rows.every((r) => r.images?.length) && Math.max(...secs) < 64;
		});
		expect(multi).toBeTruthy(); // the manifest must still carry a multi-section location page

		const [key, rows] = multi;
		const h = makeHarness();
		await reapplyBook2ArtOnVersionChange();

		const sections = h.pageDocs.get(key).system.sections;
		for (const r of rows) {
			const idx = r.sectionIndex ?? 0;
			for (const im of r.images) {
				const ref = `src="${durableOf(im.out)}"`;
				expect(sections[idx].body).toContain(ref);                                              // in its assigned section
				const strays = sections.filter((_, i) => i !== idx).filter((s) => (s?.body ?? "").includes(ref));
				expect(strays).toHaveLength(0);                                                          // and nowhere else
			}
		}
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

	it("drops art at the top when the GM deleted the target section (never silently skips)", async () => {
		const loc0 = locations[0];
		// A world copy whose sections the GM has cleared out entirely, so the manifest's
		// target section no longer exists.
		const locPage = makeWorldPage({ id: loc0.journalPageId, name: `cmp:${loc0.journalPageId}`, type: "location", system: { sections: [] } });
		const worldLoc = makeWorldJournal({ source: JRN_SOURCE(loc0.journalEntryId), name: loc0.name, pages: [locPage], stamp: true });

		const h = makeHarness({ worldJournals: [worldLoc] });
		await reapplyBook2ArtOnVersionChange();

		// A prose section is synthesised at the top of the page to hold the art, rather
		// than the image being dropped.
		expect(locPage.system.sections).toHaveLength(1);
		expect(locPage.system.sections[0]).toMatchObject({ kind: "prose", heading: "", group: "glance", danger: false });
		expect(locPage.system.sections[0].body).toContain(`src="${durableOf(loc0.images[0].out)}"`);
		// pristine entry re-stamped to the new (art-bearing) fingerprint
		expect(worldLoc._flags.stonetop_pwd.journalSync.hash).toBe(managedHash(worldLoc.toObject()));

		// idempotent: a second pass (as a version bump would trigger) adds no second copy
		const writesAfterFirst = locPage._writes;
		h.store.book2ArtSyncVersion = "";
		await reapplyBook2ArtOnVersionChange();
		expect(locPage._writes).toBe(writesAfterFirst);
		expect(locPage.system.sections).toHaveLength(1);
	});

	it("re-embeds Setting Overview regional maps into the setting journal's text pages", async () => {
		const so0 = settingOverviewMaps[0];
		expect(so0).toBeTruthy(); // guard: the apply manifest ships the SO maps

		// A world "Setting Overview" journal seeded from the compendium, with the plain
		// text page the map belongs on.
		const soPage = makeWorldPage({ id: so0.journalPageId, name: `cmp:${so0.journalPageId}`, type: "text", system: {} });
		soPage.text = { content: "<p>world setting prose</p>" };
		const worldSO = makeWorldJournal({ source: JRN_SOURCE(so0.journalEntryId), name: "Setting Overview", pages: [soPage], stamp: true });
		const preHash = worldSO._flags.stonetop_pwd.journalSync.hash;

		const h = makeHarness({ worldJournals: [worldSO] });
		await reapplyBook2ArtOnVersionChange();

		const durable = durableOf(so0.out);
		// compendium page: map figure prepended to text.content
		const cmpPage = h.pageDocs.get(`${so0.journalEntryId}::${so0.journalPageId}`);
		expect(cmpPage.text.content).toContain(`<figure class="stonetop-map"><img src="${durable}"`);
		// world copy: same figure, original prose preserved beneath it
		expect(soPage.text.content).toContain(`<figure class="stonetop-map"><img src="${durable}"`);
		expect(soPage.text.content).toContain("world setting prose");
		// pristine entry re-stamped to the new (map-bearing) fingerprint
		expect(worldSO._flags.stonetop_pwd.journalSync.hash).toBe(managedHash(worldSO.toObject()));
		expect(worldSO._flags.stonetop_pwd.journalSync.hash).not.toBe(preHash);
		expect(h.store.book2ArtSyncVersion).toBe(VERSION);
	});

	it("does not stack a second map when the setting page already carries one", async () => {
		const so0 = settingOverviewMaps[0];
		const soPage = makeWorldPage({ id: so0.journalPageId, name: `cmp:${so0.journalPageId}`, type: "text", system: {} });
		// a GM's own map figure already on the page -> left entirely alone
		soPage.text = { content: `<figure class="stonetop-map"><img src="worlds/mine/my-map.png" alt="mine"></figure><p>prose</p>` };
		const worldSO = makeWorldJournal({ source: JRN_SOURCE(so0.journalEntryId), name: "Setting Overview", pages: [soPage], stamp: true });

		makeHarness({ worldJournals: [worldSO] });
		await reapplyBook2ArtOnVersionChange();

		expect(soPage.text.content).toContain("worlds/mine/my-map.png");
		expect(soPage.text.content).not.toContain(durableOf(so0.out));
		expect(soPage._writes).toBe(0);
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

// The reusable worker behind the manual-import + self-heal triggers. These exercise the
// scoped / world-only / cheap-skip modes that the once-per-version pass above does not.
describe("reapplyBook2Art (scoped + self-heal modes)", () => {
	beforeEach(() => { vi.restoreAllMocks(); });

	it("scoped to `entries`: applies art to only those world journals, never the compendium/actors, never stamps the version", async () => {
		const mon0 = monsters[0];
		const loc0 = locations[0];
		const besPage = makeWorldPage({ id: mon0.journalPageId, name: `cmp:${mon0.journalPageId}`, type: "bestiary", system: { description: "<p>world bestiary prose</p>" } });
		const worldBes = makeWorldJournal({ source: JRN_SOURCE(mon0.journalEntryId), name: mon0.name, pages: [besPage], stamp: true });
		// Another journal that IS one of ours but is NOT in the scoped list -> left alone.
		const otherPage = makeWorldPage({ id: loc0.journalPageId, name: `cmp:${loc0.journalPageId}`, type: "location", system: { sections: Array.from({ length: 64 }, () => ({ kind: "prose", body: "<p>loc prose</p>" })) } });
		const otherLoc = makeWorldJournal({ source: JRN_SOURCE(loc0.journalEntryId), name: loc0.name, pages: [otherPage], stamp: true });

		const h = makeHarness({ worldJournals: [worldBes, otherLoc] });
		const preHash = worldBes._flags.stonetop_pwd.journalSync.hash;

		const result = await reapplyBook2Art({ entries: [worldBes] });

		// the scoped entry got its art and a fresh baseline
		expect(besPage.system.description).toContain(`src="${durableOf(mon0.out)}"`);
		expect(worldBes._flags.stonetop_pwd.journalSync.hash).not.toBe(preHash);
		// the unscoped-but-ours journal is untouched
		expect(otherPage._writes).toBe(0);
		expect(otherLoc._flagWrites).toBe(0);
		// no compendium actor re-point, no world-actor pass, no version stamp
		expect(h.besPack.getDocument).not.toHaveBeenCalled();
		expect(h.store.book2ArtSyncVersion).toBe("");
		expect(result.total).toBeGreaterThan(0);
	});

	it("world-only self-heal adds MISSING art to a world journal without writing the compendium page", async () => {
		const loc0 = locations[0];
		const secIdx = loc0.sectionIndex ?? 0;
		const locPage = makeWorldPage({ id: loc0.journalPageId, name: `cmp:${loc0.journalPageId}`, type: "location", system: { sections: Array.from({ length: 64 }, () => ({ kind: "prose", body: "<p>loc prose</p>" })) } });
		const worldLoc = makeWorldJournal({ source: JRN_SOURCE(loc0.journalEntryId), name: loc0.name, pages: [locPage], stamp: true });

		const h = makeHarness({ worldJournals: [worldLoc] });
		await reapplyBook2Art({ worldOnly: true, cheapWorldSkip: true });

		// world copy got the art...
		expect(locPage.system.sections[secIdx].body).toContain(`src="${durableOf(loc0.images[0].out)}"`);
		expect(locPage._writes).toBeGreaterThan(0);
		// ...but neither the compendium page nor any actor was written, and no version stamp
		expect(h.updates.filter((u) => u.kind === "page")).toHaveLength(0);
		expect(h.updates.filter((u) => u.kind === "actor")).toHaveLength(0);
		expect(h.store.book2ArtSyncVersion).toBe("");
	});

	it("cheapWorldSkip does not even read the compendium when the world journal already has its art", async () => {
		const loc0 = locations[0];
		const secIdx = loc0.sectionIndex ?? 0;
		// A single location journal ENTRY can be the target of several manifest rows (its
		// pages / sections). The cheap-skip check is per-entry, so to avoid ANY read every
		// durable src of every row that shares this entry id must already be embedded.
		const allSrcs = locations
			.filter((l) => l.journalEntryId === loc0.journalEntryId)
			.flatMap((l) => l.images.map((im) => durableOf(im.out)));
		const sections = Array.from({ length: 64 }, () => ({ kind: "prose", body: "<p>loc prose</p>" }));
		sections[secIdx] = { kind: "prose", body: allSrcs.map((src) => `<p><img class="stonetop-journal-art" src="${src}"></p>`).join("") + "<p>loc prose</p>" };
		const locPage = makeWorldPage({ id: loc0.journalPageId, name: `cmp:${loc0.journalPageId}`, type: "location", system: { sections } });
		const worldLoc = makeWorldJournal({ source: JRN_SOURCE(loc0.journalEntryId), name: loc0.name, pages: [locPage], stamp: true });

		const h = makeHarness({ worldJournals: [worldLoc] });
		await reapplyBook2Art({ worldOnly: true, cheapWorldSkip: true });

		expect(h.jrnPack.getDocument).not.toHaveBeenCalled(); // no compendium read
		expect(locPage._writes).toBe(0);
	});
});

describe("handleImportedJournalArt (createJournalEntry hook)", () => {
	beforeEach(() => { vi.restoreAllMocks(); });

	it("embeds art into a journal imported from our pack (after the debounce)", async () => {
		vi.useFakeTimers();
		const loc0 = locations[0];
		const secIdx = loc0.sectionIndex ?? 0;
		const locPage = makeWorldPage({ id: loc0.journalPageId, name: `cmp:${loc0.journalPageId}`, type: "location", system: { sections: Array.from({ length: 64 }, () => ({ kind: "prose", body: "<p>imported prose</p>" })) } });
		const worldLoc = makeWorldJournal({ source: JRN_SOURCE(loc0.journalEntryId), name: loc0.name, pages: [locPage] });
		worldLoc.id = "imported-1";

		const h = makeHarness({ worldJournals: [worldLoc] });
		global.game.user.id = "gm-1";
		global.game.journal.get = (id) => (id === "imported-1" ? worldLoc : null);

		handleImportedJournalArt(worldLoc, {}, "gm-1");
		await vi.runAllTimersAsync();
		vi.useRealTimers();

		expect(locPage.system.sections[secIdx].body).toContain(`src="${durableOf(loc0.images[0].out)}"`);
		// scoped: no compendium re-point, no version stamp
		expect(h.besPack.getDocument).not.toHaveBeenCalled();
		expect(h.store.book2ArtSyncVersion).toBe("");
	});

	it("ignores a non-GM caller, a foreign-pack journal, and another user's import", async () => {
		vi.useFakeTimers();
		const h = makeHarness({ worldJournals: [] });
		global.game.user.id = "gm-1";
		global.game.journal.get = () => null;

		const ours = { id: "a", _stats: { compendiumSource: JRN_SOURCE("abc") } };
		global.game.user.isGM = false;
		handleImportedJournalArt(ours, {}, "gm-1");            // not a GM
		global.game.user.isGM = true;
		handleImportedJournalArt({ id: "b", _stats: { compendiumSource: "Compendium.other.pack.JournalEntry.z" } }, {}, "gm-1"); // foreign pack
		handleImportedJournalArt(ours, {}, "someone-else");    // a different user's create

		await vi.runAllTimersAsync();
		vi.useRealTimers();

		// none of the three scheduled real work: the durable folder was never even browsed
		expect(h.browse).not.toHaveBeenCalled();
	});
});
