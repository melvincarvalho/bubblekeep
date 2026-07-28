'use strict';
/* BUBBLE KEEP — a Bubble Bobble tribute built by a harsh-critic agent loop.
   Copyright (C) 2026 Melvin Carvalho — AGPL-3.0-or-later.
   Original dragons, rooms and monsters; Bubble Bobble (Taito, 1986) is
   copyrighted, and revered here. */

// ------------------------------ seeded RNG ------------------------------
let _s = 1;
function srand(s) { _s = (s >>> 0) || 1; }
function rnd() { _s ^= _s << 13; _s >>>= 0; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0; return _s / 4294967296; }
// pure hash — render-side only, never the sim stream
function hash32(a, b, c) {
  let h = 2166136261 >>> 0; const str = a + '|' + b + '|' + (c || 0);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h / 4294967296;
}

// ------------------------------ the keep ------------------------------
const TILE = 36, COLS = 24, ROWS = 16;
const PW = COLS * TILE, PH = ROWS * TILE;          // 864 x 576
const OX = (1280 - PW) / 2, OY = 106;

// '#' block  '.' air  'p' player  'w' wanderer  'h' hurler  'f' flyer
const ROOMS = [
  [ // 1 — the doorstep: flat ground, two wanderers, nothing clever
    '########################',
    '#......................#',
    '#......................#',
    '#.....############.....#',
    '#......................#',
    '#......................#',
    '#..####..........####..#',
    '#......................#',
    '#......................#',
    '#.....############.....#',
    '#......................#',
    '#......................#',
    '#..####..........####..#',
    '#......................#',
    '#..p....w........w.....#',
    '########################',
  ],
  [ // 2 — the gallery: shelves that must be walked off
    '########################',
    '#......................#',
    '#......................#',
    '#....##############....#',
    '#.......w..............#',
    '#......................#',
    '#......................#',
    '#..######......######..#',
    '#......................#',
    '#......................#',
    '#....##############....#',
    '#......................#',
    '#......................#',
    '#..p...........w.......#',
    '#......................#',
    '########################',
  ],
  [ // 3 — the hurler's landing
    '########################',
    '#......................#',
    '#......................#',
    '#....####......####....#',
    '#......................#',
    '#......................#',
    '#.......h..............#',
    '#.....############.....#',
    '#......................#',
    '#......................#',
    '#..####..........####..#',
    '#......................#',
    '#......................#',
    '#..p......w.....w......#',
    '#......................#',
    '########################',
  ],
  [ // 4 — the aviary: flyers come to you
    '########################',
    '#......................#',
    '#....##############....#',
    '#......................#',
    '#...f..............f...#',
    '#......................#',
    '#..######......######..#',
    '#......................#',
    '#......................#',
    '#.....############.....#',
    '#......................#',
    '#......................#',
    '#..####..........####..#',
    '#..p........w..........#',
    '#......................#',
    '########################',
  ],
  [ // 5 — the pinch
    '########################',
    '#......................#',
    '#...####....####.......#',
    '#......................#',
    '#.....h..........h.....#',
    '#..############........#',
    '#......................#',
    '#......................#',
    '#....####....####......#',
    '#......................#',
    '#......................#',
    '#.....############.....#',
    '#......................#',
    '#..p.....w......w......#',
    '#......................#',
    '########################',
  ],
  [ // 6 — the keep's crown
    '########################',
    '#......................#',
    '#.....############.....#',
    '#......................#',
    '#...h..................#',
    '#..######......######..#',
    '#......................#',
    '#..............f.......#',
    '#....############......#',
    '#......................#',
    '#......................#',
    '#..####..........####..#',
    '#......................#',
    '#..p...w........w......#',
    '#......................#',
    '########################',
  ],
];

const KINDS = {
  wanderer: { w: 30, h: 30, speed: 52, jump: 300, col: '#ffca3a', col2: '#ff8c1a', score: 1000 },
  hurler: { w: 32, h: 34, speed: 40, jump: 340, col: '#c77dff', col2: '#8e44d0', score: 2000, hurls: true },
  flyer: { w: 30, h: 28, speed: 66, jump: 0, col: '#ff6b9d', col2: '#d63d6e', score: 3000, flies: true },
};
const LETTERS = ['E', 'X', 'T', 'E', 'N', 'D'];
const FRUIT = [
  { name: 'cherry', value: 100, col: '#ff4d5e' },
  { name: 'plum', value: 300, col: '#a86bff' },
  { name: 'melon', value: 700, col: '#5ee36a' },
  { name: 'pear', value: 1500, col: '#ffd23f' },
];
// popping several bubbled monsters in one breath pays like the arcade did
const CHAIN = [1000, 2000, 4000, 8000];

const GRAV = 1100, FALL_GRAV = 1420, JUMP_V = 470, RUN = 190;
const COYOTE = 0.10, JUMP_BUFFER = 0.12, JUMP_CUT = 190;
const BUB_SPEED = 260, BUB_TRAVEL = 0.42, BUB_RISE = 46, BUB_LIFE = 9.5, BUB_WARN = 7.0;
const HURRY_AT = 42, CHAIN_WINDOW = 0.9, ESCAPE_ANGRY = 1.45;

let G = null;

function roomAt(i) { return ROOMS[i % ROOMS.length]; }
function solidAt(room, cx, cy) {
  if (cy < 0 || cy >= ROWS) return false;
  if (cx < 0 || cx >= COLS) return true;
  return room[cy][cx] === '#';
}
function solidPx(x, y) { return solidAt(G.room, Math.floor(x / TILE), Math.floor(y / TILE)); }

function newGame(seed, opts) {
  opts = opts || {};
  srand((seed ^ 0xB0BB1E) >>> 0);
  G = {
    seed, roomIndex: 0, room: null, time: 0, score: 0, lives: 3, over: false, won: false,
    screen: 'play', player: null, enemies: [], bubbles: [], fruits: [], parts: [], pops: [],
    letters: [], have: [0, 0, 0, 0, 0, 0], roomT: 0, hurry: false, ghost: null,
    chain: [], chainT: 0, banner: null, shake: 0, msg: null, muted: false, freeze: 0,
    headless: !!opts.headless, shotMode: false, staged: false, cleared: 0, deaths: 0,
    maxRooms: opts.maxRooms || ROOMS.length, best: 0, extends: 0,
  };
  loadRoom(0);
  return G;
}
function loadRoom(i) {
  G.roomIndex = i;
  G.room = roomAt(i);
  G.enemies = []; G.bubbles = []; G.fruits = []; G.parts = []; G.letters = [];
  G.roomT = 0; G.hurry = false; G.ghost = null; G.chain = []; G.pops = [];
  let px = TILE * 2, py = TILE * 13;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const c = G.room[y][x];
    const wx = x * TILE + TILE / 2, wy = y * TILE + TILE / 2;
    if (c === 'p') { px = wx; py = wy; }
    else if (c === 'w') spawnEnemy('wanderer', wx, wy);
    else if (c === 'h') spawnEnemy('hurler', wx, wy);
    else if (c === 'f') spawnEnemy('flyer', wx, wy);
  }
  G.player = {
    x: px, y: py, vx: 0, vy: 0, w: 30, h: 32, face: 1, onGround: false,
    alive: true, invuln: 2.0, blowT: 0, anim: 0, squash: 0, coyote: 0, buffer: 0, recoil: 0,
  };
  G.banner = { txt: 'ROOM ' + (i + 1), t: 0, sub: roomName(i) };
}
function roomName(i) {
  const n = ['THE DOORSTEP', 'THE GALLERY', "THE HURLER'S LANDING", 'THE AVIARY', 'THE PINCH', "THE KEEP'S CROWN"];
  return n[i % n.length];
}
function spawnEnemy(kind, x, y) {
  const K = KINDS[kind];
  G.enemies.push({
    kind, x, y, vx: (rnd() < 0.5 ? -1 : 1) * K.speed, vy: 0, w: K.w, h: K.h,
    onGround: false, state: 'normal', angry: false, bubbleT: 0, anim: rnd() * 6,
    hurlT: 1 + rnd() * 2, seed: rnd(),
  });
}

// ------------------------------ physics ------------------------------
function boxHits(a, b) {
  return Math.abs(a.x - b.x) * 2 < (a.w + b.w) && Math.abs(a.y - b.y) * 2 < (a.h + b.h);
}
function gravFor(e) { return e.vy > 0 ? FALL_GRAV : GRAV; }
function moveBody(e, dt, dropThrough) {
  // horizontal
  e.x += e.vx * dt;
  const halfW = e.w / 2;
  if (e.vx > 0 && (solidPx(e.x + halfW, e.y - e.h / 2 + 3) || solidPx(e.x + halfW, e.y + e.h / 2 - 3))) {
    e.x = Math.floor((e.x + halfW) / TILE) * TILE - halfW - 0.01; e.hitWall = true;
  } else if (e.vx < 0 && (solidPx(e.x - halfW, e.y - e.h / 2 + 3) || solidPx(e.x - halfW, e.y + e.h / 2 - 3))) {
    e.x = (Math.floor((e.x - halfW) / TILE) + 1) * TILE + halfW + 0.01; e.hitWall = true;
  } else e.hitWall = false;
  // vertical
  e.vy += gravFor(e) * dt;
  e.y += e.vy * dt;
  const halfH = e.h / 2;
  e.onGround = false;
  if (e.vy > 0) {
    const feet = e.y + halfH;
    if (solidPx(e.x - halfW + 4, feet) || solidPx(e.x + halfW - 4, feet)) {
      e.y = Math.floor(feet / TILE) * TILE - halfH - 0.01;
      e.vy = 0; e.onGround = true;
    }
  } else if (e.vy < 0) {
    const head = e.y - halfH;
    if (!dropThrough && (solidPx(e.x - halfW + 4, head) || solidPx(e.x + halfW - 4, head))) {
      e.y = (Math.floor(head / TILE) + 1) * TILE + halfH + 0.01;
      e.vy = 0;
    }
  }
  // the keep has no floor at the bottom: fall out and you drop in from the ceiling
  if (e.y - halfH > PH) { e.y = -halfH; }
}

