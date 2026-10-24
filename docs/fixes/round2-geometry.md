# Round 2: bottom/WMax geometry, menu alpha dispatch, fullscreen policy

## Scope and source

Baseline `ffba24d4391e987fafbdf38fb9abb4fe4a0b91ae`; isolated branch
`work/openbar-r2-geometry`. Only the relevant `extension.js` geometry, settings
dispatch, stylesheet helpers and fullscreen callback were changed. No panel/menu
traversal method, generator algorithm, TODO, existing fix document, deployment or
live desktop setting was changed.

Fresh audit evidence: `openbar-reaudit/findings-1-79.md` F1/F2/F4 and
`findings-prs.md`/`probe-methods.mjs` (under the shared scratch directory).
Source contracts checked:

- `setPanelBoxPosition`, `setPanelBoxPosWindowMax`, `updatePanelStyle` and
  `setWindowMaxBar` in the packaged UUID directory.
- `stylesheets.js` normal independent-gap declarations and existing WMax margin
  selection/height, plus `reloadStyle`'s real asynchronous writer and
  `reloadstyle` notification. The existing bar-type/border policy is retained;
  this is not a redesign of WMax CSS or a rendered border/allocation claim.
- The schema keys are `mbgalpha` and `mbalpha`, not `mbgaplha`/`mbaplha`.
- Native St theme list uses the exact `Gio.File` target. Shell 50.4's
  `src/st/st-theme.c` was inspected when debugging a fixture: native repeated
  load without unload appends duplicate entries, so positive-control fixture
  refreshes use the production reload helper instead of loading twice.

## Plan and implementation

1. Correct only the two alpha-key spellings in the exclusion list. These keys
   should skip unrelated panel actor/geometry work. This **does not mean their
   CSS never updated before**: generation and the real reload notification
   already consume valid schema keys. Native generated-file assertions retain
   that positive control, including the existing light-mode border-alpha factor.
2. Route ordinary geometry/settings updates through the same active-policy
   helper used by WMax transitions. Restore `set-bottom-margin` when normal;
   retain the pre-existing WMax symmetric-margin policy when maximized.
   Remove state-only geometry early returns: current settings, scale, monitor
   and no-monitor return can change without `wmax`/position changing. Update
   both logical state fields even for Top/no monitors.
3. Enforce live settings, disabling state and the current panel monitor's
   fullscreen state in `loadStylesheet`, the common native-load boundary.
   Blocked loads unload and mark reset; successful loads clear reset. Overview
   and fullscreen callers no longer clear reset after a refused load. Queued
   reconciliation re-reads policy on execution, including opt-in after reset.

## Strict RED → GREEN evidence

Each behavior was tested against the actual current class before its fix:

| Slice | Observed RED | GREEN |
|---|---|---|
| Alpha dispatch | `mbgalpha must not run unrelated panel actor styling`: 1 vs 0 | Both real schema keys skip panel styling/placement |
| Normal return | `normal return restores independent window gap`: 59 vs 79 | y689, height79 at fixture scale1 |
| Active WMax settings/cache | height event used normal height84 vs expected46; after dispatch routing alone stale cached height41 vs46 | Current height/border/position/margins/settings and same-state refresh agree with active policy |
| Fullscreen ordinary reload | native file reappeared after actual `updatePanelStyle(...,'reloadstyle')` | File remains absent, reset true |
| Fullscreen flags | blocked Overview attempt falsely cleared reset | Reset remains true after refused load |
| Opt-in reconciliation | direct opt-in callback left reset stylesheet absent | Restores stylesheet and clears reset |

Retained native RED artifacts beneath shared scratch:
`openbar-round2-geometry.mCLq0R` (ordinary reload), `.HHD1Yo` (Overview flag),
`.Lpg5Bw` (direct opt-in). Corresponding logs name the failed assertions; process
exit0 alone was not accepted as success (no completion marker).

