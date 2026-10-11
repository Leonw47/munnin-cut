// Transições de câmera (giro, zoom, chicote, rolar, impacto).
// Cada transição descreve, em função do progresso P (0→1), a "câmera" aplicada ao clipe que sai (A)
// e ao que entra (B): zoom Z, deslocamento tx/ty (fração do quadro), giro th (rad); o desfoque de
// movimento K (0..1) e o peso de B na mistura (Wb). As curvas são expressões FFmpeg (variáveis P e R,
// R = lado maior / lado menor) avaliadas pelo mesmo texto na prévia (expr.js).
import { evalExpr, substVar } from './expr.js';
import { steppedBlend } from './stepblend.js';

const S = '(P*P*(3-2*P))';
const P1 = 'clip(2*P,0,1)';
const P2 = 'clip(2*P-1,0,1)';
const EIN = (x) => `pow(${x},3)`;
const EOUT = (x) => `(1-pow(1-${x},3))`;
const cover = (th) => `(abs(cos(${th}))+R*abs(sin(${th}))+0.01)`;
const MIX = 'clip((P-0.42)/0.16,0,1)';
const BLUR = 'sin(PI*P)';

function spin(dir, zoomAmp) {
  const th = `${dir}*2*PI*${S}`;
  const cam = { th, Z: `${cover(th)}*(1+${zoomAmp}*sin(PI*P))` };
  return { A: cam, B: cam, K: BLUR, Wb: MIX };
}
function whip(ax, sign) {
  const outA = `${-sign}*1.1*${EIN(P1)}`;
  const inB = `${sign}*1.1*(1-${EOUT(P2)})`;
  const k = ax === 'x' ? 'tx' : 'ty';
  const zA = `(1+2*abs(${outA})+0.01)`, zB = `(1+2*abs(${inB})+0.01)`;
  return { A: { [k]: outA, Z: zA }, B: { [k]: inB, Z: zB }, K: 'pow(sin(PI*P),0.7)', Wb: MIX };
}

export const CAM_TRANSITIONS = {
  mc_spin: spin(1, 0.2),
  mc_spinccw: spin(-1, 0.2),
  mc_spinzoom: spin(1, 1.1),
  mc_zoom: { A: { Z: `1+2.2*${EIN(P1)}` }, B: { Z: `1+2.2*(1-${EOUT(P2)})` }, K: BLUR, Wb: MIX },
  mc_whipl: whip('x', 1),
  mc_whipr: whip('x', -1),
  mc_whipu: whip('y', 1),
  mc_whipd: whip('y', -1),
  mc_roll: (() => {
    const thA = `PI/2*${EIN(P1)}`, thB = `-PI/2*(1-${EOUT(P2)})`;
    return { A: { th: thA, Z: `${cover(thA)}*(1+0.15*sin(PI*P))` }, B: { th: thB, Z: `${cover(thB)}*(1+0.15*sin(PI*P))` }, K: BLUR, Wb: MIX };
  })(),
  mc_impact: (() => {
    const cam = { tx: '0.035*sin(PI*P)*sin(83*P)', ty: '0.035*sin(PI*P)*cos(67*P)', Z: '1.09+0.1*sin(PI*P)' };
    return { A: cam, B: cam, K: '0.7*sin(PI*P)', Wb: MIX };
  })(),
};

export const isCamTransition = (id) => !!CAM_TRANSITIONS[id];

const KEYS = ['Z', 'tx', 'ty', 'th'];
const DEF = { Z: '1', tx: '0', ty: '0', th: '0' };

// ---------- Prévia ----------
export function camAt(cam, P, R) {
  const v = { P, R };
  const o = {};
  for (const k of KEYS) o[k] = evalExpr(cam?.[k] ?? DEF[k], v);
  return o;
}

export function drawCamFrame(ctx, src, m, W, H) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2 + m.tx * W, H / 2 + m.ty * H);
  ctx.rotate(m.th);
  ctx.scale(m.Z, m.Z);
  ctx.drawImage(src, -W / 2, -H / 2, W, H);
  ctx.restore();
}

// Desenha a transição: A e B já renderizados em canvases; tmp(i) devolve canvases temporários.
export function drawCamTransition(ctx, id, A, B, P, W, H, tmp) {
  const def = CAM_TRANSITIONS[id];
  const R = Math.max(W, H) / Math.min(W, H);
  const K = Math.max(0, evalExpr(def.K || '0', { P, R }));
  const Wb = Math.max(0, Math.min(1, evalExpr(def.Wb, { P, R })));
  const side = (src, cam, i) => {
    const t = tmp(i);
    drawCamFrame(t.ctx, src, camAt(cam, P, R), W, H);
    if (K > 0.01) {
      const b = tmp(i + 1);
      b.ctx.filter = `blur(${(0.025 * H).toFixed(2)}px)`;
      b.ctx.drawImage(t.canvas, 0, 0);
      b.ctx.filter = 'none';
      t.ctx.globalAlpha = Math.min(1, K);
      t.ctx.drawImage(b.canvas, 0, 0);
      t.ctx.globalAlpha = 1;
    }
    return t.canvas;
  };
  const a = side(A, def.A, 20);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(a, 0, 0);
  if (Wb > 0.001) {
    const b = side(B, def.B, 22);
    ctx.globalAlpha = Wb;
    ctx.drawImage(b, 0, 0);
  }
  ctx.restore();
}

