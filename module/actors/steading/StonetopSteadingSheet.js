import { IMPROVEMENT_DEFINITIONS, STEADING_DEFAULTS } from "./StonetopSteading.js";
import {rollStat} from "../../utils/roll-engine.js";
import {SteadingLedger} from "./SteadingLedger.js";
import {escHtml} from "../../utils/strings.js";
import {postMoveToChat} from "../../utils/chat.js";

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
  <img src="systems/stonetop_pwd/assets/icons/seasons/spring_icon.webp" class="stonetop-season-row-icon" alt="Spring">
  <div><strong>Spring</strong> — The <em>most hopeful</em> rolls +Fortunes. <strong>10+:</strong> pick 1 seasonal gain. <strong>7–9:</strong> pick 1 gain, but a threat makes itself known. <strong>6−:</strong> threats abound; don't mark XP. Reset Fortunes to +1.</div>

  <img src="systems/stonetop_pwd/assets/icons/seasons/summer_icon.webp" class="stonetop-season-row-icon" alt="Summer">
  <div><strong>Summer</strong> — The <em>most content</em> rolls +Fortunes. <strong>10+:</strong> pick 2 seasonal gains. <strong>7–9:</strong> pick 1. <strong>6−:</strong> a threat makes itself known; don't mark XP. The steading generates 1d4−1 Surplus. Reset Fortunes to +1.</div>

  <img src="systems/stonetop_pwd/assets/icons/seasons/fall_icon.webp" class="stonetop-season-row-icon" alt="Autumn">
  <div><strong>Autumn</strong> — The <em>most determined</em> rolls +Fortunes. <strong>10+:</strong> pick 1 seasonal gain. <strong>7–9:</strong> pick 1 gain, but a threat makes itself known. <strong>6−:</strong> threats abound; don't mark XP. The steading generates 1d4 Surplus at harvest. Reset Fortunes to +1.</div>

  <img src="systems/stonetop_pwd/assets/icons/seasons/winter_icon.webp" class="stonetop-season-row-icon" alt="Winter">
  <div><strong>Winter</strong> — The <em>weariest</em> rolls 1d4+Population (min 0); the steading consumes that much Surplus. If there isn't enough: Surplus → 0, Fortunes −1, pick 1 consequence. Then roll +Fortunes. Reset Fortunes to +1.</div>
</div>
<p class="stonetop-seasons-cta">Click <i class="fas fa-dice-d6"></i> to walk through the current season step by step.</p>`,
	},
	{
		slug: "pullTogether",
		label: "Pull Together",
		stat: "population",
		statLabel: "Population",
		rollable: true,
		interactive: true,
		description: `<p>When you <strong>set a community to work on improvements, to secure new resources, or to make major repairs</strong>, spend whatever the GM says is required and roll <strong>+Population</strong>.</p>
<p><strong>On a 10+:</strong> the job gets done.</p>
<p><strong>On a 7-9:</strong> pick 1: other work does not get done; the work is shoddy or crude; there is a consequence; or there is an unforeseen cost, requirement, or challenge.</p>
<p><em>Diminished debility: disadvantage on this roll.</em></p>`,
	},
	{
		slug: "muster",
		label: "Muster",
		stat: "population",
		statLabel: "Population",
		rollable: true,
		interactive: true,
		description: `<p>When <strong>Stonetop needs mustering against a threat</strong>, reduce Fortunes by 1 and roll <strong>+Population</strong>.</p>
