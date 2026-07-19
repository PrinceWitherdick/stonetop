// Single release switch for the Book Art / PDF-import feature: the bring-your-own-PDF
// "Import Book Art" macro (packs/src/stonetop-macros/import-book2-art.json) and every
// affordance that launches it. Held back until distribution of the extractor is approved.
//
// While this is false:
//   - hooks/Ready.js neither seeds the macro into the Macro Directory nor posts the
//     one-time "Import Your Book Art" reminder card;
//   - the first-session Welcome guide omits its "Import the book art" step;
//   - scripts/pack.js excludes the macro from the compiled `stonetop-macros` pack, so
//     the extractor never ships in the release zip (its source stays in git).
// The apply/display side (module/book2-art/reapply.js and friends) stays wired: it only
// re-points documents at art already on disk, so it is an inert no-op with nothing to
// apply, and any world that DID import art keeps it.
//
// Flip to true and re-run `npm run pack` to re-enable the whole feature in one place.
//
// Plain ESM with no Foundry dependencies so both the runtime (browser) and the Node
// pack-build script can import it.
export const BOOK_ART_IMPORT_ENABLED = false;
