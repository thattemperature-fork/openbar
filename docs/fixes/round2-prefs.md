# Round 2: preferences

Baseline: `ffba24d4391e987fafbdf38fb9abb4fe4a0b91ae`. Only `openbar@neuromorph/prefs.js` is changed in production. No live desktop, deployment, host dconf or TODO edits.

## 1. Preferences resource ownership

Root cause: explicit settings callbacks (color, font, reload and palette) were never disconnected; only the quote timer was cleared, and the display-wide CSS provider was never removed. Partial construction had no cleanup boundary.

Plan/implementation: retain every explicit settings handler and UI-only timeout, make close idempotent, install lifecycle hooks before construction, release resources on initialization errors. Import/export transactions are deliberately not UI timers: their state restoration must finish even after the window closes (area 2).

Regression: `TMPDIR=<scratch> bash tests/prefs-native.sh lifecycle` creates private HOME/XDG/bus/headless Wayland, loads the actual exported preferences resource/module and actual UI, retains native settings and verifies `GObject.signal_handler_is_connected` after destroy. Two independent opens/closes, palette and style timers, provider removal and partial initialization are asserted. The runner appends only a test class export to its disposable source copy; no production algorithms are copied. It requires a post-assertion marker and rejects logged JS errors, not merely exit zero.

RED GTK 4.22.4: `/var/lib/hermes/.hermes/cache/scratch/openbar-prefs.SZddDa`, fails the native handler-disconnection assertion.

GREEN GTK 4.22.4: `/var/lib/hermes/.hermes/cache/scratch/openbar-prefs.McMUYD`, all lifecycle assertions pass. Known native Gtk.Grid GI slow-path warnings are unrelated; missing services in the isolated Shell are expected.

