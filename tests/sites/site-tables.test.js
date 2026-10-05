import { describe, it, expect } from "vitest";
import {
	SITE_MANNERS, REGIONS, siteManner, region, visibleTables, pickLines,
	rollMannerTable, rollTerrain, rollOnTable,
	COMBINE_SEP, againPool, againSpec, combinableRows, combineMax,
	joinCombined, splitCombined, primaryPick,
	findRow, currentPickText, stripRollInstruction, slotOwners, slotPool, claimedAfter,
	regionTables, regionPickLines, REGION_TABLE_PREFIX,
} from "../../module/data/site-tables.js";
import { SITE_FEATURES, SITE_CAUSES } from "../../module/data/things-below-tables.js";

/** The die a table declares, as a number ("1d12" -> 12). */
const dieSize = (die) => Number(String(die).split("d")[1]);

/** Every table of every manner, flattened, with enough context to name a failure. */
const allTables = SITE_MANNERS.flatMap(m => m.tables.map(t => ({ manner: m.id, ...t })));

/** Every rollable table in the file: the manners' own, plus each region's terrain and further tables. */
const everyTable = [
	...allTables,
	...REGIONS.map(r => ({ manner: r.id, ...r.terrain })),
	...REGIONS.flatMap(r => (r.tables ?? []).map(t => ({ manner: r.id, ...t }))),
];

describe("Book II site tables", () => {
	it("covers each table's die exactly once, with no gaps or overlaps", () => {
		for (const t of allTables) {
			const covered = new Set();
			for (const row of t.rows) {
				for (let n = row.min; n <= row.max; n++) {
					expect(covered.has(n), `${t.manner}.${t.key} repeats ${n}`).toBe(false);
					covered.add(n);
				}
			}
			const size = dieSize(t.die);
			expect([...covered].sort((a, b) => a - b), `${t.manner}.${t.key} span`)
				.toEqual(Array.from({ length: size }, (_, i) => i + 1));
		}
	});

	it("gives every table a key unique within its manner, so picks can't collide", () => {
		for (const m of SITE_MANNERS) {
			const keys = m.tables.map(t => t.key);
			expect(new Set(keys).size, `${m.id} keys`).toBe(keys.length);
		}
	});

	it("gives every table a label unique within its manner, so a stored pick reads back", () => {
		for (const m of SITE_MANNERS) {
			const labels = m.tables.map(t => t.label);
			expect(new Set(labels).size, `${m.id} labels`).toBe(labels.length);
		}
	});

	it("only branches tables onto branches some row actually opens", () => {
		for (const m of SITE_MANNERS) {
			const opened = new Set(m.tables.flatMap(t => t.rows.map(r => r.branch).filter(Boolean)));
			for (const t of m.tables) {
				if (!t.branch) continue;
				expect(opened.has(t.branch), `${m.id}.${t.key} branch "${t.branch}"`).toBe(true);
			}
		}
	});

	it("covers each region's terrain die exactly once", () => {
		for (const r of REGIONS) {
			const covered = r.terrain.rows.flatMap(row =>
				Array.from({ length: row.max - row.min + 1 }, (_, i) => row.min + i));
			expect(covered, `${r.id} terrain`).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
		}
	});

	it("keeps the Green Lord entry the book prints (p. 214)", () => {
		const greenLord = siteManner("greenLord");
		const structure = greenLord.tables.find(t => t.key === "structure");
		// The example site in Book I's Sites chapter rolls a 6 here.
		expect(rollOnTable(structure.rows, () => 5.5 / 6).text).toBe("Ziggurat/pyramid/dome");
	});
});

