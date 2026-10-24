#!/usr/bin/env bash
# Coherent version-selected dependencies; every test owns a private compositor.
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
ref=${REF:-nixpkgs}
mesa=$(nix eval --raw "$ref#mesa.outPath")
icons=$(nix eval --raw "$ref#adwaita-icon-theme.outPath")
export __EGL_VENDOR_LIBRARY_FILENAMES="$mesa/share/glvnd/egl_vendor.d/50_mesa.json"
export XDG_DATA_DIRS="$icons/share:${XDG_DATA_DIRS:-}"
export TMPDIR=${TMPDIR:?Use private scratch}
cd "$repo"
nix shell "$ref#gnome-shell" "$ref#glib.dev" "$ref#glib.bin" "$ref#dbus" "$ref#mesa" "$ref#gjs" "$ref#adwaita-icon-theme" -c bash -eu -c '
    for group in visibility trilands selectors dock; do
        bash tests/round2-panel-run.sh "$group"
    done
    if [ "${OPENBAR_PANEL_FULL_CONTROLS:-0}" = 1 ]; then
        bash tests/run-native-regressions.sh
    fi
'
