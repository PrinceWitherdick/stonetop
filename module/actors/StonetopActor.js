import {StonetopCharacter} from "./character/StonetopCharacter.js";
import {StonetopSteading} from "./steading/StonetopSteading.js";
import {CharacterLedger} from "./character/CharacterLedger.js";
import {SteadingLedger} from "./steading/SteadingLedger.js";
import {STAT_CHAT_LABELS, STEADING_STAT_CHAT_LABELS, postStatChangesToChat} from "../utils/chat.js";

export function createStonetopActorClass(BaseActor) {
	return class StonetopActor extends BaseActor {
		_typedActor;

		/**
		 * Reskin Foundry's Create Actor dialog and drop the steading type from its picker.
		 *
		 * - Title/button: core reads "Create Actor"; we reword both to "Create an Actor".
		 * - Skin: tag the window with `.stonetop-themed` so the scoped core-window CSS
		 *   (see window-theme.js / stonetop.css) applies. `classes` is concatenated with
		 *   DialogV2's defaults, so this adds the class without dropping "dialog".
		 * - Types: the steading ("stonetop") is a world singleton — auto-created on ready
		 *   and blocked from a second instance in preCreateActor (StonetopSingleton.js) —
		 *   so offering it in the dropdown is a dead end that only ever warns. Callers
		 *   passing an explicit `types` restriction (internal tooling) keep their list.
		 * @override
		 */
		static async createDialog(data = {}, createOptions = {}, options = {}, renderOptions = {}) {
			const title = game.i18n.localize("stonetop.actorCreate.title");
			options = {
				...options,
				classes: [...(options.classes ?? []), "stonetop-themed"],
				window: { ...(options.window ?? {}), title },
				ok: { ...(options.ok ?? {}), label: title },
			};
			if (!options.types) {
				// Monsters are GM content: players (who get Create-Actor on fresh worlds) only ever
				// make their own character, so keep Monster out of a non-GM's picker too.
				options.types = this.TYPES.filter(t =>
					t !== "stonetop"
					&& t !== CONST.BASE_DOCUMENT_TYPE
					&& (game.user?.isGM || t !== "monster"));
			}
			return super.createDialog(data, createOptions, options, renderOptions);
		}

		get typedActor() {
			if (this._typedActor) return this._typedActor;

			const customType = this.system?.customType;
			switch (customType || this.type) {
				case "character":
					this._typedActor = StonetopCharacter.create(this);
					break;
				case "stonetop":
					this._typedActor = new StonetopSteading(this);
					break;
			}

			return this._typedActor;
		}

		// Backward-compat: world actors created with the PBTA module used
		// type="other" with system.customType="stonetop" for the steading.
		// The sheet registry looks up by type, so intercept _getSheetClass
		// to return the steading sheet for these legacy actors.
		_getSheetClass() {
			if (this.system?.customType === "stonetop") {
				const cls = CONFIG.Actor.sheetClasses?.stonetop?.["stonetop.StonetopSteadingSheet"]?.cls;
				if (cls) return cls;
			}
			return super._getSheetClass();
		}

		async _preUpdate(changed, options, user) {
			const result = await super._preUpdate(changed, options, user);
			if (!options?.stonetopLedger) {
				if (this.type === "character") {
					options.stonetopLedgerEntries = this._tagLedgerMove(await CharacterLedger.entriesForActorUpdate(this, changed), options);
					options.stonetopStatChanges = this._collectStatChanges(changed, STAT_CHAT_LABELS);
				} else if (this.type === "stonetop" || this.system?.customType === "stonetop") {
					options.stonetopLedgerEntries = this._tagLedgerMove(SteadingLedger.entriesForActorUpdate(this, changed), options);
					options.stonetopStatChanges = this._collectStatChanges(changed, STEADING_STAT_CHAT_LABELS);
				}
			}
			return result;
		}

		/**
		 * Attribute ledger entries to the move that caused them. When an update is the
		 * automated effect of a move (the caller passes `options.stonetopMove`), stamp
		 * each generated entry with that move's name so the ledger can show "via <move>".
		 */
		_tagLedgerMove(entries, options) {
			const moveName = options?.stonetopMove;
			if (moveName) for (const entry of entries) entry.move = moveName;
			return entries;
		}

		/**
		 * Diff the incoming update against current values for the watched stats.
		 * @param {object} changed  The incoming update (nested or dot-path shape).
		 * @param {Record<string,string>} labels  Stat path → chat label map for this actor type.
		 */
		_collectStatChanges(changed, labels) {
			// Most updates (HP, XP, debilities, flags…) never touch the watched stats,
			// so skip the flatten unless this one could. Covers both update shapes:
			// nested ({system:{stats}}) and dot-path ({"system.stats.str.value"}).
			const groups = [...new Set(Object.keys(labels).map(p => p.split(".").slice(0, 2).join(".")))];
			const couldTouchStats = groups.some(group =>
				foundry.utils.getProperty(changed, group) !== undefined
				|| Object.keys(changed).some(k => k.startsWith(`${group}.`)));
			if (!couldTouchStats) return [];

			const flat = foundry.utils.flattenObject(changed);
			const changes = [];
			for (const [path, label] of Object.entries(labels)) {
				if (!(path in flat)) continue;
				const oldValue = foundry.utils.getProperty(this, path);
				const newValue = flat[path];
				if (oldValue !== newValue) changes.push({ label, oldValue, newValue });
			}
			return changes;
		}

		async _onUpdate(changed, options, userId) {
			await super._onUpdate(changed, options, userId);
			if (options?.stonetopLedger) return;
			// _onUpdate fires on EVERY connected client. The follow-up writes below
			// (ledger append) and the chat posts must run exactly once, on the client
			// of the user who made the change — that user holds the permission to write
			// back. Running on other clients duplicates the ledger entry and throws a
			// "lacks permission to update Actor" error for anyone who doesn't own it.
			if (userId !== globalThis.game?.user?.id) return;
			if (this.type === "character") {
				await CharacterLedger.append(this, options.stonetopLedgerEntries ?? [], { userId });
			} else if (this.type === "stonetop" || this.system?.customType === "stonetop") {
				await SteadingLedger.append(this, options.stonetopLedgerEntries ?? [], { userId });
			} else {
				return;
			}
			postStatChangesToChat(this, options.stonetopStatChanges ?? []);
		}

		async _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
			await super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
			// Runs on every client; only the author writes back (ledger append + the
			// playbook HP/damage/starting-moves init in the typed actor). Other clients
			// would duplicate the ledger and hit a permission error on a foreign actor.
			if (userId !== globalThis.game?.user?.id) return;
			if (this.typedActor?.type === "character" && collection === "items") {
				await Promise.all([
					CharacterLedger.append(this, CharacterLedger.entriesForCreatedItems(documents), { userId }),
					this.typedActor._onCreateDescendantDocuments(documents),
				]);
			}
		}

		async _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
			await super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
			// Only the author appends to the ledger; other clients lack permission on a
			// foreign actor and would duplicate the entry.
			if (userId !== globalThis.game?.user?.id) return;
			if (this.type === "character" && collection === "items") {
				await CharacterLedger.append(this, CharacterLedger.entriesForDeletedItems(documents), { userId });
			}
		}
	};
}
