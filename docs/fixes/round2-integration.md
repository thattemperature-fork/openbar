# Second audit fixes: implementation and verification

Baseline: `ffba24d4391e987fafbdf38fb9abb4fe4a0b91ae`.
Scope is the remaining confirmed mechanisms from the second complete issue/PR
audit, not an attempt to cure unreproduced native crashes or physical suspend.
No live desktop or host application/settings import was used.

## Fix map

- **Preferences lifecycle:** own explicit settings handlers, UI timers and display
  CSS provider; release on close, pre-realize destruction and partial initialization.
  [Plan, RED/GREEN and tests](round2-prefs.md).
- **Import/export/reset:** real transaction completion with exception-safe pause
  release, production-service close deferral, overlap rejection, validated exports
  without transient flags, local wallpaper URI preservation, prevalidated imports
  in bounded batches. [Evidence](round2-prefs.md),
  [actual service correction and policy](round2-prefs-service.md).
- **Large-text preferences:** wrap/fill content, scroll actual native requisitions
  rather than clipping controls; keyboard focus scrolling enabled.
  [Native allocation coverage](round2-prefs.md).
- **GTK view cascade:** narrow collection nodes, preserve native selection pairs,
  matching foreground/backdrop, transparent class-bearing labels, namespaced view
  colors; leave TextView canvases application-owned.
  [Plan/native GTK3+GTK4 regressions](round2-gtk.md).
- **Traffic-light controls:** paint actual GTK4 circles on centered native image,
  retain larger button hit target and GTK3 button-face fallback.
  [Native rendering/state coverage](round2-gtk.md).
- **Hidden native recording/sharing indicators:** prepare classes before first
  visibility, core visibility observation independent of Fitts.
  [Plan/exported lifecycle coverage](round2-panel.md).
- **Trilands visible endpoints:** semantic left/right pseudoclasses for zero/one/
  many visible buttons, including RTL and hidden siblings, without actor reordering.
  [Plan/native radii tests](round2-panel.md).
- **Legacy app highlights:** restore missing selector-list commas while retaining
  modern overview-tile rules. [Generated native CSS tests](round2-panel.md).
- **Dock highlight corners:** couple to configured dock radius, bounded to half
  icon size; no new arbitrary radius preference. [Tests/limits](round2-panel.md).
- **Menu alpha dispatch:** correct two misspelled exclusion keys; not a claim
  opacity CSS never updated before. [RED/GREEN](round2-geometry.md).
- **Bottom/WindowMax placement:** keep independent normal bottom gap, use active
  margin policy after setting/scale/monitor changes, eliminate stale geometry cache.
  [Native/method matrices](round2-geometry.md).
- **Fullscreen policy:** enforce live opt-out at common stylesheet load boundary,
  including reload/generation/contrast/Overview/startup; correct reset state.
  [Native stylesheet-list assertions](round2-geometry.md).
- **QSAP integration wiring:** read current menu, independently own graph and
  replacement/removal/toggle cleanup, retain independent menu-set hooks.
  [Fixture tests and native control coverage](round2-menus.md).
- **Custom menu traversal:** valid siblings survive malformed submenu; stable
  DateMenu named fields survive notification-pane relocation.
  [Tagged45–50 contracts/native49–50 tests](round2-menus.md).
- **Custom WindowMax colors:** opt-in `autotheme-preserve-wmax` with a bound UI
  switch under Auto Theme; default false preserves existing generation behavior.
  [Actual palette tests and policy](round2-autotheming.md).

## Integration

Focused worker commits were cherry-picked into one staging tree. Changes merged
without textual conflicts; this alone is not semantic verification. Parent added
the new preservation switch to the updated responsive preferences UI and native
assertions for bidirectional setting binding. Parent added
`tests/run-round2-regressions.sh` to run the old complete Shell matrix plus all
new Shell regressions against the same final source and one coherent dependency
set. GTK and preferences/private-dconf runners isolate their own processes/buses.

The first concurrent GTK49 layout run observed allocation before the next frame
(35ms arbitrary wait). Exact standalone rerun passed; the test now waits for the
native allocation/scroll invariant with a bounded deadline and retains the same
final assertion. This was a harness timing correction, not a weakened minimum
size requirement.

## Combined execution evidence

