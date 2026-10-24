# Open Bar fix tracking

## Second audit follow-up

Remaining mechanisms from the complete follow-up issue/PR audit are implemented
with focused regressions. Fix map, source discussions/plans, independent reviews,
final native matrix and retained limitations:
[docs/fixes/round2-integration.md](docs/fixes/round2-integration.md).
The actual preferences-service close-during-import blocker found during review
is resolved and retested on GTK4.18/4.20/4.22. No additional push or deployment
is included in this pass. The original execution record below is historical;
the first batch was subsequently pushed on explicit request.

## Execution result

Implemented and committed the 14 numbered fix areas, plus whole-menu root
replacement and the reproduced early-runtime-path JS failure. Local `fixing`
implementation head: `9c30d033623363d769f43878a193a7cae7642fdb`.
Separate original fix commits and final integration/review corrections are
mapped in [docs/fixes/README.md](docs/fixes/README.md).

Final independent review passed. Complete combined tests passed on GNOME 49.4
and 50.4: 17 native suite runs per version, 23 disposable-file scenarios, fast
source regressions and syntax/whitespace checks. Research, discussions, plans,
RED/GREEN evidence and precise validation limits are in
[docs/fixes/integration.md](docs/fixes/integration.md) and its linked topic records.

**Not all historical reports are fixed:** original suspend, volume-slider and
native-shadow crash reports remain unreproduced in the tested current runtimes.
GTK live-provider staleness was reproduced in real applications; no safe universal
Shell-side refresh was established. Actual physical suspend, authentication unlock,
pointer/touch forwarding, old-runtime certification and cross-process dconf timing
remain outside the validated scope. See [reports.md](docs/fixes/reports.md).

Nothing pushed, deployed or submitted upstream. The original scope/evidence list
below is retained as a historical baseline, not a list of still-unimplemented
numbered fixes or a claim that every manual acceptance condition is verified.

## Original scope and evidence

Baseline: fixing branch, 1aa1eb345530df8b6e362a5fa1362d48ac8cffc6.
Based on the upstream issue/PR review in this conversation, not a claim that every upstream report has been reproduced. Scope is Open Bar only. Keep fixes in separate tested commits; do not cherry-pick broad compatibility PRs without review.

## Resolved

- Dynamic ordinary panel-menu content styling: 53c97bf. Tested using real GNOME 49.4/50.4 actors and theme nodes; actual AppIndicator D-Bus transport not exercised by the automated suite.
- GNOME 50 metadata declaration: a721450. This alone is not full compatibility.
- DateMenu clearBtn ReferenceError and positional button lookup: 1aa1eb3. Native DateMenu and real extension enable/disable tests passed on GNOME 49.4/50.4. User confirmed the runtime bug is fixed after deployment.

## Priority 1 — runtime and state integrity

1. **Complete empty-monitor handling.**
   - Evidence: source inspection and method-level reproduction; live suspend/RDP causality not universally established.
   - Adapt PR #179's direct monitor guards; also guard/rebind the primary background manager, avoid duplicated permanent settings subscriptions, and refresh monitor dimensions on return.
   - Acceptance: startup without monitors; monitor present → absent → present; disable while absent; no JS exceptions or stale manager subscriptions.
   - Links: https://github.com/neuromorph/openbar/pull/179 ; https://github.com/neuromorph/openbar/issues/99 ; https://github.com/neuromorph/openbar/issues/108

2. **Always restore auto-theme pause state.**
   - Evidence: actual-function tests reproduce pause-reload stuck true on unset theme and exceptions.
   - Validate before pausing; restore previous state in finally; handle nested calls and invalid palette totals.
   - Acceptance: selected/unselected dark/light combinations, success, injected failure; subsequent stylesheet regeneration still works.
   - Related: https://github.com/neuromorph/openbar/issues/181

3. **Fix timer and signal cleanup.**
   - Evidence: isolated source-method tests reproduce overwritten fullscreen timeout IDs and retained destroy handlers.
   - Cancel/coalesce timers; record auxiliary signal IDs; cleanup safely after partial enable and repeated cycles.
   - Acceptance: burst events followed by immediate disable; no post-disable style reload, duplicate handlers or retained destroyed actors.
   - Do not claim this resolves all historical suspend/native-crash reports without reproduction.

4. **Await and coordinate stylesheet/SVG/GTK writes.**
   - Evidence: source-confirmed callback completion/ordering defects, not absence of asynchronous APIs.
   - Return real completion promises; await stream close; reject/cancel stale generations on disable; reload CSS only after successful writes.
   - Acceptance: rapid settings changes, write failures, disable during a write; latest generation wins without accessing cleared settings.
   - Related: https://github.com/neuromorph/openbar/issues/181

5. **Restore only system appearance changes still owned by Open Bar.**
   - Evidence: system accent is written but not restored on disable; source-confirmed.
   - Preserve original accent and last written value; do not overwrite a later user change. Audit Yaru/icon restoration separately when that feature is enabled.
   - Acceptance: enable/change/disable, user changes while enabled, repeated cycles.
   - Link: https://github.com/neuromorph/openbar/issues/106

