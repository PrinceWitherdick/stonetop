import { StonetopDialog } from "../utils/stonetop-dialog.js";
import { openOrFocus } from "../utils/open-or-focus.js";
import { SYSTEM_ID, RENAME_TARGET_ID } from "../system-id.js";
import { preflight } from "./flip.js";
import { allTargets, previewMigration, prepareWorld, flipAndShutDown } from "./run.js";

// ── MigrationAssistant ───────────────────────────────────────────────────────
// The one-button GM tool that moves this world onto the renamed system.
//
// It is deliberately one irreversible action rather than a wizard: phase 1
// (copying data into the new namespace) leaves the world completely usable on the
// old system, so a "stop halfway" state is meaningless, and offering one only
// invites a GM to sit in it. Everything that could strand a world is checked
// before the button is enabled — above all, that the renamed system is actually
// installed, because a world pointed at a missing system cannot be repaired from
// inside Foundry.
//
// The action is behind a confirm step all the same. This window opens by itself on
// every load until the world is migrated, so the button sits under the cursor of a GM
// who came here to do something else; a wizard would be a state machine, a confirm is
// one more click.

const STATE = { CHECKING: "checking", BLOCKED: "blocked", READY: "ready", CONFIRMING: "confirming", RUNNING: "running", FAILED: "failed" };

export class MigrationAssistant extends StonetopDialog {
	constructor(options = {}) {
		super(options);
		this._migrationState = STATE.CHECKING;
		this._gate = null;
		this._preview = null;
		this._targets = null;
		this._progress = null;
		this._error = null;
	}

	static open() {
		return openOrFocus("stonetop-migration-assistant", () => new MigrationAssistant().render(true));
	}

	// The panel swaps between preflight, progress and failure content of very different
	// heights, so the window re-fits itself after each render.
	get _autoHeight() { return true; }

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-migration-assistant",
			title:     "Stonetop is changing its ID",
			template:  `systems/${SYSTEM_ID}/templates/dialogs/migration-assistant.hbs`,
			width:     620,
			height:    "auto",
			resizable: true,
			classes:   ["stonetop", "stonetop-migration-assistant"],
		});
	}

	async getData() {
		if (this._migrationState === STATE.CHECKING) await this._check();
		const isReady = this._migrationState === STATE.READY || this._migrationState === STATE.CONFIRMING;
		return {
			isBlocked: this._migrationState === STATE.BLOCKED,
			isReady,
			isConfirming: this._migrationState === STATE.CONFIRMING,
			isRunning: this._migrationState === STATE.RUNNING,
			isFailed:  this._migrationState === STATE.FAILED,
			canRecheck: this._migrationState === STATE.BLOCKED || this._migrationState === STATE.FAILED,
			blockers:  this._gate?.blockers ?? [],
			warnings:  this._gate?.warnings ?? [],
			preview:   this._preview,
			progress:  this._progress,
			error:     this._error,
			oldId:     SYSTEM_ID,
			newId:     RENAME_TARGET_ID,
		};
	}

	// The scan loads every document of every unlocked world compendium, so it happens once
	// here and the preview reads that list rather than building a second one. The RUN is
	// not given it: this window can sit open for a whole session, and a target list is a
	// snapshot — anything created since the check would be quietly left behind.
	async _check() {
		try {
			this._gate = await preflight(game);
			if (!this._gate.ok) {
				this._targets = null;
				this._preview = null;
				this._migrationState = STATE.BLOCKED;
				return;
			}
			this._targets = await allTargets(game);
			this._preview = await previewMigration(game, { targets: this._targets });
			this._migrationState = STATE.READY;
		} catch (err) {
			// A world pack that will not load, most likely. Land in FAILED rather than
			// rejecting the render, which would leave an empty window and no way back.
			console.error("Stonetop | system-id migration preflight failed", err);
			this._error = this._survivable(`This world could not be checked: ${err?.message ?? err}`);
			this._migrationState = STATE.FAILED;
		}
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0] ?? html;
		const on = (action, handler) => root.querySelector(`[data-action='${action}']`)?.addEventListener("click", handler);

		// Re-check on the way to the confirm step, so the numbers the GM is asked to commit
		// to are current. The counts shown by _check() are a snapshot, and this window can
		// sit open for a whole session while the world changes underneath it — a stale
		// "0 documents to copy" reads as "this will do nothing" when it will not.
		on("migrate", async () => {
			this._migrationState = STATE.CHECKING;
			await this._check();
			if (this._migrationState === STATE.READY) this._migrationState = STATE.CONFIRMING;
			this.render(false);
		});
		on("confirm", () => this._migrate());
		on("cancel",  () => { this._migrationState = STATE.READY; this.render(false); });
		on("dismiss", () => this.close());
		on("recheck", () => {
			this._migrationState = STATE.CHECKING;
			this._error = null;
			this.render(false);
		});
	}

	/** Show a failure and stop. Every unhappy exit from _migrate lands here. */
	_fail(message) {
		this._migrationState = STATE.FAILED;
		this._error = message;
		return this.render(false);
	}

	/** A failure the world survives intact — nothing is deleted before the flip. */
	_survivable(reason) {
		return `${reason} (nothing was lost — this world still runs on ${SYSTEM_ID}.)`;
	}

	/**
	 * A failure AFTER world.json was already re-pointed. Only the confirming read failed,
	 * so the migration itself landed — and the session is now in the one state flip.js
	 * says must never continue: game.world on the new system, game.system and the loaded
	 * packs still on the old one. Never describe this as survivable.
	 */
	_flipped(reason) {
		return `${reason} This world has ALREADY been moved to ${RENAME_TARGET_ID}. Only the confirmation step failed. Do not keep playing: close Foundry, start it again, and launch the world.`;
	}

	async _migrate() {
		// Re-check immediately before the irreversible step. The preflight in _check() may
		// be a whole session old by now: this window sits open until acted on, and a player
		// sitting on the /join screen is not `active`, so they can arrive in the gap. The
		// flip is a one-way door, so it is worth paying for the check twice.
		const gate = await preflight(game);
		if (!gate.ok) {
			this._gate = gate;
			this._migrationState = STATE.BLOCKED;
			return this.render(false);
		}

		this._migrationState = STATE.RUNNING;
		this._progress = { label: "Starting", index: 0, total: 0 };
		await this.render(false);

		// Throttled by the base class, which also drains the trailing tick — so the panel
		// cannot come to rest one update short of where the run actually got to.
		const onProgress = (p) => {
			this._progress = p;
			this.renderThrottled();
		};

		try {
			await prepareWorld(game, { onProgress });
			const result = await flipAndShutDown(game, { onProgress });
			// On success Foundry navigates away. Otherwise the stage says whether the flip
			// had already landed: "verify" is reached only after world.json was rewritten.
			if (!result.ok) {
				return this._fail(result.stage === "verify" ? this._flipped(result.error) : this._survivable(result.error));
			}
			if (result.warning) return this._fail(result.warning);
		} catch (err) {
			console.error("Stonetop | system id migration failed", err);
			return this._fail(this._survivable(err?.message ?? err));
		}
	}
}