// ------------------------------ bubbles ------------------------------
function blow() {
  const p = G.player;
  if (!p.alive || p.blowT > 0) return false;
  p.blowT = 0.24;
  p.recoil = 1;
  for (let i = 0; i < 4; i++) {
    const a = (hash32(i, Math.floor(p.x), 5) - 0.5) * 1.1;
    G.parts.push({ x: p.x + p.face * 22, y: p.y - 2, vx: p.face * (60 + i * 22), vy: Math.sin(a) * 55 - 20,
      t: 0, life: 0.26, col: '#dff6ff' });
  }
  G.bubbles.push({
    x: p.x + p.face * 20, y: p.y - 2, vx: p.face * BUB_SPEED, vy: 0,
    r: 17, age: 0, state: 'travel', holds: null, pop: 0,
  });
  beep(300, 0.05, 'sawtooth');
  beep(760, 0.07, 'sine', 0.02);
  return true;
}
function popBubble(b, byPlayer) {
  const i = G.bubbles.indexOf(b);
  if (i >= 0) G.bubbles.splice(i, 1);
  for (let k = 0; k < 14; k++) {
    const a = k / 8 * 6.283 + hash32(k, Math.floor(b.x), 1) * 0.6;
    G.parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, t: 0, life: 0.42, col: '#bfefff' });
  }
  if (!b.holds) { beep(300, 0.04, 'sine'); return; }
  // a monster released from a burst bubble is a kill; several in one breath escalate
  if (byPlayer) {
    G.chain = G.chain.filter(t => G.time - t < CHAIN_WINDOW);
    const step = Math.min(CHAIN.length - 1, G.chain.length);
    const pts = CHAIN[step];
    G.chain.push(G.time);
    G.score += pts;
    G.pops.push({ x: b.x, y: b.y, t: G.time, txt: String(pts), big: step > 0, lift: step * 26, scale: 1 + step * 0.22 });
    G.shake = Math.max(G.shake, 0.22 + step * 0.14);
    G.freeze = Math.max(G.freeze, 0.05 + step * 0.03);
    G.parts.push({ ring: true, x: b.x, y: b.y, t: 0, life: 0.34 + step * 0.06, col: step > 0 ? '#ffe066' : '#bfefff' });
    beep(440 + step * 160, 0.12, 'square');
    dropFruit(b.x, b.y, step);
    G.cleared++;
  }
}
function dropFruit(x, y, tier) {
  const f = FRUIT[Math.min(FRUIT.length - 1, tier)];
  G.fruits.push({ x, y, vy: -90, kind: f, t: 0 });
}
function updateBubbles(dt) {
  for (const b of G.bubbles.slice()) {
    b.age += dt;
    if (b.state === 'travel') {
      b.x += b.vx * dt;
      if (b.age >= BUB_TRAVEL || solidPx(b.x + Math.sign(b.vx) * b.r, b.y)) { b.state = 'float'; b.vx = 0; }
    } else {
      b.y -= BUB_RISE * (b.holds ? 0.5 : 1) * dt;
      b.x += Math.sin(b.age * 2.2 + b.y * 0.02) * 8 * dt;
      if (solidPx(b.x, b.y - b.r)) b.y = (Math.floor((b.y - b.r) / TILE) + 1) * TILE + b.r + 0.5;
    }
    if (b.x < b.r) b.x = b.r;
    if (b.x > PW - b.r) b.x = PW - b.r;
    // trap a monster
    if (!b.holds && b.state !== 'popping') {
      for (const e of G.enemies) {
        if (e.state !== 'normal') continue;
        if (boxHits({ x: b.x, y: b.y, w: b.r * 2, h: b.r * 2 }, e)) {
          e.state = 'bubbled'; e.bubbleT = 0; b.holds = e; b.state = 'float'; b.vx = 0;
          G.freeze = Math.max(G.freeze, 0.05);
          G.shake = Math.max(G.shake, 0.18);
          G.parts.push({ ring: true, x: b.x, y: b.y, t: 0, life: 0.3, col: '#ffffff' });
          beep(520, 0.08, 'sine');
          break;
        }
      }
    }
    if (b.holds) { b.holds.x = b.x; b.holds.y = b.y; b.holds.vx = 0; b.holds.vy = 0; b.holds.bubbleT += dt; }
    // a bubble left too long bursts and the monster comes back angry
    if (b.age > BUB_LIFE) {
      if (b.holds) { b.holds.state = 'normal'; b.holds.angry = true; b.holds.vx = (b.holds.vx >= 0 ? 1 : -1) * KINDS[b.holds.kind].speed * ESCAPE_ANGRY; }
      popBubble(b, false);
    }
  }
}

// ------------------------------ monsters ------------------------------
function enemyThink(e, dt) {
  if (e.state !== 'normal') return;
  const K = KINDS[e.kind];
  const sp = K.speed * (e.angry ? ESCAPE_ANGRY : 1);
  e.anim += dt;
  if (K.flies) {
    const p = G.player;
    const tx = p.alive ? p.x : PW / 2, ty = p.alive ? p.y : PH / 2;
    e.vx += Math.sign(tx - e.x) * 60 * dt;
    e.vy += Math.sign(ty - e.y) * 60 * dt;
    e.vx = Math.max(-sp, Math.min(sp, e.vx));
    e.vy = Math.max(-sp, Math.min(sp, e.vy));
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (e.x < e.w) { e.x = e.w; e.vx = Math.abs(e.vx); }
    if (e.x > PW - e.w) { e.x = PW - e.w; e.vx = -Math.abs(e.vx); }
    if (e.y < e.h) { e.y = e.h; e.vy = Math.abs(e.vy); }
    if (e.y > PH - e.h) { e.y = PH - e.h; e.vy = -Math.abs(e.vy); }
    return;
  }
  if (e.vx === 0) e.vx = sp;
  e.vx = Math.sign(e.vx) * sp;
  moveBody(e, dt, false);
  if (e.hitWall) e.vx = -e.vx;
  // don't walk off a ledge unless chasing downward
  if (e.onGround) {
    const ahead = e.x + Math.sign(e.vx) * (e.w / 2 + 4);
    if (!solidPx(ahead, e.y + e.h / 2 + 6)) {
      const p = G.player;
      if (!(p.alive && p.y > e.y + TILE)) e.vx = -e.vx;
    }
    const p = G.player;
    if (p.alive && p.y < e.y - TILE * 1.2 && Math.abs(p.x - e.x) < TILE * 3 && K.jump) {
      e.vy = -K.jump; e.onGround = false;
    }
  }
  if (K.hurls) {
    e.hurlT -= dt;
    const p = G.player;
    if (e.hurlT <= 0 && p.alive && Math.abs(p.y - e.y) < TILE * 1.5) {
      e.hurlT = 2.2 + rnd();
      G.parts.push({ boulder: true, x: e.x, y: e.y - 6, vx: Math.sign(p.x - e.x) * 210, vy: -60, t: 0, life: 3.2, col: '#8e6b4a' });
      beep(160, 0.09, 'square');
    }
  }
}

// ------------------------------ the player ------------------------------
function playerUpdate(dt, input) {
  const p = G.player;
  p.anim += dt;
  p.blowT = Math.max(0, p.blowT - dt);
  p.squash = Math.max(0, p.squash - dt * 4);
  if (!p.alive) return;
  p.invuln = Math.max(0, p.invuln - dt);
  const want = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  p.vx = want * RUN;
  if (want) p.face = want;
  const wasAir = !p.onGround;
  p.coyote = p.onGround ? COYOTE : Math.max(0, p.coyote - dt);
  p.buffer = input.jump ? JUMP_BUFFER : Math.max(0, p.buffer - dt);
  p.recoil = Math.max(0, p.recoil - dt * 5);
  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -JUMP_V; p.onGround = false; p.squash = 0.6;
    p.coyote = 0; p.buffer = 0;
    beep(420, 0.06, 'square');
  }
  // let go early and the leap is shorter — the whole difference between a hop and a launch
  if (!input.jump && p.vy < -JUMP_CUT) p.vy = -JUMP_CUT;
  // riding a bubble: stand on it and it lifts you
  let rode = null;
  if (p.vy >= 0) {
    for (const b of G.bubbles) {
      if (Math.abs(b.x - p.x) < b.r + 8 && Math.abs((b.y - b.r) - (p.y + p.h / 2)) < 12) { rode = b; break; }
    }
  }
  moveBody(p, dt, true);
  if (rode && p.vy >= 0) { p.y = rode.y - rode.r - p.h / 2; p.vy = -BUB_RISE * 0.9; p.onGround = true; }
  if (wasAir && p.onGround) p.squash = 0.7;
  if (input.blow) blow();
  // pop bubbles by touching them
  for (const b of G.bubbles.slice()) {
    if (b === rode) continue;
    if (b.age < 0.3) continue;          // a bubble is born inside the snout: let it get clear first
    if (Math.abs(b.x - p.x) < b.r + p.w / 2 - 4 && Math.abs(b.y - p.y) < b.r + p.h / 2 - 4) {
      if (b.holds) { const e = b.holds; const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1); }
      popBubble(b, true);
    }
  }
  // fruit
  for (const f of G.fruits.slice()) {
    if (Math.abs(f.x - p.x) < 22 && Math.abs(f.y - p.y) < 24) {
      G.score += f.kind.value;
      G.pops.push({ x: f.x, y: f.y, t: G.time, txt: String(f.kind.value), big: false, lift: 0, scale: 1 });
      G.fruits.splice(G.fruits.indexOf(f), 1);
      beep(880, 0.06, 'sine');
    }
  }
  // EXTEND letters
  for (const L of G.letters.slice()) {
    if (Math.abs(L.x - p.x) < 22 && Math.abs(L.y - p.y) < 24) {
      G.have[L.idx] = 1;
      G.letters.splice(G.letters.indexOf(L), 1);
      G.score += 500;
      beep(1046, 0.09, 'sine');
      if (G.have.every(v => v)) {
        G.lives++; G.extends++; G.have = [0, 0, 0, 0, 0, 0];
        G.banner = { txt: 'EXTEND!', t: G.time, sub: 'one more dragon' };
        beep(1318, 0.25, 'triangle');
      }
    }
  }
  // death by monster, boulder or the hurry-up ghost
  if (p.invuln <= 0) {
    for (const e of G.enemies) {
      if (e.state === 'normal' && boxHits(p, e)) { killPlayer(); return; }
    }
    for (const q of G.parts) {
      if (q.boulder && Math.abs(q.x - p.x) < 16 && Math.abs(q.y - p.y) < 18) { killPlayer(); return; }
    }
    if (G.ghost && Math.abs(G.ghost.x - p.x) < 22 && Math.abs(G.ghost.y - p.y) < 24) { killPlayer(); return; }
  }
}
function killPlayer() {
  const p = G.player;
  p.alive = false; p.vy = -260;
  G.deaths++; G.lives--;
  G.shake = Math.max(G.shake, 0.6);
  G.freeze = Math.max(G.freeze, 0.22);
  beep(140, 0.35, 'sawtooth');
  if (G.lives > 0) G.banner = { txt: 'OH NO!', t: G.time, sub: G.lives + ' left' };
  else { G.banner = null; G.over = true; if (G.score > G.best) G.best = G.score; }
}

// ------------------------------ the room clock ------------------------------
function roomUpdate(dt) {
  G.roomT += dt;
  if (!G.hurry && G.roomT > HURRY_AT) {
    G.hurry = true;
    G.banner = { txt: 'HURRY UP!', t: G.time, sub: 'something is coming' };
    beep(200, 0.4, 'sawtooth');
  }
  if (G.hurry && !G.ghost && G.roomT > HURRY_AT + 2.5) {
    G.ghost = { x: PW / 2, y: 40, vx: 0, vy: 0 };
  }
  if (G.ghost) {
    const p = G.player;
    const tx = p.alive ? p.x : PW / 2, ty = p.alive ? p.y : PH / 2;
    G.ghost.vx += Math.sign(tx - G.ghost.x) * 130 * dt;
    G.ghost.vy += Math.sign(ty - G.ghost.y) * 130 * dt;
    G.ghost.vx = Math.max(-118, Math.min(118, G.ghost.vx));
    G.ghost.vy = Math.max(-118, Math.min(118, G.ghost.vy));
    G.ghost.x += G.ghost.vx * dt; G.ghost.y += G.ghost.vy * dt;
  }
  // an EXTEND letter drifts in now and then
  if (G.letters.length === 0 && G.roomT > 4 && G.roomT % 9 < dt) {
    const idx = G.have.findIndex(v => !v);
    if (idx >= 0) G.letters.push({ idx, x: 60 + rnd() * (PW - 120), y: 40, vy: 34 });
  }
  for (const L of G.letters) {
    L.y += L.vy * dt;
    if (L.y > PH - 20) L.y = 20;
  }
  for (const f of G.fruits) { f.t += dt; f.vy += GRAV * 0.55 * dt; f.y += f.vy * dt; if (solidPx(f.x, f.y + 12)) { f.y = Math.floor((f.y + 12) / TILE) * TILE - 12; f.vy = 0; } }
  for (const q of G.parts.slice()) {
    q.t += dt;
    if (q.ring) { /* render only */ }
    else if (q.boulder) { q.vy += GRAV * 0.8 * dt; q.x += q.vx * dt; q.y += q.vy * dt; if (solidPx(q.x, q.y + 8)) { q.vy = -Math.abs(q.vy) * 0.45; q.y = Math.floor((q.y + 8) / TILE) * TILE - 8; } if (q.x < 8 || q.x > PW - 8) q.vx = -q.vx; }
    else { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 240 * dt; }
    if (q.t > q.life) G.parts.splice(G.parts.indexOf(q), 1);
  }
  G.pops = G.pops.filter(p => G.time - p.t < 1.0);
}
function tick(dt, input) {
  if (!G || G.over || G.won) return;
  if (G.freeze > 0) { G.freeze -= dt; G.time += dt * 0.15; return; }
  G.time += dt;
  G.shake = Math.max(0, G.shake - dt * 2.4);
  const p = G.player;
  if (!p.alive) {
    p.vy += GRAV * dt; p.y += p.vy * dt;
    if (p.y > PH + 80) {
      if (G.lives > 0) { loadRoom(G.roomIndex); }
    }
    G.time += 0;
    return;
  }
  playerUpdate(dt, input || {});
  for (const e of G.enemies) enemyThink(e, dt);
  updateBubbles(dt);
  roomUpdate(dt);
  if (G.enemies.length === 0 && !G.over) {
    if (G.roomIndex + 1 >= G.maxRooms) {
      G.won = true; G.screen = 'won';
      if (G.score > G.best) G.best = G.score;
    } else {
      G.score += 5000;
      loadRoom(G.roomIndex + 1);
    }
  }
}

