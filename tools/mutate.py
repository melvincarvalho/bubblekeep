#!/usr/bin/env python3
"""Mutation gate for BUBBLE KEEP.

Every mutant here breaks a real Tetris rule. The proof suite must turn red for
each one; any mutant that survives marks a rule the proofs do not constrain.
Run: tools/mutate.sh
"""
import json
import os
import re
import shutil
import subprocess
import sys

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get("CHROME", "chromium")

# The mechanism proofs each isolate one rule. A mutant killed by one of these is
# killed for a REASON. A mutant killed only by a macro run is killed by chaos: a
# 400-piece bot game diverges under almost any change, which tells us nothing
# about whether the rule is actually constrained. The gate reports both.
MECH_MODES = [
    "mech-bubble", "mech-trap", "mech-pop", "mech-escape", "mech-chain",
    "mech-ride", "mech-wrap", "mech-hurry", "mech-death", "mech-extend",
    "mech-fruit", "mech-clear", "mech-clear-strict", "mech-blowrate",
    "mech-ghost-kills", "mech-cascade", "mech-aim", "mech-jump",
    "mech-platform", "mech-monsters", "mech-boulder",
    "mech-ledge", "mech-selfbubble", "mech-angry",
]
MACRO_MODES = ["solution", "null", "ablate-bubble", "ablate-pop", "ablate-aim"]
MODES = MECH_MODES + MACRO_MODES

