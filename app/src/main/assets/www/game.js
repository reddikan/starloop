'use strict';
// STARLOOP — hold to orbit, release to fling, cross your own trail to close a loop.
(() => {
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const Q = new URLSearchParams(location.search);
const DEMO = Q.has('demo');
const SPEED = Math.max(1, Math.min(8, +Q.get('speed') || 1));
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- utils
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  if (t > 0 && t <= 1 && u >= 0 && u <= 1) return { x: ax + rx * t, y: ay + ry * t };
  return null;
}
function inPoly(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
function polyArea(pts) { let s = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y); return Math.abs(s / 2); }
// which copies of something to draw so it shows on both sides of a screen edge it straddles
function ghostOffsets(x0, x1, y0, y1, m) {
  const xs = [0], ys = [0];
  if (x0 < m) xs.push(W); if (x1 > W - m) xs.push(-W);
  if (y0 < m) ys.push(H); if (y1 > H - m) ys.push(-H);
  const out = [];
  for (const ox of xs) for (const oy of ys) out.push([ox, oy]);
  return out;
}
function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

// ---------------------------------------------------------------- data
const SECTORS = [
  { name: 'AURORA DRIFT', hues: [175, 265, 300], bg: '#030512' },
  { name: 'CRIMSON VEIL', hues: [350, 20, 320], bg: '#0d0306' },
  { name: 'SAPPHIRE DEEP', hues: [215, 190, 250], bg: '#020614' },
  { name: 'EMERALD STORM', hues: [140, 170, 70], bg: '#020a07' },
  { name: 'SOLAR FORGE', hues: [35, 15, 50], bg: '#0d0602' },
  { name: 'ULTRAVIOLET', hues: [280, 310, 250], bg: '#07030f' },
  { name: 'ICE CATHEDRAL', hues: [195, 220, 175], bg: '#04070d' },
  { name: 'THE CORE', hues: [0, 120, 240], bg: '#060308' },
];
const THEMES = [
  { name: 'AURORA', h0: 170, h1: 290, rank: 1 },
  { name: 'SOLAR', h0: 15, h1: 55, rank: 2 },
  { name: 'ION', h0: 185, h1: 215, rank: 3 },
  { name: 'ROSE', h0: 300, h1: 355, rank: 5 },
  { name: 'TOXIC', h0: 75, h1: 150, rank: 7 },
  { name: 'PRISMATIC', h0: 0, h1: 360, rank: 9, cycle: true },
];
const LOOP_NAMES = [[12, 'HYPERNOVA'], [8, 'SUPERNOVA'], [5, 'STELLAR'], [3, 'NICE LOOP']];
const sectorNeed = (s) => 5000 * s + 3000 * s * s; // score needed to leave sector s

// ---------------------------------------------------------------- save
const SAVE_KEY = 'starloop_v1';
let save = { best: 0, done: 0, missions: [], theme: 0, tut: false, runs: 0, music: true };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) save = Object.assign(save, s); } catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
const rank = () => Math.floor(save.done / 3) + 1;

// ---------------------------------------------------------------- missions
const MTYPES = {
  loopN:  { make: c => Math.min(3 + Math.floor(c / 3), 14), text: n => `Capture ${n} things in a single loop`, stat: 'maxLoop' },
  mites:  { make: c => 3 + Math.floor(c / 2), text: n => `Destroy ${n} void mites in one run`, stat: 'mites' },
  sector: { make: c => Math.min(2 + Math.floor(c / 4), 9), text: n => `Reach sector ${n}`, stat: 'sector' },
  score:  { make: c => Math.round(3000 * (1 + c * 0.6) / 500) * 500, text: n => `Score ${fmt(n)} in one run`, stat: 'score' },
  mult:   { make: c => Math.min(4 + Math.floor(c / 3), 14), text: n => `Reach a x${n} multiplier`, stat: 'maxMult' },
  prism:  { make: c => 1 + Math.floor(c / 8), text: n => n > 1 ? `Catch ${n} prism comets in one run` : 'Catch a prism comet', stat: 'prisms' },
  loops:  { make: c => 12 + c * 3, text: n => `Close ${n} scoring loops in one run`, stat: 'loops' },
  ignite: { make: c => 3 + c, text: n => `Ignite ${n} stars in one run`, stat: 'ignites' },
};
function newMission(exclude) {
  const keys = Object.keys(MTYPES).filter(k => !exclude.includes(k));
  const k = keys[Math.floor(Math.random() * keys.length)];
  return { type: k, n: MTYPES[k].make(save.done) };
}
function ensureMissions() {
  while (save.missions.length < 3) save.missions.push(newMission(save.missions.map(m => m.type)));
}
ensureMissions(); persist();
const START_LIVES = 3;

// ---------------------------------------------------------------- canvas / sizing
let PW = 0, PH = 0, W = 1600, H = 900, SC = 1;
let nebulaA = null, nebulaB = null, nebulaMix = 1, vignette = null;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let pw = Math.round(innerWidth * dpr), ph = Math.round(innerHeight * dpr);
  const k = Math.min(1, 1920 / Math.max(pw, 1), 1080 / Math.max(ph, 1));
  pw = Math.round(pw * k); ph = Math.round(ph * k);
  cv.width = pw; cv.height = ph; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
  PW = pw; PH = ph; H = 900; W = 900 * pw / ph; SC = ph / 900;
  nebulaA = makeNebula(game ? game.sector : 0); nebulaB = null; nebulaMix = 1;
  vignette = makeVignette();
  stars = makeStars();
}

// ---------------------------------------------------------------- pre-rendered art
const glowCache = new Map();
function glow(h, s, l) {
  h = ((Math.round(h / 5) * 5) % 360 + 360) % 360;
  const key = h + '|' + s + '|' + l;
  let c = glowCache.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `hsla(${h},${s}%,${Math.min(l + 38, 100)}%,1)`);
    gr.addColorStop(0.18, `hsla(${h},${s}%,${l}%,0.75)`);
    gr.addColorStop(0.45, `hsla(${h},${s}%,${l}%,0.22)`);
    gr.addColorStop(1, `hsla(${h},${s}%,${l}%,0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowCache.set(key, c);
  }
  return c;
}
function G(h, x, y, r, a, s = 100, l = 60) { if (a <= 0.003) return; ctx.globalAlpha = a > 1 ? 1 : a; ctx.drawImage(glow(h, s, l), x - r, y - r, r * 2, r * 2); }

function makeNebula(si) {
  const pal = SECTORS[si % SECTORS.length];
  const c = document.createElement('canvas');
  const w = Math.max(64, Math.ceil(PW / 3)), h = Math.max(64, Math.ceil(PH / 3));
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const R = mulberry(1234 + si * 7919);
  g.fillStyle = pal.bg; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  // big soft clouds, arranged along a couple of diagonal "rivers"
  for (let i = 0; i < 70; i++) {
    const river = i % 2;
    const tt = R();
    let x = tt * w, y = (river ? 0.25 + tt * 0.5 : 0.85 - tt * 0.6) * h;
    x += (R() - 0.5) * w * 0.35; y += (R() - 0.5) * h * 0.35;
    const r = (0.06 + R() * 0.28) * w;
    const hh = pal.hues[i % 3] + (R() - 0.5) * 24;
    const a = 0.035 + R() * 0.075;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `hsla(${hh},85%,58%,${a})`);
    gr.addColorStop(0.4, `hsla(${hh},85%,42%,${a * 0.55})`);
    gr.addColorStop(1, `hsla(${hh},85%,30%,0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // hot cores
  for (let i = 0; i < 6; i++) {
    const x = R() * w, y = R() * h, r = (0.03 + R() * 0.06) * w;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `hsla(${pal.hues[i % 3]},60%,85%,0.18)`);
    gr.addColorStop(1, 'hsla(0,0%,0%,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // dark dust lanes
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 26; i++) {
    const x = R() * w, y = R() * h, r = (0.04 + R() * 0.16) * w;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fine star dust
  for (let i = 0; i < 700; i++) {
    const x = R() * w, y = R() * h;
    g.fillStyle = `rgba(255,255,255,${0.08 + R() * 0.4})`;
    g.fillRect(x, y, R() < 0.9 ? 0.6 : 1.2, R() < 0.9 ? 0.6 : 1.2);
  }
  return c;
}
function makeVignette() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 60, 128, 128, 182);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return c;
}
let stars = [];
function makeStars() {
  const a = [];
  for (let i = 0; i < 230; i++) {
    const layer = i < 140 ? 0 : i < 200 ? 1 : 2;
    a.push({ x: Math.random(), y: Math.random(), l: layer, s: [0.8, 1.4, 2.2][layer], ph: rand(TAU), sp: rand(0.5, 2.5), h: rand(1) < 0.3 ? rand(180, 260) : rand(20, 50) });
  }
  return a;
}

