#!/usr/bin/env bash
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
: "${TMPDIR:?Set TMPDIR to disposable scratch}"
root=$(mktemp -d "$TMPDIR/openbar-writes.XXXXXX")
printf 'Artifacts: %s\n' "$root"
mkdir -p "$root/schemas"
cp "$repo/openbar@neuromorph/schemas/"*.xml "$root/schemas/"
glib-compile-schemas "$root/schemas"
if [ "$#" -eq 0 ]; then
    set -- gtk-completion reload-completion reload-failure stale-disable active-disable latest-generation \
        gtk-backup-failure gtk-restore gtk-edits gtk-symlink gtk-backup-edit gtk-original-bytes \
        flatpak-repeat flatpak-missing-key flatpak-user-changes flatpak-user-removal \
        flatpak-no-file flatpak-symlink flatpak-write-failure flatpak-disable-active
fi
for test in "$@"; do
    dir="$root/$test"
    mkdir -p "$dir/config" "$dir/data" "$dir/home" "$dir/schemas"
    cp "$root/schemas/gschemas.compiled" "$dir/schemas/"
    status=0
    OPENBAR_WRITE_TEST_DIR="$dir" HOME="$dir/home" XDG_CONFIG_HOME="$dir/config" \
        XDG_DATA_HOME="$dir/data" GSETTINGS_BACKEND=memory \
        gjs -m "$repo/tests/write-integrity.js" "$test" >"$dir/result.log" 2>&1 || status=$?
    # Assertions in Gio.Settings signals can be logged without failing the process.
    # Require exact success and no other output, not merely an exit status.
    result=$(<"$dir/result.log")
    printf '%s\n' "$result"
    if [ "$status" -ne 0 ] || [ "$result" != "PASS $test" ]; then
        printf 'FAIL %s (exit %s); log: %s\n' "$test" "$status" "$dir/result.log"
        exit 1
    fi
done
