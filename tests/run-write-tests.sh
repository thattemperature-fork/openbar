#!/usr/bin/env bash
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
: "${TMPDIR:?Set TMPDIR to disposable scratch}"
root=$(mktemp -d "$TMPDIR/openbar-writes.XXXXXX")
printf 'Artifacts: %s\n' "$root"
mkdir -p "$root/schemas"
cp "$repo/openbar@neuromorph/schemas/"*.xml "$root/schemas/"
glib-compile-schemas "$root/schemas"
for test in "${@:-gtk-completion}"; do
    dir="$root/$test"
    mkdir -p "$dir/config" "$dir/data" "$dir/home" "$dir/schemas"
    cp "$root/schemas/gschemas.compiled" "$dir/schemas/"
    OPENBAR_WRITE_TEST_DIR="$dir" HOME="$dir/home" XDG_CONFIG_HOME="$dir/config" \
        XDG_DATA_HOME="$dir/data" GSETTINGS_BACKEND=memory \
        gjs -m "$repo/tests/write-integrity.js" "$test"
done