// ---------------------------------------------------------------- input
const input = { hold: false, holdFresh: false };
const padState = {};
function press(name, down) {
  if (padState[name] === down) return;
  padState[name] = down;
  SFX.init(); SFX.setMusic(save.music);
  const isHold = name === 'A' || name === 'L1' || name === 'R1' || name === 'L2' || name === 'R2' || name === 'touch' || name === 'Enter';
  if (isHold) {
    const any = ['A', 'L1', 'R1', 'L2', 'R2', 'touch', 'Enter'].some(n => padState[n]);
    if (down && !input.hold) input.holdFresh = true;
    input.hold = any;
  }
  if (down) onButton(name);
}
window.__pad = press;
window.__pauseGame = () => { if (state === 'play') setState('pause'); };
const KEYMAP = { ' ': 'A', z: 'A', x: 'A', Z: 'A', X: 'A', Enter: 'Enter', Escape: 'START', p: 'START', P: 'START', Backspace: 'B', b: 'B', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', m: 'SELECT', M: 'SELECT' };
addEventListener('keydown', e => { const n = KEYMAP[e.key]; if (n) { e.preventDefault(); press(n, true); } });
addEventListener('keyup', e => { const n = KEYMAP[e.key]; if (n) { e.preventDefault(); press(n, false); } });
const touches = new Set();
cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  const x = e.clientX / innerWidth * W, y = e.clientY / innerHeight * H;
  if (state === 'play' && x > W - 110 && y > H - 110) { press('START', true); press('START', false); return; }
  if ((state === 'title' && y > H - 70 && Math.abs(x - W / 2) < 260) || (state === 'pause' && Math.abs(y - (H * 0.3 + 130)) < 30 && Math.abs(x - W / 2) < 200)) {
    press('SELECT', true); press('SELECT', false); return;
  }
  if (state === 'title' && y > H - 150 && x > W - 520) { // theme picker taps
    press(x < W - 280 ? 'ArrowLeft' : 'ArrowRight', true); press(x < W - 280 ? 'ArrowLeft' : 'ArrowRight', false); return;
  }
  touches.add(e.pointerId); press('touch', true);
});
const tUp = e => { touches.delete(e.pointerId); if (touches.size === 0) press('touch', false); };
cv.addEventListener('pointerup', tUp); cv.addEventListener('pointercancel', tUp);
cv.addEventListener('contextmenu', e => e.preventDefault());

// ---------------------------------------------------------------- state
let state = 'title', stateT = 0;
let game = null;
let fx = { parts: [], rings: [], texts: [], flashes: [], toasts: [] };
let shake = 0, zoomK = 0, hitstop = 0, slowmo = 1, screenFlash = 0, screenFlashH = 0;
let attract = null;

function setState(s) {
  state = s; stateT = 0;
  if (s === 'play') SFX.setIntensity(game.sector >= 2 ? 2 : 1);
  if (s === 'title' || s === 'over') SFX.setIntensity(0);
}

function newWorld(demo) {
  const g = {
    demo, sector: 0, score: 0, shown: 0, lives: START_LIVES, lifeFx: 0, chain: 0, chainT: 0, mult: 1,
    t: 0, wells: [], shards: [], mites: [], prism: null, prismT: rand(22, 30), storm: 0,
    spawnT: 0, miteT: 9, trail: [], banner: null, tutPhase: save.tut || demo ? 99 : 0, tutT: 0,
    stats: { maxLoop: 0, mites: 0, sector: 1, score: 0, maxMult: 0, prisms: 0, loops: 0, ignites: 0 },
    completed: [], dead: false, deadT: 0,
    p: { x: W * 0.2, y: H * 0.5, vx: 1, vy: -0.2, speed: 400, boost: 0, lat: -1, ang: 0, d: 0, dir: 1, trav: 0, inv: 0, coast: 0 },
    ai: { hold: false, coast: 0.3 },
  };
  const n = Math.hypot(g.p.vx, g.p.vy); g.p.vx /= n; g.p.vy /= n;
  layoutWells(g, true);
  for (let i = 0; i < 4; i++) spawnCluster(g, true);
  return g;
}

function layoutWells(g, instant) {
  const count = Math.min(5 + Math.floor((g.sector + 1) / 2), 8);
  const pts = [];
  const mx = 150, my = 130;
  let tries = 0;
  while (pts.length < count && tries < 4000) {
    tries++;
    const x = rand(mx, W - mx), y = rand(my, H - my);
    const minD = tries < 2000 ? 330 : 250;
    if (pts.every(p => dist2(p.x, p.y, x, y) > minD * minD)) pts.push({ x, y });
  }
  const pal = SECTORS[g.sector % SECTORS.length];
  pts.forEach((p, i) => {
    let w = g.wells[i];
    const R = rand(105, 150);
    if (!w) {
      w = { x: p.x, y: p.y, r: rand(15, 26), R, h: pal.hues[i % 3] + rand(-15, 15), spin: rand(TAU), ign: 0, pulse: 0, a: instant ? 1 : 0, sx: p.x, sy: p.y, tx: p.x, ty: p.y, mt: 1 };
      g.wells.push(w);
    } else {
      w.sx = w.x; w.sy = w.y; w.tx = p.x; w.ty = p.y; w.mt = 0; w.R = R;
      w.h0 = w.h; w.h1 = pal.hues[i % 3] + rand(-15, 15);
    }
  });
  if (g.wells.length > count) g.wells.length = count;
}

function spawnCluster(g, quiet) {
  const pal = SECTORS[g.sector % SECTORS.length];
  const n = Math.floor(rand(3, 7));
  const free = Math.random() < 0.3;
  const hue = pal.hues[Math.floor(rand(3))] + rand(-20, 20);
  if (!free && g.wells.length) {
    const wi = Math.floor(rand(g.wells.length));
    const w = g.wells[wi];
    const base = rand(TAU), rad = w.R * rand(0.38, 1.15);
    for (let i = 0; i < n; i++) {
      g.shards.push({ home: wi, ang: base + i * 0.22 + rand(-0.05, 0.05), rad: rad + rand(-14, 14), w: rand(0.12, 0.3) * (Math.random() < 0.5 ? 1 : -1), x: 0, y: 0, h: hue + rand(-12, 12), gold: Math.random() < 0.07, born: g.t, rot: rand(TAU), quiet });
    }
  } else {
    let x, y, ok = false;
    for (let k = 0; k < 30 && !ok; k++) { x = rand(90, W - 90); y = rand(90, H - 90); ok = dist2(x, y, g.p.x, g.p.y) > 300 * 300; }
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), r = rand(10, 55);
      g.shards.push({ home: -1, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: rand(-8, 8), vy: rand(-8, 8), h: hue + rand(-12, 12), gold: Math.random() < 0.07, born: g.t, rot: rand(TAU), ph: rand(TAU), quiet });
    }
  }
  if (!quiet && !g.demo) for (let i = 0; i < 2; i++) {}
}

function spawnMite(g) {
  const side = Math.floor(rand(4));
  let x = side === 0 ? -20 : side === 1 ? W + 20 : rand(W), y = side === 2 ? -20 : side === 3 ? H + 20 : rand(H);
  if (side < 2) y = rand(80, H - 80); else x = rand(80, W - 80);
  // spawn from a rift inside the screen instead, away from the player
  for (let k = 0; k < 30; k++) {
    const rx = rand(80, W - 80), ry = rand(80, H - 80);
    if (dist2(rx, ry, g.p.x, g.p.y) > 420 * 420 && g.wells.every(w => dist2(rx, ry, w.x, w.y) > 80 * 80)) { x = rx; y = ry; break; }
  }
  g.mites.push({ x, y, vx: 0, vy: 0, born: g.t, ph: rand(TAU), sp: Math.min(55 + g.sector * 9, 135) * rand(0.85, 1.15) });
  ring(x, y, 4, 220, 0.6, 300, 3);
  burst(x, y, 18, 290, 160, 0.7, 3);
  SFX.mite();
}

// ---------------------------------------------------------------- fx helpers
function part(x, y, vx, vy, life, h, size, o = {}) {
  if (fx.parts.length > 1500) return;
  fx.parts.push({ x, y, vx, vy, life, max: life, h, size, drag: o.drag ?? 1.6, s: o.s ?? 100, l: o.l ?? 60, home: o.home || 0, streak: o.streak || 0, grav: o.grav || 0 });
}
function burst(x, y, n, h, spd, life, size, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), s = spd * (0.25 + Math.random() * 0.9);
    part(x, y, Math.cos(a) * s, Math.sin(a) * s, life * rand(0.6, 1.2), h + rand(-(o.hv ?? 15), o.hv ?? 15), size * rand(0.6, 1.4), o);
  }
}
function ring(x, y, r, vr, life, h, w) { fx.rings.push({ x, y, r, vr, life, max: life, h, w }); }
function text(x, y, s, h, size, life = 1.1, o = {}) { fx.texts.push({ x, y, s, h, size, life, max: life, vy: o.vy ?? -50, pop: 0, white: o.white }); }
function toast(s, sub, h) { fx.toasts.push({ s, sub, h, t: 0 }); }

// ---------------------------------------------------------------- game logic
function startRun() {
  game = newWorld(DEMO);
  fx = { parts: [], rings: [], texts: [], flashes: [], toasts: [] };
  nebulaA = makeNebula(0); nebulaB = null; nebulaMix = 1;
  input.holdFresh = false;
  game.needRelease = input.hold;
  save.runs++; persist();
  setState('play');
  SFX.start();
}

function themeHue(u, t) {
  const th = THEMES[save.theme] || THEMES[0];
  if (th.cycle) return (u * 300 + t * 120) % 360;
  return lerp(th.h0, th.h1, u);
}

