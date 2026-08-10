/**
 * The Judge's roster of the branded — everyone currently bearing a Condemn mark, and the only
 * place a mark can be lifted.
 *
 * Opened from the scales in the character sheet header (`_onCondemnOpen`). Not a result dialog:
 * nobody awaits an answer, because every act in here writes straight through to the actor. It is
 * a live view of one flag, so it re-renders itself after each write rather than collecting a
 * form and saving on close — a Judge who dismisses a brand and then closes the window with the X
 * must not have quietly un-dismissed it.
 *
 * READ-ONLY FOR A VIEWER WHO CANNOT WRITE, but still open to them. Condemn's brand is public by
 * construction — "any intelligent creature who sees the mark recognizes the bearer as an agent of
 * chaos" — so who is branded is not the Judge's secret. What IS theirs is the branding and the
 * dismissing, and `editable` withholds exactly those.
 */
import { StonetopDialog } from "../../../utils/stonetop-dialog.js";
import { StonetopAutocomplete } from "../../../utils/autocomplete.js";
import { getDragEventData } from "../../../utils/foundry-compat.js";
import { openLinkedActorSheet, ACTOR_LINK_MISSING } from "../../../utils/actor-link.js";
import { resolvePortrait, documentPortraitFrame } from "../../../utils/portrait-frame.js";
import { PERSON_ROSTER_IMG } from "../../../utils/person-portrait.js";
import { isDefaultImg } from "../../../utils/strings.js";
import { findBrandTarget, brandIndex, isBrandedBy } from "../condemn.js";
import { playbookIconPath } from "../../../utils/playbook-actors.js";

/** Actor types a brand can name. A steading is a place, not somebody who can be denounced. */
const BRANDABLE = ["npc", "character", "monster"];

/** Whose move this is. Matches `system.slug` on the playbook item, which is what names the art. */
const JUDGE_SLUG = "the-judge";