// ------------------------------ the rescue bot ------------------------------
// It plays through the same input object the keyboard fills.
function botInput(o) {
  o = o || {};
  const p = G.player;
  const inp = { left: false, right: false, jump: false, blow: false };
  if (!p.alive) return inp;
  // a held jump is a full jump: keep the button down while still rising
  const holdRise = () => { if (!p.onGround && p.vy < -140 && !o.noJump) inp.jump = true; };
  const goRight = () => { inp.right = true; inp.left = false; };
  const goLeft = () => { inp.left = true; inp.right = false; };
  const toward = (tx) => { if (tx > p.x + 6) goRight(); else if (tx < p.x - 6) goLeft(); };
  const away = (tx) => { if (tx > p.x) goLeft(); else goRight(); };

  // 0. staying alive comes first: one touch and the dragon is gone
  let danger = null, dd = 1e9;
  for (const e of G.enemies) {
    if (e.state !== 'normal') continue;
    const ax = Math.abs(e.x - p.x), ay = Math.abs(e.y - p.y);
    if (ax < 58 && ay < 36 && ax < dd) { dd = ax; danger = e; }
  }
  for (const q of G.parts) {
    if (!q.boulder) continue;
    const ax = Math.abs(q.x - p.x), ay = Math.abs(q.y - p.y);
    if (ax < 70 && ay < 40 && ax < dd) { dd = ax; danger = q; }
  }
  if (G.ghost) {
    const ax = Math.abs(G.ghost.x - p.x), ay = Math.abs(G.ghost.y - p.y);
    if (ax < 76 && ay < 46 && ax < dd) { dd = ax; danger = G.ghost; }
  }
  if (danger) {
    // a monster in your face is not a reason to run — it is a reason to breathe.
    // (blow without moving: turning would send the bubble the wrong way this frame)
    if (danger.kind && !o.noBlow && p.blowT <= 0) {
      const facingIt = (danger.x > p.x && p.face > 0) || (danger.x < p.x && p.face < 0);
      if (facingIt) { inp.blow = true; return inp; }
    }
    away(danger.x);
    // cornered against a wall — go over the top instead
    const wallLeft = p.x < 70, wallRight = p.x > PW - 70;
    if ((wallLeft && danger.x > p.x) || (wallRight && danger.x < p.x)) {
      if (p.onGround && !o.noJump) inp.jump = true;
    } else if (p.onGround && !o.noJump && Math.abs(danger.y - p.y) < 18 && dd < 34) inp.jump = true;
    holdRise();
    return inp;
  }

  // 1. a bubbled monster is a kill waiting to happen — go burst it
  let pop = null, popD = 1e9;
  if (!o.noPop) {
    for (const b of G.bubbles) {
      if (!b.holds) continue;
      const d = Math.abs(b.x - p.x) + Math.abs(b.y - p.y) * 1.2;
      if (d < popD) { popD = d; pop = b; }
    }
  }
  if (pop) {
    const pdx = Math.abs(pop.x - p.x), pdy = pop.y - p.y;
    // break off only if a monster is nearer than the prize
    for (const e of G.enemies) {
      if (e.state !== 'normal') continue;
      const edx = Math.abs(e.x - p.x);
      if (edx < 44 && Math.abs(e.y - p.y) < 30 && edx < pdx) {
        away(e.x);
        if (p.onGround && !o.noJump) inp.jump = true;
        return inp;
      }
    }
    toward(pop.x);
    // run underneath it first, then jump: leaping early sails straight over the top
    if (!o.noJump && p.onGround && pdx < 40 && pdy < -8) inp.jump = true;
    holdRise();
    return inp;
  }

  // 2. otherwise hunt — but only what can actually be hit. a bubble flies level
  //    then climbs, so a shelf between us and a monster eats the shot.
  const REACH0 = 20 + BUB_SPEED * BUB_TRAVEL;
  const clearShot = (dir) => {
    for (let i = 1; i <= 8; i++) {
      const x = p.x + dir * REACH0 * i / 8;
      if (solidPx(x, p.y) || solidPx(x, p.y - 10)) return false;
    }
    return true;
  };
  const engageable = (e) => Math.abs(e.y - p.y) < 46 && clearShot(Math.sign(e.x - p.x) || 1);
  let tgt = null, tgtD = 1e9;
  for (const e of G.enemies) {
    if (e.state !== 'normal' || !engageable(e)) continue;
    const d = Math.abs(e.x - p.x);
    if (d < tgtD) { tgtD = d; tgt = e; }
  }
  if (!tgt) {
    // nothing is reachable yet. monsters walk off their shelves when we are below
    // them, so hold a safe spot and let the keep come down to us.
    let near = null, nd = 1e9;
    for (const e of G.enemies) {
      if (e.state !== 'normal') continue;
      const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
      if (d < nd) { nd = d; near = e; }
    }
    if (near) {
      const close = Math.abs(near.x - p.x) < 60 && Math.abs(near.y - p.y) < 40;
      if (close) { away(near.x); if (p.onGround && !o.noJump) inp.jump = true; }
      else if (Math.abs(near.x - p.x) > 150) toward(near.x);
    }
    holdRise();
    return inp;
  }
  const dx = tgt.x - p.x, dy = tgt.y - p.y, adx = Math.abs(dx);

  // stay off the monster: contact is death
  const tooClose = adx < 40 && Math.abs(dy) < 30;

  // just blew — give the bubble room and step back
  if (p.blowT > 0.02 || tooClose) {
    away(tgt.x);
    if (tooClose && p.onGround && !o.noJump) inp.jump = true;
    return inp;
  }
  // a bubble leaves the snout and coasts a fixed distance before it starts to climb.
  // that stopping point is the shot: stand so it lands under the monster.
  const REACH = REACH0;
  const facing = (dx > 0 && p.face > 0) || (dx < 0 && p.face < 0);
  const idle = G.bubbles.filter(b => !b.holds).length;
  if (adx < 42) { away(tgt.x); return inp; }              // point blank: back off a step
  if (adx <= REACH + 34) {
    if (!facing) { toward(tgt.x); return inp; }            // turn first, fire next frame
    if (!o.noBlow && idle < 3) inp.blow = true;            // don't clutter the room with misses
    return inp;
  }
  // close the gap
  toward(tgt.x);
  if (!o.noJump && p.onGround) {
    if (dy < -TILE * 1.2) inp.jump = true;                       // it is above: climb
    const ahead = p.x + (dx >= 0 ? 22 : -22);
    if (solidPx(ahead, p.y) || solidPx(ahead, p.y - 12)) inp.jump = true;   // a step in the way
  }
  holdRise();
  return inp;
}
function runBot(o, seconds) {
  o = o || {};
  const dt = 1 / 60;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps && !G.over && !G.won; i++) tick(dt, botInput(o));
  return {
    won: G.won, over: G.over, rooms: G.roomIndex + (G.won ? 1 : 0), monsters: G.cleared,
    score: G.score, deaths: G.deaths, seconds: +(steps * dt).toFixed(1),
  };
}

