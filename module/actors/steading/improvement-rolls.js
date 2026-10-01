/**
 * IMPROVEMENTS AT THE MOMENT OF A ROLL: what the steading has built, turned into the questions a
 * homefront move's window asks and the changes the answers make to the dice.
 *
 * Most of what an improvement does "henceforth" happens when the Seasons Change, and the season
 * window already handles it. These are the rest: the ones that change a MOVE. Some always apply
 * (a Township has advantage to Muster, Pull Together and Trade & Barter). Most turn on something
 * only the table knows ("when you take advantage of the stone wall", "when you specifically
 * involve the watch"), so the window asks, and asks only once the improvement is built.
 *
 * Pure: the sheet hands in `has(slug)` and the militia's trained tactics, so every rule here can be
 * tested as a rule.
 */

/** The steading moves these rules name, by the label their roll card carries. */
export const STEADING_MOVE = Object.freeze({
	DEPLOY:        "Deploy",
	MUSTER:        "Muster",
	PULL_TOGETHER: "Pull Together",
	TRADE_BARTER:  "Trade & Barter",
	REQUISITION:   "Requisition",
	AUROCHS_HUNT:  "Aurochs Hunt",
	HEROIC:        "Heroic Reputation",
});

/** "Disadvantage to Deploy, Muster, or Pull Together" (the Diminished debility). */
export const DIMINISHED_MOVES = new Set([STEADING_MOVE.DEPLOY, STEADING_MOVE.MUSTER, STEADING_MOVE.PULL_TOGETHER]);

/** Township: "When you Muster, Pull Together, or Trade & Barter, you have advantage." */
const TOWNSHIP_MOVES = new Set([STEADING_MOVE.MUSTER, STEADING_MOVE.PULL_TOGETHER, STEADING_MOVE.TRADE_BARTER]);

/**
 * The Marshal's Logistics: "When you have a steading Muster or Pull Together, or when you
 * Requisition, you have advantage." The advantage is the Marshal's, not the steading's, so it
 * turns on WHO is behind the roll, which only the table knows: the window asks, ticked, and only
 * when someone has the move learned (actors/character/logistics.js finds them).
 */
export const LOGISTICS = "Logistics";
export const LOGISTICS_MOVES = new Set([STEADING_MOVE.MUSTER, STEADING_MOVE.PULL_TOGETHER, STEADING_MOVE.REQUISITION]);

/** The Logistics line, naming who holds the move ("the Marshal" when nobody is named). */
function logisticsLabel(moveName, holders) {
	const who = holders.length ? holders.join(" or ") : "the Marshal";
	const act = moveName === STEADING_MOVE.REQUISITION ? "Requisitioning" : `having the steading ${moveName}`;
	return `${LOGISTICS} (${who}): ${holders.length > 1 ? "one of them is" : "they are"} the one ${act}, advantage`;
}

/**
 * The Ranger's Pathfinder: "When you lead your people to Pull Together or Deploy beyond sight of
 * home, you have advantage." The Ranger's like Logistics, and turning on fiction besides (beyond
 * sight of home), so the window asks UNTICKED, and only when someone has the move learned
 * (owns-move.js#worldLearnedHolderNames finds them).
 */
export const PATHFINDER = "Pathfinder";
export const PATHFINDER_MOVES = new Set([STEADING_MOVE.DEPLOY, STEADING_MOVE.PULL_TOGETHER]);

/** The Pathfinder line, naming who holds the move ("the Ranger" when nobody is named). */
function pathfinderLabel(holders) {
	const who = holders.length ? holders.join(" or ") : "the Ranger";
	return `${PATHFINDER} (${who}): ${holders.length > 1 ? "one of them leads" : "they lead"} the people beyond sight of home, advantage`;
}

/** The wall a Deploy can take advantage of: the Stone Wall erases the Palisade when it is built. */
function wallOf(has) {
	if (has("stoneWall")) return "Stone Wall";
	if (has("palisade")) return "Palisade";
	return null;
}

/**
 * The questions a move's window asks because of what the steading has built, plus Deploy's own
 * "position of strength", which the move itself asks and Well-Trained Militia feeds.
 *
 * @param {string} moveName  STEADING_MOVE
 * @param {string} statKey   the stat the move rolls
 * @param {object} o
 * @param {(slug: string) => boolean} o.has  is this improvement built?
 * @param {Array<{index: number, label: string}>} [o.tactics]  the militia's trained tactics
 * @param {string[]} [o.logistics]  the names of the characters with Logistics learned; any at all
 *   asks the Logistics line, ticked (`checked`), since the Marshal is usually the one behind it
 * @param {string[]} [o.pathfinder]  the names of the characters with Pathfinder learned; any at all
 *   asks the Pathfinder line, unticked, since beyond sight of home is the table's call
 * @returns {Array<{name: string, type: "checkbox"|"select", label: string, checked?: boolean, options?: Array<{value: string, label: string}>}>}
 */
