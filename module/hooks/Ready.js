import { runStartupMigrations } from "./PbtaSheetConfig.js";
import { ensureStonetopSingleton, _isPrimaryGM } from "./StonetopSingleton.js";
import { getSetting, setSetting } from "../settings.js";

const DEFAULT_SCENE_TONE = "sepia";
const SCENE_TONE_VARIANTS = {
	stonetop: {
		white: {
			image: "systems/stonetop/assets/maps/map-stonetop-village.png",
			background: "#FFFFFF",
		},
		sepia: {
			image: "systems/stonetop/assets/maps/map-stonetop-village-sepia.png",
			background: "#F2E6C8",
		},
	},
	vicinity: {
		white: {
			image: "systems/stonetop/assets/maps/map-vicinity.png",
			background: "#FFFFFF",
		},
		sepia: {
			image: "systems/stonetop/assets/maps/map-vicinity-sepia.png",
			background: "#F2E6C8",
		},
	},
	worldsEnd: {
		white: {
			image: "systems/stonetop/assets/maps/map-worlds-end.png",
			background: "#FFFFFF",
		},
		sepia: {
			image: "systems/stonetop/assets/maps/map-worlds-end-sepia.png",
			background: "#F2E6C8",
		},
	},
};
const DEFAULT_SCENES = {
	stonetop: {
		name: "Stonetop",
		active: true,
		setting: "stonetopSceneTone",
		width: 2432,
		height: 1394,
		initial: { x: 1352, y: 726, scale: 0.8588456 },
	},
	vicinity: {
		name: "The Vicinity",
		setting: "vicinitySceneTone",
		width: 2408,
		height: 1718,
		initial: { x: 1423, y: 910, scale: 0.713764 },
	},
	worldsEnd: {
		name: "The World's End",
		setting: "worldsEndSceneTone",
		width: 2408,
		height: 1982,
		initial: { x: 1490, y: 1027, scale: 0.6274060 },
	},
};
const STONETOP_LANDMARKS = [
	{ key: "the-stone", letter: "A", name: "The Stone", x: 1005, y: 387 },
	{ key: "the-granary", letter: "B", name: "The Granary", x: 928, y: 252 },
	{ key: "public-house-stables", letter: "C", name: "Public House & Stables", x: 1247, y: 312 },
	{ key: "cistern", letter: "D", name: "Cistern", x: 914, y: 489 },
	{ key: "pavilion-of-the-gods", letter: "E", name: "Pavilion of the Gods", x: 1242, y: 471 },
	{ key: "watchtower-southeast", letter: "F", name: "Watchtowers", x: 1524, y: 603 },
	{ key: "watchtower-north", letter: "F", name: "Watchtowers", x: 1079, y: 150 },
	{ key: "watchtower-west", letter: "F", name: "Watchtowers", x: 510, y: 573 },
];

export async function onReady() {
	await _migrateArmourToArmor();
	await runStartupMigrations();
	await ensureStonetopSingleton();
	await ensureDefaultScene();
}

export async function ensureDefaultScene() {
	if (!game.user?.isGM || !_isPrimaryGM()) return;

	const scenes = _toArray(game.scenes);
	await _updateManagedDefaultSceneCanvasDefaults();
	await _updateManagedDefaultSceneLandmarks();
	const missingSceneKeys = Object.keys(DEFAULT_SCENES).filter(sceneKey => !_findDefaultScene(sceneKey));
	if (!missingSceneKeys.length) {
		await setSetting("defaultSceneCreated", true);
		return;
	}
	if (scenes.length && scenes.some(scene => !_isManagedDefaultScene(scene))) {
		await setSetting("defaultSceneCreated", true);
		return;
	}

	let activeScene = null;
	for (const sceneKey of missingSceneKeys) {
		const definition = DEFAULT_SCENES[sceneKey];
		const scene = await Scene.create(buildDefaultSceneData(sceneKey, getSetting(definition.setting)));
		if (definition.active) activeScene = scene;
	}
	if (activeScene && !activeScene.active) await activeScene.activate();
	await setSetting("defaultSceneCreated", true);
}

export async function updateDefaultSceneTone(tone, sceneKey = "stonetop") {
	if (!game.user?.isGM || !_isPrimaryGM()) return;
	const scene = _findDefaultScene(sceneKey);
	if (!scene) return;
	await scene.update(buildDefaultSceneVisualData(sceneKey, tone));
}

export function buildDefaultSceneData(sceneKey = "stonetop", tone = DEFAULT_SCENE_TONE) {
	const definition = DEFAULT_SCENES[sceneKey] ?? DEFAULT_SCENES.stonetop;
	const visualData = buildDefaultSceneVisualData(sceneKey, tone);
	return {
		name: definition.name,
		active: definition.active ?? false,
		navigation: true,
		...visualData,
		tokenVision: false,
		width: definition.width,
		height: definition.height,
		initial: definition.initial,
		notes: buildDefaultSceneNotes(sceneKey),
		padding: 0,
		flags: {
			stonetop: { defaultScene: true, defaultSceneKey: sceneKey },
		},
	};
}

