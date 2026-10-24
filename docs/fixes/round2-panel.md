# Round 2 panel rendering fixes

Baseline: `ffba24d4391e987fafbdf38fb9abb4fe4a0b91ae`. Private headless compositors only; no live desktop, capture, push, or deployment.

## Sources and plan

- [Recording indicator #143](https://github.com/neuromorph/openbar/issues/143): audited `setPanelStyle` visible-only container class and enable-time visibility whitelist.
- [Trilands #124](https://github.com/neuromorph/openbar/issues/124): native hidden siblings count for `:first-child` / `:last-child`.
- App highlight selectors: actual `getStylesheet` selector lists near app-grid; two missing commas form unintended descendant selectors.
- [Dock #151](https://github.com/neuromorph/openbar/issues/151), [radius request #180](https://github.com/neuromorph/openbar/issues/180): outer radius alone cannot round icon hover fills.
- Source/evidence: `openbar-reaudit/findings-140-182.md`, `findings-80-139.md`, `findings-1-79.md`, native probes and tagged Shell contracts documented there.

Each group gets a failing actual-source native regression, minimal fix, passing regression and focused commit. Existing native controls/quick/menu tests remain unchanged.

## Recording/sharing visibility

Assign container class even while hidden. Core style pass owns a single visibility connection for every native panel Button/ButtonBox, including late additions; ConnectManager releases these on disable/destroy. Remove the constructor-name whitelist. Fitts is not involved.

RED: Shell50.4 `round2-panel-run.sh visibility` failed at `first native show has container styling without Overview`, artifact `openbar-round2-panel-visibility.Rf3LJa`.
GREEN: same command, **17 assertions**, artifact `openbar-round2-panel-visibility.Vbk1PD`. Actual native recording and sharing actors show without capture; allocation unchanged by subsequent real Overview; exact visibility signal IDs disconnected on disable; re-enable single ownership verified.

## Trilands visible endpoints

Replace physical sibling CSS selectors with owned `trilands-left` / `trilands-right` container pseudo classes. Set endpoints from visible native buttons, swapping physical sides in RTL, without any child reordering. Zero/one/many visible cases are explicit; hide/show uses the independent core visibility observers. Type changes and disable remove owned pseudo classes. This necessarily changes the three Trilands CSS selectors in addition to `setPanelStyle` and a narrow disable cleanup loop; no other style generation changed in this group.

RED Shell50.4: `openbar-round2-panel-trilands.74jBs4`, sole visible radii `[0,14,14,0]` versus required `[14,14,14,14]`. GREEN: `openbar-round2-panel-trilands.9j0tMj`, **42 assertions** including LTR/RTL, hidden siblings, unchanged actor identities/order, zero/one/many, signal-only show/hide, type and lifecycle cleanup. The initial failing fixture teardown was tightened to disable before destroying its temporary actors; production endpoint failure preceded teardown.

## App-grid selector lists

Two comma-only fixes restore checked legacy app, active Show Apps and selected legacy app highlight matches. Native generated stylesheet tests cover `app-well-app`, `show-apps`, `grid-search-result`, and modern `overview-tile`, distinct focus/selection versus accent colors and compound checked+hover.

RED Shell50.4: `openbar-round2-panel-selectors.GUgEI1`, checked legacy background transparent instead of red. GREEN: `openbar-round2-panel-selectors.1uxgJE`, **23 assertions**. Modern selectors remain controls, not a claim they previously failed.

## Dock highlight radius

Couple the icon highlight radius to `min(dbradius, disize / 2)` with a nonnegative bound. The configured icon is the inner square of the button, so this conservatively bounds corners below half the highlight button size; no arbitrary radius constant or schema option. Apply radius to the actual `.overview-icon` fill, not just outer dock background, for legacy apps, modern tiles and Show Apps. Default mode stays untouched.

RED Shell50.4: `openbar-round2-panel-dock.0cBFtZ`, hover radius `[0,0,0,0]` versus `[24,24,24,24]`. GREEN `openbar-round2-panel-dock.bYBOaA`: **244 assertions**, Custom/Bar/Menu, zero/ordinary/oversized radius, multiple icon sizes, hover/focused/active and default opt-out.

## Reproduction command

With coherent Shell/typelibs/Mesa from a single Nix ref (see existing native testing docs), run:

```sh
bash tests/round2-panel-run.sh visibility
```

Runner creates private HOME/XDG/runtime, memory settings, copies and compiles the actual extension, unsets desktop bus/display variables, and checks process status, post-cleanup marker and extension/test errors.

## Final version matrix and controls

All four new groups passed on actual **Shell48.2, 49.4 and 50.4**, **12 runs / 984 assertions**. Per-version counts: visibility17, Trilands44, selectors23, dock244. Exact artifact directories and post-cleanup result text are in [`round2-panel-results.json`](round2-panel-results.json). Final logs were parsed for Clutter allocation warnings, disposed objects, JS/extension errors and CSS parser errors: none. Missing private-desktop CalendarServer/GDM/audio/IBus warnings remain visible and are not product failures.

The final Trilands fixture also checks the **actual native QuickSettings button with native hidden siblings**. Expanded temporary native Button actors use a sized panel-shaped St.BoxLayout rather than an unsupported fourth child of Shell.Panel; the latter's vfunc allocates only the three built-in boxes and caused fixture-only allocation warnings in initial runs. Final fixtures emit none.

The unchanged `tests/run-native-regressions.sh` completed with `PASS: combined native regression matrix` on **49.4 and 50.4**: integration/I/O, runtime, native palette/import, Fitts review, ordinary menu1319, modern notification/MPRIS46, root replacement60, DateMenu9/lifecycle24, quick768, switches708, gradient128, Fitts and session lifecycle, integration assets8. No suites removed, skipped or narrowed. All existing Node runtime cleanup/monitor/appearance, palette wallpaper/theme/pause/import/colors and detached-error tests also completed successfully. `git diff --check` and both new shell-runner syntax checks passed.

Reproduce the new groups (matching native dependencies selected by the new unique matrix runner):

```sh
REF=github:NixOS/nixpkgs/nixos-25.05 bash tests/round2-panel-matrix.sh
REF=github:NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41 OPENBAR_PANEL_FULL_CONTROLS=1 bash tests/round2-panel-matrix.sh
OPENBAR_PANEL_FULL_CONTROLS=1 bash tests/round2-panel-matrix.sh
```

`TMPDIR` must point at private scratch. `REF=nixpkgs` resolved Shell50.4 for these runs; the older refs above resolved48.2 and49.4. The optional full-controls mode invokes the entire existing native runner unchanged.

## Limits

Native indicator show tests actor/layout and exported enable/disable, not screencast transport. Native class-shaped dock tests do not certify Ubuntu Dock integration, clipping pixels, or third-party extension transport. No screenshots or capture recordings are synthesized.
