// Blocos de síntese para os efeitos sonoros (gerados offline em 44,1 kHz, sinais = Float32Array).
export const SR = 44100;
export const N = (s) => Math.max(1, Math.round(s * SR));
const TAU = Math.PI * 2;

// gerador pseudoaleatório determinístico (os sons saem iguais a cada geração)
export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fn = (v) => (typeof v === 'function' ? v : () => v);

export const zeros = (s) => new Float32Array(N(s));
export const dur = (x) => x.length / SR;

// ---------- osciladores ----------
const blep = (t, dt) => {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
};
/** freq: Hz ou função do tempo (s). type: sine | tri | saw | square | pulse; naive = sem antialias (som 8-bit). */
export function osc(d, freq, type = 'sine', { duty = 0.5, phase = 0, naive = false } = {}) {
  const n = N(d), out = new Float32Array(n), f = fn(freq);
  let ph = phase;
  for (let i = 0; i < n; i++) {
    const fr = f(i / SR), dt = Math.min(0.5, Math.abs(fr) / SR);
    let v;
    switch (type) {
      case 'tri': v = 1 - 4 * Math.abs(ph - 0.5); break;
      case 'saw': v = 2 * ph - 1 - (naive ? 0 : blep(ph, dt)); break;
      case 'square': case 'pulse': {
        const w = type === 'square' ? 0.5 : duty;
        v = ph < w ? 1 : -1;
        if (!naive) v += blep(ph, dt) - blep((ph + 1 - w) % 1, dt);
        break;
      }
      default: v = Math.sin(TAU * ph);
    }
    out[i] = v;
    ph += fr / SR;
    ph -= Math.floor(ph);
  }
  return out;
}

/** FM simples (sino, metal): portadora fc, moduladora fc*ratio com índice que pode cair no tempo. */
export function fm(d, fc, ratio, index) {
  const n = N(d), out = new Float32Array(n), fc_ = fn(fc), idx = fn(index);
  let pc = 0, pm = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = fc_(t);
    out[i] = Math.sin(TAU * pc + idx(t) * Math.sin(TAU * pm));
    pc += f / SR; pm += (f * ratio) / SR;
    pc -= Math.floor(pc); pm -= Math.floor(pm);
  }
  return out;
}

/** ruído: white | pink | brown */
export function noise(d, color = 'white', seed = 1) {
  const n = N(d), out = new Float32Array(n), r = rng(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    if (color === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else if (color === 'brown') {
      br = (br + 0.02 * w) / 1.02;
      out[i] = br * 3.5;
    } else out[i] = w;
  }
  return out;
}

/** ruído "LFSR" de console antigo, com taxa (Hz) que pode variar no tempo */
export function lfsr(d, rate, seed = 1) {
  const n = N(d), out = new Float32Array(n), rt = fn(rate);
  let reg = 0x7fff ^ (seed & 0x7fff) || 1, ph = 0, v = 1;
  for (let i = 0; i < n; i++) {
    ph += rt(i / SR) / SR;
    while (ph >= 1) { ph -= 1; const bit = (reg ^ (reg >> 1)) & 1; reg = (reg >> 1) | (bit << 14); v = reg & 1 ? 1 : -1; }
    out[i] = v;
  }
  return out;
}

// ---------- envelopes ----------
/** pontos [[t, v], ...] interpolados (curve > 1 = curva exponencial nas descidas) */
export function env(d, pts, curve = 1) {
  const n = N(d), out = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    while (k < pts.length - 2 && t > pts[k + 1][0]) k++;
    const [t0, v0] = pts[k], [t1, v1] = pts[Math.min(k + 1, pts.length - 1)];
    let u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
    if (t < pts[0][0]) u = 0;
    if (curve !== 1 && v1 < v0) u = 1 - (1 - u) ** curve;
    out[i] = t >= pts[pts.length - 1][0] ? pts[pts.length - 1][1] : v0 + (v1 - v0) * u;
  }
  return out;
}
/** ataque linear + queda exponencial (tau em s) */
export function perc(d, attack = 0.002, tau = 0.1) {
  const n = N(d), out = new Float32Array(n), na = Math.max(1, N(attack));
  for (let i = 0; i < n; i++) out[i] = i < na ? i / na : Math.exp(-(i - na) / SR / tau);
  return out;
}
export const mul = (a, b) => { const out = new Float32Array(a.length); for (let i = 0; i < a.length; i++) out[i] = a[i] * (typeof b === 'number' ? b : b[i] ?? 0); return out; };
export const add = (...xs) => { const n = Math.max(...xs.map((x) => x.length)); const out = new Float32Array(n); for (const x of xs) for (let i = 0; i < x.length; i++) out[i] += x[i]; return out; };
/** soma `sig` em `into` a partir de `at` s (aumenta o tamanho se precisar) */
export function mixAt(into, sig, at = 0, gain = 1) {
  const off = Math.round(at * SR), n = Math.max(into.length, off + sig.length);
  const out = into.length >= n ? into : (() => { const o = new Float32Array(n); o.set(into); return o; })();
  for (let i = 0; i < sig.length; i++) if (off + i >= 0) out[off + i] += sig[i] * gain;
  return out;
}
export const reverse = (a) => Float32Array.from(a).reverse();
export const pad = (a, s) => { const o = new Float32Array(a.length + N(s)); o.set(a); return o; };

