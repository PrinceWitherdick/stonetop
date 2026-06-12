// Shared "codex" behaviour for the bestiary sheets — the description /
// questions / lore / hooks / origins / discoveries / nests / dangers content
// that lives on both the multi-creature Bestiary Entry and (now) on a lone
// stat block. Both sheets build the same context from this module and route
// their codex edit clicks/changes through the same dispatchers, so there's one
// implementation of the codex, not two.

import { escHtml } from "../../utils/strings.js";

export const CODEX_RICH_FIELDS = [
	{ key: "description", enrichedKey: "enrichedDescription" },
	{ key: "dangers",     enrichedKey: "enrichedDangers" },
	{ key: "nests",       enrichedKey: "enrichedNests" },
];
export const CODEX_PREP_FIELDS = [
	{ key: "hooks",   label: "stonetop.bestiary.hooks" },
	{ key: "origins", label: "stonetop.bestiary.origins" },
];
export const CODEX_QA_FIELDS = [
	{ key: "questions", label: "stonetop.bestiary.questions" },
	{ key: "lore",      label: "stonetop.bestiary.lore" },
];

// ── Pure render helpers ────────────────────────────────────────────────────

// **bold** -> <strong>bold</strong>; everything else HTML-escaped so the stored
// text stays plain and editable while reading nicely.
export function inlineMarkup(text) {
	return escHtml(text).replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
}

export function splitLines(value, editMode) {
	const text = value ?? "";
	if (!text) return editMode ? [{ text: "", html: "" }] : [];
	const lines = String(text).split(/\r?\n/);
	const kept = editMode ? lines : lines.filter(line => line.trim());
	return kept.map(line => ({ text: line, html: inlineMarkup(line) }));
}

export function qaPairs(value, editMode) {
	const pairs = Array.isArray(value)
		? value.map(p => {
			const prompt = p?.prompt ?? "";
			const answer = p?.answer ?? "";
			// A leading **bold** run (e.g. "**Something interesting:**") becomes a
			// header on its own line above the question; the rest is the body.
			const lead = /^\s*\*\*(.+?)\*\*\s*([\s\S]*)$/.exec(prompt);
			return {
				prompt,
				answer,
				lead: lead ? lead[1] : "",
				promptHtml: inlineMarkup(lead ? lead[2] : prompt),
				answerHtml: inlineMarkup(answer),
			};
		})
		: [];
	if (editMode) return pairs;
	return pairs.filter(p => p.prompt.trim() || p.answer.trim());
}

// True if a value carries meaningful content (strips HTML so "<p></p>" is empty).
export function hasText(value) {
	return String(value ?? "")
		.replace(/<[^>]*>/g, "")
		.replace(/&nbsp;/gi, " ")
		.trim().length > 0;
}

export function discoveryGroups(value, editMode) {
	const groups = Array.isArray(value) ? value : [];
	const mapped = groups.map(g => {
		const heading = g?.heading ?? "";
		const body = g?.body ?? "";
		const itemsArr = Array.isArray(g?.items) ? g.items : [];
		const keptItems = editMode ? itemsArr : itemsArr.filter(i => (i ?? "").trim());
		return {
			heading,
			headingHtml: inlineMarkup(heading),
			body,
			bodyHtml: inlineMarkup(body),
			itemsText: editMode ? itemsArr.join("\n") : "",
			items: keptItems.map(i => ({ text: i, html: inlineMarkup(i) })),
		};
	});
	if (editMode) return mapped;
	return mapped.filter(g => g.heading.trim() || g.body.trim() || g.items.length);
}

async function enrichHTML(value) {
	const textEditor = globalThis.foundry?.applications?.ux?.TextEditor;
	if (!textEditor?.enrichHTML) return value ?? "";
	return textEditor.enrichHTML(value ?? "");
}

