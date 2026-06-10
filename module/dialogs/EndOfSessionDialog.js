import { KeepOnTop } from "../utils/keep-on-top.js";
import { resetOmenReminder } from "../hooks/StonetopSingleton.js";

const GROUP_QUESTIONS = [
	{ key: "learnedWorld",       label: "Did we learn more about the world or its history?" },
	{ key: "defeatedThreat",     label: "Did we defeat a threat to Stonetop or the region?" },
	{ key: "improvedStanding",   label: "Did we improve our standing with our neighbors?" },
	{ key: "improvedStonetop",   label: "Did we make a lasting improvement to Stonetop, or tangible progress towards doing so?" },
];

export class EndOfSessionDialog extends Application {
	constructor(options = {}) {
		super(options);
		this._groupChecks = Object.fromEntries(GROUP_QUESTIONS.map(q => [q.key, false]));
		this._keepOnTop = new KeepOnTop(this);
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-end-of-session-dialog",
			template:  "systems/stonetop_pwd/templates/dialogs/end-of-session.hbs",
			title:     "End of Session",
			width:     500,
			height:    560,
			resizable: true,
			classes:   ["stonetop", "stonetop-eos-dialog"],
		});
	}

	async _render(force, options) {
		await super._render(force, options);
		this._keepOnTop.apply();
	}

	async close(options = {}) {
		this._keepOnTop.stop();
		return super.close(options);
	}

	getData() {
		const xpCount  = Object.values(this._groupChecks).filter(Boolean).length;
		const questions = GROUP_QUESTIONS.map(q => ({
			key:     q.key,
			label:   q.label,
			checked: this._groupChecks[q.key],
		}));
		return { questions, xpCount };
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._keepOnTop.start();

		html.find(".stonetop-eos-group-check").on("change", ev => {
			this._groupChecks[ev.currentTarget.dataset.key] = ev.currentTarget.checked;
			this.render(false);
		});

		html.find(".stonetop-eos-confirm-btn").on("click", async () => {
			await this._applyGroupXp();
		});
	}

	async _applyGroupXp() {
		const xpToAward = Object.values(this._groupChecks).filter(Boolean).length;
		const playerChars = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);

		if (playerChars.length > 0 && xpToAward > 0) {
			for (const actor of playerChars) {
				const current = actor.system?.attributes?.xp?.value ?? 0;
				await actor.update({ "system.attributes.xp.value": current + xpToAward });
			}

			const yeses = GROUP_QUESTIONS
				.filter(q => this._groupChecks[q.key])
				.map(q => `<li>${q.label}</li>`)
				.join("");
			const names = playerChars.map(a => `<strong>${a.name}</strong>`).join(", ");

			ChatMessage.create({
				content: `<p><strong>End of Session — Group XP (+${xpToAward})</strong></p><ul>${yeses}</ul><p>${names} each gained ${xpToAward} XP.</p>`,
			});
		}

		await resetOmenReminder();
		this.close();
	}
}
