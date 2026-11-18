// The GM's chat cards at `ready`: the one-time greeting, the book-art nudges and offers, the
// optional-module suggestions and the Destined omen reminder. Called from onReady
// (hooks/Ready.js), GM clients only.

import { getSetting, setSetting } from "../settings.js";
import { stonetopChatCard, whisperGm } from "../utils/chat.js";
import { bestEffort } from "../utils/best-effort.js";
import { pastWelcomeGuide } from "../dialogs/walkthrough-resume.js";
import { hasImportedBook2Art } from "../book2-art/reapply.js";
import { offerDurableArtOnce } from "../book2-art/offer-once.js";
import { postFxMasterSuggestionOnce } from "../seasons/fxmaster-suggestion.js";
import { postAttackFxSuggestionOnce } from "../combat/attack-fx-suggestion.js";
import { remindDestinedOmenRoll } from "./StonetopSingleton.js";

/**
 * Post every card this load owes the GM, in the order a world owed several should read them.
 * The latched ones each post at most once per world, so most loads post nothing.
 */
export async function postStartupCards() {
	// Read BEFORE the greeting is posted: afterwards every world has had it, and the attack
	// effects card below is only for a world greeted before the greeting named its modules.
	const greeted = !!getSetting("startupWelcomeShown");
	await _postStartupWelcomeMessageOnce();
	await _postBook2ArtReminderOnce();
	// After the art reminder, and for the same reason it is ordered where it is: both are
	// once-per-world nudges held until the GM is past the Welcome guide, and a world owed
	// both should read about its missing pictures before it reads about optional weather.
	// Caught rather than awaited bare: everything below this point in the sweep matters more
	// than a suggestion about an optional module, so a failed post must not take it with it.
	await bestEffort("FXMaster suggestion", postFxMasterSuggestionOnce);
	await bestEffort("attack effects suggestion", () => postAttackFxSuggestionOnce({ greeted }));
	// Background, like the world-setup seeds. This one has to BROWSE the art folder before it
	// can tell there is nothing to offer, and it deliberately leaves its flag unset when
	// the plan is empty so a later import still gets the nudge — so for a GM who never
	// imports, an awaited call stalls the ready sequence on a server round-trip whose
	// answer is always "nothing", on every single load. Nothing below waits on it.
	_offerBookArtRebuildOnce()
		.catch(err => console.error("Stonetop | portrait rebuild offer failed:", err));
	// Backgrounded for the same reason, and it browses the very same folder. Ordered after
	// the rebuild offer so a world owed both is asked about the free one first: cutting
	// portraits from art already on disk costs the GM nothing, while this one asks them to
	// go and find their PDFs.
	_offerPartialArtImportOnce()
		.catch(err => console.error("Stonetop | partial art import offer failed:", err));
	// Backgrounded and folder-browsing like the two above, and ordered LAST of the three on
	// purpose: it is the only one that is not about a gap. The rebuild fixes pictures the GM
	// is owed for free, the partial import fixes ones that failed; this one offers to improve
	// art that is already there and already looks fine, so it yields to both.
	_offerGmPlaybookArtOnce()
		.catch(err => console.error("Stonetop | GM playbook art offer failed:", err));
	await remindDestinedOmenRoll();
}

// Nudge a GM who is past the first-session Welcome guide but has never imported the book
// art: whisper the "you can import your images" card once, with a button that launches the
// Import Book Art macro. Gated so it never interrupts a fresh world — while the guide still
// auto-opens, its own "Import the book art" step is where this belongs — and never nags a GM
// who already imported: art lives OUTSIDE the world, so a GM who imported in another world
// already has it here (reapply re-points it) and skips straight to marking this resolved.
// Resolves exactly once, then the flag stops it re-checking.
async function _postBook2ArtReminderOnce() {
	if (getSetting("book2ArtReminderShown")) return;
	// Hold off until the Welcome guide has stopped auto-opening — the GM finished session
	// zero or ticked "Don't show this again". Mirrors _openGmWelcomeGuide's gate. Not flagged
	// here: a fresh world legitimately reaches this state later, so keep checking until it does.
	if (!pastWelcomeGuide()) return;

	// Past the guide, and nothing imported yet: whisper the one-time nudge to the GMs.
	if (!(await hasImportedBook2Art())) {
		if (!globalThis.ChatMessage?.create) return; // retry next load if chat isn't ready
		await whisperGm(_buildBook2ArtReminderContent());
	}
	await setSetting("book2ArtReminderShown", true);
}

