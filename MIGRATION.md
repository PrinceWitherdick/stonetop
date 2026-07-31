# Moving to the renamed Stonetop system

Stonetop is changing the ID Foundry uses to identify it, from `stonetop_pwd` to
`stonetop-pwd`. Your world, its name, its folder and everything inside it stay exactly
where they are. Only the label connecting the world to the system changes.

Because the world never moves, your uploaded art, scene thumbnails, player passwords,
fog of war and chat history are all untouched. Nothing is copied to a new world.

---

## For GMs (self-hosted)

Pick a time when no players are logged in, then:

1. If a world is running, click **Game Settings → Return to Setup**.
2. On the **Game Worlds** tab, right-click your Stonetop world and choose **Take Backup**.
   Wait for it to finish. This is the only real undo. If there is no Take Backup in that
   menu, stop and get in touch: your Foundry has backups switched off.
3. Go to **Game Systems → Install System**, paste the manifest URL for the renamed
   system, and click Install:

   ```
   https://github.com/PrinceWitherdick/stonetop-pwd/releases/latest/download/system.json
   ```

   You will now have two Stonetop tiles. That is expected.
4. Launch your Stonetop world as normal.
5. A window titled **Stonetop is changing its ID** opens by itself. Click
   **Migrate this world**, then **Yes, migrate now** to confirm, then leave the tab alone.
   Foundry returns you to the setup screen when it is done. (If you are not ready, choose
   **Not now**. The window comes back next time you launch the world.)
6. Launch the world again. It finishes on its own and asks you to refresh the page once.

Then check three things: open a character sheet (playbook, inventory and arcana should
all be there), open the steading sheet (population, improvements and residents), and open
a scene with map pins (the pin labels). If anything is missing, stop and get in touch.

**Do steps 5 and 6 alone.** Do not let players back in until you have launched the world
again, let it finish, and done the one page refresh it asks for. The finishing pass runs
on your client only. A player who joins before it has run sees generic sheets instead of
Stonetop ones, and missing portraits.

**Players** then log in once from each browser they normally use. Their character, their
ownership of it and their password are all untouched, because the world never moves.

Their per-browser display preferences (sheet font and size, reduced motion, hover tips,
open-sheets-in-edit-mode) carry across automatically on that first load. If a sheet looks
like sections are missing, turn edit mode back on before worrying: Play mode hides Details
sections that were never filled in. Nothing is deleted.

If anyone is midway through character creation, have them finish or abandon it **before**
migration day. That draft lives only in their own browser and is not carried across.

**Leave the old system installed** until you have played a session and everything looks
right. It costs nothing and it is what makes rolling back possible. When you are ready to
tidy up, delete the tile titled **Stonetop (DEPRECATED)**. Foundry's setup screen never shows a
package's ID, so that title is the only way to tell the two apart. If you delete the wrong
one by mistake, nothing is lost: reinstall it from this manifest URL and the world comes
straight back.

```
https://github.com/PrinceWitherdick/stonetop/releases/latest/download/system.json
```

That is the **old** system, the one this page is helping you leave. It is here only so a
mis-click during step 5 is recoverable. Do not install it on a fresh Foundry.

Removing it is safe only *after* step 6 has run, because that is what rewrites the image
paths that still point at the old system folder. Verified: a migrated world with the old
system fully uninstalled opens its character and steading sheets with no broken images and
no errors. If you skip step 6 and delete the old system, those images break.

## If the assistant will not start

It refuses rather than risking your world, and tells you why. The usual reasons:

- **Someone else is logged in.** Everyone has to disconnect first.
- **The renamed system is not installed yet.** Do step 3.
- **A module is tied to the old system ID.** Disable or update it first. Modules scoped to
  a system are dropped from the world when the system changes, taking their compendiums
  and data with them.

It also warns without refusing when a **world compendium is locked**. Locked packs are
skipped, so unlock any that hold Stonetop data and check again.

## Hosted services (The Forge, Molten, and similar)

**The assistant will not perform the last step on a hosted Foundry.** That is deliberate,
not a bug. It does everything up to it, and hands you the rest.

Re-pointing a world at a different system needs Foundry's own setup route, and on a hosted
service we cannot establish that we have it. The Forge does not remove that route, but its
Game Manager launches worlds directly and bypasses it, and access is gated by Forge
*account ownership* rather than by your Foundry role, so being a Gamemaster in the world is
not enough. It is also the route you would use to undo a bad move.

We refuse on the hostname alone, which is blunter than we would like, because a better
check is not available: The Forge's own client integration decides it is on The Forge by
testing `location.hostname` against `.forge-vtt.com` and exposes no flag at all for whether
Game Manager is on. So a world where the flip would have worked and one where it would
strand the world look identical from inside. Since the flip is one-way, the assistant
refuses both rather than gambling with your world.

