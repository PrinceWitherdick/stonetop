// Make the treasures described in Book II journals (the "Artifacts", "Curiosities and
// wonders", "Treasures of the Golden Oak" and flora "Sample specimens" sections)
// draggable onto a character sheet or the Items sidebar as inventory items — and, while
// we're there, restore the ◇ load-weight and ○ uses the rulebook prints beside each
// item (both were dropped when the book was extracted into the journals).
//
// The weights/uses live in a catalog recovered straight from the Book II PDF (see
// module/data/treasure-catalog.js and scripts/local/treasures/). This enhancer matches
// each rendered treasure line back to its catalog entry by the item's name, stamps a
// small ◇/○ badge onto the line, and wires the line (and, for the couple of compound
// entries, per-item chips) to emit a native Foundry `{type:"Item", data}` drop that the
// character sheet's inventory branch and the Items directory both already understand.
import { TREASURE_CATALOG } from "../data/treasure-catalog.js";
import { buildInventoryItemData } from "./inventory-item-data.js";
import { wrapGearNoteTerms, buildUsesResource } from "./gear-note.js";
import { slugify } from "./strings.js";

const norm = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// catalog grouped by section (journal entry name) → origin → entries (usually one; two
// for the split compounds). Built once.
const BY_SECTION = new Map();
for (const e of TREASURE_CATALOG) {
	const sec = norm(e.section);
	if (!BY_SECTION.has(sec)) BY_SECTION.set(sec, new Map());
	const byOrigin = BY_SECTION.get(sec);
	const key = norm(e.origin);
	if (!byOrigin.has(key)) byOrigin.set(key, { origin: e.origin, originNorm: key, items: [] });
	byOrigin.get(key).items.push(e);
}
// origin groups per section, sorted longest-origin-first so a line matches its most
// specific treasure (e.g. prefer "A silver sarcophagus…" over a shorter coincidence).
const GROUPS_FOR = new Map();
for (const [sec, byOrigin] of BY_SECTION) {
	GROUPS_FOR.set(sec, [...byOrigin.values()].sort((a, b) => b.originNorm.length - a.originNorm.length));
}
// Fallback pool (all groups) for when the journal's entry name can't be resolved.
const ALL_GROUPS = [...GROUPS_FOR.values()].flat().sort((a, b) => b.originNorm.length - a.originNorm.length);

/**
 * Origin groups to match a journal against. Scoped strictly to the journal's entry name
 * so treasure-shaped lines in unrelated journals aren't decorated; only when the entry
 * name can't be resolved at all do we fall back to the (specific) global pool.
 */
function groupsFor(entryName) {
	if (entryName == null || entryName === "") return ALL_GROUPS;
	return GROUPS_FOR.get(norm(entryName)) ?? [];
}

/** The catalog origin group whose name begins `text`, longest match first, or null. */
function matchGroup(text, groups) {
	for (const g of groups) {
		if (text === g.originNorm || text.startsWith(g.originNorm + " ")) return g;
	}
	return null;
}

/**
 * Build the native Foundry drop data for one catalog entry: a `move`/`inventory` Item
 * whose system + flags carry the recovered column, weight, note (tags + Value) and uses
 * track. Immobile treasures (no ◇, can't be carried) are recorded in the small column
 * with their "immobile" tag intact. The character sheet's `_onDropItemCreate` re-plants
 * it as an `inventory-custom` item; the Items sidebar stores it as a world item.
 */
export function treasureItemData(entry) {
	const column = entry.column === "regular" ? "regular" : "small";
	const rawNote = [entry.note, entry.value ? `Value ${entry.value}` : null].filter(Boolean).join(", ");
	const note = wrapGearNoteTerms(rawNote);
	let resource = null;
	if (entry.uses > 0) {
		resource = buildUsesResource(entry.uses, false);
		if (entry.usesLabel) resource.title = entry.usesLabel;
	}
	const data = buildInventoryItemData({ name: entry.name, column, weight: entry.weight, note, resource, moveType: "inventory" });
	// Mirror the gear metadata into flags.stonetop as well, so addDroppedInventoryItem
	// resolves it whichever source it reads first, and a sidebar copy keeps a slug.
	data.flags = { stonetop: { slug: slugify(entry.name), inventoryColumn: data.system.inventoryColumn } };
	if (data.system.weight != null) data.flags.stonetop.weight = data.system.weight;
	if (data.system.note) data.flags.stonetop.note = data.system.note;
	if (data.system.resource) data.flags.stonetop.resource = data.system.resource;
	return data;
}

