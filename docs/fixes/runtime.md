# Runtime integrity fixes

## Item 1 — monitor loss and background rebinding

Research (GitHub API bodies/comments and PR diff read):
- https://github.com/neuromorph/openbar/pull/179 guards the two direct monitor dereferences; reporter tested display wake on GNOME 50.4. It does not address the unguarded primary background manager or duplicate permanent settings subscriptions.
- https://github.com/neuromorph/openbar/issues/99 and https://github.com/neuromorph/openbar/issues/99#issuecomment-2573449801 identify an empty LayoutManager monitor list in RDP; https://github.com/neuromorph/openbar/issues/99#issuecomment-5581464685 reports a similar local wake symptom. These are reports, not proof every suspend issue has this cause.
- https://github.com/neuromorph/openbar/issues/108#issuecomment-2734508437 confirms `panelMonitor is undefined`; adding unlock-dialog did not help.

Root causes: position/enable dereference an absent monitor; each monitor event connects the primary manager again plus all permanent settings subscriptions, never releasing the previous manager.

Plan: guard direct dereferences, track and replace the primary manager subscription, connect permanent settings once per enable cycle, refresh dimensions on rebinding. Tests execute the actual class source in Node VM (only GNOME host APIs replaced): empty startup, present/absent/present, idempotent subscriptions, dimensions, position reset while absent and cleanup. This is deterministic method coverage, not an RDP or physical hotplug reproduction.

Command: `nix shell nixpkgs#nodejs -c node tests/runtime-monitor.mjs`.
RED on baseline: `startup without monitors`, `Cannot read properties of undefined (reading 'x')`. GREEN after fix: `runtime monitor regression: PASS`. `git diff --check` passed.

## Item 3 — timers/signals (investigation)

- https://github.com/neuromorph/openbar/issues/145 reports loss of style after suspend on GNOME 49 without a stack trace.
- https://github.com/neuromorph/openbar/issues/182 similarly reports GNOME 51 suspend failure, without diagnostic evidence. Neither establishes a timer/native-crash cause.

Source confirms fullscreen/post-startup/calendar timeout IDs can be overwritten; ConnectManager does not track destroy handlers, clear its records, or prevent repeated connections. The extension settings changed handler is not managed. Partial enable can leave records unreachable if ConnectManager construction throws. Disable creates another calendar timeout while removing styles.

Plan: named coalescing timers, disconnect auxiliary destroy handlers and clear records, manage settings/window subscriptions, make disable safe after partial enable and do not create work during teardown. Independently coordinate stylesheet generation cancellation with the stylesheets lane; this lane does not change `stylesheets.js` and cannot cancel its internal async writes.

## Item 5 — appearance (investigation)

https://github.com/neuromorph/openbar/issues/106 requests restoration of accent on disable (no comments). Source confirms accent is written without backup; Yaru backups are taken only on feature toggle, not enable, and restoration blindly overwrites user changes. GTK and icon themes must be independently owned.

Plan: capture original/last-written values lazily at each first actual write, restore only while current equals last-written, release ownership on user changes, restore Yaru/icon independently on feature off or disable. Verify enable/change/disable, user override then another Open Bar write, repeated cycles, and feature already enabled at startup using isolated settings.

## Item 3 execution and integration notes

`nix shell nixpkgs#nodejs -c node tests/runtime-cleanup.mjs` failed before edits: fullscreen burst left **20** pending timers instead of **1**. After first green, an added window-actor duplicate regression failed **2** versus **1**, then passed with per-actor managed subscriptions. Final cleanup and monitor tests both PASS. The cleanup suite also covers auxiliary destroy hook removal, destroyed record release, repeated disable, pre-settings partial enable, callback exceptions, and post-disable enqueue rejection.

All extension.js timers now use named replacement/cancellation, including calendar teardown (which no longer schedules callbacks). Fitts observers have a separate manager so toggling that feature cannot accidentally disconnect permanent button visibility observers. Settings signal cleanup is explicit; ConnectManager is assigned before population so partial failures remain recoverable.

Native runtime test commands (private HOME/XDG, memory settings, private compositor, real exported enable/disable):

```sh
ref=nixpkgs # GNOME 50.4
# For GNOME 49.4:
# ref=github:NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41
mesa=$(nix eval --raw "$ref#mesa.outPath")
__EGL_VENDOR_LIBRARY_FILENAMES="$mesa/share/glvnd/egl_vendor.d/50_mesa.json" \
  nix shell "$ref#gnome-shell" "$ref#dbus" "$ref#glib.dev" "$ref#mesa" \
  -c bash tests/runtime-native.sh
```

Both **49.4 and 50.4: 16 native assertions passed**, clean extension logs. Artifacts: `/var/lib/hermes/.hermes/cache/scratch/openbar-runtime-test.IRJV1E` (49) and `openbar-runtime-test.RZzaCg` (50). A later native RED explicitly caught calendar injection restoration targeting the prototype instead of the injected instance (`openbar-runtime-test.OZo1Dp`); teardown now restores the exact instance and releases it. Includes native destroyed St actor, 20-event calendar/fullscreen/startup burst then disable while logically absent, a second full lifecycle, and injected failure at the real enable getSettings boundary followed by disable. Monitor transitions are synchronous logical LayoutManager list substitutions, not real Mutter hotplug/RDP. Restore lists before yielding to avoid violating unrelated Shell actor assumptions.

An initial native run caught a real cross-lane dependency: same-turn enable/disable leaves an unhandled rejection from stylesheets.js reloadStyle after settings are cleared (`openbar-runtime-test.QRlfYV/shell.log`). **Not fixed or suppressed here.** Final native tests explicitly let initial stylesheet work settle for 50ms before the event burst; consequently these passes do not claim disable-during-write safety. Stylesheets lane must cancel/invalidate its generations and capture settings before awaits. Static asset copy_async calls are likewise outside named JS timer cancellation. Existing default lifecycle runner also passed on GNOME 50.4: **24 assertions** (`openbar-lifecycle-test.wnfXps`). Missing isolated desktop services are expected warnings, not extension success criteria.
