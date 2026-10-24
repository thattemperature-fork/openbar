# Widget fixes (baseline 1aa1eb3)

All commands run in the `work/openbar-widgets` scratch worktree. No installation,
user settings, push, deployment or TODO edits. Tests use private HOME/XDG/bus,
memory settings, software Mesa and real headless GNOME Shell actors/theme nodes.

## Commands

From this worktree, for each mode listed below:

```sh
# GNOME 50.4; use the pinned ref below for GNOME 49.4.
ref=nixpkgs
# ref=github:NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41
mesa=$(nix eval --raw "$ref#mesa.outPath")
__EGL_VENDOR_LIBRARY_FILENAMES="$mesa/share/glvnd/egl_vendor.d/50_mesa.json" \
  nix shell "$ref#gnome-shell" "$ref#dbus" "$ref#glib.dev" "$ref#mesa" \
  -c bash tests/widgets-run.sh quick
```

Completion requires zero process exit, an assertion result and no test/extension
exceptions or CSS parsing errors. Missing CalendarServer, GDM, IBus, audio,
colord and other isolated-desktop services remain visible in logs; these are
not silently represented as extension failures. Different CSS filenames per
load avoid St stylesheet-cache reuse after high-contrast replaces the theme.

## 7 — Quick Settings split controls

