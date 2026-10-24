#!/usr/bin/env bash
# Run in a matching Shell/Mesa/GJS environment; no host desktop is used.
set -eu
cd "$(dirname "$0")/.."
for suite in integration-run.sh runtime-native.sh palette-native.sh palette-import-native.sh fitts-review-run.sh run-menu-tests.sh menu-modern-run.sh menu-modern-root-run.sh; do
    printf '\n=== %s ===\n' "$suite"
    bash "tests/$suite"
done
for mode in date-menu lifecycle; do
    printf '\n=== DateMenu %s ===\n' "$mode"
    bash tests/run-date-menu-tests.sh "$mode"
done
for mode in quick switches gradient fitts fitts-lifecycle fitts-session; do
    printf '\n=== widgets %s ===\n' "$mode"
    bash tests/widgets-run.sh "$mode"
done
export OPENBAR_INTEGRATION_SCRIPT=integration-assets.js
bash tests/integration-run.sh
unset OPENBAR_INTEGRATION_SCRIPT
printf '\nPASS: combined native regression matrix\n'
