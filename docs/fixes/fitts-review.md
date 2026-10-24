# Fitts lifecycle review of the shared integration

## Scope and findings

The tests import the **actual integrated** `openbar@neuromorph/extension.js` (the runner snapshots that directory into private scratch and records matching source hashes). No old worker branch, duplicated production Fitts methods, live desktop, installed extension, or persistent settings are used.

### Already fixed by the merged integration — no further production change

1. **Repeated hide/show overwrote `destroyFittsId`, leaving old button destroy callbacks alive after disable.** The integrated `createFittsWidget()` already uses `if (!btn.destroyFittsId)`. Native GNOME 49.4 regression: eight hide/show cycles retain exactly one native destroy connection; feature disable leaves exactly **zero** connected IDs and no stored ID. Tests wrap the fixture container's `connect()` only to record native handler IDs, then query `GObject.signal_handler_is_connected()`; the real production signal implementation runs unchanged.
2. **A removed surviving button retained its visibility observer, recreated off-panel chrome, and escaped panel-only cleanup.** The integrated removal callback already disconnects `notify::visible` from its dedicated `_fittsConnections`, destroys chrome, disconnects `destroyFittsId`, and deletes the ID. Native regression removes the container without destroying it, reparents it to `Main.uiGroup`, then repeats hide/show. No off-panel widget or destroy hook reappears. Feature disable and actual exported extension disable both clean up. Reinsertion and feature re-enable reconnect the surviving button normally.

Before any production edit, `existing` passed on GNOME 49.4 (26 assertions). GNOME 50.4 `all` also passed (60 assertions) with the actual version gate; unlike the existing compatibility fixture, the new review suite does not spoof the native version to enable Fitts on 50.

### Newly reproduced remaining defect — fixed after RED

`createFittsWidget(box, btn)` checked active/version/settings policy but did **not** verify panel membership. After normal removal correctly released the observer, a direct/stale caller could still pass `Main.uiGroup` (or a former panel box) and create reactive chrome for the surviving off-panel button. Its absence from `panelBoxes` also meant normal disable could miss that chrome.

**Minimal production fix:** reject creation unless `box` is one of the extension's panel boxes **and** `btn.get_parent() === box`. This edits only the entry guard of `createFittsWidget()`.

### Additional reproduced defect — unrelated events cancelled corner recreation

`updateFittsWidgetAddRemove()` unconditionally cleared `fittsCornerTimeoutId` before checking whether a child event affected a corner. Removing the actual corner target scheduled recreation; adding an unrelated center button immediately afterwards cancelled that timer without scheduling a replacement or removing its ledger entry. Both corner widgets then remained absent.

**Strict RED:** native GNOME 49.4, `bash tests/fitts-review-run.sh corner`, artifact `openbar-fitts-review.JTvYaS`, runner exit 1; exact assertion `unrelated center addition preserves pending corner recreation`. This ran before the corresponding production fix.

**Minimal fix:** remove unconditional timer cancellation. Relevant corner changes already use `_queueTimeout('fittsCornerTimeoutId', ...)`, which coalesces replacements and owns ledger cleanup; unrelated events now leave that pending work intact. Regression removes the native physical corner target, reparents its surviving container, adds a real center button before 500 ms, then checks corner recreation after 650 ms and an empty timer field/ledger. GNOME 50 verifies the native gate produces no timers.

These two surgical edits (`createFittsWidget()` and `updateFittsWidgetAddRemove()`) are the only production changes made by this review, both inside the assigned Fitts method range. No other extension method or stylesheet was changed by this review.

## RED → GREEN evidence

All artifact directories below are under `/var/lib/hermes/.hermes/cache/scratch/`.

