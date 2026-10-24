#!/usr/bin/env bash
# Only a private headless Shell, private settings, and disposable extension copy.
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
: "${TMPDIR:?Set TMPDIR to private scratch}"
group=${1:?visibility, trilands, selectors, or dock}
case "$group" in visibility|trilands|selectors|dock) ;; *) exit 2 ;; esac
dir=$(mktemp -d "$TMPDIR/openbar-round2-panel-$group.XXXXXX")
export OPENBAR_TEST_DIR="$dir" OPENBAR_PANEL_GROUP="$group"
mkdir -m 700 "$dir/home" "$dir/run"
cp -R "$repo/openbar@neuromorph" "$dir/openbar@neuromorph"
glib-compile-schemas "$dir/openbar@neuromorph/schemas"
export HOME="$dir/home" XDG_CONFIG_HOME="$dir/config" XDG_DATA_HOME="$dir/data"
export XDG_CACHE_HOME="$dir/cache" XDG_RUNTIME_DIR="$dir/run"
export GSETTINGS_BACKEND=memory LIBGL_ALWAYS_SOFTWARE=1
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS
status=0
timeout 100 dbus-run-session -- gnome-shell --headless --no-x11 \
    --virtual-monitor 1366x768 --automation-script "$repo/tests/round2-panel-native.js" \
    >"$dir/shell.log" 2>&1 || status=$?
printf 'Shell exit: %s; artifacts: %s\n' "$status" "$dir"
if [ "$status" -ne 0 ] || [ ! -f "$dir/result" ]; then
    printf 'FAIL: no successful result; inspect shell.log\n'; exit 1
fi
if grep -E 'JS ERROR:|JS CRITICAL:|Unhandled promise rejection|Openbar: Error|Open Bar:.*failed|Error creating OpenBar|@file://.*/openbar@neuromorph/' "$dir/shell.log"; then
    printf 'FAIL: extension/test errors\n'; exit 1
fi
read -r result < "$dir/result"
printf '%s\n' "$result"