Sources: [baseline prefs](https://github.com/thattemperature-fork/openbar/blob/ffba24d4391e987fafbdf38fb9abb4fe4a0b91ae/openbar@neuromorph/prefs.js), [GObject disconnect](https://docs.gtk.org/gobject/method.Object.disconnect.html), [GTK provider removal](https://docs.gtk.org/gtk4/type_func.StyleContext.remove_provider_for_display.html), [upstream report 181](https://github.com/neuromorph/openbar/issues/181).

Limits: no claim of indefinitely surviving preferences subprocesses, physical desktop testing or certification of all GNOME versions. Older coherent runtimes and subsequent areas are recorded below when executed.

Follow-up native edge: destroying a constructed but never-realized window emits neither close-request nor unrealize while widgets are retained. RED `openbar-prefs.XSkJtK`; track native Gtk.Window toplevel model removal, disconnect that owned observer at close; GREEN `openbar-prefs.DY5LRy` on GTK4.22.4. This observer is confined to the owning window's lifetime, not a widget-tree observer.

## 2. Import/export/reset completion

Root cause: pause was acquired outside exception-safe completion, import used an unreaped child and a fixed 3-second timer, export could fail before its unpause timer and exported its own pause. Closing the final preferences window can end the application before asynchronous cleanup without an application hold. Reset could also steal an active import's pause.

Implementation: one module-level operation owner rejects overlaps (including reset); saved pause flags restore in `finally`, and the actual application is held until restoration/flush/reload. Export snapshots every schema default/current value directly without mutating every key, omits both transient flags, and awaits Gio atomic replacement. Import validates all sections, keys, variant types and ranges before writing; ignores imported transient flags and wallpaper keys, preserving local URIs without transient foreign values. Real Gio.Subprocess communication awaits child termination and checks status/stderr. No DO_NOT_REAP_CHILD, GioUnix pipe ownership or completion heuristic remains. UI callbacks report errors; closed UI logs errors without creating a new dialog.

Native full-schema roundtrip exposed an additional GLib native assertion: GSettings' `quarks[256]` in `settings_backend_keys_changed` aborts on >=256 changes in one event. RED `/var/lib/hermes/.hermes/cache/scratch/openbar-prefs.m60fRa` (GTK4.22) and `openbar-prefs.jUkEp4` (GTK4.20). Import now prevalidates then loads bounded 128-key batches sequentially under one pause. Source: [GLib GSettings](https://github.com/GNOME/glib/blob/main/gio/gsettings.c). This is not an atomic all-or-nothing settings rollback: later batch failure can leave earlier imported values, but restores pause and reports failure. Process crash/power loss recovery is not promised.

Commands: `bash tests/prefs-native.sh transactions`; add `REF=github:NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41` for Shell49/GTK4.20.3 or `REF=github:NixOS/nixpkgs/nixos-25.05` for Shell48/GTK4.18.6. Runner resolves resources/typelibs/Mesa from the selected coherent ref; no committed store executables or original repository paths. Private explicit dconf profile, bus and HOME/config directories, verified database inside scratch only. Shell itself remains on memory backend.

RED: `/var/lib/hermes/.hermes/cache/scratch/openbar-prefs.eMDf85` export failure leaves pause; `openbar-prefs.y8cAEO` missing app hold; `openbar-prefs.9vFIqJ` overlapping reset steals pause. GREEN GTK4.22.4 `openbar-prefs.GQkfQv`; GTK4.20.3 `openbar-prefs.YoK4DE` (before reset addition); GTK4.18.6 `openbar-prefs.o1TaOv`. Each artifact contains actual GTK/child logs and completion marker.

Coverage: real disposable export/import bytes, full schema roundtrip, default values, omitted transients, three distinct wallpaper URIs, preexisting pauses, chooser cancel, null selection, absent files, synchronous snapshot/spawn/flush failures, real child exit23, held real result delivery for close/overlap, reset rejection, balanced native application holds. Chooser substitution only selects private files/cancel; file I/O and private dconf child are real. Backend non-writability/crash and hostile same-UID races are not certified. Older runtime fontconfig warnings from host fonts and Gtk.Grid slow-path warnings remain environmental, not uncaught product errors.

Sources: [Gio.Subprocess communicate](https://docs.gtk.org/gio/method.Subprocess.communicate_utf8_async.html), [Gio.File replacement](https://docs.gtk.org/gio/method.File.replace_contents_async.html), [GApplication hold](https://docs.gtk.org/gio/method.Application.hold.html).

## 3. Large-text and small-window layout

Root cause: hard monitor-derived minimum size, fixed character widths/image margins, a homogeneous centered stack and horizontal scrolling disabled. The native outer content could extend beyond the compositor-clamped window; increasing the default height did not fix this. Audit measurements using `get_width()` versus GTK minimums must account for CSS padding: use `get_allocated_width()` for the like-for-like comparison. The outer bounds failure is independently reproduced, not inferred only from mismatched measurement APIs.

Plan/implementation: monitor-bounded suggested sizes rather than hard requests; reduce header whitespace and wrap title/quote/introduction labels; use per-page stack width, filling the available viewport. Preserve existing native controls and page/sidebar layout. Provide horizontal scrolling with an explicit natural-width Gtk.Viewport and scroll-to-focus so controls never shrink below their native requisition. The explicit viewport is needed on GTK4.18/4.20; automatic wrapping alone still allocated the stack below native minimum there. Small windows intentionally scroll oversized page controls rather than clipping or migrating all rows/widgets.

`bash tests/prefs-native.sh layout` calls the actual exported `fillPreferencesWindow`, sets 120dpi (125% of96), selects GTK/Flatpak, measures outer bounds and CSS-inclusive native allocation, checks each of the 13 pages at 820px and 640px, and writes `layout.json`. RED before fix: `openbar-prefs.aKTs7J`; replay against previous source with corrected padding-aware assertion: `OPENBAR_PREFS_SOURCE_REF=917045f bash tests/prefs-native.sh layout`, artifact `openbar-prefs.Ewafwg`, fails outer stack bounds. This source-ref override only replaces the disposable source copy, not the worktree. Initial older-runtime RED `openbar-prefs.udXELp`/`openbar-prefs.1dmdFA` demonstrated need for explicit viewport.

Final native results (all paths under `/var/lib/hermes/.hermes/cache/scratch/`):

| Runtime | lifecycle | transactions | layout |
|---|---|---|---|
| Shell50 / GTK4.22.4 | `openbar-prefs.pcHQUO` | `openbar-prefs.nKZb1M` | `openbar-prefs.rNq4ly` |
| Shell49.4 / GTK4.20.3 | `openbar-prefs.nX0znZ` | `openbar-prefs.LSzjUI` | `openbar-prefs.WPjsju` |
| Shell48.3.1 / GTK4.18.6 | `openbar-prefs.GMZZvO` | `openbar-prefs.o1TaOv` | `openbar-prefs.eOjfeu` |

All have post-assertion success markers; no uncaught preferences exceptions. GTK4.22 at125%: GTK/Flatpak native minimum481/natural664, allocated664, scroll viewport482; controls are fully reachable. Older GTK minimum516/natural724, allocated724, viewport463. Native title/quote/stack-box remain within820px and640px window bounds. No Adwaita allocation-overflow warnings in final layout runs. Limits: not a pixel-aesthetic review, every locale or physical fractional monitor scale. The keyboard-focus scrolling property is enabled but physical input navigation is not certified.

Sources: [GTK Viewport horizontal policy](https://docs.gtk.org/gtk4/property.Scrollable.hscroll-policy.html), [Gtk.Label max-width-chars](https://docs.gtk.org/gtk4/property.Label.max-width-chars.html), [upstream large-text issue98](https://github.com/neuromorph/openbar/issues/98).

## Preserved baseline regression suites

The unchanged `tests/run-native-regressions.sh` passed its entire combined native matrix at the final preferences source (Shell50.4). Representative first/last artifacts `openbar-integration.kSHrFC` and `openbar-integration.rqDx1D`; all intermediate exact paths are in the terminal execution output. The unchanged `tests/run-write-tests.sh` passed all23 filesystem cases: `openbar-writes.uhS4g5`. First attempt lacked Pango typelibs (`openbar-writes.mFzZyH`), then rerun with coherent Pango/Harfbuzz/GI typelibs passed. Existing combined runner and all other production modules are unchanged.
