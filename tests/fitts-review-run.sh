#!/usr/bin/env bash
# Private native Shell; snapshot only the current integrated source, never a branch.
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
: "${TMPDIR:?Use private scratch}"
dir=$(mktemp -d "$TMPDIR/openbar-fitts-review.XXXXXX")
export OPENBAR_TEST_DIR="$dir" OPENBAR_FITTS_REVIEW_CASE="${1:-all}"
case "$OPENBAR_FITTS_REVIEW_CASE" in all|existing|direct|corner|lifecycle) ;; *) exit 2;; esac
mkdir -m 700 "$dir/run" "$dir/home" "$dir/tests" "$dir/schemas"
cp -R "$repo/openbar@neuromorph" "$dir/openbar@neuromorph"
cp "$repo/tests/fitts-review.js" "$dir/tests/"
cp "$repo/openbar@neuromorph/schemas/"*.xml "$dir/schemas/"
glib-compile-schemas "$dir/schemas"
glib-compile-schemas "$dir/openbar@neuromorph/schemas"
sha256sum "$repo/openbar@neuromorph/extension.js" "$dir/openbar@neuromorph/extension.js" > "$dir/source-sha256"
export HOME="$dir/home" XDG_CONFIG_HOME="$dir/config" XDG_DATA_HOME="$dir/data"
export XDG_CACHE_HOME="$dir/cache" XDG_RUNTIME_DIR="$dir/run"
export GSETTINGS_BACKEND=memory LIBGL_ALWAYS_SOFTWARE=1
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS
status=0
timeout 90 dbus-run-session -- gnome-shell --headless --no-x11 \
    --virtual-monitor 1024x768 --automation-script "$dir/tests/fitts-review.js" \
    >"$dir/shell.log" 2>&1 || status=$?
printf 'Shell exit: %s; artifacts: %s\n' "$status" "$dir"
if [ "$status" -ne 0 ] || [ ! -f "$dir/result" ]; then
    printf 'FAIL: see shell.log\n'; exit 1
fi
if grep -E 'JS ERROR|JS CRITICAL|Fitts review regression failed|Unhandled promise|Open Bar:.*failed|Openbar: Error|Error creating OpenBar|Error in stylesheet|Theme parsing error|@file://.*/openbar@neuromorph/' "$dir/shell.log"; then
    printf 'FAIL: extension errors\n'; exit 1
fi
read -r result < "$dir/result"
printf '%s\n' "$result"