| Phase / runtime | Command in matching native environment | Result | Artifact directory |
| --- | --- | --- | --- |
| Before fix, GNOME 49.4 | `bash tests/fitts-review-run.sh existing` | PASS, 26 assertions | `openbar-fitts-review.BpTLcy` |
| **RED**, GNOME 49.4 | `bash tests/fitts-review-run.sh direct` | Runner exit 1; exact assertion: `direct off-panel parent rejected: no button chrome` | `openbar-fitts-review.ALpRdv` |
| Before fix, GNOME 50.4 | `bash tests/fitts-review-run.sh all` | PASS, 60 assertions, native 50 gate | `openbar-fitts-review.2mDzGi` |
| **GREEN**, GNOME 49.4 | `bash tests/fitts-review-run.sh all` | PASS, 66 assertions | `openbar-fitts-review.l4e4V5` |
| GREEN, GNOME 50.4 | `bash tests/fitts-review-run.sh all` | PASS, 60 assertions | `openbar-fitts-review.wSjRox` |
| Existing Fitts suite, GNOME 49.4 | `bash tests/widgets-run.sh fitts` | PASS, 32 assertions | `openbar-widgets.7BZAst` |
| Existing Fitts suite, GNOME 50.4 | `bash tests/widgets-run.sh fitts` | PASS, 32 assertions | `openbar-widgets.NhmQ3v` |
| **RED corner timer**, GNOME 49.4 | `bash tests/fitts-review-run.sh corner` | Runner exit 1, pending recreation incorrectly cancelled | `openbar-fitts-review.JTvYaS` |
| **Final GREEN**, GNOME 49.4 | `bash tests/fitts-review-run.sh all` | PASS, 75 assertions | `openbar-fitts-review.Uf095n` |
| **Final GREEN**, GNOME 50.4 | `bash tests/fitts-review-run.sh all` | PASS, 61 assertions | `openbar-fitts-review.Y9Wa1E` |
| Final existing Fitts suite, GNOME 49.4 | `bash tests/widgets-run.sh fitts` | PASS, 32 assertions | `openbar-widgets.kvrE1I` |
| Final existing Fitts suite, GNOME 50.4 | `bash tests/widgets-run.sh fitts` | PASS, 32 assertions | `openbar-widgets.PORxPY` |

The RED compositor itself exited 0 because the automation callback caught the assertion; the runner correctly failed for the absent completion marker. GREEN requires process success, the written completion marker, and no extension exception stacks/error messages. Private Shell logs contain missing ambient-service/font warnings (e.g. CalendarServer), not extension errors.

## Regression coverage

New files: `tests/fitts-review.js`, `tests/fitts-review-run.sh`.

- Native `PanelMenu.Button`, native container/chrome actors, real integrated Fitts methods and connection manager.
- Eight hide/show cycles; exact one destroy hook while active on supported runtime, exact zero after disable.
- Surviving container removal, reparent to `Main.uiGroup`, repeated visibility changes, feature disable, reinsertion and re-enable.
- Direct off-panel creation, former-panel-box arguments, and manually invoked stale visibility callbacks rejected before actor creation.
- Disable before any Fitts initialization; supported-runtime partial-enable interruption after chrome creation and before observer setup, followed by complete cleanup.
- Two real exported `enable()`/`disable()` cycles, waiting for the actual five-second enable callback; settings-driven feature disable/re-enable; off-panel visibility changes; native GNOME 50 exclusion; post-disable delay/visibility checks.
- Existing Fitts fixture retains physical LTR/RTL checks, Dash-to-Panel/settings gates, core-connection ownership, and late-button lifecycle coverage. Its native-control fixtures were not edited.

## Reproduction commands

Run from the integration worktree with `TMPDIR` set to private scratch. Each dependency set is internally matched.

```sh
ref=nixpkgs
# GNOME 49.4 alternative:
# ref=github:NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41
mesa=$(nix eval --raw "$ref#mesa.outPath")
__EGL_VENDOR_LIBRARY_FILENAMES="$mesa/share/glvnd/egl_vendor.d/50_mesa.json" \
  nix shell "$ref#gnome-shell" "$ref#dbus" "$ref#glib.dev" "$ref#mesa" \
  -c bash -ec 'bash tests/fitts-review-run.sh all; bash tests/widgets-run.sh fitts'
```

The runner creates private HOME/XDG directories and memory GSettings, unsets display/bus variables, starts a private DBus and software-rendered headless compositor, and copies/compiles schemas only in scratch. No commit, push, installation, or deployment was performed. Full parent integration-matrix ownership remains with the parent; this review ran the two targeted native suites on both runtimes.