# (name, description, find, replace) — each breaks exactly one rule of the cave
MUTANTS = [
    ("bubble-never-rises", "a bubble that just hangs where it stops",
     "      b.y -= BUB_RISE * (b.holds ? 0.5 : 1) * dt;", "      b.y -= 0;"),
    ("bubble-flies-forever", "a bubble that never stops travelling",
     "      if (b.age >= BUB_TRAVEL || solidPx(b.x + Math.sign(b.vx) * b.r, b.y)) { b.state = 'float'; b.vx = 0; b.vy = 0; }",
     "      if (false) { b.state = 'float'; b.vx = 0; b.vy = 0; }"),
    ("bubbles-catch-nothing", "monsters pass straight through bubbles",
     "          e.state = 'bubbled'; e.bubbleT = 0; b.holds = e; b.state = 'float'; b.vx = 0;",
     "          e.bubbleT = 0;"),
    ("captives-never-escape", "a bubbled monster is bubbled forever",
     "    if (b.age > BUB_LIFE) {", "    if (b.age > 1e9) {"),
    ("escapees-are-not-angry", "a monster that breaks out is unchanged",
     "if (b.holds) { b.holds.state = 'normal'; b.holds.angry = true; b.holds.vx = (b.holds.vx >= 0 ? 1 : -1) * KINDS[b.holds.kind].speed * ESCAPE_ANGRY; }",
     "if (b.holds) { b.holds.state = 'normal'; }"),
    ("anger-is-cosmetic", "angry monsters move at normal speed",
     "  const sp = K.speed * (e.angry ? ESCAPE_ANGRY : 1);", "  const sp = K.speed;"),
    ("no-chain-bonus", "every pop pays the same",
     "    const step = Math.min(CHAIN.length - 1, G.chain.length);", "    const step = 0;"),
    ("chain-never-expires", "a chain that never breaks",
     "    G.chain = G.chain.filter(t => G.time - t < CHAIN_WINDOW);", "    G.chain = G.chain.filter(t => true);"),
    ("popping-drops-no-fruit", "kills leave nothing behind",
     "    dropFruit(b.x, b.y, step);", "    if (false) dropFruit(b.x, b.y, step);"),
    ("fruit-is-worthless", "every fruit pays the same pittance",
     "  { name: 'pear', value: 1500, col: '#ffd23f' },", "  { name: 'pear', value: 100, col: '#ffd23f' },"),
    ("bubbles-cannot-be-ridden", "standing on a bubble does nothing",
     "  if (rode && p.vy >= 0) { p.y = rode.y - rode.r - p.h / 2; p.vy = -BUB_RISE * 0.9; p.onGround = true; }",
     "  if (false) { p.onGround = true; }"),
    ("no-wrap", "falling out of the room is just falling",
     "  if (e.y - halfH > PH) {\n    const col", "  if (false) {\n    const col"),
    ("no-hurry-up", "the clock never runs out",
     "  if (!G.hurry && G.roomT > hurryAt()) {", "  if (!G.hurry && G.roomT > 1e9) {"),
    ("ghost-does-not-hunt", "the hurry-up ghost drifts aimlessly",
     "    G.ghost.vx += Math.sign(tx - G.ghost.x) * 130 * dt;", "    G.ghost.vx += 0 * dt;"),
    ("monsters-are-harmless", "touching a monster costs nothing",
     "      if (e.state === 'normal' && boxHits(p, e)) { killPlayer(); return; }",
     "      if (false) { killPlayer(); return; }"),
    ("bubbled-monsters-still-kill", "a caught monster can still kill you",
     "      if (e.state === 'normal' && boxHits(p, e)) { killPlayer(); return; }",
     "      if (boxHits(p, e)) { killPlayer(); return; }"),
    ("extend-grants-nothing", "collecting E-X-T-E-N-D does nothing",
     "        G.lives++; G.extends++; G.have = [0, 0, 0, 0, 0, 0];",
     "        G.extends++; G.have = [0, 0, 0, 0, 0, 0];"),
    ("rooms-never-advance", "clearing a room does not open the next",
     "      loadRoom(G.roomIndex + 1);", "      loadRoom(G.roomIndex);"),
    ("no-clear-bonus", "emptying a room pays nothing",
     "      G.score += roomBonus();\n      loadRoom(G.roomIndex + 1);", "      loadRoom(G.roomIndex + 1);"),
    ("walls-do-not-stop-you", "run straight through the stone",
     "  if (e.vx > 0 && (solidPx(e.x + halfW, e.y - e.h / 2 + 3) || solidPx(e.x + halfW, e.y + e.h / 2 - 3))) {",
     "  if (false) {"),
    ("no-floor", "gravity with nothing to land on",
     "    if (solidPx(e.x - halfW + 4, feet) || solidPx(e.x + halfW - 4, feet)) {", "    if (false) {"),
    ("ceilings-block-jumps", "platforms cannot be jumped up through",
     "    if (!dropThrough && (solidPx(e.x - halfW + 4, head) || solidPx(e.x + halfW - 4, head))) {",
     "    if ((solidPx(e.x - halfW + 4, head) || solidPx(e.x + halfW - 4, head))) {"),
    ("flyers-do-not-fly", "the aviary walks",
     "  if (K.flies) {", "  if (false) {"),
    ("hurlers-do-not-hurl", "the hurler throws nothing",
     "      G.parts.push({ boulder: true, x: e.x, y: e.y - 6, vx: Math.sign(p.x - e.x) * 210, vy: -60, t: 0, life: 3.2, col: '#8e6b4a' });",
     "      e.hurlT = 99;"),
    ("boulders-are-harmless", "a thrown rock passes through you",
     "      if (q.boulder && Math.abs(q.x - p.x) < 16 && Math.abs(q.y - p.y) < 18) { killPlayer(); return; }",
     "      if (false) { killPlayer(); return; }"),
    ("monsters-never-leave-a-ledge", "the keep's monsters never come down",
     "      if (!(p.alive && p.y > e.y + TILE)) e.vx = -e.vx;", "      e.vx = -e.vx;"),
    ("bubble-is-born-poppable", "the dragon eats its own breath",
     "    if (b.age < 0.3) continue;          // a bubble is born inside the snout: let it get clear first",
     "    if (false) continue;"),
    ("death-costs-no-life", "dying is free",
     "  G.deaths++; G.lives--;", "  G.deaths++;"),
    # --- the fidelity critic's own list: rule-breaks it predicted would survive ---
    ("room-clears-with-a-monster-alive", "a room completes while a monster still walks it",
     "  if (G.enemies.length === 0 && !G.over) {", "  if (G.enemies.length <= 1 && !G.over) {"),
    ("breath-is-free", "a bubble every frame — the only resource constraint deleted",
     "  p.blowT = 0.24;", "  p.blowT = 0.01;"),
    ("bubble-travel-shortened", "bubbles stop short of where the shot is aimed",
     "const BUB_SPEED = 260, BUB_TRAVEL = 0.42,", "const BUB_SPEED = 260, BUB_TRAVEL = 0.33,"),
    ("ghost-cannot-kill", "the hurry-up ghost becomes decoration",
     "    if (G.ghost && Math.abs(G.ghost.x - p.x) < 22 && Math.abs(G.ghost.y - p.y) < 24) { killPlayer(); return; }",
     "    if (false) { killPlayer(); return; }"),
    ("ghost-crawls", "the ghost hunts at a crawl",
     "    G.ghost.vx = Math.max(-118, Math.min(118, G.ghost.vx));",
     "    G.ghost.vx = Math.max(-8, Math.min(8, G.ghost.vx));"),
    ("chain-window-forever", "one endless chain: every kill after the first pays 8000",
     "CHAIN_WINDOW = 1.6, ESCAPE_ANGRY = 1.45;", "CHAIN_WINDOW = 600, ESCAPE_ANGRY = 1.45;"),
    ("chain-is-flat", "every rung of the chain pays the same",
     "const CHAIN = [1000, 2000, 4000, 8000];", "const CHAIN = [3333, 3333, 3333, 3333];"),
    ("fruit-ignores-the-chain", "a four-chain drops the same cherry as a single",
     "    dropFruit(b.x, b.y, step);", "    dropFruit(b.x, b.y, 0);"),
    ("clock-halved", "the room clock runs out in twenty seconds",
     "const HURRY_AT = 60, HURRY_LAP2 = 30,", "const HURRY_AT = 20, HURRY_LAP2 = 30,"),
    ("extend-letters-overpay", "a letter is worth a hundred times its due",
     "      G.score += 500;", "      G.score += 50000;"),
    ("anger-overtuned", "escapees come back faster than the rule says",
     "ESCAPE_ANGRY = 1.45;", "ESCAPE_ANGRY = 1.55;"),
    ("bubbles-barely-rise", "bubbles climb too slowly to be caught up with",
     "BUB_RISE = 46,", "BUB_RISE = 32,"),
    ("melon-is-a-cherry", "the fruit table flattens",
     "  { name: 'melon', value: 700, col: '#5ee36a' },", "  { name: 'melon', value: 100, col: '#5ee36a' },"),
    # --- the new rules of round two ---
    ("no-cascade", "bursting one caught monster no longer sets off its neighbours",
     "      if (Math.hypot(b.x - a.x, b.y - a.y) <= CASCADE_R) cluster.push(b);",
     "      if (false) cluster.push(b);"),
    ("cascade-is-infinite", "one burst clears the entire room wherever the bubbles are",
     "const CASCADE_R = 86;", "const CASCADE_R = 4000;"),
    ("breath-cannot-be-aimed", "up and down do nothing to the breath",
     "  if (input.blow) blow((input.down ? 1 : 0) - (input.up ? 1 : 0));", "  if (input.blow) blow(0);"),
    ("jump-pogos", "holding jump re-fires forever",
     "  p.buffer = (input.jump && !p.jumpHeld) ? JUMP_BUFFER : Math.max(0, p.buffer - dt);",
     "  p.buffer = input.jump ? JUMP_BUFFER : Math.max(0, p.buffer - dt);"),
    ("jump-too-short", "the jump no longer clears a shelf",
     "JUMP_V = 512,", "JUMP_V = 430,"),
    ("wrap-strands-you-on-the-roof", "falling out of the room leaves you outside it",
     "    const col = Math.max(0, Math.min(COLS - 1, Math.floor(e.x / TILE)));\n    let cy = 0;\n    while (cy < ROWS && solidAt(G.room, col, cy)) cy++;\n    e.y = cy * TILE + halfH + 0.5;\n    e.vy = Math.min(e.vy, 120);",
     "    e.y = -halfH;"),
    ("clearing-pays-flat-again", "speed stops being worth anything",
     "function roomBonus() { return 1000 + Math.max(0, Math.round((40 - G.roomT)) * 200); }",
     "function roomBonus() { return 1000; }"),
    ("flyers-phase-through-stone", "the aviary ignores the walls",
     "    if (!solidPx(nx, e.y) && !solidPx(nx, e.y - e.h / 2 + 4) && !solidPx(nx, e.y + e.h / 2 - 4)) e.x = nx;\n    else e.vx = -e.vx;",
     "    e.x = nx;"),
]