Early expanded native fixtures also exposed test-only problems: modern
Monitor.inFullscreen is a getter, repeated direct positive-control loads append
native duplicates, and light-mode menu border alpha is scaled by0.6. The final
fixture shadows/restores the host getter, uses reload for refresh, and checks the
existing generator's light/dark policy. Those intermediate failures are not
reported as production fixes.

## Tests and commands

```sh
nix shell nixpkgs#nodejs -c bash -c '
  node tests/round2-menu-alpha.mjs &&
  node tests/round2-geometry.mjs &&
  node tests/runtime-monitor.mjs &&
  node tests/runtime-cleanup.mjs &&
  node tests/runtime-appearance.mjs'

ref=nixpkgs
# Independent GNOME49.4 runtime:
# ref=github:NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41
mesa=$(nix eval --raw "$ref#mesa.outPath")
icons=$(nix eval --raw "$ref#adwaita-icon-theme.outPath")
XDG_DATA_DIRS="$icons/share:${XDG_DATA_DIRS:-}" \
__EGL_VENDOR_LIBRARY_FILENAMES="$mesa/share/glvnd/egl_vendor.d/50_mesa.json" \
 nix shell "$ref#gnome-shell" "$ref#dbus" "$ref#glib.dev" "$ref#glib.bin" \
 "$ref#mesa" "$ref#gjs" "$ref#adwaita-icon-theme" -c bash -c '
   bash tests/round2-geometry-native.sh && bash tests/runtime-native.sh'
```

- Node tests execute the actual class via the existing runtime harness. Only
  host APIs and unrelated actor-style boundaries are substituted. Geometry has
  **64 combinations**: Top/Bottom × four bar types × independent-gap off/on ×
  custom-WMax-margin off/on × scales1/2; repeated normal/WMax states, settings
  events, logical windows, empty-monitor return and relocated monitor controls.
  Explicit base measurements plus independently evaluated actual helper/event
  comparisons are used, not a copied placement implementation.
- Native tests use actual `Gio.Settings`, `St.ThemeContext`, native panelBox,
  actual imported methods, exported enable/disable, real generator/writes and
  native custom-stylesheet-list readback. Native geometry repeats the same64
  combinations with real scale-factor property1/2 (restored before yielding).
- Fullscreen covers direct load/reload, normal settings/reload notification,
  real generation, actual high-contrast setting on/off plus generation entry,
  initial enable, opt-in/out, Overview attempted restoration, another monitor,
  no monitors, same-turn disable/enable with queued generation, logical exit and
  disabling/late load. Actual writer tasks are awaited, not fabricated responses.

## Final results

| Runtime | New native suite | Existing runtime suite | Artifacts under shared scratch |
|---|---|---|---|
| GNOME50.4 | 890 assertions PASS | 26 assertions PASS | `openbar-round2-geometry.i4pUZl`; `openbar-runtime-test.qTx4oz` |
| GNOME49.4 | 890 assertions PASS | 26 assertions PASS | `openbar-round2-geometry.DJpqai`; `openbar-runtime-test.gForHi` |

Both native versions exited0 and wrote post-assertion completion markers. New
runner rejects extension stacks, detached-task errors, JS/GObject criticals,
unhandled promises and theme parser errors. Final runs had none of those.
Ambient isolated CalendarServer/GDM/IBus/audio/background warnings remain;
GNOME49 additionally has host Fontconfig warnings. Fast runtime-monitor,
runtime-cleanup, runtime-appearance and both new Node suites PASS. JS syntax,
runner `bash -n`, and `git diff --check` PASS.

## Limits

Logical monitor metadata/getter substitutions and actual method/window-list
fixtures do **not** prove physical fullscreen-app transport, pointer forwarding,
real maximize/move of application windows, hotplug, screen lock, authentication,
suspend/resume or native-crash prevention. This is not a GPU stress test. Native
49/50 were exercised; GNOME45–48 were not newly certified. Native geometry
assertions measure panelBox coordinates/height, not complete rasterized panel
allocation under every external stylesheet/third-party extension. No push or
deployment was performed.
