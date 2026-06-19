import { KeepOnTop } from "../utils/keep-on-top.js";
import { openOrFocus } from "../utils/open-or-focus.js";
import { stonetopCardShell } from "../utils/chat.js";
import { escHtml } from "../utils/strings.js";
import { getPlayerCharacters } from "../utils/playbook-actors.js";
import { getSetting, setSetting } from "../settings.js";
import { broadcastSeasonsChange } from "../seasons/seasons-change-reminders.js";

const ANSWERS_SETTING = "springBurstAnswers";

// ── SpringBurstDialog ──────────────────────────────────────────────────────────
// A GM-only walkthrough of Book I's final "Getting Started" step, "Let spring
// burst forth" (Book I, p.32). It picks up where the guided Introductions leave
// off: find the most hopeful PC, make the season's first Seasons Change move, read
// the result for a plot hook, then wrap up the session. Step 3 wires the actual
// roll — 2d6 +Fortunes, which is +1 this first spring — and posts a result card to
// chat. Opened from step 5 of the WelcomeDialog (see templates/dialogs/welcome.hbs).

// Fortunes is +1 for this first spring (Book I, p.32: "roll +Fortunes (+1, in this
// case)"). Later seasons read it off the steading, but the first-session guide is
// always this opening roll.
const FIRST_SPRING_FORTUNES = 1;

// Spring's Seasons Change result lines, keyed by tier — the rules-as-written
// outcome shown on the chat card.
const _SPRING_RESULT = {
	success: { label: "10+", line: "Pick <strong>one seasonal gain</strong>." },
	partial: { label: "7&ndash;9", line: "Pick <strong>one seasonal gain</strong>, but a threat to the steading makes itself known or gets worse." },
	failure: { label: "6-",  line: "<strong>Threats abound</strong> &mdash; and don't mark XP." },
};

// The same three tiers, framed for the GM running the first session: you're
// fishing for a plot hook, not just any seasonal gain (Book I, p.32). The tier
// label ("10+" etc.) comes from _SPRING_RESULT so it's only written once.
const _OMEN_TIERS = [
	{
		key:  "success",
		text: "Pick a gain that hands you a <strong>hook</strong>: <strong>Interesting news</strong>, <strong>Valuable insight</strong>, or a <strong>Trade opportunity</strong>. (Tor's blessing, an unexpected bounty, and the like don't give you one.)",
	},
	{
		key:  "partial",
		text: "They pick whatever gain they like &mdash; you'll pair it with a <strong>threat</strong> to the steading to build your starting situation.",
	},
	{
		key:  "failure",
		text: "Chuckle grimly and <strong>start thinking about threats</strong>.",
	},
];