export function improvementQuestions(moveName, statKey, { has = () => false, tactics = [], logistics = [], pathfinder = [] } = {}) {
	const asks = [];
	if (moveName === STEADING_MOVE.DEPLOY) {
		asks.push({
			name: "strength", type: "checkbox",
			label: "The steading is acting from a position of strength (the high ground, superior numbers, surprise, magic): you pick the 7-9 consequence",
		});
		if (has("wellTrainedMilitia") && tactics.length) {
			asks.push({
				name: "tactic", type: "select",
				label: "Using one of the militia's trained tactics (a position of strength)",
				options: [{ value: "", label: "No" }, ...tactics.map(t => ({ value: String(t.index), label: t.label }))],
			});
		}
		const wall = wallOf(has);
		if (wall) asks.push({ name: "wall", type: "checkbox", label: `Taking advantage of the ${wall.toLowerCase()}: advantage` });
	}
	if (statKey === "defenses" && has("standingWatch")) {
		asks.push({ name: "watch", type: "checkbox", label: "The standing watch is involved: treat Defenses as 1 higher" });
	}
	if (moveName === STEADING_MOVE.PULL_TOGETHER && has("herdOfHorses")) {
		asks.push({ name: "herd", type: "checkbox", label: "Leveraging the herd of horses: it takes half as long and costs half as much" });
	}
	if (moveName === STEADING_MOVE.REQUISITION && has("herdOfHorses")) {
		asks.push({ name: "herdShare", type: "checkbox", label: "Requisitioning half the herd of horses or less: a 6- counts as a 7-9" });
	}
	if (LOGISTICS_MOVES.has(moveName) && logistics.length) {
		asks.push({ name: "logistics", type: "checkbox", checked: true, label: logisticsLabel(moveName, logistics) });
	}
	if (PATHFINDER_MOVES.has(moveName) && pathfinder.length) {
		asks.push({ name: "pathfinder", type: "checkbox", label: pathfinderLabel(pathfinder) });
	}
	return asks;
}

/**
 * What the steading's improvements, its debilities and the window's answers do to one roll.
 *
 * Advantage and disadvantage are collected as their SOURCES rather than settled as they are found,
 * because "if you have advantage and disadvantage on the same roll, they cancel each other out"
 * (Book I). A Township that is Diminished musters at a plain 2d6, not at disadvantage.
 *
 * @param {object} o
 * @param {string} o.moveName
 * @param {string} o.statKey
 * @param {(slug: string) => boolean} o.has
 * @param {object}  [o.answers]     the window's answers, by question name
 * @param {Array<{index: number, label: string}>} [o.tactics]
 * @param {boolean} [o.diminished]  the steading has Diminished marked
 * @param {boolean} [o.winter]      Trade & Barter's "In winter, you have disadvantage"
 * @param {string}  [o.held]        what bought a held advantage on this roll (Rites of the Land)
 * @param {boolean} [o.torsBlessing] Tor's blessing holds this season: "+1 to Pull Together"
 * @returns {{adv: string[], dis: string[], statBonus: number, bonus: number, notes: string[], strength: boolean, missAsPartial: string}}
 *   `bonus` is a plus to the ROLL, where `statBonus` treats the stat itself as higher.
 */
export function rollAdjustments({
	moveName, statKey, has = () => false, answers = {}, tactics = [], diminished = false, winter = false, held = "",
	torsBlessing = false,
}) {
	const adv = [];
	const dis = [];
	const notes = [];
	let statBonus = 0;
	let bonus = 0;
	// The seasonal gain: "Fine weather abounds. Take +1 to Pull Together this season."
	if (moveName === STEADING_MOVE.PULL_TOGETHER && torsBlessing) {
		bonus += 1;
		notes.push("Tor's blessing: +1");
	}
	if (TOWNSHIP_MOVES.has(moveName) && has("township")) adv.push("Township");
	if (LOGISTICS_MOVES.has(moveName) && answers.logistics) adv.push(LOGISTICS);
	if (PATHFINDER_MOVES.has(moveName) && answers.pathfinder) adv.push(PATHFINDER);
	const wall = wallOf(has);
	if (moveName === STEADING_MOVE.DEPLOY && wall && answers.wall) adv.push(wall);
	if (held) adv.push(held);
	if (diminished && DIMINISHED_MOVES.has(moveName)) dis.push("Diminished");
	if (winter && moveName === STEADING_MOVE.TRADE_BARTER) dis.push("Winter");
	if (statKey === "defenses" && has("standingWatch") && answers.watch) {
		statBonus += 1;
		notes.push("Standing watch: Defenses +1");
	}
	const tactic = tactics.find(t => String(t.index) === String(answers.tactic ?? ""));
	if (moveName === STEADING_MOVE.DEPLOY && tactic) notes.push(`Trained tactic: ${tactic.label.split(":")[0]}`);
	const strength = moveName === STEADING_MOVE.DEPLOY && (!!answers.strength || !!tactic);
	if (strength) notes.push("A position of strength");
	if (moveName === STEADING_MOVE.PULL_TOGETHER && has("herdOfHorses") && answers.herd) {
		notes.push("Herd of Horses: half the time, half the cost");
	}
	const missAsPartial = moveName === STEADING_MOVE.REQUISITION && has("herdOfHorses") && answers.herdShare
		? "Half the herd or less: a 6- counts as a 7-9"
		: "";
	return { adv, dis, statBonus, bonus, notes, strength, missAsPartial };
}

/**
 * The mode a roll goes out at, from the mode the player chose and every rule's advantage and
 * disadvantage. The player's choice counts as one more source: a GM-granted advantage on a
 * Diminished muster cancels out like any other.
 *
 * @param {string}   chosen  "adv" | "dis" | "normal"
 * @param {string[]} adv
 * @param {string[]} dis
 * @returns {"adv"|"dis"|"normal"}
 */
export function netRollMode(chosen, adv = [], dis = []) {
	const up   = chosen === "adv" || adv.length > 0;
	const down = chosen === "dis" || dis.length > 0;
	if (up && down) return "normal";
	if (up) return "adv";
	if (down) return "dis";
	return "normal";
}

/**
 * The pills a roll card shows for where its advantage and disadvantage came from, and the notes
 * that change what a result means. Diminished is left out: the card already shows it as the
 * steading's debility.
 */
export function rollConditionNotes({ adv = [], dis = [], notes = [] }) {
	return [
		...adv.map(source => `${source}: advantage`),
		...dis.filter(source => source !== "Diminished").map(source => `${source}: disadvantage`),
		...notes,
	];
}
