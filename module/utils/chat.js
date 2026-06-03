import {escHtml} from "./strings.js";

/**
 * Post a guided-move summary card to chat.
 * @param {Actor} actor
 * @param {string} title   Move name shown in the card header.
 * @param {{label: string, value: string}[]} rows  Non-empty rows to display.
 */
export function postMoveToChat(actor, title, rows) {
	if (!globalThis.ChatMessage || !rows.length) return;
	const content = `<section class="pbta-chat-card stonetop-roll-card stonetop-homestead-chat-card">
		<div class="cell cell--chat">
			<div class="chat-title row flexrow">
				<h2 class="cell__title">${escHtml(title)}</h2>
			</div>
			<div class="card-content">
				<ul class="stonetop-homestead-chat-list">
					${rows.map(r => `<li><strong>${escHtml(r.label)}:</strong> ${escHtml(r.value)}</li>`).join("")}
				</ul>
			</div>
		</div>
	</section>`;
	ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }) });
}
