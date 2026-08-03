import {StonetopCharacter} from "./character/StonetopCharacter.js";
import {StonetopSteading} from "./steading/StonetopSteading.js";
import {CharacterLedger} from "./character/CharacterLedger.js";
import {SteadingLedger} from "./steading/SteadingLedger.js";
import {NpcLedger} from "./npc/NpcLedger.js";
import {STAT_CHAT_LABELS, STEADING_STAT_CHAT_LABELS, postStatChangesToChat} from "../utils/chat.js";
import {isDefaultImg} from "../utils/strings.js";
import {PERSON_DEFAULT_IMG, isPersonPlaceholderImg} from "../utils/person-portrait.js";

export function createStonetopActorClass(BaseActor) {
	return class StonetopActor extends BaseActor {
		_typedActor;

		/**
		 * Sidebar "Create Actor". Every kind of actor in Stonetop has a guided flow behind
		 * it — a player character walks its owner through the playbook picker and
		 * onboarding, a person is built from the steading's worksheet, a monster from the
		 * Book I "Dangers" worksheet — so instead of Foundry's name-and-type form (which
		 * only ever lands you on a blank sheet) we open our own chooser and hand off. See
		 * dialogs/create-actor-dialog.js.
		 *
		 * Two callers keep the stock dialog, reskinned:
		 * - an explicit `types` restriction (internal tooling), which is asking for a
		 *   specific sub-type rather than a flow; and
		 * - a create into a compendium (`pack`), since every flow above builds a WORLD
		 *   actor and would silently ignore the pack it was asked for.
		 *
		 * The reskin: core titles both window and button "Create Actor"; we reword them to
		 * "Create an Actor", tag the window with `.stonetop-themed` so the scoped core-window
		 * CSS (see window-theme.js / stonetop.css) applies (`classes` is concatenated with
		 * DialogV2's defaults, so this adds the class without dropping "dialog"), and drop
		 * the steading type — it's a world singleton, auto-created on ready and blocked from
		 * a second instance in preCreateActor (StonetopSingleton.js), so offering it in the
		 * dropdown is a dead end that only ever warns.
		 * @override
		 */
		static async createDialog(data = {}, createOptions = {}, options = {}, renderOptions = {}) {
			if (!options.types && !createOptions.pack) {
				const { openCreateActor } = await import("../dialogs/create-actor-dialog.js");
				return openCreateActor({ folder: data.folder ?? null, name: data.name ?? "" });
			}

			const title = game.i18n.localize("stonetop.actorCreate.title");
			options = {
				...options,
				classes: [...(options.classes ?? []), "stonetop-themed"],
				window: { ...(options.window ?? {}), title },
				ok: { ...(options.ok ?? {}), label: title },
			};
			if (!options.types) {
				// Monsters and NPCs are GM content: players (who get Create-Actor on fresh
				// worlds) only ever make their own character, so keep both out of a non-GM's picker.
				options.types = this.TYPES.filter(t =>
					t !== "stonetop"
					&& t !== CONST.BASE_DOCUMENT_TYPE
					&& (game.user?.isGM || (t !== "monster" && t !== "npc")));
			}
			return super.createDialog(data, createOptions, options, renderOptions);
		}

		/**
		 * Two defaults for a new NPC.
		 *
		 * The token reveals its name on hover to anyone. NPCs are the townsfolk and neighbors
		 * the PCs talk to (not hidden threats), so their name should be legible to every
		 * player on hover — matching how the Residents/Neighbors rows already name them
		 * openly. Only applied when the creation data didn't specify a display mode, so a
		 * deliberate choice, a duplicate, or a compendium import that carries its own
		 * `prototypeToken.displayName` is preserved.
		 *
		 * An NPC with no portrait wears the system's people silhouette instead of Foundry's
		 * mystery-man. The steading roster already drew that placeholder for un-portraited
		 * members, but only there: everywhere else the same person showed up — the sidebar
		 * directory, a drag preview, a chat portrait — Foundry's default leaked through.
		 * Storing it on the actor makes every surface agree without each having to know the
		 * rule. It stays a placeholder, not art: isDefaultImg reports it as "no art" (see
		 * utils/person-portrait.js), so nothing starts treating this person as portraited.
		 * Only ever applied over a stock default, so chosen art is never touched.
		 * @override
		 */
		async _preCreate(data, options, user) {
			const allowed = await super._preCreate(data, options, user);
			if (allowed === false) return false;
			if (this.type !== "npc") return;
			if (foundry.utils.getProperty(data, "prototypeToken.displayName") === undefined) {
				this.updateSource({ "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.HOVER });
			}
			if (isDefaultImg(this.img) && !isPersonPlaceholderImg(this.img)) {
				this.updateSource({ img: PERSON_DEFAULT_IMG });
			}
		}

		get typedActor() {
			if (this._typedActor) return this._typedActor;

			const customType = this.system?.customType;
			switch (customType || this.type) {
				case "character":
					this._typedActor = StonetopCharacter.create(this);
					break;
				case "stonetop":
					this._typedActor = new StonetopSteading(this);
					break;
			}

			return this._typedActor;
		}

		// Backward-compat: world actors created with the PBTA module used
		// type="other" with system.customType="stonetop" for the steading.
		// The sheet registry looks up by type, so intercept _getSheetClass
		// to return the steading sheet for these legacy actors.
		_getSheetClass() {
			if (this.system?.customType === "stonetop") {
				const cls = CONFIG.Actor.sheetClasses?.stonetop?.["stonetop.StonetopSteadingSheet"]?.cls;
				if (cls) return cls;
			}
			return super._getSheetClass();
		}

		async _preUpdate(changed, options, user) {
			const result = await super._preUpdate(changed, options, user);
			if (!options?.stonetopLedger) {
				if (this.type === "character") {
					options.stonetopLedgerEntries = this._tagLedgerMove(await CharacterLedger.entriesForActorUpdate(this, changed), options);
					options.stonetopStatChanges = this._collectStatChanges(changed, STAT_CHAT_LABELS);
				} else if (this.type === "stonetop" || this.system?.customType === "stonetop") {
					options.stonetopLedgerEntries = this._tagLedgerMove(SteadingLedger.entriesForActorUpdate(this, changed), options);
					options.stonetopStatChanges = this._collectStatChanges(changed, STEADING_STAT_CHAT_LABELS);
				} else if (this.type === "npc") {
					options.stonetopLedgerEntries = this._tagLedgerMove(NpcLedger.entriesForActorUpdate(this, changed), options);
				}
			}
			return result;
		}

		/**
		 * Attribute ledger entries to the move that caused them. When an update is the
		 * automated effect of a move (the caller passes `options.stonetopMove`), stamp
		 * each generated entry with that move's name so the ledger can show "via <move>".
		 */
		_tagLedgerMove(entries, options) {
			const moveName = options?.stonetopMove;
			if (moveName) for (const entry of entries) entry.move = moveName;
			return entries;
		}

		/**
		 * Diff the incoming update against current values for the watched stats.
		 * @param {object} changed  The incoming update (nested or dot-path shape).
		 * @param {Record<string,string>} labels  Stat path → chat label map for this actor type.
		 */
		_collectStatChanges(changed, labels) {
			// Most updates (HP, XP, debilities, flags…) never touch the watched stats,
			// so skip the flatten unless this one could. Covers both update shapes:
			// nested ({system:{stats}}) and dot-path ({"system.stats.str.value"}).
			const groups = [...new Set(Object.keys(labels).map(p => p.split(".").slice(0, 2).join(".")))];
			const couldTouchStats = groups.some(group =>
				foundry.utils.getProperty(changed, group) !== undefined
				|| Object.keys(changed).some(k => k.startsWith(`${group}.`)));
			if (!couldTouchStats) return [];

			const flat = foundry.utils.flattenObject(changed);
			const changes = [];
			for (const [path, label] of Object.entries(labels)) {
				if (!(path in flat)) continue;
				const oldValue = foundry.utils.getProperty(this, path);
				const newValue = flat[path];
				if (oldValue !== newValue) changes.push({ label, oldValue, newValue });
			}
			return changes;
		}

		async _onUpdate(changed, options, userId) {
			await super._onUpdate(changed, options, userId);
			if (options?.stonetopLedger) return;
			// _onUpdate fires on EVERY connected client. The follow-up writes below
			// (ledger append) and the chat posts must run exactly once, on the client
			// of the user who made the change — that user holds the permission to write
			// back. Running on other clients duplicates the ledger entry and throws a
			// "lacks permission to update Actor" error for anyone who doesn't own it.
			if (userId !== globalThis.game?.user?.id) return;
			if (this.type === "character") {
				await CharacterLedger.append(this, options.stonetopLedgerEntries ?? [], { userId });
			} else if (this.type === "stonetop" || this.system?.customType === "stonetop") {
				await SteadingLedger.append(this, options.stonetopLedgerEntries ?? [], { userId });
			} else if (this.type === "npc") {
				// NPCs have no watched stats to echo to chat, so append and stop here.
				await NpcLedger.append(this, options.stonetopLedgerEntries ?? [], { userId });
				return;
			} else {
				return;
			}
			postStatChangesToChat(this, options.stonetopStatChanges ?? []);
		}

		async _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
			await super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
			// Runs on every client; only the author writes back (ledger append + the
			// playbook HP/damage/starting-moves init in the typed actor). Other clients
			// would duplicate the ledger and hit a permission error on a foreign actor.
			if (userId !== globalThis.game?.user?.id) return;
			if (this.typedActor?.type === "character" && collection === "items") {
				await Promise.all([
					CharacterLedger.append(this, CharacterLedger.entriesForCreatedItems(documents), { userId }),
					this.typedActor._onCreateDescendantDocuments(documents),
				]);
			} else if (this.type === "npc" && collection === "items") {
				await NpcLedger.append(this, NpcLedger.entriesForCreatedItems(documents), { userId });
			}
		}

		async _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
			await super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
			// Only the author appends to the ledger; other clients lack permission on a
			// foreign actor and would duplicate the entry.
			if (userId !== globalThis.game?.user?.id) return;
			if (this.type === "character" && collection === "items") {
				await CharacterLedger.append(this, CharacterLedger.entriesForDeletedItems(documents), { userId });
			} else if (this.type === "npc" && collection === "items") {
				await NpcLedger.append(this, NpcLedger.entriesForDeletedItems(documents), { userId });
			}
		}
	};
}
