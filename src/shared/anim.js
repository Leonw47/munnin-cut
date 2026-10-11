// Animações de entrada/saída. A mesma tabela gera o estado numérico (prévia)
// e as expressões do FFmpeg (exportação).

const DEFS = {
  in: {
    fade: { alpha: 0 },
    zoomIn: { scale: 0.6, alpha: 0 },
    zoomOut: { scale: 1.4, alpha: 0 },
    pop: { scale: 0, back: true },
    slideLeft: { dx: 1 },
    slideRight: { dx: -1 },
    slideUp: { dy: 1 },
    slideDown: { dy: -1 },
  },
  out: {
    fade: { alpha: 0 },
    zoomIn: { scale: 1.4, alpha: 0 },
    zoomOut: { scale: 0.6, alpha: 0 },
    pop: { scale: 0, back: true },
    slideLeft: { dx: -1 },
    slideRight: { dx: 1 },
    slideUp: { dy: -1 },
    slideDown: { dy: 1 },
  },
};

const C1 = 1.70158, C3 = C1 + 1;
const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const easeInCubic = (p) => p * p * p;
const easeOutBack = (p) => 1 + C3 * Math.pow(p - 1, 3) + C1 * Math.pow(p - 1, 2);
const easeInBack = (p) => C3 * p * p * p - C1 * p * p;

// Durações efetivas (entrada + saída nunca passam da duração do clipe).
export function animDurations(clip) {
  const dur = clip.duration;
  let di = clip.animIn && clip.animIn.id !== 'none' && DEFS.in[clip.animIn.id] ? clip.animIn.duration || 0.5 : 0;
  let dout = clip.animOut && clip.animOut.id !== 'none' && DEFS.out[clip.animOut.id] ? clip.animOut.duration || 0.5 : 0;
  if (di + dout > dur && di + dout > 0) {
    const f = dur / (di + dout);
    di *= f; dout *= f;
  }
  return { di, dout };
}

// Estado no tempo local lt (segundos desde o início do clipe).
export function animState(clip, lt) {
  const st = { alpha: 1, scale: 1, dx: 0, dy: 0 };
  const { di, dout } = animDurations(clip);
  if (di > 0) {
    const d = DEFS.in[clip.animIn.id];
    const p = clamp(lt / di);
    const e = d.back ? easeOutBack(p) : easeOutCubic(p);
    if (d.alpha !== undefined) st.alpha *= d.alpha + (1 - d.alpha) * p;
    if (d.scale !== undefined) st.scale *= d.scale + (1 - d.scale) * e;
    if (d.dx) st.dx += d.dx * (1 - e);
    if (d.dy) st.dy += d.dy * (1 - e);
  }
  if (dout > 0) {
    const d = DEFS.out[clip.animOut.id];
    const q = clamp((lt - (clip.duration - dout)) / dout);
    const e = d.back ? easeInBack(q) : easeInCubic(q);
    if (d.alpha !== undefined) st.alpha *= 1 + (d.alpha - 1) * q;
    if (d.scale !== undefined) st.scale *= 1 + (d.scale - 1) * e;
    if (d.dx) st.dx += d.dx * e;
    if (d.dy) st.dy += d.dy * e;
  }
  st.scale = Math.max(0, st.scale);
  st.alpha = clamp(st.alpha);
  return st;
}

const n4 = (x) => String(Math.round(x * 10000) / 10000);

// Expressões FFmpeg. t0 = instante (no fluxo) em que o clipe começa.
function inP(t0, di) { return `clip((t-${n4(t0)})/${n4(di)},0,1)`; }
function outQ(t0, dur, dout) { return `clip((t-${n4(t0 + dur - dout)})/${n4(dout)},0,1)`; }
function eOut(p, back) { return back ? `(1+${C3}*pow(${p}-1,3)+${C1}*pow(${p}-1,2))` : `(1-pow(1-${p},3))`; }
function eIn(q, back) { return back ? `(${C3}*pow(${q},3)-${C1}*pow(${q},2))` : `pow(${q},3)`; }

export function animScaleExpr(clip, t0) {
  const { di, dout } = animDurations(clip);
  const terms = [];
  if (di > 0) {
    const d = DEFS.in[clip.animIn.id];
    if (d.scale !== undefined) terms.push(`(${n4(d.scale)}+${n4(1 - d.scale)}*${eOut(inP(t0, di), d.back)})`);
  }
  if (dout > 0) {
    const d = DEFS.out[clip.animOut.id];
    if (d.scale !== undefined) terms.push(`(1+${n4(d.scale - 1)}*${eIn(outQ(t0, clip.duration, dout), d.back)})`);
  }
  return terms.length ? `max(0.001,${terms.join('*')})` : '';
}

export function animOffsetExprs(clip, t0) {
  const { di, dout } = animDurations(clip);
  const dx = [], dy = [];
  if (di > 0) {
    const d = DEFS.in[clip.animIn.id];
    const e = eOut(inP(t0, di), d.back);
    if (d.dx) dx.push(`${n4(d.dx)}*(1-${e})`);
    if (d.dy) dy.push(`${n4(d.dy)}*(1-${e})`);
  }
  if (dout > 0) {
    const d = DEFS.out[clip.animOut.id];
    const e = eIn(outQ(t0, clip.duration, dout), d.back);
    if (d.dx) dx.push(`${n4(d.dx)}*${e}`);
    if (d.dy) dy.push(`${n4(d.dy)}*${e}`);
  }
  return { dx: dx.join('+'), dy: dy.join('+') };
}

export function animFades(clip, t0) {
  const { di, dout } = animDurations(clip);
  const f = [];
  if (di > 0 && DEFS.in[clip.animIn.id].alpha !== undefined) f.push(`fade=t=in:st=${n4(t0)}:d=${n4(di)}:alpha=1`);
  if (dout > 0 && DEFS.out[clip.animOut.id].alpha !== undefined) f.push(`fade=t=out:st=${n4(t0 + clip.duration - dout)}:d=${n4(dout)}:alpha=1`);
  return f;
}
