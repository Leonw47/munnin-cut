// Animações de entrada/saída e contínuas (loop). A mesma tabela gera o estado numérico (prévia)
// e as expressões do FFmpeg (exportação).
//
// ease: 'cubic' (padrão), 'back' (passa um pouco e volta), 'bounce' (quica), 'elastic' (mola).
// Entrada usa a curva "saindo" (chega devagar); saída usa a espelhada (começa devagar).

const DEFS = {
  in: {
    fade: { alpha: 0 },
    zoomIn: { scale: 0.6, alpha: 0 },
    zoomOut: { scale: 1.4, alpha: 0 },
    pop: { scale: 0, ease: 'back' },
    slideLeft: { dx: 1 },
    slideRight: { dx: -1 },
    slideUp: { dy: 1 },
    slideDown: { dy: -1 },
    spin: { rot: -2 * Math.PI, scale: 0.3, alpha: 0 },
    flip: { rot: -Math.PI / 2, scale: 0.6, alpha: 0 },
    // 1.8
    drop: { dy: -1, ease: 'bounce' },
    bounceIn: { scale: 0.15, ease: 'bounce' },
    elastic: { scale: 0, ease: 'elastic' },
    swing: { rot: 0.6, alpha: 0, ease: 'elastic' },
    bounceLeft: { dx: 1, ease: 'bounce' },
    bounceRight: { dx: -1, ease: 'bounce' },
    riseElastic: { dy: 0.6, ease: 'elastic' },
    whirl: { rot: -Math.PI, scale: 0, ease: 'back' },
  },
  out: {
    fade: { alpha: 0 },
    zoomIn: { scale: 1.4, alpha: 0 },
    zoomOut: { scale: 0.6, alpha: 0 },
    pop: { scale: 0, ease: 'back' },
    slideLeft: { dx: -1 },
    slideRight: { dx: 1 },
    slideUp: { dy: -1 },
    slideDown: { dy: 1 },
    spin: { rot: 2 * Math.PI, scale: 0.3, alpha: 0 },
    flip: { rot: Math.PI / 2, scale: 0.6, alpha: 0 },
    // 1.8
    drop: { dy: 1.1, ease: 'back' },
    elastic: { scale: 0, ease: 'elastic' },
    swing: { rot: -0.6, alpha: 0, ease: 'back' },
    blackhole: { rot: 2 * Math.PI, scale: 0 },
    riseFade: { dy: -0.35, alpha: 0 },
    bounceOut: { scale: 0, ease: 'bounce' },
  },
};

// Animações contínuas (o clipe inteiro): pulsar, flutuar, balançar…  f = ciclos por segundo (× velocidade)
const LOOPS = {
  pulse: { f: 1.2 },
  heartbeat: { f: 1.1 },
  float: { f: 0.5 },
  sway: { f: 0.6 },
  shake: { f: 1 },
  wiggle: { f: 1.6 },
  spin: { f: 0.25 },
  kenburns: { f: 0 },
};

const C1 = 1.70158, C3 = C1 + 1;
const TAU = 2 * Math.PI;
const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ---- curvas (prévia) ----
function bounceOut(p) {
  const n1 = 7.5625, d1 = 2.75;
  if (p < 1 / d1) return n1 * p * p;
  if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
  if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
  return n1 * (p -= 2.625 / d1) * p + 0.984375;
}
const elasticOut = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * (TAU / 3)) + 1);
function easeOut(name, p) {
  if (name === 'back') return 1 + C3 * Math.pow(p - 1, 3) + C1 * Math.pow(p - 1, 2);
  if (name === 'bounce') return bounceOut(p);
  if (name === 'elastic') return elasticOut(p);
  return 1 - Math.pow(1 - p, 3);
}
function easeIn(name, q) {
  if (name === 'back') return C3 * q * q * q - C1 * q * q;
  if (name === 'bounce') return 1 - bounceOut(1 - q);
  if (name === 'elastic') return 1 - elasticOut(1 - q);
  return q * q * q;
}

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

const loopDef = (clip) => (clip.animLoop && clip.animLoop.id !== 'none' ? LOOPS[clip.animLoop.id] : null);
const loopForca = (clip) => Math.max(0, Math.min(2, (clip.animLoop?.amount ?? 100) / 100));
const loopVel = (clip) => Math.max(0.1, Math.min(4, clip.animLoop?.speed ?? 1));

