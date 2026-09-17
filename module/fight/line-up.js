// "Line everyone up": the heroes in a column on the left of what the GM is looking at, the foes in a
// column on the right, a few squares apart.
//
// AROUND THE VIEW, NOT THE SCENE'S EDGES. A fight happens in the part of the map in front of the
// table; lining up against the scene's own left and right edges would put the two sides a map apart
// on a large scene, often somewhere nobody is looking. (token-drop.js#clusterPoint centres a deploy
// on the view for the same reason.)
//
// NOBODY STARTS ENGAGED. The two inner columns sit `gap` whole squares apart, so a line-up never
// puts two tokens in contact (engagements.js#touching) and the fight begins with nobody fighting
// anybody until someone steps in.
//
// PURE. Positions come back as scene pixels on the grid, measured from the scene rectangle's own
// origin; fight/start-fight.js snaps them through core and moves the tokens.

/** A token's footprint in whole squares: a half-square token still takes up a square in a column. */
const squares = n => Math.max(1, Math.ceil(Number(n) || 1));

/**
 * Stack one side's tokens into columns, each no taller than `rows` squares.
 *
 * @param {Array<{id: string, w?: number, h?: number}>} tokens  in the order to stack them
 * @param {number} rows
 * @returns {Array<{width: number, height: number, items: Array<{id: string, w: number, h: number, row: number}>}>}
 */
function stackColumns(tokens, rows) {
	const columns = [];
	let column = null;
	for (const token of tokens) {
		const w = squares(token.w);
		const h = squares(token.h);
		if (!column || (column.height > 0 && column.height + h > rows)) {
			column = { width: 0, height: 0, items: [] };
			columns.push(column);
		}
		column.items.push({ id: token.id, w, h, row: column.height });
		column.height += h;
		column.width = Math.max(column.width, w);
	}
	return columns;
}

/**
 * Where everybody goes.
 *
 * @param {object} p
 * @param {{x: number, y: number, w: number, h: number}} p.view       the part of the scene in view, in scene pixels
 * @param {number} p.size                                              the grid size, in pixels
 * @param {{x: number, y: number, w: number, h: number}} p.sceneRect  the scene rectangle (tokens stay inside it)
 * @param {Array<{id: string, w?: number, h?: number}>} [p.heroes]    width and height in squares, in stacking order
 * @param {Array<{id: string, w?: number, h?: number}>} [p.foes]
 * @param {number} [p.gap=3]     empty squares between the two sides
 * @param {number} [p.margin=1]  squares left clear at the top and bottom of the view
 * @returns {Map<string, {x: number, y: number}>}  each token's top-left corner, in scene pixels
 */
export function lineUpPositions({ view, size, sceneRect, heroes = [], foes = [], gap = 3, margin = 1 } = {}) {
	const positions = new Map();
	const grid = Number(size) > 0 ? Number(size) : 100;
	const scene = sceneRect ?? { x: 0, y: 0, w: grid * 20, h: grid * 20 };
	const seen = view ?? scene;
	if (!heroes.length && !foes.length) return positions;

	// Everything below works in whole squares counted from the scene rectangle's corner.
	const sceneCols = Math.max(1, Math.floor(scene.w / grid));
	const sceneRows = Math.max(1, Math.floor(scene.h / grid));
	const midCol = Math.round((seen.x + seen.w / 2 - scene.x) / grid);
	const midRow = Math.round((seen.y + seen.h / 2 - scene.y) / grid);
	const rows = Math.max(1, Math.floor(seen.h / grid) - 2 * Math.max(0, margin));
	const space = Math.max(1, Math.round(gap));

	// The heroes' inner column ends `space / 2` squares left of the middle; the foes' begins `space`
	// squares after that. Further columns open OUTWARD, so the gap between the sides never shrinks.
	const heroEdge = midCol - Math.ceil(space / 2);
	const foeEdge = heroEdge + space;
	const placed = [];
	const place = (columns, outward) => {
		let edge = outward < 0 ? heroEdge : foeEdge;
		for (const column of columns) {
			const left = outward < 0 ? edge - column.width : edge;
			const top = midRow - Math.floor(column.height / 2);
			for (const item of column.items) placed.push({ id: item.id, col: left, row: top + item.row, w: item.w, h: item.h });
			edge = outward < 0 ? left : left + column.width;
		}
	};
	place(stackColumns(heroes, rows), -1);
	place(stackColumns(foes, rows), 1);

	// Slide the whole formation back onto the scene if it hangs off an edge (it keeps its shape
	// whenever it fits), then hold each token inside on its own for the ones that still do not.
	const minCol = Math.min(...placed.map(p => p.col));
	const maxCol = Math.max(...placed.map(p => p.col + p.w));
	const minRow = Math.min(...placed.map(p => p.row));
	const maxRow = Math.max(...placed.map(p => p.row + p.h));
	const shift = (lo, hi, limit) => (lo < 0 ? -lo : hi > limit ? Math.max(limit - hi, -lo) : 0);
	const dCol = shift(minCol, maxCol, sceneCols);
	const dRow = shift(minRow, maxRow, sceneRows);
	for (const p of placed) {
		const col = Math.min(Math.max(0, p.col + dCol), Math.max(0, sceneCols - p.w));
		const row = Math.min(Math.max(0, p.row + dRow), Math.max(0, sceneRows - p.h));
		positions.set(p.id, { x: scene.x + col * grid, y: scene.y + row * grid });
	}
	return positions;
}
