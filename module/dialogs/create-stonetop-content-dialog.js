// The sidebar "Create Item" entry point for Stonetop's hand-authored, drag-and-drop
// content. Improvements and threats aren't Item sub-types, so rather than Foundry's
// Item type picker we show our own chooser and hand off to each authoring flow: a
// reusable world Move, a draggable steading-improvement card, a draggable threat card,
// a reusable world inventory item, or a homebrew arcanum. Opened from StonetopItem.createDialog.

import { canCreateArcana } from "../utils/authoring-gates.js";
import { pickContentOption } from "./content-picker.js";

const CONTENT_OPTIONS = [
	{
		id: "arcanum",
		label: "Arcanum",
		icon: "fa-wand-sparkles",
		hint: "A homebrew major or minor arcanum card, opened in the card editor as a reusable world item.",
	},
	{
		id: "inventory",
		label: "Inventory Item",
		icon: "fa-box-open",
		hint: "A custom gear item, saved as a reusable world item you drag onto any character's Inventory tab.",
	},
	{
		id: "move",
		label: "Move",
		icon: "fa-scroll",
		hint: "A custom move players can roll, saved as a reusable world move you drag onto character sheets.",
	},
	{
		id: "improvement",
		label: "Steading Improvement",
		icon: "fa-screwdriver-wrench",
		hint: "A homebrew improvement card you drag onto Stonetop's Improvements tab.",
	},
	{
		id: "threat",
		label: "Threat",
		icon: "fa-skull",
		hint: "A homebrew threat card you drag onto Stonetop's Threats tab.",
	},
	{
		id: "thingBelow",
		label: "Thing Below",
		icon: "fa-eye",
		hint: "Create a Thing Below, a corrupted site, a corrupted being, or an emanation (Book II).",
	},
	{
		id: "site",
		label: "Site",
		icon: "fa-mountain-sun",
		hint: "Walk through Book I's Creating Sites process. The write-up lands on Stonetop's Sites tab, ready to pin to a scene.",
	},
];

// The Thing Below sub-chooser (shown after picking "Thing Below"): the four Book II
// creation flows. Thing + Corrupted Site become draggable threat cards; Corrupted Being +
// Emanation create monster stat-block actors directly.
const THING_BELOW_KIND_OPTIONS = [
	{
		id: "thing",
		label: "A Thing Below",
		icon: "fa-eye",
		hint: "A primordial entity of darkness and corruption. Combine themes + aspects + an instinct; written up as a magical-entity threat.",
	},
	{
		id: "site",
		label: "A corrupted site",
		icon: "fa-mountain-sun",
		hint: "A place the Things Below have tainted. Feature + cause + severity; written up as a MacGuffin threat with an impending doom.",
	},
	{
		id: "being",
		label: "A corrupted being",
		icon: "fa-skull",
		hint: "Twist an existing monster: add gifts, marks, and the corrupted tag. Creates a monster stat block.",
	},
	{
		id: "emanation",
		label: "An emanation",
		icon: "fa-hurricane",
		hint: "A Thing's discharge, given form. Creates a monster stat block from a source or a blank emanation template.",
	},
];

// The Arcanum sub-chooser (shown after picking "Arcanum"): a blank card of either tier,
// or the Artifact Creation wizard that seeds a card from rolled inspiration.
const ARCANUM_KIND_OPTIONS = [
	{
		id: "minor",
		label: "Minor arcanum",
		icon: "fa-scroll",
		hint: "A blank minor arcanum (a curio with a hidden power), opened in the card editor.",
	},
	{
		id: "major",
		label: "Major arcanum",
		icon: "fa-wand-sparkles",
		hint: "A blank major arcanum (its own card art and major semantics), opened in the card editor.",
	},
	{
		id: "inspire",
		label: "Inspire me…",
		icon: "fa-dice-d20",
		hint: "Roll the Book II Artifact Creation tables (origin, nature, form) for a themed starting point, then build the card from the results.",
	},
];

/** Top-level chooser. Resolves to a CONTENT_OPTIONS id or null. */
function pickContentType() {
	// Homebrew arcana obey arcanaCreationGmOnly (default GM-only); drop the Arcanum option
	// for a player who isn't allowed to author it, so the sidebar can't bypass the same gate
	// the arcana-tab "Create arcanum" buttons enforce.
	let options = canCreateArcana() ? CONTENT_OPTIONS : CONTENT_OPTIONS.filter(o => o.id !== "arcanum");
	// Things Below and sites are GM prep (they end in world threats/monsters, or a page of the
	// steading's GM-only Sites journal, and those stores are GM-only).
	if (!game.user?.isGM) options = options.filter(o => o.id !== "thingBelow" && o.id !== "site");
	return pickContentOption({ title: "Create Stonetop Content", options });
}

/** Thing Below kind chooser. Resolves to "thing" | "site" | "being" | "emanation" or null. */
function pickThingBelowKind() {
	return pickContentOption({ title: "Create a Thing Below", options: THING_BELOW_KIND_OPTIONS });
}

/** Arcanum tier chooser. Resolves to "minor" | "major" | "inspire" or null. */
function pickArcanumKind() {
	return pickContentOption({ title: "Create Arcanum", options: ARCANUM_KIND_OPTIONS });
}

