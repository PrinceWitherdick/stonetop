import {isDefaultImg} from "../utils/strings.js";

const _STEADING_ACTOR_TYPE = "stonetop";
const _STEADING_ACTOR_NAME = "Stonetop";
const _STEADING_ACTOR_IMG = "systems/stonetop/assets/stonetop_image.webp";
const _LEGACY_STEADING_ACTOR_IMAGES = new Set([
	"systems/stonetop/assets/stonetop_image.png",
	"/systems/stonetop/assets/stonetop_image.png",
]);

export async function ensureStonetopSingleton() {
	if (!game.user.isGM || !_isPrimaryGM()) return;
	const existing = _getStonetopActors().at(0);
	if (existing) {
		await _ensureStartingValues(existing);
		return;
	}

	await Actor.create({
		name: _STEADING_ACTOR_NAME,
		type: _STEADING_ACTOR_TYPE,
		img: _STEADING_ACTOR_IMG,
		prototypeToken: {
			texture: { src: _STEADING_ACTOR_IMG },
		},
		system: {
			attributes: {
				surplus: { value: 1 },
			},
		},
	});
}

export function registerStonetopSingletonHooks() {
	Hooks.on("preCreateActor", (actor, data) => {
		if (!_isStonetopActorData(data ?? actor)) return;
		if (!_getStonetopActors().length) return;

		ui.notifications?.warn("This world already has a Stonetop sheet.");
		return false;
	});

	Hooks.on("preDeleteActor", actor => {
		if (!_isStonetopActorData(actor)) return;
		if (_getStonetopActors().length > 1) return;

		ui.notifications?.warn("The Stonetop sheet is required and cannot be deleted.");
		return false;
	});
}

function _getStonetopActors() {
	return game.actors?.filter(actor => _isStonetopActorData(actor)) ?? [];
}

function _isStonetopActorData(actor) {
	return actor?.type === _STEADING_ACTOR_TYPE || actor?.system?.customType === _STEADING_ACTOR_TYPE;
}

async function _ensureStartingValues(actor) {
	const updates = {};
	if (actor.system?.attributes?.surplus?.value === undefined || actor.system.attributes.surplus.value === null) {
		updates["system.attributes.surplus.value"] = 1;
	}
	if (_shouldReplaceSteadingImg(actor.img)) updates.img = _STEADING_ACTOR_IMG;
	if (_shouldReplaceSteadingImg(actor.prototypeToken?.texture?.src)) updates["prototypeToken.texture.src"] = _STEADING_ACTOR_IMG;
	if (Object.keys(updates).length) await actor.update(updates);
}

function _shouldReplaceSteadingImg(img) {
	return isDefaultImg(img) || _LEGACY_STEADING_ACTOR_IMAGES.has(img);
}

function _isPrimaryGM() {
	const activeGM = game.users?.activeGM;
	if (activeGM) return activeGM.id === game.user.id;

	const firstActiveGM = game.users?.find(user => user.active && user.isGM);
	return !firstActiveGM || firstActiveGM.id === game.user.id;
}
