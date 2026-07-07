// ── Primary-GM guard ────────────────────────────────────────────────────────
// With several GMs (or Assistant GMs) connected, actions that write shared world
// state — advancing the introductions cursor, harvesting player answers into the
// world setting, applying combat damage — must run on exactly ONE client, or two
// GMs race the same write. This resolves the single "primary" GM the same way
// everywhere: Foundry's designated activeGM when present, else the first active GM
// user (and true when there's no active GM at all, so a lone client still acts).

export function isPrimaryGM() {
	const activeGM = game.users?.activeGM;
	if (activeGM) return activeGM.id === game.user?.id;

	const firstActiveGM = game.users?.find(user => user.active && user.isGM);
	return !firstActiveGM || firstActiveGM.id === game.user?.id;
}
