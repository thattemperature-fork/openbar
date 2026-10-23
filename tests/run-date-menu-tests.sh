#!/usr/bin/env bash
# Needs gnome-shell, glib-compile-schemas, dbus-run-session and software Mesa.
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
: "${TMPDIR:?Set TMPDIR to a disposable scratch directory}"
mode=${1:-date-menu}
case "$mode" in date-menu|lifecycle) ;; *) printf 'Use date-menu or lifecycle\n' >&2; exit 2;; esac
dir=$(mktemp -d "$TMPDIR/openbar-$mode-test.XXXXXX")
export OPENBAR_TEST_DIR="$dir" OPENBAR_TEST_MODE="$mode"
mkdir -m 700 "$dir/run" "$dir/home"
# Real metadata, code, assets and schemas without writes to the checkout.
cp -R "$repo/openbar@neuromorph" "$dir/openbar@neuromorph"
glib-compile-schemas "$dir/openbar@neuromorph/schemas"
export HOME="$dir/home" XDG_CONFIG_HOME="$dir/config" XDG_DATA_HOME="$dir/data"
export XDG_CACHE_HOME="$dir/cache" XDG_RUNTIME_DIR="$dir/run"
export GSETTINGS_BACKEND=memory LIBGL_ALWAYS_SOFTWARE=1
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS
status=0
timeout 60 dbus-run-session -- gnome-shell --headless --no-x11 \
    --virtual-monitor 1024x768 --automation-script "$repo/tests/date-menu-lifecycle.js" \
    >"$dir/shell.log" 2>&1 || status=$?
printf 'Shell exit: %s; artifacts: %s\n' "$status" "$dir"
if [ "$status" -ne 0 ] || [ ! -f "$dir/result" ]; then
    printf 'FAIL: no successful test result; see shell.log\n'
    exit 1
fi
# GJS can log asynchronous exceptions while the compositor exits successfully.
# Extension stack frames catch newer GNOME Shell-CRITICAL log formatting too.
# Missing desktop services remain visible in shell.log, but are not Open Bar errors.
if grep -E 'JS ERROR:|JS CRITICAL:|Unhandled promise rejection|Openbar: Error|Error creating OpenBar|@file://.*/openbar@neuromorph/' "$dir/shell.log"; then
    printf 'FAIL: JavaScript/extension errors in shell.log\n'
    exit 1
fi
read -r result < "$dir/result"
printf '%s\n' "$result"
