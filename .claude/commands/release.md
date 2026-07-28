Publish a new release of this Stonetop FoundryVTT system to GitHub.

**GitHub Actions ARE enabled, and `.github/workflows/release.yml` is authoritative for what
users download.** It fires on `release: published`, rebuilds `system.json` and
`stonetop.zip` from a clean checkout, and OVERWRITES whatever assets were attached by hand.
Anything that must reach users has to happen in that workflow, not in a local staging
directory. Verified the hard way at 1.3.0: hand-built assets were uploaded, verified by
SHA, and then silently replaced by the workflow's.

Two consequences worth holding onto:

- **Do not hand-build the zip.** It will be discarded. Change the workflow instead.
- **CI checks out from git**, so anything gitignored (the private book art under
  `assets/maps|bestiary|locations`, the compiled packs) is absent by construction, and
  anything *tracked* reaches the zip whether the manifest declares it or not.

**Hard rules**

- The target repo is `PrinceWitherdick/stonetop` ONLY. Pass `-R PrinceWitherdick/stonetop` on every `gh` command. Never reference or target taylor-nightingale/stonetop.
- Foundry VTT must be CLOSED before the pack rebuild and zip steps (it locks the LevelDB packs; `npm run pack` fails with EBUSY otherwise).
- Tag names have NO `v` prefix (`1.0.0`); the release title has one (`v1.0.0`).
- The shipped zip comes from CI, not from the working tree. Compiled packs are gitignored, so CI rebuilds them with `npm run pack` on a clean checkout.

## Steps

1. Read the current `"version"` from `system.json`. Ask the user what the new version should be (suggest the next increment). Wait for their answer.

2. Preflight on `develop`: working tree clean and pushed, `npm test` passes, Foundry closed.

3. Bump `system.json`: set `"version"` to the new version and point `"download"` at the versioned zip URL `https://github.com/PrinceWitherdick/stonetop/releases/download/<VERSION>/stonetop.zip`. Leave `"manifest"` untouched; it always points at `releases/latest/download/system.json`.

4. Rebuild the compiled packs locally only if you want to test the build: `npm run pack`.
   CI runs it too, from a clean checkout, and that is the copy that ships.

5. Commit the bump on `develop` as `[Release] Bump version to <VERSION>` and push.

6. Merge develop into main via PR: `gh pr create -R PrinceWitherdick/stonetop --base main --head develop`, then merge it (merge commit, not squash). The release tag will go on the resulting main merge commit.

7. **Do not build the zip.** `.github/workflows/release.yml` builds and uploads both
   assets when the release is published, and overwrites anything attached by hand. It
   already handles what the old by-hand recipe did:

   - excludes `packs/src`, and deletes any pack directory `system.json` does not declare
   - ships the AI/TDM opt-out signals (`AI-TRAINING-NOTICE.md`, `ai.txt`, `robots.txt`,
     `CITATION.cff`, `.well-known/`) so they travel to any mirror
   - asserts the private book-art dirs are absent, the version matches the tag, and every
     declared pack exists, and FAILS the release rather than shipping a bad artifact
   - sets the released title to `Stonetop (old ID)` while the package id is still
     `stonetop_pwd`, since Foundry's Setup screen shows a title and never an id

   If any of that needs to change, change the workflow. A local staging directory is
   wasted effort.

8. Create the release on main and upload both assets (`stonetop.zip` and `system.json`):

   ```
   gh release create <VERSION> -R PrinceWitherdick/stonetop --target main --title "v<VERSION>" --notes "<NOTES>" <path>\stonetop.zip system.json
   ```

   For the notes, summarize user-facing changes since the previous release tag (`git log <PREV_TAG>..main --oneline`).

9. Verify the upload: re-download each asset from the release and SHA256-compare it against the local file (`Get-FileHash`). A stale file can land even when the upload exits 0. On mismatch, re-upload with `gh release upload <VERSION> <file> --clobber` and verify again.

10. Report the results. Remind the user that the manifest URL users paste into Foundry never changes:
    `https://github.com/PrinceWitherdick/stonetop/releases/latest/download/system.json`
