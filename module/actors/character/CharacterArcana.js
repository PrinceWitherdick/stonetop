import {
	ArcanaBackOptionSnapshotBuilder, ArcanaSnapshot, ArcanaSectionSnapshot,
	ArcanaUnlockOptionSnapshotBuilder, ArcanaUnlockTextItem,
	ArcanumBackMoveSnapshot, ArcanumUnlockSection,
	MinorArcanumBackSnapshotBuilder, MinorArcanumFrontSnapshotBuilder,
	MinorArcanumSnapshotBuilder,
	ResourceBuilder,
} from "../../model/CharacterSnapshot.js";
import { OutfitItemBuilder } from "../../model/OutfitItem.js";
import { majorArcanaImg } from "../../arcana-icons.js";

function _isUnlocked(item, unlockCounts, arcanaBoxes, circleCount) {
	const reqs = item.front.unlock?.requirements ?? [];
	const reqsMet = reqs.every(r =>
		r.type !== "option" || (unlockCounts[`${item.slug}:${r.slug}`] ?? 0) >= (r.max ?? 1)
	);
	if (!reqsMet) return false;
	for (let i = 0; i < circleCount; i++) {
		if (!arcanaBoxes[`${item.slug}:unlock:${i}`]) return false;
	}
	return true;
}

function _processMarkers(html, slug, context, boxStates, marker, cssClass) {
	if (!html) return { html, count: 0 };
	let index = 0;
	const processed = html.replace(new RegExp(marker, "g"), () => {
		const key = `${slug}:${context}:${index}`;
		const checked = !!boxStates[key];
		return `<input type="checkbox" class="${cssClass}" data-arcanum-slug="${slug}" data-context="${context}" data-index="${index++}"${checked ? " checked" : ""}>`;
	});
	return { html: processed, count: index };
}

function _buildOutfitItem(slug, itemData, resolvedResource = undefined) {
	if (!itemData) return null;
	return new OutfitItemBuilder()
		.withSlug(slug)
		.withName(itemData.name)
		.withWeight(itemData.weight ?? null)
		.withNote(itemData.note ?? null)
		.withInventoryColumn(itemData.inventoryColumn ?? null)
		.withResource(resolvedResource !== undefined ? resolvedResource : (itemData.resource ?? null))
		.withTwoCol(false)
		.withBreakBefore(false)
		.build();
}

export class CharacterArcana {
	constructor(flags, arcanaRepo) {
		this._flags = flags;
		this._arcanaRepo = arcanaRepo;
	}

	get ownedSlugs()       { return new Set(this._flags.getFlag("owned") ?? []); }
	get flippedSlugs()     { return new Set(this._flags.getFlag("flipped") ?? []); }
	get identifiedSlugs()  { return new Set(this._flags.getFlag("identified") ?? []); }
	get unlockCounts()     { return this._flags.getFlag("unlock") ?? {}; }
	get backOptionCounts() { return this._flags.getFlag("backOptions") ?? {}; }

	async buildSnapshot(stats = {}, checkedMap = {}, inventoryResources = {}) {
		const ownedSlugs       = this.ownedSlugs;
		const flippedSlugs     = this.flippedSlugs;
		const identifiedSlugs  = this.identifiedSlugs;
		const unlockCounts     = this.unlockCounts;
		const backOptionCounts = this.backOptionCounts;
		const arcanaBoxes      = this._flags.getFlag("boxes") ?? {};

		const fetchedItems = await this._arcanaRepo.findBySlugs([...ownedSlugs]);

		const minorItems = fetchedItems.map(item => {
			const flipped = flippedSlugs.has(item.slug);

			const unlockItems = item.front.unlock.requirements.map(li => {
				if (li.type === "text") return new ArcanaUnlockTextItem(li.content);
				const count = unlockCounts[`${item.slug}:${li.slug}`] ?? 0;
				return new ArcanaUnlockOptionSnapshotBuilder()
					.withSlug(li.slug)
					.withDescription(li.description)
					.withCount(count)
					.withMax(li.max ?? 1)
					.withSelected(count > 0)
					.build();
			});

			const { html: frontDesc }                  = _processMarkers(item.front.description, item.slug, "front", arcanaBoxes, "□", "stonetop-arcanum-box");
			const { html: unlockDesc, count: circleCount } = _processMarkers(item.front.unlock?.description ?? "", item.slug, "unlock", arcanaBoxes, "○", "stonetop-arcanum-circle");
			const unlocked = _isUnlocked(item, unlockCounts, arcanaBoxes, circleCount);

			const front = new MinorArcanumFrontSnapshotBuilder()
				.withTitle(item.front.title)
				.withItem(_buildOutfitItem(item.slug, item.front.item))
				.withDescription(frontDesc)
				.withUnlock(new ArcanumUnlockSection(unlockDesc, unlockItems))
				.build();

			const backOpts = (item.back.options ?? []).map(o => {
				const count = backOptionCounts[`${item.slug}:${o.slug}`] ?? 0;
				return new ArcanaBackOptionSnapshotBuilder()
					.withSlug(o.slug)
					.withDescription(o.description)
					.withCount(count)
					.withMax(o.max ?? 1)
					.withSelected(count > 0)
					.build();
			});

			const backResource = item.back.resource
				? new ResourceBuilder()
					.withCurrent(inventoryResources[item.slug] ?? 0)
					.withMax(item.back.resource.maxStat
						? (stats[item.back.resource.maxStat]?.value ?? 0)
						: item.back.resource.max)
					.withMaxStat(item.back.resource.maxStat ?? null)
					.withTitle(item.back.resource.title ?? null)
					.withLabels(item.back.resource.labels ?? [])
					.build()
				: null;

			const backItemResourceDef = item.back.item?.resource ?? null;
			const backItemResource = backItemResourceDef
				? new ResourceBuilder()
					.withCurrent(inventoryResources[item.slug] ?? 0)
					.withMax(backItemResourceDef.maxStat
						? (stats[backItemResourceDef.maxStat]?.value ?? 0)
						: backItemResourceDef.max)
					.withMaxStat(backItemResourceDef.maxStat ?? null)
					.withTitle(backItemResourceDef.title ?? null)
					.withLabels(backItemResourceDef.labels ?? [])
					.build()
				: null;

			const backMove = item.back.move
				? new ArcanumBackMoveSnapshot(
					item.back.move.name,
					item.back.move.rollType ?? null,
					item.back.move.description)
				: null;

			const { html: backDesc } = _processMarkers(item.back.description, item.slug, "back", arcanaBoxes, "□", "stonetop-arcanum-box");

			const back = new MinorArcanumBackSnapshotBuilder()
				.withTitle(item.back.title)
				.withItem(_buildOutfitItem(item.slug, item.back.item, backItemResource))
				.withDescription(backDesc)
				.withResource(backResource)
				.withMove(backMove)
				.withOptions(backOpts)
				.build();

			return new MinorArcanumSnapshotBuilder()
				.withSlug(item.slug)
				.withFront(front)
				.withBack(back)
				.withOwned(true)
				.withFlipped(flipped)
				.withChecked(checkedMap[item.slug] ?? false)
				.withUnlocked(unlocked)
				.withIdentified(identifiedSlugs.has(item.slug))
				.withImg(majorArcanaImg(item.slug))
				.build();
		});

		const minor = new ArcanaSectionSnapshot("Minor Arcana", minorItems);
		const major = new ArcanaSectionSnapshot("Major Arcana", []);
		return new ArcanaSnapshot(minor, major);
	}

