/**
 * What the Post-Death tab lets a character DO with their insert, as opposed to what it records.
 *
 * The inserts' triggers are fiction ("when you spend the night watching them", "when you terrify a
 * living person"), and the sheet has no way to know they happened. What it can do is land the
 * outcome once the table says one did, so a Ghost's night at their daughter's bedside is one press
 * rather than a hand-edited HP box and three debility ticks. The triggers stay with the table; the
 * buttons only name outcomes.
 *
 * Offered ATOMICALLY, deliberately. The Terrible Purpose's clauses pair their outcomes differently
 * ("regain all your HP OR clear all your debilities" after a night; "regain all your HP AND clear your
 * debilities, OR clear a consequence" at a milestone), and a button per clause would be three Purposes
 * times five clauses of near-duplicates. So each outcome is its own button and the player presses
 * what the fiction earned them, one or two of them; the tab's hint says so.
 *
 * Also here: the Thrall's Favor as live hold pips, the GM's hand on a Thrall's Marks (cross one off,
 * take a crossing-off back, give one), the master's task being done, and the edit-mode ticks of the
 * insert's own lists, which have rules a plain count write would skip.
 *
 * Every write goes through the character's own seams: HP through restoreHp (the Unliving's own
 * healing is not the magical healing they get nothing from, and Torment's Blessing halves it there),
 * debilities through receiveHealing, Consequences and Marks through markSectionOption /
 * unmarkSectionOption, which refuse a mark already made. A Consequence or Mark that brings a move with
 * it is granted by the lore sync, which watches every lore write (post-death-moves.js).
 */

import { askWithButtons, confirmOutcome } from "../../utils/ask-with-buttons.js";
import { stonetopChatCard } from "../../utils/chat.js";
import { escHtml, joinNames } from "../../utils/strings.js";
import { format, localize } from "../../utils/i18n.js";
import { DEATHS_DOOR_STATE, FAVOR_MAX, FAVOR_TRACK, FINAL_CONSEQUENCE, halfMaxHp } from "./deaths-door.js";
import { gainableMarks, markableConsequences, sectionReader } from "./post-death-choices.js";
import { optionLabel } from "./CharacterPostDeath.js";
import { LoreSection } from "../../model/CharacterSnapshot.js";

const _I18N = "stonetop.postDeath.outcomes";

/** The Ghost's and the Revenant's exclusive "choose 1". */
export const PURPOSE_SECTION = "terrible-purpose";
const _CONSEQUENCES = FINAL_CONSEQUENCE.section;
const _FINAL        = FINAL_CONSEQUENCE.option;
const _MARKS        = "marks";

/**
 * The two lists that ACCUMULATE ("Choose another whenever a move tells you to"). A tick in either is
 * one option taken or given back, through markSectionOption / unmarkSectionOption (which refuse a mark
 * already made) rather than a raw count write. See post-death-choices.js for why the distinction is
 * load-bearing.
 */
const _ACCUMULATING = new Set([_CONSEQUENCES, _MARKS]);

/** The Terrible Purpose's outcomes, in the order the book prints them. */
export const PURPOSE_OUTCOMES = Object.freeze(["regain-all", "clear-all", "clear-consequence", "mark-consequence", "last-door"]);

/**
 * The Consequences that hand their holder something to press, and what. Only these: every other
 * Consequence is either fiction (Otherworldly, Quarry) or has its own automation elsewhere.
 *   SPECTER            "regain 1d8 HP or clear a debility of your choice"
 *   STRANGE APPETITES  "heal damage equal to half your max HP or clear a debility"
 *   INSATIABLE         "gain advantage on your next roll if you choose to do so"
 */
export const CONSEQUENCE_OUTCOMES = Object.freeze({
	"specter":           ["regain-d8", "clear-debility"],
	"strange-appetites": ["heal-half", "clear-debility"],
	"insatiable":        ["indulge"],
});

const _ACTION = {
	"regain-all":        { key: "regainAll",        icon: "fa-heart" },
	"clear-all":         { key: "clearAll",         icon: "fa-broom" },
	"clear-consequence": { key: "clearConsequence", icon: "fa-eraser" },
	"mark-consequence":  { key: "markConsequence",  icon: "fa-square-check" },
	"last-door":         { key: "lastDoor",         icon: "fa-door-open", danger: true },
	"regain-d8":         { key: "regainD8",         icon: "fa-dice-d6" },
	"clear-debility":    { key: "clearDebility",    icon: "fa-broom" },
	"heal-half":         { key: "healHalf",         icon: "fa-heart-circle-plus" },
	"indulge":           { key: "indulge",          icon: "fa-utensils" },
};

