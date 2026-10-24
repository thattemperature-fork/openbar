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
