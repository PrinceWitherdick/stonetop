// The sidebar "Create Item" entry point for Stonetop's hand-authored, drag-and-drop
// content. Improvements and threats aren't Item sub-types, so rather than Foundry's
// Item type picker we show our own three-way chooser and hand off to each authoring
// flow: a reusable world Move, a draggable steading-improvement card, or a draggable
// threat card. Opened from StonetopItem.createDialog.

const CONTENT_OPTIONS = [
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
		hint: "A homebrew improvement card you drag onto any steading's Improvements tab.",
	},
	{
		id: "threat",
		label: "Threat",
		icon: "fa-skull",
		hint: "A homebrew threat card you drag onto any steading's Threats tab.",
	},
	{
		id: "inventory",
		label: "Inventory Item",
		icon: "fa-box-open",
		hint: "A custom gear item, saved as a reusable world item you drag onto any character's Inventory tab.",
	},
];

/** Show the chooser; resolves to an option id ("move" | "improvement" | "threat") or null. */
function pickContentType() {
	const rows = CONTENT_OPTIONS.map((opt, i) => `
		<label class="stonetop-content-picker-option">
			<input type="radio" name="contentType" value="${opt.id}"${i === 0 ? " checked" : ""}>
			<i class="fas ${opt.icon}" aria-hidden="true"></i>
			<span class="stonetop-content-picker-text">
				<span class="stonetop-content-picker-label">${opt.label}</span>
				<span class="stonetop-content-picker-hint">${opt.hint}</span>
			</span>
		</label>`).join("");

	// DialogV2 requires the content element itself to carry no attributes, so the
	// styled/classed container lives one level in.
	const content = document.createElement("div");
	content.innerHTML = `<div class="stonetop stonetop-content-picker">${rows}</div>`;

	return foundry.applications.api.DialogV2.prompt({
		classes: ["stonetop", "stonetop-content-picker-dialog"],
		window: { title: "Create Stonetop Content" },
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
	}
}
