// NPC lifecycle status — the small, framework-free helper behind the "npc" status
// field. Kept OUT of NpcModel.js (which extends foundry.abstract.TypeDataModel at
// load time) so the pure lookup can be imported by the steading roster and unit
// tests without pulling in the Foundry data-model class.
//
// The book annotates roster/insert entries this way — "dead" (Garet), "retired"
// (Eira), "departed" — to track who's still active (Book I, pp.467, 481).

import { capitalizeFirst } from "../utils/strings.js";

// The statuses an NPC can hold. Blank ("") is the active default. `inactive` marks
// the "gone" states (retired / dead) that dim + strike the name on the sheet and the
// steading roster. Shared so the sheet and roster render the same options + styling.
export const NPC_STATUSES = [
	{ value: "",        label: "Active",  inactive: false },
	{ value: "away",    label: "Away",    inactive: false },
	{ value: "missing", label: "Missing", inactive: false },
	{ value: "retired", label: "Retired", inactive: true  },
	{ value: "dead",    label: "Dead",    inactive: true  },
];

// Resolve a stored status value to its { value, label, inactive } metadata. An unknown
// value (a hand-edited status) title-cases into a label and is treated as active.
export function npcStatusMeta(value) {
	const v = String(value ?? "").trim().toLowerCase();
	const found = NPC_STATUSES.find(s => s.value === v);
	if (found) return found;
	return { value: v, label: v ? capitalizeFirst(v) : "Active", inactive: false };
}
