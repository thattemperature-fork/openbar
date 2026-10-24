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
