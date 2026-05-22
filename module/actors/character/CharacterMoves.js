import {
	MoveCategorySnapshotBuilder,
	MoveGroupSnapshot,
	MoveSnapshotBuilder,
	MovelistBuilder,
	RequirementSnapshot,
	ResourceBuilder,
} from "../../model/CharacterSnapshot.js";
import { PlaybookMoveEntry } from "./PlaybookMoveEntry.js";

const OTHER_MOVE_TYPES = ["background", "special", "follower", "expedition", "homefront"];

export class CharacterMoves {
	constructor(moveRepo, moveResources, actor) {
		this._moveRepo      = moveRepo;
		this._moveResources = moveResources;
		this._actor         = actor;
	}

	buildOwnedMovesMap() {
		const map = new Map();
		for (const item of this._actor.items.filter(i => i.type === "move")) {
			if (!map.has(item.name)) map.set(item.name, []);
			map.get(item.name).push(item);
		}
		return map;
	}

	async buildSnapshot(playbookData, bgSelectedSlug, actorLevel) {
		const ownedAllByName = this.buildOwnedMovesMap();
		const actorItems = [...this._actor.items];
		const categories = [];

		if (playbookData) {
			const background = playbookData.backgrounds?.find(b => b.slug === bgSelectedSlug);
			const bgMoveNames = new Set(background?.moves ?? []);
			const bgSlugs = new Set([...bgMoveNames].map(_toSlug));
			const entries = await this._moveRepo.getPlaybookMoves(playbookData.name);
			if (entries.length > 0) {
				const sorted = this.sortPlaybookMoves(
					this.buildMovelistContext(entries, ownedAllByName, bgMoveNames, actorLevel, playbookData.name)
				);
				const moveResourcesMap = this._moveResources.getMoveResources();
				const source = { type: "playbook", slug: playbookData.slug };
				categories.push(new MoveCategorySnapshotBuilder()
					.withKey("playbook")
					.withTitle(`${playbookData.name} Moves`)
					.withNote(playbookData.startingMovesNote ?? null)
					.withMoves(sorted.map(m => _buildMoveEntry(m, source, moveResourcesMap, bgSlugs)))
					.build()
				);
			}
		}

		const basicEntries = await this._moveRepo.getBasicMoves();
		if (basicEntries.length > 0) {
			categories.push(new MoveCategorySnapshotBuilder()
				.withKey("basic")
				.withTitle("Basic Moves")
				.withNote(null)
				.withMoves(basicEntries.map(e => {
					const instances = ownedAllByName.get(e.name) ?? [];
					return new MoveSnapshotBuilder()
						.withId(e.id)
						.withCompendiumId(e.id)
						.withOwnedId(instances[0]?._id ?? null)
						.withName(e.name)
						.withDescription(e.description ?? "")
						.withRollType(e.rollType)
						.withIsStarting(false)
						.withSource({ type: "basic" })
						.withSourceLabel(null)
						.withOwned(instances.length > 0)
						.withOwnedIds(instances.map(i => i._id))
						.withLocked(false)
						.withRequirement(null)
						.withRequiresLabel(null)
						.withResource(null)
						.withRepeat(null)
						.withRepeatable(false)
						.build();
				}))
				.build()
			);
		}

		for (const moveType of OTHER_MOVE_TYPES) {
			const items = actorItems.filter(i => i.type === "move" && i.system?.moveType === moveType);
			if (items.length > 0) {
				categories.push(new MoveCategorySnapshotBuilder()
					.withKey(moveType)
					.withTitle(moveType.charAt(0).toUpperCase() + moveType.slice(1) + " Moves")
					.withNote(null)
					.withMoves(items.map(i => new MoveSnapshotBuilder()
						.withId(i._id)
						.withCompendiumId(i._id)
						.withOwnedId(i._id)
						.withName(i.name)
						.withDescription(i.system?.description ?? "")
						.withRollType(i.system?.rollType ?? null)
						.withIsStarting(false)
						.withSource({ type: moveType })
						.withSourceLabel(null)
						.withOwned(true)
						.withOwnedIds([i._id])
						.withLocked(false)
						.withRequirement(null)
						.withRequiresLabel(null)
						.withResource(null)
						.withRepeat(null)
						.withRepeatable(false)
						.build()
					))
					.build()
				);
			}
		}

		const postDeathItems = actorItems.filter(i => i.type === "move" && i.system?.moveType === "post-death");
		if (postDeathItems.length > 0) {
			categories.push(new MoveCategorySnapshotBuilder()
				.withKey("post-death")
				.withTitle("Post-Death Moves")
				.withNote(null)
				.withMoves(postDeathItems.map(i => new MoveSnapshotBuilder()
					.withId(i._id)
					.withCompendiumId(i._id)
					.withOwnedId(i._id)
					.withName(i.name)
					.withDescription(i.system?.description ?? "")
					.withRollType(i.system?.rollType ?? null)
					.withIsStarting(true)
					.withSource({ type: "post-death" })
					.withSourceLabel(null)
					.withOwned(true)
					.withOwnedIds([i._id])
					.withLocked(false)
					.withRequirement(null)
					.withRequiresLabel(null)
					.withResource(null)
					.withRepeat(null)
					.withRepeatable(false)
					.build()
				))
				.build()
			);
		}

		return categories;
	}

