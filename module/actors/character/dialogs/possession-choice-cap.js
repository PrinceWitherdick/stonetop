// Effective maximum number of selections for a possession choiceGroup subgroup.
//
// A subgroup's base allowance is its `maxSelect` (omit it for an unlimited
// multi-select — the prior behavior, signalled by a null return). `maxSelectBonus`
// raises that cap from the character's moves: the Blessed's sacred-pouch
// "remarkable trait" line is `maxSelect: 1` plus +1 per Big Magic, so each Big
// Magic the character has (or will have, counting in-session starting-move picks)
// unlocks one more remarkable trait. `moveCounts` maps a move name to how many of
// it the character has. Mirrors the `usesBonus.moveBonus` shape that already scales
// the pouch's max Stock with Big Magic.
export function effectiveSubgroupMax(subgroup, moveCounts = {}) {
	if (subgroup?.maxSelect == null) return null;
	const bonus = sumMoveBonus(subgroup.maxSelectBonus?.moveBonus, n => moveCounts[n] ?? 0);
	return Math.max(0, subgroup.maxSelect + bonus);
}

// Sum a `moveBonus` array: each `{ moveName, perInstance }` entry adds `perInstance`
// for every copy of `moveName` the character has, per the `count` lookup (move name →
// number). Shared by the pouch's max-Stock bonus (`usesBonus.moveBonus`) and the
// remarkable-trait cap (`maxSelectBonus.moveBonus`), which use the identical shape.
export function sumMoveBonus(moveBonus, count) {
	let total = 0;
	for (const mb of (moveBonus ?? [])) {
		total += (count(mb.moveName) || 0) * (mb.perInstance ?? 0);
	}
	return total;
}

// Render-ready view of a possession's `choiceGroups` for the standalone choices
// editor (the sacred-pouch modal): each group's heading/note; each subgroup's
// effective cap (`max`, null = unlimited radios or an uncapped multi-select) and
// current `selectedCount`; and per-option `checked`/`disabled`. A multi-select
// option locks (disabled) only when the line is at its cap and that option isn't
// already chosen. `pickedSlugs` is the possession's chosen sub-slugs; `moveCounts`
// maps move name → count for the cap bonus. Pure — unit-tested without Foundry.
export function buildChoiceGroupsView(choiceGroups, pickedSlugs = [], moveCounts = {}) {
	const picked = new Set(pickedSlugs);
	return (choiceGroups ?? []).map((cg, cgIdx) => ({
		heading: cg.heading ?? "",
		note:    cg.note ?? "",
		subgroups: (cg.subgroups ?? []).map((sg, sgIdx) => {
			const groupId  = `cg${cgIdx}-sg${sgIdx}`;
			const slugsCsv = (sg.options ?? []).map(o => o.slug).join(",");
			const max = sg.multiSelect ? effectiveSubgroupMax(sg, moveCounts) : null;
			const selectedCount = (sg.options ?? []).filter(o => picked.has(o.slug)).length;
			const atLimit = max != null && selectedCount >= max;
			return {
				groupId,
				slugsCsv,
				multiSelect: !!sg.multiSelect,
				max,
				selectedCount,
				options: (sg.options ?? []).map(o => ({
					slug:     o.slug,
					label:    o.label,
					checked:  picked.has(o.slug),
					disabled: !!sg.multiSelect && atLimit && !picked.has(o.slug),
				})),
			};
		}),
	}));
}
