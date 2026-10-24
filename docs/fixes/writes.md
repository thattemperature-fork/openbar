# Write/state integrity fixes (TODO 4, 11, 12)

Scope: `stylesheets.js`, write/ownership helper modules, isolated GJS tests. No extension lifecycle edits in this lane; no deployment or real user config writes.

## Research and diagnosis

### 4: asynchronous completion and generations
- https://github.com/neuromorph/openbar/issues/181 proposes asynchronous writes; baseline already uses async APIs but SVG helpers do not return completion, GTK uses async `forEach`, write errors are swallowed, and reload reads `_settings` after await even after disable.
- https://docs.gtk.org/gio/method.File.replace_contents_async.html requires calling the finish function inside the completion callback; cancellation is reported as an error.
- https://docs.gtk.org/gio/method.File.replace.html documents atomic replacement at **stream close**, not stream creation/write scheduling, and etag conflict detection.
- https://gjs.guide/guides/gio/file-operations.html documents promisification and the bytes variant retaining its input.

Ranked hypotheses: (1) GTK returns before any write completion (direct awaited-read repro); (2) SVG completion is invisible to reload (assert assets at reload signal); (3) swallowed errors still publish reload (invalid destination); (4) old continuations access cleared settings (disable while pending). Plan: completion promises using replace-contents finish (which includes close), a single per-instance serialized queue, reload generations, cancellation/invalidation on disable, synchronous settings snapshots before enqueue, publish only current successful generations.

### 11: GTK backup and ownership
- https://github.com/neuromorph/openbar/issues/120 reports existing GTK4 styles replaced; maintainer confirms generated GTK CSS overrides existing CSS. Not evidence of backup failure by itself.
- https://github.com/neuromorph/openbar/issues/109 reports custom edits being lost on regeneration.
- https://docs.gtk.org/gio/method.File.replace.html documents backup failure as fatal and etags for concurrent edits.
- https://docs.gtk.org/gio/flags.FileCreateFlags.html: REPLACE_DESTINATION replaces links rather than following them. Plan additionally refuses symlinks/nonregular GTK paths, backs up exclusively before first overwrite, records exact owned content, refuses regeneration/restoration after independent edits, never overwrites an existing backup, and restores only a still-owned target. Disposable filesystem tests must cover backup failure and real symlinks.

### 12: Flatpak idempotency and ownership
- https://github.com/neuromorph/openbar/issues/181 proposes idempotency, without proving ownership-safe removal.
- https://docs.flatpak.org/en/latest/flatpak-command-reference.html#flatpak-metadata documents Context/filesystems and GLib keyfile format.
- https://docs.flatpak.org/en/latest/sandbox-permissions.html documents permission names and read-only `:ro` suffix.
- Baseline replaces its original snapshot on each enable, concatenates duplicates, assumes filesystems exists, and restores a whole stale list. Plan: maintain only actually added tokens across repeated enable, merge latest keyfile on every write, deduplicate Open Bar additions, remove only owned unchanged tokens on disable, preserve independent keys and permissions. Conservative handling is required if an external actor replaces the same token (no way to prove intent from identical text).

## Validation log

### TODO 4
Reproduced RED: `gtk-completion` fails “GTK save must return a real completion promise”; delayed actual SVG callback test fails “reload before calendar-today.svg close”; invalid stylesheet destination fails “write failure must reject”; stale-disable fails missing hook; rapid triple reload fails “only latest queued generation publishes”.

Exact Nix command (GJS 1.88.1, GLib 2.88.3):
```sh
export GI_TYPELIB_PATH="$(nix eval --raw nixpkgs#pango.out.outPath)/lib/girepository-1.0:$(nix eval --raw nixpkgs#gobject-introspection.out.outPath)/lib/girepository-1.0:$(nix eval --raw nixpkgs#harfbuzz.out.outPath)/lib/girepository-1.0"
nix shell nixpkgs#gjs nixpkgs#glib.dev -c bash tests/run-write-tests.sh gtk-completion reload-completion reload-failure stale-disable active-disable latest-generation
```
GREEN: all six scenarios PASS; files/settings isolated by runner beneath `$TMPDIR/openbar-writes.*`. Active-disable starts real Gio replacement, invalidates, clears settings, awaits pending operation and GTK cleanup, and asserts no reload. Invalid destination uses a real directory, not a mocked success. SVG test delays real callbacks, never fakes filesystem contents. `git diff --check` passes. No native Shell lifecycle claim in this lane.

Implementation serializes **all** generated file writes per instance (not only reloads), snapshots settings synchronously, always emits coherent SVG sets, and leaves dirty flags intact on obsolete/failure paths. Internal replace-contents-bytes completion includes stream close/rename; no separately forgotten stream close. Only latest successful generation toggles reload. Cancellation cannot undo an already committed rename, so cleanup waits in the same queue.

### TODO 11
RED real filesystem: `gtk-backup-failure` uses a nonempty directory at the backup path and proves baseline logged the backup error then overwrote gtk.css. Additional c331579-baseline runs in `$TMPDIR/openbar-gtk-red.PYlblG` fail for lost edited generated CSS, accepted real symlink, and restored externally changed backup. These scenarios are not simulated Gio successes.

