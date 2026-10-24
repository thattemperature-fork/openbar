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
rows as tightly packed. Palette sort consults indices of an array being sorted,
then sorts counts independently; short/empty palettes leave stale slots. Shared
counts end up describing the light wallpaper even in dark mode.

Plan: deterministic fake-clock actual-method tests for latest/trailing refresh
and unchanged-URI content events; actual GdkPixbuf decode/quantize and event-loop
latency measurements before choosing optimization. Correct rowstride and paired
sort, normalize short output with zero counts, preserve per-mode populations
without schema churn, and test distinct light/dark sources. Lifecycle methods
and primary-background manager subscriptions belong to the runtime lane.
