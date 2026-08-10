import { describe, it, expect } from "vitest";
import {
	claimRosterPortraits,
	clearRosterPortrait,
	readRosterPortrait,
	rosterAvatar,
	rosterAvatarContext,
	rosterPortraitList,
	rosterPortraitListPath,
	writeRosterPortrait,
} from "../../../module/actors/character/roster-portraits.js";
import { rosterMemberFrameHandle } from "../../../module/utils/portrait-frame-handles.js";
import { PERSON_ROSTER_IMG } from "../../../module/utils/person-portrait.js";

const SCOPE = "stonetop-pwd";
const FACE  = "systems/stonetop-pwd/assets/people/aled.webp";
const FRAME = { src: FACE, rect: [0.1, 0, 0.6, 0.5] };

/**
 * The thinnest actor these functions can work against: a flag bag plus an `update` that applies
 * dotted paths the way Foundry does for a NON-array value. Every write here is a whole-array
 * write, which is exactly the thing under test — a fake that merged into arrays would hide the
 * bug this module exists to prevent.
 */
function makeActor(stonetop = {}) {
	const actor = {
		flags: { [SCOPE]: stonetop },
		updates: [],
		async update(data) {
			actor.updates.push(data);
			for (const [path, value] of Object.entries(data)) {
				const parts = path.split(".");
				// `flags.stonetop-pwd.…` — the scope is one segment, not two, despite the hyphen.
				const keys = ["flags", SCOPE, ...parts.slice(2)];
				let node = actor;
				for (const key of keys.slice(0, -1)) node = (node[key] ??= {});
				node[keys.at(-1)] = value;
			}
		},
	};
	return actor;
}

describe("roster portrait stores", () => {
	it("names a store for each roster kind, and none for an unknown one", () => {
		expect(rosterPortraitListPath("crew-individual")).toBe("crew.individuals");
		expect(rosterPortraitListPath("crew-member")).toBe("crew.memberPortrait");
		expect(rosterPortraitListPath("custom-member", "abc")).toBe("customFollowers.abc.memberPortrait");
		expect(rosterPortraitListPath("beast", "wolf")).toBeNull();
	});

	// Without this a slugless custom member would build `customFollowers..memberPortrait` and
	// write a face into a follower that does not exist.
	it("refuses a custom member with no follower id", () => {
		expect(rosterPortraitListPath("custom-member", "")).toBeNull();
		expect(rosterPortraitListPath("custom-member")).toBeNull();
	});

	it("reads an unwritten store as empty rather than throwing", () => {
		const actor = makeActor({});
		expect(rosterPortraitList(actor, "crew-member")).toEqual([]);
		expect(readRosterPortrait(actor, "crew-member", "", 3)).toEqual({ img: "", portraitFrame: null });
	});

	it("hands back a CLONE, so a caller splicing it cannot mutate stored flags", () => {
		const actor = makeActor({ crew: { memberPortrait: [{ img: FACE }] } });
		const copy = rosterPortraitList(actor, "crew-member");
		copy.splice(0, 1);
		expect(actor.flags[SCOPE].crew.memberPortrait).toHaveLength(1);
	});
});

