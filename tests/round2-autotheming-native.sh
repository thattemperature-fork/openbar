#!/usr/bin/env bash
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
: "${TMPDIR:?Set TMPDIR to private scratch}"
dir=$(mktemp -d "$TMPDIR/openbar-round2-autotheming.XXXXXX")
export OPENBAR_WMAX_DIR="$dir"
mkdir -m 700 "$dir/home" "$dir/run"
cp -R "$repo/openbar@neuromorph" "$dir/openbar@neuromorph"
# Fixed pre-option baseline, exercising its actual exported function with native settings.
git -C "$repo" show ffba24d:openbar@neuromorph/autothemes.js > "$dir/openbar@neuromorph/baseline-autothemes.js"
glib-compile-schemas --strict "$dir/openbar@neuromorph/schemas"
export HOME="$dir/home" XDG_CONFIG_HOME="$dir/config" XDG_DATA_HOME="$dir/data"
export XDG_CACHE_HOME="$dir/cache" XDG_RUNTIME_DIR="$dir/run"
export GSETTINGS_BACKEND=memory LIBGL_ALWAYS_SOFTWARE=1
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS
status=0
timeout 90 dbus-run-session -- gnome-shell --headless --no-x11 \
    --virtual-monitor 1024x768 --automation-script "$repo/tests/round2-autotheming-native.js" \
    >"$dir/shell.log" 2>&1 || status=$?
printf 'Shell exit: %s; artifacts: %s\n' "$status" "$dir"
if [ "$status" -ne 0 ] || [ ! -f "$dir/result" ]; then
    printf 'FAIL: no successful completion marker; inspect shell.log\n'; exit 1
fi
if grep -E 'JS ERROR:|JS CRITICAL:|Unhandled promise rejection|Openbar: Error|Open Bar:.*failed|Error creating OpenBar|@file://.*/openbar@neuromorph/' "$dir/shell.log"; then
    printf 'FAIL: extension errors\n'; exit 1
fi
printf 'PASS: round2-autotheming native; results in %s/result\n' "$dir"
