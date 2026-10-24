#!/usr/bin/env bash
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
: "${TMPDIR:?Set TMPDIR to disposable scratch}"
dir=$(mktemp -d "$repo/.menu-modern-root.XXXXXX")
export OPENBAR_TEST_DIR="$dir"
mkdir -m 700 "$dir/run" "$dir/home"
cp -R "$repo/openbar@neuromorph" "$dir/openbar@neuromorph"
glib-compile-schemas "$dir/openbar@neuromorph/schemas"
export HOME="$dir/home" XDG_CONFIG_HOME="$dir/config" XDG_DATA_HOME="$dir/data"
export XDG_CACHE_HOME="$dir/cache" XDG_RUNTIME_DIR="$dir/run"
export GSETTINGS_BACKEND=memory LIBGL_ALWAYS_SOFTWARE=1
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS
status=0
timeout 80 dbus-run-session -- gnome-shell --headless --no-x11 \
    --virtual-monitor 1024x768 --automation-script "$repo/tests/menu-modern-root.js" \
    >"$dir/shell.log" 2>&1 || status=$?
printf 'Shell exit: %s; artifacts: %s\n' "$status" "$dir"
if [ "$status" -ne 0 ] || [ ! -f "$dir/result" ]; then
    printf 'FAIL: no successful test result; see shell.log\n'; exit 1
fi
if grep -E 'JS ERROR:|JS CRITICAL:|Unhandled promise rejection|Openbar: Error|Error creating OpenBar|@file://.*/openbar@neuromorph/' "$dir/shell.log"; then
    printf 'FAIL: JavaScript/extension errors in shell.log\n'; exit 1
fi
read -r result < "$dir/result"
printf '%s\n' "$result"