	async addArcanum(slug) {
		const slugsWeHae = this.ownedSlugs;
		slugsWeHae.add(slug);
		await this._flags.setFlag("owned", [...slugsWeHae]);
	}

	async removeArcanum(slug) {
		const owned = this.ownedSlugs;
		owned.delete(slug);
		const identified = this.identifiedSlugs;
		identified.delete(slug);
		await Promise.all([
			this._flags.setFlag("owned", [...owned]),
			this._flags.setFlag("identified", [...identified]),
		]);
	}

	async identifyArcanum(slug) {
		const s = this.identifiedSlugs;
		s.add(slug);
		await this._flags.setFlag("identified", [...s]);
	}

	async flipArcanum(slug) {
		const s = this.flippedSlugs;
		s.add(slug);
		await this._flags.setFlag("flipped", [...s]);
	}

	async unflipArcanum(slug) {
		const s = this.flippedSlugs;
		s.delete(slug);
		await this._flags.setFlag("flipped", [...s]);
	}

	async setUnlockCount(arcanumSlug, optionSlug, count) {
		const key = `${arcanumSlug}:${optionSlug}`;
		await this._flags.setFlag("unlock", { ...this.unlockCounts, [key]: count });
	}

	async setArcanumBoxChecked(slug, context, index, checked) {
		const boxes = this._flags.getFlag("boxes") ?? {};
		const key = `${slug}:${context}:${index}`;
		if (!!boxes[key] === !!checked) return;
		// Store false explicitly rather than deleting the key — Foundry's setFlag uses
		// mergeObject internally, which preserves keys missing from the update object.
		await this._flags.setFlag("boxes", { ...boxes, [key]: !!checked });
	}

	async setBackOptionCount(arcanumSlug, optionSlug, count) {
		const key = `${arcanumSlug}:${optionSlug}`;
		await this._flags.setFlag("backOptions", { ...this.backOptionCounts, [key]: count });
	}

	async getArcanumChatContent(slug, flipped) {
		const [item] = await this._arcanaRepo.findBySlugs([slug]);
		if (!item) return null;

		if (flipped) {
			const { title, description, move } = item.back;
			let html = `<div class="stonetop-arcanum-chat-card"><h3 class="stonetop-arcanum-chat-title">${title}</h3>${description ?? ""}`;
			if (move) html += `<p class="stonetop-arcanum-move-trigger"><strong><em>${move.name}</em></strong></p>${move.description ?? ""}`;
			return html + `</div>`;
		} else {
			const { title, description, unlock } = item.front;
			let html = `<div class="stonetop-arcanum-chat-card"><h3 class="stonetop-arcanum-chat-title">${title}</h3>${description ?? ""}`;
			if (unlock?.description) {
				html += `<p class="stonetop-arcanum-unlock-lead">${unlock.description}</p>`;
				const reqs = unlock.requirements ?? [];
				if (reqs.length) {
					const items = reqs.map(r => `<li>${r.type === "text" ? r.content : r.description}</li>`).join("");
					html += `<ul class="stonetop-arcanum-unlock-list">${items}</ul>`;
				}
			}
			return html + `</div>`;
		}
	}

	async weightedInventoryItems() {
		const ownedSlugs   = this.ownedSlugs;
		const flippedSlugs = this.flippedSlugs;
		const items = await this._arcanaRepo.findBySlugs([...ownedSlugs]);
		return items.flatMap(item => {
			const flipped  = flippedSlugs.has(item.slug);
			const sideItem = flipped ? item.back.item : item.front.item;
			if (!sideItem?.name) return [];
			return [new OutfitItemBuilder()
				.withSlug(item.slug)
				.withName(sideItem.name)
				.withWeight(sideItem.weight ?? 0)
				.withNote(sideItem.note ?? null)
				.withInventoryColumn(sideItem.inventoryColumn ?? "arcana")
				.withResource(sideItem.resource ?? null)
				.withTwoCol(false)
				.withBreakBefore(false)
				.build()
			];
		});
	}
}
