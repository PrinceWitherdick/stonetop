/**
 * A hyphen is not legal in a JS identifier, so a textual rename of `stonetop_pwd` to
 * `stonetop-pwd` would turn `flags.stonetop_pwd.x` into `flags.stonetop-pwd.x` — a
 * subtraction expression, not a property read. This rewrites real property access into
 * bracket form and quotes object-literal keys, so the rename always lands on a string.
 *
 * Dotted paths inside STRING literals ("flags.stonetop_pwd.herd", passed to update())
 * are deliberately left alone: Foundry splits those on ".", and a hyphen is a perfectly
 * good key. Telling the two apart is why this tracks string and comment context rather
 * than using a bare regex.
 */

const isIdentChar = (ch) => /[A-Za-z0-9_$]/.test(ch ?? "");

// After these, a `/` starts a regex literal rather than a division.
const REGEX_PRECEDERS = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "~", "^", "<", ">", "\n"]);
const REGEX_KEYWORDS = /(?:^|[^A-Za-z0-9_$])(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

/**
 * Regex literals must be skipped wholesale. A regex like /data-season="([^"]+)"/ holds an
 * ODD number of quote characters, so treating it as ordinary code flips the scanner into
 * string mode and silently swallows the rest of the file — which is exactly how an
 * object-literal key 50 lines later gets missed.
 *
 * Returns the index just past the literal, or -1 when this `/` is division.
 */
function skipRegexLiteral(source, start, emitted) {
	const before = emitted.replace(/\s+$/, "");
	const last = before.at(-1);
	const looksLikeRegex = last === undefined || REGEX_PRECEDERS.has(last) || REGEX_KEYWORDS.test(before);
	if (!looksLikeRegex) return -1;

	let i = start + 1;
	let inClass = false;
	while (i < source.length) {
		const ch = source[i];
		if (ch === "\\") { i += 2; continue; }
		if (ch === "\n") return -1;          // unterminated: it was division after all
		if (ch === "[") inClass = true;
		else if (ch === "]") inClass = false;
		else if (ch === "/" && !inClass) {
			i += 1;
			while (i < source.length && /[a-z]/.test(source[i])) i += 1; // flags
			return i;
		}
		i += 1;
	}
	return -1;
}

export function bracketizeIdentifierAccess(source, id) {
	let out = "";
	let i = 0;
	let quote = null;   // the delimiter we are waiting to close on
	let comment = null; // "line" | "block"

	while (i < source.length) {
		const ch = source[i];
		const next = source[i + 1];

		if (comment) {
			if (comment === "line" && ch === "\n") comment = null;
			else if (comment === "block" && ch === "*" && next === "/") { out += "*/"; i += 2; comment = null; continue; }
			out += ch; i += 1; continue;
		}

		if (quote) {
			if (ch === "\\") { out += ch + (next ?? ""); i += 2; continue; }
			if (ch === quote) quote = null;
			out += ch; i += 1; continue;
		}

		if (ch === "/" && next === "/") { comment = "line"; out += "//"; i += 2; continue; }
		if (ch === "/" && next === "*") { comment = "block"; out += "/*"; i += 2; continue; }
		if (ch === "/") {
			const end = skipRegexLiteral(source, i, out);
			if (end !== -1) { out += source.slice(i, end); i = end; continue; }
		}
		if (ch === "'" || ch === '"' || ch === "`") { quote = ch; out += ch; i += 1; continue; }

		// Property access: `.id` / `?.id`, where `id` is a whole identifier.
		if (ch === "." && source.startsWith(id, i + 1) && !isIdentChar(source[i + 1 + id.length])) {
			if (out.endsWith("?")) out = `${out.slice(0, -1)}?.["${id}"]`;
			else out += `["${id}"]`;
			i += 1 + id.length;
			continue;
		}

		// Object-literal key: bare `id:`, not `id::` and not the `?:` of a ternary.
		if (source.startsWith(id, i) && !isIdentChar(source[i - 1]) && source[i - 1] !== ".") {
			const after = source.slice(i + id.length).match(/^\s*:/);
			if (after && source[i + id.length + after[0].length] !== ":") {
				out += `"${id}"`;
				i += id.length;
				continue;
			}
		}

		out += ch; i += 1;
	}
	return out;
}
