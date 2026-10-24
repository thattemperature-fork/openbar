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