// ── The view ───────────────────────────────────────────────────────────────

/**
 * Everything the tab draws beyond the insert's printed lists, and the lists themselves as the tab
 * should show them. Null for a tab with no readable insert (nothing to decorate).
 *
 * @param {object} character  StonetopCharacter
 * @param {object} activeInsert  the snapshot's `postDeathInsert.activeInsert`
 * @param {object} o
 * @param {boolean} o.editMode
 * @param {boolean} o.canEdit   the viewer may write to this character
 * @param {boolean} o.isGM
 * @param {boolean} o.outOfPlay  `dead`: nothing on the tab is theirs to press any more
 * @param {number}  o.hp
 * @param {number}  o.maxHp
 * @param {(section: string) => Promise<object[]>} [o.sections]  the render's shared section reads
 *   (post-death-choices.js#sectionReader)
 * @returns {Promise<{lore: object, outcomes: object|null, favor: object|null, gainMark: boolean, taskComplete: boolean}|null>}
 */
export async function buildPostDeathTabView(character, activeInsert, {
	editMode, canEdit, isGM, outOfPlay, hp, maxHp, sections = sectionReader(character),
}) {
	const entries = activeInsert?.lore?.entries;
	if (!Array.isArray(entries)) return null;

	const entry = slug => entries.find(e => e.slug === slug) ?? null;
	const consequences = entry(_CONSEQUENCES)
		? await sections(_CONSEQUENCES)
		: [];

	if (editMode) _decorateForEdit(entries, { consequences, isGM });

	// Play mode only, for whoever may write: an owner pressing what the fiction earned them. Not for
	// someone out of play, whose Purpose ended with them.
	const playing = !editMode && !!canEdit && !outOfPlay;
	const favorEntry = entry(FAVOR_TRACK.entry);
	return {
		// The Favor track is drawn as pips of its own in play (below), so its lore entry would only
		// print the same count a second time as a lone bullet. Edit mode keeps its checkboxes.
		lore: !editMode && favorEntry
			? new LoreSection(entries.filter(e => e !== favorEntry))
			: activeInsert.lore,
		outcomes: playing ? _outcomesView(character, entry(PURPOSE_SECTION), consequences, { hp, maxHp }) : null,
		favor: !editMode && favorEntry ? _favorView(character, { canSet: !!canEdit && !outOfPlay, task: activeInsert.masterTask }) : null,
		// Favor's overflow is "Gain a new Mark of your choice", so the owner gains it, not only the GM
		// (Dark Succor's GM-chosen Mark is taken in the walkthrough's own window).
		gainMark: !!canEdit && !outOfPlay && !!entry(_MARKS),
		taskComplete: !!canEdit && !outOfPlay && !!activeInsert.masterTask,
	};
}

/**
 * Edit mode's flags on the printed options, set on the snapshot objects the lore partial renders.
 *
 * CAUTIONS, never blocks (the house rule for picks a table may rule differently): a marked option
 * whose prerequisite isn't (UNSTABLE without BREAKDOWN), and more than one Terrible Purpose at once.
 * And the GM's cross-off controls on a Thrall's Marks: one on each Mark neither held nor already gone,
 * and a way back on each one that is gone, for a crossing-off made by mistake.
 */
function _decorateForEdit(entries, { consequences, isGM }) {
	const byEntry = slug => entries.find(e => e.slug === slug)?.options ?? [];

	const needs = new Map(consequences.filter(o => o.marked && o.needsFirst).map(o => [o.slug, o]));
	for (const opt of byEntry(_CONSEQUENCES)) {
		const held = needs.get(opt.slug);
		if (!held) continue;
		const req = consequences.find(o => o.slug === held.requires);
		opt.caution = format(`${_I18N}.cautionNeedsFirst`, { name: held.label, requires: req?.label ?? held.requires });
	}

	const purposes = byEntry(PURPOSE_SECTION).filter(o => o.count > 0);
	if (purposes.length > 1) {
		const caution = format(`${_I18N}.cautionTwoPurposes`, { names: joinNames(purposes.map(o => optionLabel(o.description))) });
		for (const opt of purposes) opt.caution = caution;
	}

	if (!isGM) return;
	const control = (action, key, name) => ({ action, label: format(`${_I18N}.${key}Label`, { name }), text: localize(`${_I18N}.${key}`) });
	for (const opt of byEntry(_MARKS)) {
		const name = optionLabel(opt.description);
		if (opt.crossedOff)   opt.pdiMarkControl = control("uncross", "uncross", name);
		else if (!opt.count)  opt.pdiMarkControl = control("cross-off", "crossOff", name);
	}
}

