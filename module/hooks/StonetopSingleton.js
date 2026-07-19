import {escHtml} from "../utils/strings.js";
import {stonetopChatCard} from "../utils/chat.js";
import {STONETOP_SCOPE, resolvedFlagProperty} from "../actors/character/StonetopFlags.js";
import {isPrimaryGM as _isPrimaryGM} from "../utils/primary-gm.js";
import {STEADING_ACTOR_TYPE, STEADING_DEFAULT_IMG} from "../actors/steading/steading-portrait.js";

const _OMEN_REMINDER_FLAG = "lastOmenReminder";

// Sourced from the shared steading-portrait helper so this bootstrap and the Book art
// re-apply (module/book2-art/reapply.js) can never disagree on the actor type / default img.
const _STEADING_ACTOR_TYPE = STEADING_ACTOR_TYPE;
const _STEADING_ACTOR_NAME = "Stonetop";
const _STEADING_ACTOR_IMG = STEADING_DEFAULT_IMG;
// New worlds get the "S" emblem above as the steading portrait. We deliberately do
// NOT rewrite the image on existing worlds when they upgrade: a group's steading may
// point at their own art, or at the book illustration we used to ship (now removed),
// and silently mutating world data on upgrade is the wrong default. Instead, when the
// stored image is MISSING we swap in the emblem at display time only (see the
// renderActorDirectory hook below): a purely visual fallback that never touches the
// saved actor. An image that still resolves is shown exactly as-is.

export async function ensureStonetopSingleton() {
	if (!game.user.isGM || !_isPrimaryGM()) return;
	const existing = _getStonetopActors().at(0);
	if (existing) {
		await _ensureStartingValues(existing);
		return;
	}

	await Actor.create({
		name: _STEADING_ACTOR_NAME,
		type: _STEADING_ACTOR_TYPE,
		img: _STEADING_ACTOR_IMG,
		// The steading is shared: every player owns it so they can edit it directly
		// (e.g. requisitioning assets, tracking Fortunes) without GM relaying.
		ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
		prototypeToken: {
			texture: { src: _STEADING_ACTOR_IMG },
		},
		system: {
			attributes: {
				surplus: { value: 1 },
			},
		},
	});
}

export function registerStonetopSingletonHooks() {
	Hooks.on("preCreateActor", (actor, data, options) => {
		if (_isStonetopActorData(data ?? actor)) {
			if (!_getStonetopActors().length) return;
			ui.notifications?.warn("This world already has a Stonetop sheet.");
			return false;
		}

		// Players can only ever create their own character. Even if a `monster` type slips
		// past the Create-Actor picker (e.g. a macro), a non-GM must never create a monster
		// stat block (that is GM content), so veto it outright.
		if ((actor?.type ?? data?.type) === "monster" && !game.user?.isGM) {
			ui.notifications?.warn("Only the GM can create monsters.");
			return false;
		}

		// A GM creating a blank Monster from "Create Actor" goes through the guided
		// worksheet instead: veto the empty create and open the builder, which then
		// creates the fully-populated stat block itself.
		if (_shouldGuideMonster(actor, data, options)) {
			_openMonsterBuilder(data);
			return false;
		}
	});

	Hooks.on("preDeleteActor", actor => {
		if (!_isStonetopActorData(actor)) return;
		if (_getStonetopActors().length > 1) return;

		ui.notifications?.warn("The Stonetop sheet is required and cannot be deleted.");
		return false;
	});

	// Display-only steading portrait fallback for the Actors sidebar. We no longer ship
	// the book illustration older worlds' steading actors point at, and we don't rewrite
	// that world data on upgrade (see the note by _STEADING_ACTOR_IMG). So if a steading's
	// stored image can't load, show the "S" emblem in its directory row instead of a
	// broken thumbnail. Runs for every user (the steading is owned by all).
	Hooks.on("renderActorDirectory", (app, html) => {
		const root = html instanceof HTMLElement
			? html
			: (html?.[0] ?? (app?.element instanceof HTMLElement ? app.element : app?.element?.[0]) ?? null);
		if (!root?.querySelector) return;
		for (const actor of _getStonetopActors()) {
			const row = root.querySelector(`[data-entry-id="${actor.id}"], [data-document-id="${actor.id}"]`);
			_fallBackSteadingImg(row?.querySelector("img"));
		}
	});
}

// Start-of-session reminder: any Would-Be Hero with the Destined background must
// roll +Omens at the start of each session. Foundry has no session event, so we
// fire on world `ready` (primary GM only) and throttle to once per real-world day
// via a flag on the Stonetop singleton; ending a session clears it so a new
// same-day session reminds again.
export async function remindDestinedOmenRoll() {
	if (!_isPrimaryGM()) return;
	if (!game.settings?.get?.(STONETOP_SCOPE, "startOfSessionReminders")) return;
	const destined = game.actors?.filter(a =>
		a.type === "character" && resolvedFlagProperty(a, "background.selected") === "destined") ?? [];
	if (!destined.length) return;

	const steading = _getStonetopActors().at(0);
	const today = new Date().toDateString();
	if (steading?.getFlag(STONETOP_SCOPE, _OMEN_REMINDER_FLAG) === today) return;

	await ChatMessage.create({
		content: _buildOmenReminderContent(destined),
		speaker: { alias: "Stonetop" },
	});
	if (steading) await steading.setFlag(STONETOP_SCOPE, _OMEN_REMINDER_FLAG, today);
}

