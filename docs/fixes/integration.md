# Combined fix integration

Baseline: `1aa1eb345530df8b6e362a5fa1362d48ac8cffc6`. The individual research,
root-cause investigations, plans and RED/GREEN evidence are in `runtime.md`,
`palette.md`, `writes.md`, `widgets.md`, `menus.md` and `reports.md`.
No push, deployment, live-desktop setting changes, physical suspend or
ScreenShield/authentication operations are part of this work.

## Integration plan and decisions

1. Keep each numbered fix as a separate commit; integrate workers in an isolated
   staging worktree before advancing `fixing`.
2. Preserve runtime timer ownership when integrating the trailing wallpaper
   refresh: use the named/coalesced `_queueTimeout`, not a second unmanaged timer.
   The palette regression harness now executes that actual helper too.
3. Keep a dedicated Fitts `ConnectManager` (runtime lane) and central GNOME 50 /
   settings gate plus physical RTL geometry (widget lane). Both designs solved
   signal ownership; choose one manager, not two competing lifetimes. Preserve
   idempotency, detached-button cleanup and named timer removal.
4. Modern MessageView needs no child observer. Retain explicit deduplication for
   the older section-list observer when combining the menu and runtime patches.
5. Begin a new style-write epoch before enable work; invalidate synchronously at
   disable entry; cancel palette I/O before clearing settings. Retain the shared
   write queue across rapid cycles and queue ownership restoration behind pending
   transactions. Expose `_styleCleanup` for tests without making Shell's
   synchronous disable contract asynchronous.
6. Own every detached async completion/rejection at the extension callback
   boundary. Initialize runtime paths before saved-mode catch-up (the distinct
   JS startup failure reported under #77). Queue static asset copies with real
   completion and let stylesheet publication depend on their successful result.
   Do not delete assets while writers run; this code retains the existing runtime
   directory across cycles.
7. Refresh wallpaper even when the saved URI is nonempty: per-mode population
   counts are intentionally session-local and must be regenerated.
8. Fix the older ordinary-menu test's compound pseudo-class strings: St expects
   space-separated names, not CSS colon notation. Historical counts in its README
   predate this correction. Move modern menu runner artifacts under `$TMPDIR`.

## Tight combined lifecycle regression

`tests/integration-run.sh` / `integration-lifecycle.js` executes the actual
exported extension, actual Gio I/O, real private GSettings, independent GTK
originals and Flatpak entries in a private compositor. No lifecycle method is
replaced. It covers saved-mode catch-up, queued cancellation, active stylesheet
replacement and wallpaper reads, no post-disable publication, exact static asset
bytes, actual generated GTK CSS/grants before teardown, restoration ordering,
active-write disable/re-enable, repeated cycles and initial per-mode populations.

The initial **26-assertion fixture** had two review-discovered gaps: the palette
URIs were empty until its trailing timer, and a microtask yield entered static
asset copying rather than stylesheet replacement. Those passes establish queued
work cleanup only, **not active palette/stylesheet I/O cancellation**. The fixture
now seeds both mode URIs, first proves the enabled/applied state, then wraps real
Gio methods only to observe entry and retain their real completion callbacks.
It asserts live cancellables before disable, cancelled tokens afterward and no
stale publication. The real I/O results are never fabricated. Rapid re-enable
asserts successful latest publication, generated GTK bytes and both Flatpak
grants before final exact restoration.

RED before glue: GNOME 50.4 exited zero but no completion marker; test failed
`detached style errors have an owner` (`openbar-integration.30UcXX`). The runtime
lane separately reproduced the real unhandled post-disable rejection; the
reports lane reproduced the early runtime-path error against the original
baseline. Strengthened fixture after glue: GNOME 50.4, **56 assertions passed**
(`openbar-integration.ytGJrs`). A marker alone is insufficient: runner rejects
logged extension errors and unhandled rejections too.

Fast combined real-source regressions: runtime monitor/cleanup/appearance PASS;
palette pause/populations **32**, colors **97**, wallpaper **14** pass. The
wallpaper suite deliberately logs an injected failure as its negative control.
Actual disposable-file writer/GTK/Flatpak suite: **20 scenarios passed**
(`openbar-writes.3sbnm1`). No host user file is touched.

## Remaining verification

The corrected compound-state ordinary-menu test failed on **both GNOME 49.4
and 50.4** at `late scoped toggle:checked active`: scoped foreground
`#cc334cff`, global foreground `#e22341ff`. A legacy ordinary-menu checked-switch
foreground rule had different specificity after dynamic-content expansion and
was overriding the modern native-control palette. Limit that rule to Shell <47;
modern controls now use the shared native-control state rules in both scopes.
This is a real production interaction exposed by the stronger test, not a
reason to relax its oracle. Failed artifacts: `openbar-menu-test.eoUrhZ` (49),
`openbar-menu-test.l9qJu1` (50).

## Final verification

Final independent review: **PASS**, no security concerns or logic blockers.
The reviewer independently reran all 23 filesystem scenarios, runtime fast
regressions, palette import/wallpaper/pause/color tests and syntax/whitespace
checks; inspected corrected lifecycle/asset synchronization. The only static
scan match was `RegExp.exec(key)` (ordinary regex matching, not code execution).

Final combined native matrix on **GNOME 49.4 and 50.4: PASS**, 17 suite runs per
version, including all review corrections. [Machine-readable results and artifact
paths](matrix-final.json) contain **34** results read back from their exact
completion files; log scans found no extension error stacks or unhandled
rejections. Both whole commands exited zero. Missing ambient services remain
logged, and the Fitts actor fixture retains its documented allocation warnings.

Per-version assertions: combined active-I/O lifecycle **56**; runtime **26**;
native palette **23**; palette import **18**; ordinary menus **1319**;
notification/media **46**; root replacement **60**; Clear **9**; older lifecycle
**24**; Quick Settings **768**; native controls **708**; gradients **128**;
Fitts actors **32**; session transitions **12**; asset ordering/failure **8**.
Fitts review **75/61** and Fitts lifecycle **12/8** on 49/50 respectively.

Parent fast rerun: palette import **11**, wallpaper **14**, pause **32**, color
**97**, runtime monitor/cleanup/appearance and detached-error regressions all
pass. Disposable-file suite: **23 scenarios pass**, artifacts
`openbar-writes.1Z8xIx`. Node syntax for all JS/MJS, bash syntax for all runners
and full baseline-relative `git diff --check` pass.

Historical probes were rerun against the combined implementation on both
versions: `openbar-reports.QNpi8F` (50.4), `openbar-reports.a6RkFM` (49.4),
**148 PASS lines each**, no extension error matches. Actual GTK 4.22.4/4.20.3
existing-process colors stay old; fresh-process/explicit application-provider
reload controls see new colors. This confirms the unresolved application boundary,
not a Shell-side live-refresh fix. These earlier report reruns precede the final
review corrections; the final native matrix above includes those corrections.

A scratch extension ZIP was successfully produced with all new helper modules
and assets. No install, push, deployment or upstream PR was performed.
[TODO outcome index](README.md) maps all numbered fixes and all unresolved
historical reports to their research, plans and validation limits.
