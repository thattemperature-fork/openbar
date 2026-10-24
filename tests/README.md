# Dynamic panel menu regression tests

## Modern DateMenu and whole-root follow-ups

See [docs/fixes/menus.md](../docs/fixes/menus.md) for current commands, tagged
source research, red/green evidence, limitations and exact isolated Nix runs.
`menu-modern-run.sh` covers native notifications and actual notification/MPRIS
D-Bus transport; `menu-modern-root-run.sh` covers whole-menu replacement on an
existing native panel button with real enable/disable cycles. Current generator
preservation is checked by `menu-modern-scope.js` against `1aa1eb3`.

The original `stylesheet-scope.js` comparison below intentionally assumes the
ordinary-menu-only patch adds no rules and leaves global output byte-identical.
It describes the historical `53c97bf` change; modern group/icon selectors add
rules in both scoped and global modes, so use the current scope test instead.
The whole-root replacement limitation described below is superseded for native
`PanelMenu.Button.setMenu()`; direct `.menu` assignments without `menu-set` and
nonstandard third-party menu implementations remain outside verified coverage.

## Fix scope

`applyBoxStyles()` tags the current content of a panel menu, but DBusMenu can
create or replace its rows later. Ordinary menu rules now retain their original
selectors and additionally match descendants of `.openmenu.popup-menu-content`.
Only the ordinary item/submenu/section/separator rule block is expanded. Root
container rules, DateMenu/Quick Settings-specific rules, and the global-style
settings are not changed. Existing descendant slider/toggle rules already cover
late children. No observers, timeouts, or new class ownership are introduced.

Expanding all the ordinary rules together is intentional: expanding just root
hover rules increases their specificity relative to submenu rules and can
incorrectly apply the root palette to submenu rows. All new selectors have the
same specificity increment relative to their original equivalents.

The fix assumes the existing panel-menu discovery has tagged the content root.
Replacing a whole `PanelMenu.Button.menu` with a new, untagged root still requires
the existing discovery pass; this patch fixes dynamic *contents*, not that
separate root-discovery lifecycle. Popups outside a tagged content root stay
outside the new scope.

## Real GNOME Shell / St integration

Run from the repository root with a recent GNOME Shell, GLib tools, D-Bus and
software Mesa installed:

```sh
bash tests/run-menu-tests.sh
```

`TMPDIR` must name a scratch directory. The runner creates a disposable HOME,
XDG directories, private session bus, in-memory GSettings backend and headless
Wayland compositor. It does not enable Open Bar on the user's desktop or write
user preferences. Each run preserves its generated stylesheet, assets, result
and `shell.log` in the printed scratch directory. Success requires both a clean
process exit and a result written after assertions and fixture cleanup.

Reproducible Nix command used for supported GNOME Shell **49.4**:

```sh
ref=github:NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41
mesa=$(nix eval --raw "$ref#mesa.outPath")
__EGL_VENDOR_LIBRARY_FILENAMES="$mesa/share/glvnd/egl_vendor.d/50_mesa.json" \
  nix shell "$ref#gnome-shell" "$ref#dbus" "$ref#glib.dev" "$ref#mesa" \
  -c bash tests/run-menu-tests.sh
```

Also exercised with GNOME Shell **50.4** / Mutter **50.5** using `nixpkgs` in
place of the pinned ref (both 49 and 50 are listed in the current metadata).

The test imports the actual Open Bar `applyMenuStyles`/`applyBoxStyles` and
`reloadStyle` implementations. It creates real PanelMenu, PopupMenu and St
actors, adds content asynchronously after the class pass, and queries actual
St theme-node colors and background-image names. Existing global-menu rendering
is the palette/cascade oracle; no CSS matcher is simulated.

Coverage includes root rows, submenu rows and backgrounds, sections, submenu in
a section, deep sections, separators, switches, embedded buttons and sliders;
normal/hover/focus/selected/active/checked combinations; scanning already populated
menus; rescanning; open removeAll/repopulation; closed row replacement; repeated
class removal/reapplication; menustyle off; apply-all-shell; untagged popups and
candidate-popup-shaped actors; reparenting an untagged late row outside the scope.
The custom palette explicitly distinguishes root and submenu hover colors.

## Stylesheet scope / preservation

This GJS test invokes the real unexported generator with its real dependencies
and compares it to a supplied pre-fix source file. It does not add a production
export just for testing. On a system with GJS, Pango typelibs and GLib tools:

```sh
d=$(mktemp -d "$TMPDIR/openbar-css-test.XXXXXX")
mkdir "$d/schemas"
cp openbar@neuromorph/schemas/*.xml "$d/schemas/"
git show 01fb24217e0cf165cf26b328abd9a6629630c862:openbar@neuromorph/stylesheets.js > "$d/baseline.js"
glib-compile-schemas "$d/schemas"
GSETTINGS_BACKEND=memory gjs -m tests/stylesheet-scope.js "$d/baseline.js" "$d"
```

On Nix, use the same preparation through `git show`, then:

```sh
types=''
for pkg in pango gobject-introspection harfbuzz; do
  p=$(nix eval --raw "nixpkgs#$pkg.out.outPath")
  types="$types:$p/lib/girepository-1.0"
done
GI_TYPELIB_PATH="$types" GSETTINGS_BACKEND=memory \
  nix shell nixpkgs#gjs nixpkgs#glib.dev nixpkgs#pango \
    nixpkgs#gobject-introspection nixpkgs#harfbuzz \
  -c bash -c 'glib-compile-schemas "$1/schemas"; gjs -m tests/stylesheet-scope.js "$1/baseline.js" "$1"' bash "$d"
```