// Estado no tempo local lt (segundos desde o início do clipe).
export function animState(clip, lt) {
  const st = { alpha: 1, scale: 1, dx: 0, dy: 0, rot: 0 };
  const { di, dout } = animDurations(clip);
  if (di > 0) {
    const d = DEFS.in[clip.animIn.id];
    const p = clamp(lt / di);
    const e = easeOut(d.ease, p);
    if (d.alpha !== undefined) st.alpha *= d.alpha + (1 - d.alpha) * p;
    if (d.scale !== undefined) st.scale *= d.scale + (1 - d.scale) * e;
    if (d.dx) st.dx += d.dx * (1 - e);
    if (d.dy) st.dy += d.dy * (1 - e);
    if (d.rot) st.rot += d.rot * (1 - e);
  }
  if (dout > 0) {
    const d = DEFS.out[clip.animOut.id];
    const q = clamp((lt - (clip.duration - dout)) / dout);
    const e = easeIn(d.ease, q);
    if (d.alpha !== undefined) st.alpha *= 1 + (d.alpha - 1) * q;
    if (d.scale !== undefined) st.scale *= 1 + (d.scale - 1) * e;
    if (d.dx) st.dx += d.dx * e;
    if (d.dy) st.dy += d.dy * e;
    if (d.rot) st.rot += d.rot * e;
  }
  const L = loopDef(clip);
  if (L) {
    const a = loopForca(clip), w = TAU * L.f * loopVel(clip), t = lt;
    switch (clip.animLoop.id) {
      case 'pulse': st.scale *= 1 + 0.06 * a * Math.sin(w * t); break;
      case 'heartbeat': st.scale *= 1 + 0.09 * a * Math.pow(Math.max(0, Math.sin(w * t)), 8); break;
      case 'float': st.dy += 0.015 * a * Math.sin(w * t); break;
      case 'sway': st.rot += 0.07 * a * Math.sin(w * t); break;
      case 'shake':
        st.dx += 0.006 * a * (Math.sin(TAU * 7.3 * loopVel(clip) * t) + 0.6 * Math.sin(TAU * 11.1 * loopVel(clip) * t));
        st.dy += 0.006 * a * (Math.sin(TAU * 8.7 * loopVel(clip) * t + 1) + 0.6 * Math.sin(TAU * 12.9 * loopVel(clip) * t + 2));
        break;
      case 'wiggle': st.rot += 0.1 * a * Math.sin(w * t) * Math.sin(w * 0.37 * t + 1); break;
      case 'spin': st.rot += w * t; break;
      case 'kenburns': st.scale *= 1 + 0.15 * a * clamp(t / Math.max(0.1, clip.duration)); break;
      default: break;
    }
  }
  st.scale = Math.max(0, st.scale);
  st.alpha = clamp(st.alpha);
  return st;
}

const n4 = (x) => String(Math.round(x * 10000) / 10000);

// ---- curvas (FFmpeg) ----
function eOut(name, P) {
  if (name === 'back') return `(1+${C3}*pow(${P}-1,3)+${C1}*pow(${P}-1,2))`;
  if (name === 'bounce') return bounceX(P);
  if (name === 'elastic') return elasticX(P);
  return `(1-pow(1-${P},3))`;
}
function eIn(name, Q) {
  if (name === 'back') return `(${C3}*pow(${Q},3)-${C1}*pow(${Q},2))`;
  if (name === 'bounce') return `(1-${bounceX(`(1-${Q})`)})`;
  if (name === 'elastic') return `(1-${elasticX(`(1-${Q})`)})`;
  return `pow(${Q},3)`;
}
function bounceX(P) {
  const d1 = 2.75;
  return `if(lt(${P},${n4(1 / d1)}),7.5625*${P}*${P},if(lt(${P},${n4(2 / d1)}),7.5625*pow(${P}-${n4(1.5 / d1)},2)+0.75,if(lt(${P},${n4(2.5 / d1)}),7.5625*pow(${P}-${n4(2.25 / d1)},2)+0.9375,7.5625*pow(${P}-${n4(2.625 / d1)},2)+0.984375)))`;
}
const elasticX = (P) => `if(lte(${P},0),0,if(gte(${P},1),1,pow(2,-10*${P})*sin((${P}*10-0.75)*${n4(TAU / 3)})+1))`;

// Expressões FFmpeg. t0 = instante (no fluxo) em que o clipe começa.
function inP(t0, di) { return `clip((t-${n4(t0)})/${n4(di)},0,1)`; }
function outQ(t0, dur, dout) { return `clip((t-${n4(t0 + dur - dout)})/${n4(dout)},0,1)`; }
const LT = (t0) => `(t-${n4(t0)})`;

