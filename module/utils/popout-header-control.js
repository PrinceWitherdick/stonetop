/**
 * Add a control to an ImagePopout's window header, across AppV1 and AppV2.
 *
 * Core builds the header after the popout renders and can rebuild it, so injection is retried on
 * a rAF and two timeouts rather than done once. Each pass is idempotent.
 *
 * ⚠ THE GUARD IS PER KEY, NOT PER WINDOW. It used to be "does this header already have a control
 * at all", which silently caps a header at one: the first successful pass installs the first
 * button and every later pass bails before reaching the second. Two controls on one popout is
 * exactly what the portrait framer needs (Edit Photo beside Frame Face), so the guard has to ask
 * about the control being added, not about the header.
 */

/** Marks a control as ours, so several can be added without reversing their order. */
const OWN = "stonetop-popout-control";

/** Schedule `inject` the three times core might have (re)built the header. */
function schedule(inject) {
	if (typeof requestAnimationFrame === "function") requestAnimationFrame(inject);
	setTimeout(inject, 0);
	setTimeout(inject, 100);
}

/**
 * @param {Application} popout        the ImagePopout to decorate
 * @param {object}      opts
 * @param {string}      opts.key      unique class for this control; doubles as the dedupe guard
 * @param {string}      opts.icon     Font Awesome class, e.g. "fa-camera"
 * @param {string}      opts.label    tooltip and accessible name
 * @param {Function}    opts.onClick  invoked with the originating event already neutralised
 */
export function addPopoutHeaderControl(popout, { key, icon, label, onClick } = {}) {
	if (!popout || !key || typeof onClick !== "function") return;
	const inject = () => {
		const root = popout?.element?.jquery ? popout.element[0] : popout?.element;
		const header = root?.querySelector?.(".window-header");
		if (!header) return;
		if (header.querySelector(`.${key}`)) return;

		// AppV1 headers use <a class="header-button">, AppV2 <button class="header-control">.
		const isAppV1 = !!header.querySelector("a.header-button");
		const btn = document.createElement(isAppV1 ? "a" : "button");
		if (isAppV1) {
			btn.className = `header-button control ${OWN} ${key}`;
			btn.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
		} else {
			btn.type = "button";
			btn.className = `header-control icon ${OWN} ${key} fa-solid ${icon}`;
		}
		btn.setAttribute("data-tooltip", label);
		btn.setAttribute("aria-label", label);
		btn.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			onClick(ev);
		});

		// Ahead of core's own controls (Share, Close), so added controls read as belonging to
		// this window rather than trailing off the end of the standard set. The anchor is the
		// first control that is NOT one of ours, which keeps several added controls in the order
		// they were added rather than reversing them — a previously added control matches the
		// same `.header-button` / `.header-control` selector core's do.
		const controls = [...header.querySelectorAll(isAppV1 ? "a.header-button" : "button.header-control")];
		const anchor = controls.find((el) => !el.classList.contains(OWN));
		if (anchor) header.insertBefore(btn, anchor);
		else header.appendChild(btn);
	};
	schedule(inject);
}
