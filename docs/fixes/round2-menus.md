# Round 2: menu integrations and traversal

## Plan / scope

- QSAP: execute the current exact `enable()` registration, then derive the menu
  from the emitting button. Own a separate graph for root/column/panel observers;
  retire old graphs and classes, handle late/removal events, toggles and disable.
  Never disconnect all button `menu-set` handlers just to stop generic styling.
- Traversal: guard only absent submenu boxes, retain valid native/legacy branches.
  Resolve DateMenu's notification list and calendar via named native references,
  not left/right positions. Verify stock and relocated native trees.
- Use private HOME/XDG, memory settings and private headless compositors only.
  Separate focused commits; no push/deploy or unrelated TODO/migration changes.

## QSAP evidence

`nix shell nixpkgs#nodejs -c node tests/round2-qsap.mjs`

RED against ffba24d: exact source registration attaches no listener to the current
replacement root (`replacement current root observed, not captured enable root`).
Repeated emitter-driven setup also throws when no captured fourth argument is
supplied. GREEN after fix: `PASS round2-qsap current`, `PASS round2-qsap lifecycle`.
The fixture evaluates production registration, ConnectManager and real extension
methods; only Shell emitters/PanelGrid-shaped actors are substitutes. Cases cover
old-root cleanup, repeat setup, prepopulated late columns, late/removed panels,
removed columns, style off/on, replacement while off, native-menu restoration,
observer cleanup and a new lifecycle. Independent menu-set hooks survive toggles.

## Contracts / validation limits

Source downloaded from GNOME tags 45.0–50.0 (`js/ui/dateMenu.js`, `calendar.js`,
`panelMenu.js`) into scratch `openbar-round2-menu-contracts`. The short `45` tag
URL returned 404; the actual `45.0`–`50.0` tags succeeded. Native named field
checks and traversal evidence are recorded with the traversal commit below.

No external QSAP package is installed or certified by the QSAP-shaped fixtures.
No claim about real QSAP extension transport/lifecycle is inferred from them.

## Traversal RED → GREEN

The new `tests/round2-menu-traversal.js` executes actual extension methods with
native St/PopupMenu/DateMenu actors. Before traversal edits:

- Shell 50.4 `openbar-round2-traversal.yrQbAk`: direct malformed submenu throws
  on `menuItem.menu.box.get_children`, nested malformed submenu throws on
  `menuchild.menu.box.get_children`, relocated notification pane throws connecting
  an undefined section list. Stock DateMenu and other native menus pass.
- Shell 49.4 `openbar-round2-traversal.y8xzHZ`: the same three failures and stock
  positive controls. Both compositor processes exited 0 but lacked the completion
  marker; the runner correctly returned 1 (not a false green).
- Initial test-only correction: native day-cell class is `calendar-day`, not
  `calendar-day-base`; corrected and reran RED before production changes.

Fix: require `.menu?.box` at the two submenu edges only, keeping direct and legacy
section-nested valid submenu styling/cleanup. Resolve DateMenu via native button
identity (with existing class-name fallback), `_messageList`, `_placeholder`,
`_messageView ?? _sectionList`, and `_calendar.get_parent()`. A removed/reordered
notification pane no longer turns the calendar column into a fake message list.
No catch-all exception suppression and no skipped known native layout.

GREEN native results (exit 0, completion marker present, no extension/test JS
exception matches):

| Suite | Shell 49.4 | Shell 50.4 |
| --- | --- | --- |
| New traversal: malformed direct/nested, valid controls, stock/relocated DateMenu, all native panel menus including QuickSettings, add/remove and delayed callbacks | 492 assertions, `openbar-round2-traversal.CjIGe6` | 492 assertions, `openbar-round2-traversal.Qq7fjR` |
| Existing native menu-root replacement/toggles/late button/off-panel survive/re-enable | 60, `openbar-menu-modern-root.jAGOKv` | 60, `openbar-menu-modern-root.H4bLhz` |
| Existing exported enable/disable twice, real settings toggles and delayed work | 24, `openbar-lifecycle-test.Uq4fdP` | 24, `openbar-lifecycle-test.SdMLRh` |

Artifacts above are directories under `$TMPDIR` (`/var/lib/hermes/.hermes/cache/scratch`).

### Reproduce

```sh
# Shell 50.4; for 49.4 use the pinned ref below.
ref=nixpkgs
# ref=github:NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41
export __EGL_VENDOR_LIBRARY_FILENAMES="$(nix eval --raw "$ref#mesa.outPath")/share/glvnd/egl_vendor.d/50_mesa.json"
export XDG_DATA_DIRS="$(nix eval --raw "$ref#adwaita-icon-theme.outPath")/share:${XDG_DATA_DIRS:-}"
nix shell "$ref#gnome-shell" "$ref#glib.dev" "$ref#glib.bin" "$ref#dbus" \
  "$ref#mesa" "$ref#gjs" "$ref#adwaita-icon-theme" \
  -c bash tests/round2-menu-traversal-run.sh
# Same environment/packages: tests/menu-modern-root-run.sh,
# tests/run-date-menu-tests.sh lifecycle.

mkdir -p "$TMPDIR/openbar-round2-menu-contracts"
for v in 45.0 46.0 47.0 48.0 49.0 50.0; do
  for f in dateMenu calendar panelMenu; do
    curl -fsSL "https://raw.githubusercontent.com/GNOME/gnome-shell/$v/js/ui/$f.js" \
      -o "$TMPDIR/openbar-round2-menu-contracts/$v-$f.js"
  done
done
OPENBAR_CONTRACT_DIR="$TMPDIR/openbar-round2-menu-contracts" \
  nix shell nixpkgs#nodejs -c node tests/round2-menu-contracts.mjs
nix shell nixpkgs#nodejs -c node tests/round2-menu-legacy.mjs
nix shell nixpkgs#nodejs -c bash tests/round2-qsap-run.sh
```

The contract script passed each downloaded 45.0–50.0 source: DateMenu named
references, calendar's actual column parent, placeholder/Clear, legacy section
list (45–47), MessageView (48+), DND before 49 only, `menu-set` and assignment
before emission. Reference sources:
[DateMenu](https://github.com/GNOME/gnome-shell/blob/45.0/js/ui/dateMenu.js),
[legacy CalendarMessageList](https://github.com/GNOME/gnome-shell/blob/47.0/js/ui/calendar.js),
[modern CalendarMessageList](https://github.com/GNOME/gnome-shell/blob/50.0/js/ui/calendar.js),
[PanelMenu](https://github.com/GNOME/gnome-shell/blob/50.0/js/ui/panelMenu.js).
`round2-menu-legacy.mjs` passed all 45/46/47 source-shaped fixtures, including DND,
Clear, calendar/displays, section messages, late messages and observer cleanup.
`runtime-cleanup.mjs` also passed. Legacy fixtures/source checks are not native
45–47 certification. No actual external QSAP, panel-layout extension, physical
session lock, hardware or host desktop settings were touched or certified.
