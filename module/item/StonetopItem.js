import {StonetopPlaybook} from "./StonetopPlaybook.js";
import {rollStat} from "../utils/roll-engine.js";

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

			const stat        = this.system?.rollType    ?? null;
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

			if (stat) return rollStat(stat, actor, { ...options, moveName: this.name });

			// Raw formula path — used by npcMove items
			const roll = await new Roll(rawFormula).evaluate();
			return roll.toMessage({
				speaker:  ChatMessage.getSpeaker({ actor }),
				flavor:   `<strong>${this.name}</strong>`,
				rollMode: game.settings.get("core", "rollMode"),
			});
		}
	};
}
