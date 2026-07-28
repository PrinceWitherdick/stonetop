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

7. Build the zip from the working tree. Contents sit at the ZIP ROOT (no wrapper folder) and `packs/src` must be excluded (only the compiled LevelDB pack dirs ship). The AI/TDM opt-out signals ship WITH the artifact so they travel to any mirror. The private book-art dirs (`assets/maps`, `assets/bestiary`, `assets/locations`) are gitignored but present in the working tree, so they MUST be stripped from the stage or they leak into the public zip:

   ```powershell
   $stage = Join-Path $env:TEMP "stonetop-release-stage"
   New-Item -ItemType Directory $stage -Force | Out-Null
   Copy-Item assets,languages,module,styles,templates,stonetop.js,system.json,LICENSE,README.md,AI-TRAINING-NOTICE.md,ai.txt,robots.txt,CITATION.cff,.well-known $stage -Recurse -Force

   # Packs: copy ONLY what system.json declares. `packs/` also accumulates stale output
   # from older versions that Foundry never loads (23 dirs / ~2.7MB as of 1.2.0).
   New-Item -ItemType Directory "$stage\packs" -Force | Out-Null
   $declared = (Get-Content system.json -Raw | ConvertFrom-Json).packs | ForEach-Object { $_.path.Split('/')[-1] }
   foreach ($p in $declared) { Copy-Item "packs\$p" "$stage\packs\$p" -Recurse -Force }

   foreach ($d in "maps","bestiary","locations") {
     $t = Join-Path $stage "assets\$d"
     if (Test-Path $t) { [System.IO.Directory]::Delete($t, $true) }
   }
   ```

   Build the zip by hand, NOT with `Compress-Archive`: on PowerShell 5.1 it writes entry
   names containing backslashes, which some extractors read as one long filename rather
   than a path.

   ```powershell
   & scripts\release\build-zip.ps1 -Source $stage -Destination "$stage\..\stonetop.zip"
   ```

   Before uploading, verify all four of these:

   - **No `coreVersion` stamps in the shipped packs**, via
     `node scripts/release/check-pack-stamps.mjs .` (exits non-zero on failure).
     `npm run pack` emits clean,
     version-agnostic packs, but if Foundry is launched between packing and zipping it
     re-stamps them in place, and a v13 client then refuses to migrate EVERY record in
     every pack ("Documents from a core version newer than the running version cannot be
     migrated"). It is pure log noise functionally, and completely invisible unless
     checked. This shipped broken in 1.2.0. Never launch Foundry between `npm run pack`
     and building the zip, and assert the stamps are absent before uploading.
   - `Get-ChildItem $stage\assets` shows no `maps`/`bestiary`/`locations`.
   - `AI-TRAINING-NOTICE.md`, `ai.txt`, `robots.txt`, `.well-known\tdmrep.json`,
     `CITATION.cff` are present at the stage root.
   - The zip has zero backslash entries, no wrapper folder, `system.json` at the root, and
     no `packs/src`.

8. Create the release on main and upload both assets (`stonetop.zip` and `system.json`):

   ```
   gh release create <VERSION> -R PrinceWitherdick/stonetop --target main --title "v<VERSION>" --notes "<NOTES>" <path>\stonetop.zip system.json
   ```

   For the notes, summarize user-facing changes since the previous release tag (`git log <PREV_TAG>..main --oneline`).

9. Verify the upload: re-download each asset from the release and SHA256-compare it against the local file (`Get-FileHash`). A stale file can land even when the upload exits 0. On mismatch, re-upload with `gh release upload <VERSION> <file> --clobber` and verify again.

10. Report the results. Remind the user that the manifest URL users paste into Foundry never changes:
    `https://github.com/PrinceWitherdick/stonetop/releases/latest/download/system.json`
