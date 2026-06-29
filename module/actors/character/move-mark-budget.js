// Repeat-scaling selection budget for a move's `markOptions`.
//
// Moves like Veteran Crew, Heroes to the Last, Beast of Legend and Well Versed say
// "pick 1 (or N) each time you take this move". The number of `markOptions` boxes a
// player may check is therefore not fixed — it grows with how many copies of the
// move they own. A move declares this with `system.markBudget = { base, perExtra }`:
//
//   total picks = base + perExtra * (ownedCount - 1)
//
// so `base` picks on the first take plus `perExtra` for each additional take.
//   • Veteran Crew / Heroes to the Last / Beast of Legend → { base: 1, perExtra: 1 }
//     (pick 1 each time).
//   • Well Versed → { base: 1, perExtra: 2 } ("mark 1, then 2 more each extra time"
//     = 2·ownedCount − 1).
//
// Returns null when the move declares no budget — an UNCAPPED multi-select, the
// prior behavior (e.g. Potential for Greatness, whose stat slots are bounded
// separately). This is the same idea as possession-choice-cap's `sumMoveBonus`
// remarkable-trait cap, kept as its own shape because the budget keys off the move's
// OWN owned count (and Well Versed's −1 offset doesn't fit `maxSelect + perInstance·n`).
//
// An UNowned move (ownedCount < 1) yields 0 — you can't mark a move's options before
// you've taken it. (This makes the render lock every box on an unowned move, matching
// the writer, instead of offering `base` phantom picks.)
export function moveMarkBudget(markBudget, ownedCount = 0) {
	if (!markBudget || markBudget.base == null) return null;
	if (ownedCount < 1) return 0;
	return Math.max(0, markBudget.base + (markBudget.perExtra ?? 0) * (ownedCount - 1));
}
