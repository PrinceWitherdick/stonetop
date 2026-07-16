import { getSetting, setSetting } from "../settings.js";
import { enrichHTML } from "../utils/foundry-compat.js";
import { findVisibleJournal, settingOverviewPages, SETTING_OVERVIEW_JOURNAL } from "../utils/seeded-journals.js";
import { openOrFocus } from "../utils/open-or-focus.js";
import { applyGuideRail } from "../utils/guide-rail.js";
import { applyLocationTooltips } from "../locations/location-tooltips.js";
import { bringDialogToFront } from "../utils/front-on-open.js";
import { FoundryBasicsDialog } from "./FoundryBasicsDialog.js";
import { charactersOwnedBy } from "../utils/playbook-actors.js";
import { stonetopSteadingHeaderButton } from "../utils/world.js";
import { BOOK2_ART_MACRO_NAME, findBook2ArtWorldMacro, loadBook2ArtMacroSource } from "../book2-art/macro.js";

// ── WelcomeDialog ───────────────────────────────────────────────────────────
// A GM-only "first session" guide. Walks the GM through the Book I "Getting
// Started" steps (review the setting → set expectations → create characters →
// introduce the PCs → let spring burst forth), and turns the two interactive
// steps into one-click actions:
//   • Create characters — a roster of the world's players, each with a button
//     that mints a fresh character, hands that player ownership, and greets the
//     player with the creation intro on their screen — which walks them through
//     the playbook picker / onboarding and then opens their finished sheet. See
//     _maybeOpenCharacterCreation in hooks/Ready.js.
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

// Turn a character's onboardingProgress flag (+ its committed playbook, if any)
// into a short roster note — { playbook, text, status } where status keys the
// styling and playbook names the chosen playbook (committed wins; otherwise the
// in-progress pick the onboarding flow stamps onto the flag — see _launchOnboarding,
// since the GM can't read the player's local resume snapshot). With no flag, a
// character with no playbook yet hasn't been touched ("not started yet"); one that
// has a playbook is finished.
function progressLabel(p, playbook) {
	const hasPlaybook = !!playbook?.slug;
	// Committed name wins; before commit, fall back to the playbook stamped on the
	// progress flag (blank at the picker stage, where nothing is chosen yet).
	const name = (hasPlaybook ? playbook.name : p?.playbook) || "";
	// A committed playbook means creation is done (or was explicitly saved), so it
	// always reads "Finished" — even if a mid-creation "Save & close" or an edit pass
	// left a stale onboardingProgress flag behind that hasn't been cleared yet. The
	// live "picker"/"on page N" states only apply before a playbook is committed,
	// which is exactly when there's no playbook. `playbook` is attached once at the
	// return, so each branch only carries its own status text.
	const label =
		hasPlaybook          ? { text: "Finished", status: "finished" } :
		!p                   ? { text: "not started yet", status: "not-started" } :
		p.state === "picker" ? { text: "on playbook picker", status: "picker" } :
		p.state === "exited" ? { text: "exited onboarding", status: "exited" } :
		// "onboarding" — or a legacy flag with just step/total and no state. A
		// known page count reads "on page N of M"; otherwise (a partial/legacy flag
		// with no usable total) still show the player as mid-creation rather than
		// dropping them from the roster entirely.
		p.total > 0          ? { text: `on page ${p.step} of ${p.total}`, status: "onboarding" } :
		                       { text: "in character creation", status: "onboarding" };
	return { playbook: name, ...label };
}

// The guide's panels, in order, driving the left rail (like Run an Expedition /
// Make a Monster). `key` matches a `<section data-tab>` in the template and the
// rail button's `data-tab`; `title` labels the rail entry and the banner; `icon`
// is a Font Awesome 6 glyph. The overview is the landing panel; the six numbered
// entries are Book I's "Getting Started" steps, and `step` drives the banner's
// "Step N of 6" count (the overview has none).
const SECTIONS = [
	{ key: "overview",     title: "Getting started",       icon: "fa-signs-post" },
	{ key: "book-art",     title: "Bring in book art",     icon: "fa-images",         step: 1, optional: true },
	{ key: "setting",      title: "Review the setting",    icon: "fa-book-open",      step: 2 },
	{ key: "expectations", title: "Set expectations",      icon: "fa-scale-balanced", step: 3 },
	{ key: "characters",   title: "Create characters",     icon: "fa-user-plus",      step: 4 },
	{ key: "introduce",    title: "Introduce the PCs",     icon: "fa-users",          step: 5 },
	{ key: "spring",       title: "Let spring burst forth", icon: "fa-seedling",      step: 6 },
];
const STEP_COUNT = SECTIONS.filter(s => s.step).length;

