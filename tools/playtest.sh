#!/usr/bin/env bash
# Rescues as theorems — a bot that must empty the keep, controls that must fail,
# and a mechanism proof for every rule of the cave.
#
# This is a GATE, not a printout: it exits non-zero if any claim is not PASS.
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-chromium}"
FAILED=0
run() {
  local out
  out="$("$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --virtual-time-budget=500000 --dump-dom \
    "file://$DIR/index.html?verify=$1" 2>/dev/null | grep -o 'VERIFY:{[^<]*' | head -1)"
  if [ -z "$out" ]; then
    echo "NO REPORT   $1"
    FAILED=$((FAILED + 1))
    return
  fi
  echo "$out"
  case "$out" in
    *'"outcome":"PASS"'*) ;;
    *) FAILED=$((FAILED + 1)) ;;
  esac
}
for m in solution calm solution-seeds null ablate-bubble ablate-pop ablate-aim \
         mech-bubble mech-trap mech-pop mech-escape mech-chain mech-ride \
         mech-wrap mech-hurry mech-death mech-extend mech-fruit mech-clear \
         mech-clear-strict mech-blowrate mech-ghost-kills mech-cascade mech-aim mech-jump mech-air \
         mech-platform mech-monsters mech-boulder mech-ledge mech-selfbubble mech-angry; do
  run "$m"
done
if [ "$FAILED" -ne 0 ]; then
  echo "GATE FAILED: $FAILED claim(s) did not pass."
  exit 1
fi
echo "GATE PASSED: every claim holds."
