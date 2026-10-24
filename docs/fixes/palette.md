# Palette fixes (TODO 2, 9, 10)

Baseline: `1aa1eb345530df8b6e362a5fa1362d48ac8cffc6`. Work is confined to
`work/openbar-palette`; no deployment or publishing.

## 2 — auto-theme pause safety

Research: https://github.com/neuromorph/openbar/issues/181 proposes try/finally
and zero-total guards. This is a proposal, not independent proof of its other
claims (notably the alleged rgbToHex bug is absent here).

Investigation: autoApplyBGPalette sets pause before checking whether the requested
theme exists; both it and onModeChange overwrite previous pause on success and
leave it set after an exception. Synchronous settings callbacks can re-enter
onModeChange, whose unconditional unpause releases the outer operation early.
Counts are divided by their unchecked sum.

Plan: reject unset/invalid mode and non-finite, negative or zero-total populations
before pausing; restore previous pause in finally in both entry points; only the
successful outermost operation requests a stylesheet reload. Partial setting
writes on failure are not rolled back; exceptions still propagate.

Regression command (imports the actual production modules, not copies of their
algorithms; a Map settings double supplies synchronous failure/reentrancy):

```sh
nix shell nixpkgs#nodejs -c node tests/palette-pause.mjs
```

RED on baseline: **9 passed, 21 failed**. Unselected mode stuck paused, initially
paused operations unpaused, failure stuck paused, nested call released outer
pause, invalid populations still wrote colors. GREEN: **30 passed, 0 failed**.
Covers every selected/unselected dark/light combination, both previous pause
states, success, injected setting-write failures and subsequent reload, nested
onModeChange, import/export, invalid mode and zero/negative/NaN/Infinity counts.
`git diff --check` passes. This proves regeneration can be triggered afterwards;
actual asynchronous stylesheet write completion is the separate TODO 4 lane.

## 9 — color calculations: investigation and plan

HSP chooses scalar vs array based on truthiness of green, so scalar green=0
reads numeric red as an array. RGB→Lab omits the D65 reference-white division.
DeltaE00 uses angular hue delta rather than 2*sqrt(C1*C2)*sin(deltaHue/2), has an
incorrect mean hue expression, and subtracts the rotation term instead of using
the chroma/hue cross term. Test argument shape separately, then normalized Lab
and the complete published DeltaE00 set, identity and symmetry before changing
formulae. No rgbToHex rewrite.

References:
- https://www.ece.rochester.edu/~gsharma/ciede2000/ — Sharma, Wu, Dalal (2005),
  implementation notes, zero-chroma/wrap cases and supplementary data.
- https://www.ece.rochester.edu/~gsharma/ciede2000/dataNprograms/ciede2000testdata.txt
  — 34 published Lab pairs and four-decimal DeltaE00 answers.
- https://stackoverflow.com/questions/76143458/what-are-the-values-of-the-primary-and-secondary-colors-in-cie-lab-color-space
  — discussion of sRGB primaries and D65/2° Lab reference values.

## 9 — verification

```sh
nix shell nixpkgs#nodejs -c node tests/palette-colors.mjs
nix shell nixpkgs#nodejs -c node tests/palette-theme-review.mjs
```

