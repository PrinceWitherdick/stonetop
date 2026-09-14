import { describe, it, expect } from "vitest";
import { FOLLOWER_MOVES } from "../../module/data/follower-moves.js";
import { moveBodyHtml } from "../../module/utils/move-tiers.js";
import { readRepo } from "../fakes/css.js";

// The character sheet's "Follower Moves" card renders read-only from this generated module
// (built from packs/src/stonetop-items/follower-moves/ by scripts/gen-data-exports.js). The
// export previously broke silently to [] when the generator's source path went stale, which
// would blank the section, so guard that it stays populated and complete.
describe("FOLLOWER_MOVES", () => {
	// The book has exactly two follower moves (Book I p.233 lists them). "Followers in Fights" is
	// not a move: it is the Moves & Gear handout's reference box of that name, carried on the same
	// card after them.
	it("lists the two follower moves in rulebook order, then Followers in Fights", () => {
		expect(FOLLOWER_MOVES.map(m => m.name)).toEqual([
			"Order Followers",
			"Strengthen Your Bond",
			"Followers in Fights",
		]);
	});

	// "Loyal to the End" is the Ranger's animal-companion move (Book I p.143), not a
	// universal follower move, so it must not leak back into the shared list.
	it("does not include the Ranger's Loyal to the End", () => {
		expect(FOLLOWER_MOVES.map(m => m.name)).not.toContain("Loyal to the End");
	});

	it("carries non-empty HTML descriptions", () => {
		for (const move of FOLLOWER_MOVES) {
			expect(move.description).toMatch(/<p>.*<\/p>/s);
		}
	});

	// Followers in Fights was the one card here written in our own words, and twice it drifted
	// off the rules: it narrowed an ordered Defend to two of the move's four Readiness spends, and
	// it made the optional group abstraction read as THE way groups fight, with the ordinary
	// group-attack rules missing. It is now the book's own sentences, and these pin the ones that
	// carry each rule, so a paraphrase has to get past a test that quotes the source.
	it("keeps Followers in Fights in the book's own wording", () => {
		const fights = FOLLOWER_MOVES.find(m => m.name === "Followers in Fights");
		const text = fights.description.replace(/<[^>]+>/g, "");
		for (const phrase of [
			// GM playbook, "Followers in play": every Defend spend stays open to the player.
			"the follower holds Readiness but the player decides when/how to spend it",
			// Moves & Gear handout, "Followers in fights".
			"you can spend 1 Readiness to have the follower suffer the damage/effects of an attack, or to have the follower draw all attention from your ward to itself",
			// Book I p.469, the same caveat for a follower who Aids.
			"that might require spending Loyalty, too",
			// GM playbook, "Group followers": the rules that apply when nothing is abstracted.
			"roll damage separately against each foe",
			"roll one attacker's damage, +1 per each additional attacker",
			"the group holds a common pool of Readiness",
			// GM playbook, "Abstracting group exchanges".
			"Optional rule for fights between larger groups",
			"has HP/armor as per a single individual member",
		]) {
			expect(text).toContain(phrase);
		}
	});

	// The sheet runs every card through the `moveBody` helper, which lifts a roll's outcomes out
	// of the prose into a ladder. None of these is a roll with outcomes to lift ("gets a 7+" is a
	// trigger), so each must come back exactly as the book prints it.
	it("renders on the sheet exactly as written", () => {
		for (const move of FOLLOWER_MOVES) {
			expect(moveBodyHtml(move.description, null)).toBe(move.description);
		}
	});

	// Book I files these as "Follower moves", a category of their own beside "Special moves"
	// (End of Session, Death's Door). The sheet also has a Special Moves tab, so the old heading
	// "Follower Special Moves" suggested a link between the two that the book does not make.
	it("sits under the book's heading, Follower Moves", () => {
		const titles = [...readRepo("templates/actor/partials/tab-followers.hbs")
			.matchAll(/stonetop-follower-rules-title">([^<]*)</g)].map(m => m[1]);
		expect(titles).toContain("Follower Moves");
		expect(titles).not.toContain("Follower Special Moves");
	});
});