// ------------------------------ verify: rescues as theorems ------------------------------
const RUN_SEED = 19860;
function report(mode, ok, extra) {
  const rep = Object.assign({ mode, outcome: ok }, extra || {});
  const s = 'VERIFY:' + JSON.stringify(rep);
  document.title = s;
  const pre = document.createElement('pre'); pre.textContent = s; document.body.appendChild(pre);
}
function sandbox(roomStr) {
  newGame(RUN_SEED, { headless: true });
  if (roomStr) {
    G.room = roomStr;
    G.enemies = []; G.bubbles = []; G.fruits = []; G.parts = []; G.letters = [];
    G.player = { x: TILE * 2, y: TILE * 13, vx: 0, vy: 0, w: 30, h: 32, face: 1, onGround: false, alive: true, invuln: 0, blowT: 0, anim: 0, squash: 0, coyote: 0, buffer: 0, recoil: 0 };
  }
  return G;
}
const FLAT = (() => {
  const r = [];
  for (let y = 0; y < ROWS; y++) {
    if (y === 0) r.push('########################');
    else if (y === ROWS - 1) r.push('########################');
    else r.push('#......................#');
  }
  return r;
})();
function runVerify(mode) {
  const BUDGET = 400;
  if (mode === 'debug-bot') {
    newGame(RUN_SEED, { headless: true });
    let blown = 0, trapped = 0, popped = 0;
    const tl = [];
    const dt = 1 / 60;
    let lastBub = 0, lastCleared = 0;
    for (let i = 0; i < 60 * 90 && !G.over && !G.won; i++) {
      const inp = botInput({});
      if (inp.blow && G.player.blowT <= 0) blown++;
      const bubBefore = G.bubbles.filter(b => b.holds).length;
      tick(dt, inp);
      const bubAfter = G.bubbles.filter(b => b.holds).length;
      if (bubAfter > bubBefore) trapped++;
      if (G.cleared > lastCleared) { popped += G.cleared - lastCleared; lastCleared = G.cleared; }
      if (i % 300 === 0) tl.push(Math.round(i / 60) + 's:r' + G.roomIndex + ':e' + G.enemies.length +
        ':b' + G.bubbles.length + ':d' + G.deaths + ':k' + G.cleared);
    }
    report(mode, 'INFO', { blown: blown, trapped: trapped, popped: popped, deaths: G.deaths,
      rooms: G.roomIndex, won: G.won, tl: tl.join(' ') });
  } else if (mode === 'solution') {
    newGame(RUN_SEED, { headless: true });
    const r = runBot({}, BUDGET);
    report(mode, r.won ? 'PASS' : 'FAIL', Object.assign({ claim: 'the bot must clear every room of the keep' }, r));
  } else if (mode === 'solution-seeds') {
    let wins = 0, nulls = 0; const rows = [];
    for (let i = 0; i < 8; i++) {
      const sd = RUN_SEED + i * 613;
      newGame(sd, { headless: true });
      const r = runBot({}, BUDGET);
      if (r.won) wins++;
      newGame(sd, { headless: true });
      const n = runBot({ noBlow: true, noPop: true, noJump: true }, 120);
      if (n.won) nulls++;
      rows.push(sd + ':' + (r.won ? 'W' : 'L') + r.rooms + ':' + (n.over ? 'D' : '-'));
    }
    report(mode, wins >= 6 && nulls === 0 ? 'PASS' : 'FAIL', { botWon: wins, nullWon: nulls, of: 8, runs: rows.join(' ') });
  } else if (mode === 'null') {
    newGame(RUN_SEED, { headless: true });
    const r = runBot({ noBlow: true, noPop: true, noJump: true }, 120);
    report(mode, r.over && !r.won ? 'PASS' : 'FAIL', Object.assign({ claim: 'a dragon that does nothing must die' }, r));
  } else if (mode === 'ablate-bubble') {
    newGame(RUN_SEED, { headless: true });
    const r = runBot({ noBlow: true }, BUDGET);
    report(mode, !r.won ? 'PASS' : 'FAIL', Object.assign({ claim: 'without breath there is no kill' }, r));
  } else if (mode === 'ablate-pop') {
    newGame(RUN_SEED, { headless: true });
    const r = runBot({ noPop: true }, BUDGET);
    report(mode, !r.won ? 'PASS' : 'FAIL', Object.assign({ claim: 'bubbling without bursting clears nothing' }, r));
  } else if (mode === 'ablate-jump') {
    newGame(RUN_SEED, { headless: true });
    const r = runBot({ noJump: true }, BUDGET);
    report(mode, !r.won ? 'PASS' : 'FAIL', Object.assign({ claim: 'a dragon that cannot jump cannot reach the keep' }, r));
  } else if (mode === 'mech-bubble') {
    sandbox(FLAT);
    G.player.face = 1;
    const x0 = G.player.x;
    blow();
    const b = G.bubbles[0];
    const spawnedAhead = b && b.x > x0;
    for (let i = 0; i < Math.round(BUB_TRAVEL * 60) + 2; i++) updateBubbles(1 / 60);
    const travelled = b.x - x0, drifting = b.state === 'float';
    const yBefore = b.y;
    for (let i = 0; i < 30; i++) updateBubbles(1 / 60);
    const rose = yBefore - b.y;
    report(mode, spawnedAhead && travelled > 80 && drifting && rose > 15 ? 'PASS' : 'FAIL',
      { spawnedAhead: spawnedAhead, travelledPx: Math.round(travelled), floatsAfterTravel: drifting, roseInHalfSecond: Math.round(rose) });
  } else if (mode === 'mech-trap') {
    sandbox(FLAT);
    spawnEnemy('wanderer', G.player.x + 90, G.player.y);
    const e = G.enemies[0]; e.vx = 0;
    G.player.face = 1; blow();
    let trappedAt = -1;
    for (let i = 0; i < 90; i++) { updateBubbles(1 / 60); if (e.state === 'bubbled' && trappedAt < 0) trappedAt = i; }
    const held = G.bubbles[0] && G.bubbles[0].holds === e;
    const ridesWithBubble = held && Math.abs(e.x - G.bubbles[0].x) < 1;
    report(mode, trappedAt >= 0 && held && ridesWithBubble ? 'PASS' : 'FAIL',
      { trappedOnFrame: trappedAt, bubbleHoldsMonster: !!held, monsterMovesWithBubble: ridesWithBubble });
  } else if (mode === 'mech-pop') {
    sandbox(FLAT);
    spawnEnemy('wanderer', G.player.x + 90, G.player.y);
    const e = G.enemies[0]; e.vx = 0;
    G.player.face = 1; blow();
    for (let i = 0; i < 60 && e.state !== 'bubbled'; i++) updateBubbles(1 / 60);
    const wasBubbled = e.state === 'bubbled';
    const b = G.bubbles[0];
    const before = G.score;
    G.enemies.splice(G.enemies.indexOf(e), 1);
    popBubble(b, true);
    const gained = G.score - before;
    report(mode, wasBubbled && G.enemies.length === 0 && gained === CHAIN[0] && G.fruits.length === 1 ? 'PASS' : 'FAIL',
      { monsterBubbled: wasBubbled, monstersLeft: G.enemies.length, points: gained, expected: CHAIN[0], fruitDropped: G.fruits.length });
  } else if (mode === 'mech-escape') {
    sandbox(FLAT);
    spawnEnemy('wanderer', G.player.x + 90, G.player.y);
    const e = G.enemies[0]; e.vx = KINDS.wanderer.speed;
    const speedBefore = Math.abs(e.vx);          // measured before the bubble freezes it
    G.player.face = 1; blow();
    for (let i = 0; i < 60 && e.state !== 'bubbled'; i++) updateBubbles(1 / 60);
    let escapedAt = -1;
    for (let i = 0; i < 60 * 12; i++) {
      updateBubbles(1 / 60);
      if (e.state === 'normal' && escapedAt < 0) { escapedAt = i; break; }
    }
    const t = escapedAt / 60;
    const faster = Math.abs(e.vx) > speedBefore * 1.3;
    report(mode, escapedAt > 0 && t > BUB_LIFE - 1 && t < BUB_LIFE + 1 && e.angry && faster ? 'PASS' : 'FAIL',
      { escapedAfterSeconds: +t.toFixed(2), bubbleLife: BUB_LIFE, comesBackAngry: e.angry, speedNow: Math.round(Math.abs(e.vx)), speedBefore: Math.round(speedBefore) });
  } else if (mode === 'mech-chain') {
    sandbox(FLAT);
    const pts = [];
    for (let i = 0; i < 4; i++) {
      const b = { x: 200 + i * 10, y: 200, r: 15, age: 0, state: 'float', holds: { kind: 'wanderer' } };
      G.bubbles.push(b);
      const before = G.score;
      popBubble(b, true);
      pts.push(G.score - before);
    }
    const escalates = pts[0] === CHAIN[0] && pts[1] === CHAIN[1] && pts[2] === CHAIN[2] && pts[3] === CHAIN[3];
    // and a slow player gets no chain
    sandbox(FLAT);
    const b1 = { x: 200, y: 200, r: 15, age: 0, state: 'float', holds: { kind: 'wanderer' } };
    G.bubbles.push(b1); const s0 = G.score; popBubble(b1, true); const first = G.score - s0;
    G.time += CHAIN_WINDOW + 0.2;
    const b2 = { x: 260, y: 200, r: 15, age: 0, state: 'float', holds: { kind: 'wanderer' } };
    G.bubbles.push(b2); const s1 = G.score; popBubble(b2, true); const second = G.score - s1;
    report(mode, escalates && first === CHAIN[0] && second === CHAIN[0] ? 'PASS' : 'FAIL',
      { chainPoints: pts.join('/'), expected: CHAIN.join('/'), lateSecondPop: second, expectedLate: CHAIN[0] });
  } else if (mode === 'mech-ride') {
    sandbox(FLAT);
    const p = G.player;
    p.x = 300; p.y = 300; p.vy = 0;
    G.bubbles.push({ x: 300, y: 300 + p.h / 2 + 15, r: 15, age: 0, state: 'float', holds: null, vx: 0, vy: 0 });
    const y0 = p.y;
    for (let i = 0; i < 45; i++) { updateBubbles(1 / 60); playerUpdate(1 / 60, {}); }
    const lifted = y0 - p.y;
    report(mode, lifted > 10 && p.alive ? 'PASS' : 'FAIL', { rosePx: Math.round(lifted), standsOnBubble: p.onGround });
  } else if (mode === 'mech-wrap') {
    const open = FLAT.slice(); open[ROWS - 1] = '#..........#...........#';
    sandbox(open);
    const p = G.player;
    p.x = TILE * 3 + 4; p.y = PH - TILE * 3; p.vy = 400;
    let wrapped = false;
    for (let i = 0; i < 240; i++) { moveBody(p, 1 / 60, true); if (p.y < TILE * 2) { wrapped = true; break; } }
    report(mode, wrapped ? 'PASS' : 'FAIL', { fellThroughFloorAndReappearedOnTop: wrapped, y: Math.round(p.y) });
  } else if (mode === 'mech-hurry') {
    sandbox(FLAT);
    spawnEnemy('wanderer', 700, 200);
    let hurryAt = -1, ghostAt = -1;
    for (let i = 0; i < 60 * 60; i++) {
      roomUpdate(1 / 60);
      if (G.hurry && hurryAt < 0) hurryAt = i / 60;
      if (G.ghost && ghostAt < 0) { ghostAt = i / 60; break; }
    }
    const g0 = { x: G.ghost.x, y: G.ghost.y };
    G.player.x = 60; G.player.y = 520;
    for (let i = 0; i < 180; i++) roomUpdate(1 / 60);
    const closedX = Math.abs(G.ghost.x - G.player.x) < Math.abs(g0.x - G.player.x) - 10;
    const closedY = Math.abs(G.ghost.y - G.player.y) < Math.abs(g0.y - G.player.y) - 10;
    report(mode, hurryAt > 0 && Math.abs(hurryAt - HURRY_AT) < 1 && ghostAt > hurryAt && closedX && closedY ? 'PASS' : 'FAIL',
      { hurryAtSeconds: +hurryAt.toFixed(1), expected: HURRY_AT, ghostAtSeconds: +ghostAt.toFixed(1),
        ghostClosesHorizontally: closedX, ghostClosesVertically: closedY });
  } else if (mode === 'mech-death') {
    sandbox(FLAT);
    const p = G.player; p.invuln = 0;
    spawnEnemy('wanderer', p.x, p.y);
    G.enemies[0].vx = 0;
    const lives0 = G.lives;
    playerUpdate(1 / 60, {});
    const died = !p.alive && G.lives === lives0 - 1;
    // ...but a bubbled monster is harmless
    sandbox(FLAT);
    const p2 = G.player; p2.invuln = 0;
    spawnEnemy('wanderer', p2.x + 200, p2.y);
    G.enemies[0].state = 'bubbled'; G.enemies[0].x = p2.x; G.enemies[0].y = p2.y;
    playerUpdate(1 / 60, {});
    const safe = p2.alive;
    report(mode, died && safe ? 'PASS' : 'FAIL', { touchingMonsterKills: died, bubbledMonsterIsHarmless: safe });
  } else if (mode === 'mech-extend') {
    sandbox(FLAT);
    const lives0 = G.lives;
    for (let i = 0; i < 6; i++) {
      G.letters.push({ idx: i, x: G.player.x, y: G.player.y, vy: 0 });
      playerUpdate(1 / 60, {});
    }
    const gained = G.lives === lives0 + 1;
    const reset = G.have.every(v => !v);
    report(mode, gained && reset && G.extends === 1 ? 'PASS' : 'FAIL',
      { livesBefore: lives0, livesAfter: G.lives, lettersReset: reset, extends: G.extends });
  } else if (mode === 'mech-fruit') {
    sandbox(FLAT);
    const vals = [];
    for (let i = 0; i < FRUIT.length; i++) {
      sandbox(FLAT);
      dropFruit(G.player.x, G.player.y, i);
      const before = G.score;
      playerUpdate(1 / 60, {});
      vals.push(G.score - before);
    }
    const rising = vals.every((v, i) => v === FRUIT[i].value) && vals[3] > vals[0];
    report(mode, rising ? 'PASS' : 'FAIL', { collected: vals.join('/'), expected: FRUIT.map(f => f.value).join('/') });
  } else if (mode === 'mech-clear') {
    newGame(RUN_SEED, { headless: true });
    const room0 = G.roomIndex;
    const before = G.score;
    G.enemies = [];
    tick(1 / 60, {});
    report(mode, G.roomIndex === room0 + 1 && G.score === before + 5000 ? 'PASS' : 'FAIL',
      { roomBefore: room0, roomAfter: G.roomIndex, bonus: G.score - before });
  } else if (mode === 'mech-platform') {
    sandbox(FLAT);
    const p = G.player;
    // a dragon rests on solid ground and cannot walk through a wall
    p.x = 400; p.y = PH - TILE * 2; p.vy = 200;
    for (let i = 0; i < 60; i++) moveBody(p, 1 / 60, true);
    const stands = p.onGround && Math.abs((p.y + p.h / 2) - (PH - TILE)) < 2;
    p.x = TILE + 20; p.vx = -RUN;
    for (let i = 0; i < 60; i++) moveBody(p, 1 / 60, true);
    const blockedLeft = p.x > TILE;
    p.x = PW - TILE - 20; p.vx = RUN;
    for (let i = 0; i < 60; i++) moveBody(p, 1 / 60, true);
    const blockedRight = p.x < PW - TILE;
    const blocked = blockedLeft && blockedRight;
    // ...but rises through a ceiling from below, as the arcade let you
    const withLedge = FLAT.slice();
    withLedge[8] = '#####..#################';
    sandbox(withLedge);
    const q = G.player; q.x = TILE * 3 + 4; q.y = TILE * 11; q.vy = -JUMP_V;
    let passed = false;
    for (let i = 0; i < 90; i++) { moveBody(q, 1 / 60, true); if (q.y < TILE * 8) { passed = true; break; } }
    report(mode, stands && blocked && passed ? 'PASS' : 'FAIL',
      { restsOnFloor: stands, wallBlocksLeft: blockedLeft, wallBlocksRight: blockedRight, jumpsThroughPlatform: passed });
  } else if (mode === 'mech-monsters') {
    // each monster must behave like its own species
    sandbox(FLAT);
    spawnEnemy('wanderer', 400, PH - TILE * 2);
    const w = G.enemies[0]; w.vx = KINDS.wanderer.speed;
    for (let i = 0; i < 120; i++) enemyThink(w, 1 / 60);
    const walks = w.onGround && Math.abs(w.y - (PH - TILE - w.h / 2)) < 4;
    sandbox(FLAT);
    spawnEnemy('flyer', 400, 300);
    const f = G.enemies[0];
    G.player.x = 100; G.player.y = 120;
    const d0 = Math.abs(f.x - 100) + Math.abs(f.y - 120);
    for (let i = 0; i < 120; i++) enemyThink(f, 1 / 60);
    const flies = (Math.abs(f.x - 100) + Math.abs(f.y - 120)) < d0 - 20;
    sandbox(FLAT);
    spawnEnemy('hurler', 400, PH - TILE * 2);
    const h = G.enemies[0]; h.hurlT = 0.02;
    G.player.x = 200; G.player.y = h.y;
    for (let i = 0; i < 30; i++) enemyThink(h, 1 / 60);
    const hurled = G.parts.some(q => q.boulder);
    report(mode, walks && flies && hurled ? 'PASS' : 'FAIL',
      { wandererWalksTheFloor: walks, flyerHomesOnPlayer: flies, hurlerThrows: hurled });
  } else if (mode === 'mech-boulder') {
    // a hurled rock is a real hazard, and it obeys gravity and the walls
    sandbox(FLAT);
    const p = G.player; p.invuln = 0;
    G.parts.push({ boulder: true, x: p.x, y: p.y, vx: 0, vy: 0, t: 0, life: 3.2, col: '#8e6b4a' });
    playerUpdate(1 / 60, {});
    const kills = !p.alive;
    sandbox(FLAT);
    G.parts.push({ boulder: true, x: 200, y: 200, vx: 210, vy: -60, t: 0, life: 3.2, col: '#8e6b4a' });
    const q = G.parts[0];
    const y0 = q.y;
    for (let i = 0; i < 60; i++) roomUpdate(1 / 60);
    const fell = q.y > y0;
    const moved = q.x > 200;
    report(mode, kills && fell && moved ? 'PASS' : 'FAIL',
      { boulderKills: kills, boulderFalls: fell, boulderTravels: moved });
  } else if (mode === 'mech-ledge') {
    // monsters walk off a shelf when the dragon is below — that is how the keep comes to you
    const shelf = FLAT.slice();
    shelf[8] = '#....########..........#';
    sandbox(shelf);
    spawnEnemy('wanderer', TILE * 8, TILE * 8 - 16);
    const e = G.enemies[0]; e.vx = KINDS.wanderer.speed;
    G.player.x = TILE * 8; G.player.y = PH - TILE * 2;      // far below
    let fellOff = false;
    for (let i = 0; i < 60 * 14; i++) { enemyThink(e, 1 / 60); if (e.y > TILE * 12) { fellOff = true; break; } }
    // ...but with the dragon on its own level it patrols instead of stepping off
    sandbox(shelf);
    spawnEnemy('wanderer', TILE * 8, TILE * 8 - 16);
    const e2 = G.enemies[0]; e2.vx = KINDS.wanderer.speed;
    G.player.x = TILE * 6; G.player.y = TILE * 8 - 16;
    let stayed = true;
    for (let i = 0; i < 60 * 14; i++) { enemyThink(e2, 1 / 60); if (e2.y > TILE * 12) { stayed = false; break; } }
    report(mode, fellOff && stayed ? 'PASS' : 'FAIL',
      { walksOffWhenDragonIsBelow: fellOff, patrolsWhenDragonIsLevel: stayed });
  } else if (mode === 'mech-selfbubble') {
    // a bubble is born inside the snout: the dragon must not swallow it instantly
    sandbox(FLAT);
    const p = G.player; p.face = 1;
    blow();
    const born = G.bubbles.length === 1;
    playerUpdate(1 / 60, {});
    const survivedBirth = G.bubbles.length === 1;
    // and it must still be poppable once it has cleared
    for (let i = 0; i < 40; i++) updateBubbles(1 / 60);
    const b = G.bubbles[0];
    if (b) { b.x = p.x; b.y = p.y; }
    playerUpdate(1 / 60, {});
    const poppableLater = G.bubbles.length === 0;
    report(mode, born && survivedBirth && poppableLater ? 'PASS' : 'FAIL',
      { bubbleBorn: born, notSwallowedAtBirth: survivedBirth, poppableOnceClear: poppableLater });
  } else if (mode === 'mech-angry') {
    // the anger multiplier is a real speed change, not a label
    sandbox(FLAT);
    spawnEnemy('wanderer', 300, PH - TILE * 2);
    const calm = G.enemies[0];
    let x0 = calm.x;
    for (let i = 0; i < 60; i++) enemyThink(calm, 1 / 60);
    const calmDist = Math.abs(calm.x - x0);
    sandbox(FLAT);
    spawnEnemy('wanderer', 300, PH - TILE * 2);
    const mad = G.enemies[0]; mad.angry = true;
    x0 = mad.x;
    for (let i = 0; i < 60; i++) enemyThink(mad, 1 / 60);
    const madDist = Math.abs(mad.x - x0);
    const ratio = madDist / Math.max(1, calmDist);
    report(mode, ratio > 1.3 && ratio < 1.6 ? 'PASS' : 'FAIL',
      { calmPxPerSecond: Math.round(calmDist), angryPxPerSecond: Math.round(madDist), ratio: +ratio.toFixed(2), expected: ESCAPE_ANGRY });
  } else {
    report(mode, 'UNKNOWN');
  }
}

