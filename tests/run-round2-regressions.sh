#!/usr/bin/env bash
# Run Shell actor tests with one coherent Nix set; every suite isolates its bus.
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"
ref=${REF:-nixpkgs}
if [ "${OPENBAR_ROUND2_IN_NIX:-0}" != 1 ]; then
    mesa=$(nix eval --raw "$ref#mesa.outPath")
    icons=$(nix eval --raw "$ref#adwaita-icon-theme.outPath")
    export __EGL_VENDOR_LIBRARY_FILENAMES="$mesa/share/glvnd/egl_vendor.d/50_mesa.json"
    export XDG_DATA_DIRS="$icons/share:${XDG_DATA_DIRS:-}"
    export OPENBAR_ROUND2_IN_NIX=1
    exec nix shell "$ref#gnome-shell" "$ref#glib.dev" "$ref#glib.bin" "$ref#dbus" \
        "$ref#mesa" "$ref#gjs" "$ref#adwaita-icon-theme" "$ref#nodejs" -c bash "$0"
fi
printf '\n=== round two fast source regressions ===\n'
for test in round2-menu-alpha round2-geometry round2-qsap round2-menu-legacy; do
    node "tests/$test.mjs"
done
printf '\n=== preserved native regression matrix ===\n'
bash tests/run-native-regressions.sh
printf '\n=== round two native geometry/fullscreen ===\n'
bash tests/round2-geometry-native.sh
printf '\n=== round two menu traversal ===\n'
bash tests/round2-menu-traversal-run.sh
printf '\n=== round two auto-theme preservation ===\n'
bash tests/round2-autotheming-native.sh
for group in visibility trilands selectors dock; do
    printf '\n=== round two panel %s ===\n' "$group"
    bash tests/round2-panel-run.sh "$group"
done
printf '\nPASS: combined round two Shell matrix\n'
# GTK and private-dconf preferences have their own coherent environments:
# bash tests/round2-gtk-run.sh
# for mode in lifecycle transactions layout; do bash tests/prefs-native.sh "$mode"; done