Sources researched:
- [#114 discussion](https://github.com/neuromorph/openbar/issues/114): radius
  missing on expansion buttons since GNOME 48; reports distinguish native
  Adwaita from stale third-party themes.
- [#170 discussion](https://github.com/neuromorph/openbar/issues/170): native
  accent line with a different custom accent; another fork did not fix the
  reporter's GNOME 48 case.
- Tagged [49.4 quickSettings.js](https://github.com/GNOME/gnome-shell/blob/49.4/js/ui/quickSettings.js)
  and [50.4 quickSettings.js](https://github.com/GNOME/gnome-shell/blob/50.4/js/ui/quickSettings.js):
  `QuickMenuToggle` has distinct `quick-toggle-menu-button` and separator actors.
- Tagged [49.4 SCSS](https://github.com/GNOME/gnome-shell/blob/49.4/data/theme/gnome-shell-sass/widgets/_quick-settings.scss)
  and [50.4 SCSS](https://github.com/GNOME/gnome-shell/blob/50.4/data/theme/gnome-shell-sass/widgets/_quick-settings.scss):
  split corner rules and separator checked color explicitly use native accent.

Root cause/plan: existing radius/base styling targets `quick-toggle-arrow`,
not the modern menu button; existing menu-button checked alpha is multiplied
by 1.2; separator has no override. Retain old selectors, add modern physical
LTR/RTL radii and match the toggle's full state palette/alpha; color separators
from custom foreground, not the native accent.

RED, before CSS edits: GNOME 50.4 native menu button radius at configured zero
was `[0,999,999,0]`, expected `[0,0,0,0]`. Log:
`$TMPDIR/openbar-widgets.oScvlh/shell.log`.

GREEN: `widgets-run.sh quick` passed **768 assertions on each of 49.4/50.4**.
Artifacts: `$TMPDIR/openbar-widgets.KqAouY` (49), `openbar-widgets.02t06v` (50).
Coverage: actual split and standalone toggles, radii 0/11, both directions,
normal/hover/focus/active/checked combinations, alpha 0.65/0.7, scoped/global
menu CSS, normal/high-contrast Shell themes, native blue/purple accent changes
with explicit custom separator-color assertions. `git diff --check` and
`bash -n tests/widgets-run.sh` passed.

Limitation: a `QuickMenuToggle` whose menu is disabled still has hidden siblings,
so native `:last-child` does not restore its inner corners. Standalone unsplit
`QuickToggle` is covered; dynamically hidden expansion-button topology is not
changed by this CSS-only fix. No screenshot/interactive visual claim.

## 8 — Native switches and checkboxes

Sources: tagged [46.0 switches](https://github.com/GNOME/gnome-shell/blob/46.0/data/theme/gnome-shell-sass/widgets/_switches.scss)
/ [checkboxes](https://github.com/GNOME/gnome-shell/blob/46.0/data/theme/gnome-shell-sass/widgets/_check-box.scss)
use SVGs. Tagged [47.0 switches](https://github.com/GNOME/gnome-shell/blob/47.0/data/theme/gnome-shell-sass/widgets/_switches.scss)
/ [checkboxes](https://github.com/GNOME/gnome-shell/blob/47.0/data/theme/gnome-shell-sass/widgets/_check-box.scss)
introduce `.handle` and `StIcon` styling; same architecture checked in 48.0,
49.4 and 50.4. Native [49.4 popupMenu.js](https://github.com/GNOME/gnome-shell/blob/49.4/js/ui/popupMenu.js)
and [checkBox.js](https://github.com/GNOME/gnome-shell/blob/49.4/js/ui/checkBox.js),
and corresponding 50.4 tags, construct those actual actors. There is no linked
widget-specific discussion in TODO item 8; #114/#170 discuss adjacent theme
compatibility but are not claimed as checkbox reproductions.

Root cause/plan: legacy SVG rules remain unconditionally enabled, while the
native checkbox's accent is painted on an unstyled StIcon, not StBin. Branch
at Shell 47; preserve legacy SVG rules and HC filenames, share one control CSS
helper between scoped menu and global accent styling. Retain native handle,
geometry/status icons/behavior; override custom checked/hover/active/focus
palette, unchecked outline and HC opacity without duplicate backgrounds.

RED: `widgets-run.sh switches` failed on native switch image (`{} != null`)
before production edits; `$TMPDIR/openbar-widgets.HuvtkE/shell.log`.
GREEN: **660 assertions each on 49.4/50.4**, final artifacts
`$TMPDIR/openbar-widgets.kk6J1a` / `openbar-widgets.JRcHtM`.
Scoped/global-menu/global-accent modes, LTR/RTL, normal/HC, unchecked/checked,
hover/focus/active, custom accent vs native accent, retained native handles,
no duplicate switch/checkbox images and custom focus-ring color are covered.
Legacy-shaped St actors with generator version 45 assert all checkbox SVG
states and both switch HC/normal filenames using the actual St parser. This
is **not** a GNOME 45/46 runtime test or legacy image-pixel comparison.

Harness correction: St pseudo-class lists are space-separated, not colon-
separated. Compound-state tests were corrected and rerun for item 7: **768**
assertions pass on each version (`openbar-widgets.dLERMB` 49,
`openbar-widgets.Vqj78s` 50). Ordinary-menu suite also passed **1319** assertions
on 49.4 (`openbar-menu-test.6LLPbi`). Existing ordinary-menu compound pseudo
fixtures use colon-separated strings, so that old suite's compound-state
coverage should not be overstated; the new widget suite uses correct lists.

## 13 — Window-max gradient reset

Researched [#163](https://github.com/neuromorph/openbar/issues/163): Islands
end color remains when Keep Button Color is disabled (reported GNOME 46).
Tagged [49.4 St theme-node source](https://github.com/GNOME/gnome-shell/blob/49.4/src/st/st-theme-node.c)
and [50.4](https://github.com/GNOME/gnome-shell/blob/50.4/src/st/st-theme-node.c)
parse `background-color` independently of `background-gradient-direction`;
`none` sets `ST_GRADIENT_NONE`. Merely clearing color leaves gradient rendering
active. The start property shares the background-color storage, while the end
color is separate: removing the gradient *direction* is the correct reset,
not replacing a currently selected solid color with transparent gradient stops.

Plan/fix: reset the panel gradient in windowmax mode for Mainland/Floating;
reset button gradients only when `buttonbg-wmax` is false for Islands/Trilands.
Keep configured gradients when that option is true; normal-state CSS restores
original gradients after removing the windowmax pseudo class.

RED: native GNOME 50.4 theme-node gradient remained `HORIZONTAL (2)` instead of
`NONE (0)` for Islands, gradient=true/keep=false, before CSS edits. Artifact:
`$TMPDIR/openbar-widgets.z6c7B4`.
GREEN: `widgets-run.sh gradient`, **128 assertions on each of 49.4/50.4**;
artifacts `openbar-widgets.nKTc8B` / `openbar-widgets.5hZiEj`.
All four bar types × gradient on/off × buttonbg-wmax on/off, windowmax
add/remove transitions, selected solid panel color/alpha, transparent button
background, reset persistence under hover/focus/active/checked are covered.
This is an actual compositor/St CSS reproduction, not a real application's
maximize event/animation test. No interactive maximize claim.

## 14 — Fitts policy, physical bounds, ownership and session return

Research:
- [PR #178](https://github.com/neuromorph/openbar/pull/178) and its downloaded
  diff only gate settings/startup, not position-change or pending callbacks.
  It reports conflict with GNOME 50 window dragging; **no interactive gesture
  reproduction is claimed here**.
- Tagged [50.4 panel.js](https://github.com/GNOME/gnome-shell/blob/50.4/js/ui/panel.js)
  attaches the `window-drag` ClickGesture; tagged
  [49.4 panel.js](https://github.com/GNOME/gnome-shell/blob/49.4/js/ui/panel.js)
  uses the older button/touch handlers. Both allocate logical `_leftBox` on
  physical right and `_rightBox` on physical left in RTL.
- [#154](https://github.com/neuromorph/openbar/issues/154) reports Persian/RTL
  corners blocking Quick Settings. [#153](https://github.com/neuromorph/openbar/issues/153)
  reports lost proximity after unlock on 48.4.
- [PR #84 discussion](https://github.com/neuromorph/openbar/pull/84) explains
  why adding unlock-dialog metadata is not a general fix: extension rebasing
  can cause repeated enable/disable.
- Tagged [49.4 sessionMode.js](https://github.com/GNOME/gnome-shell/blob/49.4/js/ui/sessionMode.js)
  and [extensionSystem.js](https://github.com/GNOME/gnome-shell/blob/49.4/js/ui/extensionSystem.js),
  plus corresponding 50.4 tags: metadata defaults to user mode, mode changes
  deactivate/reactivate extensions. Retain that policy, do not add lock mode.

Plan/fix:
1. One `supportsFittsWidgets()` policy used by enable and both actor creation
   methods: Shell <50, setting enabled, no Dash-to-Panel and not disabling.
   `_fittsActive` prevents stale direct actor callbacks after disable.
2. Find corner targets by actual transformed physical bounds (all three boxes),
   not logical box or child-list order. Compute left/right bounds independently,
   clamp to panelBox and track native allocations/visibility with widget-owned
   connections. No symmetric left-box-width assumption in RTL.
3. Make enable idempotent, cancel both Fitts timers on disable; own Fitts-only
   signals with a disposable St owner instead of disconnecting *all* matching
   core style signals. Retain exactly one per-button destroy hook across hide/
   show recreation. These changes stay inside Fitts methods only.

RED evidence (all before the relevant implementation slice):
- `openbar-widgets.gsEOoS`: GNOME 50 enable still created corners.
- `openbar-widgets.1QPc15`: RTL physical order was QuickSettings at x=0,
  DateMenu at 424, Activities at 869, fixture at 964; old left target was not
  physical leftmost. This is an actual native allocation reproduction.
- `openbar-widgets.Aj5qr8`: inactive Fitts disable removed two unrelated core
  signal registrations (`0 != 2`).
- `openbar-widgets.chrJC1`: repeated visibility yielded four destroy callbacks
  instead of one; `openbar-widgets.Ua3pbL` exposed late signals in core manager.

GREEN: `widgets-run.sh fitts` **32 assertions each on 49.4/50.4**. Real native
panel buttons, LTR/RTL allocations/bounds, GNOME 50 direct+corner+enable policy,
setting and Dash-to-Panel gates, hide/show/late add/remove, idempotent enable,
single destroy hook, core signal preservation, disabled callback guard.
Supported Fitts behavior is also exercised in-memory with gnomeVersion=49 on
Shell 50 (not a claim that Fitts is enabled on actual GNOME 50).

`widgets-run.sh fitts-lifecycle`: real exported extension, two full enable/
disable cycles, real delayed startup, real position-change settings Top→Bottom
→Top, real setting toggle, no resurrection: **12 assertions on 49.4**, **8 on
50.4**. `widgets-run.sh fitts-session` registers the real extension with the
native ExtensionManager, then performs two native sessionMode push/pop
unlock-dialog/user transitions: **12 assertions on each version**, including
manager ACTIVE/INACTIVE states and Fitts restoration (<50) / absence (50).
**This does not invoke ScreenShield, lock authentication, suspend or physical
pointer/touch input. #153's interactive symptom was not reproduced; session
return passes, not a proven universal unlock fix.**

Integration hooks for the runtime lane/parent: no lifecycle edits required for
safety because existing startup/settings/position callers enter the centralized
policy. Optionally avoid scheduling the five-second startup timer at all when
`supportsFittsWidgets()` is false, but keep the method-level policy. Do not
reset `_fittsActive` without first destroying `_fittsSignalOwner`; normal
`disableFittsWidgets()` owns both and clears Fitts timer IDs. No changes were
made to generic ConnectManager or stylesheet write orchestration.

## Final execution snapshot

Commands above with each mode, on matching Shell/Mesa refs; all exited zero
and wrote results. `git diff --check` and `bash -n tests/widgets-run.sh` pass.
Final artifact basenames beneath `$TMPDIR`:

| Mode | 49.4 | 50.4 | Assertions (49/50) |
|---|---|---|---|
| quick | openbar-widgets.KPK55t | openbar-widgets.Yg8Sq7 | 768 / 768 |
| switches | openbar-widgets.avTJmj | openbar-widgets.uxeL1P | 660 / 660 |
| gradient | openbar-widgets.tY4hSj | openbar-widgets.YbjbeG | 128 / 128 |
| fitts | openbar-widgets.tQI0GL | openbar-widgets.NmiXsL | 32 / 32 |
| fitts-lifecycle | openbar-widgets.eJJ51s | openbar-widgets.totwgs | 12 / 8 |
| fitts-session | openbar-widgets.57xCXD | openbar-widgets.THICol | 12 / 12 |
| existing ordinary menu | openbar-menu-test.LmDeXV | openbar-menu-test.CCjDCG | 1319 / 1319 |
| existing DateMenu | openbar-date-menu-test.6zhrW3 | openbar-date-menu-test.c1OpRg | 9 / 9 |

No test/extension exceptions or stylesheet-parser warnings in final runs.
Fitts actor tests emit two Clutter allocation warnings while inserting the
late fixture; lifecycle/session tests do not. Native missing-service warnings
and GNOME 49 host Fontconfig warnings remain visible. The old stylesheet-scope
comparison intentionally requires byte-identical declarations outside its own
fix and is not an appropriate oracle after these independent CSS changes.
