import { getSetting, setSetting } from "../settings.js";
import { enrichHTML } from "../utils/foundry-compat.js";
import { findVisibleJournal, settingOverviewPages, SETTING_OVERVIEW_JOURNAL } from "../utils/seeded-journals.js";
import { openOrFocus } from "../utils/open-or-focus.js";

// ── WelcomeDialog ───────────────────────────────────────────────────────────
// A GM-only "first session" guide. Walks the GM through the Book I "Getting
// Started" steps (review the setting → set expectations → create characters →
// introduce the PCs → let spring burst forth), and turns the two interactive
// steps into one-click actions:
//   • Create characters — a roster of the world's players, each with a button
//     that mints a fresh character, hands that player ownership, and pops the
//     sheet open on their screen (where the big "Create Character" button takes
//     over). See _maybeAutoOpenCharacter in hooks/Ready.js.
//   • Introduce the PCs — launches the existing guided Introductions dialog.

// Premise blurb at the top of the guide, pulled from the seeded Setting Overview
// journal's premise page so there's only one copy of the prose to maintain. Its
// first paragraph is the hook; enriching it resolves the {Stonetop} @UUID link to
// this world's village journal. Falls back to a plain sentence if the journal
// hasn't been seeded/isn't visible yet.
const PREMISE_FALLBACK =
	"You play the heroes of <strong>Stonetop</strong>, an isolated village near the edge " +
	"of the known world. Adventures focus on dealing with threats to the village, seizing " +
	"opportunities for the village, or pursuing personal goals. Months or years might pass " +
	"between adventures.";

function premiseSource() {
	const firstPage = settingOverviewPages()[0];
	// Inner HTML of the page's first paragraph — the template already wraps it in
	// its own <p class="stonetop-welcome-lead">, so don't return the <p> itself.
	const firstParagraph = (firstPage?.text?.content ?? "").match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1];
	return firstParagraph ?? PREMISE_FALLBACK;
}

export class WelcomeDialog extends Application {
	constructor(options = {}) {
		super(options);
		this._hooks = null;
	}

	static open() {
		return openOrFocus("stonetop-welcome", () => new WelcomeDialog().render(true));
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-welcome",
			title:     "Welcome to Stonetop",
			template:  "systems/stonetop_pwd/templates/dialogs/welcome.hbs",
			width:     580,
			height:    680,
			resizable: true,
			classes:   ["stonetop", "stonetop-welcome-dialog"],
		});
	}

	async getData() {
		const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
		const players = game.users
			.filter(u => !u.isGM)
			.map(u => ({
				id:     u.id,
				name:   u.name,
				avatar: u.avatar,
				active: u.active,
				color:  String(u.color ?? ""),
				characters: game.actors
					.filter(a => a.type === "character" && (a.ownership?.[u.id] ?? 0) >= owner)
					.map(a => ({ id: a.id, name: a.name, img: a.img })),
			}));

		return {
			players,
			noPlayers:     players.length === 0,
			dontShowAgain: !!getSetting("gmWelcomeShown"),
			premiseHtml:   await enrichHTML(premiseSource()),
		};
	}

	activateListeners(html) {
		super.activateListeners(html);

		html.find('[data-action="setting-overview"]').on("click", () => this._openSettingOverview());
		html.find('[data-action="introductions"]').on("click", () => this._openIntroductions());
		html.find('[data-action="configure-players"]').on("click", () => this._openPlayerConfig());
		html.find(".stonetop-welcome-create").on("click", ev =>
			this._onCreateCharacter(ev.currentTarget.dataset.userId));
		html.find(".stonetop-welcome-player-char").on("click", ev => {
			const actor = game.actors.get(ev.currentTarget.dataset.actorId);
			actor?.sheet?.render(true);
		});
		html.find(".stonetop-welcome-dontshow-input").on("change", ev =>
			setSetting("gmWelcomeShown", ev.currentTarget.checked));

		this._registerHooks();
	}

	// Open the shareable "Setting Overview" journal — the same one that auto-opens
	// for everyone — so the GM can reread it or show it to players. The journal is
	// the sole source of this content now, so if it isn't seeded/visible yet, say
	// so rather than opening an empty reader.
	_openSettingOverview() {
		const journal = findVisibleJournal(SETTING_OVERVIEW_JOURNAL);
		if (journal) { journal.sheet.render(true); return; }

		ui.notifications.warn("The Setting Overview journal isn't set up in this world yet.");
	}

	_openIntroductions() {
		openOrFocus("stonetop-introductions", () => game.stonetop?.openIntroductions?.());
	}

	// Jump to Foundry's core "Configure Players" screen — the same full-page route
	// the gear-tab button uses. It navigates away from the game (the GM returns
	// once they've added users), so there's nothing to re-render here.
	_openPlayerConfig() {
		window.location.href = foundry.utils?.getRoute?.("players") ?? "/players";
	}

	// Mint a fresh character for the given player, hand them ownership, and flag it
	// to open on their screen. Only the GM ever sees this dialog, so we can assume
	// permission to create.
	async _onCreateCharacter(userId) {
		const user = game.users.get(userId);
		if (!user) return;

		let actor;
		try {
			actor = await getDocumentClass("Actor").create({
				name:      `${user.name}'s Character`,
				type:      "character",
				ownership: { [userId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
				// The owner's client opens (and clears) this on the next createActor,
				// or on their next login — see _maybeAutoOpenCharacter in hooks/Ready.js.
				flags:     { stonetop_pwd: { autoOpenFor: userId } },
			});
		} catch (err) {
			console.error("Stonetop | Welcome: failed to create character", err);
			ui.notifications.error(`Couldn't create a character for ${user.name}.`);
			return;
		}
		if (!actor) return;

		if (user.active) {
			ui.notifications.info(`Created “${actor.name}” and opened it on ${user.name}'s screen.`);
		} else {
			ui.notifications.info(`Created “${actor.name}” for ${user.name}. It'll be waiting when they log in.`);
		}

		this.render(false);
	}

	// Keep the roster live while the dialog is open: players coming online/offline
	// and characters being created/assigned should refresh the list.
	_registerHooks() {
		if (this._hooks) return;
		const refresh = () => { if (this.rendered) this.render(false); };
		// The roster only reflects characters and their owners, so ignore actor
		// churn (monsters, HP ticks, token moves) that can't change what we show.
		const refreshIfCharacter = actor => { if (actor?.type === "character") refresh(); };
		this._hooks = [
			["userConnected", Hooks.on("userConnected", refresh)],
			["createActor",   Hooks.on("createActor",   refreshIfCharacter)],
			["deleteActor",   Hooks.on("deleteActor",   refreshIfCharacter)],
			["updateActor",   Hooks.on("updateActor", (actor, changes) => {
				if (actor?.type !== "character") return;
				if ("name" in changes || "img" in changes || "ownership" in changes) refresh();
			})],
		];
	}

	_unregisterHooks() {
		if (!this._hooks) return;
		for (const [name, id] of this._hooks) Hooks.off(name, id);
		this._hooks = null;
	}

	async close(options = {}) {
		this._unregisterHooks();
		return super.close(options);
	}
}