function updateWorld(g, dt, live) {
  g.t += dt;
  const p = g.p;
  // ---- wells
  for (const w of g.wells) {
    w.spin += dt * 0.4;
    w.pulse = Math.max(0, w.pulse - dt * 1.5);
    w.ign = Math.max(0, w.ign - dt);
    w.a = Math.min(1, w.a + dt * 1.2);
    if (w.mt < 1) {
      w.mt = Math.min(1, w.mt + dt / 1.6);
      const e = ease(w.mt);
      w.x = lerp(w.sx, w.tx, e); w.y = lerp(w.sy, w.ty, e);
      if (w.h1 !== undefined) w.h = lerp(w.h0, w.h1, e);
    }
  }
  // ---- input → hold
  let hold;
  if (g.demo) hold = aiThink(g, dt);
  else {
    if (g.needRelease) { if (!input.hold) g.needRelease = false; hold = false; }
    else hold = input.hold;
  }
  // ---- player
  const sp = p.speed * (1 + p.boost);
  if (!g.dead) {
    if (hold && p.lat < 0) {
      let best = -1, bd = 360 * 360;
      g.wells.forEach((w, i) => { const d = dist2(p.x, p.y, w.x, w.y); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) {
        const w = g.wells[best];
        p.lat = best;
        p.d = Math.max(Math.sqrt(bd), w.r + 26);
        p.ang = Math.atan2(p.y - w.y, p.x - w.x);
        const cross = (p.x - w.x) * p.vy - (p.y - w.y) * p.vx;
        p.dir = cross >= 0 ? 1 : -1;
        p.trav = 0;
        w.pulse = 1;
        burst(p.x, p.y, 10, themeHue(1, g.t), 120, 0.4, 3);
        if (g.tutPhase === 0) { g.tutPhase = 1; g.tutT = 0; }
      }
    } else if (!hold && p.lat >= 0) {
      p.lat = -1;
      p.boost = Math.min(0.55, p.boost + 0.12);
      SFX.release(p.boost);
      burst(p.x, p.y, 14, themeHue(1, g.t), 200, 0.5, 3, { streak: 1 });
      if (g.tutPhase === 1) { g.tutPhase = 2; g.tutT = 0; }
    }
    if (p.lat >= 0) {
      const w = g.wells[p.lat];
      const target = Math.max(w.R * 0.62, w.r + 26);
      p.d += (target - p.d) * Math.min(1, dt * 0.8);
      const om = sp / p.d;
      p.ang += p.dir * om * dt; p.trav += om * dt;
      p.x = w.x + Math.cos(p.ang) * p.d; p.y = w.y + Math.sin(p.ang) * p.d;
      p.vx = -Math.sin(p.ang) * p.dir; p.vy = Math.cos(p.ang) * p.dir;
      p.boost = Math.min(0.55, p.boost + dt * 0.14);
    } else {
      // gentle gravity bends free flight
      let ax = 0, ay = 0;
      for (const w of g.wells) {
        const dx = w.x - p.x, dy = w.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 < 260 * 260 && d2 > 400) { const d = Math.sqrt(d2), f = 3400 * (w.r / 20) / d2; ax += dx / d * f; ay += dy / d * f; }
      }
      p.vx += ax * dt; p.vy += ay * dt;
      const n = Math.hypot(p.vx, p.vy) || 1; p.vx /= n; p.vy /= n;
      p.x += p.vx * sp * dt; p.y += p.vy * sp * dt;
      p.boost *= Math.exp(-dt * 0.9);
      // wrap
      let wrapped = false;
      const px0 = p.x, py0 = p.y;
      if (p.x < 0) { p.x += W; wrapped = true; } else if (p.x >= W) { p.x -= W; wrapped = true; }
      if (p.y < 0) { p.y += H; wrapped = true; } else if (p.y >= H) { p.y -= H; wrapped = true; }
      if (wrapped) { g.trail.push({ x: px0, y: py0, t: g.t }); g.wrapJump = true; }
    }
    // unwrapped camera position: keeps counting past the screen edge so the background never jumps
    if (g.ux === undefined) { g.ux = p.x; g.uy = p.y; g.lx = p.x; g.ly = p.y; }
    let ddx = p.x - g.lx, ddy = p.y - g.ly;
    if (ddx > W / 2) ddx -= W; else if (ddx < -W / 2) ddx += W;
    if (ddy > H / 2) ddy -= H; else if (ddy < -H / 2) ddy += H;
    g.ux += ddx; g.uy += ddy; g.lx = p.x; g.ly = p.y;
    p.inv = Math.max(0, p.inv - dt);
    // engine sparks
    if (Math.random() < 0.9) part(p.x, p.y, -p.vx * 60 + rand(-30, 30), -p.vy * 60 + rand(-30, 30), rand(0.3, 0.7), themeHue(rand(0.6, 1), g.t), rand(2, 4), { drag: 2.5 });
    // ---- trail + loops
    const tr = g.trail;
    const last = tr[tr.length - 1];
    if (!last || g.wrapJump || dist2(last.x, last.y, p.x, p.y) > 49) {
      // b = this point starts a new piece of trail on the far side of a screen edge
      const np = { x: p.x, y: p.y, t: g.t, b: !!g.wrapJump };
      g.wrapJump = false;
      if (last && !np.b && tr.length > 6) {
        let hitIdx = -1, ip = null;
        for (let j = tr.length - 5; j >= 0; j--) {
          const a = tr[j], b = tr[j + 1];
          if (b.b) break; // loops can't reach back across an edge crossing
          const r = segX(last.x, last.y, np.x, np.y, a.x, a.y, b.x, b.y);
          if (r) { hitIdx = j; ip = r; break; }
        }
        if (hitIdx >= 0) {
          const poly = [ip];
          for (let k = hitIdx + 1; k < tr.length; k++) poly.push(tr[k]);
          poly.push({ x: ip.x, y: ip.y });
          if (poly.length > 5 && polyArea(poly) > 1500) {
            closeLoop(g, poly, live);
            g.trail = [{ x: ip.x, y: ip.y, t: g.t }];
          }
        }
      }
      g.trail.push(np);
    }
    const life = 3.4;
    while (g.trail.length && g.t - g.trail[0].t > life) g.trail.shift();
  }

  // ---- shards
  for (const s of g.shards) {
    s.rot += dt * 1.5;
    if (s.home >= 0 && g.wells[s.home]) {
      const w = g.wells[s.home];
      s.ang += s.w * dt;
      s.x = w.x + Math.cos(s.ang) * s.rad; s.y = w.y + Math.sin(s.ang) * s.rad;
    } else {
      s.home = -1;
      s.ph = (s.ph || 0) + dt;
      s.x += (s.vx || 0) * dt + Math.cos(s.ph) * 6 * dt; s.y += (s.vy || 0) * dt + Math.sin(s.ph * 0.8) * 6 * dt;
      if (s.x < 30) s.vx = Math.abs(s.vx || 5); if (s.x > W - 30) s.vx = -Math.abs(s.vx || 5);
      if (s.y < 30) s.vy = Math.abs(s.vy || 5); if (s.y > H - 30) s.vy = -Math.abs(s.vy || 5);
    }
  }
  const target = Math.min(16 + g.sector * 2, 34) + (g.storm > 0 ? 14 : 0);
  g.spawnT -= dt;
  if (g.spawnT <= 0 && g.shards.length < target) { spawnCluster(g); g.spawnT = g.storm > 0 ? 0.25 : rand(0.6, 1.2); }

  // ---- mites
  if (g.tutPhase >= 3 || g.demo || save.tut) g.miteT -= dt;
  const miteMax = Math.min(1 + g.sector, 9);
  if (g.miteT <= 0 && g.mites.length < miteMax && !g.dead) { spawnMite(g); g.miteT = Math.max(1.6, 4.2 - g.sector * 0.35) * rand(0.8, 1.2); }
  for (let i = g.mites.length - 1; i >= 0; i--) {
    const m = g.mites[i];
    m.ph += dt * 3;
    const age = g.t - m.born;
    if (age < 0.8) continue; // materializing
    const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1;
    const want = m.sp;
    m.vx += (dx / d * want - m.vx) * dt * 0.9 + Math.cos(m.ph) * 20 * dt;
    m.vy += (dy / d * want - m.vy) * dt * 0.9 + Math.sin(m.ph * 1.3) * 20 * dt;
    m.x += m.vx * dt; m.y += m.vy * dt;
    // keep mites out of star cores
    for (const w of g.wells) { const ex = m.x - w.x, ey = m.y - w.y, e = Math.hypot(ex, ey); if (e < w.r + 22) { m.x = w.x + ex / e * (w.r + 22); m.y = w.y + ey / e * (w.r + 22); } }
    if (Math.random() < 0.3) part(m.x + rand(-8, 8), m.y + rand(-8, 8), rand(-15, 15), rand(-15, 15), 0.5, 300 + rand(-20, 20), 3, { l: 45 });
    if (!g.dead && p.inv <= 0 && d < 24) {
      g.mites.splice(i, 1);
      playerHit(g, m, live);
    }
  }

  // ---- prism comet
  g.prismT -= dt;
  if (!g.prism && g.prismT <= 0 && !g.dead) {
    const fromLeft = Math.random() < 0.5;
    g.prism = { x: fromLeft ? -30 : W + 30, y: rand(150, H - 150), vx: fromLeft ? 1 : -1, ph: rand(TAU), life: 0, base: 0 };
    g.prism.base = g.prism.y;
    g.prismT = rand(26, 38);
    if (live) { SFX.prismAppear(); text(W / 2, 140, 'PRISM COMET!', 0, 34, 1.6, { white: 1 }); }
  }
  if (g.prism) {
    const pr = g.prism;
    pr.life += dt; pr.ph += dt * 1.6;
    pr.x += pr.vx * 150 * dt;
    pr.y = pr.base + Math.sin(pr.ph) * 120;
    if (Math.random() < 0.9) part(pr.x, pr.y, -pr.vx * 80 + rand(-20, 20), rand(-20, 20), rand(0.6, 1.1), (g.t * 300) % 360, rand(3, 5), { drag: 1.2 });
    if (pr.x < -60 || pr.x > W + 60) g.prism = null;
  }
  g.storm = Math.max(0, g.storm - dt);
  if (g.storm > 0 && Math.random() < 0.6) part(rand(W), -10, rand(-20, 20), rand(250, 450), 2.5, rand(360), rand(2, 4), { drag: 0, streak: 1 });

  // ---- chain timer
  if (g.chainT > 0) { g.chainT -= dt; if (g.chainT <= 0) { if (g.chain >= 3 && live) text(W - 120, 170, 'CHAIN LOST', 0, 20, 1, { white: 1, vy: 20 }); g.chain = 0; g.mult = 1; } }

  // ---- sectors (only for real runs)
  g.lifeFx = Math.max(0, g.lifeFx - dt);
  if (live && !g.demo || (live && DEMO)) {
    if (!g.dead && g.score >= sectorNeed(g.sector + 1)) {
      g.sector++;
      g.stats.sector = Math.max(g.stats.sector, g.sector + 1);
      layoutWells(g, false);
      nebulaB = makeNebula(g.sector); nebulaMix = 0;
      g.banner = { t: 0, s: `SECTOR ${g.sector + 1}`, sub: SECTORS[g.sector % SECTORS.length].name };
      SFX.sector(); SFX.setIntensity(g.sector >= 2 ? 2 : 1);
      screenFlash = 0.6; screenFlashH = SECTORS[g.sector % SECTORS.length].hues[0];
      ring(p.x, p.y, 10, 1600, 1.4, SECTORS[g.sector % SECTORS.length].hues[0], 10);
      checkMissions(g);
    }
  }
  if (g.banner) { g.banner.t += dt; if (g.banner.t > 3.2) g.banner = null; }
  // tutorial
  g.tutT += dt;
  if (g.tutPhase === 3 && g.tutT > 6) { g.tutPhase = 4; save.tut = true; persist(); }
  if (g.dead) g.deadT += dt;
}