describe("writing a roster member's face", () => {
	// The whole reason this module exists: a dotted `crew.individuals.0.img` would expand to an
	// OBJECT and replace the array. Every write must send the array back whole.
	it("writes the WHOLE array, never a dotted path into it", async () => {
		const actor = makeActor({ crew: { individuals: [{ name: "Aled" }, { name: "Eira" }] } });
		await writeRosterPortrait(actor, "crew-individual", "", 1, { img: FACE });
		expect(Object.keys(actor.updates[0])).toEqual([`flags.${SCOPE}.crew.individuals`]);
		expect(Array.isArray(actor.updates[0][`flags.${SCOPE}.crew.individuals`])).toBe(true);
	});

	it("leaves a named individual's name, tag and traits alone", async () => {
		const actor = makeActor({ crew: { individuals: [{ name: "Aled", tag: "bully", traits: ["big"] }] } });
		await writeRosterPortrait(actor, "crew-individual", "", 0, { img: FACE });
		expect(actor.flags[SCOPE].crew.individuals[0])
			.toEqual({ name: "Aled", tag: "bully", traits: ["big"], img: FACE });
	});

	// An anonymous member has no stored row at all until they are given a face. The crew is named
	// only so that it EXISTS — the sheet draws no roster otherwise, and the bound below refuses a
	// write against a roster that isn't there.
	it("creates an anonymous member's slot on demand, filling the gap with nulls", async () => {
		const actor = makeActor({ crew: { name: "The Watch" } });
		await writeRosterPortrait(actor, "crew-member", "", 2, { img: FACE });
		expect(actor.flags[SCOPE].crew.memberPortrait).toEqual([null, null, { img: FACE }]);
	});

	// A named individual is a real row: a portrait for someone not on the roster is a bug
	// upstream, not a row to invent.
	it("will not invent a named individual who is not on the roster", async () => {
		const actor = makeActor({ crew: { individuals: [{ name: "Aled" }] } });
		await writeRosterPortrait(actor, "crew-individual", "", 4, { img: FACE });
		expect(actor.updates).toHaveLength(0);
		expect(actor.flags[SCOPE].crew.individuals).toHaveLength(1);
	});

	it("normalizes a frame on the way in and reads it back", async () => {
		const actor = makeActor({ crew: { name: "The Watch", memberPortrait: [{ img: FACE }] } });
		await writeRosterPortrait(actor, "crew-member", "", 0, { portraitFrame: FRAME });
		const stored = readRosterPortrait(actor, "crew-member", "", 0);
		expect(stored.img).toBe(FACE);
		expect(stored.portraitFrame).toMatchObject({ src: FACE });
		expect(stored.portraitFrame.rect).toHaveLength(4);
	});

	// Clearing drops the frame WITH the picture: an orphan rect would sit there forever, applying
	// to nothing, with nothing left to ever clear it.
	it("clears the face and its frame together, in one write", async () => {
		const actor = makeActor({ crew: { individuals: [{ name: "Aled", img: FACE, portraitFrame: FRAME }] } });
		await clearRosterPortrait(actor, "crew-individual", "", 0);
		expect(actor.updates).toHaveLength(1);
		expect(actor.flags[SCOPE].crew.individuals[0]).toEqual({ name: "Aled" });
	});

	it("keeps each custom group's roster in its own store", async () => {
		const actor = makeActor({ customFollowers: { warband: { name: "The Warband" }, posse: {} } });
		await writeRosterPortrait(actor, "custom-member", "warband", 0, { img: FACE });
		expect(actor.flags[SCOPE].customFollowers.warband.memberPortrait).toEqual([{ img: FACE }]);
		expect(actor.flags[SCOPE].customFollowers.posse.memberPortrait).toBeUndefined();
	});

	// The reachable case is an enlarged portrait window left open across a roster change: it is
	// keyed on a ref so it survives the sheet closing, which means it also survives the crew
	// shrinking beneath it. Without a bound, a pick there padded the array back out and stored a
	// face against a member the crew had lost — to reappear on a stranger if the crew grew again.
	describe("refusing a write aimed past the end of the roster", () => {
		it("refuses an anonymous crew slot beyond the headcount", async () => {
			// Size 3, nobody named: anonymous members are 0..2, so slot 5 is nobody.
			const actor = makeActor({ crew: { size: 3, memberPortrait: [] } });
			await writeRosterPortrait(actor, "crew-member", "", 5, { img: FACE });
			expect(actor.updates).toHaveLength(0);
		});

		it("allows the last member who really is on the roster", async () => {
			const actor = makeActor({ crew: { name: "The Watch", size: 3 } });
			await writeRosterPortrait(actor, "crew-member", "", 2, { img: FACE });
			expect(actor.flags[SCOPE].crew.memberPortrait).toEqual([null, null, { img: FACE }]);
		});

		// The case the bound was written for, stated plainly: an enlarged portrait window outlives
		// the crew being deleted out from under it. `effectiveCrewSize` answers an absent size with
		// the rulebook's half-dozen, so without the "is there a crew at all" gate the stale window's
		// pick re-created `crew.memberPortrait` on a character who has no crew — a face waiting to
		// reappear on a stranger the day one is built again.
		it("refuses every slot of a crew that has been deleted", async () => {
			const actor = makeActor({});
			for (const index of [0, 2, 5]) {
				await writeRosterPortrait(actor, "crew-member", "", index, { img: FACE });
			}
			expect(actor.updates).toHaveLength(0);
			expect(actor.flags[SCOPE].crew).toBeUndefined();
		});

		// The named individuals come off the FRONT of the headcount, so a crew of six with two
		// named has four anonymous bodies, not six.
		it("counts the anonymous tail past the named members", async () => {
			const actor = makeActor({ crew: { size: 6, individuals: [{ name: "Aled" }, { name: "Eira" }] } });
			await writeRosterPortrait(actor, "crew-member", "", 3, { img: FACE });
			expect(actor.updates).toHaveLength(1);
			actor.updates.length = 0;
			await writeRosterPortrait(actor, "crew-member", "", 4, { img: FACE });
			expect(actor.updates).toHaveLength(0);
		});

		// An unset size on a crew that EXISTS is the rulebook's half-dozen, not zero — the roster
		// draws six rows, so all six must be portraitable.
		it("honours the default headcount when no size was ever stored", async () => {
			const actor = makeActor({ crew: { name: "The Watch" } });
			await writeRosterPortrait(actor, "crew-member", "", 5, { img: FACE });
			expect(actor.updates).toHaveLength(1);
			actor.updates.length = 0;
			await writeRosterPortrait(actor, "crew-member", "", 6, { img: FACE });
			expect(actor.updates).toHaveLength(0);
		});

		// A custom group with no stored size still has TWO members: a group of one is a single
		// follower, which is a different card entirely.
		it("gives a custom group its floor of two members before any size is stored", async () => {
			const actor = makeActor({ customFollowers: { warband: { name: "The Warband" } } });
			await writeRosterPortrait(actor, "custom-member", "warband", 1, { img: FACE });
			expect(actor.updates).toHaveLength(1);
			actor.updates.length = 0;
			await writeRosterPortrait(actor, "custom-member", "warband", 2, { img: FACE });
			expect(actor.updates).toHaveLength(0);
		});

		it("refuses a custom group that does not exist", async () => {
			const actor = makeActor({ customFollowers: {} });
			await writeRosterPortrait(actor, "custom-member", "ghost", 0, { img: FACE });
			expect(actor.updates).toHaveLength(0);
		});

		// Also what stops a silly index asking the pad loop for a million-element array.
		it("refuses an absurd index without trying to allocate for it", async () => {
			const actor = makeActor({ crew: { size: 6 } });
			await writeRosterPortrait(actor, "crew-member", "", 1e9, { img: FACE });
			expect(actor.updates).toHaveLength(0);
		});
	});

	it("does nothing for an unknown kind or a negative index", async () => {
		const actor = makeActor({ crew: { individuals: [{ name: "Aled" }] } });
		await writeRosterPortrait(actor, "beast", "wolf", 0, { img: FACE });
		await writeRosterPortrait(actor, "crew-individual", "", -1, { img: FACE });
		expect(actor.updates).toHaveLength(0);
	});
});

