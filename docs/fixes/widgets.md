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