/**
 * Build the codex portion of a sheet's render context from `system`.
 * Returns enriched rich-text, prep line sections, Q&A sections, discovery
 * groups, and `show`/`has` flags for hide-when-empty layout.
 */
export async function buildCodexContext(system, editMode) {
	const out = {};
	await Promise.all(CODEX_RICH_FIELDS.map(async f => {
		out[f.enrichedKey] = await enrichHTML(system?.[f.key]);
	}));

	out.prepLineSections = CODEX_PREP_FIELDS.map(field => {
		const introField = `${field.key}Intro`;
		const introRaw = system?.[introField] ?? "";
		return {
			...field,
			lines: splitLines(system?.[field.key], editMode),
			introField,
			intro: introRaw,
			introHtml: inlineMarkup(introRaw),
			show: editMode || hasText(system?.[field.key]) || hasText(introRaw),
		};
	});

	out.qaSections = CODEX_QA_FIELDS.map(field => {
		const pairs = qaPairs(system?.[field.key], editMode);
		return { ...field, pairs, show: editMode || pairs.length > 0 };
	});

	out.discoveryGroups = discoveryGroups(system?.discoveries, editMode);

	out.show = {
		description: editMode || hasText(system?.description),
		dangers:     editMode || hasText(system?.dangers),
		nests:       editMode || hasText(system?.nests),
	};
	out.has = {
		codex:       editMode || out.qaSections.some(s => s.show),
		prep:        editMode || out.prepLineSections.some(s => s.show),
		discoveries: editMode || out.discoveryGroups.length > 0,
		notes:       editMode || hasText(system?.notes),
		// Any codex content at all, beyond the always-with-the-statblock description.
		any:         editMode
			|| hasText(system?.description) || hasText(system?.dangers) || hasText(system?.nests)
			|| out.qaSections.some(s => s.show) || out.prepLineSections.some(s => s.show)
			|| out.discoveryGroups.length > 0,
	};
	return out;
}

// ── Edit operations (mutate the actor) ─────────────────────────────────────

export async function codexUpdateRichField(actor, field, value) {
	if (!CODEX_RICH_FIELDS.some(f => f.key === field)) return;
	await actor.update({ [`system.${field}`]: value ?? "" });
}

export async function codexAddLine(actor, field) {
	if (!CODEX_PREP_FIELDS.some(f => f.key === field)) return;
	const current = actor.system?.[field] ?? "";
	await actor.update({ [`system.${field}`]: `${current}\n` });
}

export async function codexUpdateLine(actor, root, field) {
	if (!CODEX_PREP_FIELDS.some(f => f.key === field)) return;
	const section = root.querySelector(`[data-line-field="${field}"]`);
	if (!section) return;
	const lines = Array.from(section.querySelectorAll(".stonetop-entry-line-input")).map(i => i.value);
	await actor.update({ [`system.${field}`]: lines.join("\n") });
}

export async function codexAddQa(actor, field) {
	if (!CODEX_QA_FIELDS.some(f => f.key === field)) return;
	const current = Array.isArray(actor.system?.[field]) ? actor.system[field] : [];
	await actor.update({ [`system.${field}`]: [...current, { prompt: "", answer: "" }] });
}

export async function codexRemoveQa(actor, field, index) {
	if (!CODEX_QA_FIELDS.some(f => f.key === field) || Number.isNaN(index)) return;
	const current = Array.isArray(actor.system?.[field]) ? [...actor.system[field]] : [];
	current.splice(index, 1);
	await actor.update({ [`system.${field}`]: current });
}

export async function codexUpdateQa(actor, root, field) {
	if (!CODEX_QA_FIELDS.some(f => f.key === field)) return;
	const section = root.querySelector(`[data-qa-field="${field}"]`);
	if (!section) return;
	const pairs = Array.from(section.querySelectorAll("[data-qa-index]")).map(row => ({
		prompt: row.querySelector(".stonetop-entry-qa-prompt")?.value ?? "",
		answer: row.querySelector(".stonetop-entry-qa-answer")?.value ?? "",
	}));
	await actor.update({ [`system.${field}`]: pairs });
}

