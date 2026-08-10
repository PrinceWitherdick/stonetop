// ── CharacterCreationDialog ──────────────────────────────────────────────────
// The player-facing first step of character creation. When the GM mints a fresh
// character from the Welcome guide, the owning client greets the player with this
// modal instead of dropping them onto a blank sheet (see _maybeOpenCharacterCreation
// in hooks/Ready.js). Its single "Create Character" button hands off to the sheet's
// guided flow — the playbook picker, then onboarding — and asks that flow to open
// the finished sheet once the player is done (see _onNewCharacter's
// `openSheetWhenDone`). Until then, the player never sees an empty sheet.

import { findOpenApp } from "../../../utils/open-windows.js";
import { trackCreationFlow } from "../creation-flow.js";

export class CharacterCreationDialog extends Application {
	constructor(actor, options = {}) {
		super(options);
		this._actor = actor;
	}

	/**
	 * Greet a player with this intro, at most once on screen.
	 *
	 * Every instance shares the `stonetop-character-creation` DOM id, so opening a second
	 * while the first is up puts two elements with the same id in the document and leaves the
	 * loser unreachable. The two ways that happened: the ready-time sweep and the `createActor`
	 * hook both reaching the same character, and the GM replacing a character while its
	 * predecessor's greeting was still open.
	 */
	static async open(actor) {
		const existing = findOpenApp(w => w instanceof CharacterCreationDialog);
		// Already greeting them about this same character — surface it rather than stack.
		if (existing?.rendered && existing._actor?.id === actor?.id) {
			existing.bringToTop();
			return existing;
		}
		// A greeting for a DIFFERENT character (the GM just replaced this player's) points at a
		// document on its way out; retire it before opening the new one. AWAITED: close() fades
		// the old element out over 200ms, so injecting the replacement first would put two
		// elements with this id in the document — the very thing this exists to prevent.
		if (existing) await existing.close();
		// Registered against its character so a delete takes it with them (see creation-flow.js).
		return trackCreationFlow(new CharacterCreationDialog(actor), actor?.id).render(true);
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:       "stonetop-character-creation",
			template: "systems/stonetop-pwd/templates/dialogs/character-creation.hbs",
			title:    "Create Your Character",
			width:    480,
			height:   "auto",
			resizable: true,
			classes:  ["stonetop", "stonetop-charintro-dialog"],
		});
	}

	getData() {
		return {
			playerName:    game.user?.name ?? "",
			characterName: this._actor?.name ?? "",
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find(".stonetop-charintro-create").on("click", () => this._onCreate());
	}

	// Kick off the sheet's guided creation flow (picker → onboarding), asking it to
	// pop the sheet open when the player finishes, then close this intro so the
	// picker has the screen to itself. The sheet instance exists even though it has
	// never been rendered — `actor.sheet` instantiates it lazily.
	_onCreate() {
		this._actor?.sheet?._onNewCharacter?.({ openSheetWhenDone: true });
		this.close();
	}
}