function closeLoop(g, poly, live) {
  const caught = [];
  let golds = 0, mitesK = 0, wellsK = 0, prismK = false;
  for (let i = g.shards.length - 1; i >= 0; i--) {
    const s = g.shards[i];
    if (g.t - s.born < 0.3) continue;
    if (inPoly(s.x, s.y, poly)) { caught.push(s); if (s.gold) golds++; g.shards.splice(i, 1); }
  }
  const deadMites = [];
  for (let i = g.mites.length - 1; i >= 0; i--) {
    const m = g.mites[i];
    if (inPoly(m.x, m.y, poly)) { deadMites.push(m); g.mites.splice(i, 1); mitesK++; }
  }
  const lit = [];
  for (const w of g.wells) if (w.ign <= 0 && inPoly(w.x, w.y, poly)) { lit.push(w); w.ign = 5; w.pulse = 1.6; wellsK++; }
  if (g.prism && inPoly(g.prism.x, g.prism.y, poly)) prismK = true;

  const n = caught.length + mitesK + (prismK ? 1 : 0);
  // centroid
  let cx = 0, cy = 0; for (const q of poly) { cx += q.x; cy += q.y; } cx /= poly.length; cy /= poly.length;
  const hue = themeHue(0.7, g.t);
  if (n === 0 && wellsK === 0) {
    fx.flashes.push({ pts: poly.map(q => ({ x: q.x, y: q.y })), life: 0.35, max: 0.35, h: hue, a: 0.25 });
    if (live) SFX.emptyLoop();
    return;
  }
  g.chain++; g.chainT = 3.6;
  g.mult = Math.min(g.chain, 16);
  const storm = g.storm > 0 ? 2 : 1;
  const bonus = 1 + Math.max(0, n - 1) * 0.3;
  let pts = (caught.length * 25 + golds * 75 + mitesK * 120 + wellsK * 40 + (prismK ? 600 : 0)) * bonus * g.mult * storm;
  pts = Math.round(pts / 5) * 5;
  if (!g.demo || DEMO) g.score += pts;
  const st = g.stats;
  st.maxLoop = Math.max(st.maxLoop, n); st.mites += mitesK; st.loops++; st.ignites += wellsK; st.maxMult = Math.max(st.maxMult, g.mult); st.score = g.score;
  if (prismK) st.prisms++;
  // ---- juice
  const big = Math.min(n, 12);
  fx.flashes.push({ pts: poly.map(q => ({ x: q.x, y: q.y })), life: 0.7 + big * 0.03, max: 0.7 + big * 0.03, h: hue, a: 0.55 + big * 0.03 });
  ring(cx, cy, 10, 500 + big * 80, 0.7, hue, 4 + big * 0.6);
  if (big >= 5) ring(cx, cy, 5, 900, 0.9, (hue + 40) % 360, 2);
  for (const s of caught) {
    const h = s.gold ? 45 : s.h;
    burst(s.x, s.y, 12, h, 260, 0.6, 3.5, { streak: 1 });
    ring(s.x, s.y, 3, 160, 0.4, h, 2);
    for (let k = 0; k < 3; k++) part(s.x, s.y, rand(-120, 120), rand(-120, 120), 1.4, h, 4, { home: 1, drag: 0.5 });
  }
  for (const m of deadMites) {
    burst(m.x, m.y, 40, 300, 420, 0.9, 4, { streak: 1, hv: 30 });
    burst(m.x, m.y, 16, 0, 160, 1.0, 6, { s: 0, l: 80 });
    ring(m.x, m.y, 5, 420, 0.6, 320, 5);
    if (live) text(m.x, m.y - 20, 'VOID BURST', 300, 20, 1);
  }
  for (const w of lit) {
    ring(w.x, w.y, w.r, 300, 0.8, w.h, 6);
    burst(w.x, w.y, 30, w.h, 300, 0.8, 4);
  }
  if (prismK) {
    g.storm = 9; g.prism && burst(g.prism.x, g.prism.y, 90, 0, 500, 1.4, 5, { hv: 180 }); g.prism = null;
    screenFlash = 0.8; screenFlashH = 0;
    if (live) { SFX.prism(); text(W / 2, H / 2 - 60, 'PRISM STORM', 0, 64, 2.2, { white: 1, vy: -10 }); }
  }
  if (live) {
    text(cx, cy, '+' + fmt(pts), hue, 26 + big * 3, 1.2);
    for (const [k, name] of LOOP_NAMES) if (n >= k) { text(cx, cy - 40 - big * 2, name, (hue + 50) % 360, 22 + big * 2.5, 1.3, { white: n >= 8 }); break; }
    if (g.mult >= 2) text(g.p.x, g.p.y - 34, 'x' + g.mult, 50, 22, 0.8);
    hitstop = Math.min(0.11, 0.025 + big * 0.008);
    shake = Math.min(18, shake + big * 1.4 + mitesK * 3);
    zoomK = Math.min(0.05, zoomK + big * 0.004);
    SFX.capture(n, g.chain, golds > 0);
    if (mitesK) SFX.miteKill();
    if (wellsK) SFX.ignite();
    vibrate(Math.min(40, 8 + big * 3));
    if (g.tutPhase === 2) { g.tutPhase = 3; g.tutT = 0; }
    checkMissions(g);
  }
}

function playerHit(g, m, live) {
  const p = g.p;
  p.inv = 2.0;
  burst(m.x, m.y, 30, 300, 300, 0.8, 4, { hv: 30 });
  burst(p.x, p.y, 24, 0, 260, 0.6, 3, { s: 0, l: 90 });
  ring(p.x, p.y, 10, 380, 0.5, 340, 6);
  if (!live) return;
  g.lives--; g.lifeFx = 1; g.stats.hits = (g.stats.hits || 0) + 1; g.chain = 0; g.mult = 1; g.chainT = 0;
  shake = 22; screenFlash = 0.5; screenFlashH = 340; hitstop = 0.08;
  SFX.hit(); vibrate(70);
  if (g.lives <= 0) { die(g); return; }
  text(p.x, p.y - 30, g.lives === 1 ? 'LAST LIFE!' : 'LIFE LOST', 340, 24, 1.1, { white: g.lives === 1 });
  // shockwave clears mites close by so you get a moment to recover
  ring(p.x, p.y, 10, 700, 0.7, 340, 8);
  for (let i = g.mites.length - 1; i >= 0; i--) {
    const q = g.mites[i];
    if (dist2(q.x, q.y, p.x, p.y) < 240 * 240) { burst(q.x, q.y, 24, 300, 300, 0.7, 4, { streak: 1 }); g.mites.splice(i, 1); }
  }
}

