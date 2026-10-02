import { describe, it, expect, vi } from "vitest";
import {
	CUSTOM_TAG_PREFIX, TAG_NAME_MAX, cleanTagName, customTagStyle, filterKey, findTagByName, isCustomTagId,
	isKindTag, liveTag, normalizeCustomTag, readCustomTags,
} from "../../module/timeline/timeline-tags.js";
import { createCustomTag } from "../../module/timeline/timeline-tag-store.js";
import { normalizeEntry } from "../../module/timeline/timeline-core.js";
import { buildAggregateVM, buildTrackVM, kindMenu } from "../../module/timeline/timeline-view.js";
import { TIMELINE_COLOUR_MODES } from "../../module/timeline/timeline-colours.js";
import { readRepo } from "../fakes/css.js";

// A TYPED ROW'S ONE TAG: a kind it borrows, or a tag the table made. What is pinned here is that a
// tag survives the round trip through the store, reads as what it names on the card and in the
// Filter menu, never turns a typed row into a milestone, and that a tag the world has lost reads
// as no tag rather than as a chip with no name.

const HUNTERS = { id: "tag-hunt", name: "The hunters", colour: "#3f5f8a" };

function entry(over = {}) {
	return { id: "e1", year: 1, season: "spring", order: 0, title: "A thing", source: "hand", ...over };
}

function allCards(vm) {
	return vm.periods.flatMap(p => [...(p.entries ?? []), ...(p.lanes ?? []).flatMap(l => l.entries)]);
}

describe("the tag on a stored entry", () => {
	it("is carried by normalizeEntry, or every write would delete it", () => {
		expect(normalizeEntry(entry({ tag: "wound" })).tag).toBe("wound");
		expect(normalizeEntry(entry()).tag).toBe("");
	});

	it("loses any dot, as an id does", () => {
		expect(normalizeEntry(entry({ tag: "tag-a.b" })).tag).toBe("tag-ab");
	});

	it("is declared in the page schema, or Foundry strips it on write", () => {
		expect(readRepo("module/journal/TimelinePageModel.js")).toMatch(/\btag: new fields\.StringField/);
	});
});

describe("which tags are which", () => {
	it("knows the kinds a typed row may borrow, and not `hand`", () => {
		expect(isKindTag("wound")).toBe(true);
		expect(isKindTag("kills")).toBe(true);
		expect(isKindTag("hand")).toBe(false);
		expect(isKindTag("tag-x")).toBe(false);
	});

	it("knows a custom tag by its prefix, and refuses the bare prefix", () => {
		expect(isCustomTagId(`${CUSTOM_TAG_PREFIX}abc`)).toBe(true);
		expect(isCustomTagId(CUSTOM_TAG_PREFIX)).toBe(false);
		expect(isCustomTagId("wound")).toBe(false);
	});
});

