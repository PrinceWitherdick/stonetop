export class PlaybookPickerDialog extends Application {
	constructor(onPick, options = {}) {
		super(options);
		this._onPick   = onPick;
		this._playbooks = [];
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-playbook-picker",
			template:  "modules/stonetop/templates/dialogs/playbook-picker.hbs",
			title:     game.i18n.localize("stonetop.newCharacter.pickerTitle"),
			width:     640,
			height:    "auto",
			resizable: false,
			classes:   ["stonetop", "stonetop-playbook-picker"],
		});
	}

	async getData() {
		if (!this._playbooks.length) {
			const pack = game.packs.get("stonetop.playbooks");
			if (pack) {
				const docs = await pack.getDocuments();
				this._playbooks = docs
					.filter(d => d.type === "playbook")
					.sort((a, b) => a.name.localeCompare(b.name))
					.map(d => ({
						uuid: d.uuid,
						name: d.name,
						img:  d.img,
						slug: d.system?.slug ?? "",
					}));
			}
		}
		return { playbooks: this._playbooks };
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find(".stonetop-playbook-picker-card").on("click", async ev => {
			const { uuid } = ev.currentTarget.dataset;
			if (!uuid) return;
			const doc = await fromUuid(uuid);
			if (!doc) return;
			await this._onPick(doc);
			this.close();
		});
	}
}
