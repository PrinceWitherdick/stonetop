Publish a new release of this Stonetop FoundryVTT system to GitHub. Releases are done BY HAND from the local working tree: GitHub Actions are disabled on this repo and there is no release script.

**Hard rules**

- The target repo is `PrinceWitherdick/stonetop` ONLY. Pass `-R PrinceWitherdick/stonetop` on every `gh` command. Never reference or target taylor-nightingale/stonetop.
- Foundry VTT must be CLOSED before the pack rebuild and zip steps (it locks the LevelDB packs; `npm run pack` fails with EBUSY otherwise).
- Tag names have NO `v` prefix (`1.0.0`); the release title has one (`v1.0.0`).
- The zip is built from the WORKING TREE after `npm run pack`, never via `git archive` (the compiled packs are not tracked by git).

## Steps

1. Read the current `"version"` from `system.json`. Ask the user what the new version should be (suggest the next increment). Wait for their answer.

2. Preflight on `develop`: working tree clean and pushed, `npm test` passes, Foundry closed.

3. Bump `system.json`: set `"version"` to the new version and point `"download"` at the versioned zip URL `https://github.com/PrinceWitherdick/stonetop/releases/download/<VERSION>/stonetop.zip`. Leave `"manifest"` untouched; it always points at `releases/latest/download/system.json`.

4. Rebuild the compiled packs: `npm run pack`.

5. Commit the bump on `develop` as `[Release] Bump version to <VERSION>` and push.

6. Merge develop into main via PR: `gh pr create -R PrinceWitherdick/stonetop --base main --head develop`, then merge it (merge commit, not squash). The release tag will go on the resulting main merge commit.

7. Build the zip from the working tree. Contents sit at the ZIP ROOT (no wrapper folder) and `packs/src` must be excluded (only the compiled LevelDB pack dirs ship):

   ```powershell
   $stage = Join-Path $env:TEMP "stonetop-release-stage"
   Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
   New-Item -ItemType Directory $stage | Out-Null
   Copy-Item assets,languages,module,packs,styles,templates,stonetop.js,system.json,LICENSE $stage -Recurse
   Remove-Item "$stage\packs\src" -Recurse -Force
   Compress-Archive "$stage\*" "$stage\..\stonetop.zip" -Force
   ```

8. Create the release on main and upload both assets (`stonetop.zip` and `system.json`):

   ```
   gh release create <VERSION> -R PrinceWitherdick/stonetop --target main --title "v<VERSION>" --notes "<NOTES>" <path>\stonetop.zip system.json
   ```

   For the notes, summarize user-facing changes since the previous release tag (`git log <PREV_TAG>..main --oneline`).

9. Verify the upload: re-download each asset from the release and SHA256-compare it against the local file (`Get-FileHash`). A stale file can land even when the upload exits 0. On mismatch, re-upload with `gh release upload <VERSION> <file> --clobber` and verify again.

10. Report the results. Remind the user that the manifest URL users paste into Foundry never changes:
    `https://github.com/PrinceWitherdick/stonetop/releases/latest/download/system.json`
