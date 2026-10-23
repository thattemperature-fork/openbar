# Dynamic panel menu regression tests

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
place of the pinned ref (50 is an additional forward-compatibility probe, not
listed in this extension's metadata).

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

Not verified: a real D-Bus AppIndicator service/transport, a running IBus engine,
full extension enable/disable (which has unrelated DateMenu code paths), actual
DateMenu/Quick Settings/QSAP third-party integrations, or GNOME 45–48. The actor
and style matching integration is real, but it is not a full desktop smoke test.