/**
 * Open the chooser and hand off to the selected authoring flow. Each flow creates a
 * reusable, draggable artifact rather than a bare document.
 */
export async function openCreateStonetopContent() {
	const choice = await pickContentType();
	if (!choice) return;

	if (choice === "move") {
		const { CustomMoveDialog, worldMoveSaver } =
			await import("../actors/character/dialogs/CustomMoveDialog.js");
		new CustomMoveDialog(worldMoveSaver(), {}).render(true);
	} else if (choice === "improvement") {
		const { openCreateImprovementDialog } = await import("./create-improvement-dialog.js");
		openCreateImprovementDialog();
	} else if (choice === "threat") {
		const { CreateThreatDialog } = await import("../threats/create-threat-dialog.js");
		const { createThreatSeedCard } = await import("../threats/threat-seed-cards.js");
		const seed = await new CreateThreatDialog(null, {}).promise();
		if (seed) await createThreatSeedCard(seed);
	} else if (choice === "inventory") {
		const { AddInventoryItemDialog, worldInventoryItemSaver } =
			await import("../actors/character/dialogs/AddInventoryItemDialog.js");
		new AddInventoryItemDialog(worldInventoryItemSaver(), {
			allowColumnChoice: true,
			titleKey: "stonetop.inventory.createWorldItem",
		}).render(true);
	} else if (choice === "arcanum") {
		await openCreateArcanum();
	} else if (choice === "thingBelow") {
		await openCreateThingBelow();
	} else if (choice === "site") {
		await openCreateSite();
	}
}

/**
 * Site flow (Book I, "Sites"): run the walkthrough and store the result on the steading,
 * the way the Sites tab's own button does. Sites aren't a draggable seed card like threats:
 * a site IS its write-up, and there is one place it belongs.
 */
async function openCreateSite() {
	const { getStonetopSteadingActorOrWarn } = await import("../utils/world.js");
	const steading = getStonetopSteadingActorOrWarn();
	if (!steading) return;
	const { CreateSiteDialog } = await import("../sites/create-site-dialog.js");
	const { createSite } = await import("../sites/site-store.js");
	const seed = await new CreateSiteDialog().promise();
	if (!seed) return;
	const page = await createSite(steading, seed);
	if (!page) return;
	ui.notifications?.info?.(`Added site: ${page.name}. It's on ${steading.name}'s Sites tab.`);
	// The steading sheet doesn't observe journal-page creation, so nudge an open one.
	steading.sheet?.rendered && steading.sheet.render(false);
}

/**
 * Second-step Thing Below flow (Book II, The Things Below): pick which of the four creation
 * wizards to run. Thing + Corrupted Site resolve a threat SEED that becomes a draggable card
 * (dropped onto a steading's Threats tab, like the plain Threat flow); Corrupted Being +
 * Emanation open the lighter corruption dialog, which creates a `monster` stat-block actor.
 */
async function openCreateThingBelow() {
	if (!game.user?.isGM) {
		ui.notifications?.warn("Only the GM can create Things Below.");
		return;
	}
	const kind = await pickThingBelowKind();
	if (!kind) return;

	if (kind === "thing" || kind === "site") {
		const { createThreatSeedCard } = await import("../threats/threat-seed-cards.js");
		let seed;
		if (kind === "thing") {
			const { CreateThingDialog } = await import("../things-below/create-thing-dialog.js");
			seed = await new CreateThingDialog().promise();
		} else {
			const { CreateCorruptedSiteDialog } = await import("../things-below/create-corrupted-site-dialog.js");
			seed = await new CreateCorruptedSiteDialog().promise();
		}
		if (seed) await createThreatSeedCard(seed);
		return;
	}

	// being / emanation → a monster stat block, created directly by the dialog.
	const { CorruptBeingDialog } = await import("../things-below/corrupt-being-dialog.js");
	await new CorruptBeingDialog({ mode: kind === "emanation" ? "emanation" : "being" }).promise();
}

/**
 * Second-step Arcanum flow: pick a tier (or the inspiration wizard), then create a
 * standalone homebrew arcanum world Item and open its editor. Mirrors the
 * `game.stonetop.createArcanum` / `inspireArcanum` console helpers (see Ready.js): a
 * blank card for major/minor, or the Artifact Creation wizard whose rolled results
 * pre-fill the card before the editor opens.
 */
async function openCreateArcanum() {
	// Defensive gate (the chooser already hides the Arcanum option for non-authors): never
	// author arcana for a player when arcanaCreationGmOnly is on, even if this is reached directly.
	if (!canCreateArcana()) {
		ui.notifications?.warn(game.i18n.localize("stonetop.arcana.createGmOnly"));
		return;
	}
	const kind = await pickArcanumKind();
	if (!kind) return;

	const { createArcanumItem } = await import("../item/createArcanum.js");
	if (kind === "inspire") {
		const { StonetopArcanaInspireDialog } = await import("../item/StonetopArcanaInspireDialog.js");
		new StonetopArcanaInspireDialog({
			onCreate: ({ name, major, front }) => createArcanumItem({ name, major, front }),
		}).render(true);
		return;
	}

	const major = kind === "major";
	await createArcanumItem({ name: major ? "New Major Arcanum" : "New Minor Arcanum", major });
}
