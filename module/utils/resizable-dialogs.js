/**
 * System convention: every window and modal should be drag-resizable.
 *
 * Our own Application subclasses set `resizable: true` in their `defaultOptions`,
 * and core actor/item/journal sheets are resizable by default. But the ad-hoc
 * `new Dialog(...)` / `Dialog.confirm(...)` / `Dialog.prompt(...)` popups we spawn
 * from sheets can't carry their own subclass, and AppV1's base `Dialog` defaults
 * to `resizable: false`. Rather than thread `{ resizable: true }` through every
 * call site — and silently miss every future one — we flip the legacy `Dialog`
 * class default once, at init.
 *
 * Foundry reads `options.resizable` while building the window frame
 * (`Application#_renderOuter` → `new Draggable(...)`), so overriding the static
 * `defaultOptions` getter is enough for the resize handle to be wired up at
 * render time. Call sites that explicitly pass `resizable: false` still win.
 *
 * Idempotent: a marker flag guards against double-wrapping on re-init.
 */
export function makeDialogsResizable() {
	// V13+ exposes the classic Dialog under foundry.appv1; V12 only has the global.
	const DialogClass = foundry?.appv1?.api?.Dialog ?? globalThis.Dialog;
	if (!DialogClass || DialogClass._stonetopResizableDefault) return;

	const baseGetter = Object.getOwnPropertyDescriptor(DialogClass, "defaultOptions")?.get;
	if (!baseGetter) return;

	Object.defineProperty(DialogClass, "defaultOptions", {
		configurable: true,
		get() {
			return foundry.utils.mergeObject(baseGetter.call(this), { resizable: true });
		},
	});
	DialogClass._stonetopResizableDefault = true;
}
