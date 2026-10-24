# Round 2: explicit custom WindowMax preservation (#129)

## Source and policy

Baseline: `ffba24d` (local `work/openbar-r2-autotheming`).

- [Original report #129](https://github.com/neuromorph/openbar/issues/129).
- Re-audit source: `/var/lib/hermes/.hermes/cache/scratch/openbar-reaudit/findings-80-139.md`, section 4; native evidence `/var/lib/hermes/.hermes/cache/scratch/openbar-reaudit/probe.cLLzcS/result.json` has `wmaxBefore=["0","0","0"]`, `wmaxAfter=["0.922","0.922","0.922"]`, `wmaxMode="light"`.
- `openbar@neuromorph/autothemes.js`, `autoApplyBGPalette`, previously always published `bgcolor-wmax` and the requested mode's backup along with the generated palette. Both current and light backup were custom black in the original reproduction, so this was not a missing per-mode backup.

Automatic replacement is legitimate existing behavior; the defect was having no explicit choice. New boolean **`autotheme-preserve-wmax`**, default **false**, opts out only the three WindowMax background color settings from auto-theme publication. It applies consistently to manual auto-theme requests and automatic wallpaper refreshes. It does not turn off auto-theme, change theme selection, preserve unrelated palette fields, alter alpha, or fix/change maximized gradients.

When true, generation writes none of `bgcolor-wmax`, `dark-bgcolor-wmax`, `light-bgcolor-wmax`. Normal mode switching still selects the matching retained light/dark custom backup into the current color. All-zero black is an ordinary valid custom value, not a sentinel. Enabling the option retains whatever colors currently exist; it cannot recover custom colors overwritten before opt-in.

### Headerbar matching remains independent

Reviewed `stylesheets.js` WindowMax headerbar branch (baseline lines 1722–1741), `extension.js` headerbar-hint reload handling, and `prefs.js` color backup behavior. Existing `wmax-hbarhint=true` deliberately makes the *displayed* background follow GTK `hscd-color`/`headerbar-hint` rather than the stored custom WMax color, with alpha 1. Preservation protects the stored custom colors even while headerbar matching is on; it does not disable that display policy or freeze the GTK palette. Turn headerbar matching off to display the preserved custom color. Both headerbar options remain untouched.

## Plan and implementation

1. Write a regression executing the actual `autoApplyBGPalette`/`onModeChange` exports with real memory-backed Gio.Settings, not a copy of their algorithms.
2. Observe missing-option failure, add the tiny schema key, then observe actual black-color preservation fail with the old function.
3. Skip only WMax publication when explicitly opted in. Keep the existing normal mode-copy path.
4. Verify all default output settings against the baseline function, custom black in each mode, repeated native wallpaper decode/refresh, import-compatible GVariant values and reset-to-default behavior.
5. Run existing pause, color, import, wallpaper and native regression suites. Leave `prefs.js` to its designated owner; provide the exact insertion below.

Production change: six lines in `autothemes.js`, five in schema XML. No other production module or TODO changed. The tracked compiled schema is intentionally not regenerated here; tests compile private schema copies with `--strict`. Packaging must compile the updated XML through the normal build/install process.

## RED / GREEN evidence

- RED missing schema key: runner exit 1, `/var/lib/hermes/.hermes/cache/scratch/openbar-round2-autotheming.MbQLCS/shell.log`, `schema exposes explicit preserve option` failure.
- RED after schema addition, before function change: runner exit 1, `/var/lib/hermes/.hermes/cache/scratch/openbar-round2-autotheming.pXn4wA/shell.log`, `opt-in preserves current and both per-mode colors including custom black` failure. Shell itself exits zero after the caught assertion; the runner correctly rejects missing completion, so this is not misreported as success.
- Final GREEN: `tests/round2-autotheming-native.sh`, **191 assertions**, Shell **50.4**, native settings and GdkPixbuf wallpaper decoding; `/var/lib/hermes/.hermes/cache/scratch/openbar-round2-autotheming.A7QpqJ/{result,shell.log}`. The all-settings baseline comparison covers Dark/Light/Color/Pastel, both selected/requested modes and headerbar hint 0/57. Opt-in tests verify every non-WMax setting still matches historical generation, no WMax change signals, both headerbar matching states, repeated mode changes, custom black in each mode, import pause/roundtrip and reset compatibility, and three actual same-URI wallpaper refreshes with changed contents.
- Existing `palette-pause.mjs`: **32 passed**, `palette-colors.mjs`: **97 passed**, `palette-import.mjs`: **11 passed**, `palette-wallpaper.mjs`: **14 passed**; `palette-theme-review.mjs` exits 0 and reports the existing four-theme before/after comparison. The wallpaper test's injected settings-failure diagnostic is intentional negative-path coverage.
- Existing `palette-native.sh`: **23 assertions**, Shell **50.4**, `/var/lib/hermes/.hermes/cache/scratch/openbar-palette-native.xnw4vO/{result,shell.log}`.
- Existing exported-lifecycle `palette-import-native.sh`: **18 assertions**, Shell **50.4**, `/var/lib/hermes/.hermes/cache/scratch/openbar-palette-import.cFFY7A/{result,shell.log}`.
- Strict private schema compilation, Node syntax check, `bash -n`, and `git diff --check`: passed.

Reproduce from repository root (all scratch stays under `$TMPDIR`):

```sh
nix shell nixpkgs#nodejs -c bash -c 'node tests/palette-pause.mjs && node tests/palette-colors.mjs && node tests/palette-import.mjs && node tests/palette-theme-review.mjs && node tests/palette-wallpaper.mjs'
__EGL_VENDOR_LIBRARY_FILENAMES="$(nix eval --raw nixpkgs#mesa.outPath)/share/glvnd/egl_vendor.d/50_mesa.json" \
  nix shell nixpkgs#gnome-shell nixpkgs#glib.dev nixpkgs#glib.bin nixpkgs#dbus nixpkgs#mesa nixpkgs#gjs \
  -c bash -c 'bash tests/round2-autotheming-native.sh && bash tests/palette-native.sh && bash tests/palette-import-native.sh'
```

## Exact proposed preferences insertion (not applied here)

In `prefs.js`, immediately after the `rowbar += 1;` following `palettegrid.attach(autoThemeChgSwitch, 2, rowbar, 1, 1);`, and before `autoAlphaSetLabel`:

```js
        const preserveWmaxLabel = new Gtk.Label({
            label: _('Preserve custom WindowMax background'),
            halign: Gtk.Align.START,
        });
        palettegrid.attach(preserveWmaxLabel, 1, rowbar, 1, 1);
        const preserveWmaxSwitch = this.createSwitchWidget('autotheme-preserve-wmax',
            _('Keep custom light/dark WindowMax background colors during automatic and manual auto-theme generation. Other theme colors still update. Turn off headerbar matching to display the custom color.'));
        palettegrid.attach(preserveWmaxSwitch, 2, rowbar, 1, 1);

        rowbar += 1;
```

No `settEvents` entry or immediate regeneration/reload handler is needed: this controls future generation, not current styling. Existing generic schema reset and whole-path dconf export/import include the new boolean without an importer allowlist change.

## Limits and safety

All native tests use private HOME/XDG directories, memory GSettings, a private session bus and a headless compositor. No live desktop settings or user GTK files were touched, no deployment or push occurred. Isolated Shell logs include unavailable ambient GDM/CalendarServer/audio/IBus services; successful runners reject extension JavaScript errors and require post-assertion completion.

The new regression tests actual exported functions and actual backgroundPalette/native decoder calls, not a physical external wallpaper-changer service. Existing native import tests additionally exercise exported enable/disable and signal wiring. The new import check roundtrips real typed GVariant values under the import pause and schema reset; it does not launch the preferences file chooser or dconf CLI. Headerbar rendering semantics are source-reviewed and unchanged; no new pixel/native effective-style claim is made. GNOME 45–49 certification and preferences UI integration belong to the parent/combined matrix, not this isolated commit.
