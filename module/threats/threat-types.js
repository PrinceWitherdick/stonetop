// The eight Stonetop threat types (Book I, "Threats", pp. 284-287) plus the
// three proximity trackers (p. 288). Each type carries a one-line nature blurb,
// a muted accent hue (used only as a thin card tick + the type chip, keeping the
// card monochrome/ink like the book), and the canned list of suggested GM moves
// that the guided creator offers as a checklist. This is the single source of
// truth for the type ids used across the page model, the sheet, and the creator
// — the analogue of IMPROVEMENT_DEFINITIONS for improvements.

export const THREAT_TYPES = [
	{
		id: "affliction",
		label: "Affliction",
		blurb: "A behavior, circumstance, or condition that makes people suffer or fret.",
		accent: "#6b6152",
		suggestedMoves: [
			"Worsen or quicken",
			"Spread to others, suck others in",
			"Mutate, take on a new form or aspect",
			"Eat away at something or someone",
			"Strip someone of honor or dignity",
			"Drive someone to desperation",
			"Justify selfishness, neglect",
			"Drive a wedge between people",
			"Cause delusion, stubbornness, foolishness",
			"Sow panic or despair",
			"Trigger shortages, hoarding",
			"Prompt violence, hatred, blame",
		],
	},
	{
		id: "beast",
		label: "Beast",
		blurb: "A monster, animal, or person driven by basic need and instinct.",
		accent: "#6a5a3f",
		suggestedMoves: [
			"Show up where it's not wanted",
			"Stalk or pursue prey",
			"Protect its home or family",
			"Make a show of strength, aggression",
			"Build or expand a nest, den, or lair",
			"Modify its environment",
			"Flee or panic or rage",
			"Consume something (or someone)",
			"Grow or diminish, in size or numbers",
		],
	},
	{
		id: "institution",
		label: "Institution",
		blurb: "A group or position that holds power within a community.",
		accent: "#4f5b63",
		suggestedMoves: [
			"Sway public opinion",
			"Put someone in their place",
			"Change a rule, law, or custom",
			"Acquire leverage, resources, influence",
			"Denounce something or someone",
			"Support a course of action",
			"Recruit new members or minions",
			"Squabble amongst themselves",
			"Change leadership",
			"Negotiate a deal or treaty",
			"Send someone else to do their dirty work",
		],
	},
	{
		id: "macguffin",
		label: "MacGuffin",
		blurb: "An object, place, or secret that stirs up conflict.",
		accent: "#7a6a3d",
		suggestedMoves: [
			"Reveal a secret",
			"Draw attention to itself",
			"Point to something else",
			"Generate envy, fear, discord",
			"Weigh heavily, become a burden",
			"Be the target of theft",
			"Go missing",
			"Perform its function, heedlessly",
			"Fail at the worst possible moment",
			"Leave its mark on someone or something",
			"Become something greater, or lesser",
		],
	},
	{
		id: "magicalEntity",
		label: "Magical entity",
		blurb: "A spirit, Fae, or power that lives and breathes magic.",
		accent: "#55506f",
		suggestedMoves: [
			"Spy on someone, unseen or from afar",
			"Sense powerful longings, emotions",
			"Appear in glimpses, dreams, visions",
			"Offer service, secrets, power",
			"Demand an oath or sacrifice",
			"Lay a curse",
			"Twist a bargain to its favor",
			"Send forth minions to do its bidding",
			"Shape its environs, per its nature",
			"Pursue alien goals",
			"Foster rivalries with similar powers",
			"Grow or diminish in strength",
		],
	},
	{
		id: "rabble",
		label: "Rabble",
		blurb: "A group united by emotion, blood, or circumstance, not common purpose.",
		accent: "#6b5548",
		suggestedMoves: [
			"Grow or gather in numbers",
			"Claim territory or resources",
			"Fall under a (new) leader's sway",
			"Undergo internal turmoil",
			"Make a show of strength, numbers",
			"Declare an enemy or an alliance",
			"Turn on one of their own",
			"Overwhelm a position or a weaker group",
			"Despoil, loot, pillage, burn",
			"Refuse to be controlled or contained",
			"Disperse, scatter, flee",
		],
	},
	{
		id: "villain",
		label: "Villain",
		blurb: "An individual with the ruthlessness and power to make life awful.",
		accent: "#6e3b3b",
		suggestedMoves: [
			"Grasp power, recklessly",
			"Gain followers or allies",
			"Find someone's weakness",
			"Make an offer, with strings attached",
			"Demand concessions, obedience, or respect",
			"Make threats, veiled or not",
			"Outmaneuver their enemies",
			"Attack cautiously, holding reserves",
			"Attack ruthlessly, with little warning",
			"Reveal preparations made in advance",
			"Sacrifice another to advance a goal",
			"Betray an ally or a trust",
			"Take a prisoner",
			"Do the unthinkable",
		],
	},
	{
		id: "wildcard",
		label: "Wildcard",
		blurb: "An individual who causes trouble because they're a mystery.",
		accent: "#4b6157",
		suggestedMoves: [
			"Aggressively pursue their instinct",
			"Show their worth, or lack thereof",
			"Display the contents of their heart",
			"Provide advice or aid, wanted or not",
			"Reveal a secret, or keep one closely",
			"Draw attention to themselves or others",
			"Appear unannounced",
			"Act strangely (for them)",
			"Bear witness",
			"Tell stories, true or not",
			"Make, keep, break, or demand a promise",
			"Force an issue or a confrontation",
			"Stand resolute and refuse to budge",
		],
	},
];

/** The three proximity trackers a threat can be pinned to (Book I p. 288). */
export const THREAT_PROXIMITIES = [
	{ id: "homefront", label: "Homefront", hint: "In or right around Stonetop." },
	{ id: "nearby", label: "Nearby", hint: "Within a couple days' travel of home." },
	{ id: "distant", label: "Distant", hint: "Anything further than that." },
];

export const THREAT_TYPE_IDS = THREAT_TYPES.map(t => t.id);
export const THREAT_PROXIMITY_IDS = THREAT_PROXIMITIES.map(p => p.id);

// The single source of truth for "what a threat defaults to" — used by the model's
// `initial`, the resolver fallbacks below, and every seed/getData path, so the layers
// can't disagree about the default.
export const DEFAULT_THREAT_TYPE = "villain";
export const DEFAULT_PROXIMITY = "nearby";

const _TYPE_BY_ID = new Map(THREAT_TYPES.map(t => [t.id, t]));
const _PROXIMITY_BY_ID = new Map(THREAT_PROXIMITIES.map(p => [p.id, p]));

/** Resolve a type definition by id, falling back to the default (villain). */
export function threatType(id) {
	return _TYPE_BY_ID.get(id) ?? _TYPE_BY_ID.get(DEFAULT_THREAT_TYPE);
}

export function threatProximity(id) {
	return _PROXIMITY_BY_ID.get(id) ?? _PROXIMITY_BY_ID.get(DEFAULT_PROXIMITY);
}
