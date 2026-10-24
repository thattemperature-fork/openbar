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
