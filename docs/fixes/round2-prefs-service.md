# Preferences transaction lifetime in the real GNOME extensions service

Baseline: staging integration `9024ec3`. Production correction is confined to
`openbar@neuromorph/prefs.js`; no commit, push, deployment or live desktop/dconf
access was performed. This supersedes the application-hold lifetime claim in
`round2-prefs.md`: that hold only works for application-owned windows, not the
production GNOME preferences host.

## Confirmed cause and native RED

The actual resource `ExtensionPrefsDialog` has `get_application() === null`, and
`Gio.Application.get_default()` is also null. `ExtensionsService` owns an
independent hold counter. Its `OpenExtensionPrefsAsync()` constructs the dialog,
connects `close-request` to delete `_prefsDialog` and release the service, and
holds the service. Its superclass auto-shuts down after two idle seconds.
The module is loaded asynchronously, so Open Bar's close handler is connected
**after** the host's handler. Returning true in that later handler alone cannot
undo the earlier host release.

Before modifying production, `bash tests/prefs-native.sh service` failed in
`/var/lib/hermes/.hermes/cache/scratch/openbar-prefs.R0ZKUb` with:

```
PASS actual service dialog has no GApplication
PASS real slow dconf child entered under transaction pause
FAIL actual ExtensionsService shutdown before transaction completion: import-export=true
```

The test exits the preferences process immediately on premature actual service
shutdown, rather than allowing the harness's main loop to rescue the promise.
The completed runner independently reproduces the same RED against the unchanged
baseline using `OPENBAR_PREFS_SOURCE_REF=9024ec3`: Shell50.4
`openbar-prefs.rvdld5`, Shell49.4 `openbar-prefs.glo6i8` (both exit 1).
Baseline overrides only replace a disposable independent source copy.

## Design: defer user close, then complete it

At transaction entry, before any pause or asynchronous work:

1. Retain the owning window. Enumerate currently **unblocked** `close-request`
   handler IDs on that window using native GObject signal lookup/find; temporarily
   block each one. This includes the earlier host handler without importing,
   identifying, replacing or accessing its private service instance.
2. Connect a temporary close guard that records a close request and returns true.
   The window stays open while accepted work completes. Repeated requests coalesce.
3. Await actual file I/O/child termination and status as before, restore both saved
   pause flags, synchronize the backend, and issue the successful import reload.
4. In the outer `finally`, remove the temporary guard, unblock only the IDs this
   transaction blocked, and replay one `window.close()` if requested. The original
   host handler now runs once; normal UI cleanup runs; service idle shutdown is
   allowed only after completion. Preblocked handlers stay blocked. Setup errors
   restore any already-blocked handlers before propagating.

This is object-local, reversible signal ownership, not a global prototype patch
or service monkeypatch. The existing application hold remains a supplemental
lifetime guarantee for other application-owned hosts. Import/export/reset share
this transaction boundary; overlap rejection and all existing restoration/error
paths remain intact. No accepted operation is cancelled or silently discarded.

The seven-argument `GObject.signal_handler_find()` form is intentional: GJS's
native compatibility overload supports `ID | UNBLOCKED` without requiring the
unknown host callback function. The newer JavaScript match-object block helpers
require a known callback and cannot solve host handler ordering.

## Real native verification

Run:

```
bash tests/prefs-native.sh service
bash tests/prefs-native.sh service-error
bash tests/prefs-native.sh transactions
bash tests/prefs-native.sh lifecycle
bash tests/prefs-native.sh layout
```

For Shell49.4 prepend
`REF=github:NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41`.
Default `nixpkgs` evaluated to Shell50.4/GTK4.22.4 (Mutter50.5); older ref to
Shell49.4/GTK4.20.3. Both use their actual packaged extensions resource.

All artifact paths below are under
`/var/lib/hermes/.hermes/cache/scratch/`:

| Mode | Assertions per runtime | Shell50.4 artifact | Shell49.4 artifact |
|---|---:|---|---|
| service | 12 | `openbar-prefs.cIyMRF` | `openbar-prefs.GDbCCP` |
| service-error | 12 | `openbar-prefs.v2zjue` | `openbar-prefs.AYUdx1` |
| transactions | 26 | `openbar-prefs.0vxlxE` | `openbar-prefs.X7CJmL` |
| lifecycle | 17 | `openbar-prefs.xr6Tkh` | `openbar-prefs.jBHmeO` |
| layout | 37 | `openbar-prefs.37U6XZ` | `openbar-prefs.1aJuj9` |

Programmatic result-file aggregation: 10 successful runs, 208 assertions, all
post-assertion completion markers present, no preferences JS ERROR/CRITICAL or
unhandled-promise output. `git diff --check` passed.

The service test calls actual `ExtensionsService.OpenExtensionPrefsAsync()`;
only the extension-info lookup returns fixture metadata. Dialog construction,
async module loading, host handler ordering, service holds, release and idle
shutdown are real. The successful child sleeps five seconds and **then executes
real `dconf load`**; native completion delivery is delayed another150ms. The test
closes twice during child execution, verifies service/dialog ownership and pause
at3.5s (past the two-second idle policy), awaits the child/result, verifies the
imported value and restored flags/reload, checks exactly one replay and untouched
preblocked handlers, and observes normal subsequent actual service shutdown.
A separate real dconf reader confirms durable restored pause. `service-error`
uses a real delayed child exiting23 with stderr, proves propagated failure,
unchanged imported setting, no success reload, restored flags and final shutdown.

Preserved tests cover real private dconf full-schema roundtrip, wallpaper
preservation, chooser cancel, prior pause values, file failures, invalid types,
snapshot/sync/spawn errors, nonzero child, overlap including reset, close during
pending completion, application hold balance, early/pre-realize destruction,
partial construction cleanup, provider/signals/timers, all13 layout pages at
640/820px with125% text, and the custom WindowMax preservation switch/binding.

Fixtures have separate HOME/XDG/bus/dconf profile and database inside scratch;
Shell remains on the memory backend. Runner copies dereferenced independent
content and checks both realpaths and file identity **before** appending the test
export or applying a source override. A sampled production/copy stat showed
regular files with different inodes and link count1.

## Limits and observable policy

- User close is deferred: the preferences window intentionally remains open
  until the accepted operation succeeds or fails, then closes automatically.
  No timeout fabricates success, and there is no fire-and-forget dconf child.
- Process kill, compositor/Shell disappearance, power loss and a permanently hung
  child are not crash recovery guarantees. A hung operation keeps the window
  open; no unsafe cancellation is introduced.
- Native production host handlers are installed before transactions, as verified
  on49/50. A hypothetical host installing an earlier-running close handler during
  an active transaction, or forcibly destroying the window rather than requesting
  close, is not certified. Existing standalone destroy tests still pass.
- Import remains prevalidated bounded sequential batches, not all-or-nothing
  rollback after a later batch failure; this predates and is unchanged by this fix.
- No physical desktop, all older GNOME versions or actual top-level D-Bus method
  transport certification is claimed. The host method itself and native resources
  execute, but metadata discovery/invocation are fixture inputs.
- Native Gtk.Grid/Adw introspection slow-path warnings, old fontconfig warnings
  and missing optional services in the private compositor are environmental.