// ---------- filtros (RBJ) com frequência que pode variar no tempo ----------
export function biquad(sig, type, freq, q = 0.707, gainDb = 0) {
  const out = new Float32Array(sig.length), f = fn(freq), qq = fn(q);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  const A = 10 ** (gainDb / 40);
  for (let i = 0; i < sig.length; i++) {
    if (i % 16 === 0) {
      const t = i / SR, f0 = Math.min(SR * 0.45, Math.max(10, f(t))), Q = Math.max(0.05, qq(t));
      const w = (TAU * f0) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * Q);
      let a0;
      switch (type) {
        case 'hp': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
        case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
        case 'notch': b0 = 1; b1 = -2 * cs; b2 = 1; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
        case 'peak': b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; break;
        default: b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
      }
      b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    }
    const x = sig[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}
export const lp = (s, f, q) => biquad(s, 'lp', f, q);
export const hp = (s, f, q) => biquad(s, 'hp', f, q);
export const bp = (s, f, q) => biquad(s, 'bp', f, q);

// ---------- efeitos ----------
export const drive = (s, k = 2) => { const o = new Float32Array(s.length), n = Math.tanh(k); for (let i = 0; i < s.length; i++) o[i] = Math.tanh(s[i] * k) / n; return o; };
export function crush(s, bits = 6, hold = 4) {
  const o = new Float32Array(s.length), q = 2 ** (bits - 1);
  let v = 0;
  for (let i = 0; i < s.length; i++) { if (i % hold === 0) v = Math.round(s[i] * q) / q; o[i] = v; }
  return o;
}
/** eco: tempo (s), realimentação, mistura; cauda extra em s */
export function echo(s, time, fb = 0.4, wet = 0.4, tail = 1) {
  const d = N(time), x = pad(s, tail), o = new Float32Array(x.length), buf = new Float32Array(d);
  for (let i = 0; i < x.length; i++) {
    const del = buf[i % d];
    buf[i % d] = x[i] + del * fb;
    o[i] = x[i] + del * wet;
  }
  return o;
}
/** reverb estilo Freeverb (mono) */
export function reverb(s, { room = 0.82, damp = 0.35, wet = 0.3, tail = 1.6, pre = 0.01 } = {}) {
  const x = pad(s, tail), n = x.length;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], alls = [556, 441, 341, 225];
  const fb = room * 0.28 + 0.7, preN = N(pre);
  const wetSig = new Float32Array(n);
  for (const L of combs) {
    const buf = new Float32Array(L);
    let idx = 0, store = 0;
    for (let i = 0; i < n; i++) {
      const inp = i >= preN ? x[i - preN] * 0.015 : 0;
      const y = buf[idx];
      store = y * (1 - damp) + store * damp;
      buf[idx] = inp + store * fb;
      idx = (idx + 1) % L;
      wetSig[i] += y;
    }
  }
  for (const L of alls) {
    const buf = new Float32Array(L);
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const b = buf[idx], v = wetSig[i];
      wetSig[i] = -v + b;
      buf[idx] = v + b * 0.5;
      idx = (idx + 1) % L;
    }
  }
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = x[i] * (1 - wet * 0.5) + wetSig[i] * wet * 3;
  return o;
}
/** corda dedilhada (Karplus-Strong) */
export function pluck(freq, d = 1.5, { bright = 0.5, seed = 1, decay = 0.996 } = {}) {
  const n = N(d), out = new Float32Array(n), L = Math.max(2, Math.round(SR / freq)), r = rng(seed);
  const buf = new Float32Array(L);
  for (let i = 0; i < L; i++) buf[i] = r() * 2 - 1;
  let prev = 0;
  for (let i = 0; i < L; i++) { prev = prev + bright * (buf[i] - prev); buf[i] = prev; }
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const a = buf[idx], b = buf[(idx + 1) % L];
    buf[idx] = decay * 0.5 * (a + b);
    out[i] = a;
    idx = (idx + 1) % L;
  }
  return out;
}

/** som de sino/metal por parciais: [[razão, amplitude, tau]] */
export function partials(f0, d, parts, { attack = 0.002, detune = 0 } = {}) {
  let out = zeros(d);
  parts.forEach(([ratio, amp, tau], k) => {
    const f = f0 * ratio * (1 + (k % 2 ? detune : -detune));
    out = add(out, mul(mul(osc(d, f), perc(d, attack, tau)), amp));
  });
  return out;
}

export const note = (name) => {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((base + (Number(m[3]) + 1) * 12 - 69) / 12);
};

// ---------- finalização ----------
export function fade(s, inS = 0.002, outS = 0.01) {
  const o = Float32Array.from(s), ni = N(inS), no = N(outS);
  for (let i = 0; i < ni && i < o.length; i++) o[i] *= i / ni;
  for (let i = 0; i < no && i < o.length; i++) o[o.length - 1 - i] *= i / no;
  return o;
}
/** corta o silêncio do fim (abaixo de -60 dB) e deixa uma folga */
export function trimTail(s, thr = 0.001, keep = 0.05) {
  let end = s.length;
  while (end > 1 && Math.abs(s[end - 1]) < thr) end--;
  return s.slice(0, Math.min(s.length, end + N(keep)));
}
export function dcBlock(s) {
  const o = new Float32Array(s.length);
  let x1 = 0, y1 = 0;
  for (let i = 0; i < s.length; i++) { const y = s[i] - x1 + 0.9995 * y1; x1 = s[i]; y1 = y; o[i] = y; }
  return o;
}
export function peak(s) { let p = 0; for (const v of s) p = Math.max(p, Math.abs(v)); return p; }
export function normalize(chans, target = 0.89) {
  const p = Math.max(...chans.map(peak)) || 1;
  return chans.map((c) => mul(c, target / p));
}