// Clear the throttle so the next `ready` re-posts the reminder (called at End of Session).
export async function resetOmenReminder() {
	const steading = _getStonetopActors().at(0);
	if (steading?.getFlag(STONETOP_SCOPE, _OMEN_REMINDER_FLAG)) {
		await steading.unsetFlag(STONETOP_SCOPE, _OMEN_REMINDER_FLAG);
	}
}

function _buildOmenReminderContent(destined) {
	const names = destined.map(a => escHtml(a.name)).join(", ");
	return stonetopChatCard("Start of Session — Omen Roll",
		`<div class="stonetop-roll-card-description">
			<p><strong>Destined:</strong> ${names} — roll <strong>+Omens</strong>.</p>
			<ul>
				<li><strong>7+:</strong> lose all Omens; the GM shares a vision or portent that points toward your fate.</li>
				<li><strong>10+:</strong> also ask the GM a follow-up question and get a clear, helpful answer.</li>
				<li><strong>6-:</strong> don't mark XP, hold +1 Omen, and tell us of your recent nightmares or a troubling vision.</li>
			</ul>
		</div>`);
}

// True when this creation is a GM manually making a *blank* Monster and the guided
// builder is enabled — the one path we redirect. Everything else (the worksheet's
// own populated create, compendium imports, drag-drops, duplicates) passes through:
// each of those carries content (items, stats, tags) or an import marker we detect.
function _shouldGuideMonster(actor, data, options) {
	if ((actor?.type ?? data?.type) !== "monster") return false;
	if (!game.user?.isGM) return false;
	if (options?.stonetopMonsterBuilt) return false; // our own finished create
	if (game.settings?.get?.("stonetop_pwd", "monsterBuilderEnabled") === false) return false;
	if (options?.fromCompendium || options?.keepId) return false; // compendium import / drop
	// Duplicates carry no keepId, but their toObject() data reads as content (see
	// _hasMonsterContent: _stats.duplicateSource + populated stats), so they pass through.
	return !_hasMonsterContent(data);
}

// Whether the creation data already carries a built-out monster — populated stats,
// tags, embedded moves, or an import/duplicate provenance marker. A bare "Create Actor"
// click submits only { name, type } (no `system`), so it reads as blank; a Duplicate or
// import submits the source document's full toObject(), which always carries these.
// hp.max is compared to null (not truthy-tested) so a real max of 0 still counts as
// present — an existing stat block that a GM duplicates must not read as "blank".
function _hasMonsterContent(data) {
	const get = path => foundry.utils.getProperty(data ?? {}, path);
	return !!(
		data?.items?.length
		|| get("system.attributes.hp.max") != null
		|| get("system.tags")
		|| get("system.concept")
		|| get("_stats.compendiumSource")
		|| get("_stats.duplicateSource")
		|| get("flags.core.sourceId")
	);
}

async function _openMonsterBuilder(data) {
	try {
		const { CreateMonsterDialog } = await import("../dialogs/CreateMonsterDialog.js");
		await new CreateMonsterDialog({ name: data?.name ?? "", folder: data?.folder ?? null }).promise();
	} catch (err) {
		console.error("Stonetop | failed to open the monster builder", err);
	}
}

function _getStonetopActors() {
	return game.actors?.filter(actor => _isStonetopActorData(actor)) ?? [];
}

function _isStonetopActorData(actor) {
	return actor?.type === _STEADING_ACTOR_TYPE || actor?.system?.customType === _STEADING_ACTOR_TYPE;
}

async function _ensureStartingValues(actor) {
	const updates = {};
	if (actor.system?.attributes?.surplus?.value === undefined || actor.system.attributes.surplus.value === null) {
		updates["system.attributes.surplus.value"] = 1;
	}
	// NB: the steading image is intentionally left alone here; upgrading worlds keep
	// whatever portrait they have; a missing one falls back to the emblem at display
	// time (renderActorDirectory), not by rewriting the actor.
	// Keep the shared steading owned by all players (preserves any per-user overrides).
	if (actor.ownership?.default !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
		updates["ownership.default"] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
	}
	if (Object.keys(updates).length) await actor.update(updates);
}

// Swap a MISSING steading portrait for the "S" emblem in the sidebar, at display time
// only. The `error` event fires just when the file actually fails to load, so a still-
// resolving image (a custom portrait, or the old book file still on disk) is left
// showing untouched. Idempotent per <img> via a data flag so repeated directory
// re-renders don't re-bind. Never writes to the actor.
function _fallBackSteadingImg(img) {
	if (!img || img.dataset.stSteadingFallback) return;
	img.dataset.stSteadingFallback = "1";
	const swap = () => { if (img.getAttribute("src") !== _STEADING_ACTOR_IMG) img.src = _STEADING_ACTOR_IMG; };
	if (img.getAttribute("src") && img.complete && img.naturalWidth === 0) swap();
	else img.addEventListener("error", swap, { once: true });
}
