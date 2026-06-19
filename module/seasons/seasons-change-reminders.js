import { getSetting } from "../settings.js";
import { SeasonsChangeReminderDialog } from "../dialogs/SeasonsChangeReminderDialog.js";

// ── Seasons Change reminders ─────────────────────────────────────────────────
// A few playbook moves and special possessions have rules that fire "each
// season" / "once per season" (Book I). When the GM runs the Seasons Change move
// on the steading, each player whose character carries one of these gets a popup
// listing the item and its rule — so the seasonal upkeep doesn't get forgotten.
//
// The GM's steading flow broadcasts a transient "seasons change" event over the
// system socket (see broadcastSeasonsChange); every connected client then checks
// its own owned characters (maybeShowSeasonsChangeReminder) and only pops the
// dialog if it has something to remind about. Per-client "don't show again" is a
// client-scoped setting, mirroring the GM Welcome guide.

const SOCKET = "system.stonetop_pwd";

// The seasonal upkeep registry. `kind` decides how a character is matched:
//   • "move"       — an embedded move Item with this exact name.
//   • "possession" — a selected special-possession slug (flags.stonetop_pwd.possessions.selected).
// `rule` is the season-facing reminder text shown in the popup.
const SEASONAL_REMINDERS = [
	{
		kind:     "move",
		name:     "Rites of the Land",
		playbook: "The Blessed",
		rule:     "Once per season, when you oversee the sacred rites, hold 1 Favor. If you also sacrifice 1 Surplus, hold 4 Favor instead. Spend Favor in lieu of Stock, 1-for-1.",
	},
	{
		kind:     "possession",
		slug:     "collected-offerings",
		label:    "Collected offerings",
		playbook: "The Blessed",
		rule:     "Restore 1 use this season. (Expend a use to produce something valuable to a spirit of the wild.)",
	},
	{
		kind:     "possession",
		slug:     "goat-herd",
		label:    "Goat herd",
		playbook: "The Blessed",
		rule:     "Each season, there's a 1-in-4 chance your goat herd produces a bezoar — swallow it to cure poison. Roll to see if you have one.",
	},
	{
		kind:     "possession",
		slug:     "holy-relics",
		label:    "Holy relics",
		playbook: "The Lightbearer",
		rule:     "Restore 1 use this season. (Expend a use to add +1 to a roll involving Helior's favor or power.)",
	},
];

// Web-path season icon (the steading flow stores these under assets/icons/seasons;
// "autumn" maps to the "fall" art). Forward slashes keep it a valid URL.
export function seasonIconSrc(season) {
	const id = season === "autumn" ? "fall" : season;
	return `systems/stonetop_pwd/assets/icons/seasons/${id}_icon.svg`;
}

export function seasonLabel(season) {
	return { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" }[season] ?? "A New Season";
}

// Which registered reminders apply to one character — a move match needs an
// embedded move Item of that name; a possession match needs the slug selected.
export function remindersForActor(actor) {
	if (actor?.type !== "character") return [];
	const moveNames = new Set(actor.items.filter(i => i.type === "move").map(i => i.name));
	const selected  = new Set(actor.getFlag?.("stonetop_pwd", "possessions.selected") ?? []);
	return SEASONAL_REMINDERS.filter(r =>
		r.kind === "move" ? moveNames.has(r.name) : selected.has(r.slug),
	);
}

// Everything to remind the current user about: the seasonal items/moves carried
// by characters this user explicitly owns. Uses the per-user ownership entry (not
// the GM's blanket ownership), so a GM only sees reminders for PCs actually
// assigned to them — not every character in the world.
function mySeasonalReminders() {
	const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
	const mine = game.actors.filter(
		a => a.type === "character" && (a.ownership?.[game.user.id] ?? 0) >= OWNER,
	);
	return mine.flatMap(actor =>
		remindersForActor(actor).map(r =>
			({ character: actor.name, name: r.label ?? r.name, playbook: r.playbook, rule: r.rule })),
	);
}

// Show the reminder on this client, if there's anything to show and the user
// hasn't dismissed it for good. Called both by the socket handler (players) and
// directly on the GM's client (the socket doesn't echo to the sender).
export function maybeShowSeasonsChangeReminder(season) {
	if (getSetting("seasonsChangeReminderDismissed")) return;
	const reminders = mySeasonalReminders();
	if (!reminders.length) return;
	SeasonsChangeReminderDialog.open(season, reminders);
}

// GM side: tell every other client the seasons just changed, then run the same
// check locally (emit doesn't loop back to the sender, and the GM may own a PC).
export function broadcastSeasonsChange(season) {
	game.socket?.emit(SOCKET, { type: "seasonsChange", season });
	maybeShowSeasonsChangeReminder(season);
}

// Wire the receiving end. Registered once at ready (see hooks/Ready.js).
export function registerSeasonsChangeSocket() {
	game.socket?.on(SOCKET, data => {
		if (data?.type === "seasonsChange") maybeShowSeasonsChangeReminder(data.season);
	});
}