def run_mode(path, mode, budget=600000):
    try:
        out = subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--virtual-time-budget=%d" % budget, "--dump-dom",
             "file://%s/index.html?verify=%s" % (path, mode)],
            capture_output=True, text=True, timeout=600).stdout
    except subprocess.TimeoutExpired:
        return {"outcome": "TIMEOUT"}
    m = re.search(r"VERIFY:(\{[^<]*\})", out)
    if not m:
        return {"outcome": "NO-REPORT"}
    try:
        return json.loads(m.group(1))
    except ValueError:
        return {"outcome": "BAD-JSON"}


def failing_modes(path, modes, stop_early=False):
    """Which of these modes turn red?"""
    bad = []
    for mode in modes:
        rep = run_mode(path, mode)
        if rep.get("outcome") != "PASS":
            bad.append(mode)
            if stop_early:
                break
    return bad


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    src = open(os.path.join(DIR, "game.js")).read()

    print("baseline: running %d proofs against unmutated source..." % len(MODES))
    bad = failing_modes(DIR, MODES, stop_early=True)
    if bad:
        print("BASELINE IS NOT GREEN (%s failed) — fix that before mutation testing." % bad[0])
        return 2
    print("baseline: all %d PASS\n" % len(MODES))

    survivors, strong, weak = [], [], []
    # the browser can only read file:// URLs under the project directory, so the
    # mutants live here rather than in the system temp dir
    work = os.path.join(DIR, ".mutants")
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work, exist_ok=True)
    try:
        for name, desc, find, repl in MUTANTS:
            if only and only != name:
                continue
            if find not in src:
                print("  !! %-28s SKIPPED — anchor text not found" % name)
                survivors.append((name, desc + " [ANCHOR LOST]"))
                continue
            mdir = os.path.join(work, name)
            os.makedirs(mdir, exist_ok=True)
            shutil.copy(os.path.join(DIR, "index.html"), mdir)
            open(os.path.join(mdir, "game.js"), "w").write(src.replace(find, repl, 1))
            mech_bad = failing_modes(mdir, MECH_MODES)
            if mech_bad:
                print("  KILLED    %-28s by %s" % (name, ", ".join(mech_bad[:3]) +
                      (" +%d" % (len(mech_bad) - 3) if len(mech_bad) > 3 else "")))
                strong.append((name, desc, mech_bad))
                continue
            macro_bad = failing_modes(mdir, MACRO_MODES, stop_early=True)
            if macro_bad:
                print("  weak      %-28s only %s (chaos, not a targeted proof)" % (name, macro_bad[0]))
                weak.append((name, desc, macro_bad[0]))
            else:
                print("  SURVIVED  %-28s %s" % (name, desc))
                survivors.append((name, desc))
    finally:
        shutil.rmtree(work, ignore_errors=True)

    total = len(strong) + len(weak) + len(survivors)
    print("\n%d/%d killed by a targeted mechanism proof" % (len(strong), total))
    print("%d/%d killed only by a macro run (chaos)" % (len(weak), total))
    print("%d/%d survived everything" % (len(survivors), total))
    if weak:
        print("\nWEAK KILLS — no mechanism proof isolates these rules:")
        for name, desc, by in weak:
            print("  - %s: %s (only %s noticed)" % (name, desc, by))
    if survivors:
        print("\nSURVIVORS — rules nothing constrains:")
        for name, desc in survivors:
            print("  - %s: %s" % (name, desc))
    return 1 if (survivors or weak) else 0


if __name__ == "__main__":
    sys.exit(main())
