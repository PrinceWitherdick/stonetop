import { ResourceDef } from "./Resource.js";

export class MinorArcanumItem {
	constructor(data) {
		this.name            = data.name;
		this.weight          = data.weight          ?? null;
		this.note            = data.note            ?? null;
		this.inventoryColumn = data.inventoryColumn ?? null;
		this.resource        = data.resource ? new ResourceDef(data.resource) : null;
	}
}

export class MinorArcanumMove {
	constructor(data) {
		this.name        = data.name;
		this.rollType    = data.rollType    ?? null;
		this.description = data.description;
	}
}

export class MinorArcanumFront {
	constructor(data) {
		this.title       = data.title;
		this.item        = data.item ? new MinorArcanumItem(data.item) : null;
		this.description = data.description;
		this.unlock      = data.unlock;
	}
}

export class MinorArcanumBack {
	constructor(data) {
		this.title       = data.title;
		this.item        = data.item ? new MinorArcanumItem(data.item) : null;
		this.description = data.description;
		this.resource    = data.resource ? new ResourceDef(data.resource) : null;
		this.move        = data.move ? new MinorArcanumMove(data.move) : null;
		this.options     = data.options ?? [];
	}
}

export class MinorArcanum {
	constructor(data) {
		this.slug  = data.slug;
		this.front = new MinorArcanumFront(data.front);
		this.back  = new MinorArcanumBack(data.back);
		// Homebrew arcana declare their tier explicitly via `flags.stonetop.major`;
		// shipped arcana omit it and fall back to the MAJOR_ARCANA_ICONS allowlist
		// (see isMajorArcanumItem). `img` is the Item's own art, used as the card
		// thumbnail for homebrew majors that aren't in the icon registry.
		this.major = data.major ?? false;
		this.img   = data.img ?? null;
		// Homebrew summoners author their manifested follower(s) here; shipped summoners
		// use the hard-coded ARCANA_SUMMONS map instead (see arcanaSummonFollowers).
		this.summon = data.summon ?? null;
	}
}
