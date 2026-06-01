const _STAT_LABELS = {
	str: "STR", dex: "DEX", int: "INT",
	wis: "WIS", con: "CON", cha: "CHA",
};

function _rollFormula(rollMode, modifier = 0) {
	const dice = rollMode === "adv" ? "3d6kh2" : rollMode === "dis" ? "3d6kl2" : "2d6";
	return modifier !== 0 ? `${dice}+@stat+@mod` : `${dice}+@stat`;
}

function _classifyResult(total) {
	if (total >= 10) return { key: "success", label: "Strong Hit" };
	if (total >= 7)  return { key: "partial", label: "Weak Hit"   };
	return                   { key: "failure", label: "Miss"       };
}

export function sign(n) { return n >= 0 ? `+${n}` : `${n}`; }

function _rollCard({ header, result = "", resultClass = "", conditionsHtml = "", buttons = false, formula = "" }) {
	const resultHtml = result
		? `<div class="row result ${resultClass}">
			<div class="result-label">${result}</div>
			<div class="result-details"></div>
			<div class="result-choices"></div>
		</div>`
		: "";
	const formulaHtml = formula
		? `<div class="card-content"><div class="row"><em>${formula}</em></div></div>`
		: "";
	const buttonsHtml = buttons
		? `<div class="card-buttons stonetop-card-buttons">
			<button data-action="shiftUp">Shift Up</button>
			<button data-action="shiftDown">Shift Down</button>
		</div>`
		: "";

	return `<section class="pbta-chat-card stonetop-roll-card">
		<div class="cell cell--chat">
			<div class="chat-title row flexrow">
				<h2 class="cell__title">${header}</h2>
			</div>
			${formulaHtml}
			${resultHtml}
			${buttonsHtml}
			${conditionsHtml}
		</div>
	</section>`;
}

function _conditionsHtml(conditions) {
	if (!conditions.length) return "";
	const label = game.i18n?.localize("PBTA.ConditionsApplied") ?? "Conditions Applied:";
	return `<div class="row row--border conditions stonetop-roll-conditions">
		<h3 class="cell__subtitle">${label}</h3>
		<ul>${conditions.join("")}</ul>
	</div>`;
}

/**
 * Roll 2d6+stat for a character move or direct stat roll.
 *
 * @param {string} statKey   - One of str/dex/int/wis/con/cha
 * @param {Actor}  actor
 * @param {object} options
 * @param {string} [options.rollMode]                  - "adv" | "dis" | "def" | "normal"
 * @param {number} [options.modifier]                  - Total numeric modifier (forward + ongoing + situational)
 * @param {number} [options.forward]                   - Forward portion (shown separately in card)
 * @param {number} [options.ongoing]                   - Ongoing portion (shown separately in card)
 * @param {string} [options.moveName]                  - Display name for the roll header
 * @param {string} [options.stonetopDebility]          - Debility name for annotation
 * @param {string} [options.stonetopDebilityTooltip]
 * @returns {Promise<Roll>}
 */
export async function rollStat(statKey, actor, options = {}) {
	const statValue  = actor.system?.stats?.[statKey]?.value ?? 0;
	const statLabel  = _STAT_LABELS[statKey] ?? statKey.toUpperCase();
	const rollMode   = options.rollMode ?? "normal";
	const moveName   = options.moveName ?? null;
	const modifier   = options.modifier ?? 0;
	const forward    = options.forward  ?? 0;
	const ongoing    = options.ongoing  ?? 0;

	const rollData    = modifier !== 0 ? { stat: statValue, mod: modifier } : { stat: statValue };
	const rollOptions = {
		stonetopDebility:        options.stonetopDebility        ?? null,
		stonetopDebilityTooltip: options.stonetopDebilityTooltip ?? null,
	};

	const roll   = await new Roll(_rollFormula(rollMode, modifier), rollData, rollOptions).evaluate();
	const total  = roll.total;
	const result = _classifyResult(total);

	const sign   = statValue >= 0 ? "+" : "";
	const header = moveName ?? `+${statLabel} (${sign}${statValue})`;

	// Build condition pills
	const conditions = [];
	if (rollMode === "adv") {
		conditions.push(`<li class="stonetop-condition-advantage">Advantage</li>`);
	} else if (rollMode === "dis") {
		conditions.push(`<li class="stonetop-condition-disadvantage">Disadvantage</li>`);
	}
	if (forward !== 0) {
		conditions.push(`<li class="stonetop-condition-forward">Forward ${sign(forward)}</li>`);
	}
	if (ongoing !== 0) {
		conditions.push(`<li class="stonetop-condition-ongoing">Ongoing ${sign(ongoing)}</li>`);
	}
	const situational = modifier - forward - ongoing;
	if (situational !== 0) {
		conditions.push(`<li class="stonetop-condition-situational">Situational ${sign(situational)}</li>`);
	}

	const conditionsHtml = _conditionsHtml(conditions);

	const flavor = _rollCard({
		header,
		result: result.label,
		resultClass: result.key,
		conditionsHtml,
		buttons: true,
	});

	await roll.toMessage({
		speaker:  ChatMessage.getSpeaker({ actor }),
		flavor,
		rollMode: game.settings.get("core", "rollMode"),
	});

	return roll;
}

/**
 * Roll a character damage formula using the same Stonetop chat card shell as stat rolls.
 *
 * @param {string} formula
 * @param {Actor} actor
 * @param {object} options
 * @param {string} [options.label]
 * @returns {Promise<Roll>}
 */
export async function rollDamage(formula, actor, options = {}) {
	const roll = await new Roll(formula).evaluate();
	const label = options.label ?? "Damage";

	await roll.toMessage({
		speaker:  ChatMessage.getSpeaker({ actor }),
		flavor:   _rollCard({ header: label, formula, buttons: true }),
		rollMode: game.settings.get("core", "rollMode"),
	});

	return roll;
}

/**
 * Roll a generic formula using the Stonetop chat card shell.
 *
 * @param {string} formula
 * @param {Actor} actor
 * @param {object} options
 * @param {string} [options.label]
 * @returns {Promise<Roll>}
 */
export async function rollFormula(formula, actor, options = {}) {
	const roll = await new Roll(formula).evaluate();
	const label = options.label ?? formula;

	await roll.toMessage({
		speaker:  ChatMessage.getSpeaker({ actor }),
		flavor:   _rollCard({ header: label, formula, buttons: true }),
		rollMode: game.settings.get("core", "rollMode"),
	});

	return roll;
}