describe("visibleTables", () => {
	it("hides both branches until the branching table is answered", () => {
		const keys = visibleTables("greenLord", {}).map(t => t.key);
		expect(keys).toEqual(["theme", "site"]);
	});

	it("shows only the lingering-signs table once that branch is taken", () => {
		const site = siteManner("greenLord").tables.find(t => t.key === "site");
		const signs = site.rows.find(r => r.branch === "signs").text;
		const keys = visibleTables("greenLord", { site: signs }).map(t => t.key);
		expect(keys).toEqual(["theme", "site", "sign"]);
	});

	it("shows the ruin worksheet once that branch is taken", () => {
		const site = siteManner("greenLord").tables.find(t => t.key === "site");
		const ruin = site.rows.find(r => r.branch === "ruin").text;
		const keys = visibleTables("greenLord", { site: ruin }).map(t => t.key);
		expect(keys).toEqual(["theme", "site", "structure", "purpose", "elements", "condition"]);
	});

	it("keeps a Barrow Builder barrow and a reclaimed ruin apart", () => {
		const site = siteManner("barrowBuilder").tables.find(t => t.key === "site");
		const barrow = site.rows.find(r => r.branch === "barrow").text;
		const reclaimed = site.rows.find(r => r.branch === "reclaimed").text;
		expect(visibleTables("barrowBuilder", { site: barrow }).map(t => t.key))
			.toEqual(["theme", "site", "size", "barrowPurpose", "barrowElements", "barrowCondition", "feature"]);
		expect(visibleTables("barrowBuilder", { site: reclaimed }).map(t => t.key))
			.toEqual(["theme", "site", "origin", "signs", "reclaimedCondition"]);
	});

	it("returns nothing for an unknown manner", () => {
		expect(visibleTables("nope", {})).toEqual([]);
	});
});

describe("pickLines", () => {
	it("returns the answered tables in book order, with their table keys", () => {
		const site = siteManner("greenLord").tables.find(t => t.key === "site");
		const ruin = site.rows.find(r => r.branch === "ruin").text;
		const lines = pickLines("greenLord", { theme: "Tombs, mummification, constructed afterlives", site: ruin, purpose: "" });
		expect(lines).toEqual([
			{ key: "theme", label: "Theme", value: "Tombs, mummification, constructed afterlives" },
			{ key: "site", label: "What kind of site?", value: ruin },
		]);
	});

	it("drops a pick left behind by a branch that is no longer taken", () => {
		const site = siteManner("greenLord").tables.find(t => t.key === "site");
		const signs = site.rows.find(r => r.branch === "signs").text;
		// "structure" belongs to the ruin branch, which this pick set doesn't open.
		const lines = pickLines("greenLord", { site: signs, structure: "Underground vault(s)" });
		expect(lines.map(l => l.key)).toEqual(["site"]);
	});
});

describe("rolling", () => {
	it("rolls a manner's table and lands inside it", () => {
		const rolled = rollMannerTable("stoneLord", "purpose", () => 0);
		expect(rolled.text).toBe("Dwelling (home, barracks, dormitory, prison, etc.)");
	});

	it("returns null for a table the manner doesn't have", () => {
		expect(rollMannerTable("cave", "ustrina")).toBe(null);
		expect(rollMannerTable("nope", "structure")).toBe(null);
	});

	it("rolls terrain for a region", () => {
		expect(rollTerrain("greatWood", () => 0).text).toBe("Pond, wetland, or lake");
		expect(rollTerrain("nope")).toBe(null);
	});

	it("weights a ranged row by its span", () => {
		// Great Wood 4-5 is "Clearing, meadow, sparse trees": three single rows precede it,
		// so anything landing in slots 4 or 5 of 12 gives that result.
		expect(rollTerrain("greatWood", () => 3.5 / 12).text).toBe("Clearing, meadow, sparse trees");
		expect(rollTerrain("greatWood", () => 4.5 / 12).text).toBe("Clearing, meadow, sparse trees");
	});

	it("resolves regions and manners by id", () => {
		expect(region("whitefangs").label).toBe("The Whitefang Mountains");
		expect(region("nope")).toBe(null);
		expect(siteManner("faeDomain").label).toBe("Fae domain");
		expect(siteManner("nope")).toBe(null);
	});
});

