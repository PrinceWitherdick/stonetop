import { describe, it, expect } from "vitest";
import { withUnarmedChoice } from "../../module/combat/attack-flow.js";
import { grantedWeaponForMove, weaponMeta } from "../../module/data/weapons.js";

// The two shapes carriedAttackWeapons builds: a ticked inventory weapon, and the holy light
// Purifying Flames grants (no inventory item behind it, so it carries `grantedBy`).
function carried(slug) {
	return { slug, meta: weaponMeta(slug), ammoLabel: null };
}

function granted(moveName = "Purifying Flames") {
	const g = grantedWeaponForMove(moveName);
	return { slug: g.slug, meta: g.meta, ammoLabel: null, grantedBy: moveName, whenStat: g.whenStat };
}

describe("withUnarmedChoice", () => {
	it("offers unarmed beside a move-granted weapon that would otherwise be the only one", () => {
		const out = withUnarmedChoice([granted()]);

		// Two rows means promptWeaponChoice asks instead of auto-resolving — the whole point:
		// a Lightbearer Clashing with +STR must not have the holy light imposed on them.
		expect(out).toHaveLength(2);
		expect(out[1].slug).toBe("purifying-flames-holy-light");
	});

	it("puts unarmed first, so a stat that doesn't imply the granted weapon defaults to it", () => {
		const out = withUnarmedChoice([granted()]);

		expect(out[0].unarmed).toBe(true);
		expect(out[0].meta.name).toBe("Unarmed");
		// The dialog pre-checks index 0 unless `preferSlug` matches; the empty slug is what
		// promptWeaponChoice maps back to "no weapon".
		expect(out[0].slug).toBe("");
	});

	it("leaves a carried weapon alone — one ticked weapon is already the player's answer", () => {
		const only = [carried("sword")];
		expect(withUnarmedChoice(only)).toBe(only);
	});

	it("doesn't add unarmed when a carried weapon is on offer alongside the granted one", () => {
		const both = [carried("sword"), granted()];
		expect(withUnarmedChoice(both)).toBe(both);
	});

	it("leaves an empty list empty — nothing that fits the move is already unarmed", () => {
		expect(withUnarmedChoice([])).toEqual([]);
	});
});
