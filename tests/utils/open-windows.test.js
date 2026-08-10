import { afterEach, describe, expect, it } from "vitest";
import { openApplications, findOpenApp } from "../../module/utils/open-windows.js";

const savedUi = global.ui;

afterEach(() => {
	global.ui = savedUi;
	delete global.foundry.applications;
});

describe("openApplications", () => {
	it("returns nothing when neither registry exists", () => {
		global.ui = {};
		expect(openApplications()).toEqual([]);
	});

	it("finds V1 apps in ui.windows", () => {
		global.ui = { windows: { 3: { id: "stonetop-welcome" } } };
		expect(openApplications().map(a => a.id)).toEqual(["stonetop-welcome"]);
	});

	it("finds ApplicationV2 instances too — the registry a v1-only lookup misses", () => {
		// The whole point: a guard that scans only ui.windows silently starts answering
		// "nothing open" the day its dialog is migrated, and quietly stacks duplicates.
		global.ui = { windows: {} };
		global.foundry.applications = { instances: new Map([["stonetop-expedition", { id: "stonetop-expedition" }]]) };
		expect(openApplications().map(a => a.id)).toEqual(["stonetop-expedition"]);
	});

	it("returns both registries together", () => {
		global.ui = { windows: { 1: { id: "v1-app" } } };
		global.foundry.applications = { instances: new Map([["v2-app", { id: "v2-app" }]]) };
		expect(openApplications().map(a => a.id).sort()).toEqual(["v1-app", "v2-app"]);
	});
});

describe("findOpenApp", () => {
	it("returns null rather than undefined when nothing matches", () => {
		global.ui = { windows: {} };
		expect(findOpenApp(() => true)).toBe(null);
	});

	it("survives a predicate that throws on an unexpected window", () => {
		// Other modules' apps show up in these registries too, and a predicate reaching
		// into one of them must not take down the caller's "is mine open?" check.
		global.ui = { windows: { 1: {}, 2: { id: "mine" } } };
		expect(findOpenApp(w => w.id.startsWith("mine"))).toEqual({ id: "mine" });
	});
});