describe("combining picks", () => {
	// A pick used to print the book's bookkeeping into the site: the roll that produced it, and
	// the "and roll 1d8 again" telling the GM to do something the wizard can do itself. Both are
	// gone from the text; the instruction now rides on the row as `again`, and the wizard follows
	// it into a field of its own.
	it("leaves the roll-again instruction out of every result", () => {
		for (const t of everyTable) {
			for (const row of t.rows) {
				expect(row.text, `${t.manner}.${t.key}`).not.toMatch(/roll\s+(1d\d+[, ]\s*)?(again|twice)/i);
				expect(row.text, `${t.manner}.${t.key}`).not.toMatch(/roll\s+(again|twice)/i);
			}
		}
	});

	it("points every roll-again at rows the table has, and never back at the row itself", () => {
		let found = 0;
		for (const t of everyTable) {
			for (const row of t.rows) {
				const spec = againSpec(row);
				if (!spec) continue;
				found++;
				const pool = againPool(t.rows, row);
				expect(pool.length, `${t.manner}.${t.key} pool`).toBeGreaterThan(0);
				// The sub-die stops short of the instruction row, which is how the book keeps a
				// "roll again" from landing on itself and asking to be rolled again.
				expect(spec.max, `${t.manner}.${t.key} sub-die`).toBeLessThan(row.min);
				expect(pool, `${t.manner}.${t.key} pool`).not.toContain(row);
			}
		}
		expect(found).toBeGreaterThan(0);
	});

	it("keeps the combine separator out of every result, so a combined pick splits back cleanly", () => {
		// " + " is what joins a combined answer into the one string the page stores. A result
		// containing it would be cut in half the next time the site was opened to edit.
		for (const t of everyTable) {
			for (const row of t.rows) {
				expect(row.text, `${t.manner}.${t.key}`).not.toContain(COMBINE_SEP);
			}
		}
	});

	it("keeps every table key clear of the wizard's reserved terrain key", () => {
		// The wizard addresses the terrain control with "#terrain" so its pick handlers can be the
		// manner tables' own. A table key starting with "#" would be answered by the wrong control.
		for (const t of allTables) expect(t.key.startsWith("#"), `${t.manner}.${t.key}`).toBe(false);
	});

	it("carries a combined answer out to one string and back into its rows", () => {
		const values = ["Sized for giants", "Fae servants/rebellion"];
		expect(joinCombined(values)).toBe("Sized for giants + Fae servants/rebellion");
		expect(splitCombined(joinCombined(values))).toEqual(values);
	});

	it("reads a pick the same whether it is one string or a list", () => {
		expect(splitCombined("A ruin")).toEqual(["A ruin"]);
		expect(splitCombined(["A ruin", "", "  "])).toEqual(["A ruin"]);
		// The joined form splits, which is what lets a COMBINED pick still name its row.
		expect(primaryPick(`A ruin${COMBINE_SEP}A tomb`)).toBe("A ruin");
		expect(primaryPick(["A", "B"])).toBe("A");
		expect(primaryPick("")).toBe("");
		expect(splitCombined(undefined)).toEqual([]);
	});

	it("asks for nothing of a row that says nothing", () => {
		expect(againSpec({ text: "A ruin" })).toBe(null);
		expect(againSpec(undefined)).toBe(null);
		expect(againSpec({ again: { max: 10 } })).toEqual({ min: null, max: 10, group: null, count: 1 });
		expect(againSpec({ again: { max: 10 }, againCount: 2 })).toMatchObject({ max: 10, count: 2 });
	});

	it("offers the whole table when no sub-die is named", () => {
		const rows = siteManner("primordial").tables.find(t => t.key === "theme").rows;
		expect(combinableRows(rows, 0)).toEqual(rows);
		// A COPY, never the module's own array. Handing the shipped rows back by reference makes
		// compile-time data writable through an ordinary-looking return value, and a caller that
		// sorted what it was given would reshape the book's table for the rest of the session.
		expect(combinableRows(rows, 0)).not.toBe(rows);
	});

	it("joins a combined pick into the one value the page stores", () => {
		const lines = pickLines("greenLord", { theme: ["Sized for giants", "Fae servants/rebellion"] });
		expect(lines[0]).toEqual({
			key: "theme", label: "Theme", value: "Sized for giants + Fae servants/rebellion",
		});
	});

	it("reads the branch off the row a combined pick was made on", () => {
		const site = siteManner("greenLord").tables.find(t => t.key === "site");
		const ruin = site.rows.find(r => r.branch === "ruin").text;
		expect(visibleTables("greenLord", { site: [ruin] }).map(t => t.key))
			.toEqual(["theme", "site", "structure", "purpose", "elements", "condition"]);
	});
});

