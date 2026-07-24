import { FrontOnOpen } from "../../../utils/front-on-open.js";
import {
	FOLLOWER_COST_EXAMPLES,
	normalizeTags, parseFollowerArmor, followerFromNpc,
} from "../../../data/follower-build.js";

// ── NpcToFollowerDialog ──────────────────────────────────────────────────────
// Dropping an "npc" Actor onto a character sheet offers to make that NPC a
// follower (Book I, NPCs & Followers, p.475: a follower "is first an NPC"). The
// NPC's identity carries over (name, pronouns, instinct, tags, GM moves) and it
// gains the follower-only stats: HP / armor / damage (seeded from the NPC's game
// stats if it has any, else the able-bodied baseline — editable here), a Loyalty
// track, and a chosen cost. On finish the built follower's sourceUuid points back
// at the NPC actor, so the two stay linked (see followerFromNpc).
//
// Mirrors MonsterToFollowerDialog's compact-modal shape and reuses its
// .stonetop-cf-* / .stonetop-mf-* styling; the difference is that stats are
// editable (an NPC may have no combat stats to keep as-is).

export class NpcToFollowerDialog extends Application {
	constructor(actor, npc, onApply, options = {}) {
		super(options);
		this._actor     = actor;
		this._npc       = npc;
		this._onApply   = onApply;
		const sys       = npc?.system ?? {};
		const attrs     = sys.attributes ?? {};
		const hasStats  = !!sys.hasStats;
		this._addedTags = [];
		this._cost      = "";
		this._pronoun   = String(sys.pronouns ?? "").trim();
		// Seed the follower's stats from the NPC's own when it has them, else the
		// book's able-bodied follower defaults (6 HP, 0 armor; blank damage). Editable.
		this._hp     = hasStats ? (Number(attrs.hp?.max ?? attrs.hp?.value) || 6) : 6;
		this._armor  = hasStats ? parseFollowerArmor(attrs.armor?.value) : 0;
		this._damage = hasStats ? String(attrs.damage?.value ?? attrs.damage?.rollFormula ?? "").trim() : "";
		this._isGroup   = false;
		this._groupSize = 2;
		this._frontOnOpen = new FrontOnOpen(this);
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-npc-to-follower",
			title:     "Make a Follower",
			template:  "systems/stonetop_pwd/templates/dialogs/npc-to-follower.hbs",
			width:     520,
			height:    "auto",
			resizable: true,
			classes:   ["stonetop", "stonetop-spring-dialog", "stonetop-npc-follower-dialog"],
		});
	}

	async _render(force, options) {
		await super._render(force, options);
		this._frontOnOpen.apply();
		this.setPosition({ height: "auto" });
	}

	async close(options = {}) {
		this._frontOnOpen.stop();
		return super.close(options);
	}

	// The NPC's GM-move (npcMove) names, carried onto the follower.
	_npcMoves() {
		return (this._npc?.items ?? [])
			.filter(i => i.type === "npcMove")
			.map(i => i.name);
	}

	getData() {
		const sys      = this._npc?.system ?? {};
		const hasStats = !!sys.hasStats;
		return {
			npcName:     this._npc?.name ?? "NPC",
			actorName:   this._actor?.name ?? "this character",
			instinct:    String(sys.instinct ?? "").trim(),
			keptTags:    hasStats ? normalizeTags(sys.tags) : [],
			addedTags:   this._addedTags,
			moves:       this._npcMoves(),
			hp:          this._hp,
			armor:       this._armor,
			damage:      this._damage,
			pronoun:     this._pronoun,
			isGroup:     this._isGroup,
			groupSize:   this._groupSize,
			costOptions: FOLLOWER_COST_EXAMPLES.map(c => ({ value: c, selected: this._cost === c })),
			cost:        this._cost,
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._frontOnOpen.start();

		html.find(".stonetop-nf-cancel").on("click", () => this.close());
		html.find(".stonetop-nf-create").on("click", () => this._finish());

		// Stats persist to the instance on change (no re-render, so focus survives typing).
		html.find(".stonetop-nf-hp").on("change", ev => { this._hp = Math.max(0, Math.trunc(Number(ev.currentTarget.value) || 0)); });
		html.find(".stonetop-nf-armor").on("change", ev => { this._armor = Math.max(0, Math.trunc(Number(ev.currentTarget.value) || 0)); });
		html.find(".stonetop-nf-damage").on("change", ev => { this._damage = ev.currentTarget.value.trim(); });

		// Added tags: chips toggle off, free input adds.
		html.find(".stonetop-nf-added-tag").on("click", ev => this._removeTag(ev.currentTarget.dataset.tag));
		html.find(".stonetop-nf-tag-add").on("click", () => this._addTagFromInput(html));
		html.find(".stonetop-nf-tag-input").on("keydown", ev => {
			if (ev.key === "Enter") { ev.preventDefault(); this._addTagFromInput(html); }
		});

		// Cost: example chip sets it; free input overrides.
		html.find(".stonetop-nf-cost-ex").on("click", ev => { this._cost = ev.currentTarget.dataset.value; this.render(false); });
		html.find(".stonetop-nf-cost-input").on("change", ev => { this._cost = ev.currentTarget.value; });

		html.find(".stonetop-nf-pronoun").on("change", ev => { this._pronoun = ev.currentTarget.value; });

		// Group toggle + size (re-render so the size field shows/hides).
		html.find(".stonetop-nf-group-toggle").on("change", ev => { this._isGroup = ev.currentTarget.checked; this.render(false); });
		html.find(".stonetop-nf-group-size").on("change", ev => { this._groupSize = Math.max(2, parseInt(ev.currentTarget.value) || 2); });
	}

	_removeTag(tag) {
		const t = String(tag ?? "").toLowerCase();
		this._addedTags = this._addedTags.filter(x => x.toLowerCase() !== t);
		this.render(false);
	}

	_addTagFromInput(html) {
		const input = html.find(".stonetop-nf-tag-input")[0];
		if (!input) return;
		// De-dupe against the NPC's kept tags too, so an added tag can't double.
		const kept = normalizeTags(this._npc?.system?.hasStats ? this._npc?.system?.tags : "");
		const merged = normalizeTags([...this._addedTags, ...normalizeTags(input.value)])
			.filter(t => !kept.some(k => k.toLowerCase() === t.toLowerCase()));
		this._addedTags = merged;
		input.value = "";
		this.render(false);
	}

	async _finish() {
		// Capture any focused-but-unblurred fields before building.
		const root = this.element?.[0];
		if (root) {
			const hpEl = root.querySelector(".stonetop-nf-hp");
			if (hpEl) this._hp = Math.max(0, Math.trunc(Number(hpEl.value) || 0));
			const arEl = root.querySelector(".stonetop-nf-armor");
			if (arEl) this._armor = Math.max(0, Math.trunc(Number(arEl.value) || 0));
			const dmEl = root.querySelector(".stonetop-nf-damage");
			if (dmEl) this._damage = dmEl.value.trim();
			const costEl = root.querySelector(".stonetop-nf-cost-input");
			if (costEl && costEl.value.trim()) this._cost = costEl.value.trim();
			const pronEl = root.querySelector(".stonetop-nf-pronoun");
			if (pronEl) this._pronoun = pronEl.value;
			const sizeEl = root.querySelector(".stonetop-nf-group-size");
			if (sizeEl) this._groupSize = Math.max(2, parseInt(sizeEl.value) || 2);
		}
		const data = followerFromNpc(
			{ name: this._npc?.name, system: this._npc?.system, uuid: this._npc?.uuid },
			{
				tags: this._addedTags, cost: this._cost, pronoun: this._pronoun,
				moves: this._npcMoves(),
				hp: this._hp, armor: this._armor, damage: this._damage,
				isGroup: this._isGroup, size: this._isGroup ? this._groupSize : 0,
			},
		);
		await this._onApply?.(data);
		ui.notifications?.info?.(`${data.name || "NPC"} is now ${this._actor?.name ?? "the character"}'s follower.`);
		this.close();
	}
}
