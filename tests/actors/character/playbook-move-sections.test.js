import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { ONBOARDING_MOVE_GROUPS } from "../../../module/actors/character/dialogs/onboarding-move-groups.js";

// The Moves tab heads each of a playbook's three onboarding clusters (Offense / Defense /
// Grit for the Heavy, and so on) inside the one Playbook Moves section, plus a trailing
// "Other" for the moves no cluster claims. The wiring has three silent failure modes, and
// these guard all three: a sub-heading left unboxed breaks the section's own fold, a bare
// group key as a fold id collides with another section's, and losing the flat fallback
// would leave a homebrew playbook with no move list at all.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = rel => fs.readFileSync(path.resolve(HERE, "../../..", rel), "utf8");

const MOVES_HBS = read("templates/actor/partials/tab-moves.hbs");
const MOVE_GROUP_HBS = read("templates/actor/partials/move-group.hbs");
const SECTION_EDITING_JS = read("module/utils/section-editing.js");
const SHEET_JS = read("module/actors/character/StonetopCharacterSheet.js");
const CSS = read("styles/stonetop.css");

describe("playbook move sections", () => {
	it("feeds the grouped list to the playbook section only", () => {
		expect(MOVES_HBS).toContain("groups=stonetop.movelist.playbookMoveGroups");
		expect(MOVES_HBS.match(/groups=stonetop\.movelist\.playbookMoveGroups/g)).toHaveLength(1);

		// It must sit in the same partial call as the playbook section's collapse id, since
		// that is what the sub-folds are namespaced under.
		const call = MOVES_HBS.slice(
			MOVES_HBS.indexOf('collapseId="playbookMoves"') - 900,
			MOVES_HBS.indexOf('collapseId="playbookMoves"') + 60);
		expect(call).toContain("groups=stonetop.movelist.playbookMoveGroups");
	});

	// The fold walks a heading's following SIBLINGS and stops at the next heading. The
	// sub-titles are `.stonetop-move-group-title` too, so left as bare siblings they would
	// cut the Playbook Moves fold off at the first one — it would swallow only the first
	// cluster and leave the rest standing. Boxing each group keeps them out of that walk.
	it("boxes each group so the section's own fold still swallows the lot", () => {
		expect(SECTION_EDITING_JS).toContain("nextElementSibling");
		expect(SHEET_JS).toContain(".stonetop-details-heading-row, .stonetop-move-group-title");

		const groupBlock = MOVE_GROUP_HBS.slice(
			MOVE_GROUP_HBS.indexOf("{{#each groups}}"),
			MOVE_GROUP_HBS.indexOf("{{/each}}", MOVE_GROUP_HBS.indexOf("{{#each groups}}")));
		expect(groupBlock).toMatch(/<div class="stonetop-move-subgroup">\s*\{\{>\s*"stonetop\.section-heading"/);
	});

	// One flat per-actor set holds every fold id on the sheet, and "lore" is already the
	// Details tab's Lore section AND the Seeker's / Judge's move group. A bare key would
	// fold one when the reader folded the other. Same reasoning as the `otherMoves:` prefix.
	it("namespaces each sub-fold under the section's own id", () => {
		expect(MOVE_GROUP_HBS).toContain('collapse=(concat ../collapseId ":" key)');

		const groupKeys = new Set(Object.values(ONBOARDING_MOVE_GROUPS).flat().map(g => g.key));
		const sectionIds = [...MOVES_HBS.matchAll(/collapse(?:Id)?="([^"]+)"/g)].map(m => m[1]);
		for (const id of sectionIds) expect(groupKeys.has(id), id).toBe(false);
	});

	// A playbook the group table doesn't know (homebrew, or none picked) gets [], and the
	// section has to fall back to the flat owned-then-un-owned pair rather than render nothing.
	it("keeps the flat owned / un-owned fallback", () => {
		expect(MOVE_GROUP_HBS).toContain("{{else if splitUnowned}}");
		expect(MOVE_GROUP_HBS).toContain('listClass="stonetop-move-list--owned"');
		expect(MOVE_GROUP_HBS).toContain('listClass="stonetop-move-list--unowned"');
	});

	// Both of the tab's filters can empty a cluster out, and each does it by a different
	// means — so each needs its own rule, or a heading is left standing over nothing.
	it("hides a cluster whose cards are all filtered away", () => {
		expect(CSS).toContain(
			".tab.moves.hide-unselected:not(.is-searching)\n\t.stonetop-move-subgroup:not(:has(.stonetop-move-list--owned))");
		expect(CSS).toContain(
			".tab.moves.is-searching\n\t.stonetop-move-subgroup:not(:has(.stonetop-item:not(.stonetop-search-hidden)))");
	});

	// The masonry packer balances every `.items-list` under a move group; the new nested
	// lists have to stay in its reach or each cluster renders as one tall column.
	it("leaves the nested lists inside the masonry packer's selector", () => {
		expect(SHEET_JS).toContain('".tab.moves .stonetop-move-group .items-list"');
	});
});
