#!/usr/bin/env bash
# Private headless compositor only. No host settings, suspend, lock or desktop bus.
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
: "${TMPDIR:?Set TMPDIR to scratch}"
dir=$(mktemp -d "$TMPDIR/openbar-reports.XXXXXX")
export OPENBAR_TEST_DIR="$dir" REPORTS_REPO="$repo" REPORTS_GJS="$(command -v gjs)"
mkdir -m 700 "$dir/run" "$dir/home"
cp -R "$repo/openbar@neuromorph" "$dir/openbar@neuromorph"
glib-compile-schemas "$dir/openbar@neuromorph/schemas"
export HOME="$dir/home" XDG_CONFIG_HOME="$dir/config" XDG_DATA_HOME="$dir/data"
export XDG_CACHE_HOME="$dir/cache" XDG_RUNTIME_DIR="$dir/run"
export GSETTINGS_BACKEND=memory LIBGL_ALWAYS_SOFTWARE=1 GDK_BACKEND=wayland
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS
status=0
timeout 120 dbus-run-session -- gnome-shell --headless --no-x11 --virtual-monitor 1024x768 --automation-script "$repo/tests/reports-shell.js" >"$dir/shell.log" 2>&1 || status=$?
printf 'Shell exit: %s; artifacts: %s\n' "$status" "$dir"
if [ "$status" -ne 0 ] || [ ! -f "$dir/result" ]; then printf 'FAIL: see shell.log\n'; exit 1; fi
# No text filter may conceal an asynchronous Open Bar error.
if grep -E 'JS ERROR:|JS CRITICAL:|Unhandled promise rejection|Openbar: Error|Error creating OpenBar|@file://.*/openbar@neuromorph/' "$dir/shell.log"; then exit 1; fi
read -r result < "$dir/result"
printf '%s\n' "$result"
