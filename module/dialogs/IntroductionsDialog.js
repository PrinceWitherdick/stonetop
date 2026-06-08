import { KeepOnTop } from "../utils/keep-on-top.js";

// ── Playbook-specific introduction data ────────────────────────────────────────

const _PLAYBOOK_DATA = {
	"the-blessed": {
		step3: `describe your <strong>sacred pouch</strong> and its remarkable trait. Then, tell us about <strong>Danu's shrine</strong> in Stonetop and how she is worshipped.`,
		step4: [
			"Who is your closest kin?",
			"Whose heart &amp; soul is entwined with yours?",
			"Who taught you the secret ways?",
			"Who is beloved by the goddess, your charge to nurture, guide, protect, or heal?",
		],
		step6: [
			"Which one of you do the spirits whisper of?",
			"Which one of you has joined me in a sacred rite?",
			"Which one of you has made a blood-oath with me?",
			"Which one of you doubts the power of Danu?",
		],
	},
	"the-fox": {
		step3: `tell us your <strong>tall tales</strong>. Feel free to embellish and exaggerate to the other players, but always answer the GM truthfully.`,
		step4: [
			"Who is your closest kin?",
			"Who holds the reins to your heart?",
			"Whose respect means the world to you?",
			"To whom do you owe a debt that cannot be repaid?",
		],
		step6: [
			"Which one of you joined me in my latest hijinx?",
			"Which one of you brings your problems to me?",
			"Which one of you saved my bacon, mor'n once?",
			"Which one of you trusts me not one bit?",
		],
	},
	"the-heavy": {
		step3: `tell us about your <strong>history of violence</strong>, and what keeps you up at night.`,
		step4: [
			"Who is your closest kin?",
			"Who is your lover, spouse, or betrothed?",
			"Who most needs or deserves your protection?",
			"Whose forgiveness do you strive to earn?",
		],
		step6: [
			"Which one of you once dragged me home, bleeding and unconscious?",
			"Which one of you can I trust to always have my back?",
			"Which one of you has stayed my hand?",
			"Which one of you has traded blows with me?",
		],
	},
	"the-judge": {
		step3: `describe <strong>the Chronicle</strong>. Then, tell us about <strong>Aratis and her shrine</strong>, and what she demands of her true disciples.`,
		step4: [
			"Who is your closest kin?",
			"Who is your lover, spouse, or betrothed?",
			"Who is your apprentice?",
			"Who is the wisest of the town elders?",
		],
		step6: [
			"Which one of you is a true disciple of Aratis?",
			"Which one of you is my closest confidant?",
			"Which one of you has stood beside me in battle against unnatural chaos?",
			"Against which of you have I passed judgement?",
		],
	},
	"the-lightbearer": {
		step3: `<strong>praise the day!</strong> Tell us of <strong>Helior</strong>, his worship and his shrine. Tell us, too, of the prior Lightbearer and how you gained your powers.`,
		step4: [
			"Who is your closest kin?",
			"Who fans the flames of your heart?",
			"Whose kindness and generosity warm your soul?",
			"Who needs Helior's light, badly?",
		],
		step6: [
			"Which one of you is an old and dear friend?",
			"Which one of you shares my faith?",
			"Which one of you scoffs at mercy and hope?",
			"Which one of you will need my guidance soon?",
		],
	},
	"the-marshal": {
		step3: `tell us <strong>the town's war stories</strong>, plus the answers to the questions you chose.`,
		step4: [
			"Who is your closest kin?",
			"Who is your lover, spouse, or betrothed?",
			"Who is your lieutenant?",
			"Whose kin is dead because of your decisions?",
		],
		step6: [
			"Which one of you is or was part of my crew?",
			"Which one of you have I promised to keep safe?",
			"Which one of you do I still have doubts about?",
			"Which one of you ignored my orders and got someone killed?",
		],
	},
	"the-ranger": {
		step3: `tell us <strong>what you're worried about</strong> (see "Something wicked this way comes" on your playbook).`,
		step4: [
			"Who is your closest kin?",
			"To whom do you always return home?",
			"Who would be lost without you?",
			"Who has much to learn from you?",
		],
		step6: [
			"Which one of you fears the wider world?",
			"Which one of you has shown me great beauty?",
			"Which one of you have I caught sometimes staring out at the horizon?",
			"Which one of you lacked the stomach to put something out of its misery?",
		],
	},
	"the-seeker": {
		step3: `describe your <strong>major arcana</strong>. Tell us your answers to the questions you chose. Then, tell us about your <strong>minor arcana</strong>, too.`,
		step4: [
			"Who is your closest kin?",
			"Who is your spouse, lover, or betrothed?",
			"Whom do you trust, even more than yourself?",
			"Whom do you secretly watch over, and why?",
		],
		step6: [
			"Which one of you led me to a key discovery?",
			"Which one of you has been at my side the entire way?",
			"Which one of you most fears the path I tread?",
			"Which one of you is keeping secrets from me?",
		],
	},
	"the-would-be-hero": {
		step3: `tell us of your <strong>fear &amp; anger</strong>, and of the last time they caused you trouble.`,
		step4: [
			"Whose heart do you hope to win?",
			"Who is counting on you?",
			"Who quietly understands the path you are on?",
			"Who do you intend to prove wrong?",
		],
		step6: [
			"Which one of you is my closest, truest friend?",
			"Which one of you believes in me, despite it all?",
			"Which one of you has promised to teach me?",
			"Which one of you have I hurt, through what I have done or what I've failed to do?",
		],
	},
};

