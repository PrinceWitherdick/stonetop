/**
 * Re-points the running world at the renamed system.
 *
 * Verified against Foundry 14.363.0: the server's setup handler checks
 * `db.User.get(req.user)?.hasRole("GAMEMASTER")` BEFORE the admin gate, so a joined GM
 * can POST `editWorld` from inside the world with no admin password. A partial body
 * {action, id, system} is accepted, and `systemVersion` self-corrects on the next launch.
 *
 * Two verified traps this guards against:
 *  - A thrown server error comes back as HTTP 200 with an {error, stack} body, so the
 *    HTTP status alone never proves success.
 *  - `World.update` resolves the world with a strict get() that throws for a world whose
 *    system is missing. So the flip is a ONE-WAY DOOR: if the target is not installed,
 *    the world becomes unlaunchable with no in-app repair. Everything in preflight()
 *    exists to make that impossible.
 */

import { SYSTEM_ID, RENAME_TARGET_ID } from "../system-id.js";
import { list } from "./world-scan.js";

const defaultFetch = (...args) => globalThis.fetch(...args);
const setupRoute = () => globalThis.foundry?.utils?.getRoute?.("setup") ?? "/setup";

/** Normalize `relationships.systems` / `.requires`, which may be a Set, array or absent. */
function relationshipIds(value) {
	return list(value).map((entry) => (typeof entry === "string" ? entry : entry?.id)).filter(Boolean);
}

/**
 * Read the renamed system's manifest off the server. The one definition of "is the target
 * installed": both the once-per-session offer (announce.js) and the preflight gate below
 * decide from this, so they can never disagree.
 *
 * Resolves the parsed manifest, or null when it is absent/unreadable. Throws only for a
 * transport failure, which preflight reports differently from a plain 404.
 */
export async function fetchTargetManifest(target = RENAME_TARGET_ID, fetchImpl = defaultFetch) {
	// Null once the rename is done: there is nothing left to migrate to.
	if (!target) return null;
	const res = await fetchImpl(`systems/${target}/system.json`, { cache: "no-store" });
	return res?.ok ? await res.json() : null;
}

/**
 * Everything that must be true before the flip. Returns blockers (hard stops) separately
 * from warnings (worth telling the GM, not worth refusing over).
 */
export async function preflight(game, { target = RENAME_TARGET_ID, source = SYSTEM_ID, fetchImpl = defaultFetch } = {}) {
	const blockers = [];
	const warnings = [];

	if (!game?.user?.isGM) blockers.push("Only a Gamemaster can run this migration.");

	const others = list(game?.users).filter((u) => u.active && !u.isSelf);
	if (others.length) {
		blockers.push(`${others.length} other ${others.length === 1 ? "person is" : "people are"} logged in (${others.map(u => u.name).join(", ")}). Everyone must disconnect first.`);
	}

	// The one check that prevents the unrecoverable outcome: is the target really there?
	let manifest = null;
	try {
		manifest = await fetchTargetManifest(target, fetchImpl);
		if (!manifest) blockers.push(`The renamed system is not installed yet (looked for systems/${target}/system.json).`);
	} catch {
		blockers.push(`Could not check whether the renamed system is installed (systems/${target}/system.json).`);
	}

	if (manifest) {
		if (manifest.id !== target) {
			blockers.push(`The installed system reports id "${manifest.id}", not "${target}".`);
		}
		const generation = Number(game?.release?.generation ?? 0);
		const minimum = Number(manifest.compatibility?.minimum ?? 0);
		if (generation && minimum && minimum > generation) {
			blockers.push(`The renamed system needs Foundry v${minimum}; this server is v${generation}.`);
		}
		for (const id of relationshipIds(manifest.relationships?.requires)) {
			if (!game?.modules?.get?.(id)?.active) blockers.push(`The renamed system requires the module "${id}", which is not installed and active.`);
		}
	}

	// System-scoped modules are dropped from the world entirely after the flip, taking
	// their packs, flags and document subtypes with them. Keeping the old system
	// installed does not help, because the world no longer runs it.
	for (const module of list(game?.modules)) {
		if (!module.active) continue;
		if (relationshipIds(module.relationships?.systems).includes(source)) {
			blockers.push(`The module "${module.title ?? module.id}" is tied to the old system id and would be removed from this world. Disable or update it first.`);
		}
	}

	const invalid = game?.actors?.invalidDocumentIds?.size ?? 0;
	if (invalid) blockers.push(`${invalid} actor(s) in this world cannot be loaded. Fix those before migrating.`);

	if (game?.data?.options?.noBackups) {
		warnings.push("This server has backups disabled, so there is no built-in way to undo. Copy your world folder first.");
	}

	// world-scan skips locked world compendiums rather than unlocking them behind the
	// GM's back, so say so instead of reporting a document count that quietly omits them.
	const locked = list(game?.packs).filter((p) => p?.metadata?.packageType === "world" && p.locked);
	if (locked.length) {
		const names = locked.map((p) => p.metadata?.label ?? p.collection).join(", ");
		warnings.push(`${locked.length} locked world compendium(s) will be skipped (${names}). If any of them hold Stonetop data, unlock them and check again.`);
	}

	return { ok: blockers.length === 0, blockers, warnings, manifest };
}