function _action(action, source, { disabled = false, reason = "" } = {}) {
	const spec = _ACTION[action];
	return {
		action,
		source,
		label:    localize(`${_I18N}.${spec.key}`),
		icon:     spec.icon,
		danger:   !!spec.danger,
		disabled: !!disabled,
		reason:   disabled ? reason : "",
	};
}

/** The Purpose's row and one row per Consequence that hands its holder something to press. */
function _outcomesView(character, purposeEntry, consequences, { hp, maxHp }) {
	const fullHp = Number(maxHp) > 0 && Number(hp) >= Number(maxHp);
	const hpGate = { disabled: fullHp, reason: localize(`${_I18N}.reasonFullHp`) };
	const debilityGate = { disabled: !_markedDebilities(character).length, reason: localize(`${_I18N}.reasonNoDebilities`) };
	// Why each outcome would have nothing to do, whichever row offers it.
	const gate = {
		"regain-all":        hpGate,
		"regain-d8":         hpGate,
		"heal-half":         hpGate,
		"clear-all":         debilityGate,
		"clear-debility":    debilityGate,
		"clear-consequence": { disabled: !_clearableConsequences(consequences).length, reason: localize(`${_I18N}.reasonNoConsequence`) },
		"mark-consequence":  { disabled: !markableConsequences(consequences).length, reason: localize(`${_I18N}.reasonNoneLeft`) },
	};
	const row = (title, source, actions) => ({ title, actions: actions.map(action => _action(action, source, gate[action])) });

	const rows = [];
	const purposes = (purposeEntry?.options ?? []).filter(o => o.count > 0).map(o => optionLabel(o.description));
	if (purposes.length) {
		const source = joinNames(purposes);
		rows.push(row(format(`${_I18N}.purposeTitle`, { name: source }), source, PURPOSE_OUTCOMES));
	}
	for (const opt of consequences) {
		const outcomes = CONSEQUENCE_OUTCOMES[opt.slug];
		if (opt.marked && outcomes) rows.push(row(opt.label, opt.label, outcomes));
	}

	return rows.length ? { rows } : null;
}

/**
 * The Thrall's Favor as hold pips: a ticked pip is a point HELD. While a master's task stands Favor stays
 * at 0 until it is done (Dark Succor), which is FLAGGED, never blocked: the count says so at 0, and Favor
 * held anyway wears the caution frame. The pips stay settable, since the table may know better.
 */
function _favorView(character, { canSet, task = "" }) {
	const held = Math.max(0, Math.min(FAVOR_MAX, Number(character.favor?.()) || 0));
	return {
		canSet,
		caution:   task && held > 0 ? localize(`${_I18N}.favorCautionTask`) : "",
		heldLabel: task && !held ? localize(`${_I18N}.favorHeldByTask`) : format(`${_I18N}.favorHeld`, { held, max: FAVOR_MAX }),
		pips: Array.from({ length: FAVOR_MAX }, (_, index) => ({
			index,
			filled: index < held,
			label:  format(`${_I18N}.favorPip`, { n: index + 1, max: FAVOR_MAX }),
		})),
	};
}

// ── Reading the lists ──────────────────────────────────────────────────────

/** The Consequences a "clear a consequence" may take: any marked, but THE FINAL CONSEQUENCE, which never is. */
function _clearableConsequences(options) {
	return options.filter(o => o.marked && o.slug !== _FINAL);
}

function _markedDebilities(character) {
	return (character.debilityChoices ?? []).filter(d => d.marked);
}

// ── Pressing one ───────────────────────────────────────────────────────────