function die(g) {
  if (g.dead) return;
  g.dead = true; g.deadT = 0; g.lives = 0;
  const p = g.p;
  p.lat = -1;
  slowmo = 0.25;
  burst(p.x, p.y, 160, themeHue(0.5, g.t), 700, 1.8, 5, { streak: 1, hv: 60, drag: 1.2 });
  burst(p.x, p.y, 50, 0, 300, 2.0, 8, { s: 0, l: 90 });
  for (let i = 0; i < 4; i++) ring(p.x, p.y, 5, 300 + i * 260, 1.4, themeHue(i / 4, g.t), 8 - i);
  shake = 30; screenFlash = 1; screenFlashH = themeHue(1, g.t);
  SFX.die(); vibrate(200);
  g.stats.score = g.score;
  checkMissions(g);
  g.newBest = g.score > save.best;
  if (!DEMO) { if (g.newBest) save.best = g.score; persist(); }
}

function checkMissions(g) {
  if (g.demo && !DEMO) return;
  let changed = false;
  for (let i = 0; i < save.missions.length; i++) {
    const m = save.missions[i];
    const v = g.stats[MTYPES[m.type].stat];
    if (v >= m.n) {
      const oldRank = rank();
      save.done++;
      g.completed.push(MTYPES[m.type].text(m.n));
      toast('MISSION COMPLETE', MTYPES[m.type].text(m.n), 140);
      SFX.mission();
      save.missions[i] = newMission(save.missions.map(x => x.type));
      if (rank() > oldRank) {
        const un = THEMES.find(t => t.rank === rank());
        toast(`RANK ${rank()}`, un ? `New trail unlocked: ${un.name}` : 'Your light grows stronger', 50);
        if (un) save.theme = THEMES.indexOf(un);
      }
      changed = true; i = -1; // re-check new missions against current stats
    }
  }
  if (changed) persist();
}

// ---------------------------------------------------------------- AI (attract + ?demo)
function aiThink(g, dt) {
  const p = g.p, ai = g.ai;
  if (g.dead) return false;
  if (p.lat >= 0) {
    // release after a full loop when pointing at something interesting
    if (p.trav > TAU + 0.5) {
      let good = false;
      for (const w of g.wells) {
        if (w === g.wells[p.lat]) continue;
        const dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy);
        if (d < 700 && (dx * p.vx + dy * p.vy) / d > 0.93) { good = true; break; }
      }
      if (good || p.trav > TAU * 2.2) { ai.coast = rand(0.25, 0.6); return false; }
    }
    return true;
  }
  ai.coast -= dt;
  if (ai.coast > 0) return false;
  for (const w of g.wells) {
    const dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy);
    const closing = (dx * p.vx + dy * p.vy) / d;
    if (d < w.R * 1.25 && closing < 0.5) return true;
  }
  return false;
}

// ---------------------------------------------------------------- buttons
function toggleMusic() { save.music = !save.music; persist(); SFX.setMusic(save.music); SFX.ui(); }
function onButton(n) {
  if (n === 'SELECT' && (state === 'title' || state === 'pause')) { toggleMusic(); return; }
  if (state === 'title') {
    if (stateT < 0.3) return;
    if (n === 'ArrowLeft' || n === 'ArrowRight') {
      const dir = n === 'ArrowLeft' ? -1 : 1;
      save.theme = (save.theme + dir + THEMES.length) % THEMES.length; persist(); SFX.ui();
    } else if (n === 'A' || n === 'touch' || n === 'Enter' || n === 'START' || n === 'R1' || n === 'L1' || n === 'R2' || n === 'L2') {
      if (THEMES[save.theme].rank > rank()) { SFX.hit(); return; }
      startRun();
    } else if (n === 'B') { if (window.Android && Android.exit) Android.exit(); }
  } else if (state === 'play') {
    if (n === 'START' || n === 'B') { setState('pause'); SFX.ui(); }
  } else if (state === 'pause') {
    if (n === 'START' || n === 'A' || n === 'Enter') { setState('play'); game.needRelease = true; SFX.ui(); }
    else if (n === 'B') { toTitle(); }
  } else if (state === 'over') {
    if (stateT < 1.0) return;
    if (n === 'A' || n === 'touch' || n === 'Enter' || n === 'START' || n === 'R1' || n === 'L1' || n === 'R2' || n === 'L2') startRun();
    else if (n === 'B') toTitle();
  }
}
function toTitle() {
  attract = newWorld(true);
  game = null;
  nebulaA = makeNebula(0); nebulaB = null; nebulaMix = 1;
  fx = { parts: [], rings: [], texts: [], flashes: [], toasts: [] };
  setState('title');
}

