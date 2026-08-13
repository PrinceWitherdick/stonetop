import { StepperDialog } from "../dialogs/StepperDialog.js";
import {
	SITE_MANNERS, REGIONS, siteManner, region, visibleTables, pickLines,
	rollOnTable, rollMannerTable, rollTerrain,
	SITE_STORY_QUESTIONS, SITE_CONNECTIONS, SITE_QUESTION_PROMPTS,
	SITE_DANGER_KINDS, SITE_DISCOVERY_KINDS, AREA_DETAIL_PROMPTS,
	SITE_LAYOUT_TIPS, SITE_REVIEW_CHECKS,
} from "../data/site-tables.js";
import { shapeSiteSystem, setSiteName } from "./site-store.js";

// ── CreateSiteDialog ─────────────────────────────────────────────────────────
// A walkthrough for "Creating sites" (Book I, Sites, pp. 355-370). The book's procedure
// is four phases with sub-steps, and it is emphatic that you do only as much of it as you
// need for the next session, improvising the rest. So this is a nine-step stepper that
// follows the book's order, with a jump-to-step rail: fill in the foundation, then dip
// into whichever later phases are worth your time and leave the others empty.
//
//   1-2  Lay the foundation        (what you know, then the Book II tables + terrain)
//   3-4  Build up its story        (connections + questions, then a timeline)
//   5-7  Sketch out its contents   (denizens/dangers/discoveries, environment, areas)
//   8    Write it up               (plans, and the lists and tables you'll roll on)
//   9    Review
//
// Mirrors CreateHazardDialog: created without a page it resolves the collected SEED via
// promise() (the steading sheet then calls createSite); created with `{ page }` it opens
// pre-filled, the final button becomes "Save site", and it applies the update to the page
// itself. The wizard IS the site editor, so there is no separate editor dialog.

const _STEPS = [
	{
		key:   "foundation",
		title: "Lay the foundation",
		icon:  "fa-seedling",
		body:  `<p>A site is an interesting place the PCs can explore. It should <strong>tell a story</strong>, be <strong>exciting to explore</strong>, and present <strong>meaningful decisions</strong>.</p>
				<p>Start with what you've already got: what you've told the players, what they've told you, and what you've decided in your heart of hearts. If a PC might know this place, ask them what it's like.</p>`,
	},
	{
		key:   "manner",
		title: "Exploit the setting guide",
		icon:  "fa-book-atlas",
		body:  `<p>Decide what <strong>manner of site</strong> this is, then use that Book II entry's tables to develop the concept. Treat them as creative prompts: pick what catches your eye, or roll and make sense of what you get.</p>
				<p>Unlikely combinations make the most memorable sites. But you're not beholden to the dice, so re-roll or pick instead if a result really doesn't feel right.</p>`,
	},
	{
		key:   "story",
		title: "Build up its story",
		icon:  "fa-link",
		body:  `<p><em>Optional.</em> Look for <strong>connections</strong> between what you've got and the rest of the world, then let those connections prompt <strong>questions</strong> and answer them.</p>
				<p>If no answer occurs to you, roll on a Book II table, or set the question aside and come back to it. Let your answers spawn new questions.</p>`,
	},
	{
		key:   "timeline",
		title: "Create a timeline",
		icon:  "fa-hourglass-half",
		body:  `<p><em>Optional.</em> Put the key events in relative order: this happened, then this, then this. Vague times are usually fine (centuries ago, last winter, last week).</p>
				<p>Read it back when you're done and look for holes or contradictions.</p>`,
	},
	{
		key:   "contents",
		title: "Populate it",
		icon:  "fa-users",
		body:  `<p><em>Optional.</em> Who or what lives here, visits, or is just passing through? Note the relationships between them: factions and rivalries, debts and feuds, love and hate and jealousy.</p>
				<p>Then list the <strong>dangers</strong> and <strong>discoveries</strong> the site's story implies. Just name them for now; placing and writing them up comes later.</p>`,
	},
	{
		key:   "environment",
		title: "Describe the environment",
		icon:  "fa-tree",
		body:  `<p><em>Optional.</em> Build a vocabulary of imagery, impressions and details you can pull from while framing scenes. Reflect the site's story: what traces remain of its original purpose, and how have its denizens shaped it?</p>`,
	},
	{
		key:   "areas",
		title: "Areas & rooms",
		icon:  "fa-diagram-project",
		body:  `<p><em>Optional.</em> Write out the distinct rooms or places the site's story and common sense suggest. If it was built for a purpose, start with the rooms that purpose needed.</p>
				<p>Note each area's <strong>exits</strong> to fix the layout without drawing a map.</p>`,
	},
	{
		key:   "plans",
		title: "Make plans, lists & tables",
		icon:  "fa-list-check",
		body:  `<p><em>Optional.</em> How will the denizens react to the PCs? What happens when they enter an area, and how long after X does Y happen? Note it as if/then tactics, a timetable, or GM moves you mean to make.</p>
				<p>Some content exists in a quantum state (sentries walk a perimeter, the bears might be out foraging). Put that in a <strong>table</strong> and roll on it from the card when the PCs enter a new area.</p>`,
	},
	{
		key:     "review",
		title:   "Review",
		icon:    "fa-clipboard-check",
		isFinal: true,
		body:    `<p>Read it over. Is anything missing? Add it. Is anything no longer needed? Cut it. It'll never be perfect, and that's fine: if anyone even notices, you can fix it during play.</p>
				<p>Its card lives on the steading sheet's Sites tab. Drag it onto a scene to pin it to the map, and edit it any time.</p>`,
	},
];

