// Shared shaping for a move's 10+ / 7-9 / 6- result tiers, in the shape rollStat
// consumes ({ success|partial|failure: { label, value } }). Every move that authors
// result text goes through here — custom moves and love letters — so the tier labels
// live in exactly one place. When `picks` is given, each tier also carries a `pick`
// count (love letters' "on a 10+, pick 1" pools); custom moves pass none, so no
// `pick` key is added and their stored shape is unchanged.
export function buildMoveTierResults({ success = "", partial = "", failure = "" }, picks = null) {
	const tier = (label, value, pick) => (picks ? { label, value, pick } : { label, value });
	return {
		success: tier("10+", success, picks?.success ?? 0),
		partial: tier("7-9", partial, picks?.partial ?? 0),
		failure: tier("6-",  failure, picks?.failure ?? 0),
	};
}

/**
 * The lead-in for a love-letter pick tier: "<pick> N", plus a "<fromList>" tail when the
 * letter carries a shared choose-from pool. Returns "" for a non-positive count. Callers
 * pass their own wording — the chat card ships English literals so the persisted outcome
 * string stays stable across clients and the GM Shift Up/Down flow, while the reader dialog
 * localizes — so only the shared count/branch logic lives here.
 *
 * @param {number}  count
 * @param {boolean} hasOptions       whether a shared pick-from pool is present
 * @param {object}  labels           { pick, fromList } wording
 */
export function pickLeadText(count, hasOptions, { pick, fromList }) {
	const c = Number(count) || 0;
	if (c <= 0) return "";
	return hasOptions ? `${pick} ${c} ${fromList}` : `${pick} ${c}`;
}