<p><strong>On a 7+:</strong> the steading is alert and ready for action until the threat passes, the Seasons Change, or you cease to oversee the muster. On a 10+, also pick 2; on a 7-9, also pick 1.</p>
<ul>
  <li>Increase Defenses by 1 as long as the muster holds</li>
  <li>Everyone's willing to pitch in; don't reduce Fortunes after all</li>
  <li>The muster holds together even without your presence</li>
  <li>1 or 2 individuals show real potential; ask the GM who and how</li>
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
		description: `<p>When <strong>Stonetop's militia goes into action</strong>, say what they're doing and roll <strong>+Defenses</strong>.</p>
<p><strong>On a 7+:</strong> it gets done. On a 10+, choose 2; on a 7-9, choose 1.</p>
<ul>
  <li>It's more effective than expected</li>
  <li>It's quick, over soon</li>
  <li>It causes little collateral damage, expense, or blowback</li>
  <li>Someone involved distinguishes themselves</li>
</ul>
<p><strong>On a 6-:</strong> don't mark XP, and the GM chooses 2: it's less effective than expected; injuries abound and the steading marks diminished; or a named NPC involved dies.</p>
<p><em>Diminished debility: disadvantage on this roll.</em></p>`,
	},
	{
		slug: "tradeBarter",
		label: "Trade & Barter",
		stat: "prosperity",
		statLabel: "Prosperity",
		rollable: true,
		interactive: true,
		description: `<p>When you <strong>wish to acquire or sell a commonly available item</strong>, you can. When you seek to acquire or sell a special item, roll <strong>+Prosperity</strong> and subtract the item's Value. In winter, you have disadvantage.</p>
<p><strong>On a 10+:</strong> you can get it or sell it for a fair price.</p>
<p><strong>On a 7-9 when buying:</strong> the GM picks 1 complication.</p>`,
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
		description: `<p>When you <strong>borrow some of the steading's assets for an expedition</strong> or otherwise put them at risk, roll <strong>+Fortunes</strong>.</p>
<p><strong>On a 10+:</strong> go ahead, but bring it back safely.</p>
<p><strong>On a 7-9:</strong> you'll need to do some convincing.</p>
<p><strong>On a 6-:</strong> don't mark XP; you can take the asset with you if you want, but if you do, reduce Fortunes by 1.</p>`,
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
const _esc = escHtml;

function _formatResultLine(text) {
	return _esc(text).replace(/^(7\+|10\+|7-9|6-):/, "<strong>$1:</strong>");
}

const HOMESTEAD_MOVE_FLOWS = {
	pullTogether: {
		label: "Pull Together",
		stat: "population",
		statLabel: "Population",
		trigger: "When you set a community to work on improvements, to secure new resources, or to make major repairs, spend whatever the GM says is required and roll +Population.",
		fields: [
			{ name: "project", label: "Project", type: "text", placeholder: "What are you trying to build, repair, clear, or prepare?" },
			{ name: "approach", label: "Approach", type: "textarea", placeholder: "Who is helping, and how are you organizing the work?" },
			{ name: "cost", label: "Required cost", type: "textarea", placeholder: "Time, materiel, Surplus, coin, labor, or other requirements" },
		],
		picksLabel: "On a 7-9, pick 1:",
		picks: [
			"It gets done, but other work does not; reduce Fortunes by 1.",
			"It gets done, but the work is shoddy or crude.",
			"It gets done, but there is a consequence.",
			"There is an unforeseen cost, requirement, or challenge; address it and the job gets done.",
		],
		results: [
			"10+: the job gets done.",
			"7-9: the job gets done, but pick 1.",
			"6-: the GM says what happens; do not mark XP.",
		],
		note: "Diminished gives disadvantage on this roll.",
	},
	muster: {
		label: "Muster",
		stat: "population",
		statLabel: "Population",
		trigger: "When Stonetop needs mustering against a threat, reduce Fortunes by 1 and roll +Population.",
		beforeRoll: "musterCost",
		fields: [
			{ name: "threat", label: "Threat", type: "textarea", placeholder: "What is Stonetop mustering against?" },
			{ name: "overseer", label: "Who oversees the muster?", type: "text", placeholder: "A PC, NPC, council, or militia leader" },
			{ name: "orders", label: "Orders", type: "textarea", placeholder: "Where are they gathering, and what are they preparing to do?" },
		],
		picksLabel: "On a 10+, pick 2; on a 7-9, pick 1:",
		picks: [
			"Increase Defenses by 1 as long as the muster holds.",
			"Everyone is willing to pitch in; do not reduce Fortunes after all.",
			"The muster holds together even without your presence.",
			"1 or 2 individuals show real potential; ask the GM who and how.",
		],
		results: [
			"7+: the steading is alert and ready for action until the threat passes, the Seasons Change, or you cease to oversee the muster.",
			"10+: also pick 2.",
			"7-9: also pick 1.",
			"6-: the GM says what happens; do not mark XP.",
		],
		note: "Diminished gives disadvantage on this roll.",
	},
	deploy: {
		label: "Deploy",
		stat: "defenses",
		statLabel: "Defenses",
		trigger: "When Stonetop's militia goes into action, say what they're doing and roll +Defenses.",
		fields: [
			{ name: "action", label: "Action", type: "textarea", placeholder: "What is the militia doing?" },
			{ name: "objective", label: "Objective", type: "text", placeholder: "Drive them off, hold the ford, protect evacuees..." },
			{ name: "support", label: "Support", type: "textarea", placeholder: "Which force, fortification, tactic, or leader matters here?" },
		],
		picksLabel: "On a 10+, choose 2; on a 7-9, choose 1:",
		picks: [
			"It is more effective than expected.",
			"It is quick, over soon.",
			"It causes little collateral damage, expense, or blowback.",
			"Someone involved distinguishes themselves.",
		],
		consequencesLabel: "On a 6-, the GM chooses 2:",
		consequences: [
			"It is less effective than expected.",
			"Injuries abound; the steading marks diminished.",
			"The GM picks a named NPC involved in the action; they die.",
		],
		results: [
			"7+: it gets done.",
			"10+: choose 2.",
			"7-9: choose 1.",
			"6-: do not mark XP; the GM chooses 2 consequences.",
		],
		note: "Diminished gives disadvantage on this roll.",
	},
	tradeBarter: {
		label: "Trade & Barter",
		stat: "prosperity",
		statLabel: "Prosperity",
		trigger: "When you seek to acquire or sell a special item, roll +Prosperity and subtract the item's Value. In winter, roll with disadvantage.",
		fields: [
			{ name: "want", label: "What do you want to buy or sell?", type: "textarea", placeholder: "Item, service, animal, coin, Surplus, or trade goods" },
			{ name: "value", label: "Item Value", type: "number", placeholder: "0", min: 0 },
			{ name: "partner", label: "Trade partner", type: "text", placeholder: "Who are you dealing with?" },
			{ name: "offer", label: "Offer or price", type: "textarea", placeholder: "What is being offered, paid, or risked?" },
			{ name: "winter", label: "It is winter", type: "checkbox" },
		],
		results: [
			"Commonly available item: you can acquire or sell it without rolling.",
			"10+: you can get it or sell it for a fair price.",
			"7-9 when buying: the GM picks 1 complication.",
			"6-: the GM says what happens; do not mark XP.",
		],
		note: "Lacking treats Prosperity as 1 lower. Subtract item Value as a modifier.",
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
			return "systems/stonetop_pwd/templates/actor/steading.hbs";
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
			context.stonetop.hideUnearnedImprovements = this.actor.getFlag("stonetop_pwd", "hideUnearnedImprovements") ?? false;
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
				else if (moveSlug === "requisition") this._onRequisitionWalkthrough();
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
				this.actor.setFlag("stonetop_pwd", "hideUnearnedImprovements", cb.checked);
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

			// Neighbor details
			html[0].addEventListener("change", ev => {
				const inp = ev.target.closest(".steading-neighbor-input");
				if (!inp) return;
				ev.stopPropagation();
				const { index, field } = inp.dataset;
				this._onNeighborChange(parseInt(index), field, inp.value);
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

			// Drag-and-drop for adding neighbors
			const neighborsSection = html[0].querySelector(".steading-neighbors-section");
			if (neighborsSection) {
				neighborsSection.addEventListener("dragover", (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					ev.dataTransfer.dropEffect = "copy";
					neighborsSection.classList.add("drag-over");
				}, true);

				neighborsSection.addEventListener("dragleave", (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					neighborsSection.classList.remove("drag-over");
				}, true);

				neighborsSection.addEventListener("drop", async (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					neighborsSection.classList.remove("drag-over");
					const data = TextEditor.getDragEventData(ev);
					if (data?.type === "Actor" && data.uuid) {
						const actor = await fromUuid(data.uuid);
						if (actor && actor.type === "character") {
							await this._onDropCharacterNeighbor(actor);
						}
					}
				}, true);
			}
		}

		_onHomesteadMove(moveSlug) {
			const flow = HOMESTEAD_MOVE_FLOWS[moveSlug];
			if (!flow) return;

			const fieldHtml = flow.fields.map(field => {
				const common = `name="${_esc(field.name)}" placeholder="${_esc(field.placeholder)}"`;
				const control = field.type === "textarea"
					? `<textarea ${common} rows="2"></textarea>`
					: field.type === "number"
						? `<input type="number" ${common} min="${field.min ?? 0}" value="${field.value ?? ""}">`
						: field.type === "checkbox"
							? `<input type="checkbox" name="${_esc(field.name)}" value="yes">`
							: `<input type="text" ${common}>`;
				return `<label class="stonetop-homestead-field">
					<span>${_esc(field.label)}</span>
					${control}
				</label>`;
			}).join("");

			const picksHtml = flow.picks?.length
				? `<div class="stonetop-homestead-reference">
					<strong>${_esc(flow.picksLabel ?? "Choose from:")}</strong>
					<div class="stonetop-homestead-choice-list">
						${flow.picks.map((item, index) => `<label class="stonetop-homestead-choice">
							<input type="checkbox" name="pick.${index}" value="${_esc(item)}">
							<span>${_esc(item)}</span>
						</label>`).join("")}
					</div>
				</div>`
				: "";

			const consequencesHtml = flow.consequences?.length
				? `<div class="stonetop-homestead-reference">
					<strong>${_esc(flow.consequencesLabel ?? "Consequences")}</strong>
					<div class="stonetop-homestead-choice-list">
						${flow.consequences.map((item, index) => `<label class="stonetop-homestead-choice">
							<input type="checkbox" name="consequence.${index}" value="${_esc(item)}">
							<span>${_esc(item)}</span>
						</label>`).join("")}
					</div>
					${flow.label === "Deploy" ? `<button type="button" class="stonetop-season-btn" data-action="mark-diminished"><i class="fas fa-band-aid"></i> Mark diminished</button>` : ""}
				</div>`
				: "";

			const resultsHtml = `<div class="stonetop-homestead-reference">
				<strong>Results</strong>
				<ul>${flow.results.map(item => `<li>${_formatResultLine(item)}</li>`).join("")}</ul>
			</div>`;

			const dialog = new Dialog({
				title: flow.label,
				content: `<form class="stonetop-homestead-dialog">
					<p class="stonetop-homestead-trigger"><em>${_esc(flow.trigger)}</em></p>
					<div class="stonetop-homestead-fields">${fieldHtml}</div>
					${resultsHtml}
					${picksHtml}
					${consequencesHtml}
					<p class="stonetop-homestead-note">${_esc(flow.note)}</p>
				</form>`,
				buttons: {
					cancel: { label: "Cancel" },
					post: {
						label: "Post",
						callback: html => this._postHomesteadMoveSummary(flow, html),
					},
					roll: {
						label: `Roll +${flow.statLabel}`,
						callback: async html => {
							await this._postHomesteadMoveSummary(flow, html);
							await this._applyHomesteadBeforeRoll(flow);
							await this._onSteadingRoll(flow.label, flow.stat, this._homesteadRollOptions(flow, html));
						},
					},
				},
				default: "roll",
				render: (html) => {
					html[0].querySelector("[data-action='mark-diminished']")?.addEventListener("click", async () => {
						await this._stonetopSteading.setSystemValue("attributes.debilities.options.diminished.value", true);
						this.render(false);
						ui.notifications.info("Stonetop marked diminished.");
					});
				},
			}, {
				width: 520,
			});
			dialog.render(true);
		}

		_formDataFromDialog(html) {
			const form = html[0]?.querySelector(".stonetop-homestead-dialog");
			return form ? Object.fromEntries(new FormData(form)) : {};
		}

		async _applyHomesteadBeforeRoll(flow) {
			if (flow.beforeRoll !== "musterCost") return;
			const fortunes = this._stonetopSteading.getStatValue("fortunes");
			await this._stonetopSteading.setSystemValue("stats.fortunes.value", Math.max(fortunes - 1, -1));
			this.render(false);
			ui.notifications.info(`Muster cost applied: Fortunes ${ _signedNum(fortunes) } -> ${ _signedNum(Math.max(fortunes - 1, -1)) }.`);
		}

		_homesteadRollOptions(flow, html) {
			if (flow.label !== "Trade & Barter") return {};
			const data = this._formDataFromDialog(html);
			const value = Math.max(0, parseInt(data.value) || 0);
			return {
				modifier: value ? -value : 0,
				rollMode: data.winter ? "dis" : undefined,
			};
		}

		async _postHomesteadMoveSummary(flow, html) {
			const data = this._formDataFromDialog(html);
			const rows = flow.fields
				.map(field => {
					const raw   = data[field.name];
					const value = field.type === "checkbox"
						? (raw ? "yes" : "")
						: String(raw ?? "").trim();
					return value ? { label: field.label, value } : null;
				})
				.filter(Boolean);

			const selectedPicks = Object.entries(data)
				.filter(([key]) => key.startsWith("pick.") || key.startsWith("consequence."))
				.map(([, value]) => String(value ?? "").trim())
				.filter(Boolean);
			if (selectedPicks.length) rows.push({ label: "Selected", value: selectedPicks.join("\n") });

			postMoveToChat(this.actor, flow.label, rows);
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
						cancel: { label: "Cancel" },
						apply: {
							label: "Apply",
							callback: async () => {
								await this._stonetopSteading.setSystemValue("stats.fortunes.value", newFortunes);
								this.render(false);
							},
						},
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

		async _onRequisitionWalkthrough() {
			const fortunes = this._stonetopSteading.getStatValue("fortunes");
			const newFortunes = Math.max(fortunes - 1, -1);
			const requisitionFlow = {
				label: "Requisition",
				fields: [
					{ name: "asset", label: "Asset" },
					{ name: "risk", label: "Risk" },
					{ name: "convincing", label: "Who needs convincing?" },
				],
			};

			const dialog = new Dialog({
				title: "Requisition",
				content: `<form class="stonetop-homestead-dialog">
					<p class="stonetop-homestead-trigger"><em>When you borrow some of the steading's assets for an expedition or otherwise put them at risk, roll +Fortunes.</em></p>
					<div class="stonetop-homestead-fields">
						<label class="stonetop-homestead-field">
							<span>Asset</span>
							<input type="text" name="asset" placeholder="Horse team, wagon, plow, common asset...">
						</label>
						<label class="stonetop-homestead-field">
							<span>Risk</span>
							<textarea name="risk" rows="2" placeholder="Where is it going, and how might it be lost or damaged?"></textarea>
						</label>
						<label class="stonetop-homestead-field">
							<span>Who needs convincing?</span>
							<input type="text" name="convincing" placeholder="Owner, family, council, militia, publican...">
						</label>
					</div>
					<div class="stonetop-homestead-reference">
						<strong>Results</strong>
						<ul>
							<li><strong>10+:</strong> go ahead, but bring it back safely.</li>
							<li><strong>7-9:</strong> you will need to do some convincing.</li>
							<li><strong>6-:</strong> do not mark XP; you can take the asset, but if you do, reduce Fortunes by 1.</li>
						</ul>
					</div>
					<div class="stonetop-season-actions">
						<button type="button" class="stonetop-season-btn" data-action="miss-cost">
							<i class="fas fa-arrow-down"></i> Take it on a miss: Fortunes ${_signedNum(fortunes)} -> ${_signedNum(newFortunes)}
						</button>
					</div>
				</form>`,
				buttons: {
					cancel: { label: "Cancel" },
					post: {
						label: "Post",
						callback: html => this._postHomesteadMoveSummary(requisitionFlow, html),
					},
					roll: {
						label: "Roll +Fortunes",
						callback: async html => {
							await this._postHomesteadMoveSummary(requisitionFlow, html);
							await this._onSteadingRoll("Requisition", "fortunes");
						},
					},
				},
				default: "roll",
				render: (html) => {
					html[0].querySelector("[data-action='miss-cost']")?.addEventListener("click", async () => {
						await this._stonetopSteading.setSystemValue("stats.fortunes.value", newFortunes);
						this.render(false);
						ui.notifications.info(`Fortunes reduced to ${_signedNum(newFortunes)}.`);
					});
				},
			}, { width: 520 });
			dialog.render(true);
		}

		async _onSeasonsChange() {
			const SEASONS = [
				{ id: "spring", label: "Spring" },
				{ id: "summer", label: "Summer" },
				{ id: "autumn", label: "Autumn" },
				{ id: "winter", label: "Winter" },
			];
			const iconSrc = id => `systems/stonetop_pwd/assets/icons/seasons/${id === "autumn" ? "fall" : id}_icon.webp`;

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
			const malcontent = this._stonetopSteading.getSystemValue("attributes.debilities.options.malcontent.value", false);
			const resetFortunes = malcontent ? 0 : 1;

			const label   = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" }[seasonId];
			const iconSrc = `systems/stonetop_pwd/assets/icons/seasons/${seasonId === "autumn" ? "fall" : seasonId}_icon.webp`;

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
					<i class="fas fa-undo"></i> Reset Fortunes to ${_signedNum(resetFortunes)}
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
				<div class="stonetop-season-actions">
					<button class="stonetop-season-btn" data-action="gain-population">
						<i class="fas fa-users"></i> Apply Population boom: Population ${_signedNum(population)} -> ${_signedNum(Math.min(population + 1, 3))}
					</button>
					<button class="stonetop-season-btn" data-action="gain-surplus">
						<i class="fas fa-plus"></i> Apply Unexpected bounty: Surplus ${surplus} -> ${surplus + 1}
					</button>
				</div>
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
						await this._stonetopSteading.setSystemValue("stats.fortunes.value", resetFortunes);
						this.render(false);
						ui.notifications.info(`Fortunes reset to ${_signedNum(resetFortunes)}.`);
					});

					root.querySelector("[data-action='gain-population']")?.addEventListener("click", async () => {
						const newPopulation = Math.min(population + 1, 3);
						await this._stonetopSteading.setSystemValue("attributes.population.value", newPopulation);
						this.render(false);
						ui.notifications.info(`Population increased to ${_signedNum(newPopulation)}.`);
					});

					root.querySelector("[data-action='gain-surplus']")?.addEventListener("click", async () => {
						await this._stonetopSteading.setSystemValue("attributes.surplus.value", surplus + 1);
						this.render(false);
						ui.notifications.info(`Surplus increased to ${surplus + 1}.`);
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

		async _onSteadingRoll(moveName, statKey, rollOptions = {}) {
			if (!statKey) return;
			const diminished = this._stonetopSteading.getSystemValue("attributes.debilities.options.diminished.value", false);
			const lacking = this._stonetopSteading.getSystemValue("attributes.debilities.options.lacking.value", false);
			const options = {
				...rollOptions,
				moveName,
				statValue: this._stonetopSteading.getStatValue(statKey),
			};
			if (rollOptions.statValue !== undefined) options.statValue = rollOptions.statValue;
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
			if (!arr[index]) return;
			arr[index].checked = checked;
			await this._stonetopSteading.setFlags({ [list]: arr });
		}

		async _onListItemAdd(list) {
			if (list === "neighbors") {
				const f = this._stonetopSteading._flags;
				const arr = foundry.utils.deepClone(f.neighbors ?? STEADING_DEFAULTS.neighbors);
				arr.push({ name: "", origin: "", trait: "", checked: false });
				await this._stonetopSteading.setFlags({ neighbors: arr });
				this.render(false);
				return;
			}
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

		async _onNeighborChange(index, field, value) {
			if (!["name", "origin", "trait"].includes(field)) return;
			const f = this._stonetopSteading._flags;
			const neighbors = foundry.utils.deepClone(f.neighbors ?? STEADING_DEFAULTS.neighbors);
			if (!neighbors[index]) neighbors[index] = { name: "", origin: "", trait: "", checked: false };
			neighbors[index][field] = value;
			await this._stonetopSteading.setFlags({ neighbors });
		}

		async _onDropCharacterNeighbor(actor) {
			const f = this._stonetopSteading._flags;
			const neighbors = foundry.utils.deepClone(f.neighbors ?? STEADING_DEFAULTS.neighbors);
			
			// Check if this character is already a neighbor
			const existingIdx = neighbors.findIndex(n => 
				n.name?.toLowerCase().trim() === actor.name?.toLowerCase().trim()
			);
			
			if (existingIdx >= 0) {
				// Character already exists, just highlight/focus it
				ui.notifications?.info?.(`${actor.name} is already in the neighbors list.`);
				this.render(false);
				return;
			}
			
			// Add character as a new neighbor
			neighbors.push({
				name: actor.name,
				origin: "",
				trait: "",
				checked: true,
			});
			
			await this._stonetopSteading.setFlags({ neighbors });
			this.render(false);
			ui.notifications?.info?.(`Added ${actor.name} to neighbors.`);
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
