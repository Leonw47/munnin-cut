// Receitas dos efeitos sonoros (ids em src/shared/sfx.js). Cada uma devolve um sinal mono
// (Float32Array) ou estéreo ([L, R]). `level` opcional: pico final (padrão 0,89 ≈ −1 dBFS).
import {
  SR, N, rng, zeros, osc, fm, noise, lfsr, env, perc, mul, add, mixAt, reverse, pad, biquad, lp, hp, bp,
  drive, crush, echo, reverb, pluck, partials, note,
} from './dsp.mjs';

const TAU = Math.PI * 2;
/** envelope a partir de uma função u (0..1) → amplitude */
function shape(d, f) { const n = N(d), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = f(i / (n - 1 || 1), i / SR); return o; }
const bell01 = (sh = 0.5, pa = 2, pb = 1.6) => (u) => (u < sh ? (u / sh) ** pa : ((1 - u) / (1 - sh)) ** pb);
const expGlide = (f0, f1, d) => (t) => f0 * (f1 / f0) ** Math.min(1, t / d);
const stereo = (fnL) => [fnL(1), fnL(2)];

// ---------- peças reaproveitadas ----------
function whooshCore(d, { f = [250, 1800, 400], q = 1.3, seed = 1, color = 'pink', sh = 0.55, gain = 1 } = {}) {
  const [fa, fb, fc] = f, tp = d * sh;
  const center = (t) => (t < tp ? fa * (fb / fa) ** (t / tp) : fb * (fc / fb) ** ((t - tp) / (d - tp)));
  const n = noise(d, color, seed);
  const s = bp(bp(n, center, q), center, q);
  return mul(mul(s, shape(d, bell01(sh, 2.2, 1.7))), gain);
}
function kickS(d = 0.6, f0 = 150, f1 = 46) {
  const body = mul(osc(d, (t) => f1 + (f0 - f1) * Math.exp(-t / 0.045)), perc(d, 0.001, 0.22));
  const click = mul(hp(noise(0.01, 'white', 3), 2500), perc(0.01, 0.0005, 0.002));
  return add(body, mul(click, 0.4));
}
function snareS(d = 0.35, seed = 4) {
  const tone = mul(add(osc(d, 185), mul(osc(d, 330), 0.5)), perc(d, 0.001, 0.05));
  const nz = mul(bp(hp(noise(d, 'white', seed), 1200), 4500, 0.6), perc(d, 0.001, 0.11));
  return add(mul(tone, 0.55), mul(nz, 1.4));
}
function cymbalS(d = 2.5, tau = 0.9, seed = 7, k = 1) {
  const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((x) => x * 2.1 * k);
  let metal = zeros(d);
  for (const f of fr) metal = add(metal, osc(d, f, 'square'));
  metal = hp(bp(metal, 9000, 0.6), 5200, 0.8);
  const nz = hp(noise(d, 'white', seed), 6500);
  return mul(add(mul(metal, 0.18), mul(nz, 0.5)), perc(d, 0.002, tau));
}
function clapS(seed = 1, gain = 1, center = 1150) {
  const d = 0.25, r = rng(seed);
  let s = zeros(d);
  const nz = bp(noise(d, 'white', seed), center * (0.9 + r() * 0.2), 1.1);
  for (const at of [0, 0.009 + r() * 0.004, 0.019 + r() * 0.004]) s = mixAt(s, mul(nz.slice(N(at)), perc(d, 0.0005, 0.0045)), at);
  s = mixAt(s, mul(nz.slice(N(0.028)), perc(d, 0.001, 0.07)), 0.028, 0.8);
  return mul(s, gain);
}
function bellFM(f, d = 2.5, { ratio = 3.5, idx = 3.2, tau = 0.9, idxTau = 0.5 } = {}) {
  return mul(fm(d, f, ratio, (t) => idx * Math.exp(-t / idxTau)), perc(d, 0.001, tau));
}
function chimeTube(f, d = 3, tau = 1.4) {
  return partials(f, d, [[1, 1, tau], [2.756, 0.5, tau * 0.6], [5.404, 0.25, tau * 0.35], [8.933, 0.12, tau * 0.2]]);
}
function marimba(f, d = 0.7) {
  return partials(f, d, [[1, 1, 0.25], [3.93, 0.25, 0.06], [9.2, 0.08, 0.02]], { attack: 0.001 });
}
function brass(f, d, { swell = 0.04, rel = 0.15, bright = 3.5, det = 0.004, vib = 0 } = {}) {
  const fq = (t) => f * (1 + (vib ? 0.012 * Math.sin(TAU * 5.2 * t) * Math.min(1, t / 0.3) : 0));
  const saw = add(osc(d, (t) => fq(t) * (1 + det), 'saw'), osc(d, (t) => fq(t) * (1 - det), 'saw'), mul(osc(d, (t) => fq(t) * 0.5, 'saw'), 0.3));
  const cut = (t) => f * (1 + bright * Math.min(1, t / swell)) * (t > d - rel ? Math.max(0.4, (d - t) / rel) : 1);
  const a = env(d, [[0, 0], [swell, 1], [Math.max(swell, d - rel), 0.85], [d, 0]]);
  return mul(lp(saw, cut, 0.9), a);
}
function sq8(d, freq, { duty = 0.5, a = 0.004, tau = 0, vol = 0.5 } = {}) {
  const e = tau ? perc(d, a, tau) : env(d, [[0, 0], [a, 1], [d - 0.01, 1], [d, 0]]);
  return mul(mul(osc(d, freq, 'pulse', { duty, naive: true }), e), vol);
}
function seq(notes, step, mk) { // notes: [freq|null, dur?]
  let s = zeros(0.01), t = 0;
  for (const nn of notes) {
    const [f, len = 1] = Array.isArray(nn) ? nn : [nn];
    if (f) s = mixAt(s, mk(f, step * len), t);
    t += step * len;
  }
  return s;
}
function chirp(d, f0, f1, seed = 1) { // passarinho: assobio com glissando e trinado
  const r = rng(seed), tr = 18 + r() * 22;
  const s = osc(d, (t) => (f0 + (f1 - f0) * (t / d)) * (1 + 0.04 * Math.sin(TAU * tr * t)));
  return mul(s, shape(d, bell01(0.3, 1.5, 1.2)));
}
function crackles(d, rate, seed, { min = 0.2, f = 3000 } = {}) {
  const r = rng(seed);
  let s = zeros(d);
  for (let t = 0; t < d; t += -Math.log(1 - r()) / rate) {
    const len = 0.002 + r() * 0.01;
    const c = mul(hp(noise(len, 'white', Math.floor(r() * 1e6)), f * (0.6 + r())), perc(len, 0.0003, len / 3));
    s = mixAt(s, c, t, min + r() * (1 - min));
  }
  return s;
}
function bubbleS(d, f0, f1, seed = 1) {
  const s = osc(d, (t) => f0 * (f1 / f0) ** Math.min(1, t / d));
  return mul(s, shape(d, (u) => Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.7 * (1 - u) ** 0.5));
}

