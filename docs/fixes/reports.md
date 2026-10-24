# Historical reports: evidence before fixes

Baseline: `1aa1eb345530df8b6e362a5fa1362d48ac8cffc6`. This investigation changes no packaged extension source. It does not suspend, lock, or change settings on the host desktop. All application/compositor tests use copied source, private HOME/XDG directories, memory GSettings, a private session bus, software Mesa and a private headless Wayland compositor.

## Findings and limits

| Report | Result here | Decision |
| --- | --- | --- |
| [#182](https://github.com/neuromorph/openbar/issues/182) | Physical/long suspend not reproduced; reported GNOME **51** not installed | Keep open; obtain logs/settings/version verification |
| [#145](https://github.com/neuromorph/openbar/issues/145) | Controlled mode cycles on 49.4 recover styling; no physical suspend | No suspend-specific fix established |
| [#142](https://github.com/neuromorph/openbar/issues/142) | Report only, no error trace; 48 not executed | No fix established |
| [#102](https://github.com/neuromorph/openbar/issues/102) | Intermittent geometry/style report, other panel extensions present | Need ownership/order/window state evidence |
| [#139](https://github.com/neuromorph/openbar/issues/139) | Modern native sliders retain scoped styling and change colors with wallpaper | Original Ubuntu 46.0/system-accent fallback not reproduced |
| [#119](https://github.com/neuromorph/openbar/issues/119) | **Application CSS-provider stale light/dark behavior reproduced** in GTK 4.20.3/4.22.4 | Shell file-write completion alone cannot fix it |
| [#133](https://github.com/neuromorph/openbar/issues/133) | **Application CSS-provider stale accent behavior reproduced** in GTK 4.20.3/4.22.4 | App-side reload or version-gated style design required |
| [#35](https://github.com/neuromorph/openbar/issues/35) | Historical native crash reports; modern native stress did not crash | Do not resurrect unreliable workarounds |
| [#63](https://github.com/neuromorph/openbar/issues/63) | Historical `st_theme_node_lookup_shadow` core stack confirmed | Modern current recurrence not established |
| [#77](https://github.com/neuromorph/openbar/issues/77) | Distinct JS, actor styling and native crash evidence; **runtime-dir initialization JS error reproduced** | Narrow ordering fix is actionable, not a native-crash/suspend cure |

All ten issue bodies and **all** comments were retrieved through `gh api`, with pagination and programmatic count checks: #182 0, #145 0, #142 0, #102 10, #139 1, #119 0, #133 1, #35 31, #63 9, #77 20. PR #84/#171/#172 bodies/discussions and actual file patches were also read. Raw API evidence lives outside Git under `/var/lib/hermes/.hermes/cache/scratch/openbar-reports-evidence/`; linked sources below are the durable references. Historical attachment logs were downloaded, not inferred from screenshots.

## Reproduction harness and actual results

Files:

- `tests/reports-run.sh`: creates disposable extension/runtime/config directories, runs headless Shell, requires completion marker plus successful exit and rejects JS/Open Bar stack errors.
- `tests/reports-shell.js`: actual Openbar lifecycle, settings and wallpaper updates; slider classes, ancestry and native theme-node colors; Shell `loadTheme()`; 17 additional real PanelMenu buttons, repeated candy colors, Trilands/Candybar mode cycles; 100 native shadow stylesheet load/read/unload cycles. Writes `shell-result.json`.
- `tests/reports-gtk-provider.js`: actual `saveGtkCss()` and real independent GTK application processes. Measures resolved colors from GTK's application-side user provider, explicitly reloads inside the app as a positive control, and starts a fresh process as a second control. Writes `gtk-result.json` and `gtk-fresh-result.json`.

Run from the repository worktree:

```sh
# The locally available nixpkgs source used for Shell 50.4 / GTK 4.22.4.
nix-shell -I nixpkgs=/nix/store/87lfqfz7mc5dm4w75qikxhd6lkr9jisr-source \
  -p gnome-shell glib.dev mesa gjs gtk4 gobject-introspection --run '
  export TMPDIR=/var/lib/hermes/.hermes/cache/scratch
  export __EGL_VENDOR_LIBRARY_FILENAMES=/nix/store/457mqa9dsvw9cnmi6pr06zjy1ib0iic4-mesa-26.2.5/share/glvnd/egl_vendor.d/50_mesa.json
  bash tests/reports-run.sh'

# A single coherent older dependency set: Shell 49.4 / GTK 4.20.3.
nix-shell -I nixpkgs=https://github.com/NixOS/nixpkgs/archive/b6018f87da91d19d0ab4cf979885689b469cdd41.tar.gz \
  -p gnome-shell glib.dev mesa gjs gtk4 gobject-introspection --run '
  export TMPDIR=/var/lib/hermes/.hermes/cache/scratch
  export __EGL_VENDOR_LIBRARY_FILENAMES=/nix/store/x2mh4drhlh7wk3plcjj0b8ynsy3lphnj-mesa-25.2.6/share/glvnd/egl_vendor.d/50_mesa.json
  bash tests/reports-run.sh'
```

Do not simply prepend an old Shell binary to the newer GTK/GJS environment: that failed in a GTK subprocess with duplicate `GDesktopAppInfoLookup` type registration and a GJS native assertion. That was a mixed-dependency harness failure, not an Open Bar shadow crash. The coherent nixpkgs commands above passed.

Final full-suite artifacts:

| Shell / Mutter / GTK | Artifacts under scratch | Result |
| --- | --- | --- |
| 50.4 / 50.5 / 4.22.4 | `openbar-reports.r7NeQD` | exit 0, completion marker, 148 PASS lines including child assertions; no Open Bar error stacks |
| 49.4 / 49.4 / 4.20.3 | `openbar-reports.3j3wWC` | same |

Missing calendar server, IBus, colord, audio server, authentication services and the initial empty background default are logged in the private desktop. No audio transport/device behavior, real logind sleep, GPU suspend, one-hour wait, GDM password unlock, or multi-extension rebasing was tested. `PASS reports` means the probes completed, **not** that the historical issues are fixed. Wallpaper color changes are observations, not a pass criterion: one intermediate 50.4 run (`openbar-reports.ACy5Dt`) retained the previous custom red accent on its second wallpaper update. It retained the stylesheet and `openmenu` ancestors; this is not the reported system-accent fallback. Background-event dropping/write ordering belong to the other implementation lanes and require their own regressions.

### Ranked hypotheses used

1. **JS lifecycle/initialization failure:** a settings callback runs before runtime directories exist, or after disable. Prediction: a JS stack identifies the source and appears with compositor exit 0, without a native core. The #77 runtime-dir case was reproduced below.
2. **Application provider does not watch rewritten user CSS:** prediction: file bytes change, existing app resolves old values, new process and explicit application reload resolve new values. Reproduced for both GTK versions.
3. **Scoped selector/root mismatch or Shell theme reload:** prediction: stylesheet disappears, ancestor classes disappear, or effective slider color becomes the native accent. Modern wallpaper and `Main.loadTheme()` tests did not show that failure.
4. **Another extension or window/fullscreen state overwrites geometry:** prediction: classes and CSS remain but panel allocation/inline properties change; extension order or an application/window event restores them. Fits #102's observation but remains unproven.
5. **Native stale theme-node CSS pointers:** prediction: SIGSEGV with native `libst` shadow stack, not merely a JS TypeError. Historical evidence confirms this class; modern stress did not reproduce it and tagged sources contain newer native invalidation handling.

## Separate report records

### #182 — long suspend, reported Open Bar 49 / GNOME 51 / Arch

**Evidence:** [complete report](https://github.com/neuromorph/openbar/issues/182) has no comments, error trace, settings export, monitor history or enabled-extension list. GNOME `51` is the source value; do not silently reinterpret it as 50. The body describes settings not taking effect after a long suspend, not a native crash.

**Status:** not reproduced. The general command above exercises a nearby controlled mode/lifecycle path only and passes on 49.4/50.4. It cannot validate the reported 51 environment or a long sleep.

**Next reproduction:** obtain exact `gnome-shell --version`, installed Open Bar metadata/commit, sanitized Open Bar settings, extensions/order and timestamps. In a disposable matching VM first test short mode change versus long guest suspend; record panel allocation/classes, stylesheet list, `isObarReset`, `pause-reload`, monitor/background-manager identity and any logged JS stack before and after. If only real hardware triggers it, request user-owned logs rather than suspending this machine. A crash needs `coredumpctl info` and a symbolized native stack; missing style alone does not.

**Fix decision:** none. An initialization fix demonstrated under #77 is a candidate only if that same stack is collected; no evidence maps it to #182 yet.

### #145 — suspend/unlock, Open Bar 43 / GNOME 49 / Arch

**Evidence:** [complete report](https://github.com/neuromorph/openbar/issues/145), no comments or stack. It explicitly includes returning to the session/unlocking.

**Status:** physical failure not reproduced. The coherent GNOME 49.4 probe preserves `openbar`, loaded generated CSS and native slider colors after controlled user → unlock-dialog → user cycles, including actual disable/enable and 17 panel indicators. This does not exercise Shell ExtensionManager rebasing or real suspend.

**Next reproduction/command:** run the general 49.4 command with the user's sanitized settings in the memory backend, then a matching disposable VM with only Open Bar. Compare a mode cycle and guest suspend. If enable fails, classify the first exception; if CSS disappears, inspect stylesheet ownership; if only floating geometry changes, record panelBox allocation and window state. Predict the same early-runtime-dir error only when the system color mode changed while Open Bar was disabled (test below).

**Fix decision:** none for suspend. Require evidence distinguishing monitor loss, lifecycle errors, competing panel writers and style state.

### #142 — sleep, Open Bar 43 / GNOME 48 / Arch

**Evidence:** [complete report](https://github.com/neuromorph/openbar/issues/142), no comments, traceback or settings. No native crash is claimed.

**Status:** not reproduced; 48 was not executed. Newer-version successful cycles do not establish 48 behavior.

**Next reproduction:** same private/VM matrix as #145 with GNOME 48 and exact extension release; collect before/after enabled state, first JS error, CSS/class/monitor state. Prediction: if this is merely a user-mode disable/enable defect, a non-suspend session cycle should also trigger it; a suspend-only result instead prioritizes monitor/graphics/background-manager changes. Do not add a session-mode callback speculatively.

**Fix decision:** none. Reuse the evidence-gathering harness after provisioning the matching runtime; do not advertise a GNOME 49/50 result as a reproduction of 48.

### #102 — floating bar becomes nonfloating after sleep; opening an app restores it

**Evidence:** [body and full conversation](https://github.com/neuromorph/openbar/issues/102); Open Bar 42 / GNOME 47 / Arch. Reporter confirms both Just Perfection and Blur My Shell. [Specific reply](https://github.com/neuromorph/openbar/issues/102#issuecomment-2669131812): lock alone and login do **not** fail. [Later reply](https://github.com/neuromorph/openbar/issues/102#issuecomment-2676376964): intermittent and no consistent circumstances after testing. Maintainer's extension-order theory was a hypothesis, not a confirmed diagnosis.

**Status:** not reproduced. Source has separate `setWindowMaxBar`, overview/fullscreen and panel-position paths; opening an app can trigger geometry/window state handling without any setting reset. Current private mode cycles keep CSS and classes but do not include either competing extension or window-max fixtures.

**Next reproduction:** in an isolated matching VM, reproduce only Open Bar first, then add Just Perfection/Blur My Shell independently and vary activation order. Export their panel-related settings. Record panelBox x/y/size, monitor, windowmax/overview pseudo-classes, inline `background-*`, generated CSS and Open Bar settings before sleep, immediately after and after opening an app. Prediction: geometry overwrite keeps settings/CSS intact; actual loss of stylesheet/classes has a different signature.

**Fix decision:** do not introduce repeated forced restyling/timers to win an unproven extension race. Resolve ownership/event ordering only after the failing writer/path is identified.

### #139 — volume slider falls back to system accent after wallpaper change

**Evidence:** [body](https://github.com/neuromorph/openbar/issues/139): Open Bar 43, GNOME 46.0, Ubuntu 24.04; Pastel dark, Light light plus `autotheme-refresh`, `auto-bgalpha`, `autofg-bar`, `autofg-menu`, `smbgoverride` true. [Only comment](https://github.com/neuromorph/openbar/issues/139#issuecomment-3170403073) reports the same in MediaControls; no error stack. No assertion about actor destruction can be extracted from the screenshots alone.

**Source:** native [46.0 volume.js](https://github.com/GNOME/gnome-shell/blob/46.0/js/ui/status/volume.js) derives StreamSlider from QuickSlider. Open Bar uses `.openmenu.quick-slider .slider` plus the ordinary scoped slider rules in `stylesheets.js`. A slider need not itself have `openmenu`: its QuickSlider/menu ancestor supplies scope. [46.0 Main.loadTheme](https://github.com/GNOME/gnome-shell/blob/46.0/js/ui/main.js#L591-L610) copies previous custom stylesheets; a claim that every Shell theme reload discards Open Bar CSS would be incorrect.

**Executed command:** general suite above with the reported settings. All three native sliders kept `slider`, an `openmenu` QuickSlider/menu ancestor and loaded Open Bar stylesheet. Both final versions observed active colors `#2a80d3ff` → `#bf3404ff` → `#21a44dff`; base colors `#aebbc7ff` → `#cfbeb9ff` → `#b1c9b9ff`. Native `Main.loadTheme()` preserved the green custom colors. Audio service unavailable: these are real slider actors/theme nodes, not an actual playing volume device test.

**Status:** original system-color fallback unreproduced. One intermediate missed wallpaper update retained the old **custom** accent with classes/CSS intact; do not mislabel it #139.

**Next reproduction/fix condition:** matching Ubuntu GNOME 46.0 plus actual audio device and reporter settings; capture slider/QuickSlider ancestry, native/system accent, `-barlevel-*` colors, custom stylesheet list and relevant generated rules before/after. Add MediaControls separately. Missing ancestor/root would justify rebind/scoping work; intact scope with wrong effective color needs selector/priority analysis; unchanged generated CSS instead implicates the palette/write pipeline. No volume-specific patch is justified yet.

### #119 — running GTK4 app does not switch light/dark

**Evidence:** [report](https://github.com/neuromorph/openbar/issues/119): Open Bar 43 / GNOME 48 / Fedora 42; both Apply GTK and Apply Flatpak enabled; restart fixes Text Editor. No comments or stack.

**Executed command:** general suite, actual `saveGtkCss()` and separate GTK process. Initial light CSS resolves `window_bg_color=rgb(250,250,250)`. Rewrite completes with `window_bg_color rgba(32, 32, 32, ...)` for dark. The running app still resolves **250**, even after changing GTK's own application dark preference. A fresh process resolves **32**; a provider explicitly loaded/installed by the application also resolves **32**. Same behavior on GTK 4.20.3/4.22.4. This measures real application-side providers, not just successful file writes.

**Root-cause boundary:** `saveGtkCss()` generates mode-specific static user CSS. GTK's user-provider initialization loads `$XDG_CONFIG_HOME/gtk-4.0/gtk.css` once into a static provider: [4.20.3 settings_init_style](https://github.com/GNOME/gtk/blob/4.20.3/gtk/gtksettings.c#L1090-L1135), [4.22.4 equivalent](https://github.com/GNOME/gtk/blob/4.22.4/gtk/gtksettings.c#L1110-L1161). Merely changing a file does not call `load_from_path` inside a running app. User-priority explicit colors continue overriding theme changes. The fixture is plain GTK4, not Fedora Text Editor/libadwaita/portal or a real Flatpak; it reproduces the underlying failure mechanism, not every app's integration.

**Specific plan:** do not promise that awaiting GTK writes solves live refresh. For GTK ≥4.20, prototype generating **both** mode palettes under `@media (prefers-color-scheme: dark)` rather than rewriting static mode-dependent colors: [GtkCssProvider property introduced in 4.20](https://github.com/GNOME/gtk/blob/4.20.3/gtk/gtkcssprovider.c#L294-L317). Test real portal/libadwaita preference propagation and provider media invalidation; define fallbacks for older GTK. This is an unimplemented design, not a verified fix. Shell's own Gtk version cannot identify every host/Flatpak app runtime. For older apps there is no demonstrated universal extension-side reload API; communicate restart/application cooperation. Never kill/restart user apps or toggle global theme settings as an assumed workaround.

### #133 — GTK windows retain colors after wallpaper changes

**Evidence:** [body](https://github.com/neuromorph/openbar/issues/133), Open Bar 43 / GNOME 48 / Arch, Bing Wallpaper; top panel/menus update but app titlebars/panes do not. [Maintainer acknowledgement](https://github.com/neuromorph/openbar/issues/133#issuecomment-3114085291) explicitly says some apps need closing/reopening.

**Executed command/result:** same real-provider probe as #119. `saveGtkCss()` writes initial red accent before app startup. Running app resolves `rgb(255,0,0)`. Writer then sets blue accent and finishes writing bytes containing `accent_color rgba(0, 0, 255, 1.0)`. After waiting, running app still resolves red. Fresh app and explicit app-owned provider reload resolve `rgb(0,0,255)`. Both GTK versions agree.

**Status:** stale application provider reproduced, distinct from Shell CSS reload and write races. New mode-aware CSS from #119 would not itself make an existing provider read a new wallpaper-derived palette.

**Specific plan:** establish supported app/runtime list and whether those apps expose a legitimate reload/theme-provider hook; test an application-owned `Gio.FileMonitor` plus `CssProvider.load_from_path` as a cooperative positive control. Without application cooperation or upstream GTK live reload, document restart requirement rather than claim a universal Open Bar fix. Preserve and await writer ownership safety in its separate lane. Flatpak file visibility and provider refresh are separate boundaries: readable new bytes do not force provider reload.

### #35 — Candybar native crashes on lock/disable/resume

**Evidence:** [full discussion](https://github.com/neuromorph/openbar/issues/35): initial Open Bar 29 / Debian GNOME 42.9, later GNOME 46 and Fedora 47. Initial Candybar on/off wording was contradictory and then corrected to on. Early supplied log points to Blur My Shell disconnect warnings, not proof of Open Bar native fault. [Maintainer later reproduced a native crash](https://github.com/neuromorph/openbar/issues/35#issuecomment-2166508537) and linked GNOME issues 7339/7712 and MR3252. Increasing palette size to 16 [did not solve it](https://github.com/neuromorph/openbar/issues/35#issuecomment-2196378045).

[Final Fedora reporter](https://github.com/neuromorph/openbar/issues/35#issuecomment-2451580180) has Candybar off but exported `bartype='Trilands'`. Their [shell log](https://github.com/user-attachments/files/17598283/shell.log) contains the actual user-shell `ANOM_ABEND ... sig=11`; adjacent Xwayland shutdown messages belong to GDM/other Shell PIDs and are not the native shadow backtrace. No shadow symbol is present in that attachment. They report `unlock-dialog` avoids their failure, but that is not a universal causal proof.

**Executed command/status:** general suite, 17 extra native panel buttons, repeated candy colors, actual class cleanup and stylesheet unload, simulated mode cycles and 100 shadow load/unload lookups per Shell. No native crash on 49.4/50.4. These are bounded software-renderer stress tests, not a statistical proof of absence on old or new hardware.

**Next plan:** replay sanitized historical settings in disposable old/current distro VMs and compare symbolized core traces and exact Shell build/backports. Predict stale-pointer crash disappears with native invalidation handling, while independent JS cleanup errors may remain. Do not add palette uniqueness constraints, skip cleanup, disable shadows globally or add unlock-dialog as an unverified cure.

### #63 — Trilands native crash, GNOME 46.4 / Arch / nouveau

**Evidence:** [body](https://github.com/neuromorph/openbar/issues/63), Open Bar 38, GNOME 46.4, NVIDIA 3060/nouveau, Blur My Shell panel blur disabled. [Actual comment core stack](https://github.com/neuromorph/openbar/issues/63#issuecomment-2295294943): `st_theme_node_lookup_shadow` → `st_theme_node_get_box_shadow` → `st_theme_node_get_paint_box` in `libst-14.so`, then Clutter paint-volume stack. This is a native crash, not a catchable JS missing-class issue. Reporter also says unrelated logout can crash with Islands, and boot/GRUB issues are not established as Open Bar defects.

The patch skipping class removal initially [seemed to work](https://github.com/neuromorph/openbar/issues/63#issuecomment-2295310092), then [failed again the same day](https://github.com/neuromorph/openbar/issues/63#issuecomment-2295365738). A later Fedora 41/GNOME 47 report persists. Avoid copying `patches/extension_trilands-crash_63.js` wholesale or repeating its host-mutating install command.

**Executed command/status:** same current native stress as #35; no crash. No physical nouveau driver or old GNOME 46 run occurred.

**Next plan:** disposable matching 46.4 VM/guest and current runtime differential, actual bar settings/actors; obtain core and debug symbols before choosing a workaround. Native invalidation source below gives a concrete upstream comparison target. A catch around `theme.unload_stylesheet()` cannot catch SIGSEGV.

### #77 — multiple failures, not one crash

**Evidence, kept separate:**

1. [Initial reproducible JS disable error](https://github.com/neuromorph/openbar/issues/77#issuecomment-2382213805): `Argument tag: value is out of range for uint32`; `clearTimeout` resolves through **switcher@landau.fi/util.js**, then Open Bar disable. This indicates cross-extension timer behavior; not proof of native shadow fault. Reporter says a subsequent update fixed this error.
2. Late-added fcitx5 indicator has square/missing Trilands shape; [maintainer added delayed refresh](https://github.com/neuromorph/openbar/issues/77#issuecomment-2390832410). Distinguish classes/actor ordering from both crashes.
3. [JS startup stack](https://github.com/neuromorph/openbar/issues/77#issuecomment-2406828569): `obar.obarRunDir is undefined` in writeStylesheet, through onModeChange during enable. **This path is still reproducible on this baseline.**
4. [Actual core attachment](https://github.com/user-attachments/files/17349450/gnome-shell-core-dump.txt), linked [here](https://github.com/neuromorph/openbar/issues/77#issuecomment-2408471419): `Signal: 11 (SEGV)`, top frame `st_theme_node_lookup_shadow (libst-15.so)`. This is separate native evidence. `c366570` was reported successful by one user, [then another still crashed after days](https://github.com/neuromorph/openbar/issues/77#issuecomment-2431947720).

**Tight regression for item 3:** Open Bar has saved nonempty `bguri` and saved mode `default`; private system setting is `prefer-dark` before constructing/enabling it. `enable()` calls `onModeChange()` at extension.js:1476 **before** initializing `obarRunDir` at :1497. `AutoThemes.triggerStyleReload()` synchronously toggles the watched trigger; `reloadStyle()` starts `writeStylesheet()` against undefined directory. There is a later normal generation, so logging this JS failure does not by itself prove permanent theme loss or explain the native crash.

Use either general nix-shell command, adding these exports inside `--run` before invoking the runner:

```sh
export REPORTS_EARLY_MODE=1 REPORTS_SKIP_GTK=1
# Baseline: runner returns 1, even though Shell exits 0 and writes a marker.
# Positive control, only alters the disposable source copy:
# export REPORTS_EARLY_FIX=1
```

Executed baseline: 50.4 `openbar-reports.XAutOp`, 49.4 `openbar-reports.YN6lgR` → **runner exit 1**, matching `writeStylesheet → reloadStyle → updatePanelStyle → triggerStyleReload → onModeChange → enable` stack. Executed positive control: 50.4 `openbar-reports.3uOlkH`, 49.4 `openbar-reports.s2pnNi` → **runner exit 0**, CSS loaded, native sliders present, saved mode updated to `prefer-dark`, no extension error stacks.

**Exact minimal change for implementation lane:** relocate the existing OpenBar runtime-dir creation **and static-asset-copy block** (`extension.js:1495–1515` at baseline) before the initial bguri/mode-change branch (`:1467`). Keep one copy. Do not suppress the exception, skip mode catch-up or merely defer a random timer. The positive control in `reports-shell.js` makes exactly this relocation in the copied extension. Production source is intentionally untouched here. Regression: retained nonempty bguri + mode changed while disabled, fresh construction (no stale previous `obarRunDir`), then normal enable/disable; reject logged errors as well as checking effective style. Coordinate with asynchronous-write and lifecycle lanes before applying.

**Status/fix limits:** one JS subfailure reproduced with red/green evidence; other JS timer conflict, fcitx5 transport/indicator timing and native crash not newly reproduced. Do not mark #77 wholly fixed.

## Native upstream state and PR context

- [GNOME issue 7339](https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/7339) includes a CSS-only extension with empty enable/disable and a native SIGSEGV in `st_theme_node_lookup_shadow`; its API now reports closed. This demonstrates why native attribution cannot be reduced to an Open Bar JS exception.
- [MR3252](https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/3252), “Forget properties cache on node removal,” describes stale `node->properties` references after `st_theme_unload_stylesheet`. API reports **closed, not merged** (`merged_at=null`); do not repeat historical comments that it is still an open ready-to-merge fix. The actual diff was read. API notes endpoint returned HTTP 401; no inference about inaccessible later discussion is made.
- A different upstream fix [41758311d1df0f40ae969b8d57cf3302ad2a5803](https://github.com/GNOME/gnome-shell/commit/41758311d1df0f40ae969b8d57cf3302ad2a5803), [MR3809](https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/3809), force-disposes old cached theme nodes **after** context `changed` emission, clearing references into Croco data. The actual logic is present in tagged [49.4 st-theme-context.c](https://github.com/GNOME/gnome-shell/blob/49.4/src/st/st-theme-context.c#L312-L335) and [50.4](https://github.com/GNOME/gnome-shell/blob/50.4/src/st/st-theme-context.c). Their theme-node dispose clears cached properties before dropping its theme reference. This materially changes the current-runtime investigation; it is not proof every native crash is solved.
- [PR84](https://github.com/neuromorph/openbar/pull/84) adds only `"session-modes": ["user", "unlock-dialog"]`. It is open/unmerged. [Maintainer explicitly says results differ](https://github.com/neuromorph/openbar/pull/84#issuecomment-2526030500) and rebasing may repeat disable/enable. Tagged [49.4 extensionSystem.js](https://github.com/GNOME/gnome-shell/blob/49.4/js/ui/extensionSystem.js#L184-L239) confirms rebasing of later extensions. This is not a general suspend fix.
- [PR171](https://github.com/neuromorph/openbar/pull/171) is closed/unmerged and changes packaged extension paths but combines unrelated GTK migration and guards. Actual prefs at its head constructs Gtk.ColorDialogButton yet retains `add_palette` calls. [PR172](https://github.com/neuromorph/openbar/pull/172) is open/unmerged and adds a duplicate root-level tree, rather than updating `openbar@neuromorph`. Neither supplies reproduction evidence for these historical reports; wholesale application is unwarranted.

## Remaining user/environment data

No additional private data is needed to reproduce the GTK provider boundary or the #77 early-directory JS regression. To attribute the other reports, request **sanitized** settings plus exact Shell/Mutter/Open Bar builds and enabled extensions/order; monitor layout/docking/remote-session transitions; trigger times and whether lock-only, sleep-only or app-open recovers; relevant JS journal slice and native `coredumpctl info` if a crash occurs. For #139 additionally require Ubuntu 46 runtime/theme/accent and actual volume-device/MediaControls context. For native reports require the core stack/build IDs and distribution backports; do not request passwords or a user's unrestricted full journal. #182's reported GNOME 51 must be verified rather than normalized.
