// Biblioteca de efeitos de vídeo (estilo CapCut).
//
// Cada efeito pode combinar:
//   ops   — operações de cor/pixel (ops.js), ligadas só durante o clipe
//   prev  — desenho na prévia (canvas) que transforma o quadro atual
//   ff    — o mesmo efeito em FFmpeg, aplicado só ao trecho do clipe (tempo local t = 0 no início)
//   layer — camada desenhada por código (partículas, textos, luz): a MESMA função desenha a
//           prévia e gera os quadros PNG da exportação, então o resultado é idêntico.
// Tudo usa unidades relativas (fração da largura/altura), valendo em qualquer resolução.

const n4 = (x) => String(Math.round(x * 10000) / 10000);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (p) => p * p * (3 - 2 * p);
const TAU = Math.PI * 2;

// ---------- Aleatório determinístico (igual na prévia e na exportação) ----------
export function rnd(seed, a = 0, b = 0) {
  let h = (seed ^ Math.imul((a + 0x9e3779b9) | 0, 0x85ebca6b) ^ Math.imul((b + 0x7f4a7c15) | 0, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function seedOf(id) {
  let h = 2166136261;
  for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const FX_CATS = [
  { id: 'all', name: 'Todos' },
  { id: 'basic', name: 'Básico' },
  { id: 'camera', name: 'Câmera' },
  { id: 'retro', name: 'Retrô' },
  { id: 'glitch', name: 'Glitch' },
  { id: 'light', name: 'Luz e cor' },
  { id: 'split', name: 'Divisão' },
  { id: 'party', name: 'Partículas' },
];

// ---------- Câmera: zoom / deslocamento / rotação do quadro inteiro ----------
// js(t, D, k, W, H) → { Z, tx, ty, th } · ff(D, k, W, H) → mesmas fórmulas em sintaxe FFmpeg (variável T)
function camera(js, ff) {
  return {
    prev(env) {
      const { ctx, W, H, t, D, k } = env;
      const m = js(t, D, k, W, H);
      const src = env.snapshot();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2 + m.tx * W, H / 2 + m.ty * H);
      ctx.rotate(m.th);
      ctx.scale(m.Z, m.Z);
      ctx.drawImage(src, -W / 2, -H / 2, W, H);
      ctx.restore();
    },
    ff({ inL, outL, W, H, FPS, D, k }) {
      const e = ff(D, k, W, H);
      const sub = (s) => `(${String(s ?? '0').replace(/T/g, `(in/${FPS})`)})`;
      const Z = sub(e.Z ?? '1'), tx = sub(e.tx), ty = sub(e.ty), th = sub(e.th);
      const corner = (cx, cy) => {
        const dx = `(${cx}-W/2-${tx}*W)`, dy = `(${cy}-H/2-${ty}*H)`;
        return [`W/2+(cos(${th})*${dx}+sin(${th})*${dy})/${Z}`, `H/2+(-sin(${th})*${dx}+cos(${th})*${dy})/${Z}`];
      };
      const [x0, y0] = corner('0', '0'), [x1, y1] = corner('W', '0'), [x2, y2] = corner('0', 'H'), [x3, y3] = corner('W', 'H');
      return `[${inL}]perspective=x0='${x0}':y0='${y0}':x1='${x1}':y1='${y1}':x2='${x2}':y2='${y2}':x3='${x3}':y3='${y3}':interpolation=linear:sense=source:eval=frame[${outL}]`;
    },
  };
}
// zoom mínimo para a imagem girada por th cobrir o quadro
const coverZoom = (th, W, H) => Math.abs(Math.cos(th)) + (Math.max(W, H) / Math.min(W, H)) * Math.abs(Math.sin(th)) + 0.01;
const P = (D) => `clip(T/${n4(D)},0,1)`;
const EASE = (p) => `(${p}*${p}*(3-2*${p}))`;

const shakeJs = (A, R, f) => (t) => ({
  tx: A * (0.6 * Math.sin(TAU * 7.3 * f * t) + 0.4 * Math.sin(TAU * 13.1 * f * t + 1.3)),
  ty: A * (0.6 * Math.sin(TAU * 9.7 * f * t + 0.7) + 0.4 * Math.sin(TAU * 17.9 * f * t + 2.1)),
  th: R * Math.sin(TAU * 5.3 * f * t + 0.4),
});
const shakeFf = (A, R, f) => ({
  tx: `${n4(A)}*(0.6*sin(${n4(TAU * 7.3 * f)}*T)+0.4*sin(${n4(TAU * 13.1 * f)}*T+1.3))`,
  ty: `${n4(A)}*(0.6*sin(${n4(TAU * 9.7 * f)}*T+0.7)+0.4*sin(${n4(TAU * 17.9 * f)}*T+2.1))`,
  th: `${n4(R)}*sin(${n4(TAU * 5.3 * f)}*T+0.4)`,
});

// ---------- Ajudantes de desenho para camadas ----------
function emojiAt(ctx, ch, x, y, size) {
  // emojis coloridos herdam a opacidade do fillStyle — garante cor opaca
  ctx.fillStyle = '#000';
  ctx.font = `${Math.max(1, size)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y);
}
function starPath(ctx, x, y, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.28 : r;
    const a = rot + (i * Math.PI) / 4;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}
function fmtClock(t) {
  const s = Math.floor(t), mm = Math.floor(s / 60), ss = s % 60;
  return `00:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// Janelas de glitch: a cada 1/12 s sorteia se há falha e com que intensidade.
const GW = 1 / 12;
function glitchWin(seed, w, k, W, H, p = 0.6) {
  if (rnd(seed, w) > p) return null;
  return {
    dx: Math.round((rnd(seed, w, 1) * 2 - 1) * 0.03 * k * W),
    dy: Math.round((rnd(seed, w, 2) * 2 - 1) * 0.008 * k * H),
  };
}
function glitchSlices(seed, w, k, W, H) {
  if (rnd(seed, w, 9) > 0.5) return [];
  const n = 2 + Math.floor(rnd(seed, w, 10) * 3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = Math.max(2, Math.round(((0.02 + rnd(seed, w, 20 + i) * 0.08) * H) / 2) * 2);
    const y = Math.min(H - h, Math.round((rnd(seed, w, 40 + i) * (H - h)) / 2) * 2);
    const dx = Math.round((rnd(seed, w, 60 + i) * 2 - 1) * 0.09 * k * W);
    out.push({ y, h, dx });
  }
  return out;
}
const between = (a, b) => `between(t,${n4(a)},${n4(b - 1e-3)})`;

// ---------- Divisão de tela ----------
function splitLayout(n, W, H) {
  let cols, rows;
  if (n === 4) { cols = 2; rows = 2; }
  else if (n === 9) { cols = 3; rows = 3; }
  else if (W >= H) { cols = n; rows = 1; }
  else { cols = 1; rows = n; }
  const cw = Math.max(2, Math.floor(W / cols / 2) * 2), ch = Math.max(2, Math.floor(H / rows / 2) * 2);
  const s = Math.max(cw / W, ch / H);
  return { cols, rows, cw, ch, sw: cw / s, sh: ch / s };
}
function splitEffect(n) {
  return {
    prev(env) {
      const { ctx, W, H } = env;
      const L = splitLayout(n, W, H);
      const src = env.snapshot();
      const sx = (W - L.sw) / 2, sy = (H - L.sh) / 2;
      const cw = W / L.cols, ch = H / L.rows;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) ctx.drawImage(src, sx, sy, L.sw, L.sh, c * cw, r * ch, cw, ch);
      ctx.restore();
    },
    ff({ inL, outL, W, H, L: lab }) {
      const L = splitLayout(n, W, H);
      const sw = Math.round(W * (L.cw / L.sw) / 2) * 2, sh = Math.round(H * (L.ch / L.sh) / 2) * 2;
      const outs = Array.from({ length: L.cols * L.rows }, () => lab('q'));
      const layout = [];
      for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) layout.push(`${c * L.cw}_${r * L.ch}`);
      return `[${inL}]scale=${Math.max(sw, L.cw)}:${Math.max(sh, L.ch)},crop=${L.cw}:${L.ch},split=${outs.length}${outs.map((o) => `[${o}]`).join('')};` +
        `${outs.map((o) => `[${o}]`).join('')}xstack=inputs=${outs.length}:layout=${layout.join('|')},scale=${W}:${H},setsar=1[${outL}]`;
    },
  };
}

// Barras pretas animadas (Abrir/Fechar): duas faixas pretas posicionadas pelo overlay a cada quadro.
function barsFF({ inL, outL, W, H, FPS, D, L }, hExpr) {
  const bh = Math.ceil(H / 2) + 2;
  const c1 = L('bt'), c2 = L('bb'), o1 = L('bo');
  const h = hExpr(D);
  return `color=c=black:s=${W}x${bh}:r=${FPS}:d=${n4(D + 0.1)}[${c1}];color=c=black:s=${W}x${bh}:r=${FPS}:d=${n4(D + 0.1)}[${c2}];` +
    `[${inL}][${c1}]overlay=x=0:y='${h}-${bh}':eof_action=pass[${o1}];[${o1}][${c2}]overlay=x=0:y='main_h-(${h})':eof_action=pass[${outL}]`;
}

// ---------- Catálogo ----------
export const EFFECTS = [
  // Básico
  { id: 'blur', name: 'Desfoque', cat: 'basic', ops: [{ op: 'blur', v: 0.012 }] },
  {
    id: 'blurPulse', name: 'Desfoque pulsante', cat: 'basic',
    prev(env) {
      const { ctx, W, H, t, k } = env;
      const K = k * Math.abs(Math.sin(Math.PI * 1.2 * t));
      const b = env.blurred(0.014 * H);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = K; ctx.drawImage(b, 0, 0); ctx.restore();
    },
    ff: ({ inL, outL, H, k, L }) => {
      const a = L('ba'), b = L('bb'), c = L('bc');
      return `[${inL}]format=gbrp,split[${a}][${b}];[${b}]gblur=sigma=${n4(0.014 * H)}[${c}];[${a}][${c}]blend=all_expr='A*(1-${n4(k)}*abs(sin(PI*1.2*T)))+B*${n4(k)}*abs(sin(PI*1.2*T))'[${outL}]`;
    },
  },
  {
    id: 'open', name: 'Abrir', cat: 'basic',
    prev(env) {
      const { ctx, W, H, t, D } = env;
      const p = 1 - Math.pow(1 - clamp01(t / D), 3);
      const h = (H / 2) * (1 - p);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h + 1); ctx.restore();
    },
    ff: (a) => barsFF(a, (D) => `(main_h/2)*pow(1-clip(t/${n4(D)},0,1),3)`),
  },
  {
    id: 'close', name: 'Fechar', cat: 'basic',
    prev(env) {
      const { ctx, W, H, t, D } = env;
      const p = Math.pow(clamp01(t / D), 3);
      const h = (H / 2) * p;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h + 1); ctx.restore();
    },
    ff: (a) => barsFF(a, (D) => `(main_h/2)*pow(clip(t/${n4(D)},0,1),3)`),
  },
  {
    id: 'fadeBlack', name: 'Escurecer', cat: 'basic',
    prev(env) { const { ctx, W, H, t, D } = env; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = clamp01(t / D); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); },
    ff: ({ inL, outL, D }) => `[${inL}]fade=t=out:st=0:d=${n4(D)}:color=black[${outL}]`,
  },
  {
    id: 'fadeWhite', name: 'Clarear', cat: 'basic',
    prev(env) { const { ctx, W, H, t, D } = env; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = clamp01(t / D); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); },
    ff: ({ inL, outL, D }) => `[${inL}]fade=t=out:st=0:d=${n4(D)}:color=white[${outL}]`,
  },
  { id: 'cinema', name: 'Barras de cinema', cat: 'basic', ops: [{ op: 'letterbox', v: 0.12 }] },
  { id: 'mirror', name: 'Virar', cat: 'basic', ops: [{ op: 'mirror' }] },
  { id: 'darken', name: 'Sombrio', cat: 'basic', ops: [{ op: 'brightness', v: 0.55 }] },

  // Câmera
  {
    id: 'zoomSlow', name: 'Zoom lento', cat: 'camera',
    ...camera((t, D, k) => ({ Z: 1 + 0.3 * k * ease(clamp01(t / D)), tx: 0, ty: 0, th: 0 }), (D, k) => ({ Z: `1+${n4(0.3 * k)}*${EASE(P(D))}` })),
  },
  {
    id: 'zoomOutSlow', name: 'Afastar lento', cat: 'camera',
    ...camera((t, D, k) => ({ Z: 1 + 0.3 * k * (1 - ease(clamp01(t / D))), tx: 0, ty: 0, th: 0 }), (D, k) => ({ Z: `1+${n4(0.3 * k)}*(1-${EASE(P(D))})` })),
  },
  {
    id: 'zoomPunch', name: 'Zoom rápido', cat: 'camera',
    ...camera((t, D, k) => ({ Z: 1 + 0.35 * k * (1 - Math.pow(1 - Math.min(1, t / 0.25), 3)), tx: 0, ty: 0, th: 0 }), (D, k) => ({ Z: `1+${n4(0.35 * k)}*(1-pow(1-min(1,T/0.25),3))` })),
  },
  {
    id: 'pulse', name: 'Pulsar', cat: 'camera',
    ...camera((t, D, k) => ({ Z: 1 + 0.12 * k * Math.exp(-9 * (t % 0.5)), tx: 0, ty: 0, th: 0 }), (D, k) => ({ Z: `1+${n4(0.12 * k)}*exp(-9*mod(T,0.5))` })),
  },
  {
    id: 'pan', name: 'Panorâmica', cat: 'camera',
    ...camera((t, D, k) => ({ Z: 1 + 0.18 * k + 0.01, tx: 0.07 * k * (1 - 2 * ease(clamp01(t / D))), ty: 0, th: 0 }),
      (D, k) => ({ Z: n4(1 + 0.18 * k + 0.01), tx: `${n4(0.07 * k)}*(1-2*${EASE(P(D))})` })),
  },
  {
    id: 'shake', name: 'Tremor', cat: 'camera',
    ...camera((t, D, k) => ({ Z: 1 + 2.5 * 0.012 * k + 0.02, ...shakeJs(0.012 * k, 0.004 * k, 1)(t) }),
      (D, k) => ({ Z: n4(1 + 2.5 * 0.012 * k + 0.02), ...shakeFf(0.012 * k, 0.004 * k, 1) })),
  },
  {
    id: 'quake', name: 'Terremoto', cat: 'camera',
    ...camera((t, D, k) => ({ Z: 1 + 2.5 * 0.035 * k + 0.05, ...shakeJs(0.035 * k, 0.012 * k, 1.6)(t) }),
      (D, k) => ({ Z: n4(1 + 2.5 * 0.035 * k + 0.05), ...shakeFf(0.035 * k, 0.012 * k, 1.6) })),
  },
  {
    id: 'sway', name: 'Balanço', cat: 'camera',
    ...camera((t, D, k, W, H) => ({ Z: coverZoom(0.06 * k, W, H), tx: 0, ty: 0, th: 0.06 * k * Math.sin(TAU * 0.7 * t) }),
      (D, k, W, H) => ({ Z: n4(coverZoom(0.06 * k, W, H)), th: `${n4(0.06 * k)}*sin(${n4(TAU * 0.7)}*T)` })),
  },
  {
    id: 'spin', name: 'Girar', cat: 'camera',
    prev(env) {
      const { ctx, W, H, t, D, k } = env;
      const a = TAU * clamp01(t / D) * (k >= 0.5 ? 1 : k * 2);
      const src = env.snapshot();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2, H / 2); ctx.rotate(a); ctx.drawImage(src, -W / 2, -H / 2, W, H); ctx.restore();
    },
    ff: ({ inL, outL, D, k }) => `[${inL}]rotate=a='${n4(TAU * (k >= 0.5 ? 1 : k * 2))}*clip(t/${n4(D)},0,1)':c=black[${outL}]`,
  },
  {
    id: 'flash', name: 'Flash', cat: 'camera', ops: [{ op: 'flash', v: 0.6, f: 2 }],
  },
  {
    id: 'strobe', name: 'Estroboscópio', cat: 'camera',
    prev(env) { const { ctx, W, H, t, k } = env; if ((t % 0.16) < 0.08) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.75 * k; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); } },
    ff: ({ inL, outL, k }) => `[${inL}]drawbox=x=0:y=0:w=iw:h=ih:color=white@${n4(0.75 * k)}:t=fill:enable='lt(mod(t,0.16),0.08)'[${outL}]`,
  },
  {
    id: 'blink', name: 'Piscar', cat: 'camera',
    prev(env) { const { ctx, W, H, t } = env; if ((t % 0.5) < 0.08) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); } },
    ff: ({ inL, outL }) => `[${inL}]drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='lt(mod(t,0.5),0.08)'[${outL}]`,
  },
  {
    id: 'rec', name: 'Câmera REC', cat: 'camera',
    layer: {
      blend: 'normal',
      draw(ctx, W, H, t) {
        const m = Math.min(W, H), mg = m * 0.06, L = m * 0.09, lw = Math.max(1, m * 0.006);
        ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = lw; ctx.lineCap = 'square';
        const br = (x, y, sx, sy) => { ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke(); };
        br(mg, mg, 1, 1); br(W - mg, mg, -1, 1); br(mg, H - mg, 1, -1); br(W - mg, H - mg, -1, -1);
        const fs = m * 0.045;
        ctx.font = `700 ${fs}px "Segoe UI", sans-serif`; ctx.textBaseline = 'middle';
        if (t % 1 < 0.6) { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(mg * 1.6, mg * 1.8, fs * 0.32, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText('REC', mg * 1.6 + fs * 0.6, mg * 1.8);
        ctx.textAlign = 'right'; ctx.fillText(fmtClock(t), W - mg * 1.4, mg * 1.8);
        ctx.font = `600 ${fs * 0.75}px "Segoe UI", sans-serif`; ctx.textAlign = 'left'; ctx.fillText('4K  60FPS', mg * 1.4, H - mg * 1.8);
        const bw = fs * 1.4, bh = fs * 0.7, bx = W - mg * 1.4 - bw, by = H - mg * 1.8 - bh / 2;
        ctx.lineWidth = Math.max(1, lw * 0.6); ctx.strokeRect(bx, by, bw, bh); ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw, by + bh * 0.3, lw, bh * 0.4); ctx.fillRect(bx + lw, by + lw, (bw - 2 * lw) * 0.7, bh - 2 * lw);
        const c = m * 0.03; ctx.beginPath(); ctx.moveTo(W / 2 - c, H / 2); ctx.lineTo(W / 2 + c, H / 2); ctx.moveTo(W / 2, H / 2 - c); ctx.lineTo(W / 2, H / 2 + c); ctx.stroke();
      },
    },
  },

  // Retrô
  {
    id: 'vhs', name: 'VHS', cat: 'retro',
    ops: [{ op: 'saturate', v: 1.4 }, { op: 'contrast', v: 1.1 }, { op: 'rgbshift', v: 0.006 }, { op: 'noise', v: 0.25 }],
    layer: {
      blend: 'normal',
      draw(ctx, W, H, t) {
        const m = Math.min(W, H);
        const step = Math.max(2, Math.round(H / 270));
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let y = 0; y < H; y += step * 2) ctx.fillRect(0, y, W, step);
        const fs = m * 0.05, mg = m * 0.06;
        ctx.font = `700 ${fs}px "Courier New", monospace`; ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.textAlign = 'left'; ctx.fillText('PLAY ►', mg + 2, mg + 2);
        ctx.fillStyle = '#f4f4f4'; ctx.fillText('PLAY ►', mg, mg);
        ctx.textBaseline = 'bottom';
        const clock = `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}`;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText('SP', mg + 2, H - mg + 2); ctx.textAlign = 'right'; ctx.fillText(clock, W - mg + 2, H - mg + 2);
        ctx.fillStyle = '#f4f4f4'; ctx.textAlign = 'left'; ctx.fillText('SP', mg, H - mg); ctx.textAlign = 'right'; ctx.fillText(clock, W - mg, H - mg);
      },
    },
  },
  {
    id: 'oldfilm', name: 'Filme antigo', cat: 'retro',
    ops: [{ op: 'sepia', v: 0.6 }, { op: 'contrast', v: 1.1 }, { op: 'noise', v: 0.35 }, { op: 'vignette', v: 0.6 }],
    layer: {
      blend: 'normal',
      draw(ctx, W, H, t, D, k, seed) {
        const w = Math.floor(t * 8);
        const m = Math.min(W, H);
        const lines = 1 + Math.floor(rnd(seed, w, 1) * 3);
        for (let i = 0; i < lines; i++) {
          ctx.fillStyle = `rgba(240,230,210,${0.15 + rnd(seed, w, 10 + i) * 0.35})`;
          ctx.fillRect(rnd(seed, w, 20 + i) * W, 0, Math.max(1, m * 0.0025), H);
        }
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = rnd(seed, w, 40 + i) > 0.5 ? 'rgba(20,15,10,0.55)' : 'rgba(250,245,230,0.45)';
          ctx.beginPath(); ctx.arc(rnd(seed, w, 60 + i) * W, rnd(seed, w, 80 + i) * H, m * (0.002 + rnd(seed, w, 100 + i) * 0.005), 0, TAU); ctx.fill();
        }
      },
    },
  },
  {
    id: 'super8', name: 'Super 8', cat: 'retro',
    ops: [{ op: 'tint', r: 1.08, g: 1.0, b: 0.82 }, { op: 'contrast', v: 1.12 }, { op: 'noise', v: 0.3 }, { op: 'vignette', v: 0.55 }],
    layer: {
      blend: 'normal',
      draw(ctx, W, H) {
        const m = Math.min(W, H), ins = m * 0.035, r = m * 0.07;
        ctx.fillStyle = '#0a0806';
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.roundRect(ins, ins, W - ins * 2, H - ins * 2, r);
        ctx.fill('evenodd');
      },
    },
  },
  { id: 'bw', name: 'Preto e branco', cat: 'retro', ops: [{ op: 'grayscale', v: 1 }] },
  { id: 'sepia', name: 'Sépia', cat: 'retro', ops: [{ op: 'sepia', v: 1 }] },
  { id: 'grain', name: 'Granulado', cat: 'retro', ops: [{ op: 'noise', v: 0.45 }] },
  { id: 'vignette', name: 'Vinheta', cat: 'retro', ops: [{ op: 'vignette', v: 0.7 }] },
  { id: 'horror', name: 'Terror', cat: 'retro', ops: [{ op: 'grayscale', v: 0.8 }, { op: 'contrast', v: 1.5 }, { op: 'brightness', v: 0.8 }, { op: 'noise', v: 0.4 }, { op: 'vignette', v: 0.9 }] },

  // Glitch
  {
    id: 'glitch', name: 'Glitch RGB', cat: 'glitch',
    prev(env) {
      const { W, H, t, k, seed } = env;
      const g = glitchWin(seed, Math.floor(t / GW), k, W, H);
      if (g) env.rgbShift(g.dx, g.dy);
    },
    ff({ inL, outL, W, H, D, k, seed }) {
      const f = ['format=gbrp'];
      for (let w = 0; w < Math.ceil(D / GW); w++) {
        const g = glitchWin(seed, w, k, W, H);
        if (g) f.push(`rgbashift=rh=${g.dx}:rv=${g.dy}:bh=${-g.dx}:bv=${-g.dy}:edge=smear:enable='${between(w * GW, (w + 1) * GW)}'`);
      }
      return `[${inL}]${f.join(',')}[${outL}]`;
    },
  },
  {
    id: 'glitchBlocks', name: 'Glitch de blocos', cat: 'glitch',
    prev(env) {
      const { ctx, W, H, t, k, seed } = env;
      const w = Math.floor(t / GW);
      const sl = glitchSlices(seed, w, k, W, H);
      if (sl.length) {
        const src = env.snapshot();
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (const s of sl) ctx.drawImage(src, 0, s.y, W, s.h, s.dx, s.y, W, s.h);
        ctx.restore();
      }
      const g = glitchWin(seed, w, k * 0.6, W, H, 0.45);
      if (g) env.rgbShift(g.dx, g.dy);
    },
    ff({ inL, outL, W, H, D, k, seed, L }) {
      const slices = [];
      const shifts = [];
      for (let w = 0; w < Math.ceil(D / GW); w++) {
        for (const s of glitchSlices(seed, w, k, W, H)) slices.push({ ...s, en: between(w * GW, (w + 1) * GW) });
        const g = glitchWin(seed, w, k * 0.6, W, H, 0.45);
        if (g) shifts.push(`rgbashift=rh=${g.dx}:rv=${g.dy}:bh=${-g.dx}:bv=${-g.dy}:edge=smear:enable='${between(w * GW, (w + 1) * GW)}'`);
      }
      const parts = [];
      let cur = inL;
      if (slices.length) {
        const m = L('gm');
        const outs = slices.map(() => L('gs'));
        parts.push(`[${inL}]split=${slices.length + 1}[${m}]${outs.map((o) => `[${o}]`).join('')}`);
        cur = m;
        slices.forEach((s, i) => {
          const c = L('gc'), o = L('go');
          parts.push(`[${outs[i]}]crop=${W}:${s.h}:0:${s.y}[${c}]`);
          parts.push(`[${cur}][${c}]overlay=x=${s.dx}:y=${s.y}:enable='${s.en}'[${o}]`);
          cur = o;
        });
      }
      parts.push(`[${cur}]format=gbrp${shifts.length ? `,${shifts.join(',')}` : ''}[${outL}]`);
      return parts.join(';');
    },
  },
  {
    id: 'pixelGlitch', name: 'Glitch pixel', cat: 'glitch',
    prev(env) {
      const { W, H, t, k, seed } = env;
      const w = Math.floor(t / GW);
      if (rnd(seed, w, 5) < 0.4) env.pixelate(Math.max(2, Math.round((0.02 + rnd(seed, w, 6) * 0.05) * k * Math.min(W, H))));
    },
    ff({ inL, outL, W, H, D, k, seed }) {
      const f = [];
      for (let w = 0; w < Math.ceil(D / GW); w++) {
        if (rnd(seed, w, 5) < 0.4) {
          const b = Math.max(2, Math.round((0.02 + rnd(seed, w, 6) * 0.05) * k * Math.min(W, H)));
          f.push(`pixelize=w=${b}:h=${b}:enable='${between(w * GW, (w + 1) * GW)}'`);
        }
      }
      return `[${inL}]${f.length ? f.join(',') : 'null'}[${outL}]`;
    },
  },
  { id: 'rgbsplit', name: 'Aberração RGB', cat: 'glitch', ops: [{ op: 'rgbshift', v: 0.01 }] },
  { id: 'pixelate', name: 'Pixelizar', cat: 'glitch', ops: [{ op: 'pixelate', v: 0.03 }] },
  {
    id: 'wave', name: 'Onda', cat: 'glitch',
    prev(env) {
      const { ctx, W, H, t, k } = env;
      const A = 0.02 * k * W;
      const src = env.snapshot();
      const step = Math.max(1, Math.round(H / 400));
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let y = 0; y < H; y += step) {
        const dx = A * Math.sin(TAU * ((y / H) * 3 + t * 1.5));
        ctx.drawImage(src, 0, y, W, step, -dx, y, W, step);
      }
      ctx.restore();
    },
    ff: ({ inL, outL, k }) => {
      const e = (p) => `${p}(X+${n4(0.02 * k)}*W*sin(2*PI*(Y/H*3+T*1.5)),Y)`;
      return `[${inL}]geq=lum='${e('lum')}':cb='${e('cb')}':cr='${e('cr')}'[${outL}]`;
    },
  },
  { id: 'invert', name: 'Negativo', cat: 'glitch', ops: [{ op: 'invert', v: 1 }] },

  // Luz e cor
  {
    id: 'glow', name: 'Brilho suave', cat: 'light',
    prev(env) {
      const { ctx, H, k } = env;
      const b = env.blurred(0.02 * H);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.6 * k; ctx.drawImage(b, 0, 0); ctx.restore();
    },
    ff: ({ inL, outL, H, k, L }) => {
      const a = L('ga'), b = L('gb'), c = L('gc');
      return `[${inL}]format=gbrp,split[${a}][${b}];[${b}]gblur=sigma=${n4(0.02 * H)}[${c}];[${a}][${c}]blend=all_mode=screen:all_opacity=${n4(0.6 * k)}[${outL}]`;
    },
  },
  {
    id: 'dream', name: 'Sonho', cat: 'light',
    ops: [{ op: 'brightness', v: 1.06 }, { op: 'saturate', v: 1.25 }],
    prev(env) {
      const { ctx, H, k } = env;
      const b = env.blurred(0.03 * H);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.5 * k; ctx.drawImage(b, 0, 0); ctx.restore();
    },
    ff: ({ inL, outL, H, k, L }) => {
      const a = L('ga'), b = L('gb'), c = L('gc');
      return `[${inL}]format=gbrp,split[${a}][${b}];[${b}]gblur=sigma=${n4(0.03 * H)}[${c}];[${a}][${c}]blend=all_mode=screen:all_opacity=${n4(0.5 * k)}[${outL}]`;
    },
  },
  {
    id: 'lightLeak', name: 'Vazamento de luz', cat: 'light',
    layer: {
      blend: 'screen',
      draw(ctx, W, H, t, D, k) {
        const m = Math.max(W, H);
        const blobs = [['255,122,24', 0.0], ['255,61,127', 2.1], ['255,211,107', 4.2]];
        for (const [rgb, ph] of blobs) {
          const cx = W * (0.5 + 0.5 * Math.sin(t * 0.55 + ph));
          const cy = H * (0.5 + 0.5 * Math.cos(t * 0.4 + ph * 1.3));
          const r = m * (0.45 + 0.15 * Math.sin(t * 0.8 + ph));
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          for (let i = 0; i <= 6; i++) { const u = i / 6; g.addColorStop(u, `rgba(${rgb},${(0.75 * k * Math.exp(-4 * u * u)).toFixed(4)})`); }
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        }
      },
    },
  },
  {
    id: 'rainbow', name: 'Arco-íris', cat: 'light',
    prev(env) {
      const { ctx, t, k } = env;
      const src = env.snapshot();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = `hue-rotate(${(t * 150 * (0.3 + 0.7 * k)) % 360}deg) saturate(1.3)`; ctx.drawImage(src, 0, 0); ctx.restore();
    },
    ff: ({ inL, outL, k }) => `[${inL}]hue=h='t*${n4(150 * (0.3 + 0.7 * k))}':s=1.3[${outL}]`,
  },
  {
    id: 'duoPink', name: 'Duotone rosa', cat: 'light', duo: ['#1b1464', '#ff5fa2'],
  },
  {
    id: 'duoOrange', name: 'Duotone pôr do sol', cat: 'light', duo: ['#2a0b4a', '#ffb347'],
  },
  {
    id: 'duoTeal', name: 'Duotone menta', cat: 'light', duo: ['#08263a', '#5ef2c4'],
  },
  { id: 'saturate', name: 'Cores fortes', cat: 'light', ops: [{ op: 'saturate', v: 2.4 }, { op: 'contrast', v: 1.15 }] },
  { id: 'glowOld', name: 'Iluminar', cat: 'light', ops: [{ op: 'brightness', v: 1.18 }, { op: 'saturate', v: 1.2 }] },

  // Divisão / espelho
  { id: 'split2', name: 'Dividir em 2', cat: 'split', ...splitEffect(2) },
  { id: 'split3', name: 'Dividir em 3', cat: 'split', ...splitEffect(3) },
  { id: 'split4', name: 'Dividir em 4', cat: 'split', ...splitEffect(4) },
  { id: 'split9', name: 'Dividir em 9', cat: 'split', ...splitEffect(9) },
  {
    id: 'mirrorH', name: 'Espelho', cat: 'split',
    prev(env) {
      const { ctx, W, H } = env;
      const src = env.snapshot();
      const hw = Math.floor(W / 2);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0, hw, H, 0, 0, hw, H);
      ctx.restore();
    },
    ff: ({ inL, outL, W, L }) => {
      const a = L('ma'), b = L('mb'), c = L('mc');
      return `[${inL}]crop=${Math.floor(W / 4) * 2}:ih:0:0,split[${a}][${b}];[${b}]hflip[${c}];[${a}][${c}]hstack,scale=${W}:ih[${outL}]`;
    },
  },
  {
    id: 'mirrorV', name: 'Espelho vertical', cat: 'split',
    prev(env) {
      const { ctx, W, H } = env;
      const src = env.snapshot();
      const hh = Math.floor(H / 2);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(0, H); ctx.scale(1, -1); ctx.drawImage(src, 0, 0, W, hh, 0, 0, W, hh);
      ctx.restore();
    },
    ff: ({ inL, outL, H, L }) => {
      const a = L('ma'), b = L('mb'), c = L('mc');
      return `[${inL}]crop=iw:${Math.floor(H / 4) * 2}:0:0,split[${a}][${b}];[${b}]vflip[${c}];[${a}][${c}]vstack,scale=iw:${H}[${outL}]`;
    },
  },
  {
    id: 'kaleido', name: 'Caleidoscópio', cat: 'split',
    prev(env) {
      const { ctx, W, H } = env;
      const src = env.snapshot();
      const hw = W / 2, hh = H / 2;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const q = (sx, sy, tx, ty) => { ctx.save(); ctx.translate(tx, ty); ctx.scale(sx, sy); ctx.drawImage(src, 0, 0, hw, hh, 0, 0, hw, hh); ctx.restore(); };
      q(1, 1, 0, 0); q(-1, 1, W, 0); q(1, -1, 0, H); q(-1, -1, W, H);
      ctx.restore();
    },
    ff: ({ inL, outL, W, H, L }) => {
      const a = L('ka'), b = L('kb'), c = L('kc'), d = L('kd'), e = L('ke'), f = L('kf');
      return `[${inL}]crop=${Math.floor(W / 4) * 2}:${Math.floor(H / 4) * 2}:0:0,split[${a}][${b}];[${b}]hflip[${c}];[${a}][${c}]hstack,split[${d}][${e}];[${e}]vflip[${f}];[${d}][${f}]vstack,scale=${W}:${H}[${outL}]`;
    },
  },

  // Partículas
  {
    id: 'hearts', name: 'Corações', cat: 'party',
    layer: {
      blend: 'normal',
      draw(ctx, W, H, t, D, k, seed) {
        const n = Math.round(10 + 16 * k), m = Math.min(W, H), em = ['❤️', '💖', '💕', '💗'];
        for (let i = 0; i < n; i++) {
          const size = m * (0.05 + 0.06 * rnd(seed, i, 1));
          const speed = H * (0.16 + 0.2 * rnd(seed, i, 2));
          const span = H + size * 2;
          const y = H + size - ((t * speed + rnd(seed, i, 3) * span) % span);
          const x = W * (0.05 + 0.9 * rnd(seed, i, 4)) + Math.sin(t * 1.7 + i) * m * 0.03;
          ctx.globalAlpha = 0.95 * clamp01((y + size) / (H * 0.3));
          emojiAt(ctx, em[i % 4], x, y, size);
        }
        ctx.globalAlpha = 1;
      },
    },
  },
  {
    id: 'stars', name: 'Estrelas', cat: 'party',
    layer: {
      blend: 'normal',
      draw(ctx, W, H, t, D, k, seed) {
        const n = Math.round(14 + 22 * k), m = Math.min(W, H);
        for (let i = 0; i < n; i++) {
          const tw = 0.5 + 0.5 * Math.sin(t * (2 + 3 * rnd(seed, i, 1)) + TAU * rnd(seed, i, 2));
          const r = m * (0.012 + 0.025 * rnd(seed, i, 3)) * (0.4 + 0.6 * tw);
          const x = rnd(seed, i, 4) * W, y = rnd(seed, i, 5) * H;
          ctx.globalAlpha = 0.25 + 0.75 * tw;
          ctx.fillStyle = rnd(seed, i, 6) > 0.6 ? '#ffe680' : '#ffffff';
          ctx.shadowColor = 'rgba(255,255,220,0.9)';
          ctx.shadowBlur = r * 1.5;
          starPath(ctx, x, y, r, t * 0.6 + i);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;
      },
    },
  },
  {
    id: 'confetti', name: 'Confete', cat: 'party',
    layer: {
      blend: 'normal',
      draw(ctx, W, H, t, D, k, seed) {
        const n = Math.round(30 + 60 * k), m = Math.min(W, H);
        const colors = ['#ff4d4d', '#ffd60a', '#19d3df', '#a855f7', '#22c55e', '#ff7ab6', '#3b82f6'];
        for (let i = 0; i < n; i++) {
          const w = m * (0.012 + 0.012 * rnd(seed, i, 1)), h = w * (0.45 + 0.4 * rnd(seed, i, 2));
          const speed = H * (0.22 + 0.25 * rnd(seed, i, 3));
          const span = H + w * 4;
          const y = ((t * speed + rnd(seed, i, 4) * span) % span) - w * 2;
          const x = W * rnd(seed, i, 5) + Math.sin(t * (1.5 + rnd(seed, i, 6)) + i) * m * 0.04;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t * (2 + 4 * rnd(seed, i, 7)) + i);
          ctx.scale(1, Math.abs(Math.cos(t * 3 + i)) * 0.8 + 0.2);
          ctx.fillStyle = colors[i % colors.length];
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.restore();
        }
      },
    },
  },
  {
    id: 'snow', name: 'Neve', cat: 'party',
    layer: {
      blend: 'normal',
      draw(ctx, W, H, t, D, k, seed) {
        const n = Math.round(50 + 110 * k), m = Math.min(W, H);
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < n; i++) {
          const r = m * (0.003 + 0.008 * rnd(seed, i, 1));
          const speed = H * (0.05 + 0.12 * rnd(seed, i, 2)) * (0.5 + r / (m * 0.011));
          const span = H + r * 4;
          const y = ((t * speed + rnd(seed, i, 3) * span) % span) - r * 2;
          const x = W * rnd(seed, i, 4) + Math.sin(t * (0.8 + rnd(seed, i, 5)) + i) * m * 0.03;
          ctx.globalAlpha = 0.55 + 0.45 * rnd(seed, i, 6);
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
    },
  },
  {
    id: 'rain', name: 'Chuva', cat: 'party',
    ops: [{ op: 'brightness', v: 0.88 }, { op: 'saturate', v: 0.85 }],
    layer: {
      blend: 'normal',
      draw(ctx, W, H, t, D, k, seed) {
        const n = Math.round(60 + 120 * k), m = Math.min(W, H);
        ctx.strokeStyle = 'rgba(205,225,255,0.45)';
        ctx.lineWidth = Math.max(1, m * 0.0022);
        ctx.lineCap = 'round';
        const ang = 0.18;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const len = H * (0.04 + 0.04 * rnd(seed, i, 1));
          const speed = H * (1.2 + 0.8 * rnd(seed, i, 2));
          const span = H + len * 2;
          const y = ((t * speed + rnd(seed, i, 3) * span) % span) - len;
          const x = W * (rnd(seed, i, 4) * 1.2 - 0.1) - y * Math.tan(ang);
          ctx.moveTo(x, y);
          ctx.lineTo(x - len * Math.sin(ang), y + len * Math.cos(ang));
        }
        ctx.stroke();
      },
    },
  },
  {
    id: 'bubbles', name: 'Bolhas', cat: 'party',
    layer: {
      blend: 'normal',
      draw(ctx, W, H, t, D, k, seed) {
        const n = Math.round(10 + 22 * k), m = Math.min(W, H);
        for (let i = 0; i < n; i++) {
          const r = m * (0.015 + 0.04 * rnd(seed, i, 1));
          const speed = H * (0.08 + 0.12 * rnd(seed, i, 2));
          const span = H + r * 4;
          const y = H + r * 2 - ((t * speed + rnd(seed, i, 3) * span) % span);
          const x = W * rnd(seed, i, 4) + Math.sin(t * (1 + rnd(seed, i, 5)) + i) * m * 0.04;
          ctx.lineWidth = Math.max(1, r * 0.08);
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.fillStyle = 'rgba(180,230,255,0.12)';
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, TAU); ctx.fill();
        }
      },
    },
  },
  {
    id: 'countdown', name: 'Contagem 3-2-1', cat: 'party',
    dur: 3,
    layer: {
      blend: 'normal',
      draw(ctx, W, H, t, D) {
        const seg = D / 3;
        const i = Math.min(2, Math.floor(t / seg));
        const p = clamp01((t - i * seg) / seg);
        const m = Math.min(W, H), R = m * 0.22;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = m * 0.018;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#19d3df'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(W / 2, H / 2, R, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.stroke();
        const s = 1 + 0.35 * Math.pow(1 - Math.min(1, p * 3), 3);
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s, s);
        ctx.font = `900 ${m * 0.26}px Montserrat, "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = m * 0.02;
        ctx.fillText(String(3 - i), 0, m * 0.01);
        ctx.restore();
      },
    },
  },
];

export const effectDef = (id) => EFFECTS.find((e) => e.id === id) || null;
// Efeitos que precisam do trecho isolado (não só de ops com "enable").
export const isSegmentEffect = (def) => !!(def && (def.ff || def.layer || def.duo));

// Duotone: luminância mapeada entre duas cores (mesma matriz de cinza do CSS nos dois lados).
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
for (const def of EFFECTS) {
  if (!def.duo) continue;
  const [c1, c2] = def.duo.map(hexRgb);
  def.prev = (env) => {
    const { ctx, k } = env;
    const src = env.snapshot();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = k;
    ctx.filter = env.svg ? `grayscale(1) url(#${env.svg.duotone(c1, c2)})` : 'grayscale(1)';
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  };
  def.ff = ({ inL, outL, k, L }) => {
    const a = L('da'), b = L('db'), d = L('dd');
    const g = 'rr=0.2126:rg=0.7152:rb=0.0722:gr=0.2126:gg=0.7152:gb=0.0722:br=0.2126:bg=0.7152:bb=0.0722';
    const lut = (i) => `clip(${n4(c1[i] * 255)}+${n4(c2[i] - c1[i])}*val,0,255)`;
    return `[${inL}]format=gbrp,split[${a}][${b}];[${b}]colorchannelmixer=${g},lutrgb=r='${lut(0)}':g='${lut(1)}':b='${lut(2)}'[${d}];` +
      `[${d}][${a}]blend=all_mode=normal:all_opacity=${n4(k)}[${outL}]`;
  };
}