	buildMovelist(categories, other, pdiLabel = null) {
		const playbookCat  = categories.find(c => c.key === "playbook");
		const basicCat     = categories.find(c => c.key === "basic");
		const postDeathCat = categories.find(c => c.key === "post-death");
		const otherCats    = categories.filter(c => !["basic", "playbook", "post-death"].includes(c.key));
		const postDeathGroup = postDeathCat && pdiLabel
			? { label: pdiLabel, moves: postDeathCat.moves }
			: null;
		return new MovelistBuilder()
			.withPlaybookMoves(playbookCat?.moves ?? [])
			.withBasicMoves(basicCat?.moves ?? [])
			.withOtherGroups(otherCats.map(cat => new MoveGroupSnapshot(cat.key, cat.title, cat.moves)))
			.withOtherMoves(other)
			.withStartingMovesNote(playbookCat?.note ?? null)
			.withPostDeathGroup(postDeathGroup)
			.build();
	}

	buildMovelistContext(entries, ownedAllByName, bgMoveNames, actorLevel, actorPlaybook) {
		return entries.map(e =>
			new PlaybookMoveEntry(e, ownedAllByName.get(e.name) ?? [], bgMoveNames, ownedAllByName, actorLevel, actorPlaybook)
		);
	}

	sortPlaybookMoves(moves) {
		const groups = new Map();
		for (const move of moves) {
			const key = move.minLevel ?? 0;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(move);
		}
		const result = [];
		for (const level of [...groups.keys()].sort((a, b) => a - b)) {
			result.push(..._sortGroup(groups.get(level), new Set(groups.get(level).map(m => m.name))));
		}
		return result;
	}

	async addMove(compendiumId) {
		const doc = await this._moveRepo.getPlaybookMoveDocument(compendiumId);
		if (doc) await this._actor.createEmbeddedDocuments("Item", [doc.toObject()]);
	}

	async removeMove(ownedId) {
		if (ownedId) await this._actor.deleteEmbeddedDocuments("Item", [ownedId]);
	}

	async onDropMove(itemData) {
		const alreadyOwned = !!this._actor.items.find(i => i.type === "move" && i.name === itemData.name);
		if (alreadyOwned) return false;

		const actorPlaybook = this._actor.system?.playbook?.name ?? null;
		const itemPlaybook = itemData.system?.playbook ?? null;
		if (itemData.system?.moveType === "playbook" && itemPlaybook && itemPlaybook !== actorPlaybook) {
			itemData = { ...itemData, system: { ...itemData.system, moveType: "other" } };
		}

		await this._actor.createEmbeddedDocuments("Item", [itemData]);
		return true;
	}