export class WelcomeDialog extends Application {
	constructor(options = {}) {
		super(options);
		this._hooks = null;
		// Which rail panel is showing; preserved across the roster's live re-renders
		// (see _registerHooks) so refreshing the player list doesn't snap back to the top.
		this._activeTab = SECTIONS[0].key;
	}

	static open() {
		return openOrFocus("stonetop-welcome", () => new WelcomeDialog().render(true));
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-welcome",
			title:     "Welcome to Stonetop",
			template:  "systems/stonetop_pwd/templates/dialogs/welcome.hbs",
			// Left-rail tabbed sheet (like Run an Expedition / Make a Monster): the rail
			// keeps the window short by showing one step at a time, so it needs less height
			// than the old single-scroll guide and a touch more width for the rail.
			width:     660,
			height:    580,
			resizable: true,
			classes:   ["stonetop", "stonetop-welcome-dialog"],
			// Preserve the reader's place within the active panel when the roster
			// re-renders (e.g. after minting a character), instead of snapping to the top.
			scrollY:   [".stonetop-welcome-main"],
		});
	}

	// "Stonetop" shortcut in the window header — mirrors the steading button on the
	// character sheet header (and the Introductions dialog) — so the GM can jump to
	// the steading sheet straight from the first-session guide.
	_getHeaderButtons() {
		const buttons = super._getHeaderButtons();
		buttons.unshift(stonetopSteadingHeaderButton());
		return buttons;
	}

	async getData() {
		// The premise can carry compendium `@UUID` links (e.g. the village "Stonetop"
		// entry). Those only resolve while enriching if that pack's index is already
		// loaded — and this guide often opens before anything else warms it, which
		// renders the link "broken". Load the index first so it always resolves.
		await game.packs.get("stonetop_pwd.stonetop-journal")?.getIndex();

		const players = game.users
			.filter(u => !u.isGM)
			.map(u => ({
				id:     u.id,
				name:   u.name,
				avatar: u.avatar,
				active: u.active,
				color:  String(u.color ?? ""),
				characters: charactersOwnedBy(u.id)
					.map(a => ({
						id: a.id, name: a.name, img: a.img,
						// Live creation progress, stamped by the player's creation flow (see
						// _setOnboardingState in StonetopCharacterSheet); cleared once they
						// finish, so a completed character shows no note.
						progress: progressLabel(
							a.getFlag?.("stonetop_pwd", "onboardingProgress"),
							a.system?.playbook,
						),
					})),
			}));

		const activeIndex = Math.max(0, SECTIONS.findIndex(s => s.key === this._activeTab));
		const active = SECTIONS[activeIndex];

		return {
			players,
			noPlayers:     players.length === 0,
			dontShowAgain: !!getSetting("gmWelcomeShown"),
			premiseHtml:   await enrichHTML(premiseSource()),
			// Left rail + banner. Only the first-render active state comes from here;
			// switching panels afterwards is client-side (see _selectTab), so the roster
			// and any partly-filled fields survive without a re-render.
			activeTab:     this._activeTab,
			sections:      SECTIONS.map((s, i) => ({ key: s.key, title: s.title, icon: s.icon, selected: i === activeIndex })),
			active:        { icon: active.icon, title: active.title, optional: !!active.optional, count: this._countLabel(activeIndex) },
			atFirst:       activeIndex === 0,
			atLast:        activeIndex === SECTIONS.length - 1,
		};
	}

	// Banner "Step N of 6" for the numbered steps; blank for the overview landing.
	_countLabel(index) {
		const step = SECTIONS[index]?.step;
		return step ? `Step ${step} of ${STEP_COUNT}` : "";
	}

	activateListeners(html) {
		super.activateListeners(html);

		// Give the premise's cross-links (e.g. the village "Stonetop" entry) their
		// hover summary, the same as journal sheets get — this dialog isn't a journal
		// render, so it isn't covered by the journal render hooks in stonetop.js.
		applyLocationTooltips(html);

		// Left-rail tabs + Back/Next: switch which step panel is shown, client-side. No
		// re-render, so the roster and any typed-in fields keep their state.
		html.find(".stonetop-welcome-tab").on("click", ev => this._selectTab(ev.currentTarget.dataset.tab));
		html.find(".stonetop-welcome-back").on("click", () => this._step(-1));
		html.find(".stonetop-welcome-next").on("click", () => this._step(1));

		html.find('[data-action="setting-overview"]').on("click", () => this._openSettingOverview());
		html.find('[data-action="agenda-principles"]').on("click", () => this._openSettingOverview("Agenda & Principles"));
		html.find('[data-action="foundry-basics"]').on("click", () => FoundryBasicsDialog.open());
		html.find('[data-action="introductions"]').on("click", () => this._openIntroductions());
		html.find('[data-action="spring-burst"]').on("click", () => this._openSpringBurst());
		html.find('[data-action="configure-players"]').on("click", () => this._openPlayerConfig());
		html.find('[data-action="import-book-art"]').on("click", () => this._runImportBookArt());
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

	// Walk the rail one panel at a time (Back/Next), stopping at the ends.
	_step(delta) {
		const index = SECTIONS.findIndex(s => s.key === this._activeTab);
		const next = SECTIONS[index + delta];
		if (next) this._selectTab(next.key);
	}

	// Show one step panel and light its rail entry, updating the banner (icon, title,
	// optional tag, count) and the Back/Next disabled state to match. Purely DOM — the
	// guide is never re-rendered, so switching panels preserves the roster and anything
	// the GM has already done. Mirrors CreateMonsterDialog._selectTab.
	_selectTab(key) {
		const index = SECTIONS.findIndex(s => s.key === key);
		if (index < 0) return;
		this._activeTab = key;
		const active = SECTIONS[index];
		const root = this.element;
		if (!root?.length) return;

		applyGuideRail(root[0], {
			key, dataKey: "tab",
			tabSelector: ".stonetop-welcome-tab",
			sectionSelector: ".stonetop-welcome-section",
			iconSelector: ".stonetop-welcome-banner-icon",
			icon: active.icon,
			iconExtraClass: "stonetop-welcome-banner-icon",
			mainSelector: ".stonetop-welcome-main",
		});

		root.find(".stonetop-welcome-banner-title").text(active.title);
		const optional = root.find(".stonetop-welcome-banner-optional")[0];
		if (optional) optional.hidden = !active.optional;
		const count = root.find(".stonetop-welcome-banner-count")[0];
		if (count) {
			const label = this._countLabel(index);
			count.textContent = label;
			count.hidden = !label;
		}

		const back = root.find(".stonetop-welcome-back")[0];
		if (back) back.disabled = index === 0;
		const next = root.find(".stonetop-welcome-next")[0];
		if (next) next.disabled = index === SECTIONS.length - 1;
	}

	// Open the shareable "Setting Overview" journal — the same one that auto-opens
	// for everyone — so the GM can reread it or show it to players. Pass a page name
	// to jump straight to it (e.g. the "Agenda & Principles" tab cited in step 2).
	// The journal is the sole source of this content now, so if it isn't
	// seeded/visible yet, say so rather than opening an empty reader.
	_openSettingOverview(pageName) {
		const journal = findVisibleJournal(SETTING_OVERVIEW_JOURNAL);
		if (!journal) {
			ui.notifications.warn("The Setting Overview journal isn't set up in this world yet.");
			return;
		}
		const page = pageName ? journal.pages.find(p => p.name === pageName) : null;
		journal.sheet.render(true, page ? { pageId: page.id } : {});
	}

	_openIntroductions() {
		openOrFocus("stonetop-introductions", () => game.stonetop?.openIntroductions?.());
	}

	// Walk the GM through Book I's "Let spring burst forth" step. SpringBurstDialog is
	// its own focus-singleton (it brings an already-open copy forward), so just open it.
	_openSpringBurst() {
		game.stonetop?.openSpringBurst?.();
	}

	// Launch the seeded "Import Book Art" macro (step 1). Prefer the world copy the
	// system seeds into the Macro Directory; if a GM deleted it, fall back to running
	// the shipped compendium copy directly. This is a GM-only dialog, so execution
	// is allowed. Leaves this guide open — the macro drives its own dialogs.
	async _runImportBookArt() {
		let macro = findBook2ArtWorldMacro();
		if (!macro) {
			const src = await loadBook2ArtMacroSource();
			if (src?.command) macro = new Macro({ name: BOOK2_ART_MACRO_NAME, type: "script", img: src.img, command: src.command, scope: "global" });
		}
		if (!macro) { ui.notifications.warn("The Import Book Art macro isn't set up in this world yet."); return; }
		macro.execute();
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

		// A player only ever has one character, so making a "New Character" for
		// someone who already has one is a replacement, not an addition. Confirm the
		// deletion before discarding their existing sheet — it can't be undone.
		const existing = charactersOwnedBy(userId);
		if (existing.length) {
			const names = existing.map(a => `<strong>${a.name}</strong>`).join(", ");
			const it    = existing.length === 1 ? "it" : "them";
			const confirmed = await Dialog.confirm({
				title:      `Replace ${user.name}'s character?`,
				content:
					`<p><strong>${user.name}</strong> already has a character assigned: ${names}.</p>` +
					`<p>Creating a new character will <strong>permanently delete</strong> ${it}. ` +
					`This can't be undone.</p>`,
				defaultYes: false,
				render:     bringDialogToFront,
			});
			if (!confirmed) return;

			try {
				await getDocumentClass("Actor").deleteDocuments(existing.map(a => a.id));
			} catch (err) {
				console.error("Stonetop | Welcome: failed to delete old character", err);
				ui.notifications.error(`Couldn't replace ${user.name}'s character.`);
				return;
			}
		}

		let actor;
		try {
			actor = await getDocumentClass("Actor").create({
				name:      `${user.name}'s Character`,
				type:      "character",
				ownership: { [userId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
				// The owner's client greets the player with the creation intro, then
				// clears this — on the next createActor, or on their next login. See
				// _maybeOpenCharacterCreation in hooks/Ready.js.
				flags:     { stonetop_pwd: { autoOpenFor: userId } },
			});
		} catch (err) {
			console.error("Stonetop | Welcome: failed to create character", err);
			ui.notifications.error(`Couldn't create a character for ${user.name}.`);
			return;
		}
		if (!actor) return;

		// Ownership alone only grants the player permission to edit the sheet — it
		// doesn't make this their character. Assign it as the user's player
		// character too, so Foundry treats it as their PC everywhere (the player
		// list, token assignment, default speaker, "release control", etc.).
		try {
			await user.update({ character: actor.id });
		} catch (err) {
			console.error("Stonetop | Welcome: failed to assign character to player", err);
			ui.notifications.warn(`Created “${actor.name}” but couldn't set it as ${user.name}'s character.`);
		}

		if (user.active) {
			ui.notifications.info(`Created “${actor.name}” and started character creation on ${user.name}'s screen.`);
		} else {
			ui.notifications.info(`Created “${actor.name}” for ${user.name}. It'll be waiting when they log in.`);
		}

		this.render(false);
	}

	// Keep the roster live while the dialog is open: players coming online/offline
	// and characters being created/assigned should refresh the list.
	_registerHooks() {
		if (this._hooks) return;
		// Debounced: a player clicking through onboarding writes the progress flag on
		// every page change (each broadcast to the GM), and several players creating
		// at once would otherwise trigger a burst of full roster re-renders.
		const refresh = foundry.utils.debounce(() => { if (this.rendered) this.render(false); }, 150);
		// The roster only reflects characters and their owners, so ignore actor
		// churn (monsters, HP ticks, token moves) that can't change what we show.
		const refreshIfCharacter = actor => { if (actor?.type === "character") refresh(); };
		this._hooks = [
			["userConnected", Hooks.on("userConnected", refresh)],
			["createActor",   Hooks.on("createActor",   refreshIfCharacter)],
			["deleteActor",   Hooks.on("deleteActor",   refreshIfCharacter)],
			["updateActor",   Hooks.on("updateActor", (actor, changes) => {
				if (actor?.type !== "character") return;
				if ("name" in changes || "img" in changes || "ownership" in changes) { refresh(); return; }
				// Onboarding progress writes (and the unset on completion, which arrives
				// as a "-=onboardingProgress" key) should update the page count live.
				const stFlags = changes.flags?.stonetop_pwd;
				if (stFlags && Object.keys(stFlags).some(k => k.replace(/^-=/, "") === "onboardingProgress")) refresh();
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