GREEN command: same GI_TYPELIB_PATH/Nix setup above, then:
```sh
nix shell nixpkgs#gjs nixpkgs#glib.dev -c bash tests/run-write-tests.sh gtk-backup-failure gtk-restore gtk-edits gtk-symlink gtk-backup-edit gtk-completion reload-completion reload-failure stale-disable active-disable latest-generation
```
All eleven PASS. Backup is an exclusive asynchronous copy (never move/overwrite), preserving the original until a successful replacement. The ledger holds exact content AND etag; the Open Bar header is not proof of ownership. Backup/file symlinks and nonregular paths are refused. Changed target or backup is preserved with a rejected promise and an actionable diagnostic. Original-less files use an exclusive create/await close before atomic replacement. GTK operations already in progress finish in queue before disable restore (not interrupted between backup and commit); generation invalidation still suppresses reload. A refusal in GTK3 does not prevent independent GTK4 cleanup.

Limitations: ledger is per extension instance, not a persistent crash-recovery journal. Existing legacy backups are never adopted or overwritten automatically; user recovery is safer than guessing ownership. Identical bytes rewritten by a user with the exact same etag are indistinguishable, as with other etag-based tools. Filesystem races by hostile same-UID processes are not a security boundary. No GTK application live-provider refresh test is claimed.

### TODO 12
RED: real updater against private override files fails repeated-enable dedup; missing filesystems; no-file enable/enable/disable; null-settings cleanup; real symlink refusal; real directory write failure. Baseline re-enable after user denial/permission change spuriously re-adds permissions (asserted **before** disable, since the baseline can accidentally restore that interim snapshot later). Additional baseline fixtures: `$TMPDIR/openbar-flatpak-red.pNm1ay`.

GREEN command (same GI_TYPELIB_PATH setup):
```sh
nix shell nixpkgs#gjs nixpkgs#glib.dev -c bash tests/run-write-tests.sh
```
Default runner executes all twenty scenarios, each in an isolated child process/private settings/config/data directories. All twenty PASS. Runner requires exact success output and no logged errors, preventing false positives from swallowed signal callback exceptions. The updater reads current keyfile each time, preserves comments/unrelated keys/preexisting grants, deduplicates new grants, and keeps only the added-token set (not a whole-list restore snapshot). Removed/changed/duplicated owned tokens are relinquished and not re-added in the same session. Missing Context/filesystems works. Disable without ownership creates nothing. The active-write disable test starts actual Gio replacement then invalidates and clears settings; serialized cleanup removes published grants afterward.

Limitations: ownership is per extension instance; crashes are not journaled. Identical user re-addition of exactly the same token between observations is indistinguishable; changed modes, denials, removals and duplicates are preserved conservatively. Conflicting same-path grant/denial is treated as user-owned and not overridden. Original-less global files may remain as an empty Context keyfile after cleanup, with **no granted filesystems**. No actual Flatpak app sandbox launch is claimed.

### Final regression checks
- Byte-preservation review caught lossy UTF8 restore of a non-UTF8 comment. Added `gtk-original-bytes`: RED failed exact-byte comparison; GREEN restores raw original bytes and compares ownership bytewise. Twenty scenario final run: all PASS, artifacts `$TMPDIR/openbar-writes.L6AkXn`.
- GNOME 50.4 native existing menu regression: `__EGL_VENDOR_LIBRARY_FILENAMES="$(nix eval --raw nixpkgs#mesa.out.outPath)/share/glvnd/egl_vendor.d/50_mesa.json" nix shell nixpkgs#gnome-shell nixpkgs#glib.dev nixpkgs#dbus -c bash tests/run-menu-tests.sh` → `PASS: 1319 assertions`, Shell exit 0, no JS/extension error matches in shell.log (`openbar-menu-test.OtCPTo`).
- Same Nix/Mesa command with `bash tests/run-date-menu-tests.sh lifecycle` → `PASS Shell 50.4: lifecycle: 24 assertions`, Shell exit 0 (`openbar-lifecycle-test.rv8WyV`). Existing default lifecycle smoke only; does NOT replace the required new parent begin/invalidate/error-handler wiring or prove optional-feature live UI refresh.
- Generator comparison: copy `01fb242:openbar@neuromorph/stylesheets.js` to scratch baseline, compile private schemas, `GSETTINGS_BACKEND=memory gjs -m tests/stylesheet-scope.js "$dir/baseline.js" "$dir"` in the same GJS Nix/GI setup → 553 assertions PASS, existing rule declarations/order unchanged, global modes byte-identical. No CSS rule content changed by this lane.

## Required parent/runtime integration

1. At the beginning of each `enable()` (before scheduling any style work): `StyleSheets.beginStyleWrites(this)`.
2. At the **beginning** of `disable()`, before settings are nulled or runtime files removed: `StyleSheets.invalidateStyleWrites(this)`. Synchronous invalidation marks all queued/active old work stale and cancels its Gio cancellable.
3. Keep existing `saveGtkCss(this, 'disable')`, but handle its returned promise. Disable cleanup is queued behind the active writer, bypasses pause/import flags, and reads no settings. Runtime-file removal must wait for the invalidation/drain promise (capture the old Gio.File, do not look up `this.obarRunDir` later). Do not delete runtime assets in the middle of active Gio replacement.
4. Every detached `reloadStyle`, `saveGtkCss` (and, after TODO12, `saveFlatpakOverrides`) call must attach `.catch(error => console.error(...))`; callbacks cannot be awaited by Shell's synchronous disable contract. Cleanup queue persists across re-enable to order old restore before new apply. Do not reset this state manually.
5. A caller may await these promises for sequencing. Do not wrap `saveGtkCss` *inside* another queued write: reload calls the internal nonqueue apply to avoid deadlock.

This file is the explicit requested lifecycle hand-off; `extension.js` is intentionally unchanged.
