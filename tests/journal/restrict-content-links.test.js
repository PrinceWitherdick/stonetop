import { describe, expect, it, beforeEach } from "vitest";
import { restrictContentLinks } from "../../module/journal/restrict-content-links.js";

// The module is DOM/Foundry wiring, but the decision worth guarding — which
// links a player may keep vs. which get flattened to plain text — is simple.
// The test env is node (no DOM), so fake just the surface the function touches,
// mirroring tests/utils/journal-checkboxes.test.js.

class FakeText {
	constructor(text) { this.text = text; this.nodeType = 3; }
}

// A bare wrapper that holds children, modelling the `<strong>` most cross-links
// are authored inside — enough to prove replaceWith swaps the anchor in place
// and leaves the wrapper (the source of the bold) untouched.
class FakeWrapper {
	constructor() { this.children = []; }
}

// A de-linked-but-summarized cross-link becomes one of these: a plain element
// (span) carrying the surviving data-tooltip but no click-through.
class FakeElement {
	constructor(tag) { this.tagName = tag; this.dataset = {}; this.className = ""; this.textContent = ""; }
}

class FakeLink {
	constructor(uuid, label, parent = null, tooltip = undefined, stonetopSummary = undefined) {
		this.dataset = { uuid };
		if (tooltip !== undefined) this.dataset.tooltip = tooltip;
		// What applyLocationTooltips RECORDS, as opposed to the hover it stamps. The two
		// diverge when the reader has cross-link hovers switched off.
		if (stonetopSummary !== undefined) this.dataset.stonetopSummary = stonetopSummary;
		this.textContent = label;
		this.replacedWith = undefined; // set by replaceWith if neutered
		this.parent = parent;
		if (parent) parent.children.push(this);
	}
	replaceWith(node) {
		this.replacedWith = node;
		const i = this.parent?.children.indexOf(this) ?? -1;
		if (i >= 0) this.parent.children.splice(i, 1, node);
	}
}

function rootWith(links) {
	return { querySelectorAll: () => links };
}

// World-uuid documents keyed by uuid, each declaring whether this user observes
// it. Compendium uuids resolve through game.packs instead (see currentUserCanView).
let worldDocs;
let packs;

beforeEach(() => {
	worldDocs = new Map();
	packs = new Map();
	global.document = {
		createTextNode: (t) => new FakeText(t),
		createElement: (tag) => new FakeElement(tag),
	};
	global.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
	global.fromUuidSync = (uuid) => worldDocs.get(uuid) ?? null;
	global.game = {
		user: { isGM: false },
		packs: { get: (id) => packs.get(id) ?? undefined },
	};
});

// A world JournalEntry the player can't observe. `pageType` models the entry's
// page (a Location/Lore entry is "location"; the GM-only bestiary codex is
// "bestiary") so isSpoilerTarget can tell whether the summary is safe to keep.
function worldLink(uuid, label, canObserve, { parent = null, tooltip, stonetopSummary, pageType = "location" } = {}) {
	worldDocs.set(uuid, { testUserPermission: () => canObserve, pages: [{ type: pageType }] });
	return new FakeLink(uuid, label, parent, tooltip, stonetopSummary);
}

