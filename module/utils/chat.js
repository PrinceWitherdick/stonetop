import {escHtml} from "./strings.js";

/**
 * Wrap body markup in the standard Stonetop chat-card shell (section / cell /
 * title). Centralizes the load-bearing pbta/stonetop class names so a CSS
 * rename only has to happen here.
 * @param {string} title       Card header text (escaped here).
 * @param {string} innerHtml   Body markup placed inside the cell, after the title.
 * @param {string} [sectionClass]  Extra class(es) for the <section>.
 */
export function stonetopChatCard(title, innerHtml, sectionClass = "") {
	return `<section class="pbta-chat-card stonetop-roll-card${sectionClass ? ` ${sectionClass}` : ""}">
		<div class="cell cell--chat">
			<div class="chat-title row flexrow">
				<h2 class="cell__title">${escHtml(title)}</h2>
			</div>
			${innerHtml}
		</div>
	</section>`;
}

/**
 * Post a guided-move summary card to chat.
 * @param {Actor} actor
 * @param {string} title   Move name shown in the card header.
 * @param {{label: string, value: string}[]} rows  Non-empty rows to display.
 */
export function postMoveToChat(actor, title, rows) {
	if (!globalThis.ChatMessage || !rows.length) return;
	const content = stonetopChatCard(title, `<div class="card-content">
				<ul class="stonetop-homestead-chat-list">
					${rows.map(r => `<li><strong>${escHtml(r.label)}:</strong> ${escHtml(r.value)}</li>`).join("")}
				</ul>
			</div>`, "stonetop-homestead-chat-card");
	ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }) });
}