// Linear walkthrough. `body` is rendered as HTML; `icon` is a Font Awesome class.
const _STEPS = [
	{
		key:   "spring",
		title: "Spring bursts forth",
		icon:  "fa-seedling",
		body:  `<p>The introductions are done and the maps are marked. Tell the players that <strong>spring has just broken forth upon the land</strong> &mdash; the snows recede, the soil softens, and Stonetop stirs to life.</p>
				<p>This last step turns everything they've given you into the seed of your first adventure.</p>`,
	},
	{
		key:   "hopeful",
		title: "Who is the most hopeful?",
		icon:  "fa-face-smile",
		body:  `<p>Ask the players to decide, together, <strong>whose character is the most hopeful</strong>. That character makes this season's roll.</p>`,
		qa:    {
			kind:        "single",
			key:         "hopeful",
			prompt:      "Who is the most hopeful?",
			placeholder: "Name the character (and why, if you like)…",
		},
	},
	{
		key:     "roll",
		title:   "Make the Seasons Change move",
		icon:    "fa-dice",
		showRoll: true,
		body:    `<p>The most hopeful character makes the <strong>Seasons Change</strong> move (under <em>Homefront Moves</em> on the Moves &amp; Gear handout): they <strong>roll +Fortunes</strong>. This first spring, Fortunes is <strong>+1</strong>.</p>`,
	},
	{
		key:      "omen",
		title:    "Read the omen",
		icon:     "fa-scroll",
		showTiers: true,
		body:     `<p>You're looking for a <strong>plot hook</strong> &mdash; something to kick off the first adventure.</p>`,
		qa:       {
			kind:        "single",
			key:         "gain",
			prompt:      "Which seasonal gain did they take &mdash; and what's the hook?",
			placeholder: "Note the gain and the thread it opens…",
		},
	},
	{
		key:   "wrap",
		title: "Resist the urge",
		icon:  "fa-hourglass-half",
		body:  `<p>Make a note of the result and update the steading playbook if needed. Then <strong>start to wrap up</strong>.</p>
				<p>It'll be tempting to leap into character and start playing right away &mdash; <strong>don't</strong>. Give yourself time to mull over everything the players handed you and to prepare the first expedition.</p>`,
	},
	{
		key:   "question",
		title: "One last question",
		icon:  "fa-comment-dots",
		body:  `<p>Before everyone goes, ask each player:</p>
				<blockquote>What excites you the most about playing your character?</blockquote>
				<p>Whatever they tell you, <strong>write it down</strong> &mdash; and try to work it into the first adventure.</p>`,
		qa:    {
			kind:        "perPc",
			key:         "excites",
			prompt:      name => `What excites you most about playing <strong>${name}</strong>?`,
			placeholder: "What they told you…",
			empty:       "Create your characters first to record this per character.",
		},
	},
	{
		key:     "after",
		title:   "After the session",
		icon:    "fa-feather",
		isFinal: true,
		body:    `<p>Once you've broken up for the night, turn the evening's notes into your first adventure:</p>
				<ul>
					<li><strong>Organize your notes</strong> &mdash; record each NPC you established (with an occupation, ties, and maybe a trait) in the steading's Residents and Notable Neighbors.</li>
					<li><strong>Build a timeline</strong> of the events the players established, oldest to newest, and reconcile any contradictions.</li>
					<li><strong>Identify threats</strong> &mdash; the sources of trouble lurking in those notes.</li>
					<li>Keep an <strong>&ldquo;I wonder&hellip;&rdquo;</strong> list of open questions to answer in play.</li>
					<li><strong>Plan the first adventure</strong> from your threats, that &ldquo;I wonder&hellip;&rdquo; list, and the Seasons Change result.</li>
				</ul>`,
	},
];

export class SpringBurstDialog extends Application {
	constructor(options = {}) {
		super(options);
		this._step      = 0;
		this._roll      = null;
		this._keepOnTop = new KeepOnTop(this);
	}

