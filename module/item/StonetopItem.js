import {StonetopPlaybook} from "./StonetopPlaybook.js";
import {rollFormula, rollStat} from "../utils/roll-engine.js";
import {normalizeRollType} from "../utils/roll-types.js";
import {filterStatOptionLines} from "../utils/strings.js";

export function createStonetopItemClass(BaseItem) {
	return class StonetopItem extends BaseItem {

		asPlaybook() {
			return new StonetopPlaybook(this);
		}

		/**
		 * Execute this item as a move.
		 * - rollType present  → 2d6+stat via rollStat (stonetop roll card)
		 * - rollFormula only  → evaluate the raw formula and post a plain chat message
		 * - neither (or descriptionOnly) → post description to chat
		 *
		 * @param {object} options
		 * @param {boolean} [options.descriptionOnly]
		 * @param {string}  [options.rollMode]           - "adv" | "dis" | "def" | "normal"
		 * @param {string}  [options.stonetopDebility]
		 * @param {string}  [options.stonetopDebilityTooltip]
		 */
		async roll(options = {}) {
			const actor = this.parent;
			if (!actor) return;

			const rollType    = normalizeRollType(this.system?.rollType);
			const stat        = options.statOverride ?? rollType;
			const rawFormula  = this.system?.rollFormula ?? null;
			const descriptionOnly = options.descriptionOnly ?? (!stat && !rawFormula);

			if (descriptionOnly) {
				return ChatMessage.create({
					content: `<div class="stonetop-chat-move">
						<h3 class="stonetop-chat-move-name">${this.name}</h3>
						<div class="stonetop-chat-move-description">${this.system?.description ?? ""}</div>
					</div>`,
					speaker: ChatMessage.getSpeaker({ actor }),
				});
			}

			const isStatChoice = rollType === "ask" && !!options.statOverride;
			const description = this.system?.description ?? "";
			const moveDescription = isStatChoice
				? filterStatOptionLines(description, options.statOverride)
				: description;
			const moveName = isStatChoice
				? `${this.name} with ${options.statOverride.toUpperCase()}`
				: this.name;

			if (stat) return rollStat(stat, actor, { ...options, moveName, moveDescription });

			// Raw formula path — used by npcMove items
			return rollFormula(rawFormula, actor, { label: this.name, description: moveDescription });
		}
	};
}