// ── Phase definitions ─────────────────────────────────────────────────────────
// Index matches round number (1-8). Index 0 unused (phase 0 = pre-check).

const _PHASES = [
	null,
	{
		roundRobin: true,
		getInstruction: () => `On your <strong>first turn</strong>, <strong>introduce yourself</strong>: your name, pronouns, background, origin, and appearance.`,
		getQuestions:   () => null,
	},
	{
		roundRobin: true,
		getInstruction: () => `On your <strong>second turn</strong>, <strong>describe your special possessions</strong> and how you contribute to the village (beyond working the fields).`,
		getQuestions:   () => null,
	},
	{
		roundRobin: true,
		getInstruction: (pc) => {
			const d = _PLAYBOOK_DATA[_slug(pc)];
			return d
				? `On your <strong>third turn</strong>, ${d.step3}`
				: `On your <strong>third turn</strong>, tell us something about your character and their place in Stonetop.`;
		},
		getQuestions: () => null,
	},
	{
		roundRobin: true,
		getInstruction: () => `On your <strong>next turn</strong>, <strong>answer one of the following</strong>, naming one or more NPCs who live in Stonetop.`,
		getQuestions:   (pc) => _PLAYBOOK_DATA[_slug(pc)]?.step4 ?? null,
	},
	{
		roundRobin: true,
		getInstruction: () => `<strong>Go around again.</strong> Answer another question from round 4, or pass. When everyone has passed, go on.`,
		getQuestions:   (pc) => _PLAYBOOK_DATA[_slug(pc)]?.step4 ?? null,
	},
	{
		roundRobin: true,
		getInstruction: () => `On your <strong>next turn</strong>, <strong>ask your fellow PCs one of these</strong>. When others ask you, answer as you like.`,
		getQuestions:   (pc) => _PLAYBOOK_DATA[_slug(pc)]?.step6 ?? null,
	},
	{
		roundRobin: true,
		getInstruction: () => `<strong>Go around again.</strong> Ask another question from round 6, or pass. When everyone has passed, go on.`,
		getQuestions:   (pc) => _PLAYBOOK_DATA[_slug(pc)]?.step6 ?? null,
	},
	{
		roundRobin: false,
		getInstruction: () => `<strong>Add your home</strong> to the steading playbook. When everyone is done, <strong>let spring break forth!</strong>`,
		getQuestions:   () => null,
	},
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function _slug(actor) {
	return actor?.system?.playbook?.slug
		?? actor?.items?.find?.(i => i.type === "playbook")?.system?.slug
		?? "";
}

function _iconPath(slug) {
	return slug
		? `/systems/stonetop_pwd/assets/icons/playbooks/${slug.replace(/-/g, "_")}_icon.webp`
		: null;
}

function _getAllPlayerActors() {
	return (game.actors?.contents ?? []).filter(a => a.type === "character" && a.hasPlayerOwner);
}

function _getCombatPcs() {
	if (!game.combat?.combatants?.size) return [];
	const seen = new Set();
	const pcs  = [];
	for (const c of game.combat.combatants) {
		const actor = c.actor;
		if (actor?.type === "character" && actor.hasPlayerOwner && !seen.has(actor.id)) {
			seen.add(actor.id);
			pcs.push(actor);
		}
	}
	return pcs;
}

// ── IntroductionsDialog ───────────────────────────────────────────────────────

export class IntroductionsDialog extends Application {
	constructor(options = {}) {
		super(options);
		this._phase       = 0;
		this._pcIndex     = 0;
		this._pcs         = [];
		this._keepOnTop   = new KeepOnTop(this);
		this._combatHooks = null;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-introductions",
			title:     "Character Introductions",
			template:  "systems/stonetop_pwd/templates/dialogs/introductions.hbs",
			width:     520,
			height:    "auto",
			resizable: false,
			classes:   ["stonetop", "stonetop-introductions"],
		});
	}

	async _render(force, options) {
		await super._render(force, options);
		this._keepOnTop.apply();
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._keepOnTop.start();
		html.find(".stonetop-intros-begin").on("click", () => this._begin());
		html.find(".stonetop-intros-next").on("click",  () => this._advance());
		html.find(".stonetop-intros-back").on("click",  () => this._retreat());
		html.find(".stonetop-intros-close").on("click", () => this.close());
		this._registerCombatHooks();
	}

	_registerCombatHooks() {
		if (this._combatHooks) return;
		const refresh = () => { if (this._phase === 0) this.render(false); };
		this._combatHooks = [
			["createCombat",    Hooks.on("createCombat",    refresh)],
			["deleteCombat",    Hooks.on("deleteCombat",    refresh)],
			["createCombatant", Hooks.on("createCombatant", refresh)],
			["deleteCombatant", Hooks.on("deleteCombatant", refresh)],
		];
	}

	_unregisterCombatHooks() {
		if (!this._combatHooks) return;
		for (const [name, id] of this._combatHooks) Hooks.off(name, id);
		this._combatHooks = null;
	}

	async close(options = {}) {
		this._unregisterCombatHooks();
		this._keepOnTop.stop();
		return super.close(options);
	}

	getData() {
		const allPcs    = _getAllPlayerActors();
		const combatPcs = _getCombatPcs();
		const combatIds = new Set(combatPcs.map(a => a.id));
		const missing   = allPcs.filter(a => !combatIds.has(a.id));

		if (this._phase === 0) {
			return {
				isPreCheck: true,
				canBegin:   combatPcs.length > 0 && missing.length === 0,
				hasNone:    combatPcs.length === 0,
				hasMissing: missing.length > 0,
				missingPcs: missing.map(a => a.name),
				pcNames:    combatPcs.map(a => a.name),
				pcCount:    combatPcs.length,
			};
		}

		const pcs   = this._pcs;
		const phase = _PHASES[this._phase];
		const actor = phase.roundRobin ? (pcs[this._pcIndex] ?? null) : null;

		let currentPc = null;
		if (phase.roundRobin && actor) {
			const slug = _slug(actor);
			currentPc = {
				name:         actor.name,
				playbookName: actor.system?.playbook?.name ?? "",
				icon:         _iconPath(slug),
				index:        this._pcIndex + 1,
				total:        pcs.length,
			};
		}

		const instruction = phase.getInstruction(actor);
		const questions   = phase.getQuestions(actor);
		const isLastPc    = !phase.roundRobin || this._pcIndex >= pcs.length - 1;
		const isDone      = this._phase === 8 && isLastPc;

		return {
			isPreCheck:    false,
			phase:         this._phase,
			currentPc,
			instruction,
			questions,
			hasQuestions:  !!(questions?.length),
			stepLabel:     `Round ${this._phase} of 8`,
			isPrevDisabled: this._phase === 1 && this._pcIndex === 0,
			isDone,
		};
	}

	_begin() {
		this._pcs     = _getCombatPcs();
		this._phase   = 1;
		this._pcIndex = 0;
		this.render(false);
	}

	_advance() {
		const phase = _PHASES[this._phase];
		if (phase?.roundRobin && this._pcIndex < this._pcs.length - 1) {
			this._pcIndex++;
		} else if (this._phase < 8) {
			this._phase++;
			this._pcIndex = 0;
		}
		this.render(false);
	}

	_retreat() {
		if (this._phase === 0) return;
		const phase = _PHASES[this._phase];
		if (phase?.roundRobin && this._pcIndex > 0) {
			this._pcIndex--;
		} else if (this._phase > 1) {
			this._phase--;
			const prev = _PHASES[this._phase];
			this._pcIndex = prev.roundRobin ? this._pcs.length - 1 : 0;
		} else {
			// Back to pre-check from round 1, first PC
			this._phase   = 0;
			this._pcIndex = 0;
		}
		this.render(false);
	}
}