	async ensureStartingMoves(playbookData, bgSelectedSlug) {
		if (!playbookData) return;

		const entries = await this._moveRepo.getPlaybookMoves(playbookData.name);
		const ownedNames = new Set(this._actor.items.filter(i => i.type === "move").map(i => i.name));

		const background = playbookData.backgrounds?.find(b => b.slug === bgSelectedSlug);
		const bgMoveNames = new Set(background?.moves ?? []);

		const missing = entries.filter(e =>
			(e.isStarting || bgMoveNames.has(e.name)) && !ownedNames.has(e.name)
		);
		if (missing.length) {
			const docs = await Promise.all(missing.map(e => this._moveRepo.getPlaybookMoveDocument(e.id)));
			await this._actor.createEmbeddedDocuments("Item", docs.filter(Boolean).map(d => d.toObject()));
		}

		const basicEntries = await this._moveRepo.getBasicMoves();
		const missingBasic = basicEntries.filter(e => !ownedNames.has(e.name));
		if (missingBasic.length) {
			const docs = await Promise.all(missingBasic.map(e => this._moveRepo.getBasicMoveDocument(e.id)));
			await this._actor.createEmbeddedDocuments("Item", docs.filter(Boolean).map(d => d.toObject()));
		}
	}
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _toSlug(name) {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function _buildMoveEntry(entry, source, moveResourcesMap, bgSlugs = new Set()) {
	const resourceDef = entry.resource;
	const resource = resourceDef ? new ResourceBuilder()
		.withCurrent(moveResourcesMap[entry.name] ?? 0)
		.withMax(resourceDef.max)
		.withTitle(resourceDef.title ?? null)
		.withLabels(resourceDef.labels ?? [])
		.build() : null;
	const repeat = entry.repeatable
		? { max: entry.repeatChecks.length, current: entry.ownedIds.length }
		: null;
	const requirement = entry.requiresLabel
		? new RequirementSnapshot(entry.requiresLabel, !entry.locked)
		: null;
	const sourceLabel = entry.isStarting ? (bgSlugs.has(_toSlug(entry.name)) ? "Background" : "Starting") : null;
	return new MoveSnapshotBuilder()
		.withId(entry.compendiumId)
		.withCompendiumId(entry.compendiumId)
		.withOwnedId(entry.ownedIds[0] ?? null)
		.withName(entry.name)
		.withDescription(entry.description)
		.withRollType(entry.rollType)
		.withIsStarting(entry.isStarting)
		.withSource(source)
		.withSourceLabel(sourceLabel)
		.withOwned(entry.owned)
		.withOwnedIds(entry.ownedIds)
		.withLocked(entry.locked)
		.withRequirement(requirement)
		.withRequiresLabel(requirement?.label ?? null)
		.withResource(resource)
		.withRepeat(repeat)
		.withRepeatable(repeat !== null)
		.build();
}

function _sortGroup(moves, groupNames) {
	const dependents = new Map();
	const roots = [];
	for (const move of moves) {
		if (!move.requires || !groupNames.has(move.requires)) {
			roots.push(move);
		} else {
			if (!dependents.has(move.requires)) dependents.set(move.requires, []);
			dependents.get(move.requires).push(move);
		}
	}
	roots.sort((a, b) => a.name.localeCompare(b.name));
	for (const deps of dependents.values()) deps.sort((a, b) => a.name.localeCompare(b.name));
	const result = [];
	const visited = new Set();

	function visit(move) {
		if (visited.has(move.name)) return;
		visited.add(move.name);
		result.push(move);
		for (const child of dependents.get(move.name) ?? []) visit(child);
	}

	for (const root of roots) visit(root);
	moves.filter(m => !visited.has(m.name)).sort((a, b) => a.name.localeCompare(b.name)).forEach(m => result.push(m));
	return result;
}
