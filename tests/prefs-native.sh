#!/usr/bin/env bash
# Coherent Nix runtime, private compositor/bus/HOME; never host dconf.
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
: "${TMPDIR:?Set TMPDIR to a scratch directory}"
if [ "${OPENBAR_PREFS_IN_NIX:-}" != 1 ]; then
    ref=${REF:-nixpkgs}
    types=''
    for pkg in gtk4 pango gdk-pixbuf graphene harfbuzz gobject-introspection; do
        path=$(nix eval --raw "$ref#$pkg.out.outPath")
        types="$types:$path/lib/girepository-1.0"
    done
    shell=$(nix eval --raw "$ref#gnome-shell.outPath")
    mesa=$(nix eval --raw "$ref#mesa.outPath")
    icons=$(nix eval --raw "$ref#adwaita-icon-theme.outPath")
    export GI_TYPELIB_PATH="$types:$shell/lib/gnome-shell/girepository-1.0"
    export LD_LIBRARY_PATH="$shell/lib/gnome-shell${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    export OPENBAR_PREFS_RESOURCE="$shell/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource"
    dconf=$(nix eval --raw "$ref#dconf.outPath")
    export XDG_DATA_DIRS="$dconf/share:$icons/share${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}"
    export __EGL_VENDOR_LIBRARY_FILENAMES="$mesa/share/glvnd/egl_vendor.d/50_mesa.json"
    export OPENBAR_PREFS_IN_NIX=1
    exec nix shell "$ref#gnome-shell" "$ref#gjs" "$ref#gtk4" "$ref#libadwaita" "$ref#dbus" "$ref#glib.dev" "$ref#glib.bin" "$ref#dconf" "$ref#mesa" "$ref#adwaita-icon-theme" -c bash "$0" "$@"
fi
dir=$(mktemp -d "$TMPDIR/openbar-prefs.XXXXXX")
export OPENBAR_PREFS_DIR="$dir" OPENBAR_PREFS_REPO="$repo" OPENBAR_PREFS_MODE="${1:-lifecycle}" OPENBAR_PREFS_GJS="$(command -v gjs)"
mkdir -p "$dir/home" "$dir/run" "$dir/gnome-shell/extensions"
chmod 700 "$dir/run"
cp -r "$repo/openbar@neuromorph" "$dir/gnome-shell/extensions/"
printf '\nexport {OpenbarPrefs};\n' >> "$dir/gnome-shell/extensions/openbar@neuromorph/prefs.js"
glib-compile-schemas "$dir/gnome-shell/extensions/openbar@neuromorph/schemas"
export HOME="$dir/home" XDG_CONFIG_HOME="$dir/config" XDG_DATA_HOME="$dir/data" XDG_CACHE_HOME="$dir/cache" XDG_RUNTIME_DIR="$dir/run"
export GSETTINGS_BACKEND=memory LIBGL_ALWAYS_SOFTWARE=1 GDK_BACKEND=wayland GTK_A11Y=none
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS DCONF_PROFILE DCONF_USER_CONFIG_DIR
printf 'user-db:user\n' > "$dir/dconf-profile"
export DCONF_PROFILE="$dir/dconf-profile"
status=0
timeout 100 dbus-run-session -- gnome-shell --headless --no-x11 --virtual-monitor 1024x768 --automation-script "$repo/tests/prefs-shell.js" >"$dir/shell.log" 2>&1 || status=$?
printf 'Shell exit: %s; artifacts: %s\n' "$status" "$dir"
if [ "$status" -ne 0 ] || [ ! -f "$dir/result" ]; then
    while IFS= read -r line; do printf '%s\n' "$line"; done < "$dir/shell.log"
    exit 1
fi
while IFS= read -r line; do printf '%s\n' "$line"; done < "$dir/result"
