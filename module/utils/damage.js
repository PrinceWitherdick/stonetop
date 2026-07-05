/**
 * Canonical Stonetop damage-die grammar — a die expression like `d8`, `2d6`,
 * `d10+2`, or `d8 - 1` (whitespace around the modifier is tolerated, matching how
 * the transcribed stat blocks print it). Shared by the character Followers tab
 * (_parseFollowerDamage) and the monster stat-block parser so the two recognise
 * exactly the same grammar instead of drifting apart.
 *
 * Stateless (no `g` flag), so it is safe to reuse the single instance across
 * `.test()` / `.match()` calls.
 */
import {getStonetopProsperity} from "./world.js";

export const DAMAGE_DIE_RE = /\d*d\d+(?:\s*[+-]\s*\d+)?/i;

/** The first die expression in a free-text damage string, or null. */
export function dieFromDamage(str) {
	return String(str ?? "").match(DAMAGE_DIE_RE)?.[0] ?? null;
}

/**
 * Resolve a weapon's piercing value. A number is a fixed count of armor points to
 * ignore; the string "prosperity" is the iron-weapon "x piercing" whose value equals
 * the party steading's CURRENT Prosperity — resolved live here so a mid-fight change
 * is honoured and never baked onto the weapon. Anything else → 0.
 */
export function resolvePiercing(piercing) {
	if (typeof piercing === "number") return Math.max(0, piercing);
	if (piercing === "prosperity") return Math.max(0, Number(getStonetopProsperity()) || 0);
	return 0;
}

/**
 * Reduce raw damage by a target's armor, honouring piercing and full-bypass:
 * effective = ignoresArmor ? raw : max(0, raw − max(0, armor − piercing)).
 * `messy` / `forceful` are pure fiction and never enter this math.
 */
export function mitigateDamage(raw, { armor = 0, piercing = 0, ignoresArmor = false } = {}) {
	const dmg = Math.max(0, Math.round(Number(raw) || 0));
	if (ignoresArmor) return dmg;
	const effectiveArmor = Math.max(0, (Number(armor) || 0) - (Number(piercing) || 0));
	return Math.max(0, dmg - effectiveArmor);
}

/**
 * Subtract `amount` HP from an actor, clamped at 0, and return the transition
 * `{ oldHp, newHp }` (null if the actor has no HP attribute). Writes
 * system.attributes.hp.value; the caller must have permission to update the actor
 * (monster targets ⇒ GM; the acting PC ⇒ its owner).
 */
export async function applyDamageToActor(targetActor, amount, updateOptions = {}) {
	const hp = targetActor?.system?.attributes?.hp;
	if (!hp) return null;
	const oldHp = Number(hp.value) || 0;
	const newHp = Math.max(0, oldHp - Math.max(0, Math.round(Number(amount) || 0)));
	if (newHp !== oldHp) await targetActor.update({ "system.attributes.hp.value": newHp }, updateOptions);
	return { oldHp, newHp };
}
