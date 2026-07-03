import { FrontOnOpen } from "../../../utils/front-on-open.js";
import { rollStat, sign } from "../../../utils/roll-engine.js";
import { StonetopSteading } from "../../steading/StonetopSteading.js";
import { beastFollowerForAsset, followerInputFromBeast } from "../../../data/beasts.js";
import { buildCustomFollower, nextFollowerOrder } from "../../../data/follower-build.js";
import { bringDialogToFront } from "../../../utils/front-on-open.js";
import { escHtml } from "../../../utils/strings.js";
import { CUSTOM_ASSET_VALUE, wireCustomAssetSelect } from "../../../utils/requisition-asset.js";

/**
 * The player-facing Requisition move. Lists the linked steading's on-hand assets
 * and lets the character roll +Fortunes and "take" one for an expedition. Taking
 * an asset adds it to the character's items list and marks it out (unchecked, with
 * a "taken by" note) on the steading's Assets list. Returning it is done from the
 * steading sheet by clicking the greyed-out asset.
 */
export class RequisitionDialog extends Application {
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
		this._frontOnOpen = new FrontOnOpen(this);
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

	async _render(force, options) {
		await super._render(force, options);
		this._frontOnOpen.apply();
	}

	async close(options = {}) {
		this._frontOnOpen.stop();
		return super.close(options);
	}

	getData() {
		const assets = this._steading._flags.assets ?? [];
		return {
			steadingName: this._steadingActor.name,
			fortunes: sign(this._steading.getStatValue("fortunes")),
			assets: this._steading.getAvailableAssets(),
			customAssetValue: CUSTOM_ASSET_VALUE,
			takenAssets: assets
				.filter(asset => asset.name && asset.takenBy)
				.map(asset => ({ name: asset.name, takenByName: asset.takenBy?.name ?? "someone" })),
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._frontOnOpen.start();
		const root = html[0];
		const assetSelect = root.querySelector(".stonetop-requisition-asset-select");
		const customInput = root.querySelector(".stonetop-requisition-custom-input");
		const takeButton = root.querySelector(".stonetop-requisition-take");

		wireCustomAssetSelect({ select: assetSelect, customInput });

		root.querySelector(".stonetop-requisition-roll-btn")?.addEventListener("click", () => {
			const rollMode = this._steadingActor.getFlag("stonetop_pwd", "rollMode") ?? "normal";
			rollStat("fortunes", this._steadingActor, {
				moveName: "Requisition",
				statValue: this._steading.getStatValue("fortunes"),
				rollMode,
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

			await this._character.addCustomInventoryItem(choice.name, 1);
			this._maybeOfferAsFollower(choice.name);

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

	_getChosenAsset(root) {
		const select = root.querySelector(".stonetop-requisition-asset-select");
		if (!select) return { name: "" };
		if (select.value === CUSTOM_ASSET_VALUE) {
			return {
				name: root.querySelector(".stonetop-requisition-custom-input")?.value?.trim() ?? "",
			};
		}
		const index = Number(select.value);
		const name = this._steading._flags.assets?.[index]?.name?.trim() ?? "";
		return { index, name };
	}

	// If a just-requisitioned asset names a follower-capable animal, offer to add it
	// to the character's Followers tab with the handout's stats (Book I p.474). A pure
	// convenience; declining just leaves it as the plain inventory item already added.
	_maybeOfferAsFollower(assetName) {
		const match = beastFollowerForAsset(assetName);
		if (!match) return;
		const beast = match.beast;
		new Dialog({
			title:   "Add as a follower?",
			content: `<p>You requisitioned <strong>${escHtml(assetName)}</strong>. Also add ${beast.follower ? "it" : "them"} to your <strong>Followers</strong> tab as a follower (<em>${escHtml(beast.name)}</em> - HP ${beast.hp}, Cost ${escHtml(beast.cost)})?</p>`,
			buttons: {
				yes: { icon: '<i class="fas fa-dog"></i>', label: "Add as follower",
					callback: () => this._addRequisitionedFollower(match, assetName) },
				no:  { label: "No, just the item" },
			},
			default: "yes",
			render:  bringDialogToFront,
			options: { classes: ["dialog", "stonetop"] },
		}).render(true);
	}

	async _addRequisitionedFollower(match, assetName) {
		const input = followerInputFromBeast(match.beast, { name: match.beast.name });
		if (!input) return;
		const existing = this._characterActor.getFlag("stonetop_pwd", "customFollowers") ?? {};
		const id = foundry.utils.randomID(16);
		await this._characterActor.update({
			[`flags.stonetop_pwd.customFollowers.${id}`]: {
				...buildCustomFollower({ ...input, notes: `Requisitioned from ${assetName}.` }),
				order: nextFollowerOrder(existing),
			},
		});
		ui.notifications?.info?.(`${input.name} added to your followers.`);
		this._onChange?.();
	}
}