// ------------------------------ rendering ------------------------------
let cv, cx;
const SKY = ['#1b1040', '#241452'];
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
function rr(x, y, w, h, r) {
  cx.beginPath();
  cx.moveTo(x + r, y);
  cx.arcTo(x + w, y, x + w, y + h, r);
  cx.arcTo(x + w, y + h, x, y + h, r);
  cx.arcTo(x, y + h, x, y, r);
  cx.arcTo(x, y, x + w, y, r);
  cx.closePath();
}
function shakeXY() {
  if (!G || G.shake <= 0 || G.shotMode) return [0, 0];
  const s = G.shake * 8;
  return [(hash32(Math.floor(G.time * 60), 1) - 0.5) * s, (hash32(Math.floor(G.time * 60), 2) - 0.5) * s];
}
function drawBackdrop() {
  const g = cx.createLinearGradient(0, 0, 0, 720);
  g.addColorStop(0, '#0d0722'); g.addColorStop(0.55, '#160c33'); g.addColorStop(1, '#0a0518');
  cx.fillStyle = g; cx.fillRect(0, 0, 1280, 720);
  // cavern arches behind the room
  cx.save();
  cx.translate(OX, OY);
  const gg = cx.createLinearGradient(0, 0, 0, PH);
  gg.addColorStop(0, SKY[0]); gg.addColorStop(1, SKY[1]);
  cx.fillStyle = gg; cx.fillRect(0, 0, PW, PH);
  cx.strokeStyle = 'rgba(255,255,255,0.045)'; cx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const w = 120 + i * 66, cxx = PW / 2, cyy = PH * 0.92;
    cx.beginPath(); cx.arc(cxx, cyy, w, Math.PI, 0); cx.stroke();
  }
  cx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let i = 0; i < 40; i++) {
    const x = hash32(i, 7) * PW, y = hash32(i, 8) * PH, s = 2 + hash32(i, 9) * 3;
    cx.fillRect(x, y, s, s);
  }
  cx.restore();
}
function tileCols() {
  const i = G.roomIndex % 6;
  const sets = [
    ['#2f8fd8', '#1c5f96', '#7fd4ff'], ['#e0653f', '#a53f22', '#ffb08a'],
    ['#4fbf6a', '#2b7d41', '#a8f0b8'], ['#b96bd8', '#7a3d94', '#e6b6ff'],
    ['#e0a93f', '#a87422', '#ffe0a0'], ['#5f7fe0', '#3a4fa0', '#b0c4ff'],
  ];
  return sets[i];
}
function drawRoom() {
  const [face, dark, lite] = tileCols();
  // one soft shadow behind every slab, so the stone sits in front of the cavern
  cx.globalAlpha = 0.34; cx.fillStyle = '#0a0420';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (G.room[y][x] !== '#') continue;
    cx.fillRect(x * TILE + 6, y * TILE + 7, TILE, TILE);
  }
  cx.globalAlpha = 1;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (G.room[y][x] !== '#') continue;
    const px = x * TILE, py = y * TILE;
    const openAbove = !solidAt(G.room, x, y - 1);
    const openL = !solidAt(G.room, x - 1, y), openR = !solidAt(G.room, x + 1, y);
    // square the joins inside a run, round only the ends: eight buttons become one slab
    const rl = openL ? 8 : 0, rr2 = openR ? 8 : 0;
    const path = (ox, oy, w, h) => {
      cx.beginPath();
      cx.moveTo(px + ox + rl, py + oy);
      cx.lineTo(px + ox + w - rr2, py + oy);
      cx.quadraticCurveTo(px + ox + w, py + oy, px + ox + w, py + oy + rr2);
      cx.lineTo(px + ox + w, py + oy + h - rr2);
      cx.quadraticCurveTo(px + ox + w, py + oy + h, px + ox + w - rr2, py + oy + h);
      cx.lineTo(px + ox + rl, py + oy + h);
      cx.quadraticCurveTo(px + ox, py + oy + h, px + ox, py + oy + h - rl);
      cx.lineTo(px + ox, py + oy + rl);
      cx.quadraticCurveTo(px + ox, py + oy, px + ox + rl, py + oy);
      cx.closePath();
    };
    cx.fillStyle = dark; path(0, 3, TILE, TILE - 3); cx.fill();
    const fg = cx.createLinearGradient(0, py, 0, py + TILE);
    fg.addColorStop(0, lite); fg.addColorStop(0.28, face); fg.addColorStop(1, dark);
    cx.fillStyle = fg; path(0, 0, TILE, TILE - 4); cx.fill();
    if (openAbove) {
      cx.globalAlpha = 0.65; cx.fillStyle = '#ffffff';
      rr(px + 5, py + 4, TILE - 10, 3, 1.5); cx.fill();
      cx.globalAlpha = 1;
    }
    // a stud or a crack, so no two tiles are quite the same
    const v = hash32(x, y, 4);
    cx.globalAlpha = 0.22;
    if (v > 0.72) { cx.fillStyle = '#000'; cx.beginPath(); cx.arc(px + 9 + v * 14, py + 20, 2.2, 0, 7); cx.fill(); }
    else if (v < 0.16) { cx.strokeStyle = '#000'; cx.lineWidth = 1.6; cx.beginPath(); cx.moveTo(px + 8, py + 24); cx.lineTo(px + 16, py + 16); cx.stroke(); }
    cx.globalAlpha = 1;
  }
}
function eyePair(x, y, look, size, blink) {
  const s = size || 1;
  for (const sx of [-1, 1]) {
    cx.fillStyle = '#ffffff';
    cx.beginPath(); cx.ellipse(x + sx * 6 * s, y, 5.4 * s, (blink ? 1.2 : 6.2) * s, 0, 0, 7); cx.fill();
    if (!blink) {
      cx.fillStyle = '#141026';
      cx.beginPath(); cx.arc(x + sx * 6 * s + look * 2.1 * s, y + 1 * s, 3.1 * s, 0, 7); cx.fill();
      cx.fillStyle = 'rgba(255,255,255,0.95)';
      cx.beginPath(); cx.arc(x + sx * 6 * s + look * 2.1 * s - 1.1 * s, y - 1.2 * s, 1.15 * s, 0, 7); cx.fill();
    }
  }
}
function drawDragon(p) {
  const bob = Math.sin(p.anim * 6) * 1.6;
  const sq = p.squash;
  const sx = 1 + sq * 0.22, sy = 1 - sq * 0.22;
  cx.save();
  cx.translate(p.x, p.y + bob);
  cx.scale(p.face * sx, sy);
  if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) cx.globalAlpha = 0.35;
  const step = Math.sin(p.anim * 11) * (Math.abs(p.vx) > 4 ? 3.2 : 0);
  // tail
  cx.fillStyle = '#2f7a28';
  cx.beginPath(); cx.moveTo(-10, 8); cx.quadraticCurveTo(-30, 9, -25, -6);
  cx.quadraticCurveTo(-19, 3, -10, 1); cx.closePath(); cx.fill();
  cx.fillStyle = '#8ff06d';
  cx.beginPath(); cx.ellipse(-25, -4, 4.5, 4, 0.5, 0, 7); cx.fill();
  // shell ridge
  cx.fillStyle = '#2b6f24';
  for (let i = 0; i < 4; i++) {
    cx.beginPath();
    cx.moveTo(-12 + i * 7, -12 + i * 1.6);
    cx.quadraticCurveTo(-9 + i * 7, -25 + i * 1.6, -3 + i * 7, -12 + i * 1.6);
    cx.closePath(); cx.fill();
  }
  // feet
  cx.fillStyle = '#ffc42f';
  cx.beginPath(); cx.ellipse(-6, 17 + step, 7, 4.4, 0, 0, 7); cx.fill();
  cx.beginPath(); cx.ellipse(7, 17 - step, 7, 4.4, 0, 0, 7); cx.fill();
  cx.strokeStyle = '#c98f14'; cx.lineWidth = 1.4;
  cx.beginPath(); cx.ellipse(-6, 17 + step, 7, 4.4, 0, 0, 7); cx.stroke();
  cx.beginPath(); cx.ellipse(7, 17 - step, 7, 4.4, 0, 0, 7); cx.stroke();
  // body
  const bg = cx.createRadialGradient(-5, -8, 2, 0, 2, 22);
  bg.addColorStop(0, '#a9ff86'); bg.addColorStop(0.55, '#6bd44f'); bg.addColorStop(1, '#3d9331');
  cx.fillStyle = bg;
  cx.beginPath(); cx.ellipse(0, 0, 19, 18, 0, 0, 7); cx.fill();
  cx.strokeStyle = '#20551a'; cx.lineWidth = 2.6; cx.stroke();
  // belly
  cx.fillStyle = '#f0ffd8';
  cx.beginPath(); cx.ellipse(3, 7, 11, 9, 0, 0, 7); cx.fill();
  cx.strokeStyle = 'rgba(32,85,26,0.35)'; cx.lineWidth = 1.2; cx.stroke();
  // cheek
  cx.fillStyle = 'rgba(255,140,150,0.5)';
  cx.beginPath(); cx.ellipse(12, 2, 4, 3, 0, 0, 7); cx.fill();
  // face
  const blink = (Math.floor(p.anim * 1.1) % 7) === 0 && (p.anim * 1.1 % 1) < 0.13;
  eyePair(3, -5, 1, 1.18, blink);
  // mouth — open while blowing
  if (p.blowT > 0) {
    cx.fillStyle = '#7a2230';
    cx.beginPath(); cx.ellipse(14, 5, 5.5, 5, 0, 0, 7); cx.fill();
    cx.fillStyle = '#ffb3c0';
    cx.beginPath(); cx.ellipse(14, 7, 3, 2.2, 0, 0, 7); cx.fill();
  } else {
    cx.strokeStyle = '#20551a'; cx.lineWidth = 2.4;
    cx.beginPath(); cx.arc(10, 2, 5, 0.15, 1.5); cx.stroke();
  }
  cx.restore();
}
function drawMonster(e) {
  const K = KINDS[e.kind];
  const bob = Math.sin(e.anim * 7 + e.seed * 6) * 2;
  cx.save();
  cx.translate(e.x, e.y + bob);
  const dir = e.vx >= 0 ? 1 : -1;
  cx.scale(dir, 1);
  if (e.state === 'bubbled') cx.globalAlpha = 0.92;
  const g = cx.createLinearGradient(0, -e.h / 2, 0, e.h / 2);
  g.addColorStop(0, K.col); g.addColorStop(1, K.col2);
  if (e.angry) { cx.shadowColor = '#ff4444'; cx.shadowBlur = 14; }
  cx.fillStyle = g;
  if (K.flies) {
    // wings
    cx.fillStyle = 'rgba(255,255,255,0.55)';
    const flap = Math.sin(e.anim * 16) * 6;
    cx.beginPath(); cx.ellipse(-12, -4 + flap, 9, 5, -0.5, 0, 7); cx.fill();
    cx.beginPath(); cx.ellipse(12, -4 - flap, 9, 5, 0.5, 0, 7); cx.fill();
    cx.fillStyle = g;
    cx.beginPath(); cx.ellipse(0, 0, e.w / 2, e.h / 2, 0, 0, 7); cx.fill();
  } else {
    const step = Math.sin(e.anim * 12) * 3;
    cx.fillStyle = K.col2;                       // feet first, behind the body
    cx.beginPath(); cx.ellipse(-6, e.h / 2 + 1 + step, 6.5, 4, 0, 0, 7); cx.fill();
    cx.beginPath(); cx.ellipse(7, e.h / 2 + 1 - step, 6.5, 4, 0, 0, 7); cx.fill();
    cx.fillStyle = g;
    cx.beginPath(); cx.ellipse(0, 0, e.w / 2, e.h / 2, 0, 0, 7); cx.fill();
    cx.fillStyle = 'rgba(255,255,255,0.30)';     // belly
    cx.beginPath(); cx.ellipse(1, 6, e.w / 2 - 7, e.h / 2 - 9, 0, 0, 7); cx.fill();
    if (!K.hurls) {                              // a little horn, so it is not just a ball
      cx.fillStyle = K.col2;
      cx.beginPath(); cx.moveTo(-3, -e.h / 2 + 1); cx.lineTo(1, -e.h / 2 - 8);
      cx.lineTo(5, -e.h / 2 + 1); cx.closePath(); cx.fill();
    }
  }
  cx.shadowBlur = 0;
  cx.strokeStyle = 'rgba(0,0,0,0.35)'; cx.lineWidth = 2;
  cx.beginPath(); cx.ellipse(0, 0, e.w / 2, e.h / 2, 0, 0, 7); cx.stroke();
  if (e.kind === 'hurler') {                 // a brow that means business
    cx.fillStyle = '#4a2060';
    cx.fillRect(-10, -11, 20, 4);
  }
  eyePair(1, -3, 1, 1.05, false);
  if (e.angry) {
    cx.strokeStyle = '#ff3b3b'; cx.lineWidth = 2.4;
    cx.beginPath(); cx.moveTo(-10, -10); cx.lineTo(-2, -6); cx.moveTo(10, -10); cx.lineTo(2, -6); cx.stroke();
  }
  cx.restore();
}
function bubbleBody(b) {
  const wob = Math.sin(b.age * 4 + b.x * 0.03) * 0.9;
  const warn = b.age > BUB_WARN && Math.floor(b.age * 9) % 2 === 0;
  const tint = b.holds ? KINDS[b.holds.kind].col : null;
  cx.save();
  cx.translate(b.x, b.y);
  const g = cx.createRadialGradient(-b.r * 0.35, -b.r * 0.4, 1, 0, 0, b.r + wob);
  if (warn) { g.addColorStop(0, 'rgba(255,235,235,0.75)'); g.addColorStop(1, 'rgba(255,90,110,0.22)'); }
  else if (tint) { g.addColorStop(0, 'rgba(255,255,255,0.42)'); g.addColorStop(1, rgba(tint, 0.26)); }
  else { g.addColorStop(0, 'rgba(255,255,255,0.62)'); g.addColorStop(1, 'rgba(120,200,255,0.24)'); }
  cx.fillStyle = g;
  cx.beginPath(); cx.arc(0, 0, b.r + wob, 0, 7); cx.fill();
  cx.restore();
}
function drawBubble(b) {
  const wob = Math.sin(b.age * 4 + b.x * 0.03) * 0.9;
  const warn = b.age > BUB_WARN && Math.floor(b.age * 9) % 2 === 0;
  cx.save();
  cx.translate(b.x, b.y);
  const g = cx.createRadialGradient(-b.r * 0.35, -b.r * 0.4, 1, 0, 0, b.r + wob);
  if (warn) { g.addColorStop(0, 'rgba(255,235,235,0.92)'); g.addColorStop(0.62, 'rgba(255,130,140,0.55)'); g.addColorStop(1, 'rgba(255,90,110,0.32)'); }
  else { g.addColorStop(0, 'rgba(255,255,255,0.88)'); g.addColorStop(0.5, 'rgba(170,235,255,0.46)'); g.addColorStop(1, 'rgba(120,200,255,0.30)'); }
  cx.shadowColor = warn ? 'rgba(255,120,140,0.9)' : 'rgba(150,220,255,0.75)';
  cx.shadowBlur = 12;
  if (!b.holds) { cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, b.r + wob, 0, 7); cx.fill(); }
  else if (warn) { cx.fillStyle = 'rgba(255,110,130,0.30)'; cx.beginPath(); cx.arc(0, 0, b.r + wob, 0, 7); cx.fill(); }
  cx.shadowBlur = 0;
  cx.strokeStyle = warn ? 'rgba(255,180,190,1)' : 'rgba(235,252,255,0.95)';
  cx.lineWidth = 2.4;
  cx.beginPath(); cx.arc(0, 0, b.r + wob, 0, 7); cx.stroke();
  cx.strokeStyle = 'rgba(255,255,255,0.95)'; cx.lineWidth = 2.8;
  cx.beginPath(); cx.arc(0, 0, b.r * 0.64, 3.5, 4.7); cx.stroke();
  cx.fillStyle = 'rgba(255,255,255,1)';
  cx.beginPath(); cx.arc(-b.r * 0.34, -b.r * 0.44, 3.1, 0, 7); cx.fill();
  cx.globalAlpha = 0.5;
  cx.beginPath(); cx.arc(b.r * 0.3, b.r * 0.34, 1.6, 0, 7); cx.fill();
  cx.globalAlpha = 1;
  cx.restore();
}
function drawFruitIcon(f, x, y) {
  cx.save(); cx.translate(x, y);
  cx.fillStyle = f.col;
  if (f.name === 'cherry') {
    cx.beginPath(); cx.arc(-5, 4, 6, 0, 7); cx.fill();
    cx.beginPath(); cx.arc(6, 6, 6, 0, 7); cx.fill();
    cx.strokeStyle = '#4a8f2a'; cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(-5, -2); cx.quadraticCurveTo(2, -12, 8, -2); cx.stroke();
  } else if (f.name === 'plum') {
    cx.beginPath(); cx.ellipse(0, 2, 8, 9, 0, 0, 7); cx.fill();
    cx.fillStyle = '#4a8f2a'; cx.beginPath(); cx.ellipse(5, -7, 5, 2.6, -0.5, 0, 7); cx.fill();
  } else if (f.name === 'melon') {
    cx.beginPath(); cx.arc(0, 2, 10, 0, 7); cx.fill();
    cx.strokeStyle = 'rgba(0,0,0,0.28)'; cx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) { cx.beginPath(); cx.moveTo(i * 5, -7); cx.quadraticCurveTo(i * 8, 2, i * 5, 11); cx.stroke(); }
  } else {
    cx.beginPath(); cx.moveTo(0, -9); cx.quadraticCurveTo(9, -2, 7, 6);
    cx.quadraticCurveTo(4, 12, 0, 12); cx.quadraticCurveTo(-4, 12, -7, 6);
    cx.quadraticCurveTo(-9, -2, 0, -9); cx.fill();
    cx.fillStyle = '#4a8f2a'; cx.beginPath(); cx.ellipse(3, -9, 4, 2, -0.6, 0, 7); cx.fill();
  }
  cx.strokeStyle = 'rgba(0,0,0,0.3)'; cx.lineWidth = 1.5;
  cx.restore();
}
function drawGhost(g) {
  const t = G.time;
  cx.save(); cx.translate(g.x, g.y + Math.sin(t * 4) * 3);
  cx.globalAlpha = 0.9;
  cx.fillStyle = 'rgba(235,240,255,0.92)';
  cx.beginPath();
  cx.arc(0, -4, 14, Math.PI, 0);
  cx.lineTo(14, 12);
  for (let i = 0; i < 4; i++) cx.quadraticCurveTo(10 - i * 7, 12 + (i % 2 ? -6 : 6), 7 - i * 7, 12);
  cx.lineTo(-14, 12); cx.closePath(); cx.fill();
  cx.fillStyle = '#241452';
  cx.beginPath(); cx.arc(-5, -4, 3.4, 0, 7); cx.fill();
  cx.beginPath(); cx.arc(5, -4, 3.4, 0, 7); cx.fill();
  cx.restore();
}
function drawPlayfield() {
  const [sx, sy] = shakeXY();
  cx.save();
  cx.translate(OX + sx, OY + sy);
  cx.beginPath(); cx.rect(0, 0, PW, PH); cx.clip();
  drawRoom();
  for (const L of G.letters) {
    cx.save(); cx.translate(L.x, L.y);
    cx.fillStyle = 'rgba(255,255,255,0.18)';
    cx.beginPath(); cx.arc(0, 0, 15, 0, 7); cx.fill();
    cx.strokeStyle = '#ffe066'; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(0, 0, 15, 0, 7); cx.stroke();
    cx.fillStyle = '#ffe066'; cx.font = 'bold 18px monospace'; cx.textAlign = 'center';
    cx.fillText(LETTERS[L.idx], 0, 6);
    cx.restore();
  }
  for (const f of G.fruits) drawFruitIcon(f.kind, f.x, f.y);
  for (const q of G.parts) {
    if (q.boulder) {
      cx.fillStyle = '#8e6b4a';
      cx.beginPath(); cx.arc(q.x, q.y, 8, 0, 7); cx.fill();
      cx.strokeStyle = '#5c4530'; cx.lineWidth = 2; cx.stroke();
    } else if (q.ring) {
      const k = q.t / q.life;
      cx.globalAlpha = Math.max(0, 1 - k) * 0.9;
      cx.strokeStyle = q.col; cx.lineWidth = Math.max(1, 6 - k * 5);
      cx.beginPath(); cx.arc(q.x, q.y, 8 + k * 54, 0, 7); cx.stroke();
      cx.globalAlpha = 1;
    } else {
      cx.globalAlpha = Math.max(0, 1 - q.t / q.life);
      cx.fillStyle = q.col;
      cx.beginPath(); cx.arc(q.x, q.y, 3, 0, 7); cx.fill();
      cx.globalAlpha = 1;
    }
  }
  for (const e of G.enemies) if (e.state === 'normal') drawMonster(e);
  for (const b of G.bubbles) {
    const panic = b.age > BUB_WARN ? (b.age - BUB_WARN) / (BUB_LIFE - BUB_WARN) : 0;
    const jitter = panic > 0 ? (hash32(Math.floor(G.time * 30), Math.floor(b.x), 2) - 0.5) * panic * 5 : 0;
    cx.save();
    cx.translate(jitter, 0);
    if (b.holds) {
      bubbleBody(b);                                  // glass behind
      cx.save();
      cx.translate(b.x, b.y);
      const s = 0.62 * (1 + panic * 0.12);
      cx.scale(s, s); cx.translate(-b.x, -b.y);
      drawMonster(b.holds);                           // the captive, clearly inside
      cx.restore();
      // a cage of light so it reads as trapped, not standing there
      cx.save();
      cx.translate(b.x, b.y);
      cx.strokeStyle = 'rgba(255,255,255,0.30)'; cx.lineWidth = 1.4;
      cx.beginPath(); cx.ellipse(0, 0, b.r * 0.92, b.r * 0.42, 0, 0, 7); cx.stroke();
      cx.beginPath(); cx.ellipse(0, 0, b.r * 0.42, b.r * 0.92, 0, 0, 7); cx.stroke();
      cx.restore();
    }
    drawBubble(b);
    cx.restore();
  }
  if (G.ghost) drawGhost(G.ghost);
  if (G.player) drawDragon(G.player);
  for (const p of G.pops) {
    const age = G.time - p.t;
    const punch = age < 0.14 ? 1.55 - age / 0.14 * 0.55 : 1;
    const sc = (p.scale || 1) * punch;
    cx.save();
    cx.globalAlpha = Math.max(0, 1 - age);
    cx.translate(p.x, p.y - (p.lift || 0) - age * 40);
    cx.scale(sc, sc);
    cx.fillStyle = p.big ? '#ffe066' : '#ffffff';
    cx.font = 'bold ' + (p.big ? 20 : 15) + 'px monospace';
    cx.textAlign = 'center';
    cx.strokeStyle = 'rgba(20,8,40,0.85)'; cx.lineWidth = 5;
    cx.strokeText(p.txt, 0, 0);
    cx.fillText(p.txt, 0, 0);
    cx.restore();
  }
  cx.restore();
  // frame
  cx.strokeStyle = '#3b2a6b'; cx.lineWidth = 4;
  cx.strokeRect(OX - 2, OY - 2, PW + 4, PH + 4);
}
function drawHUD() {
  cx.textAlign = 'left';
  cx.fillStyle = '#ffe066'; cx.font = 'bold 13px monospace';
  cx.fillText('SCORE', OX, 34);
  cx.save();
  cx.font = 'bold 34px monospace';
  cx.lineWidth = 5; cx.strokeStyle = 'rgba(20,8,40,0.9)';
  cx.strokeText(String(G.score).padStart(7, '0'), OX, 68);
  const sg = cx.createLinearGradient(0, 44, 0, 70);
  sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#ffd24a');
  cx.fillStyle = sg;
  cx.fillText(String(G.score).padStart(7, '0'), OX, 68);
  cx.restore();
  // lives as little dragons
  cx.fillStyle = '#ffe066'; cx.font = 'bold 13px monospace';
  cx.fillText('DRAGONS', OX + 250, 34);
  for (let i = 0; i < Math.min(6, Math.max(0, G.lives)); i++) {
    cx.save(); cx.translate(OX + 258 + i * 30, 56); cx.scale(0.62, 0.62);
    cx.fillStyle = '#5fc44a';
    cx.beginPath(); cx.ellipse(0, 0, 15, 15, 0, 0, 7); cx.fill();
    cx.strokeStyle = '#255f1f'; cx.lineWidth = 2.4; cx.stroke();
    eyePair(2, -3, 1, 0.85, false);
    cx.restore();
  }
  // the objective, in the space that was doing nothing
  cx.fillStyle = '#ffe066'; cx.font = 'bold 13px monospace';
  cx.fillText('MONSTERS', OX + 470, 34);
  cx.fillStyle = G.enemies.length ? '#ffffff' : '#6ee36a';
  cx.font = 'bold 30px monospace';
  cx.fillText(String(G.enemies.length), OX + 470, 66);
  cx.fillStyle = '#8a7fb5'; cx.font = 'bold 11px monospace';
  cx.fillText('LEFT IN THE ROOM', OX + 500, 64);
  // room
  cx.fillStyle = '#ffe066'; cx.font = 'bold 13px monospace';
  cx.fillText('ROOM', OX + 636, 34);
  cx.fillStyle = '#ffffff'; cx.font = 'bold 28px monospace';
  cx.fillText((G.roomIndex + 1) + '/' + G.maxRooms, OX + 636, 66);
  // extend
  cx.fillStyle = '#ffe066'; cx.font = 'bold 13px monospace';
  cx.textAlign = 'right';
  cx.fillText('EXTEND = 1UP', OX + PW, 34);
  cx.textAlign = 'center';
  for (let i = 0; i < 6; i++) {
    const x = OX + PW - 6 * 27 + i * 27 + 8, y = 66;
    if (G.have[i]) {
      cx.fillStyle = '#ffe066'; cx.font = 'bold 20px monospace';
      cx.fillText(LETTERS[i], x, y);
    } else {
      cx.strokeStyle = 'rgba(180,165,225,0.75)'; cx.lineWidth = 1.4;
      cx.font = 'bold 20px monospace';
      cx.strokeText(LETTERS[i], x, y);
    }
  }
  cx.textAlign = 'left';
  // hurry-up clock
  const left = Math.max(0, HURRY_AT - G.roomT);
  const frac = left / HURRY_AT;
  cx.fillStyle = '#8a7fb5'; cx.font = 'bold 10px monospace';
  cx.fillText('TIME', OX, OY + PH + 21);
  const SEG = 34, barX = OX + 40, barW = PW - 40, segW = barW / SEG;
  const lit = G.hurry ? 0 : Math.ceil(frac * SEG);      // out of time means an empty bar
  for (let i = 0; i < SEG; i++) {
    cx.fillStyle = i < lit ? (frac < 0.3 ? '#ffb03a' : '#6ee36a') : 'rgba(255,255,255,0.09)';
    cx.fillRect(barX + i * segW + 1, OY + PH + 12, segW - 2, 9);
  }
  if (G.hurry) {                                       // the panic lives on the room's own border
    const pulse = G.shotMode ? 0.85 : 0.5 + 0.5 * Math.sin(G.time * 9);
    cx.strokeStyle = 'rgba(255,70,95,' + (0.4 + 0.6 * pulse).toFixed(2) + ')';
    cx.lineWidth = 5;
    cx.strokeRect(OX - 5, OY - 5, PW + 10, PH + 10);
  }
}
function drawBanner() {
  const b = G.banner;
  if (!b) return;
  const age = G.time - b.t;
  if (age > 2.2) { G.banner = null; return; }
  const grow = Math.min(1, age * 6);
  const al = age > 1.7 ? (2.2 - age) / 0.5 : 1;
  cx.save();
  cx.globalAlpha = al;
  cx.textAlign = 'center';
  const fs = Math.round(26 + 16 * grow);
  cx.font = 'bold ' + fs + 'px monospace';
  cx.lineWidth = 7; cx.strokeStyle = 'rgba(20,10,40,0.9)';
  cx.strokeText(b.txt, OX + PW / 2, OY + PH * 0.36);
  const g = cx.createLinearGradient(0, OY + PH * 0.3, 0, OY + PH * 0.4);
  g.addColorStop(0, '#fff6c4'); g.addColorStop(1, '#ffc93f');
  cx.fillStyle = g;
  cx.fillText(b.txt, OX + PW / 2, OY + PH * 0.36);
  if (b.sub) {
    cx.font = 'bold 15px monospace';
    cx.lineWidth = 5; cx.strokeStyle = 'rgba(20,10,40,0.9)';
    cx.strokeText(b.sub, OX + PW / 2, OY + PH * 0.36 + 30);
    cx.fillStyle = '#ffffff';
    cx.fillText(b.sub, OX + PW / 2, OY + PH * 0.36 + 30);
  }
  cx.restore();
  cx.textAlign = 'left';
}
function drawScanlines() {
  cx.save();
  cx.globalAlpha = 0.055;
  cx.fillStyle = '#000';
  for (let y = 0; y < 720; y += 3) cx.fillRect(0, y, 1280, 1);
  cx.restore();
  const v = cx.createRadialGradient(640, 360, 300, 640, 360, 780);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  cx.fillStyle = v; cx.fillRect(0, 0, 1280, 720);
}
function drawTitle() {
  drawBackdrop();
  cx.textAlign = 'center';
  // bouncing dragons
  const t = G.time;
  for (let i = 0; i < 2; i++) {
    const x = 470 + i * 340, y = 470 + Math.abs(Math.sin(t * 2 + i * 1.1)) * -46;
    cx.save(); cx.translate(x, y); cx.scale(i ? -1.8 : 1.8, 1.8);
    drawDragon({ x: 0, y: 0, anim: t + i, face: 1, squash: 0, blowT: 0, invuln: 0 });
    cx.restore();
  }
  for (let i = 0; i < 10; i++) {
    const x = 60 + hash32(i, 3) * 1160;
    const y = ((hash32(i, 4) * 700 + t * (22 + hash32(i, 5) * 30)) % 760) - 30;
    // keep the drift out of the type: a clear band down the middle of the card
    if (x > 210 && x < 1070 && y > 150 && y < 690) continue;
    drawBubble({ x: x, y: y, r: 10 + hash32(i, 6) * 12, age: t + i, holds: null });
  }
  const g = cx.createLinearGradient(0, 170, 0, 285);
  g.addColorStop(0, '#fff8d0'); g.addColorStop(0.5, '#ffd24a'); g.addColorStop(1, '#f2892a');
  cx.font = 'bold 92px monospace';
  cx.lineWidth = 14; cx.strokeStyle = '#2a1550';
  cx.strokeText('BUBBLE KEEP', 640, 262);
  cx.fillStyle = g;
  cx.fillText('BUBBLE KEEP', 640, 262);
  cx.font = 'bold 17px monospace';
  cx.fillStyle = '#c8b6ff';
  cx.fillText('two little dragons · a cave of monsters · a Bubble Bobble tribute', 640, 302);
  const pulse = G.shotMode ? 1 : 0.55 + 0.45 * Math.sin(t * 3.4);
  cx.save(); cx.globalAlpha = pulse;
  cx.font = 'bold 20px monospace';
  cx.lineWidth = 6; cx.strokeStyle = '#2a1550';
  cx.strokeText('PRESS SPACE TO START', 640, 600);
  cx.fillStyle = '#ffffff';
  cx.fillText('PRESS SPACE TO START', 640, 600);
  cx.restore();
  cx.font = 'bold 13px monospace';
  cx.fillStyle = '#9c8fd0';
  cx.fillText('\u2190 \u2192 / A D run    \u2191 / Z / W jump    SPACE / X bubble    P pause    M mute', 640, 634);
  cx.fillStyle = '#ffd98a'; cx.font = 'bold 14px monospace';
  cx.fillText('TRAP A MONSTER IN A BUBBLE, THEN JUMP INTO IT TO POP IT', 640, 660);
  if (G.best > 0) {
    cx.fillStyle = '#ffe066'; cx.font = 'bold 15px monospace';
    cx.fillText('BEST  ' + G.best, 640, 666);
  }
  drawScanlines();
  cx.textAlign = 'left';
}
function drawEnd() {
  cx.fillStyle = G.won ? 'rgba(30,16,54,0.62)' : 'rgba(12,6,28,0.70)'; cx.fillRect(0, 0, 1280, 720);
  cx.textAlign = 'center';
  const won = G.won;
  const g = cx.createLinearGradient(0, 240, 0, 320);
  if (won) { g.addColorStop(0, '#d8ffd0'); g.addColorStop(1, '#4fd06a'); }
  else { g.addColorStop(0, '#ffd6dc'); g.addColorStop(1, '#e0455e'); }
  cx.font = 'bold 60px monospace';
  cx.lineWidth = 12; cx.strokeStyle = '#2a1550';
  const title = won ? 'THE KEEP IS FREE!' : 'THE KEEP KEEPS YOU';
  cx.strokeText(title, 640, 296);
  cx.fillStyle = g; cx.fillText(title, 640, 296);
  cx.font = 'bold 18px monospace'; cx.fillStyle = '#ffffff';
  cx.fillText(won ? 'every monster bubbled, every room emptied' : 'the cave swallows another dragon', 640, 336);
  cx.font = 'bold 38px monospace'; cx.fillStyle = '#ffe066';
  cx.fillText(String(G.score).padStart(7, '0'), 640, 400);
  cx.font = 'bold 14px monospace'; cx.fillStyle = '#c8b6ff';
  cx.fillText('ROOM ' + (G.roomIndex + 1) + '  ·  ' + G.cleared + ' MONSTERS POPPED  ·  ' +
    G.deaths + (G.deaths === 1 ? ' DRAGON LOST' : ' DRAGONS LOST'), 640, 432);
  if (G.best > 0) {
    cx.fillStyle = '#8a7fb5'; cx.font = 'bold 13px monospace';
    cx.fillText('BEST  ' + String(G.best).padStart(7, '0'), 640, 456);
  }
  const blink = G.shotMode ? 1 : 0.55 + 0.45 * Math.sin(G.time * 3.4);
  cx.save(); cx.globalAlpha = blink;
  cx.strokeStyle = '#ffe066'; cx.lineWidth = 2.4;
  rr(475, 486, 330, 46, 12); cx.stroke();
  cx.fillStyle = '#ffe066'; cx.font = 'bold 16px monospace';
  cx.fillText('[SPACE] PLAY AGAIN', 640, 515);
  cx.restore();
  // the cast, celebrating or not
  for (let i = 0; i < 2; i++) {
    const hop = G.won ? Math.abs(Math.sin(G.time * 4 + i)) * 22 : 0;
    cx.save(); cx.translate(452 + i * 376, 610 - hop); cx.scale(i ? -1.5 : 1.5, 1.5);
    drawDragon({ x: 0, y: 0, anim: G.time + i * 1.7, face: 1, squash: 0, blowT: 0, invuln: 0, vx: 0 });
    cx.restore();
  }
  if (G.won) {
    for (let i = 0; i < 14; i++) {
      const x = 200 + hash32(i, 11) * 880;
      const y = ((hash32(i, 12) * 700 + G.time * (40 + hash32(i, 13) * 50)) % 760) - 30;
      drawBubble({ x: x, y: y, r: 9 + hash32(i, 14) * 11, age: G.time + i, holds: null });
    }
  }
  drawScanlines();
  cx.textAlign = 'left';
}
function draw() {
  if (!cv) return;
  cx.fillStyle = '#0a0518'; cx.fillRect(0, 0, 1280, 720);
  if (!G || G.screen === 'title') { drawTitle(); return; }
  drawBackdrop();
  drawPlayfield();
  drawHUD();
  drawBanner();
  if (G.staged && G.shotMode) {
    cx.save();
    cx.fillStyle = '#ffd34a'; cx.globalAlpha = 0.62;
    cx.font = 'bold 10px monospace'; cx.textAlign = 'right';
    cx.fillText('STAGED POSITION \u2014 hand-built room, not bot play', 1272, 16);
    cx.restore(); cx.textAlign = 'left';
  }
  if (G.screen === 'paused') {
    cx.fillStyle = 'rgba(12,6,28,0.7)'; cx.fillRect(OX, OY, PW, PH);
    cx.textAlign = 'center'; cx.font = 'bold 34px monospace';
    cx.lineWidth = 9; cx.strokeStyle = '#2a1550';
    cx.strokeText('PAUSED', OX + PW / 2, OY + PH / 2);
    cx.fillStyle = '#ffe066'; cx.fillText('PAUSED', OX + PW / 2, OY + PH / 2);
    cx.textAlign = 'left';
  }
  drawScanlines();
  if (G.over || G.won) drawEnd();
}