export function animScaleExpr(clip, t0) {
  const { di, dout } = animDurations(clip);
  const terms = [];
  if (di > 0) {
    const d = DEFS.in[clip.animIn.id];
    if (d.scale !== undefined) terms.push(`(${n4(d.scale)}+${n4(1 - d.scale)}*${eOut(d.ease, inP(t0, di))})`);
  }
  if (dout > 0) {
    const d = DEFS.out[clip.animOut.id];
    if (d.scale !== undefined) terms.push(`(1+${n4(d.scale - 1)}*${eIn(d.ease, outQ(t0, clip.duration, dout))})`);
  }
  const L = loopDef(clip);
  if (L) {
    const a = loopForca(clip), w = TAU * L.f * loopVel(clip);
    if (clip.animLoop.id === 'pulse') terms.push(`(1+${n4(0.06 * a)}*sin(${n4(w)}*${LT(t0)}))`);
    if (clip.animLoop.id === 'heartbeat') terms.push(`(1+${n4(0.09 * a)}*pow(max(0,sin(${n4(w)}*${LT(t0)})),8))`);
    if (clip.animLoop.id === 'kenburns') terms.push(`(1+${n4(0.15 * a)}*clip(${LT(t0)}/${n4(Math.max(0.1, clip.duration))},0,1))`);
  }
  return terms.length ? `max(0.001,${terms.join('*')})` : '';
}

export function animOffsetExprs(clip, t0) {
  const { di, dout } = animDurations(clip);
  const dx = [], dy = [];
  if (di > 0) {
    const d = DEFS.in[clip.animIn.id];
    const e = eOut(d.ease, inP(t0, di));
    if (d.dx) dx.push(`${n4(d.dx)}*(1-${e})`);
    if (d.dy) dy.push(`${n4(d.dy)}*(1-${e})`);
  }
  if (dout > 0) {
    const d = DEFS.out[clip.animOut.id];
    const e = eIn(d.ease, outQ(t0, clip.duration, dout));
    if (d.dx) dx.push(`${n4(d.dx)}*${e}`);
    if (d.dy) dy.push(`${n4(d.dy)}*${e}`);
  }
  const L = loopDef(clip);
  if (L) {
    const a = loopForca(clip), w = TAU * L.f * loopVel(clip), v = loopVel(clip), t = LT(t0);
    if (clip.animLoop.id === 'float') dy.push(`${n4(0.015 * a)}*sin(${n4(w)}*${t})`);
    if (clip.animLoop.id === 'shake') {
      dx.push(`${n4(0.006 * a)}*(sin(${n4(TAU * 7.3 * v)}*${t})+0.6*sin(${n4(TAU * 11.1 * v)}*${t}))`);
      dy.push(`${n4(0.006 * a)}*(sin(${n4(TAU * 8.7 * v)}*${t}+1)+0.6*sin(${n4(TAU * 12.9 * v)}*${t}+2))`);
    }
  }
  return { dx: dx.join('+'), dy: dy.join('+') };
}

// Giro animado (radianos) — usado no filtro rotate da exportação.
export function animRotExpr(clip, t0) {
  const { di, dout } = animDurations(clip);
  const terms = [];
  if (di > 0) {
    const d = DEFS.in[clip.animIn.id];
    if (d.rot) terms.push(`${n4(d.rot)}*(1-${eOut(d.ease, inP(t0, di))})`);
  }
  if (dout > 0) {
    const d = DEFS.out[clip.animOut.id];
    if (d.rot) terms.push(`${n4(d.rot)}*${eIn(d.ease, outQ(t0, clip.duration, dout))}`);
  }
  const L = loopDef(clip);
  if (L) {
    const a = loopForca(clip), w = TAU * L.f * loopVel(clip), t = LT(t0);
    if (clip.animLoop.id === 'sway') terms.push(`${n4(0.07 * a)}*sin(${n4(w)}*${t})`);
    if (clip.animLoop.id === 'wiggle') terms.push(`${n4(0.1 * a)}*sin(${n4(w)}*${t})*sin(${n4(w * 0.37)}*${t}+1)`);
    if (clip.animLoop.id === 'spin') terms.push(`${n4(w)}*${t}`);
  }
  return terms.join('+');
}

export function animFades(clip, t0) {
  const { di, dout } = animDurations(clip);
  const f = [];
  if (di > 0 && DEFS.in[clip.animIn.id].alpha !== undefined) f.push(`fade=t=in:st=${n4(t0)}:d=${n4(di)}:alpha=1`);
  if (dout > 0 && DEFS.out[clip.animOut.id].alpha !== undefined) f.push(`fade=t=out:st=${n4(t0 + clip.duration - dout)}:d=${n4(dout)}:alpha=1`);
  return f;
}