describe("restrictContentLinks", () => {
	it("flattens a link to a world doc the player can't observe", () => {
		const link = worldLink("JournalEntry.beast1", " Wolf", false);
		restrictContentLinks(rootWith([link]));
		expect(link.replacedWith).toBeInstanceOf(FakeText);
		expect(link.replacedWith.text).toBe("Wolf"); // trimmed label, no icon whitespace
	});

	it("preserves the wrapping <strong> so the de-linked word stays bold", () => {
		const strong = new FakeWrapper();
		const link = worldLink("JournalEntry.beast1", "Wolf", false, { parent: strong });
		restrictContentLinks(rootWith([link]));
		// The anchor is gone but the <strong> remains, now holding plain text —
		// the player sees the same bold word the GM does, just not clickable.
		expect(strong.children).toHaveLength(1);
		expect(strong.children[0]).toBeInstanceOf(FakeText);
		expect(strong.children[0].text).toBe("Wolf");
	});

	it("keeps the hover summary on a Location/Lore link the player can't open", () => {
		// A player reading the Setting Overview can't open the full Marshedge entry,
		// but its one-line summary is meant to orient them — so the de-linked word
		// becomes a non-clickable <span> that still shows the description on hover.
		const link = worldLink("JournalEntry.place1", "Marshedge", false, {
			tooltip: "A fortified town at the edge of the marsh.", pageType: "location",
		});
		restrictContentLinks(rootWith([link]));
		const span = link.replacedWith;
		expect(span).toBeInstanceOf(FakeElement);
		expect(span.tagName).toBe("span");
		expect(span.textContent).toBe("Marshedge");
		expect(span.dataset.tooltip).toBe("A fortified town at the edge of the marsh.");
		expect(span.className).toBe("content-summary");
	});

	it("drops the tooltip on a bestiary link, flattening it to plain text", () => {
		// The bestiary codex is GM-only: a player must get no hint of the hidden
		// entry, not even a hover summary. So a `bestiary`-page target flattens to
		// bare text even though it carried a summary.
		const link = worldLink("JournalEntry.beast1", "the aurochs", false, {
			tooltip: "A great horned beast of the open grass.", pageType: "bestiary",
		});
		restrictContentLinks(rootWith([link]));
		expect(link.replacedWith).toBeInstanceOf(FakeText);
		expect(link.replacedWith.text).toBe("the aurochs");
	});

	// ── Hover descriptions off ────────────────────────────────────────────────
	// applyLocationTooltips records the summary either way but only stamps the hover
	// when the reader wants cross-link hovers. What a player may READ must not follow
	// their hover preference, so classification reads the recorded summary.

	it("keeps the summarized span when hovers are off (summary recorded, no tooltip)", () => {
		const link = worldLink("JournalEntry.place1", "Marshedge", false, {
			stonetopSummary: "A fortified town at the edge of the marsh.", pageType: "location",
		});
		restrictContentLinks(rootWith([link]));
		const span = link.replacedWith;
		// Still a non-clickable span, not a flatten — the reader loses the hover, not the word.
		expect(span).toBeInstanceOf(FakeElement);
		expect(span.tagName).toBe("span");
		expect(span.textContent).toBe("Marshedge");
		expect(span.className).toBe("content-summary");
		// …and carries no tooltip, because there was none to carry.
		expect(span.dataset.tooltip).toBeUndefined();
	});

	it("still hides a bestiary link when hovers are off", () => {
		// The spoiler rule is independent of the hover setting: a recorded summary on a
		// `bestiary` target must not resurrect the entry as a hoverable span.
		const link = worldLink("JournalEntry.beast1", "the aurochs", false, {
			stonetopSummary: "A great horned beast of the open grass.", pageType: "bestiary",
		});
		restrictContentLinks(rootWith([link]));
		expect(link.replacedWith).toBeInstanceOf(FakeText);
		expect(link.replacedWith.text).toBe("the aurochs");
	});

	it("flattens a summary-less link to plain text (no span)", () => {
		// A link the player can't view with no authored summary has nothing to show
		// on hover, so it stays a plain text flatten.
		const link = worldLink("JournalEntry.place2", "Gordin's Delve", false, { pageType: "location" });
		restrictContentLinks(rootWith([link]));
		expect(link.replacedWith).toBeInstanceOf(FakeText);
		expect(link.replacedWith.text).toBe("Gordin's Delve");
	});

	it("keeps a clickable Location link the player CAN open untouched (summary and all)", () => {
		const link = worldLink("JournalEntry.place1", "Marshedge", true, {
			tooltip: "A fortified town at the edge of the marsh.", pageType: "location",
		});
		restrictContentLinks(rootWith([link]));
		expect(link.replacedWith).toBeUndefined();
	});

	it("keeps a link to a world doc the player can observe", () => {
		const link = worldLink("JournalEntry.place1", "Marshedge", true);
		restrictContentLinks(rootWith([link]));
		expect(link.replacedWith).toBeUndefined();
	});

	it("never touches links for a GM", () => {
		global.game.user.isGM = true;
		const link = worldLink("JournalEntry.beast1", "Wolf", false);
		restrictContentLinks(rootWith([link]));
		expect(link.replacedWith).toBeUndefined();
	});

	it("flattens an unresolvable (broken/secret) world link", () => {
		const link = new FakeLink("JournalEntry.missing", "Mystery"); // not in worldDocs
		restrictContentLinks(rootWith([link]));
		expect(link.replacedWith?.text).toBe("Mystery");
	});

	it("keeps a compendium link when the user can see the pack", () => {
		packs.set("stonetop_pwd.stonetop-items", { visible: true });
		const link = new FakeLink("Compendium.stonetop_pwd.stonetop-items.Item.move1", "A Move");
		restrictContentLinks(rootWith([link]));
		expect(link.replacedWith).toBeUndefined();
	});

	it("flattens a compendium link when the pack is hidden from the user", () => {
		packs.set("stonetop_pwd.stonetop-bestiary", { visible: false });
		const link = new FakeLink("Compendium.stonetop_pwd.stonetop-bestiary.Actor.mon1", "Cynddaraig");
		restrictContentLinks(rootWith([link]));
		expect(link.replacedWith?.text).toBe("Cynddaraig");
	});

	it("flattens an arcana link — the arcana pack is GM-only", () => {
		// Arcana ship in their own hidden compendium so players can't browse them.
		// A lore/location entry that cross-links an arcanum must not tease it.
		packs.set("stonetop_pwd.stonetop-arcana", { visible: false });
		const link = new FakeLink("Compendium.stonetop_pwd.stonetop-arcana.Item.mindgem", "Mindgem");
		restrictContentLinks(rootWith([link]));
		expect(link.replacedWith?.text).toBe("Mindgem");
	});

	it("flattens a compendium link whose pack isn't registered", () => {
		const link = new FakeLink("Compendium.stonetop_pwd.gone.JournalEntry.x", "Lost");
		restrictContentLinks(rootWith([link]));
		expect(link.replacedWith?.text).toBe("Lost");
	});

	it("falls back to the uuid when a neutered link has no label", () => {
		const link = worldLink("JournalEntry.beast1", "   ", false);
		restrictContentLinks(rootWith([link]));
		expect(link.replacedWith.text).toBe("JournalEntry.beast1");
	});
});