function _buildBook2ArtReminderContent() {
	return stonetopChatCard(
		"Import Your Book Art",
		`<div class="stonetop-roll-card-description">
			<p>Own the Stonetop PDFs? You can rebuild the monster and location illustrations right here in your world: portraits, tokens, treasure and journal art, all filled in from your own books. Nothing is uploaded anywhere; the pictures are reconstructed locally on your machine.</p>
			<p>It's best to run this <strong>before your players join</strong>, and to <strong>close any journal you're editing</strong> first. You can re-run it any time from the <strong>Import Book Art</strong> macro in your Macro Directory.</p>
		</div>
		<div class="row stonetop-art-reminder__actions">
			<button type="button" class="stonetop-import-art-open">
				<i class="fas fa-images"></i> Import Book Art
			</button>
		</div>`,
		"stonetop-art-reminder-card");
}

// -- REBUILD CUT PICTURES FROM ART ALREADY IMPORTED --------
// Three kinds of picture arrived after releases that had already shipped whole illustrations: the
// detail portraits (crops of a multi-figure drawing), the square faces the small round surfaces
// use, and the square a creature's prototype token stands on. Each leaves a GM who already
// imported holding every SOURCE on disk and none of the results. All three can be cut from those
// sources locally — no PDF, no re-import — so offer it once rather than making them hunt for
// their books again. See book2-art/rebuild-crops.js.
//
// The once-per-world rules — including "found nothing, so do not latch, and ask again next
// load" — belong to offerDurableArtOnce; what is local here is what counts as rebuildable and
// how the offer is presented.
function _offerBookArtRebuildOnce() {
	return offerDurableArtOnce({
		// A NEW KEY, not `peopleArtRebuildOffered`. Every world that answered the squares offer has
		// that one set, so reusing it would latch all of them shut against creature tokens — which
		// did not exist when they answered. This is the second time that trap has come up here (the
		// squares offer could not reuse the crops key either), and it fails SILENTLY: the offer is
		// simply never made. When this offer next grows to cover new work, mint another key.
		setting: "bookArtRebuildOffered",
		findWork: async () => {
			// Every kind of cuttable art at once: the detail portraits, the square faces the small
			// surfaces use, and the creature token squares. One offer covers all of them — they are
			// the same work from the GM's side (cut from pictures already on disk) and asking three
			// times would just be nagging. Counted through run-rebuild.js, the same façade the
			// three run paths use.
			const { countBookArtRebuilds } = await import("../book2-art/run-rebuild.js");
			return await countBookArtRebuilds() || null;
		},
		card: _buildBookArtRebuildContent,
	});
}

function _buildBookArtRebuildContent(count) {
	return stonetopChatCard(
		"Rebuild Book Art",
		`<div class="stonetop-roll-card-description">
			<p>Some of the book art is now cut finer than the whole-page illustrations you imported. The
			<strong>People of Stonetop</strong> gallery offers individual portraits carved out of the group
			illustrations, one face per person, instead of a whole crowd scene, plus a square
			close-up of each face for the small round portraits on the character and steading sheets; and every
			creature with art can carry a square framed for its <strong>token</strong>, so what stands on the
			battle map is the beast rather than a blind slice through the middle of the page.
			You already have the source pictures, so <strong>${count}</strong> of these can be made right here
			from the art you imported before.
			<strong>You do not need your PDFs, and you do not need to re-import.</strong></p>
			<p>They are cut from pictures already on your disk, so they come out a little smaller than a fresh
			import would give. If you would rather have them at full size, re-run the
			<strong>Import Book Art</strong> macro instead: either way, nothing already on disk is deleted.</p>
		</div>
		<div class="row stonetop-art-reminder__actions">
			<button type="button" class="stonetop-rebuild-crops-run">
				<i class="fas fa-crop-simple"></i> Rebuild ${count} pictures
			</button>
		</div>`,
		"stonetop-art-reminder-card");
}

