/**
 * User Configuration's Character dropdown offers playbook characters only.
 *
 * Core builds that list from every actor the player can observe (UserConfig's private
 * #characterChoiceWidget, identical in v13 and v14), so a world's NPCs, monsters, the
 * steading and the GM Toolkit all show up beside the PCs. A player's character in
 * Stonetop is always a `character` actor, so the hook prunes everything else.
 *
 * The one exception is whatever the user already has assigned: dropping that option
 * would leave the select blank and Save would quietly release it. It stays listed so
 * the GM sees it and can release it on purpose.
 */

/** Actor type a player may take as their character. */
const PLAYER_CHARACTER_TYPE = "character";

/** Strip non-PC actors from a rendered UserConfig's Character select. */
export function pruneCharacterChoices(app, element) {
	// v13+ passes the root HTMLElement; tolerate jQuery like window-theme.js does.
	const root = element?.jquery ? element[0] : element;
	const select = root?.querySelector?.("select[name=character]");
	if (!select) return;
	const assignedId = app?.document?.character?.id ?? null;
	for (const option of [...select.querySelectorAll("option")]) {
		if (!option.value || option.value === assignedId) continue;
		if (game.actors.get(option.value)?.type !== PLAYER_CHARACTER_TYPE) option.remove();
	}
	// Core groups the choices by Owner / Observer; drop a group pruning left empty.
	for (const group of [...select.querySelectorAll("optgroup")]) {
		if (!group.querySelector("option")) group.remove();
	}
}

/** Register the prune on User Configuration. Call once, in init. */
export function registerUserConfigCharacterFilter() {
	Hooks.on("renderUserConfig", pruneCharacterChoices);
}
