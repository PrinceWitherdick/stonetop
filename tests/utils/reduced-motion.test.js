import { describe, it, expect, afterEach, vi } from "vitest";
import { prefersReducedMotion } from "../../module/utils/reduced-motion.js";

// Either the OS asking or the system's own "Reduce motion" setting (the root class) stills every animator.

function root(classes = []) {
	return { documentElement: { classList: { contains: name => classes.includes(name) } } };
}

describe("prefersReducedMotion", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("says no with neither matchMedia nor a document to ask", () => {
		vi.stubGlobal("matchMedia", undefined);
		vi.stubGlobal("document", undefined);
		expect(prefersReducedMotion()).toBe(false);
	});

	it("says yes when the OS asks for less motion", () => {
		vi.stubGlobal("matchMedia", () => ({ matches: true }));
		vi.stubGlobal("document", root());
		expect(prefersReducedMotion()).toBe(true);
	});

	it("says yes when the system's Reduce motion setting is on, whatever the OS says", () => {
		vi.stubGlobal("matchMedia", () => ({ matches: false }));
		vi.stubGlobal("document", root(["stonetop-reduce-motion"]));
		expect(prefersReducedMotion()).toBe(true);
	});

	it("says no when neither asks", () => {
		vi.stubGlobal("matchMedia", () => ({ matches: false }));
		vi.stubGlobal("document", root(["some-other-class"]));
		expect(prefersReducedMotion()).toBe(false);
	});
});
