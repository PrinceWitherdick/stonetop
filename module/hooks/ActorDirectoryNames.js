import { playbookTitle } from "../utils/playbook-actors.js";
import { WBH_HERO_FLAG } from "../actors/character/WouldBeHeroAsterisk.js";
import { SYSTEM_ID } from "../system-id.js";
import { repaintActorRow } from "./actor-directory-rows.js";

/**
 * Name the player characters in the Actors sidebar the way the table does: "Pim The
 * Lightbearer", not "Pim".
 *
 * The epithet is appended to the rendered row, never written to the document — see
 * `characterFullName` for why the Actor keeps its bare name. Two consequences worth
 * knowing, both of which are the point rather than a compromise:
 *  - the sidebar's search box still matches on the stored name, because core filters
 *    against `collection` rather than the DOM, so typing "pim" still finds Pim;
 *  - clearing or swapping a playbook takes the epithet with it, with nothing to migrate.
 *
 * TWO ENTRY POINTS, exactly as in ActorDirectoryPortraits.js and for the same reason:
 * core redraws the directory for name / img / sort / folder and nothing else, so a
 * playbook picked from the sheet would otherwise not reach the sidebar until reload.
 *
 * The render hook binds to `renderDocumentDirectory` rather than `renderActorDirectory`
 * because ApplicationV2 fires a render hook per class in the inheritance chain and the
 * parent's name is the stable one — which is why the collection guard is load-bearing.
 *
 * A compendium's Actor rows are deliberately left alone: they render off the pack index,
 * which carries no `system.playbook`.
 */

/** Marks the epithet we appended, so a repaint replaces ours and never doubles it up. */
const EPITHET = "stonetop-dir-playbook";

/**
 * Bring one rendered row's name into line with its actor's playbook — appending,
 * rewriting or removing the epithet. Idempotent.
 */
export function decorateNameRow(li, actor) {
	// Core renders `<a class="entry-name ellipsis">{{name}}</a>` as the row's only text.
	// The epithet goes INSIDE that anchor so the row truncates as one name rather than
	// laying the playbook out as a second flex item that pushes the name off its own row.
	const link = li.querySelector(":scope > .entry-name");
	if (!link) return;

	const existing = link.querySelector(`:scope > .${EPITHET}`);
	const title = actor?.type === "character" ? playbookTitle(actor) : "";
	if (!title) { existing?.remove(); return; }

	const span = existing ?? document.createElement("span");
	// A leading space, not a margin: this is inline text inside an ellipsis-truncated
	// anchor, and a margin would survive the truncation as a gap after the "…".
	span.textContent = ` ${title}`;
	if (existing) return;
	span.className = EPITHET;
	link.appendChild(span);
}

/**
 * Repaint one actor's sidebar row when the playbook behind its epithet changes.
 *
 * Covers both halves of what `playbookTitle` reads: the playbook itself (picked, swapped or
 * cleared from the sheet) and the Would-Be Hero's cross-off flag, which renames the playbook
 * without touching it.
 *
 * ⚠ The flag bag is read with BRACKETS off SYSTEM_ID. This package's id happens to be
 * `stonetop_pwd`, where a dotted read would parse, but the same source ships under the
 * hyphenated `stonetop-pwd`, and there a dotted `changed.flags.stonetop-pwd` parses as a
 * subtraction and throws at runtime.
 *
 * @param {Actor}  actor
 * @param {object} changed  the update that was applied
 */
export function onUpdateActorPlaybookName(actor, changed) {
	if (actor?.type !== "character") return;
	const bag = changed?.flags?.[SYSTEM_ID];
	const heroChanged = !!bag && (WBH_HERO_FLAG in bag || `-=${WBH_HERO_FLAG}` in bag);
	// `changed` reaches the hook expanded, so a dotted `system.playbook.name` write and a
	// whole-object `system.playbook` one both land here. Both deletion shapes count too:
	// dropping a playbook has to drop the epithet as readily as picking one adds it.
	const sys = changed?.system;
	const playbookChanged = !!sys && ("playbook" in sys || "-=playbook" in sys);
	if (!heroChanged && !playbookChanged) return;

	repaintActorRow(actor, decorateNameRow);
}
