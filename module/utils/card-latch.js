// A chat card's once-only button: Bath of Healing Light, Go Back to the Shadow, the Invoke debility,
// Wielder's "Invoke now", Battle Joy's result. Each is latched on the MESSAGE, FIRST, so a second
// click, a re-render or another owner's client cannot do it twice, and each gives the card back when
// the work is backed out of or fails. The next render reads the flag, not the buttons, so a failure
// has to take the latch back as well as re-enable them.

import { SYSTEM_ID } from "../system-id.js";

/**
 * Disable `buttons`, write `flag` = `value` on the message, then run `work(release)`. `work` answers
 * whether the card's action happened: falsy gives the card back (the flag unset, the buttons enabled
 * again). A throw gives it back too, and is rethrown. `release` is handed to `work` for an action that
 * happened but leaves the card usable again (a roll at nobody).
 *
 * @param {ChatMessage} message
 * @param {string} flag  the message flag's key under the system scope (a dotted path is fine)
 * @param {*} value
 * @param {Iterable<HTMLButtonElement>} buttons
 * @param {(release: () => Promise<void>) => Promise<boolean>} work
 * @returns {Promise<boolean>}  whether the action happened
 */
export async function withCardLatch(message, flag, value, buttons, work) {
	for (const b of buttons) b.disabled = true;
	let latched = false;
	const release = async () => {
		if (latched) await message.unsetFlag(SYSTEM_ID, flag);
		latched = false;
		for (const b of buttons) b.disabled = false;
	};
	try {
		await message.setFlag(SYSTEM_ID, flag, value);
		latched = true;
		if (await work(release)) return true;
		await release();
		return false;
	} catch (err) {
		await release().catch(e => console.error(`Stonetop | could not release the ${flag} latch`, e));
		throw err;
	}
}