// The free-text scalar fields the generic [data-field] change handler may persist onto
// `_sel`; list-row fields are captured by their own classed handlers.
const _TEXT_FIELDS = new Set(["name", "why", "description"]);

// The plain string-list fields, keyed by the data-list value their rows carry.
const _LINE_LISTS = ["connections", "dangers", "discoveries", "outside", "inside", "plans"];

// The paired-row lists: which two keys each row holds, in the order they render.
const _PAIR_LISTS = {
	questions: ["prompt", "answer"],
	timeline:  ["when", "text"],
	denizens:  ["name", "notes"],
};

/** A blank row for a list, so add-a-row and seeding agree on the shape. */
function blankRow(list) {
	if (_PAIR_LISTS[list]) return Object.fromEntries(_PAIR_LISTS[list].map(k => [k, ""]));
	if (list === "areas") return { title: "", description: "", contents: "", exits: "" };
	return "";
}

export class CreateSiteDialog extends StepperDialog {
	/** @param {{ page?: JournalEntryPage|null }} [config] pass a site page to edit it in place. */
	constructor({ page = null } = {}, options = {}) {
		// Editing gets a per-page window id so two sites can be open side by side; creation
		// keeps the fixed id (one "Create a Site" at a time).
		super(page ? foundry.utils.mergeObject({ id: `stonetop-create-site-${page.id}` }, options) : options);
		this._page = page;
		this._sel = page ? this._seedFromPage(page) : {
			name: "", why: "", description: "",
			manner: "", picks: {}, regionId: "", terrain: "",
			connections: [], questions: [], timeline: [],
			denizens: [], dangers: [], discoveries: [],
			outside: [], inside: [],
			areas: [], plans: [], randomTables: [],
		};
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-create-site",
			template:  "systems/stonetop-pwd/templates/dialogs/create-site.hbs",
			// Wide enough that the 168px jump-to-step rail sits beside the content column
			// rather than eating into it (the same reason Create a Follower is 728).
			width:     760,
			height:    "auto",
			resizable: true,
			classes:   ["stonetop", "stonetop-spring-dialog", "stonetop-create-site-dialog"],
		});
	}

	get title() { return this._page ? `Site: ${this._page.name}` : "Create a Site"; }

	get _steps() { return _STEPS; }
	get _autoHeight() { return true; }

	// Working state seeded from an existing page (edit mode). The stored picks are ordered
	// label/value pairs; the wizard keys them by table, so they're matched back by label
	// against the manner's own tables (a pick whose table has since gone is dropped).
	_seedFromPage(page) {
		const sys = page.system ?? {};
		const manner = siteManner(sys.manner ?? "");
		const picks = {};
		for (const p of sys.picks ?? []) {
			// Match on the table's id; fall back to its label for a page written before picks
			// carried a key. A pick whose table has since gone is dropped.
			const table = manner?.tables.find(t => t.key === p?.key) ?? manner?.tables.find(t => t.label === p?.label);
			if (table) picks[table.key] = String(p?.value ?? "");
		}
		const pairs = (arr, keys) => (Array.isArray(arr) ? arr : [])
			.map(row => Object.fromEntries(keys.map(k => [k, String(row?.[k] ?? "")])));
		return {
			name: page.name ?? "",
			why: String(sys.why ?? ""),
			description: String(sys.description ?? ""),
			manner: manner?.id ?? "",
			picks,
			regionId: String(sys.regionId ?? ""),
			terrain: String(sys.terrain ?? ""),
			connections: [...(sys.connections ?? [])].map(String),
			questions: pairs(sys.questions, _PAIR_LISTS.questions),
			timeline: pairs(sys.timeline, _PAIR_LISTS.timeline),
			denizens: pairs(sys.denizens, _PAIR_LISTS.denizens),
			dangers: [...(sys.dangers ?? [])].map(String),
			discoveries: [...(sys.discoveries ?? [])].map(String),
			outside: [...(sys.outside ?? [])].map(String),
			inside: [...(sys.inside ?? [])].map(String),
			areas: pairs(sys.areas, ["title", "description", "contents", "exits"]),
			plans: [...(sys.plans ?? [])].map(String),
			randomTables: (sys.randomTables ?? []).map(t => ({
				caption: String(t?.caption ?? ""),
				rows: [...(t?.rows ?? [])].map(String),
			})),
		};
	}

	/** The chosen manner object, or null. */
	get _manner() { return siteManner(this._sel.manner); }

	getData() {
		const nav  = this._stepNav();
		const step = nav.step;
		const sel  = this._sel;
		const ctx  = { ...nav, sel, isEdit: !!this._page };

		if (step.key === "foundation") {
			ctx.storyQuestions = SITE_STORY_QUESTIONS;
		}
		if (step.key === "manner") {
			ctx.manners = SITE_MANNERS.map(m => ({ id: m.id, label: m.label, selected: m.id === sel.manner }));
			const manner = this._manner;
			ctx.mannerHint = manner?.hint ?? "";
			ctx.mannerPage = manner?.page ?? "";
			// Only the tables of the branch actually taken (lingering signs vs a ruin, a
			// barrow vs a reclaimed Maker-ruin) are offered.
			ctx.tables = manner ? visibleTables(manner, sel.picks).map(t => ({
				key: t.key,
				label: t.label,
				die: t.die,
				note: t.note ?? "",
				combine: !!t.combine,
				value: sel.picks[t.key] ?? "",
				rows: t.rows.map(r => ({
					text: r.text,
					roll: r.min === r.max ? String(r.min) : `${r.min}-${r.max}`,
					selected: r.text === sel.picks[t.key],
				})),
			})) : [];
			ctx.regions = REGIONS.map(r => ({ id: r.id, label: r.label, selected: r.id === sel.regionId }));
			const chosenRegion = region(sel.regionId);
			ctx.regionNote = chosenRegion?.note ?? "";
			ctx.regionPage = chosenRegion?.page ?? "";
			ctx.terrainRows = (chosenRegion?.terrain ?? []).map(r => ({
				text: r.text,
				roll: r.min === r.max ? String(r.min) : `${r.min}-${r.max}`,
				selected: r.text === sel.terrain,
			}));
		}
		if (step.key === "story") {
			ctx.connectionRows = this._lineRows("connections");
			ctx.connectionChips = SITE_CONNECTIONS.map(text => ({ text, used: sel.connections.includes(text) }));
			ctx.questionRows = this._pairRows("questions");
			ctx.questionChips = SITE_QUESTION_PROMPTS.map(text => ({
				text, used: sel.questions.some(q => q.prompt === text),
			}));
		}
		if (step.key === "timeline") {
			ctx.timelineRows = this._pairRows("timeline");
		}
		if (step.key === "contents") {
			ctx.denizenRows = this._pairRows("denizens");
			ctx.dangerRows = this._lineRows("dangers");
			ctx.discoveryRows = this._lineRows("discoveries");
			ctx.dangerKinds = SITE_DANGER_KINDS;
			ctx.discoveryKinds = SITE_DISCOVERY_KINDS;
		}
		if (step.key === "environment") {
			ctx.outsideRows = this._lineRows("outside");
			ctx.insideRows = this._lineRows("inside");
		}
		if (step.key === "areas") {
			ctx.areaRows = sel.areas.map((a, index) => ({ index, ...a }));
			ctx.areaPrompts = AREA_DETAIL_PROMPTS;
			ctx.layoutTips = SITE_LAYOUT_TIPS;
		}
		if (step.key === "plans") {
			ctx.planRows = this._lineRows("plans");
			ctx.tableRows = sel.randomTables.map((t, index) => ({
				index,
				caption: t.caption,
				die: t.rows.length ? `1d${t.rows.length}` : "",
				rows: t.rows.map((text, rowIndex) => ({ rowIndex, roll: rowIndex + 1, text })),
			}));
		}
		if (step.isFinal) {
			ctx.preview = this._previewCard();
			ctx.reviewChecks = SITE_REVIEW_CHECKS;
		}
		return ctx;
	}

	/** {index, text} rows for a string list. */
	_lineRows(list) {
		return this._sel[list].map((text, index) => ({ index, text }));
	}

	/** {index, ...keys} rows for a paired list. */
	_pairRows(list) {
		return this._sel[list].map((row, index) => ({ index, ...row }));
	}

	// A compact summary of the site-to-be, shown on the final step.
	_previewCard() {
		const sel = this._sel;
		const manner = this._manner;
		// Counted off the SHAPER's output rather than off `_sel` with a second set of filters.
		// The shaper decides what actually gets saved — it keeps an area that has only contents or
		// exits, and a table that has only a caption — so any other reckoning of "empty" tells the
		// GM they have nothing where they in fact have something, which is how work written in one
		// step gets thrown away in the next. One rule, the same one `_seed` points at.
		const shaped = shapeSiteSystem(this._seed());
		const foundation = [shaped.mannerLabel, shaped.regionLabel, shaped.terrain].filter(Boolean);
		return {
			name:        sel.name.trim() || "Unnamed site",
			foundation,
			why:         shaped.why,
			description: shaped.description.trim(),
			picks:       pickLines(manner, sel.picks),
			counts: [
				{ label: "Connections",  n: shaped.connections.length },
				{ label: "Questions",    n: shaped.questions.length },
				{ label: "Timeline",     n: shaped.timeline.length },
				{ label: "Denizens",     n: shaped.denizens.length },
				{ label: "Dangers",      n: shaped.dangers.length },
				{ label: "Discoveries",  n: shaped.discoveries.length },
				{ label: "Impressions",  n: shaped.outside.length + shaped.inside.length },
				{ label: "Areas",        n: shaped.areas.length },
				{ label: "Plans",        n: shaped.plans.length },
				{ label: "Tables",       n: shaped.randomTables.length },
			].filter(c => c.n > 0),
			areas: shaped.areas.map(a => a.title).filter(Boolean),
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._bindStepNav(html);

		html.find(".stonetop-cs-create").on("click", () => this._finish());

		// Scalar text fields persist on blur (no re-render, so focus survives typing).
		html.find("[data-field]").on("change", ev => {
			const el = ev.currentTarget;
			if (_TEXT_FIELDS.has(el.dataset.field)) this._sel[el.dataset.field] = el.value;
		});

		// ── Manner + its tables ──────────────────────────────────────────────
		// Changing the manner drops the old picks: they belong to the old entry's tables.
		html.find(".stonetop-cs-manner").on("change", ev => {
			this._sel.manner = ev.currentTarget.value;
			this._sel.picks = {};
			this.render(false);
		});
		// A pick can open or close a branch, so every pick re-renders.
		html.find(".stonetop-cs-pick").on("change", ev => {
			this._setPick(ev.currentTarget.dataset.key, ev.currentTarget.value);
			this.render(false);
		});
		html.find(".stonetop-cs-roll").on("click", ev => {
			const key = ev.currentTarget.dataset.key;
			this._setPick(key, rollMannerTable(this._manner, key)?.text ?? "");
			this.render(false);
		});
		// Roll every table of the manner, in order, so a branch table's result opens the
		// right branch before its own tables are rolled.
		html.find(".stonetop-cs-roll-all").on("click", () => {
			const manner = this._manner;
			if (!manner) return;
			this._sel.picks = {};
			// Bounded by the table count: each pass rolls the first not-yet-picked visible
			// table, which is how a branch opened mid-way still gets filled.
			for (let i = 0; i < manner.tables.length; i++) {
				const next = visibleTables(manner, this._sel.picks).find(t => !this._sel.picks[t.key]);
				if (!next) break;
				this._sel.picks[next.key] = rollOnTable(next.rows)?.text ?? "";
			}
			this.render(false);
		});

		// ── Region + terrain ─────────────────────────────────────────────────
		html.find(".stonetop-cs-region").on("change", ev => {
			this._sel.regionId = ev.currentTarget.value;
			this._sel.terrain = "";
			this.render(false);
		});
		html.find(".stonetop-cs-terrain").on("change", ev => { this._sel.terrain = ev.currentTarget.value; this.render(false); });
		html.find(".stonetop-cs-roll-terrain").on("click", () => {
			this._sel.terrain = rollTerrain(this._sel.regionId)?.text ?? "";
			this.render(false);
		});

		// ── Row lists (add / remove / suggest) ───────────────────────────────
		html.find(".stonetop-cs-add").on("click", ev => {
			this._captureLiveFields();
			const list = ev.currentTarget.dataset.list;
			this._sel[list].push(blankRow(list));
			this.render(false);
		});
		html.find(".stonetop-cs-remove").on("click", ev => {
			this._captureLiveFields();
			const { list, index } = ev.currentTarget.dataset;
			this._sel[list].splice(Number(index), 1);
			this.render(false);
		});
		// A suggestion chip appends the book's own prompt as a new row (once).
		html.find(".stonetop-cs-suggest").on("click", ev => {
			this._captureLiveFields();
			const { list, text } = ev.currentTarget.dataset;
			if (_PAIR_LISTS[list]) {
				if (!this._sel[list].some(r => r.prompt === text)) {
					this._sel[list].push({ ...blankRow(list), [_PAIR_LISTS[list][0]]: text });
				}
			} else if (!this._sel[list].includes(text)) {
				this._sel[list].push(text);
			}
			this.render(false);
		});

		// ── Random tables ────────────────────────────────────────────────────
		html.find(".stonetop-cs-table-add").on("click", () => {
			this._captureLiveFields();
			this._sel.randomTables.push({ caption: "", rows: [""] });
			this.render(false);
		});
		html.find(".stonetop-cs-table-remove").on("click", ev => {
			this._captureLiveFields();
			this._sel.randomTables.splice(Number(ev.currentTarget.dataset.index), 1);
			this.render(false);
		});
		html.find(".stonetop-cs-trow-add").on("click", ev => {
			this._captureLiveFields();
			this._sel.randomTables[Number(ev.currentTarget.dataset.table)]?.rows.push("");
			this.render(false);
		});
		html.find(".stonetop-cs-trow-remove").on("click", ev => {
			this._captureLiveFields();
			const { table, index } = ev.currentTarget.dataset;
			this._sel.randomTables[Number(table)]?.rows.splice(Number(index), 1);
			this.render(false);
		});
	}

	/** Set (or clear) one table pick, dropping the picks of a branch that just closed. */
	_setPick(key, value) {
		const manner = this._manner;
		if (!manner || !key) return;
		this._sel.picks[key] = value;
		// A branch pick that changed leaves the other branch's answers orphaned; drop any
		// pick whose table is no longer visible so it can't ride along into the write-up.
		const visible = new Set(visibleTables(manner, this._sel.picks).map(t => t.key));
		for (const k of Object.keys(this._sel.picks)) if (!visible.has(k)) delete this._sel.picks[k];
	}

	// Capture any focused-but-unblurred field before leaving the step (Back/Next/jump) or
	// mutating a row list, so a just-typed value isn't lost. Row inputs deliberately have
	// no per-keystroke handler (that would re-render and steal focus), so this is the only
	// thing that reads them back.
	_onBeforeStepChange() {
		this._captureLiveFields();
	}

	_captureLiveFields() {
		const root = this.element?.[0];
		if (!root) return;
		root.querySelectorAll("[data-field]").forEach(el => {
			if (_TEXT_FIELDS.has(el.dataset.field)) this._sel[el.dataset.field] = el.value;
		});
		// Plain string rows: <input class="stonetop-cs-line" data-list data-index>
		for (const list of _LINE_LISTS) {
			this._captureRowInputs(root, `.stonetop-cs-line[data-list="${list}"]`, this._sel[list]);
		}
		// Paired rows and areas: <input class="stonetop-cs-pair" data-list data-index data-key>
		root.querySelectorAll(".stonetop-cs-pair").forEach(el => {
			const row = this._sel[el.dataset.list]?.[Number(el.dataset.index)];
			if (row && el.dataset.key in row) row[el.dataset.key] = el.value;
		});
		// Random tables: caption + rows.
		root.querySelectorAll(".stonetop-cs-table-caption").forEach(el => {
			const t = this._sel.randomTables[Number(el.dataset.index)];
			if (t) t.caption = el.value;
		});
		root.querySelectorAll(".stonetop-cs-trow").forEach(el => {
			const t = this._sel.randomTables[Number(el.dataset.table)];
			const i = Number(el.dataset.index);
			if (t && i in t.rows) t.rows[i] = el.value;
		});
	}

	// The collected seed, in the shape shapeSiteSystem / createSite expect. Blank rows are
	// left in place here and dropped by the shaper, so one rule decides what "empty" means.
	_seed() {
		const sel = this._sel;
		const manner = this._manner;
		return {
			...sel,
			// Only the DERIVED fields are named. Everything else is the collected value as it
			// stands, so a new list on the wizard reaches the seed by existing rather than by being
			// remembered here as well — which is how a field came to be collected and never saved.
			name:        sel.name.trim() || "New Site",
			manner:      manner?.id ?? "",
			mannerLabel: manner?.label ?? "",
			picks:       pickLines(manner, sel.picks),
			regionLabel: region(sel.regionId)?.label ?? "",
		};
	}

	async _finish() {
		this._captureLiveFields();
		const seed = this._seed();
		if (this._page) {
			// Edit mode: apply in place. The name is the site's identity across the page and
			// its scene pins, so it routes through setSiteName.
			await this._page.update({ system: shapeSiteSystem(seed) });
			await setSiteName(this._page, seed.name);
			this._resolveWith(this._page);
		} else {
			this._resolveWith(seed);
		}
	}
}
