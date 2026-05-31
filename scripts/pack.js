import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { promises as fs } from "fs";
import path from "path";
import { PACKS } from "./packs.js";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function randomId() {
	return Array.from({ length: 16 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
}

function slugToLabel(slug) {
	return slug.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// Recursively ensures folder docs exist for every subdirectory and that each
// item/sub-folder doc has its `folder` field pointing at the right parent.
//
// - srcDir:        directory being processed
// - parentId:      the Foundry folder _id this level belongs to (null = root)
// - folderType:    "Item" | "JournalEntry" — written into folder docs
// - rootFoldersDir: the single _folders/ dir at the top of this pack (all
//                   folder docs live there regardless of nesting depth)
async function ensureFolders(srcDir, parentId = null, folderType = "Item", rootFoldersDir = null) {
	if (!rootFoldersDir) rootFoldersDir = path.join(srcDir, "_folders");

	const entries = await fs.readdir(srcDir, { withFileTypes: true });
	const subdirs  = entries.filter(e => e.isDirectory() && !e.name.startsWith("_"));
	if (!subdirs.length) return;

	await fs.mkdir(rootFoldersDir, { recursive: true });

	for (const subdir of subdirs) {
		const slug       = subdir.name;
		const folderFile = path.join(rootFoldersDir, `${slug}.json`);

		// Read existing doc or create a fresh one.
		let folderDoc;
		try {
			folderDoc = JSON.parse(await fs.readFile(folderFile, "utf8"));
		} catch {
			const id  = randomId();
			folderDoc = {
				name: slugToLabel(slug),
				type: folderType,
				description: "",
				folder: null,
				sorting: "a",
				sort: 0,
				color: null,
				flags: {},
				_id: id,
				_key: `!folders!${id}`,
			};
			console.log(`  Created folder: ${folderDoc.name}`);
		}

		// Sync parent reference.
		if (folderDoc.folder !== (parentId ?? null)) {
			folderDoc.folder = parentId ?? null;
		}
		await fs.writeFile(folderFile, JSON.stringify(folderDoc, null, 2));

		const folderId   = folderDoc._id;
		const subDirPath = path.join(srcDir, slug);
		const subEntries = await fs.readdir(subDirPath, { withFileTypes: true });
		const subSubdirs = subEntries.filter(e => e.isDirectory() && !e.name.startsWith("_"));

		if (subSubdirs.length > 0) {
			// Nested pack — recurse; sub-folder docs live in the same rootFoldersDir.
			await ensureFolders(subDirPath, folderId, folderType, rootFoldersDir);
		} else {
			// Flat — assign every item doc to this folder.
			const files = subEntries.filter(e => !e.isDirectory() && e.name.endsWith(".json"));
			for (const file of files) {
				const filepath = path.join(subDirPath, file.name);
				const doc = JSON.parse(await fs.readFile(filepath, "utf8"));
				if (doc.folder === folderId) continue;
				doc.folder = folderId;
				await fs.writeFile(filepath, JSON.stringify(doc, null, 2));
			}
		}
	}
}

async function ensureIds(srcDir) {
	const entries = await fs.readdir(srcDir, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(srcDir, entry.name);
		if (entry.isDirectory()) {
			await ensureIds(full);
			continue;
		}
		if (!entry.name.endsWith(".json")) continue;
		let doc;
		try {
			doc = JSON.parse(await fs.readFile(full, "utf8"));
		} catch (e) {
			throw new Error("Failed parsing " + full, { cause: e });
		}

		if (doc._id && doc._key) continue;
		doc._id ??= randomId();
		doc._key ??= `!items!${doc._id}`;
		await fs.writeFile(full, JSON.stringify(doc, null, 2));
		console.log(`  Assigned ID to ${entry.name}`);
	}
}

async function main() {
	for (const { name: pack, type: packType } of PACKS) {
		const src = `packs/src/${pack}`;
		try {
			await fs.access(src);
		} catch {
			console.log(`Skipping ${pack} — no source directory at ${src}`);
			continue;
		}
		await ensureFolders(src, null, packType);
		await ensureIds(src);
		const dest = `packs/${pack}`;
		await fs.rm(dest, { recursive: true, force: true });
		await fs.mkdir(dest, { recursive: true });
		try {
			await compilePack(src, dest, { nedb: false, log: true, recursive: true });
		} catch (err) {
			// Node v24 + abstract-level teardown race: iterator cleanup races with DB close.
			// All files are written before this throws, so it's safe to ignore.
			if (err.code !== "LEVEL_ITERATOR_NOT_OPEN") throw err;
		}
	}
}

// process.exit prevents a Node v24 / abstract-level teardown race where open
// iterators are garbage-collected after the DB closes, causing a spurious crash.
main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
