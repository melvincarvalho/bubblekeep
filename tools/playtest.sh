#!/usr/bin/env bash
# Rescues as theorems — a bot that must empty the keep, controls that must fail,
# and a mechanism proof for every rule of the cave.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-chromium}"
run() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --virtual-time-budget=300000 --dump-dom \
    "file://$DIR/index.html?verify=$1" 2>/dev/null | grep -o 'VERIFY:{[^<]*' | head -1
}
for m in solution solution-seeds null ablate-bubble ablate-pop ablate-jump \
         mech-bubble mech-trap mech-pop mech-escape mech-chain mech-ride \
         mech-wrap mech-hurry mech-death mech-extend mech-fruit mech-clear \
         mech-platform mech-monsters mech-boulder mech-ledge mech-selfbubble mech-angry; do
  run "$m"
done
