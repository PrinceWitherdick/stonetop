// The GM's agenda and principles, from Book I "Running the Game" (agenda p.168, principles
// pp.192-199). The free GM playbook prints both as bare lists on the same spread as the move
// lists, which is why they belong on the Moves tab and not in a journal somewhere: a GM who is
// looking at "what now?" is one glance away from "and what am I here to do?".
//
// The AGENDA is three goals and no more. The book is emphatic about that ("Everything you say
// and do as the GM is meant to support these three goals, and no others"), so the three carry
// their whole paragraph rather than a gist: they are the test a GM applies to everything else on
// this sheet, and a three-word reminder cannot be applied to anything.
//
// The PRINCIPLES are thirteen, and each has a two-page section behind it. What is transcribed
// here is the operative sentence of each, in the book's own words, plus its page. Thirteen full
// sections would be a chapter, and a chapter is what the book is for; this is the shape a
// playbook prints, which is the list plus enough to remember what the entry meant.
//
// Same transcription rules as gm-moves.js: the book's wording, curly quotes normalized to ASCII,
// cross-references dropped where the sentence stands without them, nothing reworded.

/** @typedef {{ name: string, page: number, detail: string[] }} GmAgendaGoal */

/** The three goals, Book I p.168. Everything the GM does is meant to serve these and no others. */
export const GM_AGENDA = [
	{
		name: "Portray a rich and mysterious world",
		page: 168,
		detail: [
			"Alive and breathing, filled with detail and humanity and depth. Mundane concerns, crops, trade, weather, the opinions of your neighbors, are important. Fantastic elements are important, too, but they are strange and scary and poorly understood. The past sleeps unquietly. Questions abound.",
		],
	},
	{
		name: "Punctuate the characters' lives with adventure",
		page: 168,
		detail: [
			"The PCs have lives to live, homes to take care of, families to feed. They have demands on their time. Your job is to make that stuff matter, but also to interrupt it with threats and opportunities that only the PCs can (or will) address. Adventures will occupy the bulk of the players' time, but they shouldn't occupy the bulk of the characters' time.",
		],
	},
	{
		name: "Play to find out what happens",
		page: 168,
		detail: [
			"It's your job to portray a rich and mysterious world, to threaten that which the PCs care about or dangle opportunities, and then to see where things go from there. You'll make plans, yes. You'll make preparations. But once play begins, it's your job to follow where the players lead, where the dice lead, and where the fiction leads.",
			"And the reward is this: to be genuinely surprised by the story that, naturally, organically, magically, unfolds. A tale you could never weave by yourself.",
		],
	},
];

/**
 * The test the book asks a GM to apply, printed under the three goals (p.168). Kept with them
 * because the goals are not a mission statement without it.
 */
export const GM_AGENDA_TEST = "When in doubt, ask yourself: this thing you're considering doing, which of these three goals does it support? If the answer is \"none of them,\" then don't do it. Do something else.";

/** @typedef {{ name: string, page: number, gist: string }} GmPrinciple */

/** The thirteen principles, in the book's order (pp.192-199). */
export const GM_PRINCIPLES = [
	{
		name: "Follow the rules",
		page: 192,
		gist: "When a move is triggered, follow the procedures in the move and say what the move requires of you. Give the players the full benefits of their moves and their rolls. And you don't get to invoke a player move unless its trigger is actually met.",
	},
	{
		name: "Begin and end with the fiction",
		page: 193,
		gist: "If you can't picture what the character is actually doing, ask questions and clarify before going to the dice. After the dice are rolled, describe what that looks like (or ask the player to). Fiction, then rules, then back to fiction. Always.",
	},
	{
		name: "Address the characters, not the players",
		page: 193,
		gist: "Ask the characters what they do. Tell the characters what they see and hear. Tell the characters what's obvious to them.",
	},
	{
		name: "Ask questions and build on the answers",
		page: 194,
		gist: "Ask questions all the time, all over the place. Reincorporate their answers into the fiction, right away or later on. Carry on as if that answer has always been a true and obvious part of the established world.",
	},
	{
		name: "Be a fan of the player characters",
		page: 195,
		gist: "The PCs are the protagonists of the story. Root for them. Celebrate their victories. Lament their losses. That doesn't mean letting them do whatever they want: you're the author of their adversity.",
	},
	{
		name: "Embrace the fantastic and the mundane",
		page: 196,
		gist: "Contrast the fantastic and the mundane against each other. If an adventure revolves around a supernatural threat, include perfectly mundane challenges too. If a session is mostly mundane concerns, sprinkle in some fantastic elements.",
	},
	{
		name: "Exploit the setting guide",
		page: 196,
		gist: "Use the established setting to inspire, but don't feel beholden to it. If your players give you something that contradicts it, don't negate their input just because the book says so. The book isn't the authority, it's a resource for you to exploit.",
	},
	{
		name: "Respect your prep",
		page: 197,
		gist: "A lot of your prep involves real, binding decisions about how the world is. That type of prep is part of the fiction already, even if you haven't yet revealed it. During play, respect it. Treat it as fictional truth.",
	},
	{
		name: "Give your characters life",
		page: 197,
		gist: "Name your NPCs. Give them distinct personalities. Wants, needs, and quirks. Describe them with memorable traits: players will forget the smith is named Taliesen, but they'll remember he's a big loud guy with a shock of white hair.",
	},
	{
		name: "Think offscreen, too",
		page: 198,
		gist: "What are your NPCs and monsters doing? What have they done? What traces did they leave? Think, too, about what the PCs are doing and how it would shape off-screen events. Weave the answers into what you say.",
	},
	{
		name: "Bring it home",
		page: 198,
		gist: "Make the village of Stonetop itself the foundation of your game, the beginning and end of the PCs' adventures. Show how their neighbors react when they leave, and what has happened while they were gone.",
	},
	{
		name: "Let things breathe",
		page: 199,
		gist: "Allow stretches of time to pass between adventures, or even between individual moves. Zoom in and frame a scene only when the fiction calls for immediate, specific action; zoom back out as soon as that's over.",
	},
	{
		name: "Let things burn",
		page: 199,
		gist: "Protect no one and nothing. Threaten the things the characters love, and if they fail to save them, follow through. Be okay with hard, irrevocable consequences. Play with fire. Let things burn.",
	},
];
