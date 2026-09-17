// The Fight tab: Foundry's Combat tab, without initiative, showing who is fighting whom.
//
// Stonetop has no turn order ("Players shouldn't get bored waiting for 'their turn'", Book I p.417),
// so this keeps core's encounter record and throws away everything built on turns. What is left is
// core's own plumbing, which is worth keeping: a token HUD toggle and a multi-select still add
// combatants, hovering a row still lights its token, clicking still pans to it, the tab still pops out.
//
// A FACTORY OVER THE BASE CLASS, so tests can hand in a stand-in and the class body never names a
// core global at import time. fight-boot.js makes the real one at init, when the setting is on.
//
// WHAT IS REPLACED:
//  • The header and tracker PARTS, and the two context preparers that feed them. Core's own
//    preparers are where initiative, rounds and turn controls are built; overriding both means none
//    of that code runs. There is no footer part: it only ever held Begin, Next Turn and End.
//  • The combatant context menu (no initiative entries), and the encounter menu (gone).
//
// WHAT MUST STAY, because core's own listeners look for it: rows are `.combatant[data-combatant-id]`
// with `data-action="activateCombatant"`, inside an element with class `combat-tracker`.
//
// ⚠ NO `stonetop` CLASS ON THE ROOT. The sidebar tab is core chrome and follows core's theme;
// utils/window-theme.js pins any ApplicationV2 carrying a `stonetop` class to the light theme, which
// here would repaint the whole sidebar. The fight's cards carry their own paper and ink instead.
//
// DRAG A FOE ONTO A HERO. A GM's foe rows are draggable and hero rows take the drop, which moves the
// foe's token next to the hero's (send-against.js). Native drag and drop, delegated from the frame so
// it survives every redraw, and carrying only our own data type: dropped on the map or a sheet, the
// row is nothing anybody else reads.
//
// THE POP-OUT IS THE FIGHT WINDOW. Core pops a sidebar tab out by making a second instance of this
// class inside a frame (`isPopout`), and fight-window.js opens that when a fight starts. The same
// rule holds for it: core's pop-out look, no `stonetop` class. What differs is only where it opens,
// that it resizes, and that it remembers both.

import { snapshotFight, combatantBodies, combatantSide, COUNT_FLAG, SIDE_FLAG, LAST_LINE_UP_FLAG } from "./fight-state.js";
import { FIGHT_OVER, fightWindowPosition, noteFightWindowClosed, openFightWindow, rememberFightWindowPosition } from "./fight-window.js";
import { fightTrackerView } from "./fight-view.js";
import { canReadFoeVitals, combatantVitals, fightVitalsKey, followerRoster } from "./fight-vitals.js";
import { otherSide, fightsAsGroup } from "./fight-sides.js";
import { SYSTEM_ID } from "../system-id.js";
import { contextMenuEntry } from "../utils/foundry-compat.js";
import { bookPageCites } from "../gm-toolkit/book-ref.js";
import { followBookCite } from "../books/rulebook-icons.js";
import { format, localize } from "../utils/i18n.js";
import { escHtml } from "../utils/strings.js";
import { themedDialogClasses } from "../utils/window-theme.js";
import { isFightOverlayShown, setFightOverlayShown } from "../settings.js";

// Plain literals, not built from SYSTEM_ID: the precache check in tests finds template paths by
// searching the source for them.
const HEADER_TEMPLATE = "systems/stonetop-pwd/templates/sidebar/fight-header.hbs";
const TRACKER_TEMPLATE = "systems/stonetop-pwd/templates/sidebar/fight-tracker.hbs";

/** The drag data type a foe's row carries: its combatant id. */
export const FIGHTER_DRAG_TYPE = "application/x-stonetop-fighter";
const DROP_CLASS = "is-drop-target";
const DRAG_CLASS = "is-dragging";

/** Whether a combatant's headcount is the GM's to set here, rather than read off a group monster. */
function headcountIsOurs(combatant) {
	const actor = combatant?.actor;
	return !fightsAsGroup({ type: actor?.type, fightAsGroup: actor?.system?.fightAsGroup, organization: actor?.system?.organization });
}

/**
 * @param {typeof foundry.applications.sidebar.tabs.CombatTracker} Base
 */
