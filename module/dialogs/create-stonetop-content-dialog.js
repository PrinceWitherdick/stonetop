// The sidebar "Create Item" entry point for Stonetop's hand-authored, drag-and-drop
// content. Improvements and threats aren't Item sub-types, so rather than Foundry's
// Item type picker we show our own chooser and hand off to each authoring flow: a
// reusable world Move, a draggable steading-improvement card, a draggable threat card,
// a reusable world inventory item, or a homebrew arcanum. Opened from StonetopItem.createDialog.

import { canCreateArcana } from "../utils/authoring-gates.js";

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

/**
 * Shared radio-list chooser. Resolves to the picked option id, or null if dismissed.
 * DialogV2 requires the content element itself to carry no attributes, so the
 * styled/classed container lives one level in.
 */
function pickContentOption({ title, options }) {
	const rows = options.map((opt, i) => `
		<label class="stonetop-content-picker-option">
			<input type="radio" name="contentType" value="${opt.id}"${i === 0 ? " checked" : ""}>
			<i class="fas ${opt.icon}" aria-hidden="true"></i>
			<span class="stonetop-content-picker-text">
				<span class="stonetop-content-picker-label">${opt.label}</span>
				<span class="stonetop-content-picker-hint">${opt.hint}</span>
			</span>
		</label>`).join("");

	const content = document.createElement("div");
	content.innerHTML = `<div class="stonetop stonetop-content-picker">${rows}</div>`;

	return foundry.applications.api.DialogV2.prompt({
		// This is an ApplicationV2 dialog (`.application` root), which the `.stonetop`
		// parchment/slate skin excludes by design (stonetop.css `:not(.application,…)`).
		// Our sibling authoring flows are AppV1 and pick the skin up for free; a V2
		// window needs `stonetop-themed` to get the same modal look.
		classes: ["stonetop", "stonetop-themed", "stonetop-content-picker-dialog"],
		window: { title },
		position: { width: 440 },
		content,
		ok: {
			label: "Continue",
			callback: (event, button) =>
				new foundry.applications.ux.FormDataExtended(button.form).object.contentType,
		},
		rejectClose: false,
	});
}

/** Top-level chooser. Resolves to a CONTENT_OPTIONS id or null. */
function pickContentType() {
	// Homebrew arcana obey arcanaCreationGmOnly (default GM-only); drop the Arcanum option
	// for a player who isn't allowed to author it, so the sidebar can't bypass the same gate
	// the arcana-tab "Create arcanum" buttons enforce.
	const options = canCreateArcana() ? CONTENT_OPTIONS : CONTENT_OPTIONS.filter(o => o.id !== "arcanum");
	return pickContentOption({ title: "Create Stonetop Content", options });
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
	}
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
