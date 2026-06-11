import {StonetopCharacter} from "./character/StonetopCharacter.js";
import {StonetopSteading} from "./steading/StonetopSteading.js";
import {CharacterLedger} from "./character/CharacterLedger.js";
import {SteadingLedger} from "./steading/SteadingLedger.js";
import {STAT_CHAT_LABELS, postStatChangesToChat} from "../utils/chat.js";

export function createStonetopActorClass(BaseActor) {
	return class StonetopActor extends BaseActor {
		_typedActor;

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
					options.stonetopLedgerEntries = await CharacterLedger.entriesForActorUpdate(this, changed);
					options.stonetopStatChanges = this._collectStatChanges(changed);
				} else if (this.type === "stonetop" || this.system?.customType === "stonetop") {
					options.stonetopLedgerEntries = SteadingLedger.entriesForActorUpdate(this, changed);
				}
			}
			return result;
		}

		/** Diff the incoming update against current values for the six core stats. */
		_collectStatChanges(changed) {
			// Most updates (HP, XP, debilities, flags…) never touch the core stats, so
			// skip the flatten unless this one could. Covers both update shapes: nested
			// ({system:{stats}}) and dot-path ({"system.stats.str.value"}).
			const couldTouchStats = changed?.system?.stats !== undefined
				|| Object.keys(changed).some(k => k.startsWith("system.stats."));
			if (!couldTouchStats) return [];

			const flat = foundry.utils.flattenObject(changed);
			const changes = [];
			for (const [path, label] of Object.entries(STAT_CHAT_LABELS)) {
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
			if (this.type === "character") {
				await CharacterLedger.append(this, options.stonetopLedgerEntries ?? [], { userId });
				// Only the user who made the change posts, so the card isn't duplicated per client.
				if (userId === globalThis.game?.user?.id) {
					postStatChangesToChat(this, options.stonetopStatChanges ?? []);
				}
			} else if (this.type === "stonetop" || this.system?.customType === "stonetop") {
				await SteadingLedger.append(this, options.stonetopLedgerEntries ?? [], { userId });
			}
		}

		async _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
			await super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
			if (this.typedActor?.type === "character" && collection === "items") {
				await Promise.all([
					CharacterLedger.append(this, CharacterLedger.entriesForCreatedItems(documents), { userId }),
					this.typedActor._onCreateDescendantDocuments(documents),
				]);
			}
		}

		async _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
			await super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
			if (this.type === "character" && collection === "items") {
				await CharacterLedger.append(this, CharacterLedger.entriesForDeletedItems(documents), { userId });
			}
		}
	};
}