// ------------------------------ audio ------------------------------
let AC = null;
function beep(f, d, type, delay) {
  if (!G || G.muted || G.headless || G.shotMode) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = AC.currentTime + (delay || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(type === 'sawtooth' ? 0.09 : 0.06, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
    o.connect(g); g.connect(AC.destination);
    o.start(t0); o.stop(t0 + d);
  } catch (e) { }
}

// ------------------------------ input ------------------------------
const held = {};
function onKey(e, down) {
  const k = e.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].indexOf(k) >= 0) e.preventDefault();
  if (down && (G.screen === 'title' || G.over || G.won)) {
    if (k === ' ' || k === 'Enter') { const b = G.best; newGame(URLSEED); G.best = b; }
    return;
  }
  if (down && (k === 'p' || k === 'P')) { G.screen = G.screen === 'paused' ? 'play' : 'paused'; return; }
  if (down && (k === 'm' || k === 'M')) { G.muted = !G.muted; return; }
  held[k] = down;
}
function readInput() {
  return {
    left: !!(held['ArrowLeft'] || held['a'] || held['A']),
    right: !!(held['ArrowRight'] || held['d'] || held['D']),
    jump: !!(held['ArrowUp'] || held['z'] || held['Z'] || held['w'] || held['W']),
    blow: !!(held[' '] || held['x'] || held['X']),
  };
}

