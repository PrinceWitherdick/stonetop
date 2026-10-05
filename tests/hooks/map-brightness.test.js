import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	mapBrightnessFactor, dimmedTint, applyMapBrightnessToCanvas, applyMapBrightnessToPage,
	registerMapBrightness,
} from "../../module/hooks/map-brightness.js";

const VILLAGE = { name: "Stonetop — The Village", flags: { "stonetop-pwd": { posterMap: "stonetop-village" } } };
const OTHER   = { name: "Goblin Cave", flags: {} };

function board(scene, meshes) {
	return { ready: true, scene, primary: { levelTextures: meshes } };
}

describe("mapBrightnessFactor", () => {
	it("reads the percent as a multiplier", () => {
		expect(mapBrightnessFactor(100)).toBe(1);
		expect(mapBrightnessFactor(75)).toBe(0.75);
	});

	it("clamps to the slider's range and treats nonsense as full brightness", () => {
		expect(mapBrightnessFactor(5)).toBe(0.3);
		expect(mapBrightnessFactor(250)).toBe(1);
		expect(mapBrightnessFactor("x")).toBe(1);
		expect(mapBrightnessFactor(undefined)).toBe(1);
	});
});

describe("dimmedTint", () => {
	it("scales every channel", () => {
		expect(dimmedTint(0xFFFFFF, 0.5)).toBe(0x808080);
		expect(dimmedTint(0xFF8000, 0.5)).toBe(0x804000);
	});

	it("treats a missing tint as white", () => {
		expect(dimmedTint(undefined, 0.5)).toBe(0x808080);
		expect(dimmedTint(null, 0.5)).toBe(0x808080);
	});

	// Core's Color is a Number subclass, which is what a Level's tint reads back as off the mesh.
	it("keeps a tint that is a Number object, as core's Color is", () => {
		class Color extends Number {}
		expect(dimmedTint(new Color(0xFF8000), 0.5)).toBe(0x804000);
	});
});

describe("applyMapBrightnessToCanvas", () => {
	it("tints a poster map's background meshes and leaves its foreground alone", () => {
		const bg = { name: "Level.0.background", tint: 0xFFFFFF };
		const fg = { name: "Level.0.foreground", tint: 0xFFFFFF };
		applyMapBrightnessToCanvas(board(VILLAGE, [bg, fg]), 0.5);
		expect(bg.tint).toBe(0x808080);
		expect(fg.tint).toBe(0xFFFFFF);
	});

	it("multiplies the level's own tint, and a second pass starts from it rather than compounding", () => {
		const bg = { name: "Level.0.background", tint: 0xFF8000 };
		const b = board(VILLAGE, [bg]);
		applyMapBrightnessToCanvas(b, 0.5);
		applyMapBrightnessToCanvas(b, 0.5);
		expect(bg.tint).toBe(0x804000);
		applyMapBrightnessToCanvas(b, 1);
		expect(bg.tint).toBe(0xFF8000);
	});

	it("leaves any other scene as core drew it", () => {
		const bg = { name: "Level.0.background", tint: 0xFFFFFF };
		applyMapBrightnessToCanvas(board(OTHER, [bg]), 0.5);
		expect(bg.tint).toBe(0xFFFFFF);
	});

	it("reaches v13's single background mesh", () => {
		const background = { tint: 0xFFFFFF };
		applyMapBrightnessToCanvas({ ready: true, scene: VILLAGE, primary: { background } }, 0.5);
		expect(background.tint).toBe(0x808080);
	});

	it("does nothing before the canvas is ready", () => {
		const bg = { name: "Level.0.background", tint: 0xFFFFFF };
		applyMapBrightnessToCanvas({ ...board(VILLAGE, [bg]), ready: false }, 0.5);
		expect(bg.tint).toBe(0xFFFFFF);
	});
});

describe("applyMapBrightnessToPage", () => {
	it("writes the factor the journal figures read", () => {
		const setProperty = vi.fn();
		applyMapBrightnessToPage(0.6, { style: { setProperty } });
		expect(setProperty).toHaveBeenCalledWith("--stonetop-map-brightness", "0.6");
	});
});

describe("registerMapBrightness", () => {
	let stored;
	beforeEach(() => {
		stored = 50;
		globalThis.game = { settings: { get: () => stored }, system: { id: "stonetop-pwd" } };
	});
	afterEach(() => {
		delete globalThis.game;
		delete globalThis.canvas;
	});

	it("dims on canvasReady and follows the slider by key", () => {
		const handlers = {};
		const hooks = { on: (name, fn) => { handlers[name] = fn; }, once: (name, fn) => { handlers[name] = fn; } };
		registerMapBrightness(hooks);

		const bg = { name: "Level.0.background", tint: 0xFFFFFF };
		globalThis.canvas = board(VILLAGE, [bg]);
		handlers.canvasReady(globalThis.canvas);
		expect(bg.tint).toBe(0x808080);

		stored = 100;
		handlers.clientSettingChanged("stonetop-pwd.somethingElse");
		expect(bg.tint).toBe(0x808080);
		handlers.clientSettingChanged("stonetop-pwd.mapBrightness");
		expect(bg.tint).toBe(0xFFFFFF);
	});
});