export const RECIPES = {
  // ======================= Transições =======================
  whoosh: () => reverb(whooshCore(0.75, { f: [280, 2200, 500], seed: 11 }), { wet: 0.12, tail: 0.5 }),
  whooshLow: () => {
    const w = whooshCore(1.0, { f: [90, 700, 150], q: 1.1, seed: 12, color: 'brown', sh: 0.5 });
    const sub = mul(osc(1.0, expGlide(70, 45, 1)), shape(1.0, bell01(0.5, 2, 2)));
    return reverb(add(w, mul(sub, 0.25)), { wet: 0.15, tail: 0.6 });
  },
  whooshFast: () => whooshCore(0.32, { f: [600, 4200, 900], q: 1.6, seed: 13, sh: 0.45 }),
  swooshDouble: () => {
    const a = whooshCore(0.36, { f: [500, 3600, 800], seed: 14, sh: 0.5 });
    const b = whooshCore(0.42, { f: [400, 3000, 600], seed: 15, sh: 0.5 });
    return reverb(mixAt(a, b, 0.26, 0.9), { wet: 0.1, tail: 0.4 });
  },
  swipe: () => mul(hp(whooshCore(0.22, { f: [1500, 7000, 5000], q: 0.9, seed: 16, color: 'white', sh: 0.6 }), 900), 0.8),
  riser: () => {
    const d = 2.2;
    const nz = mul(bp(noise(d, 'pink', 21), expGlide(250, 9000, d), 1.4), shape(d, (u) => u ** 1.6));
    const tone = mul(lp(add(osc(d, expGlide(110, 440, d), 'saw'), osc(d, expGlide(111.5, 446, d), 'saw')), expGlide(300, 5000, d)), shape(d, (u) => u ** 2.2 * (0.6 + 0.4 * Math.sin(TAU * (3 + 14 * u) * u * 2.2) ** 2)));
    return reverb(fadeOutSoft(add(nz, mul(tone, 0.35)), 0.03), { wet: 0.2, tail: 0.8 });
  },
  riserLong: () => {
    const d = 4.2;
    const nz = mul(bp(noise(d, 'pink', 22), expGlide(150, 11000, d), 1.2), shape(d, (u) => u ** 1.8));
    const tone = mul(lp(add(osc(d, expGlide(55, 440, d), 'saw'), osc(d, expGlide(55.6, 444, d), 'saw')), expGlide(200, 6000, d)), shape(d, (u) => u ** 2.4));
    return reverb(fadeOutSoft(add(nz, mul(tone, 0.3)), 0.03), { wet: 0.22, tail: 1 });
  },
  downlifter: () => {
    const d = 2.0;
    const nz = mul(bp(noise(d, 'pink', 23), expGlide(8000, 180, d), 1.3), perc(d, 0.005, 0.7));
    const sub = mul(osc(d, expGlide(160, 40, d)), perc(d, 0.005, 0.6));
    return reverb(add(nz, mul(sub, 0.5)), { wet: 0.25, tail: 1 });
  },
  reverseCymbal: () => fadeOutSoft(reverse(reverb(cymbalS(2.6, 0.8, 24), { wet: 0.25, tail: 0.6 })), 0.02),
  cineBoom: () => {
    const d = 3.2;
    const sub = mul(osc(d, (t) => 38 + 32 * Math.exp(-t / 0.25)), perc(d, 0.003, 0.9));
    const body = mul(lp(noise(d, 'brown', 31), expGlide(1600, 120, 1.2)), perc(d, 0.002, 0.35));
    const crack = mul(hp(noise(0.08, 'white', 32), 1500), perc(0.08, 0.0005, 0.015));
    return reverb(drive(add(mul(sub, 1.1), mul(body, 0.9), mul(crack, 0.4)), 1.6), { room: 0.9, wet: 0.3, tail: 2.2 });
  },
  braam: () => {
    const d = 3.0;
    let s = add(brass(note('A1'), d, { swell: 0.18, rel: 1.6, bright: 6, det: 0.006 }), brass(note('E2'), d, { swell: 0.18, rel: 1.6, bright: 5, det: 0.007 }), mul(brass(note('A2'), d, { swell: 0.2, rel: 1.6, bright: 4 }), 0.6));
    s = drive(mul(s, 1.4), 2.2);
    s = add(s, mul(osc(d, note('A1') / 2), env(d, [[0, 0], [0.15, 0.6], [d, 0]])));
    return reverb(s, { room: 0.92, wet: 0.35, tail: 2.5 });
  },
  glitch: () => {
    const r = rng(41), d = 0.7;
    let s = zeros(d);
    for (let t = 0; t < d - 0.03;) {
      const len = 0.015 + r() * 0.06, k = r();
      let seg;
      if (k < 0.35) seg = osc(len, 200 + r() * 3000, 'square');
      else if (k < 0.6) seg = crush(noise(len, 'white', Math.floor(r() * 999)), 3, 6 + Math.floor(r() * 20));
      else if (k < 0.8) seg = osc(len, expGlide(3000 * r() + 500, 80, len), 'saw');
      else seg = zeros(len);
      s = mixAt(s, mul(seg, 0.5 + r() * 0.5), t);
      t += len;
    }
    return mul(lp(s, 9000), env(d, [[0, 1], [d * 0.8, 1], [d, 0]]));
  },
  zap: () => {
    const d = 0.35;
    const s = fm(d, expGlide(2800, 120, d), 1.5, (t) => 6 * Math.exp(-t / 0.1));
    return reverb(mul(s, perc(d, 0.001, 0.12)), { wet: 0.15, tail: 0.3 });
  },

  // ======================= Interface =======================
  click: () => {
    const d = 0.05;
    const tick = mul(osc(d, 2400), perc(d, 0.0003, 0.006));
    const nz = mul(bp(noise(d, 'white', 51), 4000, 1.5), perc(d, 0.0002, 0.003));
    return add(tick, mul(nz, 0.8));
  },
  doubleClick: () => { const c = RECIPES.click(); return mixAt(c, c, 0.11, 0.9); },
  tap: () => {
    const d = 0.12;
    return add(mul(osc(d, (t) => 950 - 200 * Math.min(1, t / 0.03)), perc(d, 0.001, 0.025)), mul(bp(noise(d, 'white', 52), 2500, 2), perc(d, 0.0003, 0.004)));
  },
  pop: () => {
    const d = 0.14;
    return mul(osc(d, (t) => 260 + 900 * Math.exp(-t / 0.012)), perc(d, 0.001, 0.035));
  },
  bubble: () => {
    const d = 0.16;
    return reverb(mul(osc(d, (t) => 350 * (1 + 3 * (t / d) ** 0.7)), shape(d, (u) => Math.sin(Math.PI * u) ** 0.8)), { wet: 0.08, tail: 0.15 });
  },
  notify: () => {
    const a = bellFM(note('E6'), 0.9, { ratio: 2, idx: 1.2, tau: 0.25 });
    const b = bellFM(note('B6'), 1.2, { ratio: 2, idx: 1.2, tau: 0.4 });
    return reverb(mixAt(mul(a, 0.8), b, 0.13), { wet: 0.18, tail: 0.6 });
  },
  message: () => {
    let s = mul(marimba(note('C6'), 0.4), 0.8);
    s = mixAt(s, marimba(note('G6'), 0.6), 0.09);
    return reverb(s, { wet: 0.12, tail: 0.4 });
  },
  success: () => {
    let s = zeros(0.1);
    ['C5', 'E5', 'G5'].forEach((n, i) => { s = mixAt(s, marimba(note(n), 0.5), i * 0.085, 0.7); });
    s = mixAt(s, bellFM(note('C6'), 1.4, { ratio: 2, idx: 1, tau: 0.45 }), 0.255);
    return reverb(s, { wet: 0.2, tail: 0.6 });
  },
  error: () => {
    const one = (d) => mul(lp(add(osc(d, 150, 'square'), osc(d, 154, 'square')), 1400), env(d, [[0, 0], [0.005, 1], [d - 0.02, 1], [d, 0]]));
    return mixAt(one(0.13), one(0.2), 0.17);
  },
  beepBeep: () => { const b = mul(osc(0.11, 1000), env(0.11, [[0, 0], [0.005, 1], [0.1, 1], [0.11, 0]])); return mixAt(b, b, 0.17); },
  toggleOn: () => { let s = mul(osc(0.05, 1400), perc(0.05, 0.0005, 0.01)); return mixAt(s, mul(osc(0.06, 2100), perc(0.06, 0.0005, 0.012)), 0.06); },
  toggleOff: () => { let s = mul(osc(0.05, 2100), perc(0.05, 0.0005, 0.01)); return mixAt(s, mul(osc(0.06, 1400), perc(0.06, 0.0005, 0.012)), 0.06); },
  typing: () => {
    const r = rng(61);
    let s = zeros(1.4), t = 0.02;
    while (t < 1.3) {
      const len = 0.05, k = Math.floor(r() * 1e5);
      const key = add(mul(bp(noise(len, 'white', k), 2500 + r() * 2500, 2.5), perc(len, 0.0003, 0.008)), mul(osc(len, 180 + r() * 60), perc(len, 0.0005, 0.01)));
      s = mixAt(s, key, t, 0.6 + r() * 0.4);
      t += 0.07 + r() * 0.12 + (r() < 0.12 ? 0.2 : 0);
    }
    return reverb(s, { room: 0.4, wet: 0.08, tail: 0.2 });
  },
  typewriter: () => {
    const r = rng(62);
    let s = zeros(2.2), t = 0.02;
    for (let k = 0; k < 9; k++) {
      const len = 0.09, seed = Math.floor(r() * 1e5);
      const strike = add(mul(bp(noise(len, 'white', seed), 1800 + r() * 900, 3), perc(len, 0.0003, 0.012)), mul(osc(len, 120), perc(len, 0.0005, 0.02)), mul(bp(noise(len, 'white', seed + 1), 5000, 4), perc(len, 0.003, 0.006)));
      s = mixAt(s, strike, t, 0.7 + r() * 0.3);
      t += 0.11 + r() * 0.08;
    }
    s = mixAt(s, mul(chimeTube(note('A6'), 1.0, 0.45), 0.5), t + 0.05);
    return reverb(s, { room: 0.5, wet: 0.1, tail: 0.3 });
  },
  shutter: () => {
    const one = (seed, f) => add(mul(bp(noise(0.06, 'white', seed), f, 1.2), perc(0.06, 0.0003, 0.007)), mul(osc(0.06, f / 6), perc(0.06, 0.0005, 0.01)));
    let s = one(71, 3000);
    s = mixAt(s, mul(bp(noise(0.05, 'white', 72), 1200, 0.8), perc(0.05, 0.002, 0.012)), 0.02, 0.4);
    s = mixAt(s, one(73, 2200), 0.075, 0.8);
    return reverb(s, { room: 0.3, wet: 0.06, tail: 0.15 });
  },
  send: () => {
    const w = whooshCore(0.4, { f: [500, 4500, 3500], seed: 74, sh: 0.7 });
    return reverb(add(w, mul(osc(0.4, expGlide(500, 1600, 0.4)), shape(0.4, bell01(0.7, 2, 1)), 0.15)), { wet: 0.1, tail: 0.3 });
  },

  // ======================= Impactos =======================
  punch: () => {
    const d = 0.35;
    const body = mul(osc(d, (t) => 55 + 90 * Math.exp(-t / 0.03)), perc(d, 0.001, 0.08));
    const smack = mul(lp(noise(d, 'white', 81), 2600), perc(d, 0.0005, 0.02));
    return reverb(drive(add(body, mul(smack, 0.7)), 2.5), { room: 0.5, wet: 0.08, tail: 0.25 });
  },
  thud: () => {
    const d = 0.5;
    const body = mul(osc(d, (t) => 42 + 60 * Math.exp(-t / 0.04)), perc(d, 0.002, 0.12));
    const nz = mul(lp(noise(d, 'brown', 82), 500), perc(d, 0.001, 0.05));
    return add(body, mul(nz, 0.7));
  },
  metalHit: () => {
    const d = 2.2;
    let s = partials(410, d, [[1, 1, 0.9], [2.32, 0.7, 0.6], [3.98, 0.5, 0.4], [5.71, 0.35, 0.28], [8.4, 0.2, 0.15]], { attack: 0.0005, detune: 0.002 });
    s = add(s, mul(hp(noise(d, 'white', 83), 3000), perc(d, 0.0003, 0.01)));
    return reverb(s, { room: 0.7, wet: 0.2, tail: 1 });
  },
  explosion: () => {
    const d = 3.2;
    const crack = mul(noise(0.15, 'white', 91), perc(0.15, 0.0005, 0.03));
    const roar = mul(lp(noise(d, 'brown', 92), expGlide(3000, 120, 2.2)), perc(d, 0.004, 0.75));
    const sub = mul(osc(d, (t) => 35 + 40 * Math.exp(-t / 0.15)), perc(d, 0.003, 0.8));
    const debris = mul(crackles(d, 25, 93, { f: 1500 }), perc(d, 0.2, 0.5));
    return reverb(drive(add(mul(crack, 0.8), mul(roar, 1.3), sub, mul(debris, 0.25)), 1.8), { room: 0.88, wet: 0.25, tail: 2 });
  },
  farExplosion: () => {
    const s = lp(RECIPES.explosion(), 700);
    return reverb(mixAt(zeros(0.12), mul(s, 0.7), 0.12), { room: 0.95, wet: 0.5, tail: 3 });
  },
  subDrop: () => {
    const d = 2.0;
    return mul(osc(d, expGlide(95, 28, 1.6)), env(d, [[0, 0], [0.01, 1], [d, 0]], 2));
  },
  doorSlam: () => {
    const d = 0.8;
    const body = mul(osc(d, (t) => 70 + 50 * Math.exp(-t / 0.03)), perc(d, 0.001, 0.09));
    const wood = mul(bp(noise(d, 'white', 101), 320, 2), perc(d, 0.0008, 0.05));
    const rattle = mul(bp(noise(d, 'white', 102), 2200, 3), perc(d, 0.01, 0.06));
    return reverb(drive(add(body, mul(wood, 2.2), mul(rattle, 0.4)), 1.5), { room: 0.75, wet: 0.25, tail: 1 });
  },
  glass: () => {
    const r = rng(111), d = 1.4;
    let s = mul(hp(noise(0.2, 'white', 112), 2500), perc(0.2, 0.0003, 0.04));
    for (let k = 0; k < 70; k++) {
      const t = (r() ** 1.8) * 1.0, f = 2500 + r() * 7500, len = 0.06 + r() * 0.25;
      s = mixAt(s, mul(add(osc(len, f), mul(osc(len, f * 2.37), 0.4)), perc(len, 0.0003, 0.015 + r() * 0.05)), t, 0.12 + r() * 0.25);
    }
    s = add(s, mul(hp(noise(d, 'white', 113), 4000), perc(d, 0.001, 0.12), 0.4));
    return reverb(s, { room: 0.6, wet: 0.18, tail: 0.8 });
  },

  // ======================= Engraçados =======================
  boing: () => {
    const d = 0.9;
    const f = (t) => (170 + 200 * Math.min(1, t / 0.5)) * (1 + 0.28 * Math.sin(TAU * 13 * t) * Math.exp(-t / 0.35));
    const s = add(osc(d, f), mul(lp(osc(d, f, 'saw'), 1200), 0.3));
    return mul(s, perc(d, 0.003, 0.3));
  },
  sadTrombone: () => {
    const step = 0.42;
    let s = zeros(0.1);
    [['Bb3', 1], ['A3', 1], ['Ab3', 1], ['G3', 3.5]].reduce((t, [n, len], i) => {
      const d = step * len;
      s = mixAt(s, brass(note(n), d, { swell: 0.07, rel: 0.12, bright: 2.2, vib: i === 3 ? 1 : 0 }), t);
      return t + step * len;
    }, 0);
    return reverb(s, { room: 0.6, wet: 0.12, tail: 0.6 });
  },
  whistleUp: () => {
    const d = 0.9, f = (t) => 520 * (2400 / 520) ** (t / d) * (1 + 0.01 * Math.sin(TAU * 6 * t));
    return mul(add(osc(d, f), mul(bp(noise(d, 'white', 121), f, 8), 0.4)), shape(d, bell01(0.15, 1, 0.3)));
  },
  whistleDown: () => {
    const d = 0.9, f = (t) => 2400 * (480 / 2400) ** (t / d) * (1 + 0.01 * Math.sin(TAU * 6 * t));
    return mul(add(osc(d, f), mul(bp(noise(d, 'white', 122), f, 8), 0.4)), shape(d, bell01(0.1, 1, 0.4)));
  },
  rimshot: () => {
    const tom = (f0, f1) => mul(add(osc(0.4, expGlide(f0, f1, 0.15)), mul(bp(noise(0.4, 'white', 131), 900, 1), 0.2)), perc(0.4, 0.001, 0.12));
    let s = mixAt(tom(190, 140), tom(140, 100), 0.17);
    s = mixAt(s, kickS(0.5), 0.42, 0.7);
    s = mixAt(s, cymbalS(2.2, 0.55, 132), 0.42, 0.9);
    return reverb(s, { room: 0.6, wet: 0.12, tail: 0.5 });
  },
  honk: () => {
    const one = (d) => {
      const f = (t) => 330 * (1 + 0.04 * Math.exp(-t / 0.05));
      return mul(drive(bp(add(osc(d, f, 'square'), osc(d, (t) => f(t) * 1.5, 'square')), 900, 1.4), 2), env(d, [[0, 0], [0.01, 1], [d - 0.03, 1], [d, 0]]));
    };
    return reverb(mixAt(one(0.2), one(0.36), 0.28), { room: 0.4, wet: 0.08, tail: 0.3 });
  },
  cartoonPop: () => {
    const d = 0.18;
    return add(mul(osc(d, expGlide(300, 1800, 0.035)), perc(d, 0.0008, 0.04)), mul(bp(noise(d, 'white', 141), 1500, 1), perc(d, 0.0003, 0.004)));
  },
  bonk: () => {
    const d = 0.4;
    return reverb(add(mul(osc(d, (t) => 320 - 70 * Math.min(1, t / 0.08)), perc(d, 0.001, 0.07)), mul(osc(d, 760), perc(d, 0.001, 0.02), 0.5), mul(bp(noise(d, 'white', 142), 1800, 2), perc(d, 0.0003, 0.005))), { room: 0.3, wet: 0.1, tail: 0.2 });
  },
  crickets: () => stereo((ch) => {
    const d = 5, r = rng(150 + ch);
    let s = mul(lp(noise(d, 'pink', 151 + ch), 900), 0.02);
    const f = ch === 1 ? 4400 : 4750;
    for (let t = 0.1 + r() * 0.3; t < d - 0.3; t += 0.55 + r() * 0.35) {
      const pulses = 3 + Math.floor(r() * 2);
      for (let k = 0; k < pulses; k++) s = mixAt(s, mul(osc(0.022, f), shape(0.022, (u) => Math.sin(Math.PI * u))), t + k * 0.034, ch === 1 ? 0.5 : 0.35);
    }
    return s;
  }),
  dramatic: () => {
    const hit = (notes, d) => notes.reduce((acc, n) => add(acc, brass(note(n), d, { swell: 0.02, rel: Math.min(0.5, d * 0.6), bright: 4.5, det: 0.006 })), zeros(d));
    let s = hit(['G2', 'G3', 'D4', 'Bb3'], 0.3);
    s = mixAt(s, hit(['G2', 'G3', 'D4', 'Bb3'], 0.3), 0.42);
    s = mixAt(s, hit(['Eb2', 'Eb3', 'Bb3', 'G3'], 2.0), 0.9);
    s = mixAt(s, mul(add(osc(2.2, note('Eb1')), mul(lp(noise(2.2, 'brown', 161), 200), 0.5)), perc(2.2, 0.01, 0.7), 0.6), 0.9);
    return reverb(drive(s, 1.3), { room: 0.88, wet: 0.3, tail: 1.8 });
  },

  // ======================= Games 8-bit =======================
  coin: () => mixAt(sq8(0.08, note('B5'), { duty: 0.5 }), sq8(0.42, note('E6'), { duty: 0.5, tau: 0.13 }), 0.075),
  jump: () => sq8(0.22, (t) => 220 * (900 / 220) ** (t / 0.22), { duty: 0.25, tau: 0.12 }),
  powerUp: () => {
    const steps = ['C5', 'E5', 'G5', 'C6', 'D5', 'F#5', 'A5', 'D6', 'E5', 'G#5', 'B5', 'E6'].map(note);
    return seq(steps, 0.045, (f, d) => sq8(d, f, { duty: 0.25 }));
  },
  extraLife: () => seq(['C6', 'E6', 'G6', 'C7', 'G6', ['C7', 4]].map((n) => (Array.isArray(n) ? [note(n[0]), n[1]] : note(n))), 0.085, (f, d) => sq8(d, f, { duty: 0.5, tau: d > 0.2 ? 0.25 : 0 })),
  laser: () => sq8(0.25, (t) => 1900 * (180 / 1900) ** (t / 0.25), { duty: 0.5, tau: 0.1 }),
  shot8: () => mul(lfsr(0.28, (t) => 9000 * Math.exp(-t / 0.08) + 300, 3), perc(0.28, 0.001, 0.08), 0.5),
  boom8: () => mul(crush(lp(lfsr(1.1, (t) => 2500 * Math.exp(-t / 0.35) + 120, 5), 4000), 5, 2), perc(1.1, 0.001, 0.35), 0.6),
  hurt: () => mul(sq8(0.3, (t) => 600 * (110 / 600) ** (t / 0.3), { duty: 0.5 }), shape(0.3, (u) => (1 - u) * (0.6 + 0.4 * Math.sign(Math.sin(TAU * 20 * u * 0.3))))),
  gameOver: () => {
    let s = seq([note('G4'), note('F#4'), note('F4')], 0.3, (f, d) => add(sq8(d, f, { duty: 0.5, tau: 0.25 }), sq8(d, f / 2, { duty: 0.5, tau: 0.25, vol: 0.25 })));
    const d = 1.4, last = sq8(d, (t) => note('E4') * (1 + 0.015 * Math.sin(TAU * 6 * t)), { duty: 0.5, tau: 0.6 });
    s = mixAt(s, add(last, sq8(d, note('E3'), { duty: 0.5, tau: 0.6, vol: 0.25 })), 0.9);
    return s;
  },
  levelUp: () => {
    const mel = seq([note('C5'), note('E5'), note('G5'), note('C6'), null, [note('G5'), 1], [note('C6'), 5]], 0.09, (f, d) => sq8(d, f, { duty: 0.25, tau: d > 0.2 ? 0.35 : 0 }));
    const bass = seq([note('C3'), null, note('G3'), null, note('C4'), null, [note('C3'), 5]], 0.09, (f, d) => mul(osc(d, f, 'tri'), perc(d, 0.002, d > 0.2 ? 0.4 : 0.08), 0.5));
    return add(mel, bass);
  },
  blip: () => sq8(0.05, 1250, { duty: 0.5, tau: 0.03 }),
  pause8: () => mixAt(sq8(0.07, note('E6'), { duty: 0.5 }), sq8(0.12, note('B5'), { duty: 0.5, tau: 0.06 }), 0.08),

  // ======================= Magia e brilhos =======================
  sparkle: () => {
    const r = rng(171), scale = ['C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'D7', 'E7', 'G7'].map(note);
    let s = zeros(1.4);
    for (let k = 0; k < 26; k++) { const f = scale[Math.floor(r() * scale.length)]; s = mixAt(s, mul(add(osc(0.5, f), mul(osc(0.5, f * 2.01), 0.3)), perc(0.5, 0.001, 0.06 + r() * 0.08)), r() * 0.9, 0.2 + r() * 0.3); }
    return reverb(s, { room: 0.85, wet: 0.35, tail: 1.2 });
  },
  shimmer: () => {
    const d = 2.6, r = rng(172);
    let s = zeros(d);
    for (const n of ['E6', 'G#6', 'B6', 'E7', 'F#7']) {
      const f = note(n), rate = 4 + r() * 5;
      s = add(s, mul(osc(d, f * (1 + (r() - 0.5) * 0.004)), shape(d, (u, t) => (0.5 + 0.5 * Math.sin(TAU * rate * t + r() * 6)) * Math.sin(Math.PI * u) ** 1.5), 0.25));
    }
    return reverb(s, { room: 0.9, wet: 0.35, tail: 1.5 });
  },
  wand: () => {
    const notes = ['C6', 'E6', 'G6', 'B6', 'D7', 'E7', 'G7', 'B7'].map(note);
    let s = zeros(0.2);
    notes.forEach((f, i) => { s = mixAt(s, mul(add(osc(0.6, f), mul(osc(0.6, f * 3.01), 0.15)), perc(0.6, 0.001, 0.16)), i * 0.045, 0.45); });
    s = mixAt(s, mul(RECIPES.sparkle(), 0.5), 0.3);
    return reverb(s, { room: 0.88, wet: 0.3, tail: 1 });
  },
  fairy: () => {
    const r = rng(173), notes = ['G7', 'E7', 'D7', 'C7', 'A6', 'G6', 'E6', 'D6', 'C6'].map(note);
    let s = zeros(0.2);
    notes.forEach((f, i) => { s = mixAt(s, mul(osc(0.7, f * (1 + (r() - 0.5) * 0.003)), perc(0.7, 0.001, 0.2)), i * 0.07 + r() * 0.02, 0.4); });
    s = add(s, mul(hp(noise(1.2, 'white', 174), 7000), shape(1.2, bell01(0.3, 1, 2)), 0.05));
    return reverb(s, { room: 0.9, wet: 0.4, tail: 1.4 });
  },
  chimes: () => stereo((ch) => {
    const r = rng(180 + ch), tubes = ['C6', 'D6', 'E6', 'G6', 'A6', 'C7'].map(note);
    let s = zeros(4);
    for (let t = 0.02; t < 2.6; t += 0.08 + r() * 0.3) s = mixAt(s, chimeTube(tubes[Math.floor(r() * tubes.length)], 2.2, 1.1), t, 0.25 + r() * 0.3);
    return reverb(s, { room: 0.85, wet: 0.3, tail: 1.2 });
  }),
  harp: () => {
    const scale = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6'].map(note);
    let s = zeros(0.3);
    scale.forEach((f, i) => { s = mixAt(s, pluck(f, 2.2, { bright: 0.6, seed: 190 + i, decay: 0.9985 }), i * 0.055, 0.45); });
    return reverb(s, { room: 0.85, wet: 0.3, tail: 1.2 });
  },
  appear: () => reverb(add(whooshCore(0.9, { f: [300, 3500, 6000], seed: 201, sh: 0.6 }), mixAt(zeros(0.3), mul(RECIPES.shimmer().slice(0, N(1.6)), 0.6), 0.3)), { wet: 0.2, tail: 0.8 }),
  teleport: () => {
    const d = 0.9;
    const s = mul(fm(d, expGlide(200, 2400, d), 2.01, (t) => 3 + 4 * Math.sin(TAU * 9 * t) ** 2), shape(d, bell01(0.75, 1, 2)));
    return reverb(add(mul(s, 0.6), mixAt(zeros(0.5), mul(RECIPES.sparkle().slice(0, N(1.0)), 0.4), 0.5)), { room: 0.85, wet: 0.3, tail: 1 });
  },

  // ======================= Natureza (estéreo) =======================
  wind: () => stereo((ch) => {
    const d = 7, r = rng(210 + ch);
    const gust = lp(noise(d, 'white', 211 + ch), 0.6, 0.7);
    let g = 0; for (const v of gust) g = Math.max(g, Math.abs(v));
    const center = (t) => 450 + 500 * (gust[Math.min(gust.length - 1, Math.round(t * SR))] / g);
    const s = bp(noise(d, 'pink', 213 + ch), center, 1.6 + r());
    const amp = new Float32Array(s.length);
    for (let i = 0; i < amp.length; i++) amp[i] = 0.35 + 0.65 * Math.abs(gust[i] / g);
    return mul(mul(add(s, mul(lp(noise(d, 'brown', 215 + ch), 180), 0.5)), amp), shape(d, (u) => Math.min(1, u * 8, (1 - u) * 8)));
  }),
  rain: () => stereo((ch) => {
    const d = 7;
    const hiss = mul(hp(lp(noise(d, 'pink', 220 + ch), 9000), 700), 0.35);
    const drops = mul(crackles(d, 260, 222 + ch, { f: 2500, min: 0.1 }), 0.5);
    const big = mul(lp(crackles(d, 18, 224 + ch, { f: 600, min: 0.3 }), 2500), 0.6);
    return mul(add(hiss, drops, big), shape(d, (u) => Math.min(1, u * 10, (1 - u) * 10)));
  }),
  thunder: () => stereo((ch) => {
    const d = 6.5, r = rng(230 + ch);
    const crack = mul(hp(noise(0.35, 'white', 231 + ch), 600), perc(0.35, 0.002, 0.07));
    const rumbleAmp = lp(noise(d, 'white', 233), 3);
    let g = 0; for (const v of rumbleAmp) g = Math.max(g, Math.abs(v));
    const rumble = mul(lp(noise(d, 'brown', 235 + ch), expGlide(900, 140, 3)), perc(d, 0.15, 1.8));
    const am = new Float32Array(rumble.length);
    for (let i = 0; i < am.length; i++) am[i] = 0.5 + 0.5 * Math.abs(rumbleAmp[i] / g);
    return reverb(add(mul(crack, 0.6 + r() * 0.1), mul(mixAt(zeros(0.08), mul(rumble, am), 0.08), 1.6)), { room: 0.92, wet: 0.3, tail: 1.5 });
  }),
  waves: () => stereo((ch) => {
    const d = 9;
    const swell = (t) => { const p = ((t + (ch === 2 ? 0.4 : 0)) % 4.5) / 4.5; return p < 0.55 ? (p / 0.55) ** 2 : ((1 - p) / 0.45) ** 1.3; };
    const body = mul(lp(noise(d, 'pink', 240 + ch), (t) => 300 + 1600 * swell(t)), shape(d, (u, t) => 0.25 + 0.75 * swell(t)));
    const foam = mul(hp(noise(d, 'white', 242 + ch), 2500), shape(d, (u, t) => 0.1 * swell(t) ** 3));
    return mul(add(body, foam), shape(d, (u) => Math.min(1, u * 6, (1 - u) * 6)));
  }),
  fire: () => stereo((ch) => {
    const d = 7;
    const bed = mul(lp(noise(d, 'brown', 250 + ch), 350), 0.6);
    const hiss = mul(bp(noise(d, 'white', 252 + ch), 3000, 0.7), 0.04);
    const cr = mul(crackles(d, 14, 254 + ch, { f: 1800, min: 0.15 }), 0.9);
    return mul(add(bed, hiss, cr), shape(d, (u) => Math.min(1, u * 8, (1 - u) * 8)));
  }),
  birds: () => stereo((ch) => {
    const d = 6, r = rng(260 + ch);
    let s = mul(lp(noise(d, 'pink', 261 + ch), 600), 0.03);
    for (let t = 0.2 + r() * 0.5; t < d - 0.5;) {
      const n = 2 + Math.floor(r() * 5), f0 = 2600 + r() * 2500;
      for (let k = 0; k < n; k++) {
        const len = 0.04 + r() * 0.09;
        s = mixAt(s, chirp(len, f0 * (0.9 + r() * 0.3), f0 * (0.7 + r() * 0.7), Math.floor(r() * 1e4)), t, 0.25 + r() * 0.35);
        t += len + 0.02 + r() * 0.05;
      }
      t += 0.4 + r() * 1.1;
    }
    return reverb(s, { room: 0.6, wet: 0.15, tail: 0.6 });
  }),
  stream: () => stereo((ch) => {
    const d = 7, r = rng(270 + ch);
    let s = mul(bp(noise(d, 'pink', 271 + ch), 1200, 0.5), 0.15);
    for (let t = 0; t < d - 0.1; t += 0.008 + r() * 0.035) {
      const len = 0.02 + r() * 0.05, f0 = 300 + r() * 900;
      s = mixAt(s, bubbleS(len, f0, f0 * (1.6 + r()), 0), t, 0.05 + r() * 0.12);
    }
    return mul(s, shape(d, (u) => Math.min(1, u * 8, (1 - u) * 8)));
  }),
  night: () => {
    const [l, rr] = RECIPES.crickets();
    const [wl, wr] = RECIPES.wind();
    return [add(l, mul(wl.slice(0, l.length), 0.15)), add(rr, mul(wr.slice(0, rr.length), 0.15))];
  },

  // ======================= Música e percussão =======================
  drumroll: () => {
    const r = rng(281), d = 2.2;
    let s = zeros(d + 2.5);
    for (let t = 0, k = 0; t < d; t += 1 / 22, k++) s = mixAt(s, snareS(0.25, 282 + (k % 7)), t, (0.25 + 0.75 * (t / d) ** 1.5) * (0.85 + r() * 0.15) * (k % 2 ? 0.85 : 1));
    s = mixAt(s, kickS(0.6), d, 0.9);
    s = mixAt(s, cymbalS(2.5, 0.8, 283), d);
    return reverb(s, { room: 0.7, wet: 0.15, tail: 0.6 });
  },
  crash: () => reverb(add(cymbalS(3.2, 1.0, 291), mul(bp(noise(3.2, 'white', 292), 3500, 0.7), perc(3.2, 0.002, 0.5), 0.15)), { room: 0.7, wet: 0.15, tail: 0.6 }),
  kick: () => kickS(0.6),
  snare: () => reverb(snareS(0.35, 301), { room: 0.5, wet: 0.1, tail: 0.3 }),
  clap: () => reverb(add(clapS(311), mul(clapS(312, 1, 1300), 0.6)), { room: 0.6, wet: 0.15, tail: 0.4 }),
  snap: () => {
    const d = 0.15;
    return reverb(add(mul(bp(noise(d, 'white', 321), 2600, 1.6), perc(d, 0.0003, 0.012)), mul(osc(d, 1800), perc(d, 0.0003, 0.004), 0.3)), { room: 0.4, wet: 0.12, tail: 0.25 });
  },
  gong: () => {
    const d = 6;
    let s = partials(98, d, [[1, 1, 2.5], [1.47, 0.7, 2.2], [2.09, 0.6, 1.8], [2.56, 0.5, 1.6], [3.41, 0.4, 1.2], [4.12, 0.3, 1], [5.3, 0.25, 0.8], [6.9, 0.15, 0.6]], { attack: 0.004, detune: 0.003 });
    s = mul(s, shape(d, (u, t) => 1 + 0.3 * Math.sin(TAU * 0.7 * t) * Math.min(1, t)));
    s = add(s, mul(lp(noise(0.2, 'white', 331), 2000), perc(0.2, 0.001, 0.03), 0.5));
    return reverb(s, { room: 0.9, wet: 0.3, tail: 2 });
  },
  bell: () => reverb(add(bellFM(note('A5'), 3, { ratio: 3.5, idx: 3, tau: 1.1 }), mul(bellFM(note('A6'), 2, { ratio: 1.41, idx: 1.5, tau: 0.5 }), 0.3)), { room: 0.8, wet: 0.25, tail: 1.2 }),
  churchBell: () => {
    const strike = (f0, seed) => add(partials(f0, 5, [[0.5, 0.6, 3.6], [1, 1, 2.6], [1.19, 0.65, 2], [1.5, 0.45, 1.6], [2, 0.8, 1.8], [2.5, 0.25, 0.9], [3, 0.3, 0.8], [4.07, 0.18, 0.5], [5.2, 0.1, 0.3]], { attack: 0.002, detune: 0.0015 }),
      mul(bp(noise(0.08, 'white', seed), 2500, 1), perc(0.08, 0.0005, 0.01), 0.4));
    let s = zeros(0.1);
    s = mixAt(s, strike(note('G3'), 341), 0);
    s = mixAt(s, strike(note('G3'), 342), 1.9, 0.9);
    s = mixAt(s, strike(note('G3'), 343), 3.8, 0.85);
    return reverb(s, { room: 0.93, wet: 0.35, tail: 2.5 });
  },
  tada: () => {
    const chord = (ns, d, o) => ns.reduce((a, n) => add(a, brass(note(n), d, o)), zeros(d));
    let s = chord(['C4', 'E4', 'G4', 'C5'], 0.16, { swell: 0.015, rel: 0.05, bright: 5 });
    s = mixAt(s, chord(['C4', 'E4', 'G4', 'C5', 'E5'], 1.5, { swell: 0.03, rel: 0.6, bright: 5, vib: 1 }), 0.2);
    s = mixAt(s, mul(cymbalS(2, 0.7, 351), 0.5), 0.2);
    return reverb(s, { room: 0.85, wet: 0.25, tail: 1.2 });
  },
  suspense: () => {
    const d = 3.5;
    const voice = (n, det) => lp(add(osc(d, note(n) * (1 + det), 'saw'), osc(d, note(n) * (1 - det), 'saw')), (t) => 300 + 1800 * (t / d) ** 2);
    let s = add(voice('C3', 0.003), voice('Db3', 0.004), voice('G3', 0.003), mul(voice('C2', 0.002), 0.8));
    s = mul(s, shape(d, (u, t) => u ** 1.6 * (0.75 + 0.25 * Math.sin(TAU * (4 + 6 * u) * t))));
    return reverb(fadeOutSoft(s, 0.05), { room: 0.9, wet: 0.3, tail: 1.5 });
  },
  applause: () => stereo((ch) => {
    const d = 5.5, r = rng(360 + ch);
    let s = zeros(d);
    const dens = (t) => 45 * Math.min(1, t / 0.6) * Math.min(1, (d - t) / 1.6);
    for (let t = 0; t < d;) {
      const rate = Math.max(1, dens(t));
      s = mixAt(s, clapS(Math.floor(r() * 1e6), 0.4 + r() * 0.6, 700 + r() * 1800), t);
      t += -Math.log(1 - r()) / rate;
    }
    return reverb(s, { room: 0.8, wet: 0.25, tail: 0.8 });
  }),

  // ======================= Tempo e alertas =======================
  tickTock: () => {
    const tk = (f, seed) => add(mul(osc(0.06, f), perc(0.06, 0.0005, 0.008)), mul(bp(noise(0.06, 'white', seed), f * 2, 3), perc(0.06, 0.0003, 0.003), 0.5));
    let s = zeros(0.1);
    for (let k = 0; k < 8; k++) s = mixAt(s, tk(k % 2 ? 1150 : 1500, 371 + k), k * 0.5);
    return reverb(s, { room: 0.4, wet: 0.08, tail: 0.3 });
  },
  countdown: () => {
    const b = (f, d) => mul(osc(d, f), env(d, [[0, 0], [0.005, 1], [d - 0.02, 1], [d, 0]]));
    let s = zeros(0.1);
    for (let k = 0; k < 3; k++) s = mixAt(s, b(880, 0.14), k);
    s = mixAt(s, b(1760, 0.65), 3);
    return s;
  },
  alarm: () => {
    let s = zeros(0.1);
    for (let k = 0; k < 6; k++) s = mixAt(s, mul(add(osc(0.18, 3100, 'square'), osc(0.18, 3150, 'square')), env(0.18, [[0, 0], [0.005, 0.5], [0.17, 0.5], [0.18, 0]])), k * 0.32);
    return lp(s, 7000);
  },
  alarmClock: () => {
    const d = 2.4, r = rng(381);
    let s = zeros(d);
    for (let t = 0; t < d - 0.1; t += 1 / 24) s = mixAt(s, partials(1350, 0.25, [[1, 1, 0.12], [2.76, 0.5, 0.06], [5.4, 0.25, 0.03]], { attack: 0.0005 }), t, ((t * 24) % 2 < 1 ? 1 : 0.8) * (0.9 + r() * 0.1));
    return mul(s, env(d, [[0, 1], [d - 0.15, 1], [d, 0]]));
  },
  heartbeat: () => {
    const thump = (g) => mul(add(osc(0.25, (t) => 38 + 30 * Math.exp(-t / 0.03)), mul(lp(noise(0.25, 'brown', 391), 150), 0.5)), perc(0.25, 0.004, 0.06), g);
    let s = zeros(0.1);
    for (let k = 0; k < 4; k++) { s = mixAt(s, thump(1), k * 0.86); s = mixAt(s, thump(0.7), k * 0.86 + 0.24); }
    return s;
  },
  doorbell: () => reverb(mixAt(chimeTube(note('E5'), 2.2, 1.0), chimeTube(note('C5'), 3, 1.4), 0.55), { room: 0.75, wet: 0.2, tail: 1 }),
  phoneRing: () => {
    const burst = () => {
      const d = 1.0;
      const tone = add(osc(d, 1020), mul(osc(d, 1260), 0.8));
      return mul(tone, shape(d, (u, t) => (Math.sin(TAU * 20 * t) > 0 ? 1 : 0.15) * Math.min(1, u * 40, (1 - u) * 40)));
    };
    return reverb(mixAt(burst(), burst(), 1.4), { room: 0.4, wet: 0.08, tail: 0.3 });
  },
  vibrate: () => {
    const buzz = (d) => mul(lp(add(osc(d, 165, 'square'), mul(osc(d, 330, 'square'), 0.3)), 900), env(d, [[0, 0], [0.02, 1], [d - 0.02, 1], [d, 0]]));
    return mixAt(buzz(0.45), buzz(0.45), 0.7);
  },
  censor: () => mul(osc(0.7, 1000), env(0.7, [[0, 0], [0.004, 1], [0.69, 1], [0.7, 0]])),
  siren: () => {
    const d = 4.5;
    const f = (t) => 950 + 380 * Math.sin(TAU * t / 1.5 - Math.PI / 2);
    return reverb(mul(add(osc(d, f, 'tri'), mul(lp(osc(d, f, 'saw'), 2500), 0.3)), shape(d, (u) => Math.min(1, u * 20, (1 - u) * 12))), { room: 0.7, wet: 0.2, tail: 0.8 });
  },
};

function fadeOutSoft(s, sec) { const o = Float32Array.from(s), n = N(sec); for (let i = 0; i < n && i < o.length; i++) o[o.length - 1 - i] *= i / n; return o; }

// volume percebido alvo (dB, RMS dos trechos com som): ambientes mais baixos para ficarem "de fundo";
// o pico nunca passa de −1 dBFS (sons muito curtos, como estalos, ficam limitados pelo pico)
export const LOUDNESS = { wind: -22, rain: -22, waves: -22, fire: -22, stream: -23, night: -23, crickets: -23, birds: -21, chimes: -19, applause: -18, censor: -17, siren: -17, alarm: -18, extraLife: -16, coin: -16, powerUp: -16 };
export const LOUDNESS_DEFAULT = -15;
// sons que não devem ter o silêncio final cortado (o fim faz parte do ritmo)
export const KEEP_TAIL = new Set(['countdown', 'heartbeat', 'tickTock']);
