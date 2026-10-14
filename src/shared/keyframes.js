// Pontos de modificação (keyframes): valores que mudam ao longo do clipe, com transição suave.
// clip.kf = { [propriedade]: [{ t, v }] } — t em segundos desde o início do clipe.
// A mesma curva (smoothstep) é usada na prévia e nas expressões do FFmpeg.
import { ADJUST_FIELDS } from './ops.js';

const adj = (key) => ({
  get: (c) => c.adjust?.[key] || 0,
  set: (c, v) => { c.adjust = { ...(c.adjust || {}), [key]: v }; },
});

export const KF_PROPS = {
  x: { name: 'Posição X', get: (c) => c.transform?.x || 0, set: (c, v) => { c.transform = { ...(c.transform || {}), x: v }; } },
  y: { name: 'Posição Y', get: (c) => c.transform?.y || 0, set: (c, v) => { c.transform = { ...(c.transform || {}), y: v }; } },
  scale: { name: 'Escala', get: (c) => c.transform?.scale ?? 1, set: (c, v) => { c.transform = { ...(c.transform || {}), scale: v }; } },
  rotation: { name: 'Rotação', get: (c) => c.transform?.rotation || 0, set: (c, v) => { c.transform = { ...(c.transform || {}), rotation: v }; } },
  opacity: { name: 'Opacidade', get: (c) => c.opacity ?? 1, set: (c, v) => { c.opacity = v; } },
  volume: { name: 'Volume', get: (c) => c.volume ?? 1, set: (c, v) => { c.volume = v; } },
  filter: { name: 'Intensidade do filtro', get: (c) => c.filter?.intensity ?? 100, set: (c, v) => { if (c.filter) c.filter = { ...c.filter, intensity: v }; } },
  ...Object.fromEntries(ADJUST_FIELDS.map((f) => [`adjust.${f.key}`, { name: f.name, ...adj(f.key) }])),
};

export const COLOR_PROPS = ['filter', ...ADJUST_FIELDS.map((f) => `adjust.${f.key}`)];
const SAME_T = 1 / 60;

export const ease = (p) => p * p * (3 - 2 * p); // suave: começa e termina devagar

export function kfValue(list, lt) {
  if (!list?.length) return undefined;
  if (lt <= list[0].t) return list[0].v;
  const last = list[list.length - 1];
  if (lt >= last.t) return last.v;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (lt <= b.t) {
      const p = b.t - a.t > 1e-9 ? (lt - a.t) / (b.t - a.t) : 1;
      return a.v + (b.v - a.v) * ease(p);
    }
  }
  return last.v;
}

export const hasKf = (clip, prop) => !!clip?.kf?.[prop]?.length;
export const anyKf = (clip) => !!clip?.kf && Object.values(clip.kf).some((l) => l?.length);
export const kfConst = (list) => !list?.length || list.every((k) => Math.abs(k.v - list[0].v) < 1e-9);

// Valor da propriedade no tempo local lt (ponto de modificação ou valor fixo do clipe).
export function propAt(clip, prop, lt) {
  return hasKf(clip, prop) ? kfValue(clip.kf[prop], lt) : KF_PROPS[prop].get(clip);
}

// Cópia do clipe com os valores do instante lt (o resto do app desenha esta cópia).
export function resolveAt(clip, lt) {
  if (!anyKf(clip)) return clip;
  const c = { ...clip, transform: { ...(clip.transform || {}) }, adjust: { ...(clip.adjust || {}) }, filter: clip.filter ? { ...clip.filter } : clip.filter };
  for (const [prop, list] of Object.entries(clip.kf)) {
    if (!list?.length || !KF_PROPS[prop]) continue;
    KF_PROPS[prop].set(c, kfValue(list, lt));
  }
  return c;
}

export function kfTimes(clip) {
  const s = new Set();
  for (const list of Object.values(clip?.kf || {})) for (const k of list || []) s.add(Math.round(k.t * 1000) / 1000);
  return [...s].sort((a, b) => a - b);
}

// ---------- Edição (mexem no clipe recebido) ----------
export function upsertKf(clip, prop, t, v) {
  clip.kf = { ...(clip.kf || {}) };
  const list = [...(clip.kf[prop] || [])];
  const i = list.findIndex((k) => Math.abs(k.t - t) < SAME_T);
  if (i >= 0) list[i] = { t: list[i].t, v };
  else list.push({ t, v });
  list.sort((a, b) => a.t - b.t);
  clip.kf[prop] = list;
}

export function removeKfAt(clip, prop, t) {
  if (!clip.kf?.[prop]) return;
  const list = clip.kf[prop].filter((k) => Math.abs(k.t - t) >= SAME_T);
  clip.kf = { ...clip.kf };
  if (list.length) clip.kf[prop] = list;
  else {
    // sem pontos: o valor do último instante vira o valor fixo
    const last = clip.kf[prop].find((k) => Math.abs(k.t - t) < SAME_T);
    if (last) KF_PROPS[prop]?.set(clip, last.v);
    delete clip.kf[prop];
  }
  if (!Object.keys(clip.kf).length) delete clip.kf;
}

