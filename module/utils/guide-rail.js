// Shared DOM sync for the left-rail "stepped sheet" chrome used by the welcome guide
// (WelcomeDialog), the Make-a-Monster worksheet (CreateMonsterDialog), and the arcanum
// editor (StonetopArcanumSheet). These panels switch WITHOUT re-rendering so unsaved
// form state and live prose-mirror editors survive the switch, which means each sheet
// hand-syncs the rail in the DOM. The parts that are byte-identical across all three
// live here so the shared `.stonetop-guide-*` conventions can't drift; callers keep
// their own banner title/count and Back/Next logic, which legitimately differs.
//
// @param {HTMLElement} root  the sheet's root element (a raw node, not jQuery).
// @param {object} opts
// @param {string} opts.key             the active section's key.
// @param {string} opts.dataKey         dataset property naming a tab/section (e.g. "tab", "arcTab").
// @param {string} opts.tabSelector     selector for the rail's clickable tab buttons.
// @param {string} opts.sectionSelector selector for the switchable panels.
// @param {string} [opts.iconSelector]  selector for the banner icon <i>, if the sheet has one.
// @param {string} [opts.icon]          FA glyph class for the active section (e.g. "fa-book").
// @param {string} [opts.iconExtraClass] the sheet's own banner-icon class, kept beside the shared one.
// @param {string} [opts.mainSelector]  selector for the scroll column to reset to its top.
export function applyGuideRail(root, {
	key, dataKey, tabSelector, sectionSelector, iconSelector, icon, iconExtraClass, mainSelector,
} = {}) {
	if (!root) return;

	root.querySelectorAll(tabSelector).forEach(btn => {
		const on = btn.dataset[dataKey] === key;
		btn.closest(".stonetop-guide-toc-item")?.classList.toggle("is-active", on);
		if (on) btn.setAttribute("aria-current", "true"); else btn.removeAttribute("aria-current");
	});
	root.querySelectorAll(sectionSelector).forEach(sec => { sec.hidden = sec.dataset[dataKey] !== key; });

	if (iconSelector) {
		const iconEl = root.querySelector(iconSelector);
		if (iconEl) iconEl.className = `fas ${icon} stonetop-guide-banner-icon ${iconExtraClass}`;
	}
	// A tall previous panel can leave the column scrolled down; reset to the top.
	if (mainSelector) {
		const main = root.querySelector(mainSelector);
		if (main) main.scrollTop = 0;
	}
}
