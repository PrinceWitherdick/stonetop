// ── Character Introductions: answer/ask step flow (pure core) ───────────────────
// The looping "go around again" answer step (step4) and ask step (step6) cycle the
// table until every PC has either passed or answered all of their playbook's
// questions. This module holds that round-robin/done logic as pure functions so it
// can be unit-tested without a running Foundry — IntroductionsDialog.js and the GM's
// step-advance detection both call in. A PC's per-step record is
// { answers: [{q,a}], passed } (see the introductionsAnswers / flags.stonetop-pwd.intro
// shapes); `total` is that playbook's question count for the step (4).

// Is a PC finished with a step? Done when they passed, when they've answered every
// question, or when the step has no questions to offer them (defensive — every
// playbook has four, but a PC with none can neither answer nor be exhausted, so treat
// them as done rather than letting them trap the loop forever).
export function stepPcDone(step, total) {
	if (!Number.isFinite(total) || total <= 0) return true;
	const answers = Array.isArray(step?.answers) ? step.answers : [];
	return !!step?.passed || answers.length >= total;
}

// The next still-active PC index at or after `fromIndex` (exclusive), cycling with
// wrap-around, or -1 when everyone is done. `isDone(idx)` reports whether the PC at
// idx has finished the step. When only the current PC is still active it returns that
// same index (the turn stays on them until they answer or pass).
export function nextActiveIndex(fromIndex, count, isDone) {
	if (count <= 0) return -1;
	for (let s = 1; s <= count; s++) {
		const idx = (fromIndex + s) % count;
		if (!isDone(idx)) return idx;
	}
	return -1;
}

// The first still-active PC index (for parking the cursor when a step opens), or -1
// when everyone is already done.
export function firstActiveIndex(count, isDone) {
	for (let i = 0; i < count; i++) if (!isDone(i)) return i;
	return -1;
}

// How many turns until the still-active PC at `targetIndex` comes up, cycling forward
// from `fromIndex` (the current turn) and skipping any PC that `isDone`. Returns 0 when
// the target IS the current turn, N when it's N active-turns away, or -1 when the target
// is itself done (nothing more this step) or the roster is empty. Powers the player-side
// "you're up in N turns" hint on the looping answer/ask steps.
export function turnsUntilActive(fromIndex, targetIndex, count, isDone) {
	if (count <= 0 || targetIndex < 0) return -1;
	if (isDone(targetIndex)) return -1;
	if (targetIndex === fromIndex) return 0;
	for (let s = 1, turns = 0; s <= count; s++) {
		const idx = (fromIndex + s) % count;
		if (isDone(idx)) continue;
		turns++;
		if (idx === targetIndex) return turns;
	}
	return -1;
}