## Priority 2 — GNOME 49/50 appearance

6. **Modern notification groups and media styling.**
   - Evidence: native notification group remains untagged on 49.4/50.4; media mismatch source-checked.
   - Replace obsolete section._list assumptions with modern MessageView/group support; retain old-version handling.
   - Acceptance: existing/new groups, new messages inside groups, expansion/collapse, removal, media controls, cleanup; actual notification/media delivery smoke test.
   - Related proposal, not an implemented fix: https://github.com/neuromorph/openbar/issues/181

7. **Quick Settings menu-button radius and separator colors.**
   - Evidence: real St theme-node mismatch reproduced on 49.4/50.4.
   - Style quick-toggle-menu-button and separator, including LTR/RTL and checked/hover/focus/active states; retain appropriate legacy selectors.
   - Acceptance: radius zero/nonzero, distinct native/custom accents, split and unsplit toggles, alpha consistency.
   - Links: https://github.com/neuromorph/openbar/issues/114 ; https://github.com/neuromorph/openbar/issues/170

8. **Native switch and checkbox styling.**
   - Evidence: legacy SVGs coexist with native switch handle/checkbox icon; checkbox retains native accent on 49.4/50.4.
   - Use version-aware handle/StIcon styling instead of duplicate legacy images on modern Shell.
   - Acceptance: checked/unchecked, hover/focus, RTL, high contrast; older-version regression coverage.

## Priority 2 — colors and wallpaper

9. **Correct color calculations.**
   - Evidence: executed HSP scalar call with green=0 yields NaN; color-distance identity/symmetry checks fail.
   - Fix argument-shape detection separately; validate RGB→Lab and DeltaE00 together against published reference vectors.
   - Acceptance: zero channels, scalar/array equivalence, identity, symmetry and reference vectors; review palette changes.
   - Do not apply an alleged rgbToHex string-concatenation fix: that defect was not present in the reviewed source.

10. **Retain the final wallpaper refresh and reduce main-thread work.**
    - Evidence: source-confirmed dropped events in five-second guard and synchronous image decoding/quantization; reported stutter attribution needs measurement.
    - Use latest-request/trailing refresh; respect pixel rowstride; validate palette/count consistency. Measure before choosing caching, sampling or worker offload.
    - Acceptance: rapid changes, same URI with changed image, padded RGB rows, separate light/dark palettes; frame-time measurement.
    - Links: https://github.com/neuromorph/openbar/issues/161 ; https://github.com/neuromorph/openbar/issues/92

## Conditional fixes — relevant when the feature is enabled

11. **GTK CSS backup and ownership safety.**
    - Source-confirmed: failed backup can be followed by overwriting gtk.css.
    - Abort on backup failure; preserve originals and independent user edits; test with disposable files only.
    - Links: https://github.com/neuromorph/openbar/issues/120 ; https://github.com/neuromorph/openbar/issues/109

12. **Flatpak override idempotency and ownership.**
    - Actual updater with isolated mocks leaves added permissions after enable/enable/disable.
    - Track only added entries, deduplicate, handle absent filesystems key, preserve independent updates.

13. **Window-max gradient reset.**
    - Source-confirmed missing gradient reset; compositor reproduction pending.
    - Clearing background-color alone does not reset gradient properties. Test bar types and buttonbg-wmax states.
    - Link: https://github.com/neuromorph/openbar/issues/163

14. **Fitts/proximity widgets: GNOME 50, RTL and unlock behavior.**
    - Source-confirmed incomplete gating in PR #178; gesture conflict and RTL/user symptoms require interactive reproduction.
    - If disabling on GNOME 50, centralize the gate to include position-change/delayed paths. Investigate physical bounds in RTL separately.
    - Links: https://github.com/neuromorph/openbar/pull/178 ; https://github.com/neuromorph/openbar/issues/153 ; https://github.com/neuromorph/openbar/issues/154

## Reproduce before choosing a fix

- Suspend styling failures: #182/#145/#142/#102. Separate JS exceptions, missing styles and native crashes; collect exact logs and effective stylesheet/actor state.
- Volume-slider theme loss: #139. Need before/after class and theme-node evidence.
- GTK application live light/dark refresh: #119/#133. Requires application-side CSS-provider testing, not only Shell file-write changes.
- Historical native shadow crashes: #35/#63/#77. Establish whether present on current GNOME before adopting old workarounds.
- Untagged whole-menu root replacement remains outside the dynamic-content CSS fix; reproduce if encountered.

## Upstream contribution follow-up

- Prepare focused upstream submissions for the completed dynamic-content and DateMenu fixes; none opened yet in this work.
- Avoid wholesale PR #171/#172: invalid ColorDialogButton.add_palette calls; #172 also adds a duplicate root tree rather than updating packaged source.
- PR #84's unlock-dialog mode is not a general suspend fix.

## Working rules

- Each fix: failing regression first, narrow implementation, actual execution, review, then explicit publishing/deployment.
- Full lifecycle success with default fixture settings does not validate hotplug, immediate-disable races, real AppIndicator/IBus transport or every optional feature.
- No code changes are authorized merely by this TODO list.
