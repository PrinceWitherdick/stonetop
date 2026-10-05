// One document refusing its write must not cost every other document its repair, and must not be
// written off either. A sweep runs each write through `attempt`, which logs a failure and carries on,
// then calls `throwIfAny` at the end: the once-per-version gate (once-per-version.js) only stamps a
// sweep that returns, so one with a failure is run again on the next load, where everything already
// repaired is a no-op and only the document that failed is tried again.

export class SweepFailures {
	/** @param {string} what  the sweep, for the log ("refreshing seeded monsters") */
	constructor(what) {
		this.what = what;
		this.failed = [];
	}

	/** Run one document's write; a failure is logged and remembered, never thrown. */
	async attempt(where, write) {
		try {
			return await write();
		} catch (err) {
			console.error(`Stonetop | ${this.what}: ${where} could not be written`, err);
			this.failed.push(where);
			return undefined;
		}
	}

	/** Throw when anything failed, so the sweep is not stamped as done. */
	throwIfAny() {
		if (this.failed.length) throw new Error(`${this.what}: ${this.failed.length} could not be written (${this.failed.join(", ")})`);
	}
}
