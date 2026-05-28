import { IMPROVEMENT_DEFINITIONS, STEADING_DEFAULTS } from "./StonetopSteading.js";

const STEADING_MOVES = [
	{
		slug: "seasonsChange",
		label: "When the Seasons Change",
		stat: "fortunes",
		statLabel: "Fortunes",
		rollable: true,
		description: `<p>At the start of each new season, roll <strong>+Fortunes</strong>.</p>
<p><strong>On a 10+:</strong> the steading generates 1d4+1 Surplus for the coming season.</p>
<p><strong>On a 7–9:</strong> the steading generates 1d4 Surplus for the coming season.</p>
<p><strong>On a miss:</strong> the steading generates no Surplus, Fortunes resets to −1 for the coming season, and the GM picks 1:</p>
<ul>
  <li>The steading faces a serious crisis (disease, disaster, attack)</li>
  <li>Two of the steading's debilities apply this season</li>
  <li>The steading loses a Resource or Fortification</li>
</ul>
<p><em>Note: Fortunes normally resets to +1 at the start of each season (except when malcontent debility applies, resetting to +0).</em></p>`,
	},
	{
		slug: "pullTogether",
		label: "Pull Together",
		stat: "fortunes",
		statLabel: "Fortunes",
		rollable: true,
		description: `<p>When you <strong>rally the residents of Stonetop to work on a common project</strong>, say what the project is and how you're going about it. The GM will say how many units of effort are needed.</p>
<p>To contribute a unit of effort, spend the required time and resources, then roll <strong>+Fortunes</strong>.</p>
<p><strong>On a 10+:</strong> you contribute 2 units of effort.</p>
<p><strong>On a 7–9:</strong> you contribute 1 unit of effort.</p>
<p><strong>On a miss:</strong> you contribute 1 unit of effort but a complication arises — the GM says what goes wrong.</p>
<p><em>Diminished debility: disadvantage on this roll.</em></p>`,
	},
	{
		slug: "muster",
		label: "Muster",
		stat: "defenses",
		statLabel: "Defenses",
		rollable: true,
		description: `<p>When <strong>Stonetop's militia needs to mobilize quickly</strong>, roll <strong>+Defenses</strong>.</p>
<p><strong>On a 10+:</strong> the militia is ready quickly and at full strength — pick 2 from the list below.</p>
<p><strong>On a 7–9:</strong> the militia is ready — pick 1 from the list below.</p>
<p><strong>On a miss:</strong> the militia is ready but none of the below apply; the GM may say something goes wrong too.</p>
<ul>
  <li>They're ready quickly (no more than an hour)</li>
  <li>They're at full strength</li>
  <li>They're well equipped</li>
  <li>They're in good spirits</li>
</ul>
<p><em>Diminished debility: disadvantage on this roll.</em></p>`,
	},
	{
		slug: "deploy",
		label: "Deploy",
		stat: "defenses",
		statLabel: "Defenses",
		rollable: true,
		description: `<p>When you <strong>send Stonetop's militia to defend against or engage a threat</strong>, roll <strong>+Defenses</strong>.</p>
<p><strong>On a 10+:</strong> the militia succeeds — pick 2 from the list below.</p>
<p><strong>On a 7–9:</strong> the militia succeeds but pick 1 consequence from the GM's list.</p>
<p><strong>On a miss:</strong> things go badly — the GM picks 2 consequences.</p>
<ul>
  <li>They drive off, defeat, or destroy the threat</li>
  <li>They suffer few (or no) casualties</li>
  <li>They don't expend any significant resources</li>
  <li>They maintain their morale and cohesion</li>
</ul>
<p><em>Diminished debility: disadvantage on this roll.</em></p>`,
	},
	{
		slug: "tradeBarter",
		label: "Trade & Barter",
		stat: "fortunes",
		statLabel: "Fortunes",
		rollable: true,
		description: `<p>When you <strong>seek to buy, sell, or exchange goods or services</strong> on behalf of the steading, roll <strong>+Fortunes</strong>.</p>
<p><strong>On a 10+:</strong> you get what you want at a fair price; ask the GM 3 questions about the wider world.</p>
<p><strong>On a 7–9:</strong> you get it, but pick 1: you pay more than expected, you get less than you hoped, or you can ask 1 question.</p>
<p><strong>On a miss:</strong> the deal falls through or comes with serious strings attached.</p>`,
	},
	{
		slug: "requisition",
		label: "Requisition",
		stat: null,
		statLabel: null,
		rollable: false,
		description: `<p>When you <strong>try to obtain an item or service</strong> that Stonetop possesses, you may:</p>
<ul>
  <li><strong>Spend 1 Surplus</strong> to obtain any one thing of Value 3 or less, no roll required.</li>
  <li>Or <strong>roll +Fortunes</strong>: on a 10+, the steading has 2 things you need; on a 7–9, it has 1; on a miss, nothing useful is available right now.</li>
</ul>`,
	},
	{
		slug: "persuade",
		label: "Persuade",
		stat: "fortunes",
		statLabel: "Fortunes",
		rollable: true,
		description: `<p>When you need to <strong>convince the residents of Stonetop to do something costly, dangerous, or against their interests</strong>, roll <strong>+Fortunes</strong>.</p>
<p><strong>On a 10+:</strong> they go along with it, at least for now.</p>
<p><strong>On a 7–9:</strong> they need something in return, or they'll only go partway.</p>
<p><strong>On a miss:</strong> they refuse outright, and may resent being asked.</p>
<p><em>Malcontent debility: folks need Persuading more often than usual.</em></p>`,
	},
];

