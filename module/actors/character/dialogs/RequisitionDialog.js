import { StonetopDialog } from "../../../utils/stonetop-dialog.js";
import { rollStat, sign } from "../../../utils/roll-engine.js";
import { StonetopSteading, HERD_ASSET_BEAST, HERD_ASSET_NAME, isHerdAsset } from "../../steading/StonetopSteading.js";
import { askHorsesFromHerd, herdHorsesLabel } from "../../steading/herd-requisition.js";
import { assetLabel, beastFollowerForAsset, followerInputFromBeast } from "../../../data/beasts.js";
import { buildCustomFollower, nextFollowerOrder } from "../../../data/follower-build.js";
import { bringDialogToFront } from "../../../utils/front-on-open.js";
import { escHtml, joinNames } from "../../../utils/strings.js";
import { CUSTOM_ASSET_VALUE, assetTakenLabel, wireCustomAssetSelect } from "../../../utils/requisition-asset.js";
import { SYSTEM_ID } from "../../../system-id.js";
import { promptRoll } from "../../../dialogs/RollDialog.js";
import { STEADING_MOVE, improvementQuestions } from "../../steading/improvement-rolls.js";
import { settleSteadingRoll } from "../../steading/steading-roll.js";
import { askedAdvantageAnswers, herdCountAnswer } from "../../steading/improvement-rolls.js";
import { ownLogisticsNames } from "../logistics.js";

/**
 * The player-facing Requisition move. Lists the linked steading's on-hand assets
 * and lets the character roll +Fortunes and "take" one for an expedition. Taking
 * an asset adds it to the character's items list and marks it out (unchecked, with
 * a "taken by" note) on the steading's Assets list. Returning it is done from the
 * steading sheet by clicking the greyed-out asset.
 */
