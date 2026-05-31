import { SettingOverviewDialog } from "../../../dialogs/SettingOverviewDialog.js";

const PLAYBOOK_DESCRIPTIONS = {
	"the-blessed":       { complexity: "Medium",       desc: "Nature priest. Speaks to spirits and beasts. Works subtle magics via sacred markings and materials." },
	"the-fox":           { complexity: "Low",          desc: "Clever, quick, and skillful. Not above bending the rules or fighting dirty. Can be quite the charmer, too." },
	"the-heavy":         { complexity: "Low / Medium", desc: "Not just a violent individual—our violent individual. A champion, yes, but a bit of a liability, too." },
	"the-judge":         { complexity: "Low",          desc: "Settler of disputes, chronicler, and divine bulwark against chaos. Insightful, tough, not necessarily persuasive." },
	"the-lightbearer":   { complexity: "High",         desc: "Invokes divine power via flame and candle. Beacon of hope, charity, and mercy. Fiery foe of the dark." },
	"the-marshal":       { complexity: "High",         desc: "Leads the town's militia, plus a crew of followers. Makes choices about who lives and who dies." },
	"the-ranger":        { complexity: "Low",          desc: "At home in the wild, the one you want with you when you travel. A resourceful guide and deadly hunter." },
	"the-seeker":        { complexity: "High",         desc: "Collector of lost lore and power, with potent artifacts that might well lead to their ruin." },
	"the-would-be-hero": { complexity: "Medium",       desc: "They're in over their head and full of fear and anger, but they just might outshine us all." },
};

export class PlaybookPickerDialog extends Application {
	constructor(onPick, options = {}) {
		super(options);
		this._onPick   = onPick;
		this._playbooks = [];
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-playbook-picker",
			template:  "systems/stonetop/templates/dialogs/playbook-picker.hbs",
			title:     game.i18n.localize("stonetop.newCharacter.pickerTitle"),
			width:     640,
			height:    "auto",
			resizable: false,
			classes:   ["stonetop", "stonetop-playbook-picker"],
		});
	}

	async getData() {
		if (!this._playbooks.length) {
			const pack = game.packs.get("stonetop.stonetop-items");
			if (pack) {
				await pack.getIndex({ fields: ["type", "system.slug", "img"] });
				const entries = [...pack.index].filter(e =>
					e.type === "playbook" && !!PLAYBOOK_DESCRIPTIONS[e.system?.slug ?? ""]
				);
				const docs = await Promise.all(entries.map(e => pack.getDocument(e._id)));
				this._playbooks = docs
					.filter(Boolean)
					.sort((a, b) => a.name.localeCompare(b.name))
					.map(d => {
						const slug = d.system?.slug ?? "";
						const info = PLAYBOOK_DESCRIPTIONS[slug] ?? {};
						return {
							uuid:        d.uuid,
							name:        d.name,
							img:         d.img,
							slug,
							complexity:  info.complexity ?? "",
							description: info.desc       ?? "",
						};
					});
			}
		}
		return { playbooks: this._playbooks };
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find(".stonetop-playbook-picker-setting-overview").on("click", () => {
			const existing = Object.values(ui.windows).find(w => w.id === "stonetop-setting-overview");
			if (existing?.rendered) existing.bringToTop();
			else new SettingOverviewDialog().render(true);
		});
		html.find(".stonetop-playbook-picker-card")
			.on("click", async ev => {
				const { uuid } = ev.currentTarget.dataset;
				if (!uuid) return;
				const doc = await fromUuid(uuid);
				if (!doc) return;
				await this._onPick(doc);
				this.close();
			})
			.on("mouseenter", ev => this._showPickerTooltip(ev.currentTarget))
			.on("mouseleave", () => this._removePickerTooltip());
	}

	_removePickerTooltip() {
		document.querySelector(".stonetop-playbook-picker-tooltip")?.remove();
	}

	_showPickerTooltip(card) {
		this._removePickerTooltip();
		const { complexity, description } = card.dataset;
		if (!description) return;

		const tip = document.createElement("div");
		tip.className = "stonetop-playbook-picker-tooltip";
		tip.innerHTML =
			(complexity ? `<span class="stonetop-playbook-picker-tooltip-complexity">${complexity} complexity</span>` : "") +
			`<p class="stonetop-playbook-picker-tooltip-desc">${description}</p>`;
		document.body.appendChild(tip);

		const ar  = card.getBoundingClientRect();
		const tr  = tip.getBoundingClientRect();
		let top   = ar.top - tr.height - 8;
		let left  = ar.left + (ar.width - tr.width) / 2;
		if (top < 8) top = ar.bottom + 8;
		const maxLeft = window.innerWidth - tr.width - 8;
		if (left > maxLeft) left = maxLeft;
		if (left < 8)       left = 8;
		tip.style.top  = `${top}px`;
		tip.style.left = `${left}px`;
	}
}