That refusal covers the re-pointing and nothing else. Copying your campaign data into the
new namespace needs no setup route, deletes nothing, and leaves the world running on
`stonetop_pwd` exactly as before, so the assistant still does that part for you.

### The steps

Everyone else disconnects. You are the only person logged in. Take a **Save Point** first if
your tier has them, and rehearse on a clone if you can.

1. Install the renamed system on your Forge account **first**, and confirm it is there:

   ```
   https://github.com/PrinceWitherdick/stonetop-pwd/releases/latest/download/system.json
   ```

   A world pointed at a system that is not installed will not launch, and on Game Manager
   the recovery screen may not be available to you.
2. Launch your Stonetop world as normal. The window titled **Stonetop is changing its ID**
   opens by itself and offers **Prepare this world**. Click it and let it finish. This is
   the step that carries your campaign across, and it is the one the old instructions here
   left out. (Bridge 1.3.3 or older shows a refusal instead of the button. Update the old
   system first, or see below.)
3. **Game Tools → Export World**, and save the zip locally. Keep it.
4. Unzip it and open the `world.json` inside.
5. Change `"system": "stonetop_pwd"` to `"system": "stonetop-pwd"` and save.
   You can change `id` and `title` too, if you would rather not overwrite the old world.
6. Re-import the edited world through the Import Wizard.
7. Launch as GM. It finishes on its own and may ask you to refresh the page once. Do that
   before letting players back in.

Then check the same three things as above: a character sheet, the steading sheet, and a
scene with map pins. In Game Settings the system should no longer read
**Stonetop (DEPRECATED)**.

**Step 2 is not optional.** Steps 3 to 7 re-point the world at the renamed system; they do
not touch a single actor. On their own they leave every sheet blank apart from its default
selections, because your campaign data is still filed under `stonetop_pwd` while the
renamed system reads `stonetop-pwd`. Nothing is lost when that happens, and restoring the
Save Point puts it back, but it looks exactly like the migration ate your world.

### If your bridge is older than 1.3.3.1

The **Prepare this world** button did not exist yet, so you'll need to either upgrade or do 
step 2 by hand instead. Launch the world on the old system, open the browser console with F12, 
and paste:

```js
const m = await import(foundry.utils.getRoute("systems/stonetop_pwd/module/migration/run.js"));
console.log("will copy:", await m.previewMigration(game));
console.log("done:", await m.prepareWorld(game, {
  onProgress: p => console.log(p.phase, `${p.index}/${p.total}`, p.label)
}));
```

That is the same code the button runs. Unlock any world compendiums holding Stonetop data
first: locked ones are skipped. Then carry on from step 3.

### If you have already imported and your sheets are empty

You have hit exactly the case above: the world moved, the data did not. It is still there.
Launch the world on the renamed system, open the console with F12, and paste:

```js
const m = await import(foundry.utils.getRoute("systems/stonetop-pwd/module/migration/run.js"));
const IDS = { source: "stonetop_pwd", target: "stonetop-pwd" };
console.log("will copy:", await m.previewMigration(game, IDS));
console.log("done:", await m.prepareWorld(game, { ...IDS,
  onProgress: p => console.log(p.phase, `${p.index}/${p.total}`, p.label) }));
```

Then press **F5**. The ids have to be spelled out here because the renamed system no longer
carries a rename target of its own. Your sheets should come back on the reload.

---

## Maintainer runbook

**The two packages live in separate repositories, and that is the whole design.** GitHub
gives a repository exactly one `releases/latest`, and there are two audiences that need
different things from it: existing installs have the old repo's `releases/latest` baked
into what they already downloaded, so it must keep serving the bridge, while everybody new
needs a URL that serves the current system and keeps updating. One repository cannot do
both without pinning somebody to a frozen version.

| | `PrinceWitherdick/stonetop` | `PrinceWitherdick/stonetop-pwd` |
|---|---|---|
| id | `stonetop_pwd` | `stonetop-pwd` |
| `releases/latest` | the bridge, frozen | current system |
| for | existing worlds only | **everyone new** |
| ends | archived once all are across | permanent home |

So a new user never sees the old repository, never installs the bridge, and never migrates.
Only a world created before the rename does.

The order still matters. The bridge must ship under the OLD id, because it is the only
thing that can open an existing world and move it across.

**The renamed system has to exist before anyone can migrate onto it.** The assistant's
preflight hard-blocks unless `systems/stonetop-pwd/system.json` is installed, and the
once-per-session offer in `module/migration/announce.js` does not even open the window
until that probe succeeds. So publishing the renamed package is not the last step, it is
the step that unblocks every user. Until it is published the bridge is inert and a GM who
installs it sees no migration window at all, which is correct behaviour and reads exactly
like a bug.

