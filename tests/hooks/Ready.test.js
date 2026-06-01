import { afterEach, describe, it, expect, vi } from "vitest";
import { buildDefaultSceneData, buildDefaultSceneNotes, ensureDefaultScene } from "../../module/hooks/Ready.js";

afterEach(() => {
	delete global.game;
	delete global.Scene;
	vi.restoreAllMocks();
});

describe("default scene setup", () => {
	it("builds a gridless village scene on a parchment background", () => {
		global.CONST = { GRID_TYPES: { GRIDLESS: 0 } };

		const data = buildDefaultSceneData("stonetop", "sepia");

		expect(data.name).toBe("Stonetop");
		expect(data.background.src).toBe("systems/stonetop/assets/maps/map-stonetop-village-sepia.png");
		expect(data.width).toBe(2432);
		expect(data.height).toBe(1394);
		expect(data.initial).toEqual({ x: 1352, y: 726, scale: 0.8588456 });
		expect(data.backgroundColor).toBe("#F2E6C8");
		expect(data.tokenVision).toBe(false);
		expect(data.grid.type).toBe(0);
		expect(data.grid.alpha).toBe(0);
		expect(data.active).toBe(true);
		expect(data.navigation).toBe(true);
		expect(data.flags.stonetop.defaultScene).toBe(true);
		expect(data.flags.stonetop.defaultSceneKey).toBe("stonetop");
		expect(data.notes).toHaveLength(8);
	});

	it("can build the white village scene variant", () => {
		global.CONST = { GRID_TYPES: { GRIDLESS: 0 } };

		const data = buildDefaultSceneData("stonetop", "white");

		expect(data.background.src).toBe("systems/stonetop/assets/maps/map-stonetop-village.png");
		expect(data.backgroundColor).toBe("#FFFFFF");
		expect(data.grid.color).toBe("#FFFFFF");
	});

	it("builds The Vicinity scene variants", () => {
		global.CONST = { GRID_TYPES: { GRIDLESS: 0 } };

		const sepia = buildDefaultSceneData("vicinity", "sepia");
		const white = buildDefaultSceneData("vicinity", "white");

		expect(sepia.name).toBe("The Vicinity");
		expect(sepia.background.src).toBe("systems/stonetop/assets/maps/map-vicinity-sepia.png");
		expect(sepia.width).toBe(2408);
		expect(sepia.height).toBe(1718);
		expect(sepia.initial).toEqual({ x: 1423, y: 910, scale: 0.713764 });
		expect(sepia.tokenVision).toBe(false);
		expect(sepia.grid.type).toBe(0);
		expect(sepia.active).toBe(false);
		expect(sepia.flags.stonetop.defaultSceneKey).toBe("vicinity");
		expect(white.background.src).toBe("systems/stonetop/assets/maps/map-vicinity.png");
		expect(white.backgroundColor).toBe("#FFFFFF");
	});

	it("builds The World's End scene variants", () => {
		global.CONST = { GRID_TYPES: { GRIDLESS: 0 } };

		const sepia = buildDefaultSceneData("worldsEnd", "sepia");
		const white = buildDefaultSceneData("worldsEnd", "white");

		expect(sepia.name).toBe("The World's End");
		expect(sepia.background.src).toBe("systems/stonetop/assets/maps/map-worlds-end-sepia.png");
		expect(sepia.width).toBe(2408);
		expect(sepia.height).toBe(1982);
		expect(sepia.initial).toEqual({ x: 1490, y: 1027, scale: 0.6274060 });
		expect(sepia.tokenVision).toBe(false);
		expect(sepia.grid.type).toBe(0);
		expect(sepia.active).toBe(false);
		expect(sepia.flags.stonetop.defaultSceneKey).toBe("worldsEnd");
		expect(white.background.src).toBe("systems/stonetop/assets/maps/map-worlds-end.png");
		expect(white.backgroundColor).toBe("#FFFFFF");
	});

	it("creates all managed default scenes for a fresh world", async () => {
		global.CONST = { GRID_TYPES: { GRIDLESS: 0 } };
		const created = [];
		global.game = {
			user: { isGM: true },
			scenes: [],
			settings: {
				get: vi.fn((namespace, key) => {
					if (key.endsWith("SceneTone")) return "sepia";
					return false;
				}),
				set: vi.fn(),
			},
		};
		global.Scene = {
			create: vi.fn(async data => {
				const scene = {
					...data,
					activate: vi.fn(async () => {}),
					getFlag: vi.fn((namespace, key) => data.flags?.[namespace]?.[key]),
				};
				created.push(scene);
				game.scenes.push(scene);
				return scene;
			}),
		};

		await ensureDefaultScene();

		expect(created.map(scene => scene.name)).toEqual(["Stonetop", "The Vicinity", "The World's End"]);
		expect(created.map(scene => scene.background.src)).toEqual([
			"systems/stonetop/assets/maps/map-stonetop-village-sepia.png",
			"systems/stonetop/assets/maps/map-vicinity-sepia.png",
			"systems/stonetop/assets/maps/map-worlds-end-sepia.png",
		]);
		expect(created[0].active).toBe(true);
		expect(game.settings.set).toHaveBeenCalledWith("stonetop", "defaultSceneCreated", true);
	});

	it("refreshes token vision and grid defaults on existing managed scenes", async () => {
		global.CONST = { GRID_TYPES: { GRIDLESS: 0 } };
		const buildManagedScene = (sceneKey, name, src) => ({
			name,
			background: { src },
			getFlag: vi.fn((namespace, key) => namespace === "stonetop" && key === "defaultSceneKey" ? sceneKey : undefined),
			update: vi.fn(async () => {}),
		});
		const stonetopScene = buildManagedScene("stonetop", "Stonetop", "systems/stonetop/assets/maps/map-stonetop-village.png");
		const vicinityScene = buildManagedScene("vicinity", "The Vicinity", "systems/stonetop/assets/maps/map-vicinity.png");
		const worldsEndScene = buildManagedScene("worldsEnd", "The World's End", "systems/stonetop/assets/maps/map-worlds-end.png");
		global.game = {
			user: { isGM: true },
			scenes: [stonetopScene, vicinityScene, worldsEndScene],
			settings: {
				get: vi.fn((namespace, key) => {
					if (key === "vicinitySceneTone") return "white";
					if (key.endsWith("SceneTone")) return "sepia";
					return false;
				}),
				set: vi.fn(),
			},
		};

		await ensureDefaultScene();

		expect(vicinityScene.update).toHaveBeenCalledWith({
			tokenVision: false,
			grid: {
				type: 0,
				size: 100,
				color: "#FFFFFF",
				alpha: 0,
			},
		});
	});

	it("builds Stonetop landmark notes with visible letter icons and hover labels", () => {
		const notes = buildDefaultSceneNotes("stonetop");
		const stone = notes.find(note => note.flags.stonetop.landmarkKey === "the-stone");
		const watchtowers = notes.filter(note => note.flags.stonetop.landmarkLetter === "F");

		expect(notes).toHaveLength(8);
		expect(stone).toMatchObject({
			x: 1005,
			y: 387,
			text: "The Stone",
			icon: "systems/stonetop/assets/maps/landmarks/landmark-a.svg",
			texture: { src: "systems/stonetop/assets/maps/landmarks/landmark-a.svg" },
			iconSize: 30,
		});
		expect(watchtowers).toHaveLength(3);
		expect(watchtowers.map(note => note.flags.stonetop.landmarkKey)).toEqual([
			"watchtower-southeast",
			"watchtower-north",
			"watchtower-west",
		]);
		expect(buildDefaultSceneNotes("vicinity")).toEqual([]);
	});

	it("adds missing landmark notes to an existing managed Stonetop scene", async () => {
		global.CONST = { GRID_TYPES: { GRIDLESS: 0 } };
		const stonetopScene = {
			name: "Stonetop",
			background: { src: "systems/stonetop/assets/maps/map-stonetop-village.png" },
			notes: [{
				id: "note-the-stone",
				getFlag: vi.fn((namespace, key) => namespace === "stonetop" && key === "landmarkKey" ? "the-stone" : undefined),
			}],
			getFlag: vi.fn((namespace, key) => namespace === "stonetop" && key === "defaultSceneKey" ? "stonetop" : undefined),
			update: vi.fn(async () => {}),
			createEmbeddedDocuments: vi.fn(async () => {}),
			updateEmbeddedDocuments: vi.fn(async () => {}),
		};
		const buildManagedScene = (sceneKey, name, src) => ({
			name,
			background: { src },
			getFlag: vi.fn((namespace, key) => namespace === "stonetop" && key === "defaultSceneKey" ? sceneKey : undefined),
			update: vi.fn(async () => {}),
		});
		global.game = {
			user: { isGM: true },
			scenes: [
				stonetopScene,
				buildManagedScene("vicinity", "The Vicinity", "systems/stonetop/assets/maps/map-vicinity.png"),
				buildManagedScene("worldsEnd", "The World's End", "systems/stonetop/assets/maps/map-worlds-end.png"),
			],
			settings: {
				get: vi.fn((namespace, key) => key.endsWith("SceneTone") ? "sepia" : false),
				set: vi.fn(),
			},
		};

		await ensureDefaultScene();

		expect(stonetopScene.createEmbeddedDocuments).toHaveBeenCalledWith(
			"Note",
			expect.arrayContaining([
				expect.objectContaining({
					text: "The Granary",
					icon: "systems/stonetop/assets/maps/landmarks/landmark-b.svg",
					texture: { src: "systems/stonetop/assets/maps/landmarks/landmark-b.svg" },
				}),
			])
		);
		const createdNotes = stonetopScene.createEmbeddedDocuments.mock.calls[0][1];
		expect(createdNotes).toHaveLength(7);
		expect(createdNotes.some(note => note.flags.stonetop.landmarkKey === "the-stone")).toBe(false);
		expect(stonetopScene.updateEmbeddedDocuments).toHaveBeenCalledWith("Note", [
			expect.objectContaining({
				_id: "note-the-stone",
				texture: { src: "systems/stonetop/assets/maps/landmarks/landmark-a.svg" },
				icon: "systems/stonetop/assets/maps/landmarks/landmark-a.svg",
				iconSize: 30,
			}),
		]);
	});
});
