import { IMPROVEMENT_DEFINITIONS, STEADING_DEFAULTS } from "./StonetopSteading.js";
import {rollStat} from "../../utils/roll-engine.js";
import {SteadingLedger} from "./SteadingLedger.js";

const _STEADING_MOVES_RAW = [
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
const STEADING_MOVES = [..._STEADING_MOVES_RAW].sort((a, b) => a.label.localeCompare(b.label));

export function createStonetopSteadingSheetClass(Base) {
	return class StonetopSteadingSheet extends Base {
		_stonetopSteading;
		_editMode = false;

		constructor(...args) {
			super(...args);
			this._stonetopSteading = this.actor.typedActor;
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
			return "systems/stonetop/templates/actor/steading.hbs";
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

		_getHeaderButtons() {
			const buttons = super._getHeaderButtons().filter(b => b.class !== "configure-sheet");
			const tokenIdx = buttons.findIndex(b => b.class?.includes("token"));
			buttons.splice(tokenIdx >= 0 ? tokenIdx : 0, 0, {
				label:   "Ledger",
				class:   "stonetop-ledger-button",
				icon:    "fas fa-scroll",
				onclick: () => this._openLedgerDialog(),
			});
			return buttons;
		}

		_openLedgerDialog() {
			const entries = SteadingLedger.getEntries(this.actor);
			const esc = v => foundry.utils.escapeHTML(String(v ?? ""));
			const buildRows = (items) => items.length
				? items.map(entry => `<li class="stonetop-ledger-entry" data-id="${esc(entry.id)}" data-timestamp="${entry.timestamp ?? 0}">
						<input type="checkbox" class="stonetop-ledger-row-check">
						<div class="stonetop-ledger-entry-content">
							<div class="stonetop-ledger-entry-main">${esc(entry.action)}</div>
							<div class="stonetop-ledger-entry-meta">
								<span>${esc(entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "")}</span>
								<span>${esc(entry.userName)}</span>
							</div>
						</div>
					</li>`).join("")
				: `<li class="stonetop-ledger-empty">No ledger entries yet.</li>`;

			const content = `<div class="stonetop-ledger-container">
				<div class="stonetop-ledger-toolbar">
					<label class="stonetop-edit-toggle stonetop-ledger-edit-toggle" title="Edit entries">
						<input type="checkbox" class="stonetop-ledger-edit-check">
						<span class="stonetop-toggle-track">
							<span class="stonetop-toggle-thumb"><i class="fas fa-pen"></i></span>
						</span>
					</label>
					<label class="stonetop-ledger-select-all-label" title="Select all">
						<input type="checkbox" class="stonetop-ledger-select-all">
					</label>
					<button type="button" class="stonetop-ledger-delete-selected">
						<i class="fas fa-trash"></i> Delete
					</button>
					<input type="search" class="stonetop-ledger-search" placeholder="Filter entries…">
					<select class="stonetop-ledger-sort">
						<option value="desc">Newest first</option>
						<option value="asc">Oldest first</option>
					</select>
				</div>
				<section class="stonetop-ledger-dialog">
					<ol class="stonetop-ledger-list">${buildRows(entries)}</ol>
				</section>
			</div>`;

			new Dialog({
				title: `${this.actor.name}: Ledger`,
				content,
				buttons: {},
				render: (html) => {
					const container   = html.find(".stonetop-ledger-container")[0];
					const selectAllEl = html.find(".stonetop-ledger-select-all")[0];

					const syncSelectAll = () => {
						const total   = html.find(".stonetop-ledger-row-check").length;
						const checked = html.find(".stonetop-ledger-row-check:checked").length;
						selectAllEl.checked       = checked === total && total > 0;
						selectAllEl.indeterminate = checked > 0 && checked < total;
					};

					html.find(".stonetop-ledger-edit-check").on("change", ev => {
						container.classList.toggle("stonetop-ledger-edit-mode", ev.currentTarget.checked);
						if (!ev.currentTarget.checked) {
							html.find(".stonetop-ledger-row-check").prop("checked", false);
							syncSelectAll();
						}
					});

					html.find(".stonetop-ledger-select-all").on("change", ev => {
						html.find(".stonetop-ledger-entry:not([hidden]) .stonetop-ledger-row-check")
							.prop("checked", ev.currentTarget.checked);
					});

					html[0].addEventListener("change", ev => {
						if (ev.target.closest(".stonetop-ledger-row-check")) syncSelectAll();
					});

					html.find(".stonetop-ledger-entry").each((_, el) => {
						el._ledgerText = el.querySelector(".stonetop-ledger-entry-main")
							?.textContent?.toLowerCase() ?? "";
					});

					html.find(".stonetop-ledger-search").on("input", ev => {
						const term = ev.currentTarget.value.trim().toLowerCase();
						html.find(".stonetop-ledger-entry").each((_, el) => {
							el.hidden = !!term && !el._ledgerText.includes(term);
						});
						syncSelectAll();
					});

					html.find(".stonetop-ledger-sort").on("change", ev => {
						const asc  = ev.currentTarget.value === "asc";
						const list = html.find(".stonetop-ledger-list")[0];
						const tagged = [...list.querySelectorAll(".stonetop-ledger-entry")]
							.map(el => [el, Number(el.dataset.timestamp)]);
						tagged.sort(([, ta], [, tb]) => asc ? ta - tb : tb - ta);
						tagged.forEach(([el]) => list.appendChild(el));
					});

					html.find(".stonetop-ledger-delete-selected").on("click", async () => {
						const checked = [...html.find(".stonetop-ledger-row-check:checked")];
						if (!checked.length) return;

						const doDelete = async () => {
							const ids = new Set(
								checked.map(el => el.closest(".stonetop-ledger-entry").dataset.id)
							);
							checked.forEach(el => el.closest(".stonetop-ledger-entry")?.remove());
							syncSelectAll();
							await SteadingLedger.deleteEntries(this.actor, ids);
						};

						if (checked.length === 1) {
							await doDelete();
							return;
						}

						Dialog.confirm({
							title: "Delete Ledger Entries",
							content: `<p>You're about to delete ${checked.length} entries. Are you sure?</p>`,
							yes: doDelete,
						});
					});
				},
			}, {
				width: 560,
				height: 640,
				classes: ["dialog", "stonetop-ledger-window"],
			}).render(true);
		}

		async getData() {
			const context = await super.getData();
			context.stonetop = await this._stonetopSteading.buildSnapshot();
			context.stonetop.moves = STEADING_MOVES;
			context.stonetop.enrichedNotes = await foundry.applications.ux.TextEditor.enrichHTML(context.stonetop.notes ?? "");
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

			// Stat tracks use custom radio markup, so persist them explicitly.
			html[0].addEventListener("change", ev => {
				const input = ev.target;
				if (input.type !== "radio" || !input.name || !input.closest(".steading-track-option")) return;
				if (!this._editMode) return;
				ev.stopPropagation();
				this._onSteadingTrackChange(input.name, Number(input.value));
			}, true);

			// Surplus is in the custom stat bar, so persist it explicitly.
			const onSurplusInput = ev => {
				const input = ev.target.closest(".steading-surplus-input");
				if (!input || !this._editMode) return;
				ev.stopPropagation();
				this._onSteadingTrackChange(input.name, Math.max(0, parseInt(input.value) || 0));
			};
			html[0].addEventListener("input", onSurplusInput, true);
			html[0].addEventListener("change", onSurplusInput, true);

			// Debilities live in the same custom bar and need the same legacy-safe persistence.
			html[0].addEventListener("change", ev => {
				const input = ev.target.closest(".steading-debility-check");
				if (!input || !this._editMode) return;
				ev.stopPropagation();
				this._onSteadingTrackChange(input.name, input.checked);
			}, true);

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
				const pm = ev.target.closest("prose-mirror.steading-notes-editor");
				if (!pm) return;
				ev.stopPropagation();
				this._onNotesChange(pm.value);
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
			await rollStat(statKey, this.actor, {
				moveName,
				statValue: this._stonetopSteading.getStatValue(statKey),
			});
		}

		async _onSteadingTrackChange(path, value) {
			await this._stonetopSteading.setSystemValue(path.replace(/^system\./, ""), value);
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
