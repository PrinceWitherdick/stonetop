// Smooth out AppV1 window-header dragging for Stonetop sheets.
//
// Foundry's core Draggable moves a window by writing element.style.left/top in
// pixels on every pointermove frame (client/applications/ux/draggable.mjs →
// Application#setPosition in appv1/api/application-v1.mjs). Because that is a
// left/top change — not a transform — the browser re-lays-out and REPAINTS the
// window each frame instead of letting the GPU re-composite a cached texture.
// Our sheets make that repaint expensive: the character sheet is 960×1050 and
// carries a cover-scaled parchment background on .window-content plus a blurred
// frame box-shadow, all of which must be re-rastered at every new position.
//
// Promoting the window to its own compositor layer for the DURATION of the drag
// lets the browser cache it as a texture and just reposition the layer, which
// is the standard fix for left/top-drag jitter. will-change costs memory, so we
// only apply it while the header is actually held and drop it on release.
//
// This is appearance-neutral. We deliberately do NOT use `contain: paint` — the
// frame box-shadow is painted OUTSIDE the border box and contain:paint would
// clip it; will-change:transform promotes a layer without clipping.
//
// Diagnostics: set `STONETOP_DRAG_DEBUG = true` in the browser console to log a
// per-drag summary (setPosition cost, dropped frames, long tasks) so a given
// drag can be classified as paint-bound (frame gaps, no long tasks) vs
// main-thread-bound (long tasks present). Turn it off by deleting the global.

/**
 * Wire drag-time layer promotion (and, when STONETOP_DRAG_DEBUG is on, a frame
 * profiler) onto an application's window header. Safe to call on every render:
 * the header persists across AppV1 re-renders, and a dataset guard prevents the
 * listener from stacking.
 *
 * @param {Application} app  A rendered AppV1 application (actor/item sheet).
 */
export function installDragSmoothing(app) {
	// The .app element persists across AppV1 re-renders, so its guard flag survives too —
	// test it first to short-circuit already-wired sheets before touching the DOM.
	const el = app?.element?.[0];
	if (!el || el.dataset.stDragSmoothing) return;
	const header = el.querySelector(".window-header");
	if (!header) return;
	el.dataset.stDragSmoothing = "1";

	header.addEventListener("pointerdown", ev => {
		// Only a plain left-button press on the header chrome is a window move;
		// ignore the close/config/edit-toggle controls that live in the header.
		if (ev.button !== 0) return;
		if (ev.target.closest("a, button, input, label, .header-button, .stonetop-header-toggle")) return;

		el.style.willChange = "transform";
		const profiler = globalThis.STONETOP_DRAG_DEBUG ? startDragProfiler(app, el) : null;

		const end = () => {
			el.style.willChange = "";
			profiler?.stop();
			window.removeEventListener("pointerup", end, true);
			window.removeEventListener("pointercancel", end, true);
		};
		window.addEventListener("pointerup", end, true);
		window.addEventListener("pointercancel", end, true);
	});
}

/**
 * Debug-only per-drag frame profiler. Times the (core) setPosition call on each
 * frame, counts rAF gaps over one frame budget, and records any long tasks, so
 * a drag can be attributed to paint vs main-thread cost. Self-restoring.
 */
function startDragProfiler(app, el) {
	const t0 = performance.now();
	let frames = 0, spTotal = 0, spMax = 0, gaps = 0, last = performance.now();
	const longtasks = [];

	// Time core's setPosition (the per-frame forced reflow + left/top write) by
	// shadowing the instance method with an own property, and put back exactly what
	// was there on stop.
	//
	// `delete` is only the right restore when the method was INHERITED. A sheet with a
	// tab rail already carries its own `setPosition` — utils/tab-rail.js wraps the
	// instance so the rail can re-pick its edge while the window is dragged toward one —
	// and deleting that would strip the wrapper for the rest of the session, on the one
	// gesture it exists to watch.
	const hadOwn = Object.prototype.hasOwnProperty.call(app, "setPosition");
	const orig = typeof app.setPosition === "function" ? app.setPosition : null;
	if (orig) {
		app.setPosition = function (opts) {
			const s = performance.now();
			const r = orig.call(this, opts);
			const dt = performance.now() - s;
			frames++; spTotal += dt; if (dt > spMax) spMax = dt;
			return r;
		};
	}

	let raf = requestAnimationFrame(function tick() {
		const now = performance.now();
		if (now - last > 20) gaps++;
		last = now;
		raf = requestAnimationFrame(tick);
	});

	let po = null;
	try {
		po = new PerformanceObserver(list => {
			for (const e of list.getEntries()) longtasks.push(Math.round(e.duration));
		});
		po.observe({ type: "longtask", buffered: false });
	} catch (_) { /* longtask not supported in this browser — skip */ }

	return {
		stop() {
			cancelAnimationFrame(raf);
			po?.disconnect();
			if (orig) {
				if (hadOwn) app.setPosition = orig;
				else delete app.setPosition;
			}
			const dur = Math.round(performance.now() - t0);
			const avg = frames ? (spTotal / frames).toFixed(2) : "n/a";
			console.info(
				`[stonetop-drag] ${el.offsetWidth}×${el.offsetHeight} · ${dur}ms drag · ` +
				`${frames} setPosition calls (avg ${avg}ms, max ${spMax.toFixed(1)}ms) · ` +
				`${gaps} frame gaps >20ms · ` +
				`long tasks: ${longtasks.length ? longtasks.join(",") + "ms" : "none"}`
			);
		}
	};
}
