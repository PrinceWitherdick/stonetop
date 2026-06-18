// Shared "player character" helpers. Only player characters carry a playbook, so
// "has a playbook" is the system-wide test for which actors are PCs — used by the
// Introductions and Let-Spring-Burst walkthroughs, the playbook picker, and the
// character sheet's avatar art.

/**
 * A character's playbook slug, from either the embedded `system.playbook` data or
 * a contained playbook item. Returns "" when there's no playbook yet — which also
 * makes it the truthiness test for "is this actor a player character".
 */
export function playbookSlug(actor) {
	return actor?.system?.playbook?.slug
		?? actor?.items?.find?.(i => i.type === "playbook")?.system?.slug
		?? "";
}

/** Every world actor that is a player character (a `character` with a playbook). */
export function getPlayerCharacters() {
	return (game.actors?.contents ?? []).filter(a => a.type === "character" && playbookSlug(a));
}

/**
 * Path to a playbook's avatar art (`assets/icons/playbooks/<slug>_icon.webp`), or
 * `null` for a slug-less actor. Server-root-relative (no leading slash) — the same
 * string stored as the character's avatar on pick, so previews match the art.
 */
export function playbookIconPath(slug) {
	return slug
		? `systems/stonetop_pwd/assets/icons/playbooks/${slug.replace(/-/g, "_")}_icon.webp`
		: null;
}
