/** Capitalize the first character of a string. */
export function capitalizeFirst(str) {
	return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

/** Escape a value for safe insertion into HTML. */
export function escHtml(v) {
	return foundry.utils.escapeHTML(String(v ?? ""));
}

/** Returns true when `img` is the Foundry default actor/token image or absent. */
export function isDefaultImg(img) {
	const defaultToken = globalThis.CONST?.DEFAULT_TOKEN ?? "icons/svg/mystery-man.svg";
	return !img || img === "icons/svg/mystery-man.svg" || img === defaultToken;
}
