#!/usr/bin/env bash
# Isolated native GTK regressions. NIXPKGS_REF may pin another coherent package set.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
if [[ ${OPENBAR_GTK_NIX:-0} != 1 ]]; then
    ref=${NIXPKGS_REF:-nixpkgs}
    shell=$(nix eval --raw "$ref#gnome-shell.outPath")
    types="$shell/lib/gnome-shell/girepository-1.0"
    for pkg in gtk4 gtk3 libadwaita pango gdk-pixbuf graphene harfbuzz gobject-introspection at-spi2-core; do
        path=$(nix eval --raw "$ref#$pkg.out.outPath")
        types="$types:$path/lib/girepository-1.0"
    done
    icons=$(nix eval --raw "$ref#adwaita-icon-theme.outPath")
    schemas=$(nix eval --raw "$ref#gsettings-desktop-schemas.outPath")
    schemaDirs=("$schemas"/share/gsettings-schemas/*)
    export GI_TYPELIB_PATH="$types" XDG_DATA_DIRS="${schemaDirs[0]}:$icons/share:${XDG_DATA_DIRS:-}"
    export LD_LIBRARY_PATH="$shell/lib/gnome-shell${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    mesa=$(nix eval --raw "$ref#mesa.outPath")
    export __EGL_VENDOR_LIBRARY_FILENAMES="$mesa/share/glvnd/egl_vendor.d/50_mesa.json"
    export OPENBAR_GTK_NIX=1
    exec nix shell "$ref#gjs" "$ref#glib.dev" "$ref#glib.bin" "$ref#dbus" \
        "$ref#gnome-shell" "$ref#mesa" "$ref#gtk3" "$ref#gtk4" "$ref#libadwaita" -c bash "$0" "$@"
fi
: "${TMPDIR:?Set TMPDIR to durable scratch}"
# Also make the existing 23 writer/ownership tests reproducible with these deps.
if [[ ${1:-} == writers ]]; then exec bash "$repo/tests/run-write-tests.sh"; fi
if [[ $# == 0 ]]; then set -- view3 view4; fi
export OPENBAR_GTK_REPO="$repo" OPENBAR_GTK_DIR OPENBAR_GTK_SUITES="$*" OPENBAR_GTK_GJS
OPENBAR_GTK_GJS=$(command -v gjs)
OPENBAR_GTK_DIR=$(mktemp -d "$TMPDIR/openbar-round2-gtk.XXXXXX")
mkdir -p "$OPENBAR_GTK_DIR"/{schemas,home,config,data,cache,run}
chmod 700 "$OPENBAR_GTK_DIR/run"
cp "$repo/openbar@neuromorph/schemas/"*.xml "$OPENBAR_GTK_DIR/schemas/"
glib-compile-schemas "$OPENBAR_GTK_DIR/schemas"
export HOME="$OPENBAR_GTK_DIR/home" XDG_CONFIG_HOME="$OPENBAR_GTK_DIR/config"
export XDG_DATA_HOME="$OPENBAR_GTK_DIR/data" XDG_CACHE_HOME="$OPENBAR_GTK_DIR/cache" XDG_RUNTIME_DIR="$OPENBAR_GTK_DIR/run"
export GSETTINGS_BACKEND=memory GDK_BACKEND=wayland LIBGL_ALWAYS_SOFTWARE=1 GTK_A11Y=none
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS GTK_THEME
status=0
timeout 120 dbus-run-session -- gnome-shell --headless --no-x11 --virtual-monitor 1366x768 \
    --automation-script "$repo/tests/round2-gtk-shell.js" >"$OPENBAR_GTK_DIR/shell.log" 2>&1 || status=$?
for suite in "$@"; do
    if [[ -f "$OPENBAR_GTK_DIR/$suite.log" ]]; then
        printf '%s\n' "$(<"$OPENBAR_GTK_DIR/$suite.log")"
    fi
done
[[ -f "$OPENBAR_GTK_DIR/complete.ok" ]] || status=1
printf 'exit=%s artifacts=%s\n' "$status" "$OPENBAR_GTK_DIR"
exit "$status"