describe("how many answers a table takes", () => {
	it("says it on the table rather than only in the prose beneath it", () => {
		// Six tables used to carry "Pick 1 or combine 2" / "Pick or roll 1 to 3" as a note under a
		// control that offered exactly one field. The note told the GM to do something the wizard
		// gave them no way to do; the limit belongs on the table, where the control can read it.
		for (const t of allTables) {
			expect(t.note ?? "", `${t.manner}.${t.key} note`)
				.not.toMatch(/\b(pick|roll)\b[^.]*\b(1|2|3|one|two|three)\b/i);
		}
	});

	it("takes one answer unless the book says otherwise", () => {
		expect(combineMax({})).toBe(1);
		expect(combineMax(undefined)).toBe(1);
		expect(combineMax({ combine: 2 })).toBe(2);
		expect(combineMax({ combine: 3 })).toBe(3);
	});

	it("lets every table the book says to take several of take several", () => {
		const combinable = allTables.filter(t => combineMax(t) > 1).map(t => `${t.manner}.${t.key}`);
		expect(combinable).toEqual([
			"greenLord.theme", "stoneLord.theme", "forgeLord.theme", "rimeLord.theme",
			"tempestLord.theme", "barrowBuilder.theme", "barrowBuilder.signs",
			"barrowBuilder.barrowElements", "haunted.theme", "faeDomain.theme", "faeDomain.element",
			"primordial.theme", "primordial.features", "sacred.theme", "cave.inhabitant",
			"forestFolk.site", "corrupted.theme",
		]);
	});
});

describe("the corrupted-site rows that say to roll again (Book II p. 422)", () => {
	const corrupted = (key) => siteManner("corrupted").tables.find(t => t.key === key).rows;

	it("keeps the book's instruction on the rows the Create a Corrupted Site wizard shows", () => {
		expect(SITE_FEATURES.find(r => r.min === 9).text)
			.toBe("Deep water, the depths obscure, conceals the site (roll 1d8)");
		expect(SITE_CAUSES.find(r => r.min === 11).text)
			.toBe("A seal or binding that kept prior corruption in check, now weakened (roll d10 again for the original corruption)");
	});

	it("performs them in the site wizard, off rows that no longer print them", () => {
		const deep = corrupted("feature").find(r => r.min === 9);
		expect(deep.text).toBe("Deep water, the depths obscure, conceals the site");
		expect(againSpec(deep)).toMatchObject({ max: 8, count: 1 });
		const seal = corrupted("cause").find(r => r.min === 11);
		expect(seal.text).toBe("A seal or binding that kept prior corruption in check, now weakened");
		expect(againSpec(seal)).toMatchObject({ max: 10, count: 1 });
		// Still the Die of Fate prompt the other wizard reads.
		expect(seal.fateful).toBe(true);
	});
});