// -- FINISH AN IMPORT THAT FELL SHORT --------------------------
// An import that fails on some illustrations still reports success. The failures scroll past in
// the console during a run that takes a couple of minutes, and what the GM is left with is a
// handful of entries that never got a picture and nothing connecting the two. The 2nd printing of
// both books is one way to arrive here (it re-saved nine illustrations at a resolution the
// importer could not match until the shape-and-place fallback landed), but a page that timed out,
// a PDF that stopped reading part way, or a run closed early all end in the same state.
//
// Unlike the rebuild above this CANNOT be done from disk: the missing pictures were never
// extracted, and the system keeps no copy of the books. So the honest offer is to re-run the
// import, which skips everything already present and processes only the gap.
//
// The once-per-world rules — including "found nothing, so do not latch, and ask again next load"
// — belong to offerDurableArtOnce; what is local here is what counts as a shortfall (see
// countMissingDurableArt, which stays quiet when a whole book is simply absent) and how the offer
// is presented.
function _offerPartialArtImportOnce() {
	return offerDurableArtOnce({
		setting: "partialArtImportOffered",
		findWork: async () => {
			const { countMissingDurableArt } = await import("../book2-art/reapply.js");
			return await countMissingDurableArt();
		},
		card: ({ missing, total }) => _buildPartialArtImportContent(missing, total),
	});
}

function _buildPartialArtImportContent(missing, total) {
	const pictures = missing === 1 ? "picture" : "pictures";
	return stonetopChatCard(
		"Finish Your Art Import",
		`<div class="stonetop-roll-card-description">
			<p>Your book art is imported, but <strong>${missing}</strong> of ${total} ${pictures} never made it
			onto your disk, so a few bestiary entries, locations or portraits are sitting without their
			illustration. An import reports those failures only in the console, which is easy to miss.</p>
			<p>Running <strong>Import Book Art</strong> again picks up just the ${pictures} that are missing:
			everything already on disk is skipped, so it is a short run rather than another full one.
			<strong>You will need your PDFs again</strong>: missing art has to come out of the books,
			and nothing already imported is touched or deleted.</p>
		</div>
		<div class="row stonetop-art-reminder__actions">
			<button type="button" class="stonetop-import-art-open">
				<i class="fas fa-images"></i> Import the missing ${missing}
			</button>
		</div>`,
		"stonetop-art-reminder-card");
}

// -- THE GM PLAYBOOK, ADDED AS A THIRD SOURCE --------------
// A world that imported before this release has no way to learn the importer reads a third PDF
// now. Nothing looks broken to them: their map pages carry a map, and the two diagrams live on a
// tab whose placeholder they may never scroll to. So this is the one nudge that has to arrive on
// its own, rather than being discovered.
//
// Worth interrupting for because the PDF is FREE — it is the publisher's own handout, not a book
// to buy — and because the books really are the poorer source here: Book I embeds the village map
// at 478x272 and Book II the other two at ~700px, against a true 300 dpi in the playbook.
//
// The once-per-world rules — including "found nothing, so do not latch, and ask again next load"
// — belong to offerDurableArtOnce, and which worlds have anything to gain belongs to
// countGmPlaybookGains (which stays quiet for a world that never imported, since the plain
// reminder owns that GM and the playbook is a field on the very dialog its button opens). What is
// local here is only how the offer is put.
function _offerGmPlaybookArtOnce() {
	return offerDurableArtOnce({
		setting: "gmPlaybookArtOffered",
		findWork: async () => {
			const { countGmPlaybookGains } = await import("../book2-art/reapply.js");
			return await countGmPlaybookGains();
		},
		card: _buildGmPlaybookArtContent,
	});
}

// Written against what this world would actually gain, not against everything the playbook holds:
// a GM who already has the diagrams and only stands to sharpen a map should not be told about a
// tab they have been using, and the reverse.
function _buildGmPlaybookArtContent({ maps, diagrams }) {
	const gains = [];
	if (maps) {
		gains.push(`<li><strong>Sharper regional maps.</strong> ${maps === 1 ? "One" : maps} of your Setting
			Overview map pages ${maps === 1 ? "is" : "are"} showing a coarser copy than the playbook prints.
			The rulebooks embed those maps small (Book I stores the village map at 478&times;272),
			where the playbook prints all three at a full 300 dpi.</li>`);
	}
	if (diagrams) {
		gains.push(`<li><strong>The core loop and the flow of play.</strong> The playbook's two flowcharts, which
			are in no other PDF. They fill the <strong>Core Loop</strong> tab on your GM Toolkit sheet.</li>`);
	}
	return stonetopChatCard(
		"Add The GM Playbook",
		`<div class="stonetop-roll-card-description">
			<p><strong>Import Book Art</strong> reads a third PDF as of this update: the <strong>GM
			playbook</strong>. It's the free 12-page handout from the publisher, not a book you buy,
			and for a few pictures it is a better source than either rulebook.</p>
			<ul>${gains.join("")}</ul>
			<p>Everything you have already imported is skipped, so this is a short run rather than another full
			one, and nothing already on disk is touched or deleted.</p>
		</div>
		<div class="row stonetop-art-reminder__actions">
			<button type="button" class="stonetop-import-art-open">
				<i class="fas fa-images"></i> Add the GM playbook
			</button>
		</div>`,
		"stonetop-art-reminder-card");
}

