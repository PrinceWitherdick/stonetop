import {StonetopPlaybook} from "./StonetopPlaybook.js";
import {rollFormula, rollStat} from "../utils/roll-engine.js";
import {normalizeRollType} from "../utils/roll-types.js";
import {filterStatOptionLines, escHtml} from "../utils/strings.js";

export function createStonetopItemClass(BaseItem) {
	return class StonetopItem extends BaseItem {

		/**
		 * Sidebar "Create Item". None of Stonetop's hand-authorable content is a plain Item
		 * sub-type — a custom move saves as a reusable world Move, and steading improvements
		 * and threats aren't Items at all — so instead of Foundry's Item type picker (which
		 * would only offer pack-managed types like playbook/npcMove/monsterMove) we open our
		 * own chooser: Move, Steading Improvement, or Threat, each producing a reusable,
		 * draggable artifact. Callers passing an explicit `types` restriction (internal
		 * tooling), and creates into a compendium (`pack`) — every flow above builds a
		 * WORLD item and would silently ignore the pack — fall through to the stock dialog
		 * unchanged.
		 * @override
		 */
		static async createDialog(data = {}, createOptions = {}, options = {}, renderOptions = {}) {
			if (options.types || createOptions.pack) {
				return super.createDialog(data, createOptions, options, renderOptions);
			}
			const { openCreateStonetopContent } =
				await import("../dialogs/create-stonetop-content-dialog.js");
			await openCreateStonetopContent();
			return null;
		}

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

			// Optional closing sign-off (love letters end with one, e.g. "XOXO - your GM").
			// Appended to the description in both the read-aloud and rolled paths.
			const signed  = String(this.system?.signed ?? "").trim();
			const signoff = signed ? `<p class="stonetop-move-signoff">${escHtml(signed)}</p>` : "";

			if (descriptionOnly) {
				return ChatMessage.create({
					content: `<div class="stonetop-chat-move">
						<h3 class="stonetop-chat-move-name">${escHtml(this.name)}</h3>
						<div class="stonetop-chat-move-description">${this.system?.description ?? ""}${signoff}</div>
					</div>`,
					speaker: ChatMessage.getSpeaker({ actor }),
				});
			}

			// "ask" moves (Defy Danger/Interfere) carry per-stat option lines to filter.
			const isStatChoice = rollType === "ask" && !!options.statOverride;
			// A fixed-stat move rolled with an alternate stat (e.g. Skill at Arms → Clash
			// with DEX) isn't an "ask" move but should still label the chosen stat.
			const usingAltStat = !!options.statOverride && options.statOverride !== rollType;
			const description = this.system?.description ?? "";
			const moveDescription = (isStatChoice
				? filterStatOptionLines(description, options.statOverride)
				: description) + signoff;
			const moveName = (isStatChoice || usingAltStat)
				? `${this.name} with ${options.statOverride.toUpperCase()}`
				: this.name;

			if (stat) return rollStat(stat, actor, {
				...options,
				moveName,
				moveDescription,
				moveResults: this.system?.moveResults ?? null,
				// Shared "choose from this list" pool (love letters) — rendered as a checklist,
				// with the rolled tier's moveResults.<tier>.pick saying how many to take.
				pickOptions: this.system?.pickOptions ?? [],
				// Moves that explicitly override the standard "+1 XP on a miss" (e.g. Danger
				// Sense, Hard to Kill / Death's Door rolls) set system.noXpOnMiss.
				noXpOnMiss:  this.system?.noXpOnMiss ?? false,
			});

			// Raw formula path — used by npcMove items
			return rollFormula(rawFormula, actor, { label: this.name, description: moveDescription });
		}
	};
}