// ---------- Exportação ----------
const n4 = (x) => String(Math.round(x * 10000) / 10000);

// Filtro perspective que aplica a câmera (expressões em P) quando P = progExpr (que usa in/FPS).
export function perspectiveFor(cam, progExpr) {
  const sub = (s) => `(${substVar(substVar(s ?? '0', 'P', progExpr), 'R', 'max(W,H)/min(W,H)')})`;
  const Z = sub(cam?.Z ?? '1'), tx = sub(cam?.tx ?? '0'), ty = sub(cam?.ty ?? '0'), th = sub(cam?.th ?? '0');
  const corner = (cx, cy) => {
    const dx = `(${cx}-W/2-${tx}*W)`, dy = `(${cy}-H/2-${ty}*H)`;
    return [`W/2+(cos(${th})*${dx}+sin(${th})*${dy})/${Z}`, `H/2+(-sin(${th})*${dx}+cos(${th})*${dy})/${Z}`];
  };
  const [x0, y0] = corner('0', '0'), [x1, y1] = corner('W', '0'), [x2, y2] = corner('0', 'H'), [x3, y3] = corner('W', 'H');
  return `perspective=x0='${x0}':y0='${y0}':x1='${x1}':y1='${y1}':x2='${x2}':y2='${y2}':x3='${x3}':y3='${y3}':interpolation=linear:sense=source:eval=frame`;
}

/**
 * Cadeia (lista de filtros "[in]...[out]") que aplica as câmeras de entrada/saída a um clipe da faixa principal.
 * inc / out: { id, d } da transição que entra (clipe é B) e da que sai (clipe é A). dur: duração do clipe.
 */
export function camClipChain({ inL, outL, inc, out, dur, FPS, H, L }) {
  const parts = [];
  let cur = inL;
  const kTerms = []; // [início, fim, função K(t)]
  const step = (filter) => { const o = L('ct'); parts.push(`[${cur}]${filter}[${o}]`); cur = o; };
  if (out && isCamTransition(out.id)) {
    const def = CAM_TRANSITIONS[out.id];
    const t0 = dur - out.d;
    const prog = `clip(((in-1)/${FPS}-${n4(t0)})/${n4(out.d)},0,1)`;
    step(`${perspectiveFor(def.A, prog)}:enable='gte(t,${n4(t0 - 0.5 / FPS)})'`);
    if (def.K) kTerms.push([t0, dur, (t) => evalExpr(def.K, { P: Math.min(1, Math.max(0, (t - t0) / out.d)), R: 1 })]);
  }
  if (inc && isCamTransition(inc.id)) {
    const def = CAM_TRANSITIONS[inc.id];
    const prog = `clip(((in-1)/${FPS})/${n4(inc.d)},0,1)`;
    step(`${perspectiveFor(def.B, prog)}:enable='lte(t,${n4(inc.d + 0.5 / FPS)})'`);
    if (def.K) kTerms.push([0, inc.d, (t) => evalExpr(def.K, { P: Math.min(1, Math.max(0, t / inc.d)), R: 1 })]);
  }
  for (const [s0, s1, Kfn] of kTerms) {
    // desfoque de movimento: mistura com uma cópia desfocada, quadro a quadro (sem expressão por pixel)
    const a = L('cb'), b = L('cb'), c = L('cb'), o = L('ct');
    parts.push(`[${cur}]format=gbrp,split[${a}][${b}];[${b}]gblur=sigma=${n4(0.025 * H)}:enable='between(t,${n4(s0 - 0.5 / FPS)},${n4(s1 + 0.5 / FPS)})'[${c}]`);
    const m = L('cm');
    parts.push(...steppedBlend({ aL: a, bL: c, outL: m, mode: 'mix', Kfn, t0: s0, t1: s1, rate: FPS, L }));
    parts.push(`[${m}]format=yuv420p[${o}]`);
    cur = o;
  }
  parts.push(`[${cur}]null[${outL}]`);
  return parts;
}

// Expressão do xfade "custom": mistura A→B com o peso Wb (o P do xfade vai de 1 a 0).
export function camMixExpr(id) {
  const w = substVar(CAM_TRANSITIONS[id].Wb, 'P', '1-P');
  return `A*(1-(${w}))+B*(${w})`;
}