/**
 * Perform the flip. Resolves {ok, error} — never throws for a server-side refusal, since
 * those arrive as a normal 200 response.
 */
export async function flipWorldSystem({ game, target = RENAME_TARGET_ID, fetchImpl = defaultFetch, route = setupRoute } = {}) {
	const worldId = game?.world?.id;
	if (!worldId) return { ok: false, error: "No active world." };

	let body;
	try {
		const res = await fetchImpl(route(), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "editWorld", id: worldId, system: target })
		});
		body = await res.json();
	} catch (err) {
		return { ok: false, error: err?.message ?? String(err) };
	}

	if (body?.error) return { ok: false, error: body.error };

	const applied = body?.system?.id ?? body?.system;
	if (applied && applied !== target) return { ok: false, error: `The server kept the system as "${applied}".` };
	return { ok: true };
}

/** Re-read world.json off disk to prove the change actually landed. */
export async function verifyFlip({ worldId, target = RENAME_TARGET_ID, fetchImpl = defaultFetch } = {}) {
	try {
		const res = await fetchImpl(`worlds/${worldId}/world.json?ts=${Date.now()}`, { cache: "no-store" });
		if (!res?.ok) return { ok: false, error: "Could not re-read world.json to confirm the change." };
		const manifest = await res.json();
		if (manifest.system !== target) return { ok: false, error: `world.json still says "${manifest.system}".`, system: manifest.system };
		return { ok: true, system: manifest.system };
	} catch (err) {
		return { ok: false, error: err?.message ?? String(err) };
	}
}

/**
 * Shut the world down immediately after a successful flip. Not optional: between the
 * flip and the restart, `game.world` points at the new system while `game.system` and
 * the loaded packs are still the old one, so anyone joining is served zero compendium
 * packs and a page refresh boots the new system's code against old server state.
 */
export async function shutdownWorld(game, { settleMs = 4000, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
	try {
		await game?.shutDown?.();
	} catch (err) {
		return { ok: false, error: err?.message ?? String(err) };
	}

	// `game.shutDown()` resolves NORMALLY when the GM declines its "other users are
	// connected" confirm — it simply returns. Treating that as success would report a
	// finished migration while leaving the session running past the flip, which is the one
	// state this must never end in. A real shutdown tears the socket down and navigates
	// away, so if we are still live and connected after settling, it did not happen.
	await wait(settleMs);
	const stillLive = game?.ready === true && game?.socket?.connected !== false;
	// `declined` distinguishes "resolved but nothing happened" from a thrown failure. The
	// user-facing wording lives in flipAndShutDown, which owns the one stop-sign message
	// both cases have to carry; `error` here is technical detail only.
	if (stillLive) return { ok: false, declined: true, error: "shutDown() returned without shutting the world down" };
	return { ok: true };
}