RED before HSP fix: 2 passed/12 failed in the HSP+Lab subset. HSP alone
then passed while Lab and RGB DeltaE identity/symmetry still failed (e.g.
white identity 0.0418156388 instead of zero; black→green 125.9902 versus
107.3251 in reverse). GREEN: **97 tests passed**, including all **34** Sharma
vectors in both directions within **0.00005**, identity, 49 RGB pairs and
sRGB black/white/primaries within **0.0003** of the published D65 answer
(the source's rounded XYZ matrix accounts for the tiny blue difference).
`palette-pause.mjs`: **30 passed** again. The supplementary text file is
unmodified downloaded data, attributed above; no MATLAB code is copied.

Palette review on the deterministic 12-color fixture (not a visual usability
claim): all four themes retain the same accent. Distances now change selected
backgrounds, as expected: Dark menu `[0.165,0.165,0.173]` →
`[0.141,0.192,0.157]`, Light menu `[0.902,0.925,0.910]` →
`[0.922,0.902,0.925]`, Color menu `[0.565,0.565,0.588]` →
`[0.494,0.612,0.529]`; Pastel menu unchanged. The review script prints all
bar/menu/submenu/accent before/after values. No theme thresholds were retuned
against the formerly incorrect metric.

## 10 — wallpaper: investigation and plan

Research:
- https://github.com/neuromorph/openbar/issues/161 reports slideshow stutter on
  Bazzite/GNOME 49 with Blur my Shell; not proof of the exact bottleneck here.
- https://github.com/neuromorph/openbar/issues/92 concerns Open Bar 34 on older
  Shell; maintainer reproduced BackSlide working with the newer code. Do not
  present that old report as a reproduced modern bug.
- https://docs.gtk.org/gdk-pixbuf/class.Pixbuf.html explicitly documents padded
  rows (including a short final row), rowstride addressing, and asynchronous
  stream loading for GUI applications.

Source: five-second guard drops every subsequent event, including the final
wallpaper; decoding and quantization run synchronously. Pixel iteration treats
rows as tightly packed. Palette sorting consults indices of the array being
sorted and then sorts counts independently: replace it with explicit paired
entries to make the association invariant (a separate sort-only corruption was
not reproduced). Short/empty palettes leave stale slots. Shared
counts end up describing the light wallpaper even in dark mode.

Plan: deterministic fake-clock actual-method tests for latest/trailing refresh
and unchanged-URI content events; actual GdkPixbuf decode/quantize and event-loop
latency measurements before choosing optimization. Correct rowstride and paired
sort, normalize short output with zero counts, preserve per-mode populations
without schema churn, and test distinct light/dark sources. Lifecycle methods
and primary-background manager subscriptions belong to the runtime lane.

### Measurements before choosing the optimization

GJS 1.88.1, real GdkPixbuf decode + production quantizer, deterministic 3840×2160
noise PNG/JPEG. Initial unmodified pipeline: **201.375/131.044 ms**, event-loop
stall **201.564/131.144 ms**, 562,000 pixels. Isolated synchronous decode alone:
**79.093/69.010 ms**. This justified asynchronous stream decoding *and* bounded
JS sampling, rather than URI-only caching (incorrect for overwritten files).
Subsequent instrumented baseline: PNG/JPEG quantizer **29.831/29.477 ms**.
Fixed: **3.222/0.965 ms** quantizer, **80.451/48.342 ms** wall time,
**21.811/2.262 ms** max loop gap, 9,216 samples. First-run JIT/init still costs
more than a single 60 Hz frame; there is no claim of zero stutter.

The implementation uses cancellable native async file/stream decoding at a
256×256 aspect-preserving bound and at most 10,000 sampled pixels. Native decode
work may remain substantial, but no longer synchronously blocks Shell. This is
an intentional approximation of the image palette: fine detail/small accents
can differ from the former 1000px full scan. Quantizer algorithm and filtering
thresholds are unchanged. No persistent URI cache or worker subprocess is used.

```sh
# Native decoder + quantizer microbenchmark (GI_TYPELIB_PATH is needed on Nix):
types=$(nix eval --raw nixpkgs#gdk-pixbuf.out.outPath)/lib/girepository-1.0
GI_TYPELIB_PATH="$types" nix shell nixpkgs#gjs nixpkgs#gdk-pixbuf \
  -c gjs -m tests/palette-benchmark.js
# Optional first argument is a baseline extension.js path, extracted by git show.

# Native compositor frames (same private HOME/dbus/memory settings pattern as README):
ref=nixpkgs # GNOME 50.4; use pinned ref below for 49.4
mesa=$(nix eval --raw "$ref#mesa.outPath")
__EGL_VENDOR_LIBRARY_FILENAMES="$mesa/share/glvnd/egl_vendor.d/50_mesa.json" \
  nix shell "$ref#gnome-shell" "$ref#dbus" "$ref#glib.dev" "$ref#mesa" \
  -c bash tests/palette-native.sh
# GNOME 49.4 ref: github:NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41
```

Final measured **native after-paint gaps**, software rendering, generated 4K PNG:

| Shell | Baseline wall / max frame gap | Fixed wall / max frame gap | Fixed warm wall / max frame gap |
|---|---|---|---|
| 49.4 | 166.084 / 181.951 ms | 107.091 / 29.344 ms | 109.004 / 30.802 ms |
| 50.4 | 190.330 / 211.094 ms | 197.789 / 40.346 ms | 118.655 / 32.824 ms |

These are individual controlled runs, **not** a hardware FPS guarantee or proof
that every game/Blur my Shell stutter in #161 is fixed. Fixed end-to-end time is
not guaranteed lower (50.4 cold was slightly higher); main-thread responsiveness
is the relevant result. Baseline and fixed execute the real method and quantizer.
The benchmark does not include stylesheet generation or GTK write latency.

### Regression results

- `nix shell nixpkgs#nodejs -c node tests/palette-wallpaper.mjs`: RED baseline
  **0 passed/8 failed** (lost final request, unchanged URI, mode transition,
  burst coalescing, padded rows, mode counts, async generation, empty result).
  Additional RED cases preceded per-mode count consumption, unobserved settings
  failures, stale publication during debounce, and a cancelled generation
  incorrectly starting the other mode's decode. Final **14 passed**.
- Pause/population tests now **32 passed** (30 previous + 2 per-mode regressions).
  Color references remain **97 passed**.
- Native palette tests: **23 assertions** on each **49.4 and 50.4** (the
  frame-measurement snapshots above were collected with the earlier 21-assertion
  suite). Real
  cancellable async reads, distinct mode palettes, real auto-theme application,
  same-URI file overwrite, padded RGB PPM, mode-count copy, missing-file
  recovery, trailing native timers, sample bound and native frame cadence.
- Existing real extension lifecycle: **24 assertions** on each **49.4 and 50.4**,
  two complete enable/disable cycles and post-disable observation windows.
  Existing lifecycle code is unchanged by this lane. It does not cancel a
  deliberately in-flight decode: runtime integration below remains necessary.
- Native runner rejects logged extension JS exceptions even on exit zero.
  Expected missing-file warning is visible. Missing CalendarServer/GDM/audio/
  colord/etc. warnings and GNOME 49 host Fontconfig warnings remain.
- `node --check` for modified production JS, `bash -n`, `git diff --check` pass.

### Runtime integration request (parent/runtime lane)

Before clearing settings in disable/partial-enable cleanup call
`this.cancelBackgroundPalette()`. Also call it at the start of enable so an
older enable generation cannot retain population data, and schedule an initial
`updateBguri()` even when bguri is nonempty to regenerate per-mode populations
(no per-mode counts exist in the existing schema). The helper cancels native
I/O, invalidates publication and clears session counts; it is covered by real
native and controlled in-flight tests. Existing `updateBguriId` cleanup remains
sufficient for the single trailing timer; five-second `updatingBguriId` is no
longer created. Remove that legacy initialization/cleanup in the runtime lane
if desired. Do **not** move its five-second guard back around the trailing timer.

No enable/disable or connectPrimaryBGChanged edits were made here. In-flight
results additionally verify their captured settings object and generation before
publishing, but explicit lifecycle cancellation avoids needless background I/O.
Per-mode counts are session state, not a schema change; until the initial
refresh completes persisted legacy shared counts are a compatibility fallback.
