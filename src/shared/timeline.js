// Regras da linha do tempo e geometria, compartilhadas entre prévia e exportação.

export const MIN_CLIP = 0.1; // duração mínima de um clipe (s)

export function mainTrack(project) {
  return project.tracks.find((t) => t.main);
}

export function transitionDuration(clip, next) {
  if (!clip || !next || !clip.transition || !clip.transition.id || clip.transition.id === 'none') return 0;
  return Math.max(0, Math.min(clip.transition.duration || 0.5, clip.duration * 0.5, next.duration * 0.5));
}

// ---------- Transições entre clipes encostados nas faixas de cima (sobreposição, texto, formas) ----------
// Só as de mistura/máscara: o quadro inteiro (fundo + clipe) é misturado, e nelas o fundo fica parado.
export const OVERLAY_TRANSITIONS = new Set(['fade', 'dissolve', 'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'smoothleft', 'smoothright', 'circleopen', 'circleclose', 'horzopen', 'vertopen', 'radial']);
export const ADJ_EPS = 0.04; // folga para considerar dois clipes "encostados" (s)
const LAYER_TYPES = new Set(['video', 'image', 'text', 'shape']);

// Duração efetiva da transição entre a e b (vizinhos numa faixa de cima); 0 se não houver.
export function overlayTransDur(a, b) {
  if (!a?.transition?.id || !b || !OVERLAY_TRANSITIONS.has(a.transition.id)) return 0;
  if (!LAYER_TYPES.has(a.type) || !LAYER_TYPES.has(b.type)) return 0;
  if (Math.abs(b.start - (a.start + a.duration)) > ADJ_EPS) return 0;
  return transitionDuration(a, b);
}

// Próximo clipe encostado na mesma faixa (para oferecer/aceitar transição).
export function nextAdjacent(track, clip) {
  if (!LAYER_TYPES.has(clip.type)) return null;
  const end = clip.start + clip.duration;
  return track.clips.find((c) => c.id !== clip.id && LAYER_TYPES.has(c.type) && Math.abs(c.start - end) <= ADJ_EPS) || null;
}

// Transição em andamento no tempo t numa faixa de cima: janela [corte − d/2, corte + d/2].
export function overlayTransitionAt(track, t) {
  const cs = [...track.clips].sort((a, b) => a.start - b.start);
  for (let i = 0; i < cs.length - 1; i++) {
    const a = cs[i], b = cs[i + 1];
    const d = overlayTransDur(a, b);
    if (d <= 0) continue;
    const cut = b.start;
    if (t >= cut - d / 2 && t < cut + d / 2) return { a, b, d, cut, id: a.transition.id, p: (t - (cut - d / 2)) / d };
  }
  return null;
}

// Cadeias de clipes ligados por transições (A→B→C…) numa faixa de cima, em ordem.
export function overlayChains(track) {
  const cs = [...track.clips].sort((a, b) => a.start - b.start);
  const out = [];
  let cur = null;
  for (let i = 0; i < cs.length - 1; i++) {
    if (overlayTransDur(cs[i], cs[i + 1]) > 0) {
      if (!cur) { cur = [cs[i]]; out.push(cur); }
      cur.push(cs[i + 1]);
    } else cur = null;
  }
  return out;
}

// A faixa principal é magnética: clipes encostados, com sobreposição nas transições.
export function layoutMain(track) {
  let t = 0;
  const cs = track.clips;
  for (let i = 0; i < cs.length; i++) {
    cs[i].start = t;
    t += cs[i].duration - transitionDuration(cs[i], cs[i + 1]);
  }
  return t;
}

export function layoutProject(project) {
  const m = mainTrack(project);
  if (m) layoutMain(m);
  return project;
}

export function mainDuration(project) {
  const m = mainTrack(project);
  if (!m || !m.clips.length) return 0;
  const last = m.clips[m.clips.length - 1];
  return last.start + last.duration;
}

export function projectDuration(project) {
  let d = 0;
  for (const tr of project.tracks) for (const c of tr.clips) d = Math.max(d, c.start + c.duration);
  return d;
}

export function clipEnd(c) { return c.start + c.duration; }

export function findClip(project, id) {
  for (const tr of project.tracks) {
    const i = tr.clips.findIndex((c) => c.id === id);
    if (i >= 0) return { track: tr, clip: tr.clips[i], index: i };
  }
  return null;
}

// Duração máxima de um clipe de mídia a partir do ponto de entrada.
export function maxDurationFor(clip, media) {
  if (!media || media.type === 'image' || clip.type === 'text' || clip.type === 'effect') return Infinity;
  return Math.max(MIN_CLIP, (media.duration - (clip.in || 0)) / (clip.speed || 1));
}

// ---------- Geometria ----------
export function cropDims(media, c = {}) {
  const mw = media?.width || 1920, mh = media?.height || 1080;
  return { sw: mw * (1 - (c.l || 0) - (c.r || 0)), sh: mh * (1 - (c.t || 0) - (c.b || 0)) };
}

export function fitScale(sw, sh, W, H, fit = 'contain') {
  const a = W / sw, b = H / sh;
  return fit === 'cover' ? Math.max(a, b) : Math.min(a, b);
}

// Tamanho da camada de mídia (sem animação) em pixels do canvas W×H.
export function mediaLayerSize(clip, media, W, H) {
  const { sw, sh } = cropDims(media, clip.crop);
  const tf = clip.transform || {};
  const s = fitScale(sw, sh, W, H, clip.fit) * (tf.scale ?? 1);
  return { w: sw * s * (tf.scaleX ?? 1), h: sh * s * (tf.scaleY ?? 1) };
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function fmtTime(t, fps = 30, withFrames = false) {
  if (!isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  const pad = (x) => String(x).padStart(2, '0');
  const base = `${h ? pad(h) + ':' : ''}${pad(m)}:${pad(s)}`;
  if (!withFrames) return base;
  const f = Math.floor((t - Math.floor(t)) * fps + 1e-6);
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}
