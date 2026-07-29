import { StonetopDialog } from "../../utils/stonetop-dialog.js";
import { book2ArtRoot } from "../../book2-art/art-root.js";

/**
 * The "People of Stonetop" portrait gallery: pick an imported book illustration as a
 * resident's or neighbor's portrait on the steading sheet.
 *
 * The images are the ones a GM tagged as people in the local art picker and imported from
 * their own book PDF (they are copyrighted, so nothing ships). Which of them are on disk, and
 * what to label each, is broadcast in the world-scoped `peopleArt` setting — a { manifest out
 * path -> display name } map published by the Import Book Art macro and book2-art/reapply.js.
 * Reading that setting (instead of browsing files) is what lets this work for players too, who
 * cannot FilePicker.browse. Each `out` resolves against the durable art folder (`book2ArtRoot`),
 * the exact path the index checked for, so a listed portrait always loads.
 *
 * Falls back to a normal FilePicker via "Browse files…" for a custom image (offered only to a
 * user who can browse), and "Use default" clears the portrait back to the placeholder.
 */
export class PeopleGalleryDialog extends StonetopDialog {
	constructor({ current = "", canBrowse = false, onPick, onBrowse, onClear } = {}, options = {}) {
		super(options);
		this._current = current;
		this._canBrowse = canBrowse;
		this._onPick = onPick;
		this._onBrowse = onBrowse;
		this._onClear = onClear;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-people-gallery",
			title: "People of Stonetop",
			template: "systems/stonetop-pwd/templates/dialogs/people-gallery.hbs",
			width: 640,
			height: "auto",
			resizable: true,
			classes: ["stonetop", "stonetop-people-gallery"],
		});
	}

	/** The broadcast { out -> name } index, tolerant of an unregistered/legacy setting. */
	_peopleIndex() {
		try {
			const idx = game.settings.get("stonetop-pwd", "peopleArt");
			return idx && typeof idx === "object" && !Array.isArray(idx) ? idx : {};
		} catch (_) {
			return {};
		}
	}

	getData() {
		const idx = this._peopleIndex();
		const root = book2ArtRoot();
		const people = Object.entries(idx).map(([out, name]) => {
			const src = `${root}/${out}`;
			return { out, name, src, selected: src === this._current };
		});
		people.sort((a, b) => (a.name || "").localeCompare(b.name || "") || a.out.localeCompare(b.out));
		return { people, canBrowse: this._canBrowse };
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];

		root.querySelectorAll(".stonetop-people-pick").forEach(btn => {
			btn.addEventListener("click", async () => {
				const src = btn.dataset.src;
				if (!src) return;
				await this._onPick?.(src);
				this.close();
			});
		});

		// Close first so the gallery isn't stacked over the FilePicker it opens.
		root.querySelector(".stonetop-people-browse")?.addEventListener("click", () => {
			this.close();
			this._onBrowse?.();
		});

		root.querySelector(".stonetop-people-clear")?.addEventListener("click", async () => {
			await this._onClear?.();
			this.close();
		});

		root.querySelector(".stonetop-people-cancel")?.addEventListener("click", () => this.close());
	}
}