function writeDrag(ev, entry) {
	ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", data: treasureItemData(entry) }));
	ev.dataTransfer.effectAllowed = "copy";
}

// The ◇/○ glyph badge the book prints beside a treasure. Weight = ◇×N (small = one small
// □, immobile = a lock), uses = ○×N with any label ("hours").
function badgeHtml(entry) {
	const parts = [];
	if (entry.column === "immobile") parts.push(`<span class="st-treasure-weight st-immobile" data-tooltip="Immobile — needs a cart or beast to move, not a personal-load item"><i class="fas fa-dolly"></i></span>`);
	else if (entry.weight > 0) parts.push(`<span class="st-treasure-weight" data-tooltip="Load ${entry.weight}">${"◇".repeat(Math.min(entry.weight, 6))}</span>`);
	else parts.push(`<span class="st-treasure-weight st-small" data-tooltip="Small item (no load)">▫</span>`);
	if (entry.uses > 0) {
		const label = entry.usesLabel ? ` <em>${entry.usesLabel}</em>` : "";
		parts.push(`<span class="st-treasure-uses" data-tooltip="${entry.uses} use${entry.uses === 1 ? "" : "s"}${entry.usesLabel ? " (" + entry.usesLabel + ")" : ""}">${"○".repeat(Math.min(entry.uses, 8))}${label}</span>`);
	}
	return parts.join("");
}

// Short label for a compound sub-item's chip: the parenthetical in its name, else name.
function chipLabel(entry) {
	const m = entry.name.match(/\(([^)]*)\)\s*$/);
	return m ? m[1] : entry.name;
}

/** Decorate one matched line: stamp the badge(s) and wire dragging. */
function decorate(line, group) {
	const items = group.items;
	const badge = document.createElement("span");
	badge.className = "st-treasure-badge";
	if (items.length === 1) {
		const entry = items[0];
		badge.innerHTML = `<i class="fas fa-hand-pointer st-treasure-grip" data-tooltip="Drag to a character sheet or the Items sidebar"></i>${badgeHtml(entry)}`;
		// Whole line drags the item (the affordance the badge advertises).
		line.classList.add("st-treasure-line");
		line.setAttribute("draggable", "true");
		line.addEventListener("dragstart", ev => { if (!ev.dataTransfer) return; writeDrag(ev, entry); });
	} else {
		// Compound (e.g. the two mirrors): one draggable chip per real item.
		badge.classList.add("st-treasure-compound");
		for (const entry of items) {
			const chip = document.createElement("span");
			chip.className = "st-treasure-chip";
			chip.setAttribute("draggable", "true");
			chip.dataset.tooltip = `Drag "${entry.name}" to a character sheet or the Items sidebar`;
			chip.innerHTML = `<i class="fas fa-hand-pointer st-treasure-grip"></i><span class="st-chip-label">${chipLabel(entry)}</span>${badgeHtml(entry)}`;
			chip.addEventListener("dragstart", ev => { ev.stopPropagation(); if (!ev.dataTransfer) return; writeDrag(ev, entry); });
			badge.appendChild(chip);
		}
	}
	line.appendChild(document.createTextNode(" "));
	line.appendChild(badge);
}

/**
 * Scan a rendered journal for treasure lines and make them draggable inventory items.
 * @param {HTMLElement|jQuery} root       the journal/page root
 * @param {string} [entryName]            the JournalEntry name, to scope catalog matches
 */
export function applyTreasureDrops(root, entryName) {
	const el = root?.jquery ? root[0] : root;
	if (!el?.querySelectorAll) return;
	const groups = groupsFor(entryName);
	if (!groups.length) return;
	const seen = new Set();
	for (const line of el.querySelectorAll("li, p")) {
		if (line.dataset.stTreasureBound || seen.has(line)) continue;
		// Skip a line that merely contains an already-decorated line (nested lists).
		const text = norm(line.textContent);
		if (text.length < 3) continue;
		const group = matchGroup(text, groups);
		if (!group) continue;
		line.dataset.stTreasureBound = "1";
		seen.add(line);
		decorate(line, group);
	}
}
