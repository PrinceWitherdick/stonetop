import {StonetopCharacter} from "./character/StonetopCharacter.js";
import {StonetopSteading} from "./steading/StonetopSteading.js";
import {promptRollMode} from "../utils/rolls.js";

export function createStonetopActorClass(BaseActor) {
	return class StonetopActor extends BaseActor {
		_typedActor;

		constructor(...args) {
			super(...args);
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

		// PBTA converts custom actor types to type="other" with system.customType="stonetop".
		// Foundry's sheet registry lookup uses `type`, so registering for "stonetop" never
		// matches. Override here to intercept and return the steading sheet directly.
		_getSheetClass() {
			if (this.system?.customType === "stonetop") {
				const SteadingSheet = game.modules.get("stonetop")?._steadingSheetClass;
				if (SteadingSheet) return SteadingSheet;
			}
			return super._getSheetClass();
		}


		// -- Lifecycle ---------------------------------------------
		// Method names can not change, they are called by pbta system
		async _onRoll(event) {
			if (this.type === "character") {
				const handled = await this.typedActor.onRoll(event);
				if (handled) return;
			}
			return super._onRoll(event);
		}

		async _onRollStat(stat, label, options = {}) {
			const rollMode = await promptRollMode();
			options = { ...options, rollMode };
			if (this.type === "character") {
				options = this.typedActor.applyDebilityRollMode(stat, options);
			}
			return super._onRollStat(stat, label, options);
		}

		async _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
			await super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
			if (this.typedActor.type === "character" && collection === "items") {
				await this.typedActor._onCreateDescendantDocuments(documents);
			}
		}
	};
}