describe("the regions' terrain tables", () => {
	it("cites the page each Terrain table is printed on", () => {
		expect(Object.fromEntries(REGIONS.map(r => [r.id, r.page]))).toEqual({
			greatWood: "Book II p. 202", steplands: "Book II p. 374", foothills: "Book II p. 147",
			ferriersFen: "Book II p. 118", flats: "Book II p. 128", huffelPeaks: "Book II p. 238",
			whitefangs: "Book II p. 482", northManmarch: "Book II p. 284", southManmarch: "Book II p. 352",
			dreadRiver: "Book II p. 88", blackwaterLake: "Book II p. 50", threeCovenBluffs: "Book II p. 441",
			threeCovenShore: "Book II p. 441", frozenWastes: "Book II p. 174", labyrinth: "Book II p. 244",
			ruinedTower: "Book II p. 336", vorSvetelikSurface: "Book II p. 470", vorSvetelikUndercity: "Book II p. 470",
		});
		expect(siteManner("sacred").page).toBe("Book II p. 362");
		expect(siteManner("forestFolk").page).toBe("Book II p. 153");
	});

	it("covers the die of every region's further table exactly once", () => {
		const further = REGIONS.flatMap(r => (r.tables ?? []).map(t => ({ id: `${r.id}.${t.key}`, t })));
		expect(further.map(f => f.id)).toEqual(["ruinedTower.building", "ruinedTower.purpose"]);
		for (const { id, t } of further) {
			const covered = t.rows.flatMap(row => Array.from({ length: row.max - row.min + 1 }, (_, i) => row.min + i));
			expect(covered, id).toEqual(Array.from({ length: Number(t.die.split("d")[1]) }, (_, i) => i + 1));
		}
	});

	it("transcribes the Ruined Tower's terrain, building and purpose (p. 336)", () => {
		const tower = region("ruinedTower");
		expect(tower.terrain.rows.map(r => [r.min, r.max, r.text])).toEqual([
			[1, 1, "Barren patch of sand/dust/glass"],
			[2, 2, "Mud/standing water/deep snow"],
			[3, 3, "Ditch, gully, or embankment; the outline of buried ruins"],
			[4, 4, "Exposed wall(s), crumbling and covered in moss/lichen"],
			[5, 6, "Stretch of grass, 1d6+2 feet tall"],
			[7, 7, "Shrubs, thicket, tree(s), maybe even dool trees"],
			[8, 8, "Huge stone slab, partly buried; a fallen piece of the tower"],
			[9, 10, "Pile of dirt/stone and a nearby pit; an excavation or burrow"],
			[11, 12, "A building, at least somewhat intact"],
		]);
		const [building, purpose] = tower.tables;
		expect(building.rows.map(r => [r.min, r.max, r.text])).toEqual([
			[1, 8, "From before the tower's fall"],
			[9, 11, "Built after the tower's fall"],
			[12, 12, "A barrow (roll 1d8 for size)"],
		]);
		expect(purpose.rows.map(r => r.text)).toEqual([
			"Home/barracks/living space", "Kitchen/laundry/bath/latrine", "Gathering/meetings/civic life",
			"Storage/cellar/stable/tomb", "Work/production/creation", "Esoterica/experimentation",
		]);
	});

	it("transcribes both halves of Vor Svetelik (p. 470)", () => {
		expect(region("vorSvetelikSurface").terrain.rows.map(r => [r.min, r.max, r.text])).toEqual([
			[1, 1, "Stretch of true death, where nothing has grown or decayed for hundreds of years"],
			[2, 2, "Pool/fountain/stream/standing water: dark and unwholesome"],
			[3, 3, "Hill/cliff/outcrop, perhaps a place where the land buckled and split*"],
			[4, 5, "Stretch of sickly white trees"],
			[6, 7, "Infrastructure/bridge/aqueduct/cistern/sewer*"],
			[8, 9, "A Green Lord ruin*"],
			[10, 11, "Rubble, peeking out from dirt and groundcover"],
			[12, 12, "Crevasse/sinkhole, like a scar in the earth*"],
		]);
		expect(region("vorSvetelikUndercity").terrain.rows.map(r => [r.min, r.max, r.text])).toEqual([
			[1, 1, "Flooded chamber"],
			[2, 2, "Running water"],
			[3, 4, "Old tunnels/shafts, some stretching for miles"],
			[5, 6, "A Green Lord ruin or part of one, buried/sunken/toppled*"],
			[7, 8, "Burrow/warren/tunnels, dug out by... something*"],
			[9, 10, "Stairs/shaft/ladder/ramp, going up and/or further down*"],
			[11, 11, "Crevasse, maybe open to the sky, maybe not*"],
			[12, 12, "Sinkhole, leading down down down"],
		]);
		expect(region("vorSvetelikSurface").note).toBe("*Might connect to the undercity.");
		expect(region("vorSvetelikUndercity").note).toBe("*Might connect to the surface.");
	});

	it("opens the Ruined Tower's building off its terrain, and the purpose off the building", () => {
		const keys = (terrain, picks) => regionTables("ruinedTower", terrain, picks).map(t => t.key);
		expect(keys(["Barren patch of sand/dust/glass"], {})).toEqual([]);
		// Combined in second still opens it: terrain takes two answers.
		expect(keys(["Barren patch of sand/dust/glass", "A building, at least somewhat intact"], {})).toEqual(["building"]);
		expect(keys(["A building, at least somewhat intact"], { building: ["From before the tower's fall"] }))
			.toEqual(["building", "purpose"]);
		expect(keys(["A building, at least somewhat intact"], { building: ["A barrow (roll 1d8 for size)"] }))
			.toEqual(["building"]);
		// The purpose closes with the building that opened it.
		expect(keys(["Mud/standing water/deep snow"], { building: ["From before the tower's fall"] })).toEqual([]);
		expect(regionTables("greatWood", ["Dense thicket"], {})).toEqual([]);
	});

	it("writes the further picks under keys no manner table can take", () => {
		const lines = regionPickLines("ruinedTower", "A building, at least somewhat intact", {
			building: ["Built after the tower's fall"], purpose: "Esoterica/experimentation",
		});
		expect(lines).toEqual([
			{ key: `${REGION_TABLE_PREFIX}building`, label: "Building", value: "Built after the tower's fall" },
			{ key: `${REGION_TABLE_PREFIX}purpose`, label: "Purpose", value: "Esoterica/experimentation" },
		]);
		for (const t of allTables) expect(t.key.startsWith(REGION_TABLE_PREFIX)).toBe(false);
	});
});

