import { describe, it, expect } from "vitest";
import { readRepo } from "../fakes/css.js";

// Foundry does not await a `ready` callback, so a bare `await` that rejects silently ends onReady
// there for whoever hit it: no game.stonetop, no macros, no Welcome guide. The steps the rest of
// the load does not depend on go through bestEffort (utils/best-effort.js). Pinned against the
// source, since onReady itself needs a whole world to run.
const READY = readRepo("module/hooks/Ready.js");
const body = READY.slice(READY.indexOf("export async function onReady() {"), READY.indexOf("async function _applyCoreSettingDefaultsForNewWorld"));

describe("onReady's step isolation", () => {
	it("catches the steps the rest of the load does not need", () => {
		for (const step of [
			`bestEffort("Setting Overview gate migration", migrateFlatSettingOverviewShown)`,
			`bestEffort("steading singleton", ensureStonetopSingleton)`,
			`bestEffort("player actor-creation grant", _ensurePlayerActorCreationGrant)`,
			`bestEffort("GM Toolkit", _ensureGmToolkit)`,
			`bestEffort("GM Toolkit assignment", _assignGmToolkitToGm)`,
			`bestEffort("world setup", () => seeding)`,
			`bestEffort("Setting Overview", _openSettingOverview)`,
			`bestEffort("system macro pass", ensureSystemMacros)`,
			`bestEffort("player hotbar macro placement", ensurePlayerHotbarMacros)`,
			`bestEffort("Introductions rejoin", () => IntroductionsDialog.openForActiveSession())`,
		]) expect(body, step).toContain(step);
		for (const bare of [
			"await ensureStonetopSingleton();", "await _openSettingOverview();",
			"await _ensureGmToolkit();", "await _assignGmToolkitToGm();",
			"await stampWorldLayoutBaseline();", "await _applyCoreSettingDefaultsForNewWorld();",
		]) expect(body, bare).not.toContain(bare);
	});

	// Both already isolate their own failures (each sweep through bestEffort, each character
	// migration caught on its own), so they stay bare.
	it("leaves the self-isolating sweeps and migrations bare", () => {
		expect(body).toContain("await runPrimaryGmSweeps();");
		expect(body).toContain("await runStartupMigrations();");
		expect(readRepo("module/hooks/PbtaSheetConfig.js")).toContain("await _ensureAllCharacters(method).catch(error);");
	});

	// The two steps that read `seedingComplete` to tell a fresh world from an established one must
	// finish before the world setup sets it. Caught, the setup is held back when either fails, or
	// the retry would read a fresh world as an established one.
	it("holds the world setup back when the world-age steps fail", () => {
		expect(body).toMatch(/worldAgeSettled = await bestEffort\("world layout baseline", stampWorldLayoutBaseline\)\s*&& await bestEffort\("new-world core defaults", _applyCoreSettingDefaultsForNewWorld\);/);
		expect(body).toContain("if (worldAgeSettled) seeding = runWorldSetup();");
		expect(body).toContain("const wasFreshWorld = isGM && worldAgeSettled && pendingSetupWork().journals;");
		expect(body.indexOf("worldAgeSettled = await")).toBeLessThan(body.indexOf("seeding = runWorldSetup()"));
	});

	it("catches the un-awaited resumes rather than leaving their rejections unhandled", () => {
		expect(body).toContain(`reopenOpenWalkthroughs().catch(`);
		expect(body).toContain(`reopenOpenBookReaders().catch(`);
	});
});