export function createFightTrackerClass(Base) {
	return class FightTracker extends Base {
		static DEFAULT_OPTIONS = {
			window: { title: "stonetop.fight.window" },
			actions: {
				startFight: FightTracker.#onStartFight,
				addToFight: FightTracker.#onAddToFight,
				lineUpFight: FightTracker.#onLineUp,
				putBackFight: FightTracker.#onPutBack,
				endFight: FightTracker.#onEndFight,
				toggleFightOverlay: FightTracker.#onToggleOverlay,
				stopRounds: FightTracker.#onStopRounds,
				openFightWindow: FightTracker.#onOpenWindow,
				openFightBook: FightTracker.#onOpenBook,
			},
		};

		static PARTS = {
			header: { template: HEADER_TEMPLATE },
			tracker: { template: TRACKER_TEMPLATE, scrollable: [""] },
		};

		/** The "What the book says" folds this reader has open, kept across redraws. */
		_openRules = new Set();

		/** The engagements this tab last drew, so the watcher can skip a redraw that changes nothing. */
		fightSignature = null;

		/** Everyone's HP and armor as this tab last drew them, for the same skip. */
		fightVitals = null;

		/**
		 * @inheritDoc: the pop-out opens where the reader left it (else beside the sidebar) and resizes.
		 *
		 * Core builds the pop-out's options from the tab's own, so it would inherit the tab's `active`
		 * class had the Fight tab been the open one when the interface was built. Core always builds on
		 * Chat, but a module that opens the sidebar elsewhere would hand it over, and core's
		 * `.combat-sidebar.active` rule gives that height 0: the window shrinks to its title bar
		 * (measured offline, 52px). Dropped here, on the pop-out only.
		 */
		_initializeApplicationOptions(options) {
			const initialized = super._initializeApplicationOptions(options);
			if (!initialized.window?.frame) return initialized;
			initialized.window.resizable = true;
			initialized.window.icon ||= "fa-solid fa-swords";
			initialized.classes = initialized.classes.filter(name => name !== "active");
			initialized.position = { ...initialized.position, ...fightWindowPosition() };
			return initialized;
		}

		/** @override */
		async _preFirstRender(context, options) {
			// The row and rules partials are registered by the init-time preload, and the sidebar can
			// draw before those fetches land.
			try { await globalThis.game?.stonetop?.templatesReady; }
			catch (err) { console.error("Stonetop | Fight tab: template preload failed", err); }
			return super._preFirstRender(context, options);
		}

		/** @override: the header, with no initiative, rounds or turn controls. */
		async _prepareCombatContext(context, _options) {
			const combat = this.viewed;
			const combats = this.combats;
			const index = combats.indexOf(combat);
			const user = globalThis.game?.user;
			Object.assign(context, {
				user: context.user ?? user,
				isGM: !!user?.isGM,
				combat,
				hasCombat: !!combat,
				cycle: combats.length > 1 ? {
					text: format("stonetop.fight.cycle.count", { index: index + 1, count: combats.length }),
					previousId: combats[index - 1]?.id ?? "",
					nextId: combats[index + 1]?.id ?? "",
				} : null,
				overlayShown: isFightOverlayShown(),
				isPopout: !!this.isPopout,
				roundsStarted: (combat?.round ?? 0) > 0,
				canPutBack: !!combat?.flags?.[SYSTEM_ID]?.[LAST_LINE_UP_FLAG],
			});
		}

		/** @override: one card per engagement, in place of the turn list. */
		async _prepareTrackerContext(context, _options) {
			const combat = this.viewed;
			const user = globalThis.game?.user;
			context.isGM = !!user?.isGM;
			context.fight = null;
			if (!combat) return;
			const scene = combat.scene ?? globalThis.canvas?.scene ?? null;
			const snapshot = snapshotFight(combat, { scene });
			if (!snapshot) return;
			const rows = new Map();
			for (const combatant of [...snapshot.combatants.values(), ...snapshot.elsewhere]) {
				rows.set(combatant.id, await this._fightRow(combatant));
			}
			context.fight = fightTrackerView({
				snapshot, rows, isGM: !!user?.isGM, format, cites: bookPageCites, openRules: this._openRules,
			});
			this.fightSignature = snapshot.result.signature;
			this.fightVitals = fightVitalsKey(combat);
		}

		/** What one combatant's row needs beyond the engagements. */
		async _fightRow(combatant) {
			const user = globalThis.game?.user;
			const onCanvas = !!combatant.sceneId && combatant.sceneId === globalThis.canvas?.scene?.id;
			const bodies = combatantBodies(combatant);
			// A crew or a custom group says how many of its roster are still up, in place of the
			// headcount the GM set: that number is for the engagement arithmetic, and does not fall.
			const roster = followerRoster(combatant);
			if (roster) Object.assign(bodies, { group: true, standing: roster.standing, size: roster.size });
			return {
				name: combatant.name ?? "",
				img: await this._getCombatantThumbnail(combatant),
				hidden: !!combatant.hidden,
				defeated: !!combatant.isDefeated,
				vitals: combatantVitals(combatant),
				seesFoeVitals: canReadFoeVitals(combatant, user),
				side: combatantSide(combatant),
				canPing: onCanvas && !!user?.hasPermission?.("PING_CANVAS"),
				onCanvas,
				group: bodies.group,
				standing: bodies.standing,
				size: bodies.size,
			};
		}

		/** @inheritDoc */
		_attachFrameListeners() {
			super._attachFrameListeners();
			// Book citations open the GM's copy of the book at that page.
			this.element.addEventListener("click", event => {
				if (followBookCite(event.target)) event.preventDefault();
			});
			// A fold's open state, remembered so a token moving does not snap it shut. `toggle` does not
			// bubble, hence the capture.
			this.element.addEventListener("toggle", event => {
				const key = event.target?.dataset?.rulesKey;
				if (!key) return;
				if (event.target.open) this._openRules.add(key);
				else this._openRules.delete(key);
			}, true);
			this.element.addEventListener("dragstart", event => this._onFightDragStart(event));
			this.element.addEventListener("dragend", event => this._onFightDragEnd(event));
			this.element.addEventListener("dragover", event => this._onFightDragOver(event));
			this.element.addEventListener("dragleave", event => this._onFightDragLeave(event));
			this.element.addEventListener("drop", event => this._onFightDrop(event));
		}

		/** A GM picks up a foe's row. */
		_onFightDragStart(event) {
			const row = event.target?.closest?.("[data-fight-drag]");
			const id = row?.dataset?.combatantId;
			if (!id || !event.dataTransfer) return;
			event.dataTransfer.setData(FIGHTER_DRAG_TYPE, id);
			event.dataTransfer.effectAllowed = "move";
			row.classList.add(DRAG_CLASS);
		}

		_onFightDragEnd(event) {
			event.target?.closest?.("[data-fight-drag]")?.classList.remove(DRAG_CLASS);
			// The drop may have landed in the other copy of the tab (window or sidebar); clear this one.
			for (const lit of this.element?.querySelectorAll?.(`.${DROP_CLASS}`) ?? []) lit.classList.remove(DROP_CLASS);
		}

		/** A hero's row under a dragged foe says it will take it. Only the type is readable mid-drag. */
		_onFightDragOver(event) {
			const row = event.target?.closest?.("[data-fight-drop]");
			if (!row || ![...(event.dataTransfer?.types ?? [])].includes(FIGHTER_DRAG_TYPE)) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
			row.classList.add(DROP_CLASS);
		}

		_onFightDragLeave(event) {
			const row = event.target?.closest?.("[data-fight-drop]");
			if (row && !row.contains(event.relatedTarget)) row.classList.remove(DROP_CLASS);
		}

		/** A foe dropped on a hero: move the foe's token up against the hero's. */
		_onFightDrop(event) {
			const row = event.target?.closest?.("[data-fight-drop]");
			const foeId = event.dataTransfer?.getData?.(FIGHTER_DRAG_TYPE);
			if (!row || !foeId) return;
			event.preventDefault();
			row.classList.remove(DROP_CLASS);
			return globalThis.game?.stonetop?.fight?.sendAgainst?.(this.viewed, foeId, row.dataset.combatantId);
		}

		/**
		 * @inheritDoc: the Fight window never grows past the foot of the screen.
		 *
		 * Left to itself, core fits a pop-out to its content, and when that is taller than the room
		 * below the window it slides the window UP to make space, until the frame is the screen's
		 * whole height. Here the frame is held to the room below where it stands (the stylesheet
		 * reads `--stonetop-fight-top`), so its top edge stays put and the list of fighters scrolls
		 * inside it, under the header's buttons.
		 */
		_updatePosition(position) {
			const top = Number(position?.top);
			if (this.isPopout && Number.isFinite(top)) this.element?.style?.setProperty?.("--stonetop-fight-top", `${Math.max(0, Math.round(top))}px`);
			return super._updatePosition(position);
		}

		/** @inheritDoc: a moved or resized Fight window opens there next time. A minimized one says nothing about that. */
		_onPosition(position) {
			super._onPosition?.(position);
			if (this.isPopout && !this.minimized) rememberFightWindowPosition(this.position);
		}

		/** @inheritDoc: the reader closing the Fight window keeps it shut for this fight; the fight ending does not. */
		_onClose(options) {
			super._onClose?.(options);
			if (this.isPopout && !options?.[FIGHT_OVER]) noteFightWindowClosed();
		}

		/** @override: GM tools for one combatant; nothing about initiative. */
		_getEntryContextOptions() {
			const combatantOf = target => this.viewed?.combatants?.get(target?.dataset?.combatantId) ?? null;
			const gm = () => !!globalThis.game?.user?.isGM;
			return [
				contextMenuEntry({
					label: "stonetop.fight.menu.switchSide",
					icon: "fa-solid fa-right-left",
					visible: target => gm() && !!combatantOf(target),
					run: target => this._switchSide(combatantOf(target)),
				}),
				contextMenuEntry({
					label: "stonetop.fight.menu.headcount",
					icon: "fa-solid fa-people-group",
					visible: target => gm() && headcountIsOurs(combatantOf(target)),
					run: target => this._askHeadcount(combatantOf(target)),
				}),
				contextMenuEntry({
					label: "stonetop.fight.menu.openSheet",
					icon: "fa-solid fa-user",
					visible: target => !!combatantOf(target)?.actor?.testUserPermission?.(globalThis.game?.user, "OBSERVER"),
					run: target => combatantOf(target)?.actor?.sheet?.render(true),
				}),
				contextMenuEntry({
					label: "stonetop.fight.menu.remove",
					icon: "fa-solid fa-trash",
					visible: target => gm() && !!combatantOf(target),
					run: target => combatantOf(target)?.delete(),
				}),
			];
		}

		/** @override: the encounter menu held initiative and turn tools only. */
		_getCombatContextOptions() {
			return [];
		}

		/** Move a combatant to the other side. */
		async _switchSide(combatant) {
			const side = combatantSide(combatant);
			if (!combatant || !side) return;
			await combatant.update({ [`flags.${SYSTEM_ID}.${SIDE_FLAG}`]: otherSide(side) });
		}

		/** Ask the GM how many people one token stands for (a crew, a warband). */
		async _askHeadcount(combatant) {
			const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
			if (!combatant || !DialogV2) return;
			const current = Math.max(1, Math.trunc(Number(combatant.flags?.[SYSTEM_ID]?.[COUNT_FLAG]) || 1));
			// A bare <div> as the content (DialogV2 wraps its own form around it), the house shape
			// from dialogs/content-picker.js#promptForText.
			const content = document.createElement("div");
			content.innerHTML = `<div class="stonetop-fight-headcount">
				<label class="stonetop-fight-headcount-field">
					<span>${escHtml(localize("stonetop.fight.headcount.label"))}</span>
					<input type="number" name="stonetopHeadcount" min="1" step="1" value="${current}">
				</label>
				<p class="stonetop-fight-headcount-hint">${escHtml(localize("stonetop.fight.headcount.hint"))}</p>
			</div>`;
			const count = await DialogV2.prompt({
				classes: themedDialogClasses(),
				window: { title: format("stonetop.fight.headcount.title", { name: combatant.name ?? "" }) },
				content,
				render: (_event, dialog) => {
					const field = (dialog?.element ?? dialog)?.querySelector?.("input[name='stonetopHeadcount']");
					field?.focus?.();
					field?.select?.();
				},
				ok: {
					label: localize("stonetop.fight.headcount.confirm"),
					callback: (_event, button) => Number(button.form.elements.namedItem("stonetopHeadcount")?.value),
				},
				rejectClose: false,
			}).catch(() => null);
			if (count == null || !Number.isFinite(count)) return;
			await combatant.update({ [`flags.${SYSTEM_ID}.${COUNT_FLAG}`]: Math.max(1, Math.trunc(count)) });
		}

		// ── Header actions ──────────────────────────────────────────────────────

		static #onStartFight() {
			return globalThis.game?.stonetop?.fight?.openStart?.();
		}

		static #onAddToFight() {
			return globalThis.game?.stonetop?.fight?.openStart?.({ combat: this.viewed });
		}

		static #onLineUp() {
			return globalThis.game?.stonetop?.fight?.lineUp?.(this.viewed);
		}

		static #onPutBack() {
			return globalThis.game?.stonetop?.fight?.putBack?.(this.viewed);
		}

		static async #onToggleOverlay() {
			await setFightOverlayShown(!isFightOverlayShown());
			// Through the sidebar tab, which hands the redraw on to the window: pressed in the window,
			// `this` would redraw only itself and leave the tab's button saying the old state.
			(globalThis.ui?.combat ?? this).render({ parts: ["header"] });
		}

		static #onOpenWindow() {
			return openFightWindow({ byHand: true });
		}

		static #onOpenBook() {
			return globalThis.game?.stonetop?.fight?.openBook?.();
		}

		static async #onStopRounds() {
			const combat = this.viewed;
			if (!combat || !globalThis.game?.user?.isGM) return;
			await combat.update({ round: 0, turn: null });
		}

		static async #onEndFight() {
			const combat = this.viewed;
			const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
			if (!combat || !globalThis.game?.user?.isGM || !DialogV2) return;
			const content = document.createElement("div");
			content.innerHTML = `<p>${escHtml(localize("stonetop.fight.end.body"))}</p>`;
			// Buttons that name what they do, the affirmative first (on the left).
			const confirmed = await DialogV2.confirm({
				classes: themedDialogClasses(),
				window: { title: localize("stonetop.fight.end.title") },
				content,
				yes: { label: localize("stonetop.fight.end.confirm"), icon: "fa-solid fa-flag" },
				no: { label: localize("stonetop.fight.end.cancel") },
				rejectClose: false,
			}).catch(() => false);
			if (confirmed) await combat.delete();
		}
	};
}

