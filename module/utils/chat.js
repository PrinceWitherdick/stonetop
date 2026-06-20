import {escHtml} from "./strings.js";

/** Core stat paths (in a flattened update) mapped to their chat labels. */
export const STAT_CHAT_LABELS = {
	"system.stats.str.value": "STR",
	"system.stats.dex.value": "DEX",
	"system.stats.int.value": "INT",
	"system.stats.wis.value": "WIS",
	"system.stats.con.value": "CON",
	"system.stats.cha.value": "CHA",
};

/** Steading ("stonetop") stat paths (in a flattened update) mapped to their chat labels. */
export const STEADING_STAT_CHAT_LABELS = {
	"system.stats.fortunes.value": "Fortunes",
	"system.stats.defenses.value": "Defenses",
	"system.attributes.population.value": "Population",
	"system.attributes.prosperity.value": "Prosperity",
	"system.attributes.surplus.value": "Surplus",
};

/** Format a stat value for chat: numbers get a leading sign (+1, -1, 0); blanks show as a dash. */
function formatStatValue(value) {
	if (value === undefined || value === null || value === "") return "—";
	const num = Number(value);
	return Number.isFinite(num) ? (num >= 0 ? `+${num}` : `${num}`) : String(value);
}

/**
 * Wrap body markup in the bare Stonetop chat-card shell (section / cell), with no
 * title row. Centralizes the load-bearing pbta/stonetop class names so a CSS
 * rename only has to happen here.
 * @param {string} innerHtml       Body markup placed inside the cell.
 * @param {string} [sectionClass]  Extra class(es) for the <section>.
 */
export function stonetopCardShell(innerHtml, sectionClass = "") {
	return `<section class="pbta-chat-card stonetop-roll-card${sectionClass ? ` ${sectionClass}` : ""}">
		<div class="cell cell--chat">
			${innerHtml}
		</div>
	</section>`;
}

/**
 * Body markup for a "Seasons Change"-style 2d6 result card: a formula chip, the
 * total badge tinted by tier, the tier label, and the result line. Shared by the
 * Spring Burst and Expedition Requisition rolls so the two cards stay in lockstep.
 * @param {number} total    The 2d6 (+Fortunes) total.
 * @param {string} tier     Result tier key (success/partial/failure) — tints the total badge.
 * @param {string} label    Tier label shown beside the total (e.g. "10+").
 * @param {string} line     Result line markup shown below.
 * @param {string} formula  Roll formula text for the chip.
 */
export function springRollCardBody(total, tier, label, line, formula) {
	return `<div class="card-content stonetop-spring-roll">
		<div class="stonetop-roll-formula">${formula}</div>
		<div class="stonetop-spring-roll-head">
			<span class="stonetop-spring-roll-total stonetop-spring--${tier}">${total}</span>
			<span class="stonetop-spring-roll-tier">${label}</span>
		</div>
		<p class="stonetop-spring-roll-line">${line}</p>
	</div>`;
}

/**
 * The card shell with a title row. Most cards want this; use {@link stonetopCardShell}
 * directly when the message's speaker alias already names the card.
 * @param {string} title       Card header text (escaped here).
 * @param {string} innerHtml   Body markup placed inside the cell, after the title.
 * @param {string} [sectionClass]  Extra class(es) for the <section>.
 */
export function stonetopChatCard(title, innerHtml, sectionClass = "") {
	return stonetopCardShell(
		`<div class="chat-title row flexrow"><h2 class="cell__title">${escHtml(title)}</h2></div>${innerHtml}`,
		sectionClass,
	);
}

/**
 * Post a card whose body is the shared "card-content → homestead list" shape: a
 * <ul> of pre-built <li> rows under the stonetop chat-card shell, spoken by the
 * actor. Centralizes the list wrapper + speaker boilerplate so the move/stat/
 * armor notes don't each re-type it (the markup the comment on {@link stonetopCardShell}
 * promises lives in one place).
 * @param {Actor}  actor
 * @param {string} title     Card header text (escaped by the shell).
 * @param {string} rowsHtml  Pre-built, already-escaped <li>…</li> rows.
 */
export function postListCard(actor, title, rowsHtml) {
	if (!globalThis.ChatMessage || !rowsHtml) return;
	const content = stonetopChatCard(title,
		`<div class="card-content"><ul class="stonetop-homestead-chat-list">${rowsHtml}</ul></div>`,
		"stonetop-homestead-chat-card");
	ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }) });
}

/**
 * Post a guided-move summary card to chat.
 * @param {Actor} actor
 * @param {string} title   Move name shown in the card header.
 * @param {{label: string, value: string}[]} rows  Non-empty rows to display.
 */
export function postMoveToChat(actor, title, rows) {
	if (!rows.length) return;
	postListCard(actor, title,
		rows.map(r => `<li><strong>${escHtml(r.label)}:</strong> ${escHtml(r.value)}</li>`).join(""));
}

/**
 * Post a card to chat announcing one or more core-stat changes.
 * @param {Actor} actor
 * @param {{label: string, oldValue: *, newValue: *}[]} changes
 */
export function postStatChangesToChat(actor, changes) {
	if (!changes?.length) return;
	const rows = changes.map(c =>
		`<li><strong>${escHtml(c.label)}:</strong> ${escHtml(formatStatValue(c.oldValue))} &rarr; ${escHtml(formatStatValue(c.newValue))}</li>`
	).join("");
	const title = changes.length > 1 ? "Stats changed" : "Stat changed";
	postListCard(actor, title, rows);
}
