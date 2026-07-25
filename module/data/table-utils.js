// Small shared helpers for the pick-or-roll data tables (corruption, monster-builder, …).
// Kept Foundry/DOM-free so the tables that import them stay unit-testable.

/** Find a table row by its `id` (string/number tolerant); null when absent. */
export const byId = (list, id) => list.find(o => String(o.id) === String(id)) ?? null;

/** Format an integer as a signed suffix for a damage/formula string: 2 → "+2", -1 → "-1", 0 → "". */
export const signedBonus = n => n > 0 ? `+${n}` : n < 0 ? `${n}` : "";
