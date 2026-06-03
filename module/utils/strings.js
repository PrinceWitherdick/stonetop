/** Capitalize the first character of a string. */
export function capitalizeFirst(str) {
	return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

/** Escape a value for safe insertion into HTML. */
export function escHtml(v) {
	return foundry.utils.escapeHTML(String(v ?? ""));
}