export function buildDefaultSceneNotes(sceneKey = "stonetop") {
	if (sceneKey !== "stonetop") return [];
	return STONETOP_LANDMARKS.map(buildStonetopLandmarkNote);
}

export function buildStonetopLandmarkNote(landmark) {
	const icon = `systems/stonetop/assets/maps/landmarks/landmark-${landmark.letter.toLowerCase()}.svg`;
	return {
		x: landmark.x,
		y: landmark.y,
		text: landmark.name,
		icon,
		texture: { src: icon },
		iconSize: 30,
		fontSize: 24,
		textAnchor: 1,
		flags: {
			stonetop: {
				landmark: true,
				landmarkKey: landmark.key,
				landmarkLetter: landmark.letter,
			},
		},
	};
}

export function buildDefaultSceneVisualData(sceneKey = "stonetop", tone = DEFAULT_SCENE_TONE) {
	const variants = SCENE_TONE_VARIANTS[sceneKey] ?? SCENE_TONE_VARIANTS.stonetop;
	const variant = variants[tone] ?? variants[DEFAULT_SCENE_TONE];
	const gridless = globalThis.CONST?.GRID_TYPES?.GRIDLESS ?? 0;
	return {
		background: {
			src: variant.image,
		},
		backgroundColor: variant.background,
		grid: {
			type: gridless,
			size: 100,
			color: variant.background,
			alpha: 0,
		},
		flags: {
			stonetop: { defaultScene: true, defaultSceneKey: sceneKey },
		},
	};
}

export function buildDefaultSceneCanvasData(sceneKey = "stonetop", tone = DEFAULT_SCENE_TONE) {
	const { grid } = buildDefaultSceneVisualData(sceneKey, tone);
	return {
		tokenVision: false,
		grid,
	};
}

function _findDefaultScene(sceneKey = "stonetop") {
	const definition = DEFAULT_SCENES[sceneKey] ?? DEFAULT_SCENES.stonetop;
	const variants = Object.values(SCENE_TONE_VARIANTS[sceneKey] ?? SCENE_TONE_VARIANTS.stonetop);
	return _toArray(game.scenes).find(scene =>
		scene.getFlag?.("stonetop", "defaultSceneKey") === sceneKey ||
		(sceneKey === "stonetop" && scene.getFlag?.("stonetop", "defaultScene") && !scene.getFlag?.("stonetop", "defaultSceneKey")) ||
		(scene.name === definition.name && variants.some(v => scene.background?.src === v.image))
	) ?? null;
}

async function _updateManagedDefaultSceneCanvasDefaults() {
	await Promise.all(Object.entries(DEFAULT_SCENES).map(([sceneKey, definition]) => {
		const scene = _findDefaultScene(sceneKey);
		if (!scene?.update) return null;
		return scene.update(buildDefaultSceneCanvasData(sceneKey, getSetting(definition.setting)));
	}).filter(Boolean));
}

async function _updateManagedDefaultSceneLandmarks() {
	const scene = _findDefaultScene("stonetop");
	if (!scene?.createEmbeddedDocuments) return;

	const existingNotesByKey = new Map(_toArray(scene.notes)
		.map(note => [note.getFlag?.("stonetop", "landmarkKey") ?? note.flags?.stonetop?.landmarkKey, note])
		.filter(([key]) => Boolean(key)));
	await _updateExistingLandmarkNotes(scene, existingNotesByKey);
	const existingKeys = new Set(existingNotesByKey.keys());
	const missingNotes = STONETOP_LANDMARKS
		.filter(landmark => !existingKeys.has(landmark.key))
		.map(buildStonetopLandmarkNote);
	if (!missingNotes.length) return;
	await scene.createEmbeddedDocuments("Note", missingNotes);
}

async function _updateExistingLandmarkNotes(scene, notesByKey) {
	const updates = [];
	for (const landmark of STONETOP_LANDMARKS) {
		const note = notesByKey.get(landmark.key);
		if (!note?.id) continue;
		const { x, y, ...desired } = buildStonetopLandmarkNote(landmark);
		updates.push({ _id: note.id, ...desired });
	}
	if (updates.length) await scene.updateEmbeddedDocuments("Note", updates);
}

function _toArray(collection) {
	if (!collection) return [];
	if (Array.isArray(collection)) return collection;
	if (Array.isArray(collection.contents)) return collection.contents;
	return Array.from(collection);
}

function _isManagedDefaultScene(scene) {
	if (scene.getFlag?.("stonetop", "defaultScene")) return true;
	return Object.entries(DEFAULT_SCENES).some(([sceneKey, definition]) => {
		const variants = Object.values(SCENE_TONE_VARIANTS[sceneKey] ?? {});
		return scene.name === definition.name && variants.some(v => scene.background?.src === v.image);
	});
}

async function _migrateArmourToArmor() {
	const staleActors = game.actors.filter(
		a => a.type === "character" && a.system?.attributes?.armour !== undefined
	);
	if (!staleActors.length) return;
	for (const actor of staleActors) {
		await actor.update({ "system.attributes.-=armour": null });
	}
}