/**
 * Land one outcome. `source` is what earned it (the Purpose's name, or the Consequence's), which the
 * write is attributed to and the chat card is titled with. Resolves to the lines posted, or null when
 * nothing was written (a picker closed, a confirmation declined, nothing left to do).
 */
export async function runPostDeathOutcome(character, action, { source = "" } = {}) {
	const title = source || localize(`${_I18N}.title`);
	const done = await _outcome(character, action, title);
	if (!done?.lines?.length) return null;
	// A rolled heal has already said all of it on its own dice card.
	if (!done.posted) await postOutcomeCard(character, title, done.lines);
	return done.lines;
}

/** What an outcome did: `{lines, posted}` (posted: it already told the table itself), or null for nothing. */
async function _outcome(character, action, source) {
	const said = (...lines) => ({ lines, posted: false });
	switch (action) {
		case "regain-all": {
			const max = await character.computedMaxHp();
			return _heal(character, max, source);
		}
		case "heal-half": {
			// "Heal damage equal to half your max HP": a gain of half, not a floor at half.
			const max = await character.computedMaxHp();
			return _heal(character, Math.min(max, character.hp + halfMaxHp(max)), source);
		}
		case "regain-d8": return _rollHeal(character, source);
		case "clear-all": {
			const keys = _markedDebilities(character).map(d => d.key);
			return keys.length ? _clearDebilities(character, keys, source) : null;
		}
		case "clear-debility": {
			const key = await _pick(format(`${_I18N}.clearDebilityTitle`, { source }), localize(`${_I18N}.clearDebilityAsk`),
				_markedDebilities(character).map(d => ({ value: d.key, label: format(`${_I18N}.clearNamed`, { name: d.name }) })));
			return key ? _clearDebilities(character, [key], source) : null;
		}
		case "clear-consequence": {
			const picked = await _pickOption(format(`${_I18N}.clearConsequenceTitle`, { source }), localize(`${_I18N}.clearConsequenceAsk`),
				"clearNamed", _clearableConsequences(await character.sectionOptions(_CONSEQUENCES)));
			if (!picked || !(await character.unmarkSectionOption(_CONSEQUENCES, picked.slug))) return null;
			return said(format(`${_I18N}.consequenceCleared`, { name: escHtml(picked.label) }));
		}
		case "mark-consequence": {
			const picked = await _pickOption(format(`${_I18N}.markConsequenceTitle`, { source }), localize(`${_I18N}.markConsequenceAsk`),
				"markNamed", markableConsequences(await character.sectionOptions(_CONSEQUENCES)));
			if (!picked || !(await character.markSectionOption(_CONSEQUENCES, picked.slug))) return null;
			return said(format(`${_I18N}.consequenceMarked`, { name: escHtml(picked.label) }));
		}
		case "last-door": {
			const name = escHtml(character._actor?.name ?? "");
			const ok = await confirmOutcome({
				title:   localize(`${_I18N}.lastDoorTitle`),
				content: format(`${_I18N}.lastDoorBody`, { name, source: escHtml(source) }),
				yes:     { label: localize(`${_I18N}.lastDoorYes`), icon: "fa-door-open" },
				no:      { label: localize(`${_I18N}.lastDoorNo`) },
			});
			if (!ok) return null;
			await character.setDeathsDoorState(DEATHS_DOOR_STATE.DEAD);
			return said(format(`${_I18N}.lastDoorLine`, { name }));
		}
		case "indulge":
			// Named as the book names it on the held-advantage glyph, beside anything else held.
			await character.holdAdvantage(localize(`${_I18N}.insatiableSource`));
			return said(localize(`${_I18N}.indulged`));
		default:
			return null;
	}
}

/**
 * HP up to `target`, through restoreHp: the Unliving's own healing, which is not the magical healing
 * they gain nothing from, and the one seam where Torment's Blessing halves it. The line reports what
 * the write actually left, so a halving shows. Null when it raised nothing.
 */
async function _heal(character, target, source) {
	const from = character.hp;
	if (!(await character.restoreHp(target, source))) return null;
	return { lines: [format(`${_I18N}.regained`, { from, to: character.hp })], posted: false };
}

/**
 * SPECTER's 1d8, rolled where the table can see it land, then healed. Its dice card carries the HP
 * too, so it is the only card: a second one would say it all twice.
 */
