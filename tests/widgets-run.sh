#!/usr/bin/env bash
# Isolated real Shell / St tests. Run inside matching Shell/Mesa nix shell.
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
: "${TMPDIR:?Scratch TMPDIR required}"
dir=$(mktemp -d "$TMPDIR/openbar-widgets.XXXXXX")
export OPENBAR_TEST_DIR="$dir" OPENBAR_WIDGET_TEST="${1:-quick}"
mkdir -m 700 "$dir/run" "$dir/home" "$dir/schemas" "$dir/assets"
cp "$repo/openbar@neuromorph/media/assets/"*.svg "$dir/assets/"
cp "$repo/openbar@neuromorph/schemas/"*.xml "$dir/schemas/"
glib-compile-schemas "$dir/schemas"
export HOME="$dir/home" XDG_CONFIG_HOME="$dir/config" XDG_DATA_HOME="$dir/data"
export XDG_CACHE_HOME="$dir/cache" XDG_RUNTIME_DIR="$dir/run"
export GSETTINGS_BACKEND=memory LIBGL_ALWAYS_SOFTWARE=1
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS
status=0
timeout 90 dbus-run-session -- gnome-shell --headless --no-x11 \
  --virtual-monitor 1024x768 --automation-script "$repo/tests/widgets.js" \
  >"$dir/shell.log" 2>&1 || status=$?
printf 'Shell exit: %s; artifacts: %s\n' "$status" "$dir"
if [ "$status" -ne 0 ] || [ ! -f "$dir/result" ]; then
  printf 'FAIL: see shell.log\n'; exit 1
fi
if grep -E 'JS ERROR|JS CRITICAL|widgets regression failed|Unhandled promise|Error in stylesheet|Theme parsing error|@file://.*/openbar@neuromorph/' "$dir/shell.log"; then
  exit 1
fi
read -r result < "$dir/result"
printf '%s\n' "$result"
