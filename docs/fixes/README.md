# TODO fix index

Baseline: `1aa1eb345530df8b6e362a5fa1362d48ac8cffc6` on `fixing`.
Every numbered TODO was researched against upstream discussions and actual source;
linked documents record the specific plan, RED/GREEN evidence and boundaries.
This work does not claim all historical reports or all manual acceptance cases
are solved. No push, deployment or upstream PR opening is included.

## Implemented numbered fixes

- **1 — empty monitors:** `b729234`; guards, background-manager rebinding and
  deduplicated subscriptions. [Research/plan/tests](runtime.md).
  Logical list transitions tested, not physical RDP/hotplug/suspend.
- **2 — auto-theme pause:** `8506db1`; previous pause restored with finally,
  invalid populations rejected. [Research/plan/tests](palette.md).
  [Import/cache review corrections](palette-import.md).
- **3 — timer/signal cleanup:** `5a7aa64`; named coalescing, owned auxiliary
  handlers and partial-enable cleanup. [Research/plan/tests](runtime.md).
  [Additional Fitts lifecycle regressions](fitts-review.md).
- **4 — asynchronous file integrity:** `150a317` plus integration wiring;
  actual completion, serialized generations, cancellation and error ownership.
  [Research/plan/tests](writes.md), [review corrections](write-review.md),
  [combined lifecycle/asset tests](integration.md).
- **5 — system appearance ownership:** `db4ab98`; independent original/last-written
  accent, GTK and icon values, preserve later user changes.
  [Research/plan/tests](runtime.md). No third-party application redraw guarantee.
- **6 — notification groups/media:** `ebc4a0d`; modern stable MessageView scope,
  legacy fallback, group headers/media icons. [Research/plan/tests](menus.md).
  Native D-Bus Notify/CloseNotification and MPRIS transport exercised.
- **7 — Quick Settings:** `b2b28c7`; native split-button radii and separator
  colors/state/alpha. [Research/plan/tests](widgets.md).
- **8 — native switches/checkboxes:** `3f79855` plus integration cascade correction;
  native handle/icon styling on Shell 47+, old SVG fallback retained.
  [Research/plan/tests](widgets.md), [integration](integration.md).
  Actual popup-row contrast tested, not standalone controls alone.
- **9 — color calculations:** `4b908d9`; scalar zero-channel HSP, D65 Lab,
  CIEDE2000 against published Sharma vectors. [Research/plan/tests](palette.md).
  Corrected metric can deliberately change chosen background colors.
- **10 — wallpaper:** `ca31b02` plus lifecycle/import wiring; latest trailing
  refresh, native asynchronous decode, paired counts, rowstride and bounded
  sampling. [Measurements/plan/tests](palette.md), [import correction](palette-import.md).
  Sampling approximates fine-detail palettes; not a zero-stutter guarantee.
- **11 — GTK file ownership:** `cd9094f`; exclusive backups, abort on failures,
  exact originals and conservative user-edit protection. [Plan/tests](writes.md),
  [post-restore unlink correction](write-review.md). Ownership is not crash-journaled;
  no claim of rejecting symlinks in every ancestor directory.
- **12 — Flatpak ownership:** `eaaf877`; only added grants removed, idempotency,
  independent updates preserved. [Plan/tests](writes.md),
  [revocation across re-enable correction](write-review.md).
  No actual sandbox launch; identical external token re-addition is indistinguishable.
- **13 — maximized gradients:** `d5afddf`; explicit reset and buttonbg-wmax
  combinations. [Research/plan/native theme-node tests](widgets.md).
- **14 — Fitts:** `dca5e8d` plus review corrections; central GNOME50 exclusion,
  physical RTL bounds, no duplicate hooks, off-panel guard, reliable corner timer.
  [Research/plan/tests](widgets.md), [review regressions](fitts-review.md).
  Native ExtensionManager session transitions tested; actual authentication,
  physical suspend and pointer/touch forwarding remain untested.

Shell 45–48 actor contracts/selectors were source/shape-checked where documented,
not runtime-certified by GNOME49/50 headless tests.

## Additional reproduced fix

- **Whole-menu root replacement:** `7678060`, native `menu-set` discovery on an
  existing button. [Research/plan/tests](menus.md). Direct `.menu` assignment
  without native signal, QSAP/Arc and real AppIndicator transport remain outside
  that guarantee.
- **Early mode catch-up runtime-path JS failure from #77:** fixed by initializing
  runtime paths/assets before settings callbacks. [Source/reproduction](reports.md),
  [combined fix/tests](integration.md). Does not establish a native-crash cure.

## Investigated, not represented as fixed

[Separate evidence, predictions and reproduction plans](reports.md) for every report:

- **Suspend:** #182, #145, #142, #102. Original failures not reproduced;
  current isolated mode/lifecycle probes pass. Need affected exact builds,
  sanitized settings/extension order, monitor context and first error/state.
- **Volume slider:** #139. Modern native sliders retain scoped colors;
  original Ubuntu46/audio/MediaControls context not reproduced.
- **GTK live light/dark/accent:** #119, #133. Real existing applications retain
  their old user-CSS provider after file replacement; fresh processes and an
  application-owned provider reload read the new values. No safe universal
  Shell-side force-reload API was established. Application restart/cooperation
  or upstream provider support is still needed; awaiting writes alone is not a fix.
- **Native shadow crash:** #35, #63, #77. Historical SIGSEGV evidence is genuine;
  modern native stress did not reproduce it. Upstream native invalidation fix
  is present in the tested current tags. No speculative old workaround applied.

## Upstream contribution preparation

Keep focused submissions rather than a blanket compatibility PR:

- Dynamic ordinary menu content: existing `53c97bf`, actual St cascade regression.
- DateMenu Clear: existing `1aa1eb3`, named native control lookup, real lifecycle.
- New fixes above: each numbered commit plus its linked narrow regression and
  relevant review correction; split runtime/file-ownership/appearance topics.

No upstream submissions have been opened. PR #171/#172 were not wholesale applied;
#84's unlock-dialog metadata is not adopted as a general suspend remedy. The
original TODO remains the scope record; this index is its execution/result map.
