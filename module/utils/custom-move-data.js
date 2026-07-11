import { CUSTOM_MOVE_ROLL_TYPES } from "./roll-types.js";
import { formatCustomMoveDescription } from "./custom-move-text.js";
import { buildMoveTierResults } from "./move-results.js";
import { STONETOP_SCOPE } from "../actors/character/StonetopFlags.js";

// Coerce a value to an integer clamped to [lo, hi]; non-numeric / out-of-range → nearest bound.
export function clampInt(value, lo, hi) {
	return Math.max(lo, Math.min(hi, Math.trunc(Number(value) || 0)));
}

/**
 * Shape raw custom-move dialog input into the item document data shared by every save
 * target — an actor-embedded "other" move (the on-sheet flow) and a reusable world Item
 * (the "Create Item → Move" flow). Returns `{ name, system, flags }` with NO `type`; the
 * caller adds `type:"move"`. Pure (no Foundry calls) so it stays unit-testable.
 *
 * moveResults follows the shape rollStat consumes:
 * `{ success|partial|failure: { label, value } }`, or null for a no-roll move. The move
 * then rolls through the same engine as any shipped move (StonetopItem.roll → rollStat).
 */
export function buildCustomMoveData(input) {
	const rt = String(input?.rollType ?? "").trim().toLowerCase();
	const rollType = CUSTOM_MOVE_ROLL_TYPES.includes(rt) ? rt : "";
	const r = input?.results ?? {};
	const success = String(r.success ?? "").trim();
	const partial = String(r.partial ?? "").trim();
	const failure = String(r.failure ?? "").trim();
	const moveResults = (rollType && (success || partial || failure))
		? buildMoveTierResults({ success, partial, failure })
		: null;

	// Optional resource track ({ max, title, labels }); null unless a positive max.
	const res = input?.resource ?? {};
	const resMax = clampInt(res.max, 0, 20);
	const resLabels = Array.isArray(res.labels)
		? res.labels.map(l => String(l).trim()).filter(Boolean)
		: String(res.labels ?? "").split(",").map(l => l.trim()).filter(Boolean);
	const resource = resMax > 0
		? { max: resMax, title: String(res.title ?? "").trim() || null, labels: resLabels }
		: null;

	const intIn = (v) => clampInt(v, 0, 99);
	return {
		name: String(input?.name ?? "").trim() || "New Move",
		system: {
			moveType: "other",
			description: formatCustomMoveDescription(input?.description ?? ""),
			rollType,
			moveResults,
			resource,
			noXpOnMiss: !!input?.noXpOnMiss,
			hpBonus:   intIn(input?.hpBonus),
			armorBonus: intIn(input?.armorBonus),
			loadBonus:  intIn(input?.loadBonus),
		},
		flags: { [STONETOP_SCOPE]: { custom: true } },
	};
}
