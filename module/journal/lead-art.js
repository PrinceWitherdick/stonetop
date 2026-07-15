// Lift the leading Book-art illustration(s) out of an enriched journal body so a page
// sheet can render them as a full-width banner ABOVE the page title, instead of inline
// under it. Matches the exact markup the bring-your-own-book art importer prepends
// (module/book2-art + scripts/local/book2-art/import-book2-art.macro.js):
//     <p><img class="stonetop-journal-art" src="..." alt="..."></p>
// one or more in a row at the very start of the body.
//
// Returns { lead, rest }: `lead` is the concatenated art paragraph(s) (or ""), `rest` is
// the body with them removed. Attribute-order tolerant (survives enrichHTML), idempotent,
// and a no-op on bodies that carry no such art.
const ART_P = `<p\\b[^>]*>\\s*<img\\b[^>]*\\bclass="stonetop-journal-art"[^>]*>\\s*<\\/p>`;
const LEAD_ART_RE = new RegExp(`^\\s*((?:${ART_P}\\s*)+)`, "i");

export function liftLeadArt(html) {
	if (typeof html !== "string" || !html) return { lead: "", rest: html ?? "" };
	const m = LEAD_ART_RE.exec(html);
	if (!m) return { lead: "", rest: html };
	return { lead: m[1].trim(), rest: html.slice(m[0].length) };
}
