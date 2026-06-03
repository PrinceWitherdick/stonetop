import { IMPROVEMENT_DEFINITIONS, STEADING_DEFAULTS } from "./StonetopSteading.js";
import {rollStat} from "../../utils/roll-engine.js";
import {SteadingLedger} from "./SteadingLedger.js";

function _signedNum(n) {
	return n >= 0 ? `+${n}` : String(n);
}

const _STEADING_MOVES_RAW = [
	{
		slug: "seasonsChange",
		label: "Seasons Change",
		stat: "fortunes",
		statLabel: "Fortunes",
		rollable: false,
		interactive: true,
		description: `<div class="stonetop-seasons-grid">
  <img src="systems/stonetop/assets/icons/seasons/spring_icon.png" class="stonetop-season-row-icon" alt="Spring">
  <div><strong>Spring</strong> — The <em>most hopeful</em> rolls +Fortunes. <strong>10+:</strong> pick 1 seasonal gain. <strong>7–9:</strong> pick 1 gain, but a threat makes itself known. <strong>6−:</strong> threats abound; don't mark XP. Reset Fortunes to +1.</div>

  <img src="systems/stonetop/assets/icons/seasons/summer_icon.png" class="stonetop-season-row-icon" alt="Summer">
  <div><strong>Summer</strong> — The <em>most content</em> rolls +Fortunes. <strong>10+:</strong> pick 2 seasonal gains. <strong>7–9:</strong> pick 1. <strong>6−:</strong> a threat makes itself known; don't mark XP. The steading generates 1d4−1 Surplus. Reset Fortunes to +1.</div>

  <img src="systems/stonetop/assets/icons/seasons/fall_icon.png" class="stonetop-season-row-icon" alt="Autumn">
  <div><strong>Autumn</strong> — The <em>most determined</em> rolls +Fortunes. <strong>10+:</strong> pick 1 seasonal gain. <strong>7–9:</strong> pick 1 gain, but a threat makes itself known. <strong>6−:</strong> threats abound; don't mark XP. The steading generates 1d4 Surplus at harvest. Reset Fortunes to +1.</div>

  <img src="systems/stonetop/assets/icons/seasons/winter_icon.png" class="stonetop-season-row-icon" alt="Winter">
  <div><strong>Winter</strong> — The <em>weariest</em> rolls 1d4+Population (min 0); the steading consumes that much Surplus. If there isn't enough: Surplus → 0, Fortunes −1, pick 1 consequence. Then roll +Fortunes. Reset Fortunes to +1.</div>
</div>
<p class="stonetop-seasons-cta">Click <i class="fas fa-dice-d6"></i> to walk through the current season step by step.</p>`,
	},
	{
		slug: "pullTogether",
		label: "Pull Together",
		stat: "fortunes",
		statLabel: "Fortunes",
		rollable: true,
		interactive: true,
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
		interactive: true,
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
		interactive: true,
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
		stat: "prosperity",
		statLabel: "Prosperity",
		rollable: true,
		interactive: true,
		description: `<p>When you <strong>seek to buy, sell, or exchange goods or services</strong> on behalf of the steading, roll <strong>+Prosperity</strong>.</p>
<p><strong>On a 10+:</strong> you get what you want at a fair price; ask the GM 3 questions about the wider world.</p>
<p><strong>On a 7–9:</strong> you get it, but pick 1: you pay more than expected, you get less than you hoped, or you can ask 1 question.</p>
<p><strong>On a miss:</strong> the deal falls through or comes with serious strings attached.</p>`,
	},
	{
		slug: "meetWithDisaster",
		label: "Meet with Disaster",
		stat: null,
		statLabel: null,
		rollable: false,
		interactive: true,
		description: `<p>When <strong><em>calamity befalls the steading or panic spreads</em></strong>, reduce Fortunes by 1 (min -1).</p><p>When <strong><em>Fortunes would drop below -1 for any reason</em></strong> (not just calamity or panic), then the GM picks 1 instead:</p><ul><li>The steading marks <em>diminished</em> from injuries/sickness/doubt (disadvantage to Deploy, Muster, Pull Together)</li><li>The steading marks <em>lacking</em> due to shortages/hoarding/distrust (treat Prosperity as 1 lower)</li><li>The steading marks <em>malcontent</em> from fear/anger/despair (Fortunes reset to +0 each season, not +1; folks need Persuading more often than usual)</li><li>Folks start to leave; reduce Population by 1</li></ul>`,
	},
	{
		slug: "requisition",
		label: "Requisition",
		stat: null,
		statLabel: null,
		rollable: false,
		interactive: true,
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
		interactive: true,
		description: `<p>When you need to <strong>convince the residents of Stonetop to do something costly, dangerous, or against their interests</strong>, roll <strong>+Fortunes</strong>.</p>
<p><strong>On a 10+:</strong> they go along with it, at least for now.</p>
<p><strong>On a 7–9:</strong> they need something in return, or they'll only go partway.</p>
<p><strong>On a miss:</strong> they refuse outright, and may resent being asked.</p>
<p><em>Malcontent debility: folks need Persuading more often than usual.</em></p>`,
	},
];
const STEADING_MOVES = [..._STEADING_MOVES_RAW].sort((a, b) => a.label.localeCompare(b.label));
const DIMINISHED_MOVES = new Set(["Deploy", "Muster", "Pull Together"]);
const _esc = v => foundry.utils.escapeHTML(String(v ?? ""));

