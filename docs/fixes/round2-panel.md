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

## Reproduction command

With coherent Shell/typelibs/Mesa from a single Nix ref (see existing native testing docs), run:

```sh
bash tests/round2-panel-run.sh visibility
```

Runner creates private HOME/XDG/runtime, memory settings, copies and compiles the actual extension, unsets desktop bus/display variables, and checks process status, post-cleanup marker and extension/test errors.

## Limits

Native indicator show tests actor/layout and exported enable/disable, not screencast transport. Native class-shaped dock tests do not certify Ubuntu Dock integration, clipping pixels, or third-party extension transport. No screenshots or capture recordings are synthesized.