async function _postStartupWelcomeMessageOnce() {
	if (getSetting("startupWelcomeShown")) return;
	if (!globalThis.ChatMessage?.create) return;
	await ChatMessage.create({
		content: _buildStartupWelcomeContent(),
		speaker: { alias: "Stonetop" },
	});
	await setSetting("startupWelcomeShown", true);
}

// Where the books come from. This system ships the sheets and the bookkeeping and none of the
// prose, so the one thing a brand-new world cannot supply is the rules themselves; the greeting
// card says so and points at the publisher's own store rather than a reseller.
const STONETOP_STORE_URL   = "https://plusoneexp.com/collections/stonetop";
const STONETOP_STORE_LABEL = "plusoneexp.com/collections/stonetop";

function _buildStartupWelcomeContent() {
	return `<section class="pbta-chat-card stonetop-roll-card stonetop-startup-card">
		<div class="cell cell--chat">
			<div class="chat-title row flexrow">
				<h2 class="cell__title">Welcome to <span class="stonetop-startup-card__title-logo">Stonetop</span></h2>
				<div class="cell__subtitle">Fresh-start helper</div>
			</div>
			<div class="stonetop-roll-card-description">
				<p>This is an unofficial Foundry VTT system for <strong>Stonetop</strong>, by Jeremy Strandberg, illustrated by Lucie Arnoux, with layout, editing, and co-design by Jason Lutes.</p>
				<p>It carries none of the rules text, so you will want the books themselves. They come from the publisher, Plus One Exp: <a href="${STONETOP_STORE_URL}">${STONETOP_STORE_LABEL}</a>.</p>
			</div>
			<div class="card-content stonetop-startup-card__content">
				<div class="row stonetop-startup-card__section">
					<h3 class="cell__subtitle">For Players</h3>
					<ul>
						<li>Guided, resumable character creation, and a step-by-step level-up wizard.</li>
						<li>Move rolls with modifiers, advantage or disadvantage, and hit tiers worked out for you, including Clash and Let Fly resolved from the chat card.</li>
						<li>Armor, load, followers, and the Seeker's arcana tracked on the sheet.</li>
					</ul>
				</div>
				<div class="row stonetop-startup-card__section">
					<h3 class="cell__subtitle">For Game Masters</h3>
					<ul>
						<li>A first-session Welcome guide and a Let Spring Burst Forth walkthrough.</li>
						<li>A steading sheet with seasonal automation, improvements, and disasters.</li>
						<li>A GM Toolkit with your moves, and Threats and Sites tabs you can pin to a scene.</li>
					</ul>
				</div>
				<div class="row stonetop-startup-card__section">
					<h3 class="cell__subtitle">Bundled Content</h3>
					<ul>
						<li>The full Book I and II bestiary, around 180 creatures, hidden from players until you reveal it.</li>
						<li>A cross-linked Locations and Lore journal covering the wider world.</li>
						<li>The complete deck of major and minor arcana.</li>
					</ul>
				</div>
			</div>
			<div class="row stonetop-startup-card__actions">
				<button type="button" class="stonetop-startup-open-welcome">
					<i class="fas fa-feather"></i> Open the First-Session Guide
				</button>
			</div>
			<div class="row row--border stonetop-startup-card__footer">
				Open <strong>Configure Settings</strong> and filter for <strong>Stonetop</strong> for the sheet font and size, the hover info, and the rest.
				Worth installing: <a href="https://foundryvtt.com/packages/dice-so-nice">Dice So Nice!</a> for 3D dice,
				<a href="https://foundryvtt.com/packages/sequencer">Sequencer</a> and <a href="https://foundryvtt.com/packages/JB2A_DnD5e">JB2A</a> to see swords swing and arrows fly on the map,
				<a href="https://foundryvtt.com/packages/soundfxlibrary">SoundFx Library</a> to hear them land,
				and <a href="https://foundryvtt.com/packages/fxmaster">FXMaster</a> for the season's weather on the scene.
			</div>
		</div>
	</section>`;
}