describe("what a roster row draws", () => {
	// The lighter empty figure, not the darker mark an art-less NPC wears: a roster is a dense
	// column of small avatars, which is the whole reason that placeholder exists.
	it("falls back to the drawn placeholder, and says there is no portrait", () => {
		expect(rosterAvatar(undefined)).toEqual({ avatarImg: PERSON_ROSTER_IMG, avatarStyle: "", hasPortrait: false });
		expect(rosterAvatar({ img: "   " }).hasPortrait).toBe(false);
	});

	it("draws a chosen face and reports it as one", () => {
		expect(rosterAvatar({ img: FACE })).toEqual({ avatarImg: FACE, avatarStyle: "", hasPortrait: true });
	});

	it("applies a frame authored against that same picture", () => {
		const avatar = rosterAvatar({ img: FACE, portraitFrame: FRAME });
		expect(avatar.avatarImg).toBe(FACE);
		expect(avatar.avatarStyle).not.toBe("");
	});
});

// The state matrix an audit found a hole in, and which now also records the crop control's
// removal: a tap is the ONLY thing a roster avatar does, so this pins exactly which of the two
// things it does in each state. Kept as a table because it decides reachability for three
// rosters at once and a hole in it is invisible until someone tries that one combination.
describe("what a roster row's avatar offers, per state", () => {
	const FACE = "systems/stonetop-pwd/assets/people/aled.webp";
	const ctx = (hasFace, canWrite, rosterEditing) =>
		rosterAvatarContext(hasFace ? { img: FACE } : null, { name: "Aled", canWrite, rosterEditing });

	// canWrite, rosterEditing, hasFace -> what a tap does
	const MATRIX = [
		["owner, pencil open,   has a face",  true,  true,  true,  "pick"],
		["owner, pencil open,   no face",     true,  true,  false, "pick"],
		// Reading the roster, a tap ENLARGES — and that window is where cropping lives, now that
		// the row carries no crop button of its own.
		["owner, pencil closed, has a face",  true,  false, true,  "view"],
		// Nothing to enlarge, so the gallery opens in both modes.
		["owner, pencil closed, no face",     true,  false, false, "pick"],
		["viewer, pencil open,  has a face",  false, true,  true,  "view"],
		["viewer, pencil open,  no face",     false, true,  false, "view"],
	];

	for (const [label, canWrite, editing, hasFace, mode] of MATRIX) {
		it(label, () => {
			expect(ctx(hasFace, canWrite, editing).avatarMode, "tap behaviour").toBe(mode);
		});
	}

	// The row offers no crop control at all any more — cropping is reached through the enlarged
	// portrait window, the way it is for every other small face in the system.
	it("offers no crop control of its own in any state", () => {
		for (const [, canWrite, editing, hasFace] of MATRIX) {
			expect(ctx(hasFace, canWrite, editing)).not.toHaveProperty("avatarFrameable");
		}
	});

	// A viewer who can neither look nor write gets no tab stop and no pointer cursor, rather than
	// one promising a window that never opens.
	it("offers nothing at all to a viewer looking at a member with no face", () => {
		expect(ctx(false, false, false).avatarInteractive).toBe(false);
	});

	it("stays interactive for a viewer whenever there is a face to enlarge", () => {
		expect(ctx(true, false, false).avatarInteractive).toBe(true);
	});

	// One string drives the tooltip AND the aria-label, so these cannot drift apart.
	it("words each state the way the follower card words it", () => {
		expect(ctx(true,  true,  true).avatarLabel).toBe("Change Aled's portrait");
		expect(ctx(false, true,  true).avatarLabel).toBe("Choose a portrait for Aled");
		expect(ctx(true,  true,  false).avatarLabel).toBe("View Aled's portrait");
	});
	it("falls back to a neutral name for an unnamed member", () => {
		expect(rosterAvatarContext(null, { canWrite: true }).avatarName).toBe("this member");
	});
});

