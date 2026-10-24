#!/usr/bin/env bash
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
: "${TMPDIR:?Set TMPDIR to a disposable scratch directory}"
dir=$(mktemp -d "$TMPDIR/openbar-palette-native.XXXXXX")
export OPENBAR_PALETTE_DIR="$dir"
mkdir -m 700 "$dir/run" "$dir/home"
cp -R "$repo/openbar@neuromorph" "$dir/openbar@neuromorph"
git -C "$repo" show 1aa1eb3:openbar@neuromorph/extension.js > "$dir/baseline-extension.js"
glib-compile-schemas "$dir/openbar@neuromorph/schemas"
export HOME="$dir/home" XDG_CONFIG_HOME="$dir/config" XDG_DATA_HOME="$dir/data"
export XDG_CACHE_HOME="$dir/cache" XDG_RUNTIME_DIR="$dir/run"
export GSETTINGS_BACKEND=memory LIBGL_ALWAYS_SOFTWARE=1
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS
status=0
timeout 60 dbus-run-session -- gnome-shell --headless --no-x11 \
    --virtual-monitor 1024x768 --automation-script "$repo/tests/palette-native.js" \
    >"$dir/shell.log" 2>&1 || status=$?
printf 'Shell exit: %s; artifacts: %s\n' "$status" "$dir"
if [ "$status" -ne 0 ] || [ ! -f "$dir/result" ]; then
    printf 'FAIL: no successful result; see shell.log\n'; exit 1
fi
# Reject logged errors even if Shell exits zero.
if grep -E 'JS ERROR:|JS CRITICAL:|Unhandled promise rejection|@file://.*/openbar@neuromorph/' "$dir/shell.log"; then
    printf 'FAIL: JavaScript/extension errors\n'; exit 1
fi
printf 'PASS: native palette assertions and measurements saved in result\n'
