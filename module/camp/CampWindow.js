import { StonetopDialog } from "../utils/stonetop-dialog.js";
import { openOrFocus } from "../utils/open-or-focus.js";
import { partyCharacters } from "../utils/playbook-actors.js";
import { escHtml } from "../utils/strings.js";
import { CAMP_BENEFIT, CAMP_FOLLOWERS_MAX, CAMP_STATE, campLedger, count, coverTheRest, offerStep } from "./camp-rules.js";
import { campWindowView, closedCampNotice, settleRefusalText } from "./camp-view.js";
import {
	breakCamp, campActors, campMembers, campRecordOf, canCamp, isCampWriter, joinCamp, leaveCamp, playsCharacter,
	setCampChoices, settleCamp, stateOfCamp, touchesCamp,
} from "./camp-store.js";
import { askWithButtons, confirmLeavingOwnCamp } from "./camp-ask.js";

const TEMPLATE  = "systems/stonetop-pwd/templates/dialogs/make-camp.hbs";
const ID_PREFIX = "stonetop-camp";

/**
 * How long a burst of document updates is collapsed before the window redraws. A settle lands one
 * update per character within a second, and several players pressing steppers at once is the
 * whole point of the window; either would otherwise redraw it once per write.
 */
const RENDER_DEBOUNCE_MS = 80;

/** The window id for a camp: one window per camp, on each client. */
export function campWindowId(campId) {
	return StonetopDialog.perDocumentOptions(ID_PREFIX, campId).id;
}

/** Open a camp's window, or bring the one already open to the front. */
export function openCampWindow(campId, hostId) {
	return openOrFocus(campWindowId(campId), () => {
		const app = new CampWindow({ campId, hostId });
		app.render(true);
		return app;
	});
}

/**
 * MAKE CAMP, SHARED (Book I p.334): one window per camp, open on every client that joined it, and
 * redrawn from the documents whenever anyone at the fire changes anything.
 *
 * The window keeps no state of its own. Every control writes its choice straight to the character
 * it belongs to, and the updateActor that write causes, here and on every other client, is what
 * redraws it. So two players looking at the same camp cannot be looking at two versions of it,
 * and a player who reloads mid-camp gets the same camp back.
 */
