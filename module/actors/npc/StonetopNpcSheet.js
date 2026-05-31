export function createStonetopNpcSheetClass(Base) {
	return class StonetopNpcSheet extends Base {

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["stonetop", "sheet", "actor", "npc"],
				width:   600,
				height:  500,
				tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "moves" }],
			});
		}

		get template() {
			return "systems/stonetop/templates/actor/npc.hbs";
		}

		async getData() {
			const context = await super.getData();
			context.system ??= this.actor.system;
			context.npcMoves = this.actor.items
				.filter(i => i.type === "npcMove")
				.map(i => ({ id: i.id, name: i.name, system: i.system }));
			return context;
		}

		activateListeners(html) {
			super.activateListeners(html);
			if (!this.isEditable) return;

			html[0].addEventListener("click", async ev => {
				if (ev.target.closest(".stonetop-npc-move-roll")) {
					const li   = ev.target.closest("[data-item-id]");
					const item = this.actor.items.get(li?.dataset?.itemId);
					await item?.roll();

				} else if (ev.target.closest(".stonetop-npc-add-move")) {
					await this.actor.createEmbeddedDocuments("Item", [{
						name: "New Move",
						type: "npcMove",
					}]);

				} else if (ev.target.closest(".stonetop-npc-delete-move")) {
					const li   = ev.target.closest("[data-item-id]");
					const item = this.actor.items.get(li?.dataset?.itemId);
					if (!item) return;
					const confirmed = await Dialog.confirm({
						title:   "Delete Move",
						content: `<p>Delete <strong>${item.name}</strong>?</p>`,
					});
					if (confirmed) await item.delete();

				} else if (ev.target.closest(".stonetop-npc-move-name")) {
					const li   = ev.target.closest("[data-item-id]");
					const item = this.actor.items.get(li?.dataset?.itemId);
					item?.sheet?.render(true);
				}
			});
		}
	};
}
