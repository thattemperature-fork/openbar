#!/usr/bin/env bash
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"
node tests/round2-qsap.mjs
