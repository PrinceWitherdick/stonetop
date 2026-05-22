import { describe, expect, it } from "vitest";
import {TestCharacterBuilder} from "../../fakes/TestCharacterBuilder.js";
import {BLESSED_PLAYBOOK} from "../../fakes/FakePlaybookRepository.js";
import {FakeActorBuilder} from "../../fakes/FakeActorBuilder.js";

// -- buildSnapshot (playbook display fields) ----------------------------------

describe("StonetopCharacter.buildSnapshot — playbook display fields", () => {
	it("returns playbook=null with empty movelist when no playbook", async () => {
		const char = new TestCharacterBuilder(new FakeActorBuilder().build()).build();
		const data = await char.buildSnapshot();
		expect(data.playbook).toBeNull();
		expect(data.movelist.playbookMoves).toHaveLength(0);
		expect(data.movelist.basicMoves).toHaveLength(0);
	});

	it("returns movelist with otherMoves even when no playbook", async () => {
		const move = { _id: "m1", type: "move", name: "Custom Move", system: { moveType: "other", rollType: null } };
		const char = new TestCharacterBuilder(new FakeActorBuilder().withItems([move]).build()).build();
		const data = await char.buildSnapshot();
		expect(data.movelist.otherMoves).toHaveLength(1);
		expect(data.movelist.otherMoves[0].name).toBe("Custom Move");
	});

	it("returns playbook object when playbook present", async () => {
		const actor = new FakeActorBuilder().withPlaybook("the-blessed", "The Blessed").build();
		const char = new TestCharacterBuilder(actor).addPlaybook(BLESSED_PLAYBOOK).build();
		const data = await char.buildSnapshot();
		expect(data.playbook).not.toBeNull();
	});

	describe("with no saved selections", () => {
		async function buildCharacterSnapshot() {
			const actor = new FakeActorBuilder().withPlaybook("the-blessed", "The Blessed").build();
			return new TestCharacterBuilder(actor).addPlaybook(BLESSED_PLAYBOOK).build().buildSnapshot();
		}

		it("maps backgrounds, none selected", async () => {
			const data = await buildCharacterSnapshot();
			expect(data.playbook.background.options).toHaveLength(3);
			expect(data.playbook.background.options.every(b => !b.selected)).toBe(true);
		});

		it("maps instincts with value field and none selected", async () => {
			const data = await buildCharacterSnapshot();
			expect(data.playbook.instinct.options).toHaveLength(5);
			expect(data.playbook.instinct.options[0].value).toBe("Delight — To find beauty, in even the ugliest things.");
			expect(data.playbook.instinct.options.every(i => !i.selected)).toBe(true);
		});

		it("maps appearance lines with lineIdx and no selections", async () => {
			const data = await buildCharacterSnapshot();
			expect(data.playbook.appearance.options).toHaveLength(4);
			expect(data.playbook.appearance.options[0].lineIdx).toBe(0);
			expect(data.playbook.appearance.options[0].options.every(o => !o.selected)).toBe(true);
		});

		it("maps origins with none selected", async () => {
			const data = await buildCharacterSnapshot();
			expect(data.playbook.origin.options).toHaveLength(4);
			expect(data.playbook.origin.options.every(o => !o.selected)).toBe(true);
			expect(data.playbook.origin.options[0].region).toBe("Stonetop");
		});
	});

	describe("with saved selections", () => {
		async function buildCtx() {
			const actor = new FakeActorBuilder()
				.withPlaybook("the-blessed", "The Blessed")
				.withFlag("background.selected", "vessel")
				.withFlag("instinct.selected", "Delight — To find beauty, in even the ugliest things.")
				.withFlag("appearance.selected", { 0: "gray & wizened" })
				.withFlag("origin.selected", "Barrier Pass")
				.build();
			return new TestCharacterBuilder(actor).addPlaybook(BLESSED_PLAYBOOK).build().buildSnapshot();
		}

		it("marks the saved background as selected", async () => {
			const data = await buildCtx();
			expect(data.playbook.background.options.find(b => b.slug === "vessel").selected).toBe(true);
			expect(data.playbook.background.options.filter(b => b.selected)).toHaveLength(1);
		});

		it("marks the matching instinct as selected", async () => {
			const data = await buildCtx();
			expect(data.playbook.instinct.selected).toBe("Delight — To find beauty, in even the ugliest things.");
			expect(data.playbook.instinct.options.find(i => i.word === "Delight").selected).toBe(true);
		});

		it("marks saved appearance option as selected", async () => {
			const data = await buildCtx();
			expect(data.playbook.appearance.options[0].options.find(o => o.value === "gray & wizened").selected).toBe(true);
		});

		it("marks the saved origin as selected", async () => {
			const data = await buildCtx();
			expect(data.playbook.origin.options.find(o => o.region === "Barrier Pass").selected).toBe(true);
		});
	});
});