describe("the gallery's already-taken scan", () => {
	it("claims every roster face, named by the member or by their group", () => {
		const claimed = [];
		claimRosterPortraits({
			crew: {
				name: "The Bonny Lads",
				individuals: [{ name: "Aled", img: "a.webp" }, { name: "Eira" }],
				memberPortrait: [{ img: "b.webp" }],
			},
			customFollowers: { warband: { name: "The Warband", memberPortrait: [null, { img: "c.webp" }] } },
		}, (img, who) => { if (img) claimed.push([img, who]); });

		expect(claimed).toEqual([
			["a.webp", "Aled"],
			["b.webp", "The Bonny Lads"],
			["c.webp", "The Warband"],
		]);
	});

	it("survives a character with no crew and no custom followers", () => {
		const claimed = [];
		claimRosterPortraits({}, (img) => claimed.push(img));
		expect(claimed).toEqual([]);
	});
});

describe("the framer's handle on a roster member", () => {
	it("reads, writes and clears the member's own frame", async () => {
		const actor  = makeActor({ crew: { individuals: [{ name: "Aled", img: FACE }] } });
		const handle = rosterMemberFrameHandle(actor, { kind: "crew-individual", slug: "", index: 0 }, { editable: true });

		expect(handle.canWrite).toBe(true);
		expect(handle.img).toBe(FACE);
		expect(handle.read()).toBeNull();

		await handle.write(FRAME);
		expect(handle.read()).toMatchObject({ src: FACE });

		await handle.clear();
		expect(handle.read()).toBeNull();
		expect(actor.flags[SCOPE].crew.individuals[0]).toEqual({ name: "Aled", img: FACE });
	});

	it("makes clearing an unframed member a genuine no-op", async () => {
		const actor  = makeActor({ crew: { memberPortrait: [{ img: FACE }] } });
		const handle = rosterMemberFrameHandle(actor, { kind: "crew-member", slug: "", index: 0 }, { editable: true });
		await handle.clear();
		expect(actor.updates).toHaveLength(0);
	});

	it("yields no handle at all for a kind with no store", () => {
		const actor = makeActor({});
		expect(rosterMemberFrameHandle(actor, { kind: "beast", slug: "wolf", index: 0 })).toBeNull();
		expect(rosterMemberFrameHandle(null, { kind: "crew-member", slug: "", index: 0 })).toBeNull();
	});
});
