import { registerSettings } from "./module/settings.js";
import { createStonetopActorClass } from "./module/actors/StonetopActor.js";
import { createStonetopItemClass } from "./module/item/StonetopItem.js";
import { createStonetopCharacterSheetClass } from "./module/actors/character/StonetopCharacterSheet.js";
import { onPbtaSheetConfig } from "./module/hooks/PbtaSheetConfig.js";
import { onReady } from "./module/hooks/Ready.js";
import { onRenderActorSheet } from "./module/hooks/RenderActorSheet.js";
import { onRenderPause } from "./module/hooks/RenderPause.js";
import { info } from "./module/utils/logger.js";

// -- INIT ------------------------------------------------------
// Fires before the world loads. Document classes and settings must
// be registered here so they're available before any documents load.
Hooks.once("init", () => {
	info("Initializing");

	registerSettings();

	Handlebars.registerHelper("resourceChecks", resource => {
		if (!resource) return [];
		const { current, max, labels } = resource;
		return Array.from({ length: max }, (_, i) => ({ checked: i < current, label: labels[i] || null }));
	});

	Handlebars.registerHelper("poolGroups", pool => {
		if (!pool) return [];
		const { current } = pool;
		return [
			Array.from({ length: 3 }, (_, i) => ({ checked: i < current, index: i })),
			Array.from({ length: 3 }, (_, i) => ({ checked: (i + 3) < current, index: i + 3 })),
			Array.from({ length: 3 }, (_, i) => ({ checked: (i + 6) < current, index: i + 6 })),
		];
	});

	Handlebars.registerHelper("times", n => Array.from({ length: n ?? 0 }, (_, i) => i));

	Handlebars.registerHelper("repeatChecks", move => {
		if (!move?.repeat) return [];
		const { max, current } = move.repeat;
		const lastOwnedId = move.ownedIds[move.ownedIds.length - 1] ?? null;
		return Array.from({ length: max }, (_, i) => ({
			checked:  i < current,
			ownedId:  i < current ? lastOwnedId : null,
			disabled: move.isStarting || move.locked || (!(i < current) && i !== current),
		}));
	});

	CONFIG.Actor.documentClass = createStonetopActorClass(CONFIG.Actor.documentClass);
	CONFIG.Item.documentClass = createStonetopItemClass(CONFIG.Item.documentClass);

	const StonetopCharacterSheet = createStonetopCharacterSheetClass(game.pbta.applications.actor.PbtaActorSheet);
	Actors.registerSheet("stonetop", StonetopCharacterSheet, {
		types: ["character"],
		makeDefault: true,
		label: "Stonetop Character Sheet",
	});

	loadTemplates({
		"stonetop.actor-header":     "modules/stonetop/templates/actor/partials/actor-header.hbs",
		"stonetop.tab-details":      "modules/stonetop/templates/actor/partials/tab-details.hbs",
		"stonetop.tab-moves":        "modules/stonetop/templates/actor/partials/tab-moves.hbs",
		"stonetop.tab-equipment":    "modules/stonetop/templates/actor/partials/tab-equipment.hbs",
		"stonetop.tab-arcana":       "modules/stonetop/templates/actor/partials/tab-arcana.hbs",
		"stonetop.tab-post-death":      "modules/stonetop/templates/actor/partials/tab-post-death.hbs",
		"stonetop.tab-special-moves":   "modules/stonetop/templates/actor/partials/tab-special-moves.hbs",
		"stonetop.move-group":       "modules/stonetop/templates/actor/partials/move-group.hbs",
		"stonetop.lore-section":     "modules/stonetop/templates/actor/partials/lore-section.hbs",
		"stonetop.section-heading":  "modules/stonetop/templates/actor/partials/section-heading.hbs",
		"stonetop.resource-track":   "modules/stonetop/templates/actor/partials/resource-track.hbs",
	});
});

// -- RENDER PAUSE ----------------------------------------------
// Fires when the game is paused
Hooks.on("renderPause", onRenderPause);

// -- PBTA SHEET CONFIG -----------------------------------------
// Fires after init, before ready. pbta listens for this hook
// to allow modules to override its sheet configuration.
Hooks.once("pbtaSheetConfig", onPbtaSheetConfig);

// -- READY -----------------------------------------------------
// Fires when the world is fully loaded and all documents exist.
Hooks.once("ready", onReady);

// -- RENDER ACTOR SHEET ----------------------------------------
// Fires every time any actor sheet renders.
Hooks.on("renderActorSheet", onRenderActorSheet);

