import { registerSettings } from "./module/settings.js";
import { createStonetopActorClass } from "./module/actors/StonetopActor.js";
import { createStonetopItemClass } from "./module/item/StonetopItem.js";
import { createStonetopArcanumSheetClass } from "./module/item/StonetopArcanumSheet.js";
import { createStonetopCharacterSheetClass } from "./module/actors/character/StonetopCharacterSheet.js";
import { createStonetopSteadingSheetClass } from "./module/actors/steading/StonetopSteadingSheet.js";
import { createStonetopNpcSheetClass } from "./module/actors/npc/StonetopNpcSheet.js";
import { onReady } from "./module/hooks/Ready.js";
import { onRenderActorSheet } from "./module/hooks/RenderActorSheet.js";
import { onRenderPause } from "./module/hooks/RenderPause.js";
import { registerStonetopSingletonHooks } from "./module/hooks/StonetopSingleton.js";
import { info } from "./module/utils/logger.js";

// -- INIT ------------------------------------------------------
Hooks.once("init", () => {
	info("Initializing");

	registerSettings();
	registerStonetopSingletonHooks();

	Handlebars.registerHelper("format", (key, options) => game.i18n.format(String(key), options.hash));

	const _STAT_LABEL_KEYS = {
		str: "stonetop.character.stats.strength",
		dex: "stonetop.character.stats.dexterity",
		int: "stonetop.character.stats.intelligence",
		wis: "stonetop.character.stats.wisdom",
		con: "stonetop.character.stats.constitution",
		cha: "stonetop.character.stats.charisma",
	};
	Handlebars.registerHelper("statLabel", key => game.i18n.localize(_STAT_LABEL_KEYS[String(key)] ?? String(key)));

	Handlebars.registerHelper("resourceChecks", resource => {
		if (!resource) return [];
		const { current, max, labels } = resource;
		return Array.from({ length: max }, (_, i) => ({ checked: i < current, label: labels[i] || null }));
	});

	const _flatPoolItems = pool => {
		if (!pool) return [];
		const total = pool.max ?? 9;
		return Array.from({ length: total }, (_, i) => ({ checked: i < pool.current, index: i }));
	};

	Handlebars.registerHelper("poolItems", _flatPoolItems);

	Handlebars.registerHelper("poolGroups", pool => {
		const items = _flatPoolItems(pool);
		const groups = [];
		for (let i = 0; i < items.length; i += 3) groups.push(items.slice(i, i + 3));
		return groups;
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

	Handlebars.registerHelper("steadingTrack", (currentValue, defaultValue = 0) => {
		const raw = currentValue?.value ?? currentValue;
		const current = Number(raw ?? defaultValue);
		return Array.from({ length: 5 }, (_, i) => {
			const val = i - 1;
			return { val, label: (val >= 0 ? "+" : "") + val, checked: val === current };
		});
	});

	Handlebars.registerHelper("steadingDefenseTrack", (currentValue, defaultValue = 0) => {
		const raw = currentValue?.value ?? currentValue;
		const current = Number(raw ?? defaultValue);
		const sublabels = ["feeble", "mediocre", "strong", "formidable", "legendary"];
		return Array.from({ length: 5 }, (_, i) => {
			const val = i - 1;
			return { val, label: (val >= 0 ? "+" : "") + val, sublabel: sublabels[i], checked: val === current };
		});
	});

	CONFIG.Actor.documentClass = createStonetopActorClass(CONFIG.Actor.documentClass);
	CONFIG.Item.documentClass  = createStonetopItemClass(CONFIG.Item.documentClass);

	const StonetopCharacterSheet = createStonetopCharacterSheetClass(ActorSheet);
	Actors.registerSheet("stonetop", StonetopCharacterSheet, {
		types:       ["character"],
		makeDefault: true,
		label:       "Stonetop Character Sheet",
	});

	const StonetopSteadingSheet = createStonetopSteadingSheetClass(ActorSheet);
	Actors.registerSheet("stonetop", StonetopSteadingSheet, {
		types:       ["stonetop"],
		makeDefault: true,
		label:       "Stonetop Steading Sheet",
	});

	const StonetopNpcSheet = createStonetopNpcSheetClass(ActorSheet);
	Actors.registerSheet("stonetop", StonetopNpcSheet, {
		types:       ["npc"],
		makeDefault: true,
		label:       "Stonetop NPC Sheet",
	});

	const StonetopArcanumSheet = createStonetopArcanumSheetClass(ItemSheet);
	Items.registerSheet("stonetop", StonetopArcanumSheet, {
		types:       ["move"],
		makeDefault: false,
		label:       "Stonetop Arcanum",
	});

	loadTemplates({
		"stonetop.arcanum-sheet":    "systems/stonetop/templates/item/arcanum-sheet.hbs",
		"stonetop.actor-header":     "systems/stonetop/templates/actor/partials/actor-header.hbs",
		"stonetop.actor-stats":      "systems/stonetop/templates/actor/partials/actor-stats.hbs",
		"stonetop.actor-vitals":     "systems/stonetop/templates/actor/partials/actor-vitals.hbs",
		"stonetop.tab-details":      "systems/stonetop/templates/actor/partials/tab-details.hbs",
		"stonetop.tab-moves":        "systems/stonetop/templates/actor/partials/tab-moves.hbs",
		"stonetop.tab-equipment":    "systems/stonetop/templates/actor/partials/tab-equipment.hbs",
		"stonetop.tab-invocations":  "systems/stonetop/templates/actor/partials/tab-invocations.hbs",
		"stonetop.tab-followers":    "systems/stonetop/templates/actor/partials/tab-followers.hbs",
		"stonetop.tab-arcana":       "systems/stonetop/templates/actor/partials/tab-arcana.hbs",
		"stonetop.tab-post-death":      "systems/stonetop/templates/actor/partials/tab-post-death.hbs",
		"stonetop.tab-special-moves":   "systems/stonetop/templates/actor/partials/tab-special-moves.hbs",
		"stonetop.move-group":       "systems/stonetop/templates/actor/partials/move-group.hbs",
		"stonetop.lore-section":     "systems/stonetop/templates/actor/partials/lore-section.hbs",
		"stonetop.section-heading":  "systems/stonetop/templates/actor/partials/section-heading.hbs",
		"stonetop.resource-track":   "systems/stonetop/templates/actor/partials/resource-track.hbs",
		"stonetop.steading-tab-overview":     "systems/stonetop/templates/actor/partials/steading-tab-overview.hbs",
		"stonetop.steading-tab-neighbors":    "systems/stonetop/templates/actor/partials/steading-tab-neighbors.hbs",
		"stonetop.steading-tab-improvements": "systems/stonetop/templates/actor/partials/steading-tab-improvements.hbs",
		"stonetop.steading-tab-moves":        "systems/stonetop/templates/actor/partials/steading-tab-moves.hbs",
		"stonetop.steading-tab-notes":        "systems/stonetop/templates/actor/partials/steading-tab-notes.hbs",
		"stonetop.npc-sheet":                 "systems/stonetop/templates/actor/npc.hbs",
	});
});

// -- RENDER PAUSE ----------------------------------------------
Hooks.on("renderPause", onRenderPause);

// -- READY -----------------------------------------------------
Hooks.once("ready", onReady);

// -- RENDER ACTOR SHEET ----------------------------------------
Hooks.on("renderActorSheet", onRenderActorSheet);

// -- CHAT SPEAKER ALIAS ----------------------------------------
Hooks.on("preCreateChatMessage", (message) => {
	const { token: tokenId, actor: actorId } = message.speaker ?? {};
	const actor = (tokenId ? canvas.tokens?.get(tokenId)?.actor : null)
		?? (actorId ? game.actors?.get(actorId) : null);
	if (!actor || actor.type !== "character") return;
	const playbookName = actor.system?.playbook?.name ?? "";
	if (!playbookName) return;
	message.updateSource({ "speaker.alias": `${actor.name} ${playbookName}` });
});

// -- DEBILITY DISADVANTAGE ANNOTATION -------------------------
// When a roll was penalised by a debility, annotate the
// "Disadvantage" condition in the chat card with the debility name.
Hooks.on("renderChatMessageHTML", (message, html) => {
	const opts = message.rolls?.[0]?.options ?? {};
	const { stonetopDebility: debility, stonetopDebilityTooltip: tooltip } = opts;
	if (!debility) return;
	const pill = html.querySelector(".stonetop-roll-card .stonetop-condition-disadvantage");
	if (pill) {
		const hint = tooltip
			? `<span class="stonetop-debility-hint" data-tooltip="${tooltip}" data-tooltip-direction="UP">${debility}</span>`
			: debility;
		pill.innerHTML = `Disadvantage (${hint})`;
	}
});

// -- ROLL RESULT SHIFTING --------------------------------------
Hooks.on("renderChatMessageHTML", (message, html) => {
	const cardButtons = html.querySelector(".stonetop-roll-card .stonetop-card-buttons");
	if (!cardButtons) return;

	if (!cardButtons.querySelector("[data-action='shiftUp']")) {
		cardButtons.insertAdjacentHTML("afterbegin", `
			<button data-action="shiftUp">Shift Up</button>
			<button data-action="shiftDown">Shift Down</button>
		`);
	}

	for (const button of cardButtons.querySelectorAll("[data-action='shiftUp'], [data-action='shiftDown']")) {
		button.style.display = game.user.isGM ? "" : "none";
		button.addEventListener("click", ev => _onRollShift(ev, message));
	}
	cardButtons.style.display = game.user.isGM ? "flex" : "none";
});

// -- BURN BRIGHTLY ---------------------------------------------
const BURN_BRIGHTLY_TOOLTIP =
	"When you have enough XP to Level Up (6 + twice your current level), " +
	"you may spend 2 XP after any roll you make to add +1 to that roll (max +1 per roll).";

Hooks.on("renderChatMessageHTML", (message, html) => {
	const cardButtons = html.querySelector(".stonetop-roll-card .stonetop-card-buttons");
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

	cardButtons.appendChild(btn);
	cardButtons.style.display = "flex";

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

			const speakerUpdate = playbookName ? { alias: `${actor.name} ${playbookName}` } : {};
			await message.update({ rolls, speaker: { ...message.speaker, ...speakerUpdate }, flags: { stonetop: { burnBrightly: true } } });
		} catch (err) {
			console.error("Stonetop | Error burning brightly:", err);
			btn.disabled = false;
		}
	});
});

