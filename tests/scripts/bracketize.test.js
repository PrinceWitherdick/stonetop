import { describe, it, expect } from "vitest";
import { bracketizeIdentifierAccess } from "../../scripts/lib/bracketize.js";

const ID = "stonetop_pwd";
const run = (src) => bracketizeIdentifierAccess(src, ID);

// The rename that follows this pass. A result is only correct if it still parses after it.
const rename = (src) => src.split(ID).join("stonetop-pwd");
const parses = (src) => {
	try { new Function(rename(src)); return true; } catch { return false; }
};

describe("property access", () => {
	it("brackets a plain dotted read", () => {
		expect(run("obj.flags.stonetop_pwd.custom")).toBe('obj.flags["stonetop_pwd"].custom');
	});

	it("preserves optional chaining", () => {
		expect(run("a.flags?.stonetop_pwd?.steading")).toBe('a.flags?.["stonetop_pwd"]?.steading');
	});

	it("handles a read at the end of an expression", () => {
		expect(run("const f = doc.flags.stonetop_pwd;")).toBe('const f = doc.flags["stonetop_pwd"];');
	});

	it("leaves a longer identifier alone", () => {
		expect(run("obj.stonetop_pwdExtra")).toBe("obj.stonetop_pwdExtra");
	});
});

describe("object-literal keys", () => {
	it("quotes a bare key", () => {
		expect(run("flags: { stonetop_pwd: { year: 1 } }")).toBe('flags: { "stonetop_pwd": { year: 1 } }');
	});

	it("quotes a key at the start of a literal", () => {
		expect(run("({stonetop_pwd: 1})")).toBe('({"stonetop_pwd": 1})');
	});

	it("leaves an already-quoted key alone", () => {
		expect(run('flags: { "stonetop_pwd": 1 }')).toBe('flags: { "stonetop_pwd": 1 }');
	});
});

describe("strings and comments are untouched", () => {
	// Foundry splits these on "." itself, so a hyphen is fine and bracketing would break them.
	it("leaves a dotted update path inside a string", () => {
		const src = 'update({ "flags.stonetop_pwd.herd": 3 })';
		expect(run(src)).toBe(src);
	});

	it("leaves a scope argument inside a string", () => {
		const src = 'doc.getFlag("stonetop_pwd", "arcana")';
		expect(run(src)).toBe(src);
	});

	it("leaves single-quoted and template strings", () => {
		expect(run("const a = 'flags.stonetop_pwd.x'")).toBe("const a = 'flags.stonetop_pwd.x'");
		expect(run("const a = `flags.stonetop_pwd.x`")).toBe("const a = `flags.stonetop_pwd.x`");
	});

	it("survives an escaped quote inside a string", () => {
		const src = 'const a = "he said \\"flags.stonetop_pwd.x\\" ok"';
		expect(run(src)).toBe(src);
	});

	it("leaves line and block comments", () => {
		expect(run("// see obj.flags.stonetop_pwd.x\ncode")).toBe("// see obj.flags.stonetop_pwd.x\ncode");
		expect(run("/* obj.flags.stonetop_pwd.x */ code")).toBe("/* obj.flags.stonetop_pwd.x */ code");
	});

	it("resumes rewriting after a comment ends", () => {
		expect(run("/* x.stonetop_pwd.a */ y.stonetop_pwd.b")).toBe('/* x.stonetop_pwd.a */ y["stonetop_pwd"].b');
	});
});

describe("output still parses after the rename", () => {
	const cases = [
		"const p = steading.flags?.stonetop_pwd?.steading ?? {};",
		"expect(out.flags.stonetop_pwd.custom).toBe(true);",
		"const d = { flags: { stonetop_pwd: { chronicleYear: yr } } };",
		'const s = "flags.stonetop_pwd.customFollowers.h1"; const o = { [s]: 1 };',
		"const v = a.flags.stonetop_pwd.x + b.flags.stonetop_pwd.y;"
	];

	for (const src of cases) {
		it(`parses: ${src.slice(0, 46)}`, () => {
			expect(parses(run(src))).toBe(true);
		});
	}

	// Proves the pass is doing real work rather than the input being benign.
	//
	// Note the failure mode is a RUNTIME ReferenceError, not a syntax error:
	// `flags.stonetop-pwd.custom` parses happily as `flags.stonetop` minus `pwd.custom`.
	// A parse-only check would wave it straight through, which is precisely why the
	// rehearsal ran the whole test suite instead of just linting.
	it("a naive rename leaves a bare identifier that blows up at runtime", () => {
		const naive = rename("out.flags.stonetop_pwd.custom");
		expect(naive).toContain("flags.stonetop-pwd.custom");
		expect(parses(naive)).toBe(true); // parses...
		expect(() => new Function(`const out = {flags:{}}; return ${naive};`)()).toThrow(ReferenceError); // ...but throws

		const fixed = rename(run("out.flags.stonetop_pwd.custom"));
		expect(fixed).toBe('out.flags["stonetop-pwd"].custom');
	});
});

describe("regex literals", () => {
	// A regex holding an ODD number of quote characters used to flip the scanner into
	// string mode and silently swallow the rest of the file, so an object-literal key
	// fifty lines further down was missed. This is the shape that actually shipped in
	// module/seasons/seasons-chronicle.js.
	it("survives a regex containing quotes", () => {
		const src = [
			`const season = (m.match(/data-season="([^"]+)"/) ?? [])[1];`,
			`const d = { flags: { stonetop_pwd: { year: 1 } } };`
		].join("\n");
		expect(run(src)).toContain(`"stonetop_pwd": { year: 1 }`);
	});

	it("does not corrupt the regex itself", () => {
		const src = String.raw`const re = /<section class="a"[\s\S]*?<\/section>/g;`;
		expect(run(src)).toBe(src);
	});

	it("still treats division as division", () => {
		const src = "const r = total / count; const x = a.stonetop_pwd.b;";
		expect(run(src)).toBe(`const r = total / count; const x = a["stonetop_pwd"].b;`);
	});

	it("handles a regex right after return", () => {
		const src = `function f() { return /a"b/.test(s); }\nconst d = { stonetop_pwd: 1 };`;
		expect(run(src)).toContain(`"stonetop_pwd": 1`);
	});
});
