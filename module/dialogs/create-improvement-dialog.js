// Author a reusable, draggable steading-improvement card (name + flavor + optional
// requirement checklist + effect). On create it lands as a card in the "Homebrew
// Steading Improvements" journal, which the GM drags onto any steading's Improvements
// tab. The steading-bound quick-add (StonetopSteadingSheet._onCreateImprovementOpen)
// stays for adding straight to the open steading; this one is the reusable path.
import { createImprovementCard } from "../journal/steading-improvement-cards.js";

/** Open the create-improvement dialog. Resolves after the card is authored (or cancel). */
export function openCreateImprovementDialog() {
	const dialog = new Dialog({
		title: "Create Steading Improvement",
		content: `<form class="stonetop-homestead-dialog">
			<p class="stonetop-homestead-trigger"><em>Author a reusable improvement card, then drag it onto any steading's Improvements tab.</em></p>
			<div class="stonetop-homestead-fields">
				<label class="stonetop-homestead-field">
					<span>Name</span>
					<input type="text" name="name" placeholder="e.g. Roadbuilding" autofocus>
				</label>
				<label class="stonetop-homestead-field">
					<span>Flavor</span>
					<textarea name="flavor" rows="2" placeholder="A short description shown under the title (optional)."></textarea>
				</label>
				<label class="stonetop-homestead-field">
					<span>Requirements</span>
					<textarea name="requirements" rows="4" placeholder="One requirement per line — each becomes a check-off step (optional)."></textarea>
				</label>
				<label class="stonetop-homestead-field">
					<span>Effect</span>
					<textarea name="effect" rows="2" placeholder="What completing it does — new resources, defenses, etc. (optional)."></textarea>
				</label>
			</div>
		</form>`,
		buttons: {
			cancel: { label: "Cancel" },
			create: {
				label: "Create",
				callback: async (html) => {
					const form = html[0].querySelector("form");
					const val = n => form.querySelector(`[name="${n}"]`)?.value?.trim() ?? "";
					const name = val("name");
					if (!name) {
						globalThis.ui?.notifications?.warn?.("Enter a name for the improvement.");
						return;
					}
					const items = val("requirements").split("\n").map(s => s.trim()).filter(Boolean);
					const def = {
						name,
						flavor: val("flavor"),
						effect: val("effect"),
						sections: items.length ? [{ heading: "Requires all of the following:", items }] : [],
					};
					await createImprovementCard(def);
				},
			},
		},
		default: "create",
	}, { classes: ["dialog", "stonetop", "stonetop-create-improvement-dialog"], resizable: true });
	dialog.render(true);
}
