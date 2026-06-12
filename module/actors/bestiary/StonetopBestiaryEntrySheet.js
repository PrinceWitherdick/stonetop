import { escHtml, isDefaultImg } from "../../utils/strings.js";
import { unlockForEditing, relockIfWeUnlocked } from "../../utils/compendium-edit.js";
import { buildCodexContext, onCodexClick, onCodexChange } from "./codex.js";

export function createStonetopBestiaryEntrySheetClass(Base) {
	return class StonetopBestiaryEntrySheet extends Base {
		_editMode = false;
		_weUnlockedPack = false;

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["stonetop", "sheet", "actor", "bestiary-entry"],
				width:   780,
				height:  760,
				tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "overview" }],
			});
		}

		get template() {
			return "systems/stonetop_pwd/templates/actor/bestiary-entry.hbs";
		}

		async _render(force, options) {
			await super._render(force, options);
			this._injectHeaderToggle();
			this._stripHeaderChrome();
			this.element[0]?.classList.toggle("stonetop-edit-mode", this._editMode);
			this._hideBrokenPortrait();
			this._hideBrokenStatBlockImgs();
		}

		_hideBrokenStatBlockImgs() {
			const imgs = this.element[0]?.querySelectorAll(".stonetop-entry-statblock-img");
			imgs?.forEach(img => {
				if (img.complete && img.naturalWidth === 0) { img.remove(); return; }
				img.addEventListener("error", () => img.remove(), { once: true });
			});
		}

		_hideBrokenPortrait() {
			if (this._editMode) return;
			const img = this.element[0]?.querySelector(".stonetop-portrait");
			if (!img) return;
			const header = img.closest(".stonetop-bestiary-header");
			const drop = () => {
				img.remove();
				header?.classList.add("stonetop-bestiary-header--no-portrait");
			};
			if (img.complete && img.naturalWidth === 0) { drop(); return; }
			img.addEventListener("error", drop, { once: true });
		}

		_stripHeaderChrome() {
			const header = this.element[0]?.querySelector(".window-header");
			header?.querySelectorAll(".document-id-link").forEach(el => el.remove());
		}

		_injectHeaderToggle() {
			const header = this.element[0]?.querySelector(".window-header");
			if (!header || !this.actor.isOwner) return;
			header.querySelector(".stonetop-header-toggle")?.remove();

			// Locked == viewed from a locked compendium. Show a lock affordance;
			// toggling it on unlocks the pack so the fields become editable.
			const locked = !this.isEditable;

			const label = document.createElement("label");
			label.className = "stonetop-edit-toggle stonetop-header-toggle";
			label.title = locked
				? "Unlock & edit (unlocks the compendium)"
				: (this._editMode ? "Lock Entry" : "Edit Entry");

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = this._editMode;
			checkbox.addEventListener("change", () => this._onToggleEdit(checkbox));

			const track = document.createElement("span");
			track.className = "stonetop-toggle-track";
			const thumb = document.createElement("span");
			thumb.className = "stonetop-toggle-thumb";
			const icon = document.createElement("i");
			icon.className = locked ? "fas fa-lock" : "fas fa-wrench";
			thumb.appendChild(icon);
			track.appendChild(thumb);
			label.appendChild(checkbox);
			label.appendChild(track);

			header.insertBefore(label, header.querySelector(".window-title"));
		}

		async _onToggleEdit(checkbox) {
			const turningOn = checkbox.checked;
			if (turningOn && !this.isEditable) {
				if (!await unlockForEditing(this)) { checkbox.checked = false; return; }
			}
			// Set the mode before re-locking: relocking the pack triggers an async
			// re-render, and if _editMode were still true that render would paint
			// edit-mode markup into a now-locked form (disabled inputs everywhere).
			this._editMode = turningOn;
			if (!turningOn) await relockIfWeUnlocked(this);
			this.render(false);
		}

		async close(options) {
			await relockIfWeUnlocked(this);
			return super.close(options);
		}

		_getHeaderButtons() {
			return super._getHeaderButtons().filter(b => b.class !== "configure-sheet");
		}

		async getData() {
			const context = await super.getData();
			const system = context.system ??= this.actor.system;
			context.stonetop ??= {};
			const st = context.stonetop;
			const edit = st.editMode = this._editMode;
			st.hasPortrait = !isDefaultImg(this.actor.img);

			// Codex content (description / Q&A / prep / discoveries / nests / dangers).
			Object.assign(st, await buildCodexContext(system, edit));

			st.statBlocks = await this._resolveStatBlocks(system?.statBlocks);

			// Tab visibility. Overview is always present (the landing tab); the rest
			// appear only when they hold content (always, in edit mode).
			st.showTab = {
				codex:       st.has.codex,
				prep:        st.has.prep,
				discoveries: st.has.discoveries,
				statBlocks:  edit || st.statBlocks.length > 0,
				notes:       st.has.notes,
			};

			return context;
		}

		async _resolveStatBlocks(uuids) {
			const list = Array.isArray(uuids) ? uuids : [];
			// Resolve independently-linked blocks in parallel, not one round-trip at a time.
			const docs = await Promise.all(list.map(uuid =>
				uuid === this.actor.uuid                       // never list the entry as its own stat block
					? null
					: fromUuid(uuid).catch(() => null)           // tolerate stale uuids
			));
			const resolved = [];
			docs.forEach((doc, i) => {
				if (!doc || doc.type !== "monster") return;
				const hp = doc.system?.attributes?.hp ?? {};
				resolved.push({
					uuid: list[i],
					name: doc.name,
					img: doc.img,
					hasImg: !isDefaultImg(doc.img),
					hpValue: hp.value ?? "",
					hpMax: hp.max ?? "",
					organization: doc.system?.organization ?? "",
				});
			});
			return resolved;
		}

		activateListeners(html) {
			super.activateListeners(html);
			const root = html[0];

			// Navigation works even when the sheet is read-only (e.g. viewed from
			// the compendium): open a linked stat block on click.
			root.addEventListener("click", async ev => {
				const open = ev.target.closest(".stonetop-entry-open-statblock");
				if (!open) return;
				const uuid = open.closest("[data-statblock-uuid]")?.dataset?.statblockUuid;
				const doc  = uuid ? await fromUuid(uuid).catch(() => null) : null;
				doc?.sheet?.render(true);
			});

			if (!this.isEditable) return;

			root.addEventListener("click", async ev => {
				if (await onCodexClick(this, ev)) return;
				const t = ev.target;

				if (t.closest(".stonetop-entry-create-statblock")) {
					if (!this._editMode) return;
					await this._createStatBlock();

				} else if (t.closest(".stonetop-entry-link-statblock")) {
					if (!this._editMode) return;
					await this._linkStatBlockDialog();

				} else if (t.closest(".stonetop-entry-unlink-statblock")) {
					if (!this._editMode) return;
					const uuid = t.closest("[data-statblock-uuid]")?.dataset?.statblockUuid;
					await this._unlinkStatBlock(uuid);
				}
			});

			root.addEventListener("change", ev => onCodexChange(this, ev));
		}

		/** The creature name without the " (Bestiary)" entry suffix. */
		_creatureName() {
			return this.actor.name.replace(/\s*\(Bestiary\)\s*$/i, "").trim() || this.actor.name;
		}

		async _createStatBlock() {
			const created = await Actor.create({
				name: this._creatureName(),
				type: "monster",
				folder: this.actor.folder?.id ?? null,
				"system.entry": this.actor.uuid,
			});
			if (!created) return;
			await this._appendStatBlock(created.uuid);
			created.sheet?.render(true);
		}

		async _linkStatBlockDialog() {
			const existing = new Set(Array.isArray(this.actor.system?.statBlocks) ? this.actor.system.statBlocks : []);
			const candidates = game.actors.filter(a => a.type === "monster" && !existing.has(a.uuid));
			if (!candidates.length) {
				ui.notifications?.warn("No unlinked monster stat blocks available.");
				return;
			}
			const options = candidates
				.map(a => `<option value="${a.uuid}">${escHtml(a.name)}</option>`)
				.join("");
			const content = `<p>Link an existing stat block to this entry:</p>
				<select class="stonetop-link-statblock-select" style="width:100%">${options}</select>`;
			const uuid = await Dialog.prompt({
				title: "Link Stat Block",
				content,
				label: "Link",
				callback: htmlEl => htmlEl.querySelector(".stonetop-link-statblock-select")?.value,
				rejectClose: false,
			});
			if (!uuid) return;
			await this._appendStatBlock(uuid);
			const doc = await fromUuid(uuid);
			if (doc && !doc.system?.entry) await doc.update({ "system.entry": this.actor.uuid });
		}

		async _appendStatBlock(uuid) {
			const current = Array.isArray(this.actor.system?.statBlocks) ? this.actor.system.statBlocks : [];
			if (current.includes(uuid)) return;
			await this.actor.update({ "system.statBlocks": [...current, uuid] });
		}

		async _unlinkStatBlock(uuid) {
			if (!uuid) return;
			const current = Array.isArray(this.actor.system?.statBlocks) ? this.actor.system.statBlocks : [];
			await this.actor.update({ "system.statBlocks": current.filter(u => u !== uuid) });
			const doc = await fromUuid(uuid);
			if (doc && doc.system?.entry === this.actor.uuid) await doc.update({ "system.entry": "" });
		}
	};
}