## Execution results

- RED before production edits (GNOME 50.4): late hovered row background
  `#535359ff`, existing tagged row `#434343ff`; test failed as expected.
- First minimal root-hover change passed that test. Expanded state coverage then
  failed on the late active row (`#58585eff` versus `#00b2bfd9`), before expanding
  the ordinary menu rules together.
- Final suite: **1319 assertions passed**, independently on GNOME **49.4** and
  **50.4**. No St/Clutter errors or stylesheet parser warnings in the final runs.
- The expanded suite was also run against a scratch archive of the unmodified
  upstream revision on GNOME 49.4: failed at late root hover (`#535359ff` versus
  `#215954ff`), confirming it detects the original bug.
- Generator comparison: **553 assertions passed**, **60** added descendant
  selectors. All original selectors, declarations and ordering preserved;
  global-menu, global-all and menustyle-disabled output byte-identical.
- `git diff --check` and `bash -n tests/run-menu-tests.sh` passed.

The minimal isolated desktop emits unrelated missing-service warnings (Calendar
server, GDM, IBus daemon, audio, colord, etc.); GNOME 49 also emits host Fontconfig
configuration warnings. These are not suppressed or claimed absent. An early
zero-width fixture produced Clutter allocation warnings; adding a real panel
label and explicit slider width eliminated them in the final runs.

The ordinary-menu suite does not verify a real D-Bus AppIndicator
service/transport, a running IBus engine, or third-party QSAP integration.
Its actor/style assertions are not evidence of DateMenu or full lifecycle
compatibility; the separate tests below exercise those paths.

## Native DateMenu Clear control and full lifecycle regression

The DateMenu control fix uses `CalendarMessageList._clearButton`, rather than
an out-of-scope `clearBtn` variable or a version-dependent child index. DND
continues to be styled only before GNOME 49, using `_dndButton`/`_dndSwitch`.
These are private Shell fields, not a stable public API. Source inspection of
[45.0](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/45.0/js/ui/calendar.js),
[46.0](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/46.0/js/ui/calendar.js),
[47.0](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/47.0/js/ui/calendar.js),
[48.0](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/48.0/js/ui/calendar.js),
[49.4](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/49.4/js/ui/calendar.js) and
[50.4](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/50.4/js/ui/calendar.js)
confirms the named Clear field throughout and both DND fields before 49.
GNOME 45–48 have **not** been runtime-tested here.

```sh
bash tests/run-date-menu-tests.sh date-menu
bash tests/run-date-menu-tests.sh lifecycle
```

For Nix, use the same matching Shell/Mesa ref as above:

```sh
ref=github:NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41
# Use ref=nixpkgs for the GNOME 50 run.
mesa=$(nix eval --raw "$ref#mesa.outPath")
__EGL_VENDOR_LIBRARY_FILENAMES="$mesa/share/glvnd/egl_vendor.d/50_mesa.json" \
  nix shell "$ref#gnome-shell" "$ref#dbus" "$ref#glib.dev" "$ref#mesa" \
  -c bash -ec 'bash tests/run-date-menu-tests.sh date-menu; bash tests/run-date-menu-tests.sh lifecycle; bash tests/run-menu-tests.sh'
```

The runner copies the extension, metadata, assets and compiled schemas into
scratch. HOME/XDG directories, session bus and memory settings are private;
it neither enables the extension on the user's desktop nor changes their
preferences. Logs and result files are preserved at the printed path. A zero
Shell exit and assertion result are insufficient: logged JavaScript errors,
unhandled rejections and extension stack traces also make the runner fail.
Missing isolated-desktop services remain visible in the log.

- `date-menu` calls the actual `applyMenuStyles()` against the native Shell
  DateMenu, not a stand-in PopupMenu. Two add/remove cycles assert the actual
  Clear actor's class both immediately and after the calendar callback runs.
- `lifecycle` constructs the actual exported extension class with its real
  metadata and directory, and runs **two complete `enable()`/`disable()` cycles**.
  No lifecycle methods are replaced. All panel boxes, native DateMenu and Quick
  Settings participate. It asserts panel/Clear classes and released references,
  toggles the real `menustyle` setting off/on, waits 6.5 seconds after each enable
  (including delayed refresh, background hookup and Fitts setup), and waits
  another 6.5 seconds after each disable to expose asynchronous exceptions.
- The isolated desktop is given a generated PNG wallpaper through its private
  background settings. Empty Nix wallpaper defaults otherwise trigger the
  unrelated `getPaletteFromImage(null)` error. Palette generation is exercised,
  not stubbed out; Open Bar settings retain their defaults.

Results for this fix:

- Before the production edit, the native DateMenu test failed with
  `ReferenceError: clearBtn is not defined` on **49.4 and 50.4**. The real
  `enable()` path also reproduced that exception on **50.4**.
- After the edit: **9 DateMenu assertions** and **24 lifecycle assertions**
  passed independently on **49.4 and 50.4**. Both lifecycle cycles completed,
  including the post-disable observation windows, with no JavaScript errors
  or extension stack traces. Missing CalendarServer/GDM/audio/etc. warnings
  remain; GNOME 49 also reports host Fontconfig warnings.
- Ordinary-menu regression rerun: **1319 assertions** passed on each version.
  Stylesheet scope comparison rerun: **553 assertions**, **60** scoped selectors.

This is a real class lifecycle test inside a private compositor, not installation
through Shell's extension manager or a live-user desktop smoke test. It does
not validate immediate-disable races, all settings combinations, notification
or media delivery/styling, monitor hotplug, QSAP or AppIndicator transport. The
small control fix does not address those separate areas.