export class RequisitionDialog extends StonetopDialog {
	/**
	 * @param {object} stonetopCharacter - StonetopCharacter wrapper (for inventory writes)
	 * @param {Actor}  characterActor     - The character Actor document (for name/id)
	 * @param {Actor}  steadingActor      - The linked steading Actor document
	 * @param {Function} [onChange]       - Called after a successful take, to refresh sheets
	 */
	constructor(stonetopCharacter, characterActor, steadingActor, onChange, options = {}) {
		super(options);
		this._character = stonetopCharacter;
		this._characterActor = characterActor;
		this._steadingActor = steadingActor;
		this._steading = new StonetopSteading(steadingActor);
		this._onChange = onChange;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-requisition",
			title: "Requisition",
			template: "systems/stonetop_pwd/templates/dialogs/requisition-picker.hbs",
			width: 540,
			height: "auto",
			resizable: true,
			classes: ["stonetop", "stonetop-requisition"],
		});
	}

	getData() {
		const assets = this._steading._flags.assets ?? [];
		// Worded where the steading's own Requisition words them. Logistics is asked for THIS
		// character only, and ticked: this window knows who is Requisitioning.
		const herdBuilt = this._steading.improvementCompleted("herdOfHorses");
		const questions = improvementQuestions(STEADING_MOVE.REQUISITION, "fortunes", {
			rules: this._steading.improvementRules(),
			logistics: ownLogisticsNames(this._characterActor),
			herd: herdBuilt ? this._steading.getHerd() : null,
		});
		const herdAsk = questions.find(q => q.name === "herdCount");
		return {
			steadingName: this._steadingActor.name,
			fortunes: sign(this._steading.getStatValue("fortunes")),
			assets: this._steading.getAvailableAssets(),
			customAssetValue: CUSTOM_ASSET_VALUE,
			// The Herd of Horses question: how many horses, read against the herd for its "half the
			// herd or less" and offered again as the take's default.
			herdQuestion: herdAsk ? { label: herdAsk.label, max: herdAsk.max ?? 0 } : null,
			// The Marshal's Logistics: advantage when you Requisition.
			logistics: questions.find(q => q.name === "logistics")?.label ?? "",
			// An improvement's asked advantage on Requisition (a `rollAdvantage` grant with an `ask`),
			// unticked: the table says whether the fiction reached for it.
			advantageAsks: questions.filter(q => q.name.startsWith("advantage-")).map(({ name, label }) => ({ name, label })),
			// "Already out" reads through the shared wording, so an asset a GM sent out on an
			// expedition names the trip here rather than reporting "Taken by someone".
			takenAssets: assets
				.filter(asset => asset.name && asset.takenBy)
				.map(asset => ({ name: asset.name, where: assetTakenLabel(asset) })),
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];
		const assetSelect = root.querySelector(".stonetop-requisition-asset-select");
		const customInput = root.querySelector(".stonetop-requisition-custom-input");
		const takeButton = root.querySelector(".stonetop-requisition-take");

		wireCustomAssetSelect({ select: assetSelect, customInput });

		// How this one is rolled is asked here, ahead of the roll — see RollDialog.js, which
		// decides for itself whether it has anything to ask. Cancelling rolls nothing. When it
		// does not ask for a mode the steading sheet's own sticky Roll Modifier flag answers
		// instead, which is what that control is still there for. Settled as every steading roll
		// is (actors/steading/steading-roll.js): a held +Fortunes advantage is spent here too, by
		// a player who can write the steading.
		root.querySelector(".stonetop-requisition-roll-btn")?.addEventListener("click", async ev => {
			const prompted = await promptRoll({ title: "Requisition", shiftKey: ev.shiftKey });
			if (!prompted) return;
			const terms = await settleSteadingRoll(this._steading, {
				moveName: STEADING_MOVE.REQUISITION, statKey: "fortunes",
				chosenMode: prompted.rollMode ?? this._steadingActor.getFlag(SYSTEM_ID, "rollMode"),
				answers: this._rollAnswers(root),
				canSpend: !!this._steadingActor.isOwner,
			});
			await terms.spend();
			await rollStat("fortunes", this._steadingActor, {
				...(terms.missAsPartial ? { missCountsAsPartial: terms.missAsPartial } : {}),
				...(terms.conditionNotes.length ? { conditionNotes: terms.conditionNotes } : {}),
				moveName: "Requisition",
				statValue: this._steading.getStatValue("fortunes"),
				rollMode: terms.rollMode,
				// The steading rolls carry no forward/ongoing, so the prompt's one-off IS the
				// whole modifier here — the engine reads it back out as the Situational pill.
				modifier: prompted.situational,
			});
		});

		takeButton?.addEventListener("click", async () => {
			if (takeButton.disabled) return;
			const choice = this._getChosenAsset(root);
			if (!choice.name) {
				ui.notifications.warn("Choose or enter an asset to requisition.");
				return;
			}
			takeButton.disabled = true;

			// The herd is not lent out whole: so many horses leave it (askHorsesFromHerd).
			if (choice.asset && isHerdAsset(choice.asset)) {
				try {
					await this._takeFromHerd(root);
				} finally {
					takeButton.disabled = false;
				}
				return;
			}

			try {
				await this._character.addCustomInventoryItem(choice.name, 1);
			} catch (err) {
				// Re-enable the button (there's no re-render on this path) so a transient
				// document-write failure doesn't strand the dialog until it's reopened.
				console.warn("Stonetop | Could not add requisitioned asset to items:", err);
				ui.notifications.warn(`Could not add ${choice.name} to your items.`);
				takeButton.disabled = false;
				return;
			}
			this._maybeOfferAsFollower(choice.asset ?? choice.name);

			if (Number.isInteger(choice.index)) {
				try {
					await this._steading.setAssetTaken(choice.index, {
						name: this._characterActor.name,
						id: this._characterActor.id,
					});
					ui.notifications.info(`${choice.name} requisitioned from ${this._steadingActor.name}.`);
				} catch (err) {
					console.warn("Stonetop | Could not mark asset taken on steading:", err);
					ui.notifications.warn(
						`${choice.name} added to your items, but you lack permission to update ${this._steadingActor.name}'s assets.`
					);
				}
			} else {
				ui.notifications.info(`${choice.name} added to your items.`);
			}

			this._onChange?.();
			this.render(false);
		});

		root.querySelector(".stonetop-requisition-close")?.addEventListener("click", () => this.close());
	}

	/** The window's questions, as settleSteadingRoll reads them. */
	_rollAnswers(root) {
		return {
			herdCount: herdCountAnswer(root),
			logistics: !!root.querySelector('[name="logistics"]')?.checked,
			...askedAdvantageAnswers(root),
		};
	}

	/**
	 * Requisition from the Herd of Horses: ask how many, take them out of the tracked herd, and
	 * make each one a follower (ruling: "Ask, take from herd"). The herd's own row is never marked
	 * out: the herd stays home. Nothing is written when the answer is none.
	 * @returns {Promise<boolean>} whether any horses were taken
	 */
	async _takeFromHerd(root) {
		const count = await askHorsesFromHerd({
			cap: this._steading.herdRequisitionCap(),
			preset: herdCountAnswer(root),
			who: this._characterActor.name,
		});
		if (!count) return false;
		let taken;
		try {
			taken = await this._steading.requisitionFromHerd(count, { stonetopMove: "Requisition" });
		} catch (err) {
			console.warn("Stonetop | Could not take horses from the herd:", err);
			ui.notifications.warn(`You lack permission to update ${this._steadingActor.name}'s herd.`);
			return false;
		}
		if (!taken) return false;
		const label = herdHorsesLabel(taken);
		try {
			await this._character.addCustomInventoryItem(label, 1);
		} catch (err) {
			console.warn("Stonetop | Could not add requisitioned horses to items:", err);
		}
		const match = beastFollowerForAsset({ name: HERD_ASSET_NAME, beast: HERD_ASSET_BEAST });
		if (match) await this._addRequisitionedFollower({ ...match, count: taken }, "the herd of horses");
		ui.notifications.info(`${label} requisitioned from ${this._steadingActor.name}.`);
		this._onChange?.();
		this.render(false);
		return true;
	}

	_getChosenAsset(root) {
		const select = root.querySelector(".stonetop-requisition-asset-select");
		if (!select) return { name: "" };
		if (select.value === CUSTOM_ASSET_VALUE) {
			return {
				name: root.querySelector(".stonetop-requisition-custom-input")?.value?.trim() ?? "",
			};
		}
		const index = Number(select.value);
		// Resolve the name from the same source the <option> list was built from
		// (getAvailableAssets, which falls back to STEADING_DEFAULTS.assets), not raw
		// _flags.assets — otherwise a default on-hand asset on an un-edited steading has
		// no _flags.assets entry and resolves to "" (headline take path silently no-ops).
		const asset = this._steading.getAvailableAssets().find(a => a.index === index);
		return { index, name: asset?.name?.trim() ?? "", asset };
	}

	// If a just-requisitioned asset names a follower-capable animal, offer to add it
	// to the character's Followers tab with the handout's stats (Book I p.474). A pure
	// convenience; declining just leaves it as the plain inventory item already added.
	// Takes the steading's asset row (whose `beast` field, when it has one, says exactly what
	// it is) or a typed custom asset's name.
	_maybeOfferAsFollower(asset) {
		const match = beastFollowerForAsset(asset);
		const assetName = typeof asset === "object" && asset ? asset.name : asset;
		if (!match) return;
		const beast = match.beast;
		const count = match.count ?? 1;
		const what  = count > 1 ? `them to your <strong>Followers</strong> tab as ${count} followers` : `it to your <strong>Followers</strong> tab as a follower`;
		new Dialog({
			title:   count > 1 ? "Add as followers?" : "Add as a follower?",
			content: `<p>You requisitioned <strong>${escHtml(assetName)}</strong>. Also add ${what} (<em>${escHtml(beast.name)}</em> - HP ${beast.hp}${count > 1 ? " each" : ""}, Cost ${escHtml(beast.cost)})?</p>`,
			buttons: {
				yes: { icon: '<i class="fas fa-dog"></i>', label: count > 1 ? `Add ${count} followers` : "Add as follower",
					callback: () => this._addRequisitionedFollower(match, assetName) },
				no:  { label: "No, just the item" },
			},
			default: "yes",
			render:  bringDialogToFront,
			options: { classes: ["dialog", "stonetop"] },
		}).render(true);
	}

	async _addRequisitionedFollower(match, assetName) {
		const input = followerInputFromBeast(match.beast, { name: match.beast.name, chosenTraits: match.chosenTraits });
		if (!input) return;
		const existing = this._characterActor.getFlag(SYSTEM_ID, "customFollowers") ?? {};
		// Keep the beast's own note (a tag choice still open) beside where it came from.
		// Name the asset only: the seeded line trails a stat block after a dash ("A pair of
		// hardy draft horses - HP 10 each; ...") that the follower card already shows.
		const notes = [`Requisitioned from ${assetLabel(assetName)}.`, input.notes].filter(Boolean).join(" ");
		// One card per animal ("a pair" is two horses), numbered so they can be told apart,
		// all in one write and in order after the followers already on the tab.
		const count = match.count ?? 1;
		const order = nextFollowerOrder(existing);
		const names  = Array.from({ length: count }, (_, i) => count > 1 ? `${input.name} ${i + 1}` : input.name);
		const update = {};
		names.forEach((name, i) => {
			update[`flags.stonetop_pwd.customFollowers.${foundry.utils.randomID(16)}`] = {
				...buildCustomFollower({ ...input, name, notes }),
				order: order + i,
			};
		});
		await this._characterActor.update(update);
		ui.notifications?.info?.(`${joinNames(names)} added to your followers.`);
		this._onChange?.();
	}
}