const HOMESTEAD_MOVE_FLOWS = {
	pullTogether: {
		label: "Pull Together",
		stat: "fortunes",
		statLabel: "Fortunes",
		trigger: "When you rally the residents of Stonetop to work on a common project, say what the project is and how you're going about it. The GM says how many units of effort are needed.",
		fields: [
			{ name: "project", label: "Project", type: "text", placeholder: "What are you trying to build, repair, clear, or prepare?" },
			{ name: "approach", label: "Approach", type: "textarea", placeholder: "Who is helping, and how are you organizing the work?" },
			{ name: "effort", label: "Units needed", type: "text", placeholder: "GM call" },
			{ name: "cost", label: "Time and resources spent", type: "textarea", placeholder: "What does this unit of effort require?" },
		],
		results: [
			"10+: contribute 2 units of effort.",
			"7-9: contribute 1 unit of effort.",
			"Miss: contribute 1 unit of effort, but a complication arises.",
		],
		note: "Diminished gives disadvantage on this roll.",
	},
	muster: {
		label: "Muster",
		stat: "defenses",
		statLabel: "Defenses",
		trigger: "When Stonetop's militia needs to mobilize quickly, roll +Defenses.",
		fields: [
			{ name: "threat", label: "Threat or cause", type: "textarea", placeholder: "What are you mustering against?" },
			{ name: "urgency", label: "How quickly are they needed?", type: "text", placeholder: "Immediately, within the hour, by dawn..." },
			{ name: "orders", label: "Orders", type: "textarea", placeholder: "Where are they gathering, and who is leading them?" },
		],
		picksLabel: "On a hit, choose from:",
		picks: [
			"They're ready quickly (no more than an hour).",
			"They're at full strength.",
			"They're well equipped.",
			"They're in good spirits.",
		],
		results: [
			"10+: the militia is ready quickly and at full strength; pick 2.",
			"7-9: the militia is ready; pick 1.",
			"Miss: the militia is ready, but none of the choices apply; the GM may add trouble.",
		],
		note: "Diminished gives disadvantage on this roll.",
	},
	deploy: {
		label: "Deploy",
		stat: "defenses",
		statLabel: "Defenses",
		trigger: "When you send Stonetop's militia to defend against or engage a threat, roll +Defenses.",
		fields: [
			{ name: "threat", label: "Threat", type: "textarea", placeholder: "What are they defending against or engaging?" },
			{ name: "objective", label: "Objective", type: "text", placeholder: "Drive them off, hold the ford, buy time..." },
			{ name: "plan", label: "Deployment", type: "textarea", placeholder: "Which force, fortification, or tactic is being used?" },
		],
		picksLabel: "On a 10+, choose 2:",
		picks: [
			"They drive off, defeat, or destroy the threat.",
			"They suffer few or no casualties.",
			"They don't expend significant resources.",
			"They maintain morale and cohesion.",
		],
		results: [
			"10+: the militia succeeds; pick 2.",
			"7-9: the militia succeeds, but pick 1 consequence from the GM's list.",
			"Miss: things go badly; the GM picks 2 consequences.",
		],
		note: "Diminished gives disadvantage on this roll.",
	},
	tradeBarter: {
		label: "Trade & Barter",
		stat: "prosperity",
		statLabel: "Prosperity",
		trigger: "When you seek to buy, sell, or exchange goods or services on behalf of the steading, roll +Prosperity.",
		fields: [
			{ name: "want", label: "What do you want?", type: "textarea", placeholder: "Goods, services, favors, labor, information..." },
			{ name: "partner", label: "Trade partner", type: "text", placeholder: "Who are you dealing with?" },
			{ name: "offer", label: "Offer or price", type: "textarea", placeholder: "What is being offered, paid, or risked?" },
		],
		results: [
			"10+: you get what you want at a fair price; ask the GM 3 questions about the wider world.",
			"7-9: you get it, but pick 1: pay more than expected, get less than hoped, or ask 1 question.",
			"Miss: the deal falls through or comes with serious strings attached.",
		],
		note: "Lacking treats Prosperity as 1 lower.",
	},
	persuade: {
		label: "Persuade",
		stat: "fortunes",
		statLabel: "Fortunes",
		trigger: "When you need to convince the residents of Stonetop to do something costly, dangerous, or against their interests, roll +Fortunes.",
		fields: [
			{ name: "audience", label: "Who needs convincing?", type: "text", placeholder: "A family, trade, faction, crowd, or named NPCs" },
			{ name: "request", label: "The ask", type: "textarea", placeholder: "What do you want them to do?" },
			{ name: "cost", label: "Why is it hard?", type: "textarea", placeholder: "What makes it costly, dangerous, or against their interests?" },
		],
		results: [
			"10+: they go along with it, at least for now.",
			"7-9: they need something in return, or they'll only go partway.",
			"Miss: they refuse outright, and may resent being asked.",
		],
		note: "Malcontent means folks need Persuading more often than usual.",
	},
};

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
			const buildRows = (items) => items.length
				? items.map(entry => `<li class="stonetop-ledger-entry" data-id="${_esc(entry.id)}" data-timestamp="${entry.timestamp ?? 0}">
						<input type="checkbox" class="stonetop-ledger-row-check">
						<div class="stonetop-ledger-entry-content">
							<div class="stonetop-ledger-entry-main">${_esc(entry.action)}</div>
							<div class="stonetop-ledger-entry-meta">
								<span>${_esc(entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "")}</span>
								<span>${_esc(entry.userName)}</span>
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
			context.stonetop.hideUnearnedImprovements = this.actor.getFlag("stonetop", "hideUnearnedImprovements") ?? false;
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

			// Interactive move buttons (e.g. Meet with Disaster)
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".steading-interactive-btn");
				if (!btn) return;
				ev.stopPropagation();
				const { moveSlug } = btn.dataset;
				if (moveSlug === "meetWithDisaster") this._onMeetWithDisaster();
				else if (moveSlug === "requisition") this._onRequisition();
				else if (moveSlug === "seasonsChange") this._onSeasonsChange();
				else if (HOMESTEAD_MOVE_FLOWS[moveSlug]) this._onHomesteadMove(moveSlug);
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

			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".steading-hide-unearned-improvements-check");
				if (!cb) return;
				ev.stopPropagation();
				this.actor.setFlag("stonetop", "hideUnearnedImprovements", cb.checked);
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

		_onHomesteadMove(moveSlug) {
			const flow = HOMESTEAD_MOVE_FLOWS[moveSlug];
			if (!flow) return;

			const fieldHtml = flow.fields.map(field => {
				const common = `name="${_esc(field.name)}" placeholder="${_esc(field.placeholder)}"`;
				const control = field.type === "textarea"
					? `<textarea ${common} rows="2"></textarea>`
					: `<input type="text" ${common}>`;
				return `<label class="stonetop-homestead-field">
					<span>${_esc(field.label)}</span>
					${control}
				</label>`;
			}).join("");

			const picksHtml = flow.picks?.length
				? `<div class="stonetop-homestead-reference">
					<strong>${_esc(flow.picksLabel ?? "Choose from:")}</strong>
					<ul>${flow.picks.map(item => `<li>${_esc(item)}</li>`).join("")}</ul>
				</div>`
				: "";

			const resultsHtml = `<div class="stonetop-homestead-reference">
				<strong>Results</strong>
				<ul>${flow.results.map(item => `<li>${_esc(item)}</li>`).join("")}</ul>
			</div>`;

			const dialog = new Dialog({
				title: flow.label,
				content: `<form class="stonetop-homestead-dialog">
					<p class="stonetop-homestead-trigger"><em>${_esc(flow.trigger)}</em></p>
					<div class="stonetop-homestead-fields">${fieldHtml}</div>
					${resultsHtml}
					${picksHtml}
					<p class="stonetop-homestead-note">${_esc(flow.note)}</p>
				</form>`,
				buttons: {
					post: {
						label: "Post",
						callback: html => this._postHomesteadMoveSummary(flow, html),
					},
					roll: {
						label: `Roll +${flow.statLabel}`,
						callback: async html => {
							await this._postHomesteadMoveSummary(flow, html);
							await this._onSteadingRoll(flow.label, flow.stat);
						},
					},
					cancel: { label: "Cancel" },
				},
				default: "roll",
			}, {
				width: 520,
			});
			dialog.render(true);
		}

		async _postHomesteadMoveSummary(flow, html) {
			if (!globalThis.ChatMessage) return;
			const form = html[0]?.querySelector(".stonetop-homestead-dialog");
			if (!form) return;

			const data = Object.fromEntries(new FormData(form));
			const answers = flow.fields
				.map(field => {
					const value = (data[field.name] ?? "").trim();
					return value ? { label: field.label, value } : null;
				})
				.filter(Boolean);

			if (!answers.length) return;

			const content = `<section class="pbta-chat-card stonetop-roll-card stonetop-homestead-chat-card">
				<div class="cell cell--chat">
					<div class="chat-title row flexrow">
						<h2 class="cell__title">${_esc(flow.label)}</h2>
					</div>
					<div class="card-content">
						<ul class="stonetop-homestead-chat-list">
							${answers.map(answer => `<li><strong>${_esc(answer.label)}:</strong> ${_esc(answer.value)}</li>`).join("")}
						</ul>
					</div>
				</div>
			</section>`;

			ChatMessage.create({
				content,
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			});
		}

		async _onMeetWithDisaster() {
			const fortunes = this._stonetopSteading.getStatValue("fortunes");
			const wouldDropBelow = fortunes <= -1;

			if (!wouldDropBelow) {
				const newFortunes = fortunes - 1;
				new Dialog({
					title: "Meet with Disaster",
					content: `<div class="stonetop-disaster-dialog">
						<p><em>Calamity befalls the steading or panic spreads.</em></p>
						<p>Fortunes: <strong>${_signedNum(fortunes)}</strong> → <strong>${_signedNum(newFortunes)}</strong></p>
					</div>`,
					buttons: {
						apply: {
							label: "Apply",
							callback: async () => {
								await this._stonetopSteading.setSystemValue("stats.fortunes.value", newFortunes);
								this.render(false);
							},
						},
						cancel: { label: "Cancel" },
					},
					default: "apply",
				}).render(true);
				return;
			}

			// Fortunes is at -1 — would drop further; GM picks a consequence instead.
			const choices = [
				{
					id: "diminished",
					label: "Diminished",
					detail: "from injuries/sickness/doubt — disadvantage to Deploy, Muster, Pull Together",
					action: () => this._stonetopSteading.setSystemValue("attributes.debilities.options.diminished.value", true),
				},
				{
					id: "lacking",
					label: "Lacking",
					detail: "due to shortages/hoarding/distrust — treat Prosperity as 1 lower",
					action: () => this._stonetopSteading.setSystemValue("attributes.debilities.options.lacking.value", true),
				},
				{
					id: "malcontent",
					label: "Malcontent",
					detail: "from fear/anger/despair — Fortunes reset to +0 each season; folks need Persuading more often",
					action: () => this._stonetopSteading.setSystemValue("attributes.debilities.options.malcontent.value", true),
				},
				{
					id: "population",
					label: "Folks start to leave",
					detail: "reduce Population by 1 (min −1)",
					action: () => {
						const pop = this._stonetopSteading.getStatValue("population");
						return this._stonetopSteading.setSystemValue("attributes.population.value", Math.max(pop - 1, -1));
					},
				},
			];

			const choicesHtml = choices.map(c => `
				<li class="stonetop-disaster-choice" data-choice="${c.id}">
					<span class="stonetop-disaster-choice-label">${c.label}</span>
					<span class="stonetop-disaster-choice-detail">${c.detail}</span>
				</li>`).join("");

			let dialog;
			dialog = new Dialog({
				title: "Meet with Disaster",
				content: `<div class="stonetop-disaster-dialog">
					<p><em>Fortunes cannot drop below −1.</em> The GM picks 1:</p>
					<ol class="stonetop-disaster-choices">${choicesHtml}</ol>
				</div>`,
				buttons: { cancel: { label: "Cancel" } },
				render: (html) => {
					html[0].querySelectorAll(".stonetop-disaster-choice").forEach(el => {
						el.addEventListener("click", async () => {
							const choice = choices.find(c => c.id === el.dataset.choice);
							if (!choice) return;
							await choice.action();
							this.render(false);
							dialog.close();
						});
					});
				},
			});
			dialog.render(true);
		}

		async _onRequisition() {
			const surplus = this._stonetopSteading.getStatValue("surplus");
			const hasSurplus = surplus > 0;

			const surplusDetail = hasSurplus
				? `Obtain any one thing of Value 3 or less, no roll required. (Surplus: ${surplus} → ${surplus - 1})`
				: `Obtain any one thing of Value 3 or less, no roll required. <em>No Surplus available.</em>`;

			let dialog;
			dialog = new Dialog({
				title: "Requisition",
				content: `<div class="stonetop-disaster-dialog">
					<p><em>When you try to obtain an item or service that Stonetop possesses, you may:</em></p>
					<ol class="stonetop-disaster-choices">
						<li class="stonetop-disaster-choice${hasSurplus ? "" : " stonetop-disaster-choice-disabled"}" data-choice="surplus">
							<span class="stonetop-disaster-choice-label">Spend 1 Surplus</span>
							<span class="stonetop-disaster-choice-detail">${surplusDetail}</span>
						</li>
						<li class="stonetop-disaster-choice" data-choice="roll">
							<span class="stonetop-disaster-choice-label">Roll +Fortunes</span>
							<span class="stonetop-disaster-choice-detail">On a 10+, the steading has 2 things you need; on a 7–9, it has 1; on a miss, nothing useful is available right now.</span>
						</li>
					</ol>
				</div>`,
				buttons: { cancel: { label: "Cancel" } },
				render: (html) => {
					html[0].querySelectorAll(".stonetop-disaster-choice:not(.stonetop-disaster-choice-disabled)").forEach(el => {
						el.addEventListener("click", async () => {
							const { choice } = el.dataset;
							if (choice === "surplus") {
								await this._stonetopSteading.setSystemValue("attributes.surplus.value", surplus - 1);
								this.render(false);
							} else if (choice === "roll") {
								await this._onSteadingRoll("Requisition", "fortunes");
							}
							dialog.close();
						});
					});
				},
			});
			dialog.render(true);
		}

		async _onSeasonsChange() {
			const SEASONS = [
				{ id: "spring", label: "Spring" },
				{ id: "summer", label: "Summer" },
				{ id: "autumn", label: "Autumn" },
				{ id: "winter", label: "Winter" },
			];
			const iconSrc = id => `systems/stonetop/assets/icons/seasons/${id === "autumn" ? "fall" : id}_icon.png`;

			let dialog;
			dialog = new Dialog({
				title: "Seasons Change",
				content: `<div class="stonetop-season-picker">
					<p><em>Which season is beginning?</em></p>
					<div class="stonetop-season-cards">
						${SEASONS.map(s => `
							<div class="stonetop-season-card" data-season="${s.id}">
								<img src="${iconSrc(s.id)}" alt="${s.label}" class="stonetop-season-icon">
								<span class="stonetop-season-label">${s.label}</span>
							</div>`).join("")}
					</div>
				</div>`,
				buttons: {},
				render: (html) => {
					html[0].querySelectorAll(".stonetop-season-card").forEach(el => {
						el.addEventListener("click", () => {
							dialog.close();
							this._showSeasonDialog(el.dataset.season);
						});
					});
				},
			});
			dialog.render(true);
		}

		async _showSeasonDialog(seasonId) {
			const fortunes   = this._stonetopSteading.getStatValue("fortunes");
			const surplus    = this._stonetopSteading.getStatValue("surplus");
			const population = this._stonetopSteading.getStatValue("population");

			const label   = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" }[seasonId];
			const iconSrc = `systems/stonetop/assets/icons/seasons/${seasonId === "autumn" ? "fall" : seasonId}_icon.png`;

			const header = `<div class="stonetop-season-flow-header">
				<img src="${iconSrc}" alt="${label}" class="stonetop-season-icon-sm">
				<h3>${label}</h3>
			</div>`;

			const statsNote = `<p class="stonetop-season-note">Fortunes: <strong>${_signedNum(fortunes)}</strong> &nbsp;·&nbsp; Surplus: <strong>${surplus}</strong> &nbsp;·&nbsp; Population: <strong>${_signedNum(population)}</strong></p>`;

			const fortunesBtns = `<div class="stonetop-season-actions">
				<button class="stonetop-season-btn" data-action="roll-fortunes">
					<i class="fas fa-dice-d6"></i> Roll +Fortunes (current: ${_signedNum(fortunes)})
				</button>
				<button class="stonetop-season-btn" data-action="reset-fortunes">
					<i class="fas fa-undo"></i> Reset Fortunes to +1
				</button>
			</div>`;

			const gainsRef = `<details class="stonetop-season-gains">
				<summary>Seasonal Gains reference</summary>
				<ul>
					<li><strong>Population boom:</strong> Increase Population by 1 (max +3)</li>
					<li><strong>Tor's blessing:</strong> Fine weather; +1 to Pull Together, roll Die of Fate for weather twice</li>
					<li><strong>Unexpected bounty:</strong> Gain 1 Surplus now</li>
					<li><strong>Trade opportunity:</strong> Good trade offered at some point this season</li>
					<li><strong>Interesting news:</strong> Opportunity to improve fortunes, knowledge, or relations</li>
					<li><strong>Valuable insight:</strong> Chance to address a threat plaguing the steading</li>
				</ul>
			</details>`;

			let content;
			if (seasonId === "spring") {
				content = `<div class="stonetop-season-flow">
					${header}
					<p>Whoever is the <strong>most hopeful</strong> rolls +Fortunes:</p>
					<ul>
						<li><strong>10+:</strong> Pick 1 seasonal gain.</li>
						<li><strong>7–9:</strong> Pick 1 seasonal gain, but a threat makes itself known or gets worse.</li>
						<li><strong>6−:</strong> Threats abound. Don't mark XP.</li>
					</ul>
					<p class="stonetop-season-note">Whatever the result, reset Fortunes to +1.</p>
					${statsNote}${fortunesBtns}${gainsRef}
				</div>`;
			} else if (seasonId === "summer") {
				content = `<div class="stonetop-season-flow">
					${header}
					<p>Whoever is the <strong>most content</strong> rolls +Fortunes:</p>
					<ul>
						<li><strong>10+:</strong> Pick 2 seasonal gains.</li>
						<li><strong>7–9:</strong> Pick 1 seasonal gain.</li>
						<li><strong>6−:</strong> A threat makes itself known or gets worse. Don't mark XP.</li>
					</ul>
					<p class="stonetop-season-note">Whatever the result, the steading generates 1d4−1 Surplus, then Fortunes resets to +1.</p>
					${statsNote}${fortunesBtns}
					<div class="stonetop-season-actions">
						<button class="stonetop-season-btn" data-action="roll-surplus">
							<i class="fas fa-dice-d4"></i> Roll 1d4−1 Surplus (add to steading)
						</button>
					</div>
					${gainsRef}
				</div>`;
			} else if (seasonId === "autumn") {
				content = `<div class="stonetop-season-flow">
					${header}
					<p>Whoever is the <strong>most determined</strong> rolls +Fortunes:</p>
					<ul>
						<li><strong>10+:</strong> Pick 1 seasonal gain.</li>
						<li><strong>7–9:</strong> Pick 1 seasonal gain, but a threat makes itself known or gets worse.</li>
						<li><strong>6−:</strong> Threats abound. Don't mark XP.</li>
					</ul>
					<p class="stonetop-season-note">Whatever the result, reset Fortunes to +1. When harvest is complete, the steading generates 1d4 Surplus.</p>
					${statsNote}${fortunesBtns}
					<div class="stonetop-season-actions">
						<button class="stonetop-season-btn" data-action="roll-surplus">
							<i class="fas fa-dice-d4"></i> Roll 1d4 Surplus (Harvest)
						</button>
					</div>
					${gainsRef}
				</div>`;
			} else {
				// Winter
				content = `<div class="stonetop-season-flow">
					${header}
					<p>Whoever is the <strong>weariest</strong> rolls 1d4+Population (min 0); the steading consumes that much Surplus.</p>
					${statsNote}
					<div id="stonetop-winter-step1" class="stonetop-season-actions">
						<button class="stonetop-season-btn" data-action="roll-consumption">
							<i class="fas fa-dice-d4"></i> Roll 1d4+Population for Surplus Consumption
						</button>
					</div>
					<div id="stonetop-winter-step2" hidden>
						<p id="stonetop-winter-result" class="stonetop-season-note"></p>
						<div id="stonetop-winter-ok" hidden>
							<div class="stonetop-season-actions">
								<button class="stonetop-season-btn" data-action="apply-consumption">Apply Surplus Consumption</button>
							</div>
						</div>
						<div id="stonetop-winter-shortfall" hidden>
							<p>⚠️ <strong>Not enough Surplus.</strong> Reduce Surplus to 0 and Fortunes by 1, then the GM picks 1:</p>
							<ol class="stonetop-disaster-choices">
								<li class="stonetop-disaster-choice" data-consequence="population">
									<span class="stonetop-disaster-choice-label">Population loss</span>
									<span class="stonetop-disaster-choice-detail">Reduce Population by 1 (min −1) due to death, decrepitude, and departure.</span>
								</li>
								<li class="stonetop-disaster-choice" data-consequence="resource">
									<span class="stonetop-disaster-choice-label">Important resource lost or damaged</span>
									<span class="stonetop-disaster-choice-detail">A horse, the cistern, etc. — lost or not maintained (narrative).</span>
								</li>
								<li class="stonetop-disaster-choice" data-consequence="npc">
									<span class="stonetop-disaster-choice-label">Important NPC dies</span>
									<span class="stonetop-disaster-choice-detail">Their role unfilled — a narrative consequence.</span>
								</li>
								<li class="stonetop-disaster-choice" data-consequence="pc">
									<span class="stonetop-disaster-choice-label">A PC dies, leaves, or retires</span>
									<span class="stonetop-disaster-choice-detail">A narrative consequence for the group to resolve.</span>
								</li>
							</ol>
						</div>
					</div>
					<div id="stonetop-winter-step3" hidden>
						<hr class="stonetop-season-divider">
						<p>Then, roll +Fortunes:</p>
						<ul>
							<li><strong>10+:</strong> Winter is relatively mild. Each player names a local NPC with whom their relationship improves.</li>
							<li><strong>7–9:</strong> The steading must consume 1d4+Population more Surplus before winter ends, or suffer the consequences again.</li>
							<li><strong>6−:</strong> As 7–9, plus threats abound. Don't mark XP.</li>
						</ul>
						<p class="stonetop-season-note">Whatever the result, reset Fortunes to +1.</p>
						${fortunesBtns}
					</div>
				</div>`;
			}

			let dialog;
			dialog = new Dialog({
				title: `Seasons Change — ${label}`,
				content,
				buttons: { done: { label: "Done" } },
				render: (html) => {
					const root = html[0];

					root.querySelector("[data-action='roll-fortunes']")?.addEventListener("click", () => {
						this._onSteadingRoll("Seasons Change", "fortunes");
					});

					root.querySelector("[data-action='reset-fortunes']")?.addEventListener("click", async () => {
						await this._stonetopSteading.setSystemValue("stats.fortunes.value", 1);
						this.render(false);
						ui.notifications.info("Fortunes reset to +1.");
					});

					root.querySelector("[data-action='roll-surplus']")?.addEventListener("click", async () => {
						const formula = seasonId === "summer" ? "1d4 - 1" : "1d4";
						const roll = await new Roll(formula).evaluate();
						const gain = Math.max(0, roll.total);
						await roll.toMessage({ flavor: `Surplus Generation (${label})` });
						await this._stonetopSteading.setSystemValue("attributes.surplus.value", surplus + gain);
						this.render(false);
						ui.notifications.info(`Generated ${gain} Surplus. New total: ${surplus + gain}.`);
					});

					// Winter — consumption roll
					root.querySelector("[data-action='roll-consumption']")?.addEventListener("click", async () => {
						const popAbs = Math.abs(population);
						const formula = population >= 0 ? `1d4 + ${population}` : `1d4 - ${popAbs}`;
						const roll = await new Roll(formula).evaluate();
						const consumption = Math.max(0, roll.total);
						await roll.toMessage({ flavor: "Winter Surplus Consumption" });

						root.querySelector("#stonetop-winter-step1").hidden = true;
						root.querySelector("#stonetop-winter-step2").hidden = false;
						root.querySelector("#stonetop-winter-result").textContent =
							`Roll: ${consumption}. Surplus needed: ${consumption}, available: ${surplus}.`;

						if (surplus >= consumption) {
							root.querySelector("#stonetop-winter-ok").hidden = false;
							root.querySelector("[data-action='apply-consumption']").addEventListener("click", async () => {
								await this._stonetopSteading.setSystemValue("attributes.surplus.value", surplus - consumption);
								this.render(false);
								root.querySelector("#stonetop-winter-ok").hidden = true;
								root.querySelector("#stonetop-winter-step3").hidden = false;
								ui.notifications.info(`Consumed ${consumption} Surplus. Remaining: ${surplus - consumption}.`);
							});
						} else {
							root.querySelector("#stonetop-winter-shortfall").hidden = false;
							root.querySelectorAll("[data-consequence]").forEach(el => {
								el.addEventListener("click", async () => {
									const newFortunes = Math.max(fortunes - 1, -1);
									await this._stonetopSteading.setSystemValue("attributes.surplus.value", 0);
									await this._stonetopSteading.setSystemValue("stats.fortunes.value", newFortunes);
									if (el.dataset.consequence === "population") {
										const newPop = Math.max(population - 1, -1);
										await this._stonetopSteading.setSystemValue("attributes.population.value", newPop);
										ui.notifications.info(`Shortfall: Surplus → 0, Fortunes → ${_signedNum(newFortunes)}, Population → ${_signedNum(newPop)}.`);
									} else {
										ui.notifications.info(`Shortfall: Surplus → 0, Fortunes → ${_signedNum(newFortunes)}. Apply the narrative consequence.`);
									}
									this.render(false);
									root.querySelector("#stonetop-winter-step2").hidden = true;
									root.querySelector("#stonetop-winter-step3").hidden = false;
								});
							});
						}
					});
				},
			});
			dialog.render(true);
		}

		async _onSteadingRoll(moveName, statKey) {
			if (!statKey) return;
			const diminished = this._stonetopSteading.getSystemValue("attributes.debilities.options.diminished.value", false);
			const lacking = this._stonetopSteading.getSystemValue("attributes.debilities.options.lacking.value", false);
			const options = {
				moveName,
				statValue: this._stonetopSteading.getStatValue(statKey),
			};
			if (diminished && DIMINISHED_MOVES.has(moveName)) {
				options.rollMode = "dis";
				options.stonetopDebility = "Diminished";
				options.stonetopDebilityTooltip = "Disadvantage to Deploy, Muster, or Pull Together.";
			}
			if (lacking && statKey === "prosperity") {
				options.statValue -= 1;
				options.stonetopDebility = "Lacking";
				options.stonetopDebilityTooltip = "Treat Prosperity as 1 lower.";
			}
			await rollStat(statKey, this.actor, {
				...options,
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
