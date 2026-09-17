// What the Fight tab shows, built from a fight snapshot (fight-state.js#snapshotFight).
//
// PURE apart from the helpers handed in, so the whole tab can be rendered in a test from plain data.
//
// ONE CARD PER ENGAGEMENT (Book I p.414's "smaller engagements"), heroes on the left and foes on the
// right, then the fighters nobody is engaged with, the ones out of the fight, and the ones whose token
// is on another map. Each card carries our own short computed lines (fight-copy.js) and, folded away
// under "What the book says", the passages that apply, in the book's words with a page to open.
//
// THE TAB CARRIES EVERYTHING THE MAP OVERLAY DRAWS. A reader using a screen magnifier, or one who has
// switched the lines off, gets every engagement and every count here as text.

import { fighterReadout, gangedBadge, clusterFacts, clusterRuleKeys } from "./fight-copy.js";
import { fightRuleQuotes } from "./fight-rules.js";

/**
 * @param {object} p
 * @param {ReturnType<import("./fight-state.js").snapshotFight>} p.snapshot
 * @param {Map<string, {name: string, img: string, hidden?: boolean, defeated?: boolean,
 *   canPing?: boolean, group?: boolean, standing?: number|null, size?: number|null}>} p.rows
 *   what each combatant's row shows, keyed by combatant id (fighters and `elsewhere` alike)
 * @param {boolean} p.isGM
 * @param {(key: string, data?: object) => string} p.format
 * @param {(entry: {page: number, book: number}) => Array} p.cites  gm-toolkit/book-ref.js#bookPageCites
 * @param {Set<string>} [p.openRules]  which "What the book says" folds this reader left open
 */
export function fightTrackerView({ snapshot, rows, isGM = false, format, cites, openRules = new Set() }) {
	if (!snapshot) return null;
	const { result, fighters, elsewhere = [] } = snapshot;
	const sideOf = new Map(fighters.map(f => [f.id, f.side]));
	const nameOf = id => rows.get(id)?.name ?? fighters.find(f => f.id === id)?.name ?? "";
	const quotes = keys => fightRuleQuotes(keys, { isGM }).map(q => ({ key: q.key, text: q.text, cites: cites(q) }));

	const row = id => {
		const info = rows.get(id) ?? {};
		const side = sideOf.get(id) ?? null;
		const entry = result.byFighter[id];
		const badge = side ? gangedBadge(entry, side, format) : null;
		return {
			id,
			name: info.name ?? "",
			img: info.img ?? "",
			readout: side ? fighterReadout(entry, side, nameOf, format) : "",
			badge,
			standing: info.group && info.size
				? (info.standing == null
					? format("stonetop.fight.readout.together", { count: info.size })
					: format("stonetop.fight.readout.standing", { standing: info.standing, size: info.size }))
				: "",
			hidden: !!info.hidden,
			defeated: !!info.defeated,
			canPing: !!info.canPing,
			css: [info.hidden ? "hide" : "", info.defeated ? "defeated" : "", badge ? "is-ganged" : ""].filter(Boolean).join(" "),
		};
	};

	const clusters = result.clusters.map(cluster => {
		const ruleKey = `cluster:${[...cluster.heroIds, ...cluster.foeIds].sort().join(",")}`;
		const clusterQuotes = quotes(clusterRuleKeys(cluster, result.byFighter));
		return {
			id: cluster.id,
			heroes: cluster.heroIds.map(row),
			foes: cluster.foeIds.map(row),
			facts: clusterFacts(cluster, result.byFighter, nameOf, format),
			quotes: clusterQuotes,
			ruleKey,
			rulesOpen: openRules.has(ruleKey),
		};
	});

	const unengagedHeroes = result.unengaged.heroes.map(row);
	const unengagedFoes = result.unengaged.foes.map(row);
	const unengagedQuotes = unengagedFoes.length ? quotes(["unengagedFoes"]) : [];
	const out = [...result.out.heroes, ...result.out.foes].map(row);
	const away = elsewhere.map(combatant => ({ ...row(combatant.id), readout: "" }));
	const generalQuotes = quotes(["smallerEngagements", "noTurns", "mapsFocus"]);

	return {
		isGM,
		hasAnyone: fighters.some(f => f.visible !== false) || away.length > 0,
		clusters,
		unengaged: {
			heroes: unengagedHeroes,
			foes: unengagedFoes,
			quotes: unengagedQuotes,
			ruleKey: "unengaged",
			rulesOpen: openRules.has("unengaged"),
		},
		out,
		elsewhere: away,
		general: { quotes: generalQuotes, ruleKey: "general", rulesOpen: openRules.has("general") },
	};
}