export async function codexAddDiscovery(actor) {
	const current = Array.isArray(actor.system?.discoveries) ? actor.system.discoveries : [];
	await actor.update({ "system.discoveries": [...current, { heading: "", body: "", items: [] }] });
}

export async function codexRemoveDiscovery(actor, index) {
	if (Number.isNaN(index)) return;
	const current = Array.isArray(actor.system?.discoveries) ? [...actor.system.discoveries] : [];
	current.splice(index, 1);
	await actor.update({ "system.discoveries": current });
}

export async function codexUpdateDiscoveries(actor, root) {
	const wrap = root.querySelector("[data-discovery-field]");
	if (!wrap) return;
	const groups = Array.from(wrap.querySelectorAll("[data-discovery-index]")).map(el => ({
		heading: el.querySelector(".stonetop-discovery-heading-input")?.value ?? "",
		body:    el.querySelector(".stonetop-discovery-body-input")?.value ?? "",
		items:   (el.querySelector(".stonetop-discovery-items-input")?.value ?? "")
			.split(/\r?\n/).filter(line => line.trim()),
	}));
	await actor.update({ "system.discoveries": groups });
}

// ── Event dispatchers ──────────────────────────────────────────────────────
// Each returns true if it handled the event. Edit-only actions require
// `sheet._editMode`. The host sheet calls these from its own click/change
// listeners (after its non-codex branches), passing `this`.

export async function onCodexClick(sheet, ev) {
	const t = ev.target;
	const root = sheet.element?.[0];
	if (!root) return false;

	if (t.closest(".stonetop-entry-add-line")) {
		if (sheet._editMode) await codexAddLine(sheet.actor, t.closest(".stonetop-entry-add-line").dataset?.field);
		return true;
	}
	if (t.closest(".stonetop-entry-add-qa")) {
		if (sheet._editMode) await codexAddQa(sheet.actor, t.closest(".stonetop-entry-add-qa").dataset?.field);
		return true;
	}
	if (t.closest(".stonetop-entry-remove-qa")) {
		if (sheet._editMode) {
			const row = t.closest("[data-qa-index]");
			await codexRemoveQa(sheet.actor, row?.closest("[data-qa-field]")?.dataset?.qaField, Number(row?.dataset?.qaIndex));
		}
		return true;
	}
	if (t.closest(".stonetop-discovery-add-group")) {
		if (sheet._editMode) await codexAddDiscovery(sheet.actor);
		return true;
	}
	if (t.closest(".stonetop-discovery-remove-group")) {
		if (sheet._editMode) {
			await codexRemoveDiscovery(sheet.actor, Number(t.closest("[data-discovery-index]")?.dataset?.discoveryIndex));
		}
		return true;
	}
	return false;
}

export async function onCodexChange(sheet, ev) {
	if (!sheet._editMode) return false;
	const t = ev.target;
	const root = sheet.element?.[0];
	if (!root) return false;

	const richEditor = t.closest(".stonetop-entry-rich-editor");
	if (richEditor) {
		await codexUpdateRichField(sheet.actor, richEditor.dataset?.field, richEditor.value);
		return true;
	}
	const lineInput = t.closest(".stonetop-entry-line-input");
	if (lineInput) {
		await codexUpdateLine(sheet.actor, root, lineInput.closest("[data-line-field]")?.dataset?.lineField);
		return true;
	}
	const qaInput = t.closest(".stonetop-entry-qa-input");
	if (qaInput) {
		await codexUpdateQa(sheet.actor, root, qaInput.closest("[data-qa-field]")?.dataset?.qaField);
		return true;
	}
	if (t.closest(".stonetop-discovery-input")) {
		await codexUpdateDiscoveries(sheet.actor, root);
		return true;
	}
	return false;
}
