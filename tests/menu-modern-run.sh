#!/usr/bin/env bash
# Native DateMenu and real private-bus transport, never the user's desktop.
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
: "${TMPDIR:?Set TMPDIR to a disposable scratch directory}"
dir=$(mktemp -d "$repo/.menu-modern-run.XXXXXX")
export OPENBAR_TEST_DIR="$dir"
mkdir -m 700 "$dir/run" "$dir/home" "$dir/schemas" "$dir/assets"
cp "$repo/openbar@neuromorph/media/assets/"*.svg "$dir/assets/"
cp "$repo/openbar@neuromorph/schemas/"*.xml "$dir/schemas/"
glib-compile-schemas "$dir/schemas"
export HOME="$dir/home" XDG_CONFIG_HOME="$dir/config" XDG_DATA_HOME="$dir/data"
export XDG_CACHE_HOME="$dir/cache" XDG_RUNTIME_DIR="$dir/run"
export GSETTINGS_BACKEND=memory LIBGL_ALWAYS_SOFTWARE=1
export OPENBAR_SHELL_PACKAGE="$(dirname "$(dirname "$(readlink -f "$(command -v gnome-shell)")")")"
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS
status=0
timeout 70 dbus-run-session -- gnome-shell --headless --no-x11 \
    --virtual-monitor 1024x768 --automation-script "$repo/tests/menu-modern-styling.js" \
    >"$dir/shell.log" 2>&1 || status=$?
printf 'Shell exit: %s; artifacts: %s\n' "$status" "$dir"
if [ "$status" -ne 0 ] || [ ! -f "$dir/result" ]; then
    printf 'FAIL: no successful result; see shell.log\n'; exit 1
fi
if grep -E 'JS ERROR:|JS CRITICAL:|Unhandled promise rejection|Openbar: Error|Error creating OpenBar|@file://.*/openbar@neuromorph/' "$dir/shell.log"; then
    printf 'FAIL: JavaScript/extension errors\n'; exit 1
fi
read -r result < "$dir/result"
printf '%s\n' "$result"