// ------------------------------ shots ------------------------------
function playFrames(n, o) { for (let i = 0; i < n && !G.over && !G.won; i++) tick(1 / 60, botInput(o || {})); }
const SHOTS = {
  title: { run() { newGame(RUN_SEED); G.screen = 'title'; G.time = 2.1; }, check() { return true; } },
  room: {
    run() { newGame(RUN_SEED); playFrames(150); G.banner = null; },
    check() { return G.enemies.length >= 2 && G.player.alive; },
  },
  bubble: {
    run() {
      newGame(RUN_SEED);
      let fired = false;
      for (let i = 0; i < 900 && !fired; i++) {
        tick(1 / 60, botInput({}));
        if (G.bubbles.some(b => !b.holds && b.state === 'travel')) fired = true;
      }
      G.banner = null; this._ok = fired;
    },
    check() { return this._ok === true && G.bubbles.length > 0; },
  },
  trapped: {
    run() {
      newGame(RUN_SEED);
      let got = false;
      for (let i = 0; i < 1800 && !got; i++) {
        tick(1 / 60, botInput({ noPop: true }));
        if (G.bubbles.some(b => b.holds)) got = true;
      }
      G.banner = null; this._ok = got;
    },
    check() { return this._ok === true && G.bubbles.some(b => b.holds); },
  },
  chain: {
    run() {
      // a hand-built moment: four monsters bubbled together, the breath that pops them all
      newGame(RUN_SEED);
      G.staged = true;
      G.enemies = []; G.bubbles = []; G.banner = null;
      const p = G.player; p.x = 300; p.y = PH - TILE * 2 - 20;
      for (let i = 0; i < 4; i++) {
        const e = { kind: i === 3 ? 'hurler' : 'wanderer', x: 380 + i * 46, y: PH - TILE * 4, vx: 0, vy: 0,
          w: 26, h: 26, onGround: false, state: 'bubbled', angry: false, bubbleT: 0, anim: i, hurlT: 9, seed: i / 4 };
        G.enemies.push(e);
        G.bubbles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: 15, age: 1.2 + i * 0.1, state: 'float', holds: e, pop: 0 });
      }
      G.score = 46200;
      for (let i = 0; i < 3; i++) {
        const b = G.bubbles[0];
        G.enemies.splice(G.enemies.indexOf(b.holds), 1);
        popBubble(b, true);
      }
      G.time += 0.12;
    },
    check() { return G.pops.length >= 3 && G.bubbles.length === 1; },
  },
  hurry: {
    run() {
      newGame(RUN_SEED);
      for (let i = 0; i < 60 * 120 && !G.ghost && !G.over; i++) tick(1 / 60, botInput({ noPop: true }));
      for (let i = 0; i < 120 && !G.over; i++) tick(1 / 60, botInput({ noPop: true }));
      G.banner = { txt: 'HURRY UP!', t: G.time, sub: 'something is coming' };
    },
    check() { return !!G.ghost && G.hurry === true; },
  },
  extend: {
    run() {
      newGame(RUN_SEED);
      playFrames(200);
      G.have = [1, 1, 1, 0, 0, 0];
      G.letters = [{ idx: 3, x: G.player.x + 120, y: 200, vy: 34 }];
      G.staged = true;
      G.banner = null;
    },
    check() { return G.letters.length === 1 && G.have.filter(Boolean).length === 3; },
  },
  won: {
    run() { newGame(RUN_SEED, { headless: true }); runBot({}, 260); G.headless = false; G.screen = 'won'; },
    check() { return G.won === true; },
  },
  lost: {
    run() {
      newGame(RUN_SEED, { headless: true });
      runBot({ noBlow: true, noPop: true, noJump: true }, 160);
      G.headless = false;
    },
    check() { return G.over === true && !G.won; },
  },
};