describe("which row owns a combined slot", () => {
	const theme = (manner) => siteManner(manner).tables.find(t => t.key === "theme").rows;
	const greenThemes = theme("greenLord");
	const plain = greenThemes.filter(r => !r.again).map(r => r.text);

	it("gives a giant-sized row combined in second its own 1d8, not the whole table", () => {
		const values = [plain[0], "Sized for giants", plain[1]];
		expect(slotOwners(greenThemes, values)).toEqual([-1, -1, 1]);
		expect(slotPool(greenThemes, values, 2)).toHaveLength(8);
		expect(slotPool(greenThemes, values, 1)).toEqual(greenThemes);
	});

	it("gives a free combine beside a giant-sized pick the whole table, not the 1d8", () => {
		const values = ["Sized for giants", plain[0], ""];
		expect(slotOwners(greenThemes, values)).toEqual([-1, 0, -1]);
		expect(slotPool(greenThemes, values, 1)).toHaveLength(8);
		expect(slotPool(greenThemes, values, 2)).toEqual(greenThemes);
	});

	it("lets a roll-again rolled by a roll-again own the slot after it", () => {
		// Green Lord 8, "Corruption by the Things Below", reached on the giant-sized 1d8, owes a 1d7.
		const values = ["Sized for giants", "Corruption by the Things Below", ""];
		expect(slotOwners(greenThemes, values)).toEqual([-1, 0, 1]);
		expect(slotPool(greenThemes, values, 2)).toHaveLength(7);
		// Re-picking the giant-sized row's slot takes the corruption's own roll with it.
		expect(claimedAfter(greenThemes, values, 1)).toBe(1);
		expect(claimedAfter(greenThemes, values, 0)).toBe(2);
	});

	it("spreads a roll-twice row over both of its slots", () => {
		const markers = siteManner("primordial").tables.find(t => t.key === "marker").rows;
		const values = ["Two markers at once", "A veil, hiding it from the world", "Desolation/radiation"];
		expect(slotOwners(markers, values)).toEqual([-1, 0, 0]);
		expect(slotPool(markers, values, 2)).toHaveLength(markers.filter(r => r.max <= 10).length);
	});
});

