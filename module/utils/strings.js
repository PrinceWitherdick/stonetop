/** Capitalize the first character of a string. */
export function capitalizeFirst(str) {
	return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

/** Escape a value for safe insertion into HTML. */
export function escHtml(v) {
	return foundry.utils.escapeHTML(String(v ?? ""));
}

/** Ensure miss result labels are visually emphasized in rendered move text. */
export function boldMissText(html) {
	return String(html ?? "").replace(/(<strong>\s*)?\b(on a 6(?:-|\u2212|\u00e2\u02c6\u2019))(\s*<\/strong>)?/gi, (match, open, label, close) => {
		if (open && close) return match;
		return `<strong>${label}</strong>`;
	});
}

/**
 * Strip "... +STAT to ..." option lines from a move description that don't
 * match the chosen stat, for "ask"-type moves (Defy Danger, Interfere) where
 * the player picks one stat from a list of several presented in the text.
 */
export function filterStatOptionLines(html, statKey) {
	if (!statKey) return String(html ?? "");
	const want = String(statKey).toUpperCase();
	return String(html ?? "").replace(/<p>\s*\.\.\.\s*\+([A-Z]{3})\b[^<]*<\/p>/g, (match, stat) =>
		stat === want ? match : ""
	);
}

/** Returns true when `img` is the Foundry default actor/token image or absent. */
export function isDefaultImg(img) {
	const defaultToken = globalThis.CONST?.DEFAULT_TOKEN ?? "icons/svg/mystery-man.svg";
	return !img || img === "icons/svg/mystery-man.svg" || img === defaultToken;
}