Parent combined tree passed `tests/run-round2-regressions.sh` on native GNOME
49.4 and 50.4: all 17 preserved suites plus seven new native suites per version.
The new recording/Trilands/selector/dock suites additionally passed on48.2.
[Exact completion-file readbacks](round2-combined-results.json) contain52 native
runs, with no unexpected extension stacks or unhandled promise matches. These
results precede any final independent-review corrections and must be supplemented
if production source changes afterward.

Native GTK3/GTK4 view and traffic-light tests passed109 assertions per coherent
GTK4.20.3 and4.22.4 dependency set; [details](round2-gtk-combined-results.json).
All23 real filesystem/ownership scenarios passed at `openbar-writes.crRaFw`.
Preferences lifecycle, private-dconf transactions and layout passed onGTK4.18.6,
4.20.3 and4.22.4; [nine result readbacks](round2-prefs-combined-results.json)
include78 validated allocations over13 pages/two widths/three runtimes. The
WindowMax preference binding is additionally tested in both directions.

Syntax checks of every production/test JS/MJS and bash runner, existing runtime
and palette fast regressions, and baseline-relative whitespace checks passed.
A scratch-copy extension bundle with all new source/schema/assets built
successfully. Packaging is not installation or deployment.

## Independent review

Extension/panel/geometry/menu review: PASS; CSS/autotheme review: PASS, with
nonblocking suggestions for more GTK4 collection/high-contrast coverage.

Preferences review found a blocking mismatch in the initial lifetime test:
`ExtensionPrefsDialog` is not attached to a GApplication. Production
`ExtensionsService` releases its own hold on close and can shut down after its
idle timeout; holding an artificial Adw.Application in a fixture does not prove
real dialog survival. The earlier close-during-import pass therefore establishes
only fixture-app behavior. The actual service/dialog regression failed before
correction and now passes, including repeated close while a real child is still
pending past the service idle timeout. The object-local close guard preserves
existing handler state, restores settings and flushes before replaying one close.
[Design, strict RED/GREEN and limits](round2-prefs-service.md).

Final bounded independent review of that correction: PASS, no remaining concrete
blockers. Independent native service/service-error runs each passed12 assertions.
Parent replayed baseline9024ec3 and observed the expected real service shutdown
with import-export=true (`openbar-prefs.5XA8eA`), then reran all five preference
modes on GTK4.18.6/4.20.3/4.22.4: **15 runs,312 assertions PASS**.
[Final production-host evidence](round2-prefs-final-results.json).

After this last production correction, the complete Shell matrix was rerun:
**24 suites each on49.4 and50.4,48 final runs PASS**.
[Final readbacks](round2-final-results.json) supersede the earlier combined matrix.
One intermediate49 root-menu test sampled pre-publication CSS after a fixed300ms;
unchanged standalone rerun passed. It now awaits the actual writer completion
before retaining the exact same final color-equality check. No production menu
code changed for this fixture correction.

Reviewer test setup temporarily appended a test export and compiled schemas in
the staging source instead of the intended disposable copy. Those exact test
artifacts were identified and restored; no legitimate fixes were removed. Final
source checks must require no test export and unchanged tracked compiled schema.


## Explicit remaining limits

- No safe generic force-reload of independent applications' GTK CSS providers
  was established; running application refresh still needs restart/cooperation.
- The narrowed view theme intentionally does not recolor generic text editors:
  GTK exposes no reliable distinction between a generic TextView and an app's
  semantic note canvas. Other app/window/headerbar/collection styles remain.
- Imported settings are prevalidated before mutation, but later batch I/O failure
  can leave earlier successful batches applied. Error reporting and pause release
  are guaranteed by tests; all-or-nothing rollback/crash recovery is not promised.
- Actual third-party QSAP/Ubuntu Dock/Evolution/Sticky integrations, physical
  screencast transport, fullscreen hardware, authentication, pointer/touch and
  suspend remain outside component/native-private-compositor evidence.
- Older45–47 menu contracts are source-shaped tests, not native certification.
  Selected48/49/50 actor/preferences tests do not certify every optional feature.
- Accepted settings operations defer user close until completion. A permanently
  hung child can keep preferences open; process kill/Shell disappearance is not
  crash recovery. See the explicit [service policy](round2-prefs-service.md).
- Nothing pushed or deployed during this fix pass.
