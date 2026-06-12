export function registerSettings() {
	// -- WORLD SETTINGS ------------------------------------------

	// Tracks the last loaded module version.
	// Used to detect when migrations need to run.
	game.settings.register("stonetop_pwd", "moduleVersion", {
		name: "Module Version",
		scope: "world",
		config: false,
		type: String,
		default: ""
	});

	// Whether the compendium seeding prompt has been dismissed.
	// Prevents nagging the GM every session if they've already seeded.
	game.settings.register("stonetop_pwd", "seedingComplete", {
		name: "Compendium Seeding Complete",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	game.settings.register("stonetop_pwd", "startupWelcomeShown", {
		name: "Startup Welcome Shown",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// -- CLIENT SPECIFIC SETTINGS --------------------------------

	game.settings.register("stonetop_pwd", "sheetFont", {
		name: "stonetop.settings.sheetFont.name",
		hint: "stonetop.settings.sheetFont.hint",
		scope: "client",
		config: true,
		type: String,
		choices: {
			"libre-caslon":   "stonetop.settings.sheetFont.libreCaslon",
			"im-fell-english": "stonetop.settings.sheetFont.imFellEnglish",
			"signika":         "stonetop.settings.sheetFont.signika",
		},
		default: "signika",
		onChange: value => applySheetFont(value),
	});

	game.settings.register("stonetop_pwd", "sheetFontScale", {
		name: "stonetop.settings.sheetFontScale.name",
		hint: "stonetop.settings.sheetFontScale.hint",
		scope: "client",
		config: true,
		type: String,
		choices: {
			"1":    "stonetop.settings.sheetFontScale.normal",
			"1.1":  "stonetop.settings.sheetFontScale.large",
			"1.25": "stonetop.settings.sheetFontScale.larger",
			"1.4":  "stonetop.settings.sheetFontScale.largest",
		},
		default: "1",
		onChange: value => applySheetFontScale(value),
	});

	// Remembers each character (playbook) sheet's width so it reopens at the size
	// the user last left it. Per-user (client) and per-actor: a map of actor id
	// -> width. Internal (not shown in the settings menu).
	game.settings.register("stonetop_pwd", "characterSheetWidths", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	game.settings.register("stonetop_pwd", "showRollStatChips", {
		name: "stonetop.settings.showRollStatChips.name",
		hint: "stonetop.settings.showRollStatChips.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => _rerenderActorSheets(),
	});

	game.settings.register("stonetop_pwd", "showMoveDescriptionsInChat", {
		name: "stonetop.settings.showMoveDescriptionsInChat.name",
		hint: "stonetop.settings.showMoveDescriptionsInChat.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: value => applyMoveDescriptionBodyClass(value),
	});

	game.settings.register("stonetop_pwd", "hoverDescriptionsEnabled", {
		name: "stonetop.settings.hoverDescriptionsEnabled.name",
		hint: "stonetop.settings.hoverDescriptionsEnabled.hint",
		scope: "client",
		config: false,
		type: Boolean,
		default: true,
	});

	for (const key of HOVER_DESCRIPTION_SETTING_KEYS) {
		game.settings.register("stonetop_pwd", key, {
			name: `stonetop.settings.${key}.name`,
			hint: `stonetop.settings.${key}.hint`,
			scope: "client",
			config: false,
			type: Boolean,
			default: true,
		});
	}

	game.settings.registerMenu("stonetop_pwd", "hoverDescriptionSettings", {
		name: "stonetop.settings.hoverDescriptionSettings.name",
		label: "stonetop.settings.hoverDescriptionSettings.label",
		hint: "stonetop.settings.hoverDescriptionSettings.hint",
		icon: "fas fa-info-circle",
		type: _createHoverDescriptionSettingsApp(),
		restricted: false,
	});
}

export const HOVER_DESCRIPTION_SETTING_KEYS = [
	"hoverDescriptionsStats",
	"hoverDescriptionsBasicMoves",
	"hoverDescriptionsPlaybookMoves",
	"hoverDescriptionsTraits",
	"hoverDescriptionsGearTags",
	"hoverDescriptionsMonsterRefs",
];

function _createHoverDescriptionSettingsApp() {
	return class HoverDescriptionSettingsApp extends FormApplication {
		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				id: "stonetop-hover-description-settings",
				title: game.i18n.localize("stonetop.settings.hoverDescriptionSettings.title"),
				template: "systems/stonetop_pwd/templates/settings/hover-descriptions.hbs",
				width: 520,
				height: "auto",
				closeOnSubmit: true,
			});
		}

		async getData() {
			const settings = HOVER_DESCRIPTION_SETTING_KEYS.map(key => ({
				key,
				name: game.i18n.localize(`stonetop.settings.${key}.name`),
				hint: game.i18n.localize(`stonetop.settings.${key}.hint`),
				enabled: getHoverDescriptionSetting(key, { ignoreMaster: true }),
			}));
			return {
				enabled: getSetting("hoverDescriptionsEnabled"),
				settings,
			};
		}

		async _updateObject(_event, formData) {
			await setSetting("hoverDescriptionsEnabled", !!formData.hoverDescriptionsEnabled);
			for (const key of HOVER_DESCRIPTION_SETTING_KEYS) {
				await setSetting(key, !!formData[key]);
			}
			_rerenderActorSheets();
		}
	};
}

const _FONT_MAP = {
	"libre-caslon":    '"Libre Caslon Text", serif',
	"im-fell-english": '"IM Fell English", serif',
	"signika":         "Signika, sans-serif",
};

export function applySheetFont(value) {
	const font = _FONT_MAP[value] ?? _FONT_MAP["libre-caslon"];
	document.documentElement.style.setProperty("--font-stonetop", font);
}

export function applySheetFontScale(value) {
	const scale = Number(value);
	const safe  = Number.isFinite(scale) && scale > 0 ? scale : 1;
	document.documentElement.style.setProperty("--stonetop-font-scale", String(safe));
}

export function getSetting(key) {
	return game.settings.get("stonetop_pwd", key);
}

// Last-used width for a given character sheet, or null if none stored yet.
export function getCharacterSheetWidth(actorId) {
	if (!actorId) return null;
	const map = globalThis.game?.settings?.get?.("stonetop_pwd", "characterSheetWidths");
	const w = map?.[actorId];
	return Number.isFinite(w) && w > 0 ? w : null;
}

export function setCharacterSheetWidth(actorId, width) {
	if (!actorId) return;
	const w = Math.round(Number(width));
	if (!Number.isFinite(w) || w <= 0) return;
	if (w === getCharacterSheetWidth(actorId)) return; // avoid redundant writes
	const map = globalThis.game?.settings?.get?.("stonetop_pwd", "characterSheetWidths") ?? {};
	return game.settings.set("stonetop_pwd", "characterSheetWidths", { ...map, [actorId]: w });
}

export function getHoverDescriptionSetting(key, { ignoreMaster = false } = {}) {
	const settings = globalThis.game?.settings;
	const masterEnabled = ignoreMaster ? true : settings?.get?.("stonetop_pwd", "hoverDescriptionsEnabled") ?? true;
	const settingEnabled = settings?.get?.("stonetop_pwd", key) ?? true;
	return masterEnabled && settingEnabled;
}

export function getRollStatChipsSetting() {
	return globalThis.game?.settings?.get?.("stonetop_pwd", "showRollStatChips") ?? true;
}

export function applyMoveDescriptionBodyClass(show) {
	document.body.classList.toggle("stonetop-hide-roll-descriptions", !show);
}

export function setSetting(key, value) {
	return game.settings.set("stonetop_pwd", key, value);
}

function _rerenderActorSheets() {
	for (const app of Object.values(globalThis.ui?.windows ?? {})) {
		if (app?.actor) app.render(false);
	}
}