// ------------------------------ boot ------------------------------
const QS = new URLSearchParams(location.search);
const URLSEED = +(QS.get('seed') || RUN_SEED) || RUN_SEED;
function boot() {
  cv = document.getElementById('cv');
  cx = cv.getContext('2d');
  const verify = QS.get('verify'), shot = QS.get('shot');
  if (verify) {
    try { runVerify(verify); }
    catch (e) { report(verify, 'ERROR', { error: String((e && e.message) || e) }); }
    return;
  }
  if (shot && SHOTS[shot]) {
    const def = SHOTS[shot];
    def.run();
    if (G) { G.shotMode = true; G.headless = false; }
    const ok = def.check();
    document.title = (ok ? 'shot-OK:' : 'shot-FAILED:') + shot;
    draw();
    return;
  }
  window.addEventListener('keydown', e => onKey(e, true));
  window.addEventListener('keyup', e => onKey(e, false));
  cv.addEventListener('mousedown', () => { if (G.screen === 'title' || G.over || G.won) { const b = G.best; newGame(URLSEED); G.best = b; } });
  newGame(URLSEED);
  G.screen = 'title';
  let last = 0;
  const loop = (ts) => {
    const dt = Math.min(0.033, (ts - last) / 1000); last = ts;
    if (G.screen === 'play') tick(dt, readInput());
    else G.time += dt;
    draw();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
window.addEventListener('DOMContentLoaded', boot);