describe("a custom tag as stored", () => {
	it("is cleaned: one line, capped", () => {
		expect(cleanTagName("  The \n  hunters ")).toBe("The hunters");
		expect(cleanTagName("x".repeat(80))).toHaveLength(TAG_NAME_MAX);
	});

	it("is refused without a name, a colour or a proper id", () => {
		expect(normalizeCustomTag({ name: "", colour: "#123456" }, "tag-a")).toBeNull();
		expect(normalizeCustomTag({ name: "A", colour: "red; background: url(x)" }, "tag-a")).toBeNull();
		expect(normalizeCustomTag({ name: "A", colour: "#123456" }, "wound")).toBeNull();
	});

	it("reads the flag into a list by name, dropping what is not a tag", () => {
		const tags = readCustomTags({
			"tag-b": { name: "beasts", colour: "#aa0000" },
			"tag-a": { name: "Allies", colour: "#00aa00" },
			"tag-x": { name: "", colour: "#000000" },
		});
		expect(tags.map(t => t.name)).toEqual(["Allies", "beasts"]);
		expect(tags[0]).toEqual({ id: "tag-a", name: "Allies", colour: "#00aa00" });
	});

	it("is found by name whatever the case", () => {
		expect(findTagByName([HUNTERS], "the HUNTERS ")).toBe(HUNTERS);
		expect(findTagByName([HUNTERS], "The hunted")).toBeNull();
	});

	it("paints one colour per skin, each a hex", () => {
		const style = customTagStyle("#3f5f8a");
		for (const prop of ["--tl-tag-light", "--tl-tag-dark", "--tl-tag-light-high", "--tl-tag-dark-high"]) {
			expect(style).toMatch(new RegExp(`${prop}: #[0-9a-f]{6};`));
		}
		expect(TIMELINE_COLOUR_MODES).toHaveLength(4);
		expect(customTagStyle("not a colour")).toBe("");
	});

	it("is lifted on the dark skins when it was chosen too dark to read there", () => {
		const style = customTagStyle("#1a1a40");
		const dark = style.match(/--tl-tag-dark: (#[0-9a-f]{6})/)[1];
		expect(dark).not.toBe("#1a1a40");
	});
});

describe("the tag a row is wearing now", () => {
	it("is a borrowed kind, or a custom tag the world still has", () => {
		expect(liveTag(entry({ tag: "arcana" }), [])).toBe("arcana");
		expect(liveTag(entry({ tag: "tag-hunt" }), [HUNTERS])).toBe("tag-hunt");
	});

	it("is none for a custom tag the world has lost", () => {
		expect(liveTag(entry({ tag: "tag-gone" }), [HUNTERS])).toBe("");
	});

	it("is never read off a milestone row, whose source is its kind", () => {
		expect(liveTag(entry({ source: "kills", tag: "wound" }), [])).toBe("");
	});

	it("files a typed row in the Filter menu under what it wears", () => {
		expect(filterKey(entry(), [])).toBe("hand");
		expect(filterKey(entry({ tag: "wound" }), [])).toBe("wound");
		expect(filterKey(entry({ tag: "tag-hunt" }), [HUNTERS])).toBe("tag-hunt");
		expect(filterKey(entry({ tag: "tag-gone" }), [HUNTERS])).toBe("hand");
		expect(filterKey(entry({ source: "site", tag: "wound" }), [])).toBe("site");
	});
});

describe("a tagged card", () => {
	it("wears a borrowed kind's chip, and stays a typed row", () => {
		const [card] = allCards(buildTrackVM({ entries: [entry({ tag: "wound" })] }));
		expect(card).toMatchObject({ isAuto: false, isTagged: true, wearsChip: true, kind: "wound", kindStyle: "" });
		expect(card.kindLabel).toBeTruthy();
	});

	it("wears a custom tag's name and colour", () => {
		const [card] = allCards(buildTrackVM({ entries: [entry({ tag: "tag-hunt" })] }, { tags: [HUNTERS] }));
		expect(card).toMatchObject({ isTagged: true, kind: "custom", kindLabel: "The hunters", kindIcon: "fa-tag" });
		expect(card.kindStyle).toContain("--tl-tag-light:");
	});

	it("reads as a plain typed card when its tag is gone", () => {
		const [card] = allCards(buildTrackVM({ entries: [entry({ tag: "tag-gone" })] }, { tags: [HUNTERS] }));
		expect(card).toMatchObject({ isTagged: false, wearsChip: false, kind: "hand" });
	});

	it("leaves an untagged typed card as it was", () => {
		const [card] = allCards(buildTrackVM({ entries: [entry()] }));
		expect(card).toMatchObject({ isAuto: false, isTagged: false, wearsChip: false });
	});

	it("still marks a milestone as the system's, whatever tag it holds", () => {
		const [card] = allCards(buildTrackVM({ entries: [entry({ source: "site", tag: "tag-hunt" })] }, { tags: [HUNTERS] }));
		expect(card).toMatchObject({ isAuto: true, isTagged: false, wearsChip: true, kind: "site" });
	});
});

describe("the reader's filter and tags", () => {
	const entries = [
		entry({ id: "plain" }),
		entry({ id: "hurt", tag: "wound" }),
		entry({ id: "hunt", tag: "tag-hunt" }),
	];
	const ids = vm => allCards(vm).map(c => c.id).sort();

	it("hides a row tagged with a kind along with that kind", () => {
		expect(ids(buildTrackVM({ entries }, { hidden: ["wound"], tags: [HUNTERS] }))).toEqual(["hunt", "plain"]);
	});

	it("hides a row wearing a custom tag by that tag's own line", () => {
		expect(ids(buildTrackVM({ entries }, { hidden: ["tag-hunt"], tags: [HUNTERS] }))).toEqual(["hurt", "plain"]);
	});

	it("keeps tagged rows when only the untagged typed rows are hidden", () => {
		expect(ids(buildTrackVM({ entries }, { hidden: ["hand"], tags: [HUNTERS] }))).toEqual(["hunt", "hurt"]);
	});

	it("does the same across the aggregate", () => {
		const vm = buildAggregateVM([{ trackId: "a", name: "A", entries }], { hidden: ["tag-hunt"], tags: [HUNTERS] });
		expect(ids(vm)).toEqual(["hurt", "plain"]);
		const [hurt] = allCards(vm).filter(c => c.id === "hurt");
		expect(hurt.isTagged).toBe(true);
	});

	it("lists the world's custom tags after the kinds in the Filter menu", () => {
		const menu = kindMenu(["tag-hunt"], [HUNTERS]);
		const last = menu.at(-1);
		expect(last).toMatchObject({ source: "tag-hunt", kind: "custom", label: "The hunters", shown: false });
		expect(last.style).toContain("--tl-tag-dark:");
		expect(menu[0]).toMatchObject({ source: "hand", kind: "hand", shown: true });
	});
});

describe("making a custom tag", () => {
	function journal(flag = {}) {
		const doc = {
			isOwner: true,
			getFlag: () => flag,
			update: vi.fn(async () => doc),
		};
		return doc;
	}

	it("writes one key under the flag, by a dotted path, so two seats' tags both land", async () => {
		const doc = journal();
		const made = await createCustomTag({ name: " The hunters ", colour: "#3F5F8A" }, { journal: doc, makeId: () => "abc" });
		expect(made).toEqual({ tag: { id: "tag-abc", name: "The hunters", colour: "#3f5f8a" }, existed: false });
		expect(doc.update).toHaveBeenCalledWith({
			"flags.stonetop-pwd.timelineTags.tag-abc": { id: "tag-abc", name: "The hunters", colour: "#3f5f8a" },
		});
	});

	it("hands back the tag already called that rather than a twin", async () => {
		const doc = journal({ "tag-hunt": HUNTERS });
		const made = await createCustomTag({ name: "the hunters", colour: "#ff0000" }, { journal: doc, makeId: () => "abc" });
		expect(made).toEqual({ tag: HUNTERS, existed: true });
		expect(doc.update).not.toHaveBeenCalled();
	});

	it("refuses with a reason, and writes nothing", async () => {
		const doc = journal();
		expect((await createCustomTag({ name: " ", colour: "#000000" }, { journal: doc })).reason).toBe("name");
		expect((await createCustomTag({ name: "A", colour: "nope" }, { journal: doc })).reason).toBe("colour");
		expect((await createCustomTag({ name: "A", colour: "#000000" }, { journal: { ...doc, isOwner: false } })).reason).toBe("journal");
		expect((await createCustomTag({ name: "A", colour: "#000000" }, { journal: null })).reason).toBe("journal");
		expect(doc.update).not.toHaveBeenCalled();
	});
});

describe("the dialog's tag chips", () => {
	it("draws a tag made after render from the partial the template draws the rest with", async () => {
		const html = await renderTemplate("systems/stonetop-pwd/templates/dialogs/partials/timeline-entry-tag.hbs",
			{ id: "tag-hunt", kind: "custom", icon: "fa-tag", label: "<The> hunters", style: "--tl-tag-light: #000000;" });
		expect(html).toContain('class="stonetop-timeline-entry-tag stonetop-timeline-kind--custom"');
		expect(html).toContain('data-tag="tag-hunt"');
		expect(html).toContain('aria-pressed="false"');
		expect(html).toContain("&lt;The&gt; hunters");

		expect(readRepo("templates/dialogs/timeline-entry.hbs")).toContain('{{> "stonetop.timeline-entry-tag"}}');
		expect(readRepo("module/dialogs/TimelineEntryDialog.js")).toContain("partials/timeline-entry-tag.hbs");
	});

	it("is offered only for a typed row, and sends the tag back with it", async () => {
		const { TimelineEntryDialog } = await import("../../module/dialogs/TimelineEntryDialog.js");
		const dialog = Object.create(TimelineEntryDialog.prototype);
		Object.assign(dialog, { _season: "spring", _year: 1, _placeUuid: "", _isKills: false, _showTags: true, _tag: "wound" });
		dialog._readYear = () => 1;
		dialog._resolveWith = value => value;
		const form = { querySelector: sel => (sel === ".stonetop-timeline-entry-title" ? { value: "Bitten" } : { value: "" }) };
		expect(dialog._save(form).tag).toBe("wound");

		dialog._showTags = false;
		expect(dialog._save(form)).not.toHaveProperty("tag");
	});
});