async function _rollHeal(character, source) {
	const roll = await new Roll("1d8").evaluate();
	const max = await character.computedMaxHp();
	const from = character.hp;
	const raised = await character.restoreHp(Math.min(max, from + roll.total), source);
	const line = raised
		? format(`${_I18N}.rolledHeal`, { roll: roll.total, from, to: character.hp })
		: format(`${_I18N}.rolledNoGain`, { roll: roll.total });
	await roll.toMessage({
		speaker: globalThis.ChatMessage?.getSpeaker?.({ actor: character._actor }),
		flavor:  `<strong>${escHtml(source)}</strong>: ${line}`,
	});
	return { lines: [line], posted: true };
}

async function _clearDebilities(character, keys, source) {
	const { cleared } = await character.receiveHealing({ clearDebilities: keys, moveName: source });
	if (!cleared?.length) return null;
	return { lines: [format(`${_I18N}.debilitiesCleared`, { names: escHtml(joinNames(cleared.map(c => c.name))) })], posted: false };
}

/**
 * One button per choice, each naming its outcome, and a way out last. Null when there is nothing to
 * choose from or the window is closed.
 */
async function _pick(title, content, choices) {
	if (!choices.length) return null;
	return askWithButtons({
		title,
		content,
		buttons: [
			...choices.map((c, i) => ({ key: `c${i}`, label: c.label, value: c.value })),
			{ key: "cancel", label: localize(`${_I18N}.cancel`), icon: "fa-xmark", value: null },
		],
	});
}

/** `_pick` over lore options, each button worded by `namedKey`: the option picked (`{slug, label}`), or null. */
async function _pickOption(title, content, namedKey, options) {
	const slug = await _pick(title, content, options.map(o => ({ value: o.slug, label: format(`${_I18N}.${namedKey}`, { name: o.label }) })));
	return slug ? options.find(o => o.slug === slug) ?? { slug, label: slug } : null;
}

/** The table hears what was pressed, in the same card the 0-HP walkthrough reports in. */
export async function postOutcomeCard(character, title, lines) {
	const ChatMessage = globalThis.ChatMessage;
	if (!ChatMessage || !lines.length) return;
	const actor = character?._actor ?? null;
	await ChatMessage.create({
		speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
		content: stonetopChatCard(title, `<div class="card-content">
			<ul class="stonetop-undeath-summary">${lines.map(l => `<li>${l}</li>`).join("")}</ul>
		</div>`, "stonetop-dying-card"),
	});
}

// ── The Thrall ─────────────────────────────────────────────────────────────

/**
 * A Favor pip clicked: a ticked pip is a point HELD, so ticking the third fills to 3 and unticking
 * the last one held spends it. Same "click sets the track to here" rule as every move track.
 */
export async function setFavorFromPip(character, index, filled) {
	const value = filled ? Number(index) : Number(index) + 1;
	await character.setFavor(value);
	return value;
}

/**
 * "Gain a new Mark": Favor's overflow (your choice) and Dark Succor (the GM's). The GM's control, so it
 * offers every Mark the Thrall can still gain and lets whoever presses it choose.
 *
 * Favor goes to 0 in the Mark's own write: the overflow is "reduce your Favor to 0 and choose 1", and
 * Dark Succor's is "Regardless, reset your Favor to 0", so whichever brought them here, none is left.
 *
 * With none left it is Unholy Vessel ("When you would gain a Mark but there are none left to gain,
 * your humanity is utterly lost"), resolved the way UndeathDialog resolves it (loseToUnholyVessel).
 * "None left" is UndeathDialog's own test: every Mark held or crossed off.
 */