async function _onRollShift(event, message) {
	event.preventDefault();
	const button = event.currentTarget;
	button.disabled = true;

	try {
		const roll = message.rolls?.at(0);
		if (!roll) return;

		const shift = button.dataset.action === "shiftUp" ? 1 : -1;
		await _shiftRoll(roll, shift);

		await message.update({
			rolls:  message.rolls,
			flavor: _shiftRollCardFlavor(message.flavor, roll.total),
		});
	} catch (err) {
		console.error("Stonetop | Error shifting roll result:", err);
	} finally {
		button.disabled = false;
	}
}

async function _shiftRoll(roll, shift) {
	const shiftMap = { 1: "+", "-1": "-" };
	let opTerm = roll.terms.find(term => term instanceof foundry.dice.terms.OperatorTerm && term.options.rollShifting);
	let numTerm = roll.terms.find(term => term instanceof foundry.dice.terms.NumericTerm && term.options.rollShifting);
	let originalValue = `${opTerm?.operator ?? ""}${numTerm?.number ?? ""}`;
	if (originalValue !== "" && !Number.isNaN(Number(originalValue))) originalValue = Number(originalValue);

	if (!numTerm) {
		roll.terms.push(
			opTerm = new foundry.dice.terms.OperatorTerm({ operator: shiftMap[shift], options: { rollShifting: true } }),
			numTerm = new foundry.dice.terms.NumericTerm({ number: 1, options: { rollShifting: true } })
		);
	} else {
		numTerm.number = Math.abs(Roll.safeEval(`${opTerm.operator}${numTerm.number} + ${shift}`));
	}

	if (numTerm.number === 1 && originalValue === 0 && opTerm.operator !== shiftMap[shift]) {
		opTerm.operator = shiftMap[shift];
	} else if (numTerm.number === 0) {
		opTerm.operator = "+";
	}

	roll.resetFormula();
	await roll._evaluate();
}

function _shiftRollCardFlavor(flavor, total) {
	if (!flavor) return flavor;

	const wrapper = document.createElement("div");
	wrapper.innerHTML = flavor;

	const resultRow = wrapper.querySelector(".stonetop-roll-card .row.result");
	const resultLabel = resultRow?.querySelector(".result-label");
	if (!resultRow || !resultLabel) return flavor;

	const result = _classifyShiftedTotal(total);
	resultRow.classList.remove("success", "partial", "failure", "critical");
	resultRow.classList.add(result.key);
	resultLabel.textContent = result.label;

	return wrapper.innerHTML;
}

function _classifyShiftedTotal(total) {
	if (total >= 12) return { key: "critical", label: "12+ Strong Hit" };
	if (total >= 10) return { key: "success", label: "Strong Hit" };
	if (total >= 7) return { key: "partial", label: "Weak Hit" };
	return { key: "failure", label: "Miss" };
}
