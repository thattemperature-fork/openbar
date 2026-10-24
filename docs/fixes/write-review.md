# Write-module review corrections

Scope: three reviewed defects only, in the shared integration worktree. No commit, push, deployment, extension.js edit, or CSS-rule edit by this fix agent. Existing parent/other-lane edits remain untouched. In stylesheets.js this agent changed only the two exported function declarations to `async`.

## Sources and diagnosis

Read `docs/fixes/writes.md`, `$TMPDIR/openbar-review-writes.js` and `$TMPDIR/openbar-review-styles.js` before changes.

- [Gio.File.replace_contents_finish](https://docs.gtk.org/gio/method.File.replace_contents_finish.html) returns the new etag of the successfully replaced document. This is the committed identity to record before a later fallible unlink; re-reading a path and adopting whatever happens to be there would incorrectly infer ownership.
- [JavaScript async function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function): an async call always returns a promise and uncaught exceptions reject it; work before the first await remains synchronous. No deferral of settings capture is required.
- Flatpak permission semantics/source links remain in `writes.md`; this correction changes only the per-instance ownership lifecycle, not permission syntax or APIs.

## RED → GREEN evidence

All runs used real disposable files, private HOME/XDG_CONFIG_HOME/XDG_DATA_HOME, memory GSettings, Nix GJS 1.88.1 / GLib 2.88.3, and unprivileged uid 994. Tests were added and run failing before each corresponding implementation change.

### 1. Flatpak revoked scopes across owner cycles

`flatpak-revoked-cycle` RED: `$TMPDIR/openbar-writes.s8Y60S/flatpak-revoked-cycle/result.log`, exit 1, “revoked scope must stay blocked across disable/re-enable; cleaned grant may return”. The test removes one real owned token externally, retains another, and adds independent permissions/keys/comments.

Fix: successful disable retains blocked/relinquished tokens for the same owner, clears the successfully removed additions, and resets key-presence bookkeeping for the next cycle. Latest keyfile data is still merged rather than restored from a stale snapshot.

First follow-up exposed a test-fixture mistake: its own KeyFile update used `NONE` and dropped the comment. Changed that independent update to `KEEP_COMMENTS`; no production change for this harness issue. Targeted GREEN: `$TMPDIR/openbar-writes.uc6kWa`, exit 0. Covers two cleanup/re-enable cycles, re-adding only the nonrevoked scope, and later independent changes to the blocked scope without adoption/removal.

### 2. GTK committed restore with failed backup unlink

`gtk-restore-unlink` RED: `$TMPDIR/openbar-writes.zMjsUW/gtk-restore-unlink/result.log`, exit 1, “GTK CSS changed outside Open Bar” when retrying disable after restore had committed.

Fault is a real permission failure: wrap delivery of the real Gio replacement callback to chmod the private GTK directory to 0500 after commit but before finish/caller continuation. Assert `Gio.IOErrorEnum.PERMISSION_DENIED` from actual backup unlink, restored original bytes, and retained backup; always restore mode 0700 in finally. No fabricated Gio result/error or mocked delete is used. This regression requires an unprivileged runner and intentionally fails rather than silently skipping if unlink is not denied.

Fix: record the restore's returned etag and exact original bytes immediately, mark `pendingCleanup` before unlink, and keep that state on failure. Retry validates both the restored target and backup identities before unlinking. New enable completes validated pending cleanup before a fresh backup/apply transaction. Changed target or backup rejects without adopting ownership or losing recovery data.

Targeted GREEN: `$TMPDIR/openbar-writes.Kzddhz`, exit 0. Test executes four real permission-failure transactions: disable retry (including repeat cleanup), new enable/restore, independent target edit, independent backup edit. Both retry/enable paths refuse independently edited files.

### 3. Promise contract for snapshot failures

`snapshot-rejection` RED: `$TMPDIR/openbar-writes.1b4EUv/snapshot-rejection/result.log`, exit 1, `reloadStyle sync=true catch=false, saveGtkCss sync=true catch=false`.

Fix: `export async function` for `reloadStyle` and `saveGtkCss`, without adding an await before snapshots. Targeted GREEN: `$TMPDIR/openbar-writes.l9Fbtg`, exit 0. Real fixtures/settings/filesystem, with one deliberately throwing settings getter for each export; asserts `.catch` receives the exact thrown error object and the getter ran before the export returned. Getter injection is the explicit boundary here: this case is a settings-snapshot failure test, not a real filesystem fault.

## Full validation

```sh
export GI_TYPELIB_PATH="$(nix eval --raw nixpkgs#pango.out.outPath)/lib/girepository-1.0:$(nix eval --raw nixpkgs#gobject-introspection.out.outPath)/lib/girepository-1.0:$(nix eval --raw nixpkgs#harfbuzz.out.outPath)/lib/girepository-1.0"
nix shell nixpkgs#gjs nixpkgs#glib.dev -c bash tests/run-write-tests.sh
git diff --check
bash -n tests/run-write-tests.sh
```

Final run: **23 distinct scenarios PASS**, exit 0, `$TMPDIR/openbar-writes.KisHm1`; exact aggregate stdout also at `$TMPDIR/openbar-write-review-suite.log`. Includes all original 20 scenarios and the three additions above. `git diff --check` and shell syntax validation exit 0. An earlier version-report command lacked pkg-config after a passing suite; reran the suite successfully and obtained GLib version directly from GJS (2.88.3).

`write-integrity.js` now refuses anything except the runner's private HOME/config/data (checks both environment and GLib-resolved paths) and memory settings before creating fixture files or settings. Negative guard probe using a different **disposable** config path exits 1 with “Private HOME/config/data and memory settings required”; verifies that path was not created. Log: `$TMPDIR/openbar-write-review-guard.log`. No live user configuration used.

## Boundaries and symlink qualification

The existing no-follow checks reject symlinks/nonregular objects at the **explicitly checked** GTK directory, GTK target/backup, Flatpak overrides directory, and global override file. They do **not** prove rejection of symlinked ancestors (for example, `$XDG_DATA_HOME/flatpak` may itself be a symlink while its `overrides` child appears to be a regular directory). Thus a blanket “never follows any symlink” or ancestor-containment/security claim is false. Ancestor traversal is outside these three corrections; no hostile same-UID filesystem-race boundary is claimed.

Ownership/blocked-scope state remains in-memory per owner instance, not crash-persistent. Indistinguishable identical-byte/identical-etag external rewrites remain outside observable ownership guarantees. This suite does not launch Flatpak sandboxes, validate live GTK provider reload, or claim native Shell lifecycle coverage.