export function createStonetopSteadingSheetClass(Base) {
	return class StonetopSteadingSheet extends Base {
		_stonetopSteading;
		_editMode = false;

		constructor(...args) {
			super(...args);
			console.log("Stonetop | StonetopSteadingSheet constructor, actor:", this.actor?.name, this.actor?.type);
			this._stonetopSteading = this.actor.typedActor;
			console.log("Stonetop | StonetopSteadingSheet typedActor:", this._stonetopSteading);
		}

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["pbta", "stonetop", "sheet", "actor", "steading"],
				width: 1080,
				height: 840,
				tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "overview" }],
			});
		}

		get template() {
			return "modules/stonetop/templates/actor/steading.hbs";
		}

		async _render(force, options) {
			await super._render(force, options);
			// Strip any PBTA-injected playbook controls and FoundryVTT chrome from the window header
			const header = this.element[0]?.querySelector(".window-header");
			if (header) {
				header.querySelectorAll(".pbta-playbook, .sheet-playbook, [class*='playbook']").forEach(el => el.remove());
				header.querySelectorAll("select, input[name*='playbook']").forEach(el => el.remove());
				header.querySelectorAll(".document-id-link").forEach(el => el.remove());
			}
			this._injectHeaderToggle();
		}

		_injectHeaderToggle() {
			const header = this.element[0]?.querySelector(".window-header");
			if (!header || !this.isEditable) return;

			header.querySelector(".stonetop-header-toggle")?.remove();

			const label = document.createElement("label");
			label.className = "stonetop-edit-toggle stonetop-header-toggle";
			label.title = this._editMode ? "Lock Sheet" : "Edit Steading";

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = this._editMode;
			checkbox.addEventListener("change", () => {
				this._editMode = !this._editMode;
				this.render(false);
			});

			const track = document.createElement("span");
			track.className = "stonetop-toggle-track";
			const thumb = document.createElement("span");
			thumb.className = "stonetop-toggle-thumb";
			const icon = document.createElement("i");
			icon.className = "fas fa-wrench";
			thumb.appendChild(icon);
			track.appendChild(thumb);

			label.appendChild(checkbox);
			label.appendChild(track);

			const title = header.querySelector(".window-title");
			header.insertBefore(label, title);
		}

		async getData() {
			console.log("Stonetop | StonetopSteadingSheet getData called");
			const context = await super.getData();
			console.log("Stonetop | StonetopSteadingSheet super.getData() returned, template:", this.template);
			context.stonetop = await this._stonetopSteading.buildSnapshot();
			context.stonetop.moves = STEADING_MOVES;
			context.stonetop.editMode = this._editMode;
			return context;
		}

		activateListeners(html) {
			super.activateListeners(html);

			// Rollable move buttons (both editable and read-only)
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".steading-roll-btn");
				if (!btn) return;
				ev.stopPropagation();
				this._onSteadingRoll(btn.dataset.moveName, btn.dataset.stat);
			}, true);

			// Move description toggle
			html[0].addEventListener("click", ev => {
				const hdr = ev.target.closest(".steading-move-header");
				if (!hdr) return;
				const card = hdr.closest(".steading-move-card");
				if (!card) return;
				card.classList.toggle("is-open");
			}, true);

			// Improvement card expand/collapse
			html[0].addEventListener("click", ev => {
				const hdr = ev.target.closest(".steading-improvement-header");
				if (!hdr) return;
				if (ev.target.closest(".steading-improvement-complete-label")) return;
				const card = hdr.closest(".steading-improvement");
				if (!card) return;
				card.classList.toggle("is-open");
			}, true);

			if (!this.isEditable) return;

			// List item checked toggle (resources, fortifications, assets)
			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".steading-list-check");
				if (!cb) return;
				ev.stopPropagation();
				const { list, index } = cb.dataset;
				this._onListItemCheck(list, parseInt(index), cb.checked);
			}, true);

			// Add list item
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".steading-list-add");
				if (!btn) return;
				ev.stopPropagation();
				this._onListItemAdd(btn.dataset.list);
			}, true);

			// Delete list item
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".steading-list-delete");
				if (!btn) return;
				ev.stopPropagation();
				const { list, index } = btn.dataset;
				this._onListItemDelete(btn.dataset.list, parseInt(index));
			}, true);

			// Places of interest names
			html[0].addEventListener("change", ev => {
				const inp = ev.target.closest(".steading-place-name");
				if (!inp) return;
				ev.stopPropagation();
				this._onPlaceChange(parseInt(inp.dataset.index), inp.value);
			}, true);

			// Notes
			html[0].addEventListener("change", ev => {
				const ta = ev.target.closest(".steading-notes-input");
				if (!ta) return;
				ev.stopPropagation();
				this._onNotesChange(ta.value);
			}, true);

			// Size radio
			html[0].addEventListener("change", ev => {
				const radio = ev.target.closest(".steading-size-radio");
				if (!radio) return;
				ev.stopPropagation();
				this._stonetopSteading.setFlags({ size: radio.value });
			}, true);

			// Currency
			html[0].addEventListener("change", ev => {
				const inp = ev.target.closest(".steading-currency-input");
				if (!inp) return;
				ev.stopPropagation();
				const { currency, field } = inp.dataset;
				this._onCurrencyChange(currency, field, parseInt(inp.value) || 0);
			}, true);

			// Improvement complete checkbox
			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".steading-improvement-complete");
				if (!cb) return;
				ev.stopPropagation();
				this._onImprovementComplete(cb.dataset.slug, cb.checked);
			}, true);

			// Improvement requirement checkbox
			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".steading-improvement-req");
				if (!cb) return;
				ev.stopPropagation();
				const { slug, index } = cb.dataset;
				this._onImprovementReq(slug, parseInt(index), cb.checked);
			}, true);
		}

		async _onSteadingRoll(moveName, statKey) {
			if (!statKey) return;
			const statVal = this.actor.system?.stats?.[statKey]?.value ?? 0;
			const sign = statVal >= 0 ? "+" : "";
			const roll = await new Roll("2d6+@stat", { stat: statVal }).evaluate();
			const total = roll.total;
			let result, cls;
			if (total >= 10) { result = "10+ Strong Hit!"; cls = "stonetop-roll-success"; }
			else if (total >= 7) { result = "7–9 Weak Hit"; cls = "stonetop-roll-partial"; }
			else { result = "6− Miss"; cls = "stonetop-roll-failure"; }

			const statName = statKey === "fortunes" ? "Fortunes" : "Defenses";
			await roll.toMessage({
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				flavor: `<div class="stonetop-chat-move">
					<h3 class="stonetop-chat-move-name">${moveName}</h3>
					<div class="steading-roll-result ${cls}">+${statName} (${sign}${statVal}) → <strong>${result}</strong></div>
				</div>`,
				rollMode: game.settings.get("core", "rollMode"),
			});
		}

		async _onListItemCheck(list, index, checked) {
			const f = this._stonetopSteading._flags;
			const arr = foundry.utils.deepClone(f[list] ?? STEADING_DEFAULTS[list]);
			arr[index].checked = checked;
			await this._stonetopSteading.setFlags({ [list]: arr });
		}

		async _onListItemAdd(list) {
			const labels = { resources: "resource", fortifications: "fortification", assets: "asset" };
			const name = (prompt(`New ${labels[list] ?? list} name:`) ?? "").trim();
			if (!name) return;
			const f = this._stonetopSteading._flags;
			const arr = foundry.utils.deepClone(f[list] ?? STEADING_DEFAULTS[list]);
			arr.push({ name, checked: false });
			await this._stonetopSteading.setFlags({ [list]: arr });
			this.render(false);
		}

		async _onListItemDelete(list, index) {
			const f = this._stonetopSteading._flags;
			const arr = foundry.utils.deepClone(f[list] ?? STEADING_DEFAULTS[list]);
			arr.splice(index, 1);
			await this._stonetopSteading.setFlags({ [list]: arr });
			this.render(false);
		}

		async _onPlaceChange(index, value) {
			const f = this._stonetopSteading._flags;
			const places = foundry.utils.deepClone(f.places ?? STEADING_DEFAULTS.places);
			places[index].name = value;
			await this._stonetopSteading.setFlags({ places });
		}

		async _onNotesChange(value) {
			await this._stonetopSteading.setFlags({ notes: value });
		}

		async _onCurrencyChange(currency, field, value) {
			const f = this._stonetopSteading._flags;
			const cur = foundry.utils.deepClone(f[currency] ?? STEADING_DEFAULTS[currency]);
			cur[field] = value;
			await this._stonetopSteading.setFlags({ [currency]: cur });
		}

		async _onImprovementComplete(slug, checked) {
			const f = this._stonetopSteading._flags;
			const improvements = foundry.utils.deepClone(f.improvements ?? {});
			if (!improvements[slug]) improvements[slug] = { completed: false, r: [] };
			improvements[slug].completed = checked;
			await this._stonetopSteading.setFlags({ improvements });
		}

		async _onImprovementReq(slug, index, checked) {
			const f = this._stonetopSteading._flags;
			const improvements = foundry.utils.deepClone(f.improvements ?? {});
			if (!improvements[slug]) improvements[slug] = { completed: false, r: [] };
			if (!improvements[slug].r) improvements[slug].r = [];
			improvements[slug].r[index] = checked;
			await this._stonetopSteading.setFlags({ improvements });
		}
	};
}
