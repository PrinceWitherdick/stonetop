import { FrontOnOpen } from "../../../utils/front-on-open.js";
import { markProseSpiralBullets } from "../../../utils/journal-spiral-bullets.js";
import { moveGroupsForPlaybook, moveGroupKeys } from "./onboarding-move-groups.js";

// Base width (overview, stat, invocation). The move step widens so its two-column
// masonry list shows both columns comfortably by default. Heights are NOT fixed
// here: every step fits its own content (height:"auto"), and a CSS `max-height` on
// `.stonetop-levelup-dialog` (stonetop.css) caps the tall steps — the move grid and
// the invocation list — so they scroll inside a comfortable window instead of
// ballooning to fill the viewport.
const LEVELUP_BASE_WIDTH = 520;
const LEVELUP_MOVE_WIDTH = 860;

export class LevelUpDialog extends Application {
	constructor(character, levelUpData, onDone, options = {}) {
		super(options);
		this._character  = character;
		this._data       = levelUpData;
		this._step       = "overview"; // "overview" | "move" | "stat" | "invocation"
		this._selectedMoveId         = null;
		this._selectedStat           = null;
		this._selectedInvocationSlug = null;
		this._showLockedMoves        = false;
		// Move-filter state, persisted across re-renders (a move click re-renders the
		// dialog) so the search query and active chip survive selection.
		this._moveSearch             = "";
		this._activeMoveGroup        = null;
		this._onDone = onDone;
		this._frontOnOpen = new FrontOnOpen(this);
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-levelup-dialog",
			template:  "systems/stonetop_pwd/templates/dialogs/level-up.hbs",
			title:     game.i18n.localize("stonetop.specialMoves.levelUp.title"),
			width:     LEVELUP_BASE_WIDTH,
			height:    "auto", // every step fits its content; CSS max-height caps tall lists
			resizable: true,
			classes:   ["stonetop", "stonetop-levelup-dialog"],
		});
	}

	async _render(force, options) {
		// Capture the previous step's CENTER before re-rendering. A step change
		// resizes the window; without this it would grow from a fixed corner (or
		// Foundry would re-center it in the viewport, reading as a jump). Re-centering
		// on this point keeps the new, larger window centered over the old one.
		// Null on first render (no prior position), where Foundry centers us.
		const p = this.position;
		const prevCenter = [p?.left, p?.top, p?.width, p?.height].every(Number.isFinite)
			? { x: p.left + p.width / 2, y: p.top + p.height / 2 }
			: null;
		await super._render(force, options);
		this._frontOnOpen.apply();
		this._applyStepSize(prevCenter);
	}

	// Resize the window to match the active step — but only when the step actually
	// changes, so a manual resize while picking moves isn't snapped back on the
	// re-render a move click triggers. Every step fits its own content height (a CSS
	// `max-height` caps the tall move/invocation lists so they scroll rather than
	// balloon); only the width differs — the move picker widens for its two-column
	// grid. So a short step that FOLLOWS the move pick — the stat picker — shrinks
	// back down instead of hanging at the move step's large size. When `prevCenter`
	// is known the window is re-centered on it so the resize stays put, not drifts.
	_applyStepSize(prevCenter = null) {
		if (this._sizedStep === this._step) return;
		this._sizedStep = this._step;
		const width = this._step === "move" ? LEVELUP_MOVE_WIDTH : LEVELUP_BASE_WIDTH;
		// Apply the new width + fit-to-content height first so Foundry resolves the
		// final height, then recenter using the now-known dimensions.
		this.setPosition({ width, height: "auto" });
		if (prevCenter) {
			this.setPosition({
				left: prevCenter.x - this.position.width / 2,
				top:  prevCenter.y - this.position.height / 2,
			});
		}
	}

	async close(options = {}) {
		this._frontOnOpen.stop();
		return super.close(options);
	}

	getData() {
		const d = this._data;
		const isOverview   = this._step === "overview";
		const isMove       = this._step === "move";
		const isStat       = this._step === "stat";
		const isInvocation = this._step === "invocation";

		const needsStat  = this._needsStatChoice();
		const isLastStep = isInvocation
			|| (isStat && !d.needsInvocation)
			|| (isMove && !needsStat && !d.needsInvocation);

		const playbookName = d.playbookName ?? null;

		const moves = d.availableMoves.map(m => ({
			compendiumId:  m.compendiumId,
			name:          m.name,
			description:   m.description,
			requiresLabel: m.requiresLabel,
			groupsAttr:    moveGroupKeys(playbookName, m.name).join(" "),
			selected:      m.compendiumId === this._selectedMoveId,
		}));

		const lockedMoves = d.lockedMoves.map(m => ({
			compendiumId:  m.compendiumId,
			name:          m.name,
			description:   m.description,
			requiresLabel: m.requiresLabel,
			groupsAttr:    moveGroupKeys(playbookName, m.name).join(" "),
		}));

		const invocations = d.availableInvocations.map(inv => ({
			slug:        inv.slug,
			label:       inv.label,
			description: inv.description,
			selected:    inv.slug === this._selectedInvocationSlug,
		}));

		const canContinue = isOverview
			|| (isMove && this._selectedMoveId !== null)
			|| (isStat && this._selectedStat !== null)
			|| (isInvocation && this._selectedInvocationSlug !== null);

		// Stat-increase step: the six stats, greying out any already at the chosen
		// move's cap (+2 Improved / +3 Superior).
		const selectedEntry = this._selectedMoveEntry();
		const statCap = selectedEntry?.cap ?? null;
		const statOptions = (d.stats ?? []).map(s => ({
			...s,
			valueLabel: s.value >= 0 ? `+${s.value}` : `${s.value}`,
			atCap:      statCap != null && s.value >= statCap,
			selected:   s.key === this._selectedStat,
		}));

		return {
			isOverview,
			isMove,
			isStat,
			isInvocation,
			isLastStep,
			canContinue,
			newLevel:        d.newLevel,
			cost:            d.cost,
			xpRemaining:     d.xpRemaining,
			moves,
			hasMoves:        moves.length > 0,
			lockedMoves,
			hasLockedMoves:  lockedMoves.length > 0,
			showLockedMoves: this._showLockedMoves,
			moveGroups:      moveGroupsForPlaybook(playbookName),
			showMoveFilter:  moves.length > 0 || (this._showLockedMoves && lockedMoves.length > 0),
			invocations,
			needsInvocation: d.needsInvocation,
			statOptions,
			statMoveName:    selectedEntry?.name ?? null,
			statCap,
			statAllAtCap:    statOptions.length > 0 && statOptions.every(s => s.atCap),
		};
	}

	// The PlaybookMoveEntry for the currently-selected move (carries `cap`/`name`), or null.
	_selectedMoveEntry() {
		if (!this._selectedMoveId) return null;
		const all = [...(this._data?.availableMoves ?? []), ...(this._data?.lockedMoves ?? [])];
		return all.find(m => m.compendiumId === this._selectedMoveId) ?? null;
	}

	// A stat-increase move (Improved/Superior Stat) carries a `cap` and so needs the
	// stat-picker step inserted before applying.
	_needsStatChoice() {
		return (this._selectedMoveEntry()?.cap ?? null) != null;
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._frontOnOpen.start();

		// Move / invocation descriptions are enriched move HTML that can contain
		// bulleted option lists; give them the same spiral bullets as the sheet.
		for (const desc of html.find(".stonetop-levelup-move-description, .stonetop-levelup-invocation-description")) {
			markProseSpiralBullets(desc);
		}

		html.find(".stonetop-levelup-move-option:not(.is-locked)").on("click", ev => {
			this._selectedMoveId = ev.currentTarget.dataset.compendiumId;
			// Drop any stat picked for a previously-selected move so the cap re-validates
			// against the new move (and a non-stat move simply ignores it).
			this._selectedStat = null;
			this.render(false);
		});

		html.find(".stonetop-levelup-stat-option:not(.is-at-cap)").on("click", ev => {
			this._selectedStat = ev.currentTarget.dataset.statKey;
			this.render(false);
		});

		// ── Move search + group chips ─────────────────────────────────────
		// Pure DOM show/hide, mirroring the onboarding move picker. Filter state
		// lives on the instance so a move click (which re-renders) doesn't lose it;
		// we re-apply it below on every render.
		const applyMoveFilter = () => {
			const query = this._moveSearch.trim().toLowerCase();
			html.find(".stonetop-levelup-move-option").each((_, el) => {
				const textMatch  = !query || el.textContent.toLowerCase().includes(query);
				const groups     = (el.dataset.moveGroups ?? "").split(/\s+/).filter(Boolean);
				const groupMatch = !this._activeMoveGroup || groups.includes(this._activeMoveGroup);
				el.classList.toggle("is-filtered-out", !(textMatch && groupMatch));
			});
		};
		const search = html.find(".levelup-move-search");
		search.val(this._moveSearch);
		search.on("input", ev => {
			this._moveSearch = ev.currentTarget.value;
			applyMoveFilter();
		});
		html.find(".stonetop-levelup-move-chip").on("click", ev => {
			const key = ev.currentTarget.dataset.moveGroup;
			this._activeMoveGroup = this._activeMoveGroup === key ? null : key; // tap again to clear
			html.find(".stonetop-levelup-move-chip").each((_, b) => {
				// Block body is load-bearing: classList.toggle returns a boolean, and a
				// bare-arrow return of `false` aborts jQuery's .each() mid-loop.
				b.classList.toggle("is-active", b.dataset.moveGroup === this._activeMoveGroup);
			});
			applyMoveFilter();
		});
		// Restore the active-chip highlight and apply the current filter after each render.
		html.find(".stonetop-levelup-move-chip").each((_, b) => {
			b.classList.toggle("is-active", b.dataset.moveGroup === this._activeMoveGroup);
		});
		applyMoveFilter();

		html.find(".stonetop-levelup-locked-check").on("change", ev => {
			this._showLockedMoves = ev.currentTarget.checked;
			this.render(false);
		});

		html.find(".stonetop-levelup-invocation-option").on("click", ev => {
			this._selectedInvocationSlug = ev.currentTarget.dataset.slug;
			this.render(false);
		});

		html.find(".stonetop-levelup-back-btn").on("click", () => {
			if (this._step === "invocation")  this._step = this._needsStatChoice() ? "stat" : "move";
			else if (this._step === "stat")   this._step = "move";
			else if (this._step === "move")   this._step = "overview";
			this.render(false);
		});

		html.find(".stonetop-levelup-next-btn").on("click", async () => {
			const d = this._data;
			if (this._step === "overview") {
				this._step = "move";
			} else if (this._step === "move") {
				if (this._needsStatChoice()) this._step = "stat";
				else if (d.needsInvocation)  this._step = "invocation";
				else await this._apply();
			} else if (this._step === "stat") {
				if (d.needsInvocation) this._step = "invocation";
				else await this._apply();
			} else if (this._step === "invocation") {
				await this._apply();
			}
			this.render(false);
		});
	}

	async _apply() {
		const entry = this._selectedMoveEntry();
		const choices = (this._selectedStat && entry?.cap != null)
			? { stat: this._selectedStat, cap: entry.cap }
			: null;
		await this._character.applyLevelUp(this._selectedMoveId, this._selectedInvocationSlug, choices);
		// Hand back the chosen move's name so the sheet can auto-open the sacred-pouch
		// editor when a Blessed levels into Big Magic (an additional remarkable trait).
		if (this._onDone) this._onDone(entry?.name ?? null);
		this.close();
	}
}