// -- CHAT SPEAKER ALIAS ----------------------------------------
// For every chat message sent by a stonetop character, prefix the
// speaker alias with the playbook name: "Arwel The Judge".
Hooks.on("preCreateChatMessage", (message) => {
	const { token: tokenId, actor: actorId } = message.speaker ?? {};
	const actor = (tokenId ? canvas.tokens?.get(tokenId)?.actor : null)
		?? (actorId ? game.actors?.get(actorId) : null);
	if (!actor || actor.type !== "character") return;
	const playbookName = actor.system?.playbook?.name ?? "";
	if (!playbookName) return;
	message.updateSource({ "speaker.alias": `${actor.name} ${playbookName}` });
});

// -- BURN BRIGHTLY ---------------------------------------------
// After each PBTA roll, show a "Burn brightly" button to the
// owning player when they have enough XP to level up.
const BURN_BRIGHTLY_TOOLTIP =
	"When you have enough XP to Level Up (6 + twice your current level), " +
	"you may spend 2 XP after any roll you make to add +1 to that roll (max +1 per roll).";

Hooks.on("renderChatMessageHTML", (message, html) => {
	const cardButtons = html.querySelector(".pbta-chat-card .card-buttons");
	if (!cardButtons) return;

	const { token: tokenId, actor: actorId } = message.speaker ?? {};
	const actor = (tokenId ? canvas.tokens?.get(tokenId)?.actor : null)
		?? (actorId ? game.actors?.get(actorId) : null);

	if (!actor || actor.type !== "character" || !actor.isOwner) return;

	const alreadyBurned = message.getFlag("stonetop", "burnBrightly") ?? false;
	const xp    = actor.system?.attributes?.xp?.value    ?? 0;
	const level = actor.system?.attributes?.level?.value ?? 1;
	const canAfford = xp >= 6 + 2 * level;

	if (!canAfford && !alreadyBurned) return;

	const btn = document.createElement("button");
	btn.className = "stonetop-burn-brightly-btn";
	btn.textContent = "Burn brightly";
	btn.dataset.tooltip = BURN_BRIGHTLY_TOOLTIP;
	btn.dataset.tooltipDirection = "UP";
	btn.disabled = alreadyBurned;

	// Append inline with shift buttons; for non-GMs, PBTA hides the whole
	// .card-buttons div so unhide it and hide only the shift-specific buttons.
	cardButtons.appendChild(btn);
	if (!game.user.isGM) {
		cardButtons.querySelectorAll("[data-action]").forEach(b => b.style.display = "none");
		cardButtons.style.display = "flex";
	}

	if (alreadyBurned) return;

	btn.addEventListener("click", async () => {
		btn.disabled = true;
		const currentXp    = actor.system?.attributes?.xp?.value    ?? 0;
		const currentLevel = actor.system?.attributes?.level?.value ?? 1;
		if (currentXp < 6 + 2 * currentLevel) {
			ui.notifications.warn("You don't have enough XP to Burn Brightly.");
			btn.disabled = false;
			return;
		}
		try {
			const playbookName = actor.system?.playbook?.name ?? "";
			await actor.update({ "system.attributes.xp.value": currentXp - 2 });
			const newXp = currentXp - 2;
			const maxXp = 6 + 2 * currentLevel;
			ChatMessage.create({
				content: `-2 XP for Burning Brightly.<br>New XP: ${newXp} / ${maxXp}`,
				speaker: ChatMessage.getSpeaker({ actor }),
			});

			const rolls = message.rolls;
			const roll  = rolls.at(0);
			let opTerm  = roll.terms.find(t => t instanceof foundry.dice.terms.OperatorTerm && t.options.rollShifting);
			let numTerm = roll.terms.find(t => t instanceof foundry.dice.terms.NumericTerm  && t.options.rollShifting);
			const originalValue = opTerm && numTerm
				? Roll.safeEval(`${opTerm.operator}${numTerm.number}`)
				: 0;

			if (!numTerm) {
				roll.terms.push(
					opTerm  = new foundry.dice.terms.OperatorTerm({ operator: "+", options: { rollShifting: true } }),
					numTerm = new foundry.dice.terms.NumericTerm({ number: 1, options: { rollShifting: true } })
				);
			} else {
				numTerm.number = Math.abs(Roll.safeEval(`${opTerm.operator}${numTerm.number} + 1`));
			}
			if (numTerm.number === 1 && originalValue === 0 && opTerm.operator !== "+") opTerm.operator = "+";
			else if (numTerm.number === 0) opTerm.operator = "+";

			roll.resetFormula();
			await roll._evaluate();

			// Also update the roll card's speaker alias so its title reflects the playbook.
			const speakerUpdate = playbookName
				? { alias: `${actor.name} ${playbookName}` }
				: {};
			await message.update({ rolls, speaker: { ...message.speaker, ...speakerUpdate }, flags: { stonetop: { burnBrightly: true } } });
		} catch (err) {
			console.error("Stonetop | Error burning brightly:", err);
			btn.disabled = false;
		}
	});
});