// ---------------------------------------------------------------- update fx
function updateFx(dt, g) {
  const P = fx.parts;
  for (let i = P.length - 1; i >= 0; i--) {
    const q = P[i];
    q.life -= dt;
    if (q.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
    if (q.home && g && !g.dead) {
      const dx = g.p.x - q.x, dy = g.p.y - q.y, d = Math.hypot(dx, dy) || 1;
      const k = 1 - q.life / q.max;
      q.vx += dx / d * 2600 * k * dt; q.vy += dy / d * 2600 * k * dt;
      q.vx *= Math.exp(-dt * 3); q.vy *= Math.exp(-dt * 3);
      if (d < 16 && k > 0.2) { q.life = 0; continue; }
    } else {
      const dr = Math.exp(-q.drag * dt); q.vx *= dr; q.vy *= dr; q.vy += q.grav * dt;
    }
    q.x += q.vx * dt; q.y += q.vy * dt;
  }
  for (let i = fx.rings.length - 1; i >= 0; i--) { const r = fx.rings[i]; r.life -= dt; r.r += r.vr * dt * (r.life / r.max + 0.2); if (r.life <= 0) fx.rings.splice(i, 1); }
  for (let i = fx.texts.length - 1; i >= 0; i--) { const t = fx.texts[i]; t.life -= dt; t.y += t.vy * dt; t.vy *= Math.exp(-dt * 2); t.pop += dt; if (t.life <= 0) fx.texts.splice(i, 1); }
  for (let i = fx.flashes.length - 1; i >= 0; i--) { const f = fx.flashes[i]; f.life -= dt; if (f.life <= 0) fx.flashes.splice(i, 1); }
  if (fx.toasts.length) { fx.toasts[0].t += dt; if (fx.toasts[0].t > 3) fx.toasts.shift(); }
}

// ---------------------------------------------------------------- render
function render(g, now) {
  const t = now / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, PW, PH);
  // parallax based on player
  // stars scroll with the unwrapped position (they tile, so it never ends);
  // the nebula uses a periodic offset so a full lap around the screen lands back where it started
  const ux = g && g.ux !== undefined ? g.ux : (g ? g.p.x : 0), uy = g && g.uy !== undefined ? g.uy : (g ? g.p.y : 0);
  const sxp = ux / W, syp = uy / H;
  const px = Math.sin(TAU * sxp) * 0.5, py = Math.sin(TAU * syp) * 0.5;
  const drawNeb = (n, a) => { if (!n || a <= 0) return; ctx.globalAlpha = a; const k = 1.08; const ow = PW * k, oh = PH * k; ctx.drawImage(n, (PW - ow) / 2 - px * PW * 0.03, (PH - oh) / 2 - py * PH * 0.03, ow, oh); };
  drawNeb(nebulaA, 1);
  if (nebulaB) { drawNeb(nebulaB, ease(nebulaMix)); }
  // stars
  ctx.globalCompositeOperation = 'lighter';
  for (const s of stars) {
    const par = [0.01, 0.025, 0.05][s.l];
    let x = ((s.x - sxp * par + t * 0.002 * (s.l + 1)) % 1 + 1) % 1 * PW, y = ((s.y - syp * par) % 1 + 1) % 1 * PH;
    const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
    const r = s.s * SC * (s.l === 2 ? 6 : 3);
    G(s.h, x, y, r, tw * (s.l === 2 ? 0.8 : 0.5), 40, 75);
  }
  if (!g) return;
  // world transform with shake + zoom punch
  const sx = (Math.random() - 0.5) * shake * SC, sy = (Math.random() - 0.5) * shake * SC;
  const z = 1 + zoomK;
  ctx.setTransform(SC * z, 0, 0, SC * z, PW / 2 * (1 - z) + sx, PH / 2 * (1 - z) + sy);

  // loop flashes
  for (const f of fx.flashes) {
    const k = f.life / f.max;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.moveTo(f.pts[0].x, f.pts[0].y);
    for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i].x, f.pts[i].y);
    ctx.closePath();
    ctx.globalAlpha = f.a * k * k;
    ctx.fillStyle = `hsl(${f.h},100%,${40 + 30 * k}%)`; ctx.fill();
    ctx.globalAlpha = Math.min(1, f.a * 1.6 * k);
    ctx.strokeStyle = `hsl(${f.h},100%,85%)`; ctx.lineWidth = 3 + 6 * k; ctx.stroke();
  }

  // wells
  const p = g.p;
  let nearest = -1;
  if (p.lat < 0 && !g.dead) { let bd = 360 * 360; g.wells.forEach((w, i) => { const d = dist2(p.x, p.y, w.x, w.y); if (d < bd) { bd = d; nearest = i; } }); }
  g.wells.forEach((w, i) => {
    const a = w.a;
    const act = i === p.lat, near = i === nearest;
    const pul = w.pulse;
    ctx.globalCompositeOperation = 'lighter';
    G(w.h, w.x, w.y, w.r * 9 + pul * 40, (0.32 + pul * 0.3 + (act ? 0.2 : 0)) * a, 90, 50);
    G(w.h, w.x, w.y, w.r * 3.4, 0.9 * a, 90, 60);
    // orbit band
    ctx.globalAlpha = (act ? 0.5 : near ? 0.35 : 0.14) * a;
    ctx.strokeStyle = `hsl(${w.h},100%,75%)`; ctx.lineWidth = act ? 2.5 : 1.5;
    ctx.setLineDash([6, 14]); ctx.lineDashOffset = -w.spin * 40;
    ctx.beginPath(); ctx.arc(w.x, w.y, Math.max(w.R * 0.62, w.r + 26), 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    // corona rays
    for (let k = 0; k < 6; k++) {
      const an = w.spin * (k % 2 ? 1 : -0.7) + k * TAU / 6;
      const len = w.r * (2.2 + Math.sin(t * 2 + k) * 0.5 + pul);
      ctx.globalAlpha = 0.35 * a;
      ctx.strokeStyle = `hsl(${w.h + 20},100%,70%)`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w.x + Math.cos(an) * w.r * 0.8, w.y + Math.sin(an) * w.r * 0.8); ctx.lineTo(w.x + Math.cos(an) * len, w.y + Math.sin(an) * len); ctx.stroke();
    }
    // core
    ctx.globalCompositeOperation = 'source-over';
    const gr = ctx.createRadialGradient(w.x - w.r * 0.3, w.y - w.r * 0.3, 0, w.x, w.y, w.r);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, `hsl(${w.h},100%,80%)`); gr.addColorStop(1, `hsl(${w.h},100%,${w.ign > 0 ? 65 : 45}%)`);
    ctx.globalAlpha = a; ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r * (1 + pul * 0.15), 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    G(0, w.x, w.y, w.r * 1.6, 0.6 * a, 0, 90);
    if (w.ign > 0) { ctx.globalAlpha = Math.min(1, w.ign / 2) * 0.6; ctx.strokeStyle = `hsl(${w.h},100%,80%)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 1.7 + Math.sin(t * 6) * 2, 0, TAU); ctx.stroke(); }
  });
  // target hint
  if (nearest >= 0 && !g.demo) {
    const w = g.wells[nearest];
    ctx.globalAlpha = 0.18 + 0.08 * Math.sin(t * 8);
    ctx.strokeStyle = `hsl(${w.h},100%,80%)`; ctx.lineWidth = 1.5; ctx.setLineDash([2, 10]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(w.x, w.y); ctx.stroke(); ctx.setLineDash([]);
  }

  // shards
  ctx.globalCompositeOperation = 'lighter';
  for (const s of g.shards) {
    const age = g.t - s.born, sc = Math.min(1, age * 3);
    const h = s.gold ? 45 : s.h, sz = (s.gold ? 11 : 8.5) * sc;
    G(h, s.x, s.y, sz * 5.5, 0.75 * sc, 100, s.gold ? 60 : 55);
    ctx.globalAlpha = 1;
    ctx.fillStyle = s.gold ? '#fff3c0' : `hsl(${h},100%,82%)`;
    const c = Math.cos(s.rot), si = Math.sin(s.rot);
    ctx.beginPath();
    ctx.moveTo(s.x + c * sz * 1.5, s.y + si * sz * 1.5);
    ctx.lineTo(s.x - si * sz * 0.7, s.y + c * sz * 0.7);
    ctx.lineTo(s.x - c * sz * 1.5, s.y - si * sz * 1.5);
    ctx.lineTo(s.x + si * sz * 0.7, s.y - c * sz * 0.7);
    ctx.closePath(); ctx.fill();
    if (age < 0.4) G(h, s.x, s.y, 40 * (1 - age / 0.4) + 10, 1 - age / 0.4);
  }
  // prism comet
  if (g.prism) {
    const pr = g.prism;
    for (let k = 0; k < 6; k++) G((t * 400 + k * 60) % 360, pr.x - pr.vx * k * 9, pr.y, 40 - k * 4, 0.6);
    G(0, pr.x, pr.y, 22, 1, 0, 95);
    ctx.globalAlpha = 0.7; ctx.strokeStyle = `hsl(${(t * 400) % 360},100%,75%)`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pr.x, pr.y, 34 + Math.sin(t * 10) * 4, 0, TAU); ctx.stroke();
  }

  // trail
  const tr = g.trail;
  if (tr.length > 1) {
    ctx.lineCap = 'round';
    const n = tr.length;
    const storm = g.storm > 0;
    const M = 30, ZERO = [[0, 0]];
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < n; i++) {
        const a = tr[i - 1], b = tr[i];
        if (b.b) continue;
        const inside = a.x > M && a.x < W - M && a.y > M && a.y < H - M && b.x > M && b.x < W - M && b.y > M && b.y < H - M;
        const offs = inside ? ZERO : ghostOffsets(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y), M);
        for (const [ox, oy] of offs) {
        const age = (g.t - b.t) / 3.4;
        const u = i / n;
        const k = Math.max(0, 1 - age);
        const h = storm ? (u * 360 + g.t * 200) % 360 : themeHue(u, g.t);
        ctx.globalAlpha = pass ? k : k * 0.22;
        ctx.strokeStyle = pass ? `hsl(${h},100%,${60 + 25 * u}%)` : `hsl(${h},100%,55%)`;
        ctx.lineWidth = pass ? 1 + 4 * k * u + 1.5 : 6 + 16 * k * u;
        ctx.beginPath(); ctx.moveTo(a.x + ox, a.y + oy); ctx.lineTo(b.x + ox, b.y + oy); ctx.stroke();
        }
      }
    }
  }
  // tether
  if (p.lat >= 0 && !g.dead) {
    const w = g.wells[p.lat];
    const h = themeHue(1, g.t);
    ctx.globalAlpha = 0.25; ctx.strokeStyle = `hsl(${w.h},100%,70%)`; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = `hsl(${h},100%,88%)`; ctx.lineWidth = 1.5 + Math.random();
    ctx.beginPath(); ctx.moveTo(w.x, w.y);
    const segs = 7;
    for (let k = 1; k < segs; k++) { const u = k / segs; ctx.lineTo(lerp(w.x, p.x, u) + rand(-4, 4), lerp(w.y, p.y, u) + rand(-4, 4)); }
    ctx.lineTo(p.x, p.y); ctx.stroke();
  }

  // mites
  for (const m of g.mites) {
    const age = g.t - m.born, sc = Math.min(1, age / 0.8);
    ctx.globalCompositeOperation = 'lighter';
    G(300, m.x, m.y, 50 * sc, 0.55, 100, 45);
    G(340, m.x, m.y, 26 * sc, 0.6, 100, 50);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = sc;
    ctx.fillStyle = '#07000c';
    ctx.beginPath();
    const spikes = 9;
    for (let k = 0; k <= spikes * 2; k++) {
      const an = k / (spikes * 2) * TAU + m.ph * 0.5;
      const r = (k % 2 ? 7 : 15 + Math.sin(m.ph * 2 + k) * 3) * sc;
      const x = m.x + Math.cos(an) * r, y = m.y + Math.sin(an) * r;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.fill();
    ctx.strokeStyle = `hsla(320,100%,70%,${sc})`; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    G(0, m.x + Math.cos(m.ph) * 2, m.y + Math.sin(m.ph) * 2, 5, 0.9, 100, 60);
  }

  // player comet
  if (!g.dead) {
    ctx.globalCompositeOperation = 'lighter';
    const h = g.storm > 0 ? (g.t * 300) % 360 : themeHue(1, g.t);
    const blink = p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0;
    if (!blink) for (const [ox, oy] of ghostOffsets(p.x, p.x, p.y, p.y, 130)) {
      const x = p.x + ox, y = p.y + oy;
      G(h, x, y, 70 + p.boost * 50, 0.45);
      G(h, x, y, 26, 0.95);
      G(0, x, y, 12, 1, 0, 100);
      // forward flare
      ctx.globalAlpha = 0.6; ctx.strokeStyle = `hsl(${h},100%,90%)`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - p.vx * 30, y - p.vy * 30); ctx.lineTo(x + p.vx * 14, y + p.vy * 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - p.vy * 16, y + p.vx * 16); ctx.lineTo(x + p.vy * 16, y - p.vx * 16); ctx.globalAlpha = 0.3; ctx.stroke();
    }
  }

  // particles
  ctx.globalCompositeOperation = 'lighter';
  const drawPart = (q, x, y, k) => {
    if (q.streak) {
      ctx.globalAlpha = k; ctx.strokeStyle = `hsl(${q.h},${q.s}%,${q.l + 15}%)`; ctx.lineWidth = q.size * 0.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - q.vx * 0.04, y - q.vy * 0.04); ctx.stroke();
    } else G(q.h, x, y, q.size * 3 * (0.4 + k * 0.6), k, q.s, q.l);
  };
  for (const q of fx.parts) {
    const k = q.life / q.max;
    if (q.x > 30 && q.x < W - 30 && q.y > 30 && q.y < H - 30) drawPart(q, q.x, q.y, k);
    else for (const [ox, oy] of ghostOffsets(q.x, q.x, q.y, q.y, 30)) drawPart(q, q.x + ox, q.y + oy, k);
  }
  for (const r of fx.rings) {
    const k = r.life / r.max;
    ctx.globalAlpha = k; ctx.strokeStyle = `hsl(${r.h},100%,${60 + 30 * k}%)`; ctx.lineWidth = r.w * k + 0.5;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
  }
  // floating texts
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const tx of fx.texts) {
    const k = tx.life / tx.max;
    const pop = tx.pop < 0.12 ? 0.6 + tx.pop / 0.12 * 0.6 : 1.2 - Math.min(0.2, (tx.pop - 0.12) * 1.5);
    ctx.globalAlpha = Math.min(1, k * 2.5);
    ctx.font = `${Math.round(tx.size * pop)}px ArchivoB, sans-serif`;
    ctx.shadowColor = tx.white ? '#fff' : `hsl(${tx.h},100%,60%)`; ctx.shadowBlur = 18;
    ctx.fillStyle = tx.white ? `hsl(${(t * 300) % 360},100%,85%)` : `hsl(${tx.h},100%,85%)`;
    ctx.fillText(tx.s, tx.x, tx.y);
  }
  ctx.shadowBlur = 0;
}

function drawOverlay(g, now) {
  const t = now / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1; ctx.drawImage(vignette, 0, 0, PW, PH);
  if (g && g.lifeFx > 0 && state === 'play' && !g.dead) {
    ctx.globalAlpha = g.lifeFx * 0.6;
    ctx.drawImage(glow(350, 100, 30), -PW * 0.25, -PH * 0.25, PW * 1.5, PH * 1.5);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (screenFlash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, screenFlash) * 0.35;
    ctx.fillStyle = `hsl(${screenFlashH},100%,60%)`; ctx.fillRect(0, 0, PW, PH);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.setTransform(SC, 0, 0, SC, 0, 0);
  if (state === 'title') drawTitle(t);
  else if (g) {
    if (state === 'play' || state === 'pause') drawHud(g, t);
    if (state === 'pause') drawPause(t);
    if (state === 'over') drawOver(g, t);
  }
  drawToasts(t);
}

function glowText(s, x, y, size, font, fill, glowCol, blur = 20, align = 'center') {
  ctx.font = `${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.shadowColor = glowCol; ctx.shadowBlur = blur; ctx.fillStyle = fill;
  ctx.fillText(s, x, y); ctx.shadowBlur = 0;
}

function drawHud(g, t) {
  ctx.globalAlpha = 1;
  g.shown += (g.score - g.shown) * 0.2; if (Math.abs(g.score - g.shown) < 1) g.shown = g.score;
  const hue = themeHue(1, t);
  glowText(fmt(g.shown), 40, 58, 52, 'ArchivoB, sans-serif', '#fff', `hsl(${hue},100%,60%)`, 22, 'left');
  glowText('BEST ' + fmt(Math.max(save.best, g.score)), 42, 100, 19, 'AntonF, sans-serif', 'rgba(255,255,255,0.6)', 'transparent', 0, 'left');
  // lives
  const by = 34, bw = 480, bx = W / 2 - bw / 2;
  for (let i = 0; i < START_LIVES; i++) {
    const x = W / 2 + (i - (START_LIVES - 1) / 2) * 64, y = by + 10;
    const alive = i < g.lives;
    const justLost = i === g.lives && g.lifeFx > 0;
    ctx.globalCompositeOperation = 'lighter';
    if (alive) {
      const bob = Math.sin(t * 3 + i) * 2;
      G(hue, x, y + bob, 46, 0.65); G(hue, x, y + bob, 20, 1); G(0, x, y + bob, 10, 1, 0, 100);
    } else if (justLost) {
      const k = g.lifeFx;
      G(340, x, y, 34 + (1 - k) * 60, k); 
    }
    ctx.globalCompositeOperation = 'source-over';
    if (!alive) { ctx.globalAlpha = 0.35; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  if (g.storm > 0) { ctx.globalAlpha = 0.9; glowText('PRISM STORM  ' + g.storm.toFixed(1), W / 2, by + 36, 17, 'AntonF, sans-serif', `hsl(${(t * 300) % 360},100%,80%)`, 'transparent', 0); }
  // sector progress
  const s0 = g.sector === 0 ? 0 : sectorNeed(g.sector), s1 = sectorNeed(g.sector + 1);
  const sp = clamp((g.score - s0) / (s1 - s0), 0, 1);
  ctx.globalAlpha = 0.4; ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(bx + 60, by + 58, bw - 120, 3);
  ctx.globalAlpha = 0.9; ctx.fillStyle = `hsl(${SECTORS[g.sector % SECTORS.length].hues[0]},100%,70%)`; ctx.fillRect(bx + 60, by + 58, (bw - 120) * sp, 3);
  // multiplier
  ctx.globalAlpha = 1;
  const mx = W - 50;
  if (g.mult > 1) {
    const pulse = 1 + Math.max(0, g.chainT - 3.3) * 1.2;
    glowText('x' + g.mult, mx, 60, Math.round(56 * pulse), 'ArchivoB, sans-serif', `hsl(${45 + g.mult * 12},100%,75%)`, `hsl(${45 + g.mult * 12},100%,55%)`, 24, 'right');
    ctx.strokeStyle = `hsl(${45 + g.mult * 12},100%,70%)`; ctx.lineWidth = 4; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(mx - 120 - g.mult.toString().length * 18, 60, 16, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(g.chainT / 3.6, 0, 1)); ctx.stroke();
  }
  ctx.globalAlpha = 0.65;
  glowText(`SECTOR ${g.sector + 1} · ${SECTORS[g.sector % SECTORS.length].name}`, mx, 104, 17, 'AntonF, sans-serif', '#fff', 'transparent', 0, 'right');
  // pause button (touch)
  ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff';
  ctx.fillRect(W - 66, H - 70, 9, 30); ctx.fillRect(W - 50, H - 70, 9, 30);
  // banner
  if (g.banner) {
    const b = g.banner, k = b.t < 0.4 ? ease(b.t / 0.4) : b.t > 2.6 ? 1 - (b.t - 2.6) / 0.6 : 1;
    ctx.globalAlpha = clamp(k, 0, 1);
    const hh = SECTORS[g.sector % SECTORS.length].hues[0];
    glowText(b.s, W / 2, H / 2 - 40, Math.round(90 + (1 - k) * 40), 'ArchivoB, sans-serif', '#fff', `hsl(${hh},100%,60%)`, 40);
    glowText(b.sub, W / 2, H / 2 + 30, 30, 'AntonF, sans-serif', `hsl(${hh},100%,80%)`, `hsl(${hh},100%,50%)`, 14);
  }
  // tutorial
  const tips = ['HOLD  A  (or touch) to grab the nearest star and orbit it', 'RELEASE to fling off.  Orbiting builds speed', 'Cross your own trail to CLOSE A LOOP.  Everything inside is captured!', 'You have 3 LIVES.  Loop the dark VOID MITES to destroy them.  Each one that hits you costs a life!'];
  if (g.tutPhase < 4 && !g.dead) {
    const tip = tips[g.tutPhase];
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 4);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(W / 2 - 520, H - 112, 1040, 56, 28); ctx.fill();
    ctx.globalAlpha = 1;
    glowText(tip, W / 2, H - 84, 24, 'AntonF, sans-serif', '#fff', `hsl(${hue},100%,60%)`, 12);
  }
  ctx.globalAlpha = 1;
}

function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function drawLogo(t, y, size) {
  const word = 'STARLOOP';
  ctx.font = `${size}px ArchivoB, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const widths = [...word].map(c => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + (word.length - 1) * size * 0.04;
  let x = W / 2 - total / 2;
  [...word].forEach((c, i) => {
    const h = themeHue(i / 7, t * 0.5);
    const bob = Math.sin(t * 2 + i * 0.5) * size * 0.04;
    ctx.shadowColor = `hsl(${h},100%,55%)`; ctx.shadowBlur = 40;
    ctx.fillStyle = `hsl(${h},100%,88%)`;
    ctx.fillText(c, x, y + bob);
    ctx.shadowBlur = 0;
    x += widths[i] + size * 0.04;
  });
  // orbit swoosh around the double O
  ctx.globalCompositeOperation = 'lighter';
  const cx = W / 2 + total * 0.22, cy = y;
  ctx.strokeStyle = `hsl(${themeHue(1, t)},100%,75%)`; ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.ellipse(cx, cy, size * 1.25, size * 0.42, -0.15, t % TAU, t % TAU + 4.6); ctx.stroke();
  const a = t % TAU + 4.6;
  const ex = cx + Math.cos(a) * size * 1.25 * Math.cos(-0.15) - Math.sin(a) * size * 0.42 * Math.sin(-0.15);
  const ey = cy + Math.cos(a) * size * 1.25 * Math.sin(-0.15) + Math.sin(a) * size * 0.42 * Math.cos(-0.15);
  G(themeHue(1, t), ex, ey, 30, 1); G(0, ex, ey, 10, 1, 0, 100);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}

function drawTitle(t) {
  const k = ease(stateT / 0.8);
  ctx.globalAlpha = 0.45 * k; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = k;
  drawLogo(t, H * 0.3, 140);
  glowText('HOLD TO ORBIT  ·  RELEASE TO FLING  ·  CLOSE THE LOOP', W / 2, H * 0.3 + 110, 24, 'AntonF, sans-serif', 'rgba(255,255,255,0.85)', 'transparent', 0);
  ctx.globalAlpha = k * (0.6 + 0.4 * Math.sin(t * 4));
  glowText('PRESS  A  TO FLY', W / 2, H * 0.56, 40, 'ArchivoB, sans-serif', '#fff', `hsl(${themeHue(1, t)},100%,60%)`, 25);
  ctx.globalAlpha = k;
  glowText('BEST  ' + fmt(save.best), W / 2, H * 0.56 + 56, 24, 'AntonF, sans-serif', 'rgba(255,255,255,0.75)', 'transparent', 0);
  // missions
  panelMissions(50, H - 240, k);
  // rank + theme
  const th = THEMES[save.theme], locked = th.rank > rank();
  ctx.globalAlpha = k;
  glowText(`RANK ${rank()}`, W - 50, H - 200, 34, 'ArchivoB, sans-serif', '#fff', `hsl(${themeHue(1, t)},100%,60%)`, 16, 'right');
  glowText('TRAIL', W - 50, H - 150, 17, 'AntonF, sans-serif', 'rgba(255,255,255,0.6)', 'transparent', 0, 'right');
  // swatch
  const sw = 220, sx = W - 50 - sw, sy = H - 118;
  for (let i = 0; i < 40; i++) {
    const u = i / 39; ctx.fillStyle = `hsl(${th.cycle ? u * 300 : lerp(th.h0, th.h1, u)},100%,${locked ? 25 : 62}%)`;
    ctx.fillRect(sx + u * (sw - 6), sy, 7, 10);
  }
  glowText(`◀  ${th.name}  ▶`, W - 50 - sw / 2, sy + 40, 26, 'ArchivoB, sans-serif', locked ? 'rgba(255,255,255,0.35)' : '#fff', 'transparent', 0, 'center');
  if (locked) glowText(`UNLOCKS AT RANK ${th.rank}`, W - 50 - sw / 2, sy + 72, 16, 'AntonF, sans-serif', 'hsl(350,100%,75%)', 'transparent', 0, 'center');
  ctx.globalAlpha = 0.65 * k;
  glowText(`D-PAD: TRAIL   ·   SELECT: MUSIC ${save.music ? 'ON' : 'OFF'}   ·   B: EXIT`, W / 2, H - 36, 19, 'AntonF, sans-serif', '#fff', 'transparent', 0);
  ctx.globalAlpha = 1;
}

function panelMissions(x, y, k, stats) {
  ctx.globalAlpha = 0.5 * k; ctx.fillStyle = 'rgba(5,5,20,0.7)'; roundRect(x - 20, y - 30, 560, 200, 18); ctx.fill();
  ctx.globalAlpha = k;
  glowText('MISSIONS', x, y, 20, 'ArchivoB, sans-serif', 'rgba(255,255,255,0.9)', 'transparent', 0, 'left');
  save.missions.forEach((m, i) => {
    const yy = y + 44 + i * 44;
    ctx.globalAlpha = k; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + 10, yy, 9, 0, TAU); ctx.stroke();
    glowText(MTYPES[m.type].text(m.n), x + 34, yy, 21, 'AntonF, sans-serif', '#fff', 'transparent', 0, 'left');
    if (stats) {
      const v = Math.min(stats[MTYPES[m.type].stat] || 0, m.n);
      glowText(`${fmt(v)}/${fmt(m.n)}`, x + 520, yy, 17, 'AntonF, sans-serif', 'rgba(255,255,255,0.5)', 'transparent', 0, 'right');
    }
  });
  ctx.globalAlpha = 1;
}

function drawPause(t) {
  ctx.globalAlpha = 0.6; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  glowText('PAUSED', W / 2, H * 0.3, 90, 'ArchivoB, sans-serif', '#fff', `hsl(${themeHue(1, t)},100%,60%)`, 30);
  glowText('A: RESUME      B: QUIT TO TITLE', W / 2, H * 0.3 + 80, 24, 'AntonF, sans-serif', 'rgba(255,255,255,0.8)', 'transparent', 0);
  glowText(`SELECT: MUSIC ${save.music ? 'ON' : 'OFF'}`, W / 2, H * 0.3 + 130, 22, 'ArchivoB, sans-serif', save.music ? `hsl(${themeHue(1, t)},100%,80%)` : 'rgba(255,255,255,0.5)', 'transparent', 0);
  panelMissions(W / 2 - 260, H * 0.62, 1, game && game.stats);
}

function drawOver(g, t) {
  const k = ease(stateT / 0.6);
  ctx.globalAlpha = 0.55 * k; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = k;
  glowText('GAME OVER', W / 2, H * 0.16, 44, 'AntonF, sans-serif', 'rgba(255,255,255,0.8)', 'transparent', 0);
  const shownScore = g.score * ease(stateT / 1.2);
  glowText(fmt(shownScore), W / 2, H * 0.3, 120, 'ArchivoB, sans-serif', '#fff', `hsl(${themeHue(1, t)},100%,60%)`, 40);
  if (g.newBest && stateT > 1.2) {
    ctx.globalAlpha = k * (0.7 + 0.3 * Math.sin(t * 8));
    glowText('NEW BEST!', W / 2, H * 0.3 + 86, 36, 'ArchivoB, sans-serif', `hsl(${(t * 200) % 360},100%,80%)`, `hsl(${(t * 200) % 360},100%,55%)`, 20);
  } else {
    ctx.globalAlpha = k * 0.7;
    glowText('BEST  ' + fmt(save.best), W / 2, H * 0.3 + 86, 26, 'AntonF, sans-serif', '#fff', 'transparent', 0);
  }
  ctx.globalAlpha = k;
  const st = g.stats;
  const cols = [['SECTOR', g.sector + 1], ['LOOPS', st.loops], ['BIGGEST LOOP', st.maxLoop], ['TOP MULT', 'x' + Math.max(1, st.maxMult)], ['MITES', st.mites]];
  cols.forEach((c, i) => {
    const x = W / 2 + (i - 2) * 190;
    glowText(String(c[1]), x, H * 0.49, 38, 'ArchivoB, sans-serif', '#fff', 'transparent', 0);
    glowText(c[0], x, H * 0.49 + 36, 16, 'AntonF, sans-serif', 'rgba(255,255,255,0.55)', 'transparent', 0);
  });
  if (g.completed.length) {
    glowText(`★ ${g.completed.length} MISSION${g.completed.length > 1 ? 'S' : ''} COMPLETE`, W / 2, H * 0.62, 22, 'ArchivoB, sans-serif', 'hsl(140,100%,75%)', 'hsl(140,100%,50%)', 12);
  }
  panelMissions(W / 2 - 260, H * 0.7, k, st);
  if (stateT > 1.0) {
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
    glowText('A: FLY AGAIN      B: TITLE', W / 2, H - 34, 24, 'ArchivoB, sans-serif', '#fff', `hsl(${themeHue(1, t)},100%,60%)`, 14);
  }
  ctx.globalAlpha = 1;
}

function drawToasts(t) {
  const q = fx.toasts[0];
  if (!q) return;
  const k = q.t < 0.3 ? ease(q.t / 0.3) : q.t > 2.6 ? 1 - (q.t - 2.6) / 0.4 : 1;
  const y = (state === 'over' ? 64 : 150) + (1 - k) * -60;
  ctx.globalAlpha = clamp(k, 0, 1) * 0.8;
  ctx.fillStyle = 'rgba(5,10,20,0.8)'; roundRect(W / 2 - 330, y - 34, 660, 80, 40); ctx.fill();
  ctx.strokeStyle = `hsl(${q.h},100%,65%)`; ctx.lineWidth = 2; ctx.stroke();
  ctx.globalAlpha = clamp(k, 0, 1);
  glowText(q.s, W / 2, y - 8, 26, 'ArchivoB, sans-serif', `hsl(${q.h},100%,80%)`, `hsl(${q.h},100%,55%)`, 14);
  glowText(q.sub, W / 2, y + 24, 18, 'AntonF, sans-serif', '#fff', 'transparent', 0);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- main loop
let lastT = performance.now();
function frame(now) {
  let dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  stateT += dt;
  shake *= Math.exp(-dt * 9); if (shake < 0.1) shake = 0;
  zoomK *= Math.exp(-dt * 6);
  screenFlash = Math.max(0, screenFlash - dt * 1.8);
  if (nebulaB) { nebulaMix += dt / 2.5; if (nebulaMix >= 1) { nebulaA = nebulaB; nebulaB = null; nebulaMix = 1; } }
  const g = state === 'title' ? attract : game;
  if (g) {
    let sdt = dt;
    if (hitstop > 0) { hitstop -= dt; sdt = 0; }
    if (g.dead) { slowmo = Math.min(1, slowmo + dt * 0.5); sdt *= slowmo; if (g.deadT > 1.4 && state === 'play') setState('over'); }
    if (state === 'play' || state === 'title' || state === 'over') {
      for (let k = 0; k < SPEED; k++) { if (sdt > 0) updateWorld(g, sdt, state === 'play'); updateFx(sdt, g); }
    }
  }
  render(g, now);
  drawOverlay(g, now);
  requestAnimationFrame(frame);
}

addEventListener('resize', resize);
resize();
attract = newWorld(true);
if (Q.has('autostart') || DEMO) startRun(); else setState('title');
requestAnimationFrame(frame);
window.__starloop = { get game() { return game; }, get state() { return state; }, startRun, get W() { return W; }, get H() { return H; } };
})();