export class CondemnedDialog extends StonetopDialog {
	/**
	 * @param {Actor}  actor      the Judge
	 * @param {object} character  their StonetopCharacter, which owns the three writers
	 * @param {object} [options]  AppV1 options, plus `editable`
	 */
	constructor(actor, character, options = {}) {
		super(StonetopDialog.perDocumentOptions("stonetop-condemned", actor?.id, options));
		this._actor = actor;
		this._character = character;
		// Frozen after super() (see the AppV2/AppV1 options note in stonetop-dialog.js), so it is
		// read once here rather than off this.options at every call site.
		this._editable = options.editable !== false;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-condemned-dialog",
			title: "The Condemned",
			template: "systems/stonetop_pwd/templates/dialogs/condemned.hbs",
			// "stonetop" carries our window chrome; omitting it leaves the window half-styled,
			// picking up our own rules over Foundry's default dark header.
			classes: ["stonetop", "stonetop-condemned-dialog"],
			width: 480,
			height: "auto",
			resizable: true,
			scrollY: [".stonetop-condemned-list"],
		});
	}

	get title() {
		return `${this._actor?.name ?? "The Judge"} — The Condemned`;
	}

	/** Hug the content: the list is one row per brand and usually three or four of them. */
	get _autoHeight() { return true; }

	getData() {
		const rows = this._character.condemned.map(entry => this._row(entry));
		return {
			editable: this._editable,
			rows,
			hasRows: rows.length > 0,
			// Every world actor a brand could name, for the add field's suggestions. The field
			// stays free-type regardless: a Censure often lands on a bandit nobody has made an
			// Actor for, and a Proclamation's faction may have none at all.
			suggestions: this._suggestions(),
			// The Judge's own playbook mark, over the rule. THE JUDGE'S, not this character's:
			// the window belongs to the move, and a Fox who took Condemn through Versatile should
			// still see whose brand they are carrying rather than their own fox.
			playbookImg: playbookIconPath(JUDGE_SLUG),
		};
	}

	/**
	 * One roster row. The portrait and the name-as-link are the affordances a relationship row
	 * carries, resolved through the same helpers, so a person listed here looks and behaves like
	 * the same person listed anywhere else in the system.
	 *
	 * A row whose actor has since been DELETED keeps its name and simply stops being a link:
	 * losing the document does not lift the brand, and a Judge still has to be able to dismiss it.
	 */
	_row(entry) {
		const actor = entry.uuid ? this._resolveActor(entry.uuid) : null;
		const portrait = actor
			? resolvePortrait(isDefaultImg(actor.img) ? null : actor.img, documentPortraitFrame(actor))
			: { src: "", style: "" };
		return {
			...entry,
			linked:   !!actor,
			img:      portrait.src || PERSON_ROSTER_IMG,
			imgStyle: portrait.style,
		};
	}

	/**
	 * The actor behind a stored uuid, SYNCHRONOUSLY — getData cannot await, and a world Actor is
	 * already in memory. `fromUuidSync` is used rather than the async form for that reason; it
	 * answers null for a compendium document that is not indexed, which is correct here (a brand
	 * on a pack entry names nobody in this world) and is why the row degrades to plain text.
	 */
	_resolveActor(uuid) {
		try {
			const doc = fromUuidSync(uuid);
			return doc?.documentName === "Actor" ? doc : null;
		} catch { return null; }
	}

	/**
	 * The add field's suggestions: each person's name, and where they live beside it.
	 *
	 * Drawn from the same pool the typed name is SEARCHED against (_brandableActors), so the list
	 * cannot come to offer a name the search would then fail to resolve — which is exactly the
	 * kind of drift that turns a picked suggestion into an inert name-only brand.
	 *
	 * The home rides a SEPARATE `hint` (rendered as the option's `label`, which the autocomplete
	 * turns into a dimmed second column) rather than being folded into the name. That is the whole
	 * point: only the value is inserted into the field, so a picked "Brennan the Claw / Marshedge"
	 * types "Brennan the Claw" and resolves cleanly. A "Name (Home)" value string would have to be
	 * unpicked again before the search could use it, and would silently break for anyone whose
	 * real name ends in a parenthetical.
	 *
	 * Only NPCs carry a home, and it is blank for residents of Stonetop itself (NpcModel), so most
	 * rows have no hint and simply show the name. Monsters and player characters never do.
	 *
	 * De-duplicated by name+home rather than by name alone: two different Aeronwens are exactly
	 * what the hint exists to separate, and collapsing them would hide the one it was added for.
	 *
	 * Anyone already on the roster drops out: offering them is offering a pick whose only outcome
	 * is an "already bears your brand" refusal, and on a Judge several sessions in the list would
	 * be padded with names that cannot be chosen. Read fresh here rather than cached, so somebody
	 * branded a moment ago is gone from the field on the re-render that follows.
	 *
	 * The SEARCH still sees them (isBranded filters this list, not _brandableActors), so typing an
	 * already-branded name still resolves and still gets told why — better than the name suddenly
	 * failing to match anybody.
	 */
	_suggestions() {
		// Built ONCE above the loop: this filters every brandable actor in the world, and
		// `isBranded` would re-read and re-normalise the whole brand list per candidate.
		const brands = brandIndex(this._character.condemned);
		const seen = new Set();
		const rows = [];
		for (const actor of this._brandableActors()) {
			if (isBrandedBy(brands, actor)) continue;
			const value = String(actor.name ?? "").trim();
			if (!value) continue;
			const hint = String(actor.system?.home ?? "").trim();
			const key = `${value}\u0000${hint}`;
			if (seen.has(key)) continue;
			seen.add(key);
			rows.push({ value, hint });
		}
		return rows.sort((a, b) => a.value.localeCompare(b.value) || a.hint.localeCompare(b.hint));
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];

		// The name field's native <datalist> popup has no scrollbar in Chromium, and a world's
		// worth of NPCs is a long list; swap in ours. See utils/autocomplete.js.
		StonetopAutocomplete.upgradeAll(html);

		// Opening the branded person's sheet is looking, not writing, so it is wired before the
		// editable gate — a player reading a GM's Judge can still see who these people are.
		root.addEventListener("click", async ev => {
			const link = ev.target.closest(".stonetop-condemned-open");
			if (!link) return;
			ev.preventDefault();
			await openLinkedActorSheet(link, ACTOR_LINK_MISSING.npc);
		});

		if (!this._editable) return;

		root.querySelector(".stonetop-condemned-add-btn")?.addEventListener("click", () => this._addTyped(root));
		// Enter in the name field is the same act as pressing Add. Without this the field sits
		// inside a dialog with no form, so Enter does nothing at all and reads as a dead control.
		root.querySelector(".stonetop-condemned-name")?.addEventListener("keydown", ev => {
			if (ev.key !== "Enter") return;
			ev.preventDefault();
			this._addTyped(root);
		});

		root.addEventListener("click", async ev => {
			const btn = ev.target.closest(".stonetop-condemned-dismiss");
			if (!btn) return;
			ev.preventDefault();
			await this._dismiss(btn.dataset.condemnedId);
		});

		// Notes save on blur rather than per keystroke: each write is a document update that
		// re-renders every sheet showing this actor, and typing a sentence should not be twenty of
		// them. `change` fires on blur (and on Enter) with the final value, which is exactly the
		// grain wanted — and setCondemnedNote is a no-op when the text did not actually move.
		root.addEventListener("change", async ev => {
			const field = ev.target.closest(".stonetop-condemned-note");
			if (!field) return;
			await this._character.setCondemnedNote(field.dataset.condemnedId, field.value);
		});

		this._wireDrop(root);
	}

	/**
	 * Drop an Actor onto the window to brand them. The one path that can never mistype a name or
	 * pick the wrong Alun of two, since it carries the document itself.
	 *
	 * `dragover` must preventDefault or the browser refuses the drop outright — the same
	 * synchronous-preventDefault rule the character sheet's own drop target follows.
	 */
	_wireDrop(root) {
		const zone = root.querySelector(".stonetop-condemned-body") ?? root;
		zone.addEventListener("dragover", ev => { ev.preventDefault(); zone.classList.add("is-drop-target"); });
		zone.addEventListener("dragleave", ev => { if (!zone.contains(ev.relatedTarget)) zone.classList.remove("is-drop-target"); });
		zone.addEventListener("drop", async ev => {
			ev.preventDefault();
			zone.classList.remove("is-drop-target");
			const data = getDragEventData(ev);
			if (data?.type !== "Actor") return;
			const actor = await fromUuid(data.uuid);
			if (!actor) return;
			if (!BRANDABLE.includes(actor.type)) {
				return this._warn("stonetop.condemn.notBrandable", { name: actor.name });
			}
			if (actor.id === this._actor?.id) return this._warn("stonetop.condemn.notSelf");
			// A pack entry's uuid resolves nowhere in this world once the dialog is reopened, so
			// storing it would give a row that can never be a link and never match a sheet. Keep
			// the NAME, which is the honest half of what was dropped, and say so.
			if (actor.pack) {
				await this._brand({ name: actor.name });
				return this._warn("stonetop.condemn.fromCompendium", { name: actor.name });
			}
			await this._brand({ name: actor.name, uuid: actor.uuid });
		});
	}

	/**
	 * Brand whoever is named in the add field.
	 *
	 * The typed name is SEARCHED against the world first, because a brand that carries a uuid tags
	 * that person's sheet and a brand that carries only a name tags nobody. Nearly everybody a
	 * Judge condemns already has an Actor — so resolving "brennan" to Brennan the Claw is the
	 * difference between the mark appearing where it belongs and a lookalike row sitting inert on
	 * the roster. Typing a name and dropping the actor should record the same thing, and after
	 * this they do.
	 *
	 * Three outcomes, and each one says what happened rather than resolving quietly:
	 *  • several people match a partial → nobody is branded, and the notice names them, because
	 *    branding the wrong Aeronwen is worse than asking which;
	 *  • one person matches → branded and LINKED, and if the actor's real name differs from what
	 *    was typed the notice says whose sheet just took the mark;
	 *  • nobody matches → branded by name alone, and the notice says so, or a typo would produce a
	 *    brand that silently tags nothing and looks identical to one that works.
	 *
	 * A Proclamation's faction goes through the SAME field, with nothing to tick. If the GM has made
	 * an Actor for the Claws then that Actor is the thing being denounced and the search links it;
	 * if they have not, "the Claws" is stored as a name like any other unmodelled target. There is
	 * no stored distinction between branding a person and branding a body of people — the name says
	 * which, and the roster reads the same either way.
	 */
	_addTyped(root) {
		const field = root.querySelector(".stonetop-condemned-name");
		const name = String(field?.value ?? "").trim();
		if (!name) return this._warn("stonetop.condemn.needName");

		const { match, candidates, ambiguous } = findBrandTarget(name, this._brandableActors());
		if (!match && candidates.length) {
			return this._warn("stonetop.condemn.ambiguous", {
				name, names: candidates.map(a => a.name).join(", "),
			});
		}
		if (!match) return this._brand({ name }, "stonetop.condemn.nameOnly");
		// Two actors really do share this name; the typed text cannot say which, so the first is
		// taken and the drop path is pointed at. See findBrandTarget.
		if (ambiguous) this._notify("info", "stonetop.condemn.sameName", { name: match.name });
		// Only worth saying when the search actually moved: "Brennan" → "Brennan the Claw" is news,
		// "brennan" → "Brennan" is not.
		const note = match.name.toLowerCase() === name.toLowerCase() ? null : "stonetop.condemn.matched";
		return this._brand({ name: match.name, uuid: match.uuid }, note);
	}

	/** Everyone in the world a brand could name — the search pool, and the suggestion source. */
	_brandableActors() {
		return [...(game.actors ?? [])].filter(a => BRANDABLE.includes(a.type) && a.id !== this._actor?.id);
	}

	/**
	 * Write a brand and redraw. A refusal means "already branded" — the only way `added` is null
	 * once the name is non-empty — so it is reported rather than swallowed.
	 *
	 * `note` is an optional i18n key announced only on SUCCESS, for the things the search did that
	 * the player did not type (resolved a partial, or found nobody and stored a bare name).
	 */
	async _brand(entry, note = null) {
		const added = await this._character.brandCondemned(entry);
		if (!added) return this._warn("stonetop.condemn.already", { name: entry.name });
		if (note) this._notify("info", note, { name: added.name });
		this._clearAddField();
		this.renderIfOpen();
	}

	async _dismiss(id) {
		if (!id) return;
		if (await this._character.dismissCondemned(id)) this.renderIfOpen();
	}

	/**
	 * Empty the add field after a successful brand, so the next one starts clean.
	 *
	 * Reached through the live element rather than left to the re-render: `height: "auto"` windows
	 * re-render into fresh nodes, but the value is cleared here so the field is already empty in
	 * the frame the player sees, rather than briefly showing the name they just used.
	 */
	_clearAddField() {
		const field = this.element?.[0]?.querySelector(".stonetop-condemned-name");
		if (field) field.value = "";
	}

	_warn(key, data) {
		return this._notify("warn", key, data);
	}

	_notify(level, key, data) {
		const text = data ? game.i18n.format(key, data) : game.i18n.localize(key);
		ui.notifications?.[level]?.(text);
		return null;
	}
}