1. **Ship the bridge**: release `stonetop_pwd` (this tree). ✅ Done at 1.3.1.

   The release workflow patches the manifest on the way out, gated on the old id: it sets
   the title to `Stonetop (DEPRECATED)` and points `download` at the tagged version. Do not
   set the title in the tree, because this working tree IS the maintainer's installed
   system and a warning label in git would mark every one of their own worlds.

   `manifest` is deliberately left on `releases/latest` and is NOT pinned. It was pinned up
   to 1.3.2, which made each bridge release terminal: an install that took one re-checked
   its own tag forever and could never be told anything again, so a corrected move notice
   could not reach the people it was for. The reason for pinning is also gone, since it
   guarded against a renamed release taking Latest on this repository, which cannot happen
   now that the two packages are in separate repositories and `PUBLISHES_ID` independently
   demotes a foreign id. The verify step asserts the manifest is NOT pinned.

   Pinning matters because Foundry installs by the id in the REMOTE manifest, not the tile
   you clicked. The old repository's `releases/latest` must keep serving an old-id manifest
   for as long as any install still points at it, which is what the separate repositories
   above make easy: nothing new ever competes for that slot. The workflow enforces it too,
   passing `make_latest` from the built manifest's id so a renamed release published on the
   old repository by mistake is demoted rather than handed to every legacy install.
2. **Produce the renamed tree**: close Foundry, then

   ```
   node scripts/rename-system-id.js          # dry run, prints what would change
   node scripts/rename-system-id.js --apply
   npm run pack
   npx vitest run
   ```

   The codemod rewrites ~7,500 occurrences across ~876 files. It quotes object keys and
   brackets property access before the swap, because a hyphen is not legal in a JS
   identifier and `flags.stonetop-pwd.x` would parse as a subtraction rather than fail
   loudly. It skips itself, `.bak` files, and the compiled pack LevelDBs. Afterwards only
   `module/system-id.js` should still mention the old id, as the legacy fallback chain.

   **Do this on a branch, not on the mainline.** Applying it in place leaves no old-id tree
   to cut further bridge releases from, and the bridge has to stay releasable until the
   last user is across. Keep `develop`/`main` on the old id until step 4.
3. **Publish the renamed system** from that branch, as its own package with its own
   manifest URL. This is what unblocks every user, so it comes before they migrate, not
   after.

   It must not take the repository's Latest flag while step 1's constraint stands, or an
   old-id install on a pre-pinned build takes the renamed package from its Update button.
   The release workflow now enforces that rather than trusting you to remember: it reads
   the id back out of the built manifest and passes `make_latest` accordingly, so a renamed
   release is demoted even if it was published as Latest by hand. Retire that branch once
   everyone is off the old id and the renamed system should hold Latest.
4. **Confirm each user has migrated.** Hosted users get phase 1 from the assistant's hosted
   mode and do phase 2 themselves as export/edit/import, per the section above. Only once
   everyone is across is it safe to retire the old-id mainline and make the renamed tree
   the default.

   Hosted mode exists because the first hosted migration failed: the instructions here used
   to list the export/edit/import steps alone, which are phase 2 only. Phase 1 never ran, so
   the world arrived on the renamed system with every flag bag still under `stonetop_pwd`
   and every sheet blank apart from its defaults. `preflight`'s hosted refusal had been
   written for the flip, but it gated the whole assistant, so the one step that WAS safe on
   The Forge was refused along with the one that was not. It now takes `allowHosted`, which
   drops that single blocker and nothing else.
5. **Phase 3 is already wired.** `finishSystemIdMigration()` runs from the Ready hook
   (`module/migration/finish-run.js`), gated to the primary GM and stamped once per world
   in the `idMigrationFinishedFor` setting. It no-ops in a world with nothing stale, so it
   is harmless in the bridge and does the real work in the renamed tree. Nothing to add
   after the codemod.

   It sweeps asset paths, `_stats.compendiumSource`, per-document `flags.core.sheetClass`,
   and the `core.sheetClasses` / `core.compendiumConfiguration` world settings, then logs
   a residual count. The last two are read at init, so it asks for one page reload.

   Note Phase 3 does NOT delete the old `flags.<oldId>` bags. Phase 1 copies and never
   deletes, and leaving the originals is what keeps the flip reversible.

### Rehearsing

Copy the tree somewhere scratch, junction `node_modules` back to the real one, apply the
codemod there, and run the suite. Both trees are expected to be fully green. That
rehearsal is what caught the identifier-access and regex-scanning bugs; a lint or parse
check would not have, because the broken form still parses.
