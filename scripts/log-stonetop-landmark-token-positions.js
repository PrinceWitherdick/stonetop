/**
 * Foundry macro: log Stonetop landmark marker positions.
 *
 * 1. Open the Stonetop scene.
 * 2. Drop temporary tokens where each letter marker should appear.
 * 3. Name each token like "A - The Stone" or "B: The Granary".
 * 4. Select those tokens, then run this macro.
 *
 * The macro prints JSON to the console and tries to copy it to your clipboard.
 * Send that JSON back to Codex to bake the notes into the default scene.
 */

const tokens = canvas.tokens.controlled.length ? canvas.tokens.controlled : canvas.tokens.placeables;
const markerPattern = /^\s*([A-Z])\s*(?:[-:.)]\s*)?(.+?)\s*$/i;

const landmarks = tokens
	.map(token => {
		const name = token.document?.name ?? token.name ?? "";
		const match = name.match(markerPattern);
		if (!match) return null;

		const letter = match[1].toUpperCase();
		const landmarkName = match[2].trim();
		const center = token.center ?? {
			x: (token.document?.x ?? token.x ?? 0) + ((token.w ?? token.width ?? 0) / 2),
			y: (token.document?.y ?? token.y ?? 0) + ((token.h ?? token.height ?? 0) / 2),
		};

		return {
			letter,
			name: landmarkName,
			x: Math.round(center.x),
			y: Math.round(center.y),
		};
	})
	.filter(Boolean)
	.sort((a, b) => a.letter.localeCompare(b.letter, "en", { numeric: true }));

if (!landmarks.length) {
	ui.notifications.warn("No landmark tokens found. Name tokens like 'A - The Stone' and select them before running this macro.");
} else {
	const output = JSON.stringify(landmarks, null, 2);
	console.log("Stonetop landmark positions:", output);

	try {
		await navigator.clipboard.writeText(output);
		ui.notifications.info(`Copied ${landmarks.length} Stonetop landmark positions to clipboard.`);
	} catch (error) {
		ui.notifications.info(`Logged ${landmarks.length} Stonetop landmark positions to the console.`);
	}
}