export const hasKfAt = (clip, prop, t) => !!clip?.kf?.[prop]?.some((k) => Math.abs(k.t - t) < SAME_T);

// Valor novo de uma propriedade: com pontos, cria/atualiza o ponto em lt; sem pontos, muda o valor fixo.
export function setPropAt(clip, prop, v, lt) {
  if (hasKf(clip, prop)) upsertKf(clip, prop, Math.max(0, Math.min(clip.duration, lt)), v);
  else KF_PROPS[prop].set(clip, v);
}

// Trecho [a, b] dos pontos, recomeçando do zero (dividir clipe / aparar o começo).
export function sliceKf(kf, a, b) {
  if (!kf) return kf;
  const out = {};
  for (const [prop, list] of Object.entries(kf)) {
    if (!list?.length) continue;
    const inside = list.filter((k) => k.t > a + SAME_T && k.t < b - SAME_T).map((k) => ({ t: k.t - a, v: k.v }));
    out[prop] = [{ t: 0, v: kfValue(list, a) }, ...inside, { t: b - a, v: kfValue(list, b) }];
    if (kfConst(out[prop])) out[prop] = [{ t: 0, v: out[prop][0].v }];
  }
  return Object.keys(out).length ? out : undefined;
}

export function scaleKf(kf, k) {
  if (!kf || Math.abs(k - 1) < 1e-9) return kf;
  return Object.fromEntries(Object.entries(kf).map(([p, l]) => [p, l.map((x) => ({ t: x.t * k, v: x.v }))]));
}

// Propriedades que o botão ◆ grava de uma vez, conforme o tipo de clipe.
export function kfPropsFor(clip, media) {
  const p = [];
  if (['video', 'image', 'text', 'shape'].includes(clip.type)) p.push('x', 'y', 'scale', 'rotation', 'opacity');
  if (clip.type === 'video' || clip.type === 'image') {
    p.push(...ADJUST_FIELDS.map((f) => `adjust.${f.key}`));
    if (clip.filter?.id && clip.filter.id !== 'none') p.push('filter');
  }
  if (clip.type === 'audio' || (clip.type === 'video' && media?.hasAudio)) p.push('volume');
  return p;
}

// ---------- Exportação ----------
const n4 = (x) => String(Math.round(x * 10000) / 10000);

// Separa o clipe em "base" (pontos constantes viram valor fixo) e "dyn" (o que muda de fato).
export function splitKf(clip) {
  if (!anyKf(clip)) return { base: clip, dyn: {} };
  const base = structuredClone(clip);
  delete base.kf;
  const dyn = {};
  for (const [p, list] of Object.entries(clip.kf)) {
    if (!list?.length || !KF_PROPS[p]) continue;
    if (kfConst(list)) KF_PROPS[p].set(base, list[0].v);
    else dyn[p] = list;
  }
  return { base, dyn };
}

// Maior escala alcançada (a camada é preparada nesse tamanho e reduzida quadro a quadro).
export function maxScale(clip, dyn) {
  const s = clip.transform?.scale ?? 1;
  return dyn?.scale ? Math.max(...dyn.scale.map((k) => k.v), 0.01) : s;
}

// Expressão do FFmpeg com a curva dos pontos; T0 = instante (no fluxo) em que o clipe começa.
export function kfExpr(list, T0 = 0, mul = 1) {
  const n = list.length;
  if (n === 1) return n4(list[0].v * mul);
  let expr = n4(list[n - 1].v * mul);
  for (let i = n - 2; i >= 0; i--) {
    const a = list[i], b = list[i + 1];
    const ta = T0 + a.t, tb = T0 + b.t;
    const p = `clip((t-${n4(ta)})/${n4(Math.max(1e-6, tb - ta))},0,1)`;
    expr = `if(lt(t,${n4(tb)}),${n4(a.v * mul)}+${n4((b.v - a.v) * mul)}*${p}*${p}*(3-2*${p}),${expr})`;
  }
  return expr;
}

// Janelas de tempo (local) com valores constantes, para filtros que não aceitam expressão
// (opacidade, cor): amostra a cada `step` quadros e junta os trechos iguais.
export function kfWindows(clip, props, fps, { step = 2, quant = (p, v) => v } = {}) {
  const dur = clip.duration;
  const n = Math.max(1, Math.ceil((dur * fps) / step));
  const wins = [];
  for (let i = 0; i < n; i++) {
    const a = (i * step) / fps, b = Math.min(dur, ((i + 1) * step) / fps);
    const mid = Math.min(dur, (a + b) / 2);
    const vals = {};
    for (const p of props) vals[p] = quant(p, propAt(clip, p, mid));
    const last = wins[wins.length - 1];
    if (last && props.every((p) => last.vals[p] === vals[p])) last.b = b;
    else wins.push({ a, b, vals });
  }
  return wins;
}
