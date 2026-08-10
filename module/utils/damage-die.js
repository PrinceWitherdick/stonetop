// Helpers for stepping/comparing polyhedral damage dice (d4 → d12).
export const DIE_ORDER = ["d4", "d6", "d8", "d10", "d12"];

/** Increase `die` by `steps` sizes, capped at `cap`. Unknown dice pass through. */
export function stepDie(die, steps, cap = "d12") {
	const i = DIE_ORDER.indexOf(die);
	if (i < 0) return die;
	const capIdx = DIE_ORDER.indexOf(cap);
	const max = capIdx < 0 ? DIE_ORDER.length - 1 : capIdx;
	return DIE_ORDER[Math.max(0, Math.min(i + steps, max))];
}

/**
 * Coerce hand-typed text into the canonical "d#" a damage die has to be stored as:
 * "8", "D8", " d8 ", "1d8" all become "d8". Returns null for anything that isn't a
 * single die ("2d6", "d8 (forceful)", "big"), so a caller can reject the edit rather
 * than persist something the roller can't use — a PC has exactly one damage die.
 */
export function normalizeDamageDie(input) {
	const s = String(input ?? "").trim().toLowerCase();
	if (!s) return null;
	const m = s.match(/^(?:1\s*)?d?\s*(\d+)$/);
	const sides = m ? Number(m[1]) : NaN;
	if (!Number.isInteger(sides) || sides < 2) return null;
	return `d${sides}`;
}

/** Return the larger of two dice. Unknown dice defer to the other. */
export function maxDie(a, b) {
	const ia = DIE_ORDER.indexOf(a);
	const ib = DIE_ORDER.indexOf(b);
	if (ia < 0) return b ?? a;
	if (ib < 0) return a;
	return DIE_ORDER[Math.max(ia, ib)];
}