export class CampWindow extends StonetopDialog {
	constructor({ campId, hostId } = {}, options = {}) {
		// Per camp: two camps open at once (a split party) must not share one frame.
		super(StonetopDialog.perDocumentOptions(ID_PREFIX, campId, options));
		this._camp        = { campId, hostId };
		this._hooks       = null;
		this._renderTimer = null;
		this._writes      = Promise.resolve();
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			title:     "Make Camp",
			template:  TEMPLATE,
			width:     600,
			height:    "auto",
			resizable: true,
			classes:   ["stonetop", "stonetop-spring-dialog", "stonetop-camp-window"],
		});
	}

	get _autoHeight() { return true; }

	getData() {
		const { campId, hostId } = this._camp;
		const user    = game.user;
		const host    = game.actors?.get(hostId);
		const members = campMembers(campId, hostId);
		const actorOf = id => game.actors?.get(id);
		const seated  = new Set(members.map(m => m.actorId));
		return campWindowView({
			state:    stateOfCamp(this._camp),
			hostName: host?.name ?? "",
			ledger:   campLedger(members),
			manages:  !!(user?.isGM || host?.isOwner),
			// One driver a row: the client that will pay that character's share. A player drives
			// their own row, and a GM (who owns every character) gets controls only for the ones
			// whose players are not there, rather than a second set of everybody's.
			editable: members.filter(m => isCampWriter(actorOf(m.actorId))).map(m => m.actorId),
			mine:     members.filter(m => playsCharacter(actorOf(m.actorId))).map(m => m.actorId),
			addable:  user?.isGM
				? partyCharacters().filter(a => canCamp(a) && !seated.has(a.id)).map(a => ({ id: a.id, name: a.name }))
				: [],
		});
	}

	/**
	 * Redraw, and put the keyboard back where it was.
	 *
	 * Other people's choices redraw this window while its reader is mid-way through their own row,
	 * and a redraw replaces every control. Somebody tabbing through their offer, or reading it
	 * through a magnifier that follows focus, would otherwise be thrown back to the top of the
	 * window every time anyone else at the fire pressed anything.
	 */
	async _render(force, options) {
		const doc      = globalThis.document;
		const before   = this.element?.[0];
		const focusKey = before && doc?.activeElement && before.contains(doc.activeElement)
			? doc.activeElement.dataset?.campFocus ?? null
			: null;
		await super._render(force, options);
		if (focusKey) this.element?.[0]?.querySelector?.(`[data-camp-focus="${focusKey}"]`)?.focus?.();
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._watch();
		const root = html?.[0] ?? html;
		root?.addEventListener?.("click", ev => this._onClick(ev));
		root?.addEventListener?.("change", ev => this._onChange(ev));
	}

	async close(options = {}) {
		this._unwatch();
		return super.close(options);
	}

	/** Everyone at the fire, read fresh, plus the one row a control belongs to. */
	_seat(actorId) {
		const members = campMembers(this._camp.campId, this._camp.hostId);
		return { members, member: members.find(m => m.actorId === actorId) ?? null };
	}

	/**
	 * Run one write after the last, so each one reads the camp as the one before it left it.
	 *
	 * A stepper gets pressed three times in a second. Each press reads the current offer and
	 * writes one more; three presses racing each other would all read the same offer and all write
	 * the same "one more". Chained, the second press reads what the first wrote.
	 */
	_queue(noun, task) {
		const run = this._writes.then(task);
		this._writes = run.catch(err => this.reportWriteFailure(noun, err));
		return this._writes;
	}

	_onClick(ev) {
		const control = ev.target?.closest?.("[data-camp-action]");
		if (!control || control.disabled) return;
		ev.preventDefault();
		const { campAction: action, actorId, slug } = control.dataset;
		const actor = actorId ? game.actors?.get(actorId) : null;
		switch (action) {
			case "offer-add":
			case "offer-take":
				return this._queue("offer", async () => {
					const { member } = this._seat(actorId);
					if (!member || !actor) return;
					await setCampChoices(actor, { [`offer.${slug}`]: offerStep(member, slug, action === "offer-add" ? 1 : -1) });
				});
			case "cover":
				return this._queue("offer", async () => {
					const { members, member } = this._seat(actorId);
					if (!member || !actor) return;
					await setCampChoices(actor, { offer: coverTheRest(campLedger(members), member) });
				});
			case "followers-add":
			case "followers-take":
				return this._queue("head count", async () => {
					const { member } = this._seat(actorId);
					if (!member || !actor) return;
					const step = action === "followers-add" ? 1 : -1;
					await setCampChoices(actor, { followers: count(member.record.followers + step, CAMP_FOLLOWERS_MAX) });
				});
			case "leave":
				return actor ? this._queue("departure", () => leaveCamp(actor)) : undefined;
			case "add":
				return this._bringSomeone();
			case "settle":
				return this._settle(control);
			case "break":
				return this._breakUp(control);
			default:
				return undefined;
		}
	}

	_onChange(ev) {
		const field = ev.target?.closest?.("[data-camp-field]");
		if (!field) return undefined;
		const { campField: key, actorId } = field.dataset;
		const actor = game.actors?.get(actorId);
		if (!actor) return undefined;
		// Choosing which debility is choosing to clear one: nobody picks from that list meaning HP.
		const patch = key === "benefit" ? { benefit: field.value }
			: key === "debility" ? { debility: field.value, benefit: CAMP_BENEFIT.DEBILITY }
			: { [key]: !!field.checked };
		return this._queue("camp choice", () => setCampChoices(actor, patch));
	}

	async _bringSomeone() {
		const select = this.element?.[0]?.querySelector?.('select[name="campAddActor"]');
		const actor  = game.actors?.get(select?.value);
		if (!actor) return;
		// The list can hold somebody hosting another fire, who would take that camp with them. Asked
		// before the write queue, so nobody's steppers wait on the GM reading the question.
		if (!(await confirmLeavingOwnCamp(actor, this._camp.campId))) return;
		await this._queue("arrival", () => joinCamp(actor, this._camp));
	}

	_settle(control) {
		control.disabled = true;
		return this._queue("camp", async () => {
			const result = await settleCamp(this._camp);
			if (result.ok) return;
			control.disabled = false;
			ui.notifications?.warn?.(settleRefusalText(result.reason));
			this.renderIfOpen();
		});
	}

	async _breakUp(control) {
		const host = game.actors?.get(this._camp.hostId);
		if (!host) return;
		const breakUp = await askWithButtons({
			title:   "Break up the camp?",
			content: `<p>Nobody at ${escHtml(host.name)}'s camp eats or rests, and nothing anyone shared is spent. To make camp after all, someone will have to open a new one.</p>`,
			buttons: [
				{ key: "break", icon: "fa-person-walking", label: "Break up the camp", value: true },
				{ key: "keep", label: "Keep the camp", value: false },
			],
			defaultKey: "keep",
		});
		if (!breakUp) return;
		control.disabled = true;
		await this._queue("camp", () => breakCamp(host));
	}

	/**
	 * Watch the documents the camp is made of, while the window is open.
	 *
	 * Any character's camp flag (someone sitting down or getting up), and anything at all about a
	 * character already seated: their pack, their HP and their debilities all show in their row.
	 * Who is online matters too, because it moves who pays for whom.
	 */
	_watch() {
		if (this._hooks) return;
		const onActor = (actor, changes) => {
			if (actor?.type !== "character") return;
			if (!touchesCamp(changes) && campRecordOf(actor)?.id !== this._camp.campId) return;
			this._scheduleRender();
		};
		this._hooks = [
			["updateActor",   Hooks.on("updateActor", onActor)],
			["userConnected", Hooks.on("userConnected", () => this._scheduleRender())],
		];
	}

	_unwatch() {
		for (const [hook, id] of this._hooks ?? []) Hooks.off(hook, id);
		this._hooks = null;
		clearTimeout(this._renderTimer);
		this._renderTimer = null;
	}

	/** Redraw soon, or close: the camp is over, or nobody this client plays is still at it. */
	_scheduleRender() {
		clearTimeout(this._renderTimer);
		this._renderTimer = setTimeout(() => {
			this._renderTimer = null;
			if (!this.rendered) return;
			const state = stateOfCamp(this._camp);
			if (state !== CAMP_STATE.OPEN) {
				const notice = closedCampNotice(state, game.actors?.get(this._camp.hostId)?.name);
				if (notice) ui.notifications?.info?.(notice);
				this.close();
				return;
			}
			const stillSeated = campActors(this._camp.campId).some(actor => actor.isOwner);
			if (!game.user?.isGM && !stillSeated) {
				this.close();
				return;
			}
			this.render(false);
		}, RENDER_DEBOUNCE_MS);
	}
}