	static open() {
		return openOrFocus("stonetop-spring-burst", () => new SpringBurstDialog().render(true));
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-spring-burst",
			title:     "Let Spring Burst Forth",
			template:  "systems/stonetop_pwd/templates/dialogs/spring-burst.hbs",
			width:     520,
			height:    "auto",
			resizable: false,
			classes:   ["stonetop", "stonetop-spring-dialog"],
		});
	}

	async _render(force, options) {
		await super._render(force, options);
		this._keepOnTop.apply();
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._keepOnTop.start();
		html.find(".stonetop-spring-roll-btn").on("click", () => this._rollSeasons());
		html.find(".stonetop-spring-back").on("click", () => this._retreat());
		html.find(".stonetop-spring-next").on("click", () => this._advance());
		html.find(".stonetop-spring-done").on("click", () => this.close());
		// Save answers on blur/change so the textarea keeps focus while typing.
		html.find(".stonetop-spring-qa-answer").on("change", ev => {
			const el = ev.currentTarget;
			this._saveAnswer(el.dataset.answerKey, el.value, el.dataset.answerId);
		});
	}

	async close(options = {}) {
		this._keepOnTop.stop();
		return super.close(options);
	}

	getData() {
		const step = _STEPS[this._step];
		return {
			step,
			stepIndex: this._step + 1,
			stepCount: _STEPS.length,
			stepLabel: `Step ${this._step + 1} of ${_STEPS.length}`,
			isFirst:   this._step === 0,
			isLast:    !!step.isFinal,
			showRoll:  !!step.showRoll,
			roll:      step.showRoll ? this._roll : null,
			showTiers: !!step.showTiers,
			tiers:     step.showTiers
				? _OMEN_TIERS.map(t => ({ ...t, label: _SPRING_RESULT[t.key].label, isActive: this._roll?.tier === t.key }))
				: null,
			qa:        this._qaContext(step.qa),
		};
	}

	// The persisted answers blob, keyed by question. Reads the world setting fresh
	// each render so navigating Back/Next shows whatever the GM has already typed.
	_answers() {
		return getSetting(ANSWERS_SETTING) ?? {};
	}

	// Build the current step's Q&A field(s) for the template. `single` is one
	// prompt + stored answer; `perPc` is one row per player character (answers
	// stored by actor id), mirroring the journal Q&A lists.
	_qaContext(qa) {
		if (!qa) return null;
		const all = this._answers();
		if (qa.kind === "perPc") {
			const stored = all[qa.key] ?? {};
			const rows = getPlayerCharacters().map(pc => ({
				id:     pc.id,
				prompt: qa.prompt(escHtml(pc.name)),
				answer: stored[pc.id] ?? "",
			}));
			return { kind: "perPc", key: qa.key, placeholder: qa.placeholder, rows, empty: rows.length ? "" : qa.empty };
		}
		return { kind: "single", key: qa.key, prompt: qa.prompt, placeholder: qa.placeholder, answer: all[qa.key] ?? "" };
	}

	// Persist one answer without re-rendering (so the textarea keeps focus). `id`
	// is set for per-PC answers (nested under the question key by actor id).
	async _saveAnswer(key, value, id) {
		if (!key) return;
		const all = { ...this._answers() };
		if (id) {
			all[key] = { ...(all[key] ?? {}), [id]: value };
		} else {
			all[key] = value;
		}
		await setSetting(ANSWERS_SETTING, all);
	}

	// Roll 2d6 +Fortunes for Seasons Change, remember the tier (so the "Read the
	// omen" step can highlight the matching outcome), and post a result card to
	// chat. Re-rollable — the latest roll wins.
	async _rollSeasons() {
		if (!globalThis.Roll) return;
		const roll = await new Roll(`2d6 + ${FIRST_SPRING_FORTUNES}`).evaluate();
		const tier = roll.total >= 10 ? "success" : roll.total >= 7 ? "partial" : "failure";
		this._roll = { total: roll.total, tier, label: _SPRING_RESULT[tier].label };

		await roll.toMessage({
			speaker: { alias: "Seasons Change — Spring" },
			flavor:  stonetopCardShell(this._springCardBody(roll.total, tier), "stonetop-spring-card"),
		});
		// First spring is still a Seasons Change move — remind players carrying a
		// seasonal move/possession (e.g. The Blessed's Rites of the Land).
		broadcastSeasonsChange("spring");
		this.render(false);
	}

	_springCardBody(total, tier) {
		const result = _SPRING_RESULT[tier];
		return `<div class="card-content stonetop-spring-roll">
			<div class="stonetop-spring-roll-head">
				<span class="stonetop-spring-roll-total stonetop-spring--${tier}">${total}</span>
				<span class="stonetop-spring-roll-tier">${result.label}</span>
			</div>
			<p class="stonetop-spring-roll-line">${result.line}</p>
		</div>`;
	}

	_advance() {
		if (this._step < _STEPS.length - 1) {
			this._step++;
			this.render(false);
		}
	}

	_retreat() {
		if (this._step > 0) {
			this._step--;
			this.render(false);
		}
	}
}