export async function gainThrallMark(character) {
	const options = gainableMarks(await character.sectionOptions(_MARKS));
	if (!options.length) {
		const ok = await confirmOutcome({
			title:   localize("stonetop.undeath.unholyVessel.label"),
			content: `<p>${escHtml(localize("stonetop.undeath.unholyVessel.warning"))}</p>`,
			yes:     { label: localize("stonetop.undeath.unholyVessel.apply"), icon: "fa-skull" },
			no:      { label: localize(`${_I18N}.unholyVesselNo`) },
		});
		if (!ok) return null;
		const lines = await loseToUnholyVessel(character);
		await postOutcomeCard(character, localize("stonetop.undeath.unholyVessel.label"), lines);
		return { unholyVessel: true, lines };
	}
	const picked = await _pickOption(localize(`${_I18N}.gainMarkTitle`), localize(`${_I18N}.gainMarkAsk`), "gainNamed", options);
	const marked = picked ? character.markSectionOptionUpdateData(_MARKS, picked.slug) : null;
	if (!marked) return null;
	const hadFavor = Number(character.favor?.()) > 0;
	await character.applyUpdate({ ...marked, ...character.favorUpdateData(0) }, localize(`${_I18N}.gainMark`));
	const lines = [format(`${_I18N}.markGained`, { name: escHtml(picked.label) })];
	if (hadFavor) lines.push(localize(`${_I18N}.favorReset`));
	await postOutcomeCard(character, localize(`${_I18N}.gainMark`), lines);
	return { slug: picked.slug, lines };
}

/**
 * Unholy Vessel: the Thrall is lost, a threat in the GM's control. The state goes to `dead` in one
 * write (out of play; deaths-door.js#lostToTheGm names a dead Thrall a threat), attributed to
 * `moveName` (the 0-HP walkthrough passes its own move, UndeathDialog#_applyUnholyVessel), and the
 * summary is the walkthrough's own sentence.
 */
export async function loseToUnholyVessel(character, moveName = localize("stonetop.undeath.unholyVessel.label")) {
	await character.applyUpdate(character.deathsDoorStateUpdateData(DEATHS_DOOR_STATE.DEAD), moveName);
	return [format("stonetop.undeath.unholyVessel.summary", { name: escHtml(character._actor?.name ?? "") })];
}

/** "Until you complete it": the task is done, and the Favor it held at 0 is free to rise. */
export async function completeMasterTask(character) {
	const task = character.masterTask;
	if (!task) return false;
	const ok = await confirmOutcome({
		title:   localize(`${_I18N}.taskTitle`),
		content: format(`${_I18N}.taskBody`, { task: escHtml(task) }),
		yes:     { label: localize(`${_I18N}.taskYes`), icon: "fa-check" },
		no:      { label: localize(`${_I18N}.taskNo`) },
	});
	if (!ok || !(await character.clearMasterTask())) return false;
	await postOutcomeCard(character, localize("stonetop.postDeath.masterTask"),
		[format(`${_I18N}.taskDoneLine`, { task: escHtml(task) })]);
	return true;
}

// ── Edit mode's ticks ──────────────────────────────────────────────────────

/**
 * One tick of an edit-mode checkbox on the insert's lists. Resolves false when the tick was refused
 * (a confirmation declined), so the caller can put the box back.
 *
 *   THE FINAL CONSEQUENCE  asks first, then marks it and sets `dead` in ONE write: it ends them as a
 *                          player character, and a tick that marked it without that left a monster
 *                          sitting at the table as a live party member. Unticked, it asks too (the
 *                          user's call, 2026-09-30), then both come back off in one write.
 *   Consequences, Marks    one option taken or given back (markSectionOption / unmarkSectionOption).
 *   anything else          the count, as it always was (a Terrible Purpose, an Impulse, Favor).
 *
 * A Consequence or Mark that brings a move with it is granted or taken back by the lore sync, which
 * watches every lore write (post-death-moves.js).
 */
export async function tickInsertLore(character, { section, option, count }) {
	const on = Number(count) > 0;
	if (section === _CONSEQUENCES && option === _FINAL) {
		const name = escHtml(character._actor?.name ?? "");
		const key = on ? "final" : "finalUndo";
		const ok = await confirmOutcome({
			title:   localize(`${_I18N}.${key}Title`),
			content: format(`${_I18N}.${key}Body`, { name }),
			yes:     { label: localize(`${_I18N}.${key}Yes`), icon: on ? "fa-skull" : "fa-rotate-left" },
			no:      { label: localize(`${_I18N}.${key}No`) },
		});
		if (!ok) return false;
		const update = on ? character.finalConsequenceUpdateData() : character.finalConsequenceUndoUpdateData();
		await character.applyUpdate(update, localize(`${_I18N}.finalMove`));
		return true;
	}
	if (_ACCUMULATING.has(section)) {
		if (on) await character.markSectionOption(section, option);
		else await character.unmarkSectionOption(section, option);
		return true;
	}
	await character.setPostDeathLoreCount(section, option, Number(count) || 0);
	return true;
}
