// Regenerates robots.txt and ai.txt from the single source-of-truth bot list in
// scripts/ai-bots.txt. Run `npm run gen:ai-signals` after editing that list.
//
// By default it writes to the project root. Pass one or more `--out <dir>` to
// also emit into other checkouts (e.g. the user-site Pages repo that actually
// serves these at a host root):
//   node scripts/gen-ai-signals.js --out z:/tmp/princewitherdick.github.io
//
// robots.txt only takes effect when served from the ROOT of a host you control;
// in this repo it is a documented signal that travels with the release. See
// AI-TRAINING-NOTICE.md.

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTACT = "https://github.com/PrinceWitherdick/stonetop-pwd/issues";

async function loadBots() {
	const raw = await fs.readFile(path.join(ROOT, "scripts", "ai-bots.txt"), "utf8");
	const seen = new Set();
	const bots = [];
	for (const line of raw.split(/\r?\n/)) {
		const ua = line.trim();
		if (!ua || ua.startsWith("#")) continue;
		if (seen.has(ua)) continue; // drop exact duplicates; case variants are kept
		seen.add(ua);
		bots.push(ua);
	}
	return bots;
}

function robotsTxt(bots) {
	const header = [
		"# robots.txt - AI training / text-and-data-mining opt-out for the Stonetop",
		"# for Foundry VTT project. Rights reserved; see AI-TRAINING-NOTICE.md.",
		"#",
		"# robots.txt is only honored when served from the ROOT of a host you control",
		"# (a GitHub Pages site or your own domain); it has no effect on github.com.",
		"# It is included here as a documented signal that travels with the release and",
		"# activates automatically if this project is ever served from a host root.",
		"#",
		"# GENERATED FILE - edit scripts/ai-bots.txt and run `npm run gen:ai-signals`.",
		"",
		"# Block known AI-training and dataset crawlers.",
	];
	const blocks = bots.map(ua => `User-agent: ${ua}\nDisallow: /`);
	const catchAll = [
		"# All other crawlers are also disallowed.",
		"User-agent: *",
		"Disallow: /",
	];
	return header.join("\n") + "\n" + blocks.join("\n\n") + "\n\n" + catchAll.join("\n") + "\n";
}

function aiTxt(bots) {
	const header = [
		"# ai.txt - AI training / text-and-data-mining preferences for this project.",
		"# Rights reserved for TDM and AI training. See AI-TRAINING-NOTICE.md.",
		"# Machine-readable companion to robots.txt and /.well-known/tdmrep.json.",
		"#",
		"# This project (source, compiled artifacts, docs, and bundled content) may NOT be",
		"# used to train, fine-tune, or evaluate machine-learning or generative-AI models,",
		"# nor be included in datasets assembled for those purposes.",
		"#",
		"# GENERATED FILE - edit scripts/ai-bots.txt and run `npm run gen:ai-signals`.",
		"",
		"# Disallow all automated agents from AI-training use of this content.",
		"User-Agent: *",
		"Disallow: /",
		"",
		"# Named AI crawlers and dataset agents are explicitly disallowed.",
	];
	const named = bots.map(ua => `User-Agent: ${ua}`);
	return header.join("\n") + "\n" + named.join("\n") + "\nDisallow: /\n\n# Contact: " + CONTACT + "\n";
}

async function main() {
	const outDirs = [ROOT];
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--out" && argv[i + 1]) outDirs.push(path.resolve(argv[++i]));
	}

	const bots = await loadBots();
	for (const dir of outDirs) {
		await fs.writeFile(path.join(dir, "robots.txt"), robotsTxt(bots));
		await fs.writeFile(path.join(dir, "ai.txt"), aiTxt(bots));
		console.log(`  Wrote robots.txt + ai.txt (${bots.length} named agents) -> ${dir}`);
	}
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
