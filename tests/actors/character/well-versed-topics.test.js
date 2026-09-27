import { describe, it, expect } from "vitest";
import {
	WELL_VERSED_TOPIC_SUMMARIES,
	wellVersedTopicSummary,
	backgroundMarkOption,
	WELL_VERSED_MOVE,
	WELL_VERSED_TOPICS,
} from "../../../module/actors/character/dialogs/well-versed-topics.js";
import { sourceMovesFor } from "../../fakes/LiveCharacter.js";
import { loadPlaybookPackDocs } from "../../fakes/sourcePack.js";

// The Seeker onboarding Background step shows each "Well Versed in …" topic's
// player-safe "known by most in Stonetop" summary on hover. Guard the lookup's
// normalisation and that the Background choices all resolve to a summary.

const BACKGROUND_TOPICS = [
	"the Things Below",            // Patriot / Witch Hunter
	"the Makers and their arts",   // Antiquarian
	"the Fae",                     // Witch Hunter
	"the Last Door and what lies beyond", // Witch Hunter
];

describe("wellVersedTopicSummary", () => {
	it("returns a non-empty summary for every Background choice topic", () => {
		for (const topic of BACKGROUND_TOPICS) {
			const summary = wellVersedTopicSummary(topic);
			expect(summary, `no summary for "${topic}"`).toBeTruthy();
			expect(summary.length).toBeGreaterThan(20);
		}
	});

	it("matches case- and whitespace-insensitively", () => {
		expect(wellVersedTopicSummary("  THE FAE  ")).toBe(WELL_VERSED_TOPIC_SUMMARIES["the fae"]);
	});

	it("returns null for topics we don't summarise", () => {
		expect(wellVersedTopicSummary("the civilizations of humanity")).toBeNull();
		expect(wellVersedTopicSummary("")).toBeNull();
		expect(wellVersedTopicSummary(undefined)).toBeNull();
	});
});

// The background's "Well Versed in ___" is one of the move's seven boxes. Every wording a Seeker
// background prints names one, and the topic list onboarding reads is the move's own.
describe("backgroundMarkOption", () => {
	const wellVersed = sourceMovesFor("The Seeker").find(d => d.name === "Well Versed");
	const seeker = loadPlaybookPackDocs().find(d => d.system?.slug === "the-seeker");

	it("WELL_VERSED_TOPICS is Well Versed's markOptions, slug for slug and label for label", () => {
		expect(WELL_VERSED_TOPICS).toEqual(wellVersed.system.markOptions.map(o => ({ slug: o.slug, label: o.label })));
	});

	it("maps every Seeker background's topic wording to one of the move's boxes", () => {
		const slugs = new Set(wellVersed.system.markOptions.map(o => o.slug));
		const expected = { patriot: ["things-below"], antiquarian: ["makers"], "witch-hunter": ["fae", "things-below", "last-door"] };
		for (const bg of seeker.flags.stonetop.backgrounds) {
			const choice = bg.moveChoices.find(c => c.move === WELL_VERSED_MOVE);
			const got = (choice.value ? [choice.value] : choice.options).map(w => backgroundMarkOption(WELL_VERSED_MOVE, w));
			expect(got, bg.slug).toEqual(expected[bg.slug]);
			for (const slug of got) expect(slugs.has(slug)).toBe(true);
		}
	});

	it("names nothing for another move, an empty answer or an unknown wording", () => {
		expect(backgroundMarkOption("Polyglot", "the Fae")).toBeNull();
		expect(backgroundMarkOption(WELL_VERSED_MOVE, "")).toBeNull();
		expect(backgroundMarkOption(WELL_VERSED_MOVE, "cheese")).toBeNull();
		expect(backgroundMarkOption(WELL_VERSED_MOVE, "  THE FAE ")).toBe("fae");
	});
});