describe("answers saved under older wording", () => {
	const rowsOf = (manner, key) => siteManner(manner).tables.find(t => t.key === key).rows;

	it("takes the old roll-again instruction off the end, in each of the book's phrasings", () => {
		expect(stripRollInstruction("Sized for giants, and roll 1d8 again")).toBe("Sized for giants");
		expect(stripRollInstruction("Island/sandbar and roll 1d10 again")).toBe("Island/sandbar");
		expect(stripRollInstruction("Sky-island, crashed/grounded (and roll 1d6 again)")).toBe("Sky-island, crashed/grounded");
		expect(stripRollInstruction("A ruin of multiple groups (roll 1d10 twice)")).toBe("A ruin of multiple groups");
		expect(stripRollInstruction("Deep water, the depths obscure, conceals the site (roll 1d8)"))
			.toBe("Deep water, the depths obscure, conceals the site");
		// A parenthesis that is not a roll stays.
		expect(stripRollInstruction("Dwelling (home, barracks, dormitory, etc.)")).toBe("Dwelling (home, barracks, dormitory, etc.)");
		// A row whose own text ends in a roll is found by that text before anything is stripped.
		const feature = rowsOf("barrowBuilder", "feature");
		expect(findRow(feature, "Treasure (roll 1d6 to inform how much remains)").min).toBe(9);
	});

	it("finds the row each one was made on", () => {
		expect(currentPickText(rowsOf("greenLord", "theme"), "Sized for giants, and roll 1d8 again")).toBe("Sized for giants");
		expect(currentPickText(rowsOf("greenLord", "theme"), "Corruption by the Things Below, and roll again"))
			.toBe("Corruption by the Things Below");
		expect(currentPickText(rowsOf("tempestLord", "structure"), "Sky-island, free-floating across the landscape (and roll 1d6 again)"))
			.toBe("Sky-island, free-floating across the landscape");
		expect(currentPickText(rowsOf("barrowBuilder", "origin"), "A ruin of multiple groups (roll 1d10 twice)"))
			.toBe("A ruin of multiple groups");
		expect(currentPickText(rowsOf("barrowBuilder", "barrowPurpose"), "Roll 1d10, twice")).toBe("Two purposes at once");
		expect(currentPickText(rowsOf("barrowBuilder", "feature"), "Roll again, twice")).toBe("Two features at once");
		expect(currentPickText(rowsOf("primordial", "marker"), "Roll 1d10 twice and combine")).toBe("Two markers at once");
		expect(currentPickText(rowsOf("sacred", "marker"), "Roll twice with a 1d10, combine")).toBe("Two markers at once");
		expect(currentPickText(rowsOf("faeDomain", "entrance"), "Only active at certain times (in moonlight, at sunset, in winter, etc.) and roll again"))
			.toBe("Only active at certain times (in moonlight, at sunset, in winter, etc.)");
		expect(currentPickText(rowsOf("faeDomain", "anchor"), "Roll again, but it's failing, fickle, unstable, possibly abandoned"))
			.toBe("Failing, fickle, unstable, possibly abandoned");
		expect(currentPickText(region("threeCovenShore").terrain.rows, "Island/sandbar and roll 1d10 again")).toBe("Island/sandbar");
		expect(currentPickText(region("labyrinth").terrain.rows, "An obstruction, and roll 1d10 again")).toBe("An obstruction");
	});

	it("leaves an answer no row carries exactly as written", () => {
		expect(findRow(rowsOf("greenLord", "theme"), "A theme of my own")).toBeUndefined();
		expect(currentPickText(rowsOf("greenLord", "theme"), "A theme of my own")).toBe("A theme of my own");
	});

	it("keeps a branch open when the row that opened it is worded differently now", () => {
		// The site table's answer matches no row, but the lingering-signs table holds an answer:
		// that branch stays, and saving keeps its pick rather than hiding and dropping it.
		const picks = { site: "Lingering signs of their presence", sign: "Strange plants" };
		expect(visibleTables("greenLord", picks).map(t => t.key)).toEqual(["theme", "site", "sign"]);
		expect(pickLines("greenLord", picks).map(l => l.key)).toEqual(["site", "sign"]);
	});

	it("reads the branch off a legacy answer to the branching table", () => {
		const picks = { site: "A reclaimed Maker-ruin", origin: "A ruin of multiple groups (roll 1d10 twice)" };
		expect(visibleTables("barrowBuilder", picks).map(t => t.key)).toContain("origin");
	});
});

describe("tables the book makes conditional", () => {
	it("flags exactly the haunted feature, the cause of death and the cave's beast", () => {
		expect(allTables.filter(t => t.conditional).map(t => `${t.manner}.${t.key}`))
			.toEqual(["haunted.feature", "haunted.causeOfDeath", "cave.beast"]);
	});
});
