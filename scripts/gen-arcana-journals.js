// scripts/gen-arcana-journals.js
// Generates packs/src/arcana-journal/ from packs/src/arcana/ source files.
// Run with: node scripts/gen-arcana-journals.js

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.join(__dirname, "..");
const srcArcana = path.join(root, "packs", "src", "arcana");
const outDir    = path.join(root, "packs", "src", "arcana-journal");

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function randomId() {
    return Array.from({ length: 16 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
}

function buildPageContent(arcanum) {
    const f = arcanum.flags?.stonetop ?? {};
    const front = f.front ?? {};
    const back  = f.back  ?? {};

    let html = "";

    // Front side
    if (front.item) {
        const tags = front.item.note ? ` ${front.item.note}` : "";
        html += `<p><strong>Item (weight ${front.item.weight ?? 1}):</strong>${tags}</p>`;
    }
    if (front.description) html += front.description;
    if (front.unlock?.description) {
        html += `<p><em>${front.unlock.description}</em></p>`;
    }

    html += `<hr><h3>${back.title ?? "Mysteries"}</h3>`;

    if (back.description) html += back.description;
    if (back.resource) {
        html += `<p><strong>${back.resource.title ?? "Resource"}:</strong> max ${back.resource.max ?? "?"}</p>`;
    }

    return html;
}

async function readArcanaDir(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const results = [];
    for (const e of entries.filter(e => e.isFile() && e.name.endsWith(".json"))) {
        const raw = JSON.parse(await fs.readFile(path.join(dir, e.name), "utf8"));
        results.push(raw);
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
}

function buildJournal(name, arcanaList, journalId) {
    let sort = 100000;
    const pages = arcanaList.map(arc => {
        const pageId = randomId();
        return {
            _id:   pageId,
            _key:  `!journal.pages!${journalId}.${pageId}`,
            name:  arc.name,
            type:  "text",
            title: { show: true, level: 1 },
            image: { caption: "" },
            text:  { format: 1, content: buildPageContent(arc) },
            video: { controls: true, volume: 0.5 },
            src:   null,
            system: {},
            sort:  (sort += 100000),
            ownership: { default: -1 },
            flags: {},
        };
    });

    return {
        _id:       journalId,
        _key:      `!journal!${journalId}`,
        name,
        ownership: { default: 0 },
        flags:     { stonetop: {} },
        folder:    null,
        sort:      0,
        pages,
    };
}

async function main() {
    await fs.mkdir(outDir, { recursive: true });

    const major = await readArcanaDir(path.join(srcArcana, "major"));
    const minor = await readArcanaDir(path.join(srcArcana, "minor"));

    console.log(`Found ${major.length} major arcana, ${minor.length} minor arcana.`);

    const majorId = randomId();
    const minorId = randomId();

    const majorJournal = buildJournal("Major Arcana", major, majorId);
    const minorJournal = buildJournal("Minor Arcana", minor, minorId);

    await fs.writeFile(
        path.join(outDir, "major-arcana.json"),
        JSON.stringify(majorJournal, null, 2)
    );
    await fs.writeFile(
        path.join(outDir, "minor-arcana.json"),
        JSON.stringify(minorJournal, null, 2)
    );

    console.log(`✓ Written to packs/src/arcana-journal/`);
    console.log(`  major-arcana.json (${major.length} pages)`);
    console.log(`  minor-arcana.json (${minor.length} pages)`);
    console.log(`\nNext steps:`);
    console.log(`  1. Add "arcana-journal" to scripts/packs.js`);
    console.log(`  2. Add the pack to system.json`);
    console.log(`  3. Close Foundry and run: npm run pack`);
}

main().catch(err => { console.error(err); process.exit(1); });
