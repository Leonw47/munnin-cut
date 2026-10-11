// Estado da aplicação (zustand): projeto, histórico, seleção, reprodução e operações de edição.
import { create } from 'zustand';
import { RATIOS, sizeFromMedia, DEFAULT_TEXT, TEXT_PRESETS, MEDIA_EXTS } from './shared/defs.js';
import { layoutProject, mainTrack, findClip, projectDuration, uid, MIN_CLIP, maxDurationFor } from './shared/timeline.js';
import { mediaUrl, OK_AUDIO, makeCanvas } from './engine/util.js';
import { effectDef } from './shared/effects.js';

const api = window.api;

// ---------- Fábricas ----------
export function newTrack(kind, main = false) {
  return { id: uid('t'), kind, main, clips: [], muted: false, hidden: false, locked: false };
}

export function createProject(ratioId = '16:9') {
  const r = RATIOS.find((x) => x.id === ratioId) || RATIOS[1];
  const size = r.id === 'original' ? { w: 1920, h: 1080 } : { w: r.w, h: r.h };
  const now = new Date();
  return {
    version: 1,
    id: uid('p'),
    name: `Projeto ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
    ratio: r.id,
    width: size.w,
    height: size.h,
    fps: 30,
    background: { type: 'color', color: '#000000', blur: 0.03 },
    media: [],
    tracks: [newTrack('video', true)],
  };
}

const baseVisual = () => ({
  transform: { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false },
  opacity: 1,
  animIn: { id: 'none', duration: 0.5 },
  animOut: { id: 'none', duration: 0.5 },
});

export function newMediaClip(m, extra = {}) {
  return {
    id: uid('c'),
    type: m.type,
    mediaId: m.id,
    start: 0,
    in: 0,
    duration: m.type === 'image' ? 4 : Math.max(MIN_CLIP, m.duration || 4),
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    ...baseVisual(),
    crop: { l: 0, t: 0, r: 0, b: 0 },
    fit: 'contain',
    bg: null,
    adjust: {},
    filter: { id: 'none', intensity: 100 },
    transition: null,
    ...extra,
  };
}

export function newTextClip(style = {}, extra = {}) {
  return {
    id: uid('c'), type: 'text', start: 0, duration: 3, ...baseVisual(),
    text: { ...structuredClone(DEFAULT_TEXT), ...structuredClone(style) },
    ...extra,
  };
}

export function newEffectClip(kind, id, extra = {}) {
  return { id: uid('c'), type: 'effect', start: 0, duration: 3, effect: { kind, id, intensity: 100 }, ...extra };
}

export const kindFor = (clip) => (clip.type === 'text' ? 'text' : clip.type === 'effect' ? 'effect' : clip.type === 'audio' ? 'audio' : 'overlay');

function overlaps(tr, clip) {
  return tr.clips.some((c) => c.id !== clip.id && clip.start < c.start + c.duration - 1e-6 && clip.start + clip.duration > c.start + 1e-6);
}

// Coloca um clipe (não principal) numa faixa compatível e livre; cria faixa se preciso.
export function placeInTrack(project, clip, preferredId = null, newTrackPos = null) {
  const kind = kindFor(clip);
  let tr = preferredId ? project.tracks.find((t) => t.id === preferredId && t.kind === kind && !t.main) : null;
  if (!tr || overlaps(tr, clip)) {
    tr = newTrackPos === null ? project.tracks.find((t) => t.kind === kind && !t.main && !overlaps(t, clip)) : null;
  }
  if (!tr) {
    tr = newTrack(kind);
    // como no CapCut: faixas visuais novas entram no topo; de áudio, embaixo
    if (newTrackPos !== null) project.tracks.splice(newTrackPos, 0, tr);
    else if (kind === 'audio') project.tracks.push(tr);
    else project.tracks.unshift(tr);
  }
  tr.clips.push(clip);
  tr.clips.sort((a, b) => a.start - b.start);
  return tr;
}

export function cleanupTracks(project) {
  project.tracks = project.tracks.filter((t) => t.main || t.clips.length);
  for (const t of project.tracks) if (!t.main) t.clips.sort((a, b) => a.start - b.start);
}

function guessType(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  for (const [k, list] of Object.entries(MEDIA_EXTS)) if (list.includes(ext)) return k;
  return 'video';
}

// Testa se o Chromium consegue tocar/mostrar a mídia diretamente.
function canPlay(m) {
  return new Promise((resolve) => {
    const url = mediaUrl(m.path);
    if (m.type === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve({ ok: img.naturalWidth > 0, w: img.naturalWidth, h: img.naturalHeight, img });
      img.onerror = () => resolve({ ok: false });
      img.src = url;
      return;
    }
    const el = document.createElement(m.type === 'audio' ? 'audio' : 'video');
    el.preload = 'auto';
    el.muted = true;
    el.crossOrigin = 'anonymous';
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(to);
      el.removeAttribute('src');
      el.load();
      resolve({ ok });
    };
    const to = setTimeout(() => finish(false), 10000);
    el.onloadeddata = () => finish(m.type === 'audio' || el.videoWidth > 0);
    el.onerror = () => finish(false);
    el.src = url;
  });
}

function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') deepMerge(target[k], v);
    else target[k] = v;
  }
}

function clampClip(clip, media) {
  clip.duration = Math.max(MIN_CLIP, clip.duration);
  if (media && (clip.type === 'video' || clip.type === 'audio')) {
    clip.in = Math.max(0, Math.min(clip.in || 0, Math.max(0, media.duration - MIN_CLIP)));
    clip.duration = Math.min(clip.duration, maxDurationFor(clip, media));
  }
  if (clip.start < 0) clip.start = 0;
}

let toastTimer = null;

// ---------- Store ----------
export const useStore = create((set, get) => ({
  screen: 'home',
  project: null,
  meta: {},
  past: [],
  future: [],
  selection: null, // { type: 'clip' | 'transition', id }
  time: 0,
  playing: false,
  anchor: null,
  zoom: 60, // pixels por segundo
  snapping: true,
  leftTab: 'media',
  toast: null,
  modal: null,
  clipboard: null,
  savedAt: 0,
  fullscreen: false,

  toastMsg(text, kind = 'info', ms = 3500) {
    clearTimeout(toastTimer);
    set({ toast: { text, kind } });
    toastTimer = setTimeout(() => set({ toast: null }), ms);
  },

  // ---------- Telas ----------
  openEditor(project) {
    if (!project.tracks?.some((t) => t.main)) project.tracks = [newTrack('video', true), ...(project.tracks || [])];
    set({ screen: 'editor', project: layoutProject(project), past: [], future: [], selection: null, time: 0, playing: false, anchor: null, meta: {}, zoom: 60 });
    get().prepareAll();
  },
  newProject(ratioId) { get().openEditor(createProject(ratioId)); },
  goHome() { set({ screen: 'home', project: null, playing: false, anchor: null, selection: null, meta: {} }); },

  // ---------- Histórico ----------
  commit(fn, { silent = false, keepTracks = false } = {}) {
    const cur = get().project;
    if (!cur) return false;
    const draft = structuredClone(cur);
    if (fn(draft) === false) return false;
    layoutProject(draft);
    if (!keepTracks) cleanupTracks(draft);
    draft.updatedAt = Date.now();
    set((s) => ({
      project: draft,
      past: silent ? s.past : [...s.past.slice(-150), cur],
      future: silent ? s.future : [],
    }));
    return true;
  },
  checkpoint() {
    const cur = get().project;
    if (cur) set((s) => ({ past: [...s.past.slice(-150), cur], future: [] }));
  },
  validSelection(project, sel) {
    if (!sel) return null;
    return findClip(project, sel.id) ? sel : null;
  },
  undo() {
    const { past, project, future, selection } = get();
    if (!past.length) return;
    const prev = { ...past[past.length - 1], media: project.media };
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future].slice(0, 150), selection: get().validSelection(prev, selection) });
  },
  redo() {
    const { past, project, future, selection } = get();
    if (!future.length) return;
    const next = { ...future[0], media: project.media };
    set({ project: next, past: [...past, project], future: future.slice(1), selection: get().validSelection(next, selection) });
  },

  // ---------- Reprodução ----------
  setTime(t) {
    const d = projectDuration(get().project || { tracks: [] });
    const tt = Math.max(0, Math.min(t, d));
    set((s) => ({ time: tt, anchor: s.playing ? { t: tt, now: performance.now() } : null }));
  },
  play() {
    const s = get();
    const d = projectDuration(s.project);
    if (d <= 0) return;
    let t = s.time;
    if (t >= d - 1e-3) t = 0;
    set({ playing: true, time: t, anchor: { t, now: performance.now() } });
  },
  pause() { set({ playing: false, anchor: null }); },
  togglePlay() { if (get().playing) get().pause(); else get().play(); },
  stepFrames(n) {
    const fps = get().project?.fps || 30;
    get().pause();
    get().setTime(Math.round(get().time * fps + n) / fps);
  },

  select(sel) { set({ selection: sel }); },

  // ---------- Mídia ----------
  setMeta(id, patch) { set((s) => ({ meta: { ...s.meta, [id]: { ...(s.meta[id] || {}), ...patch } } })); },
  updateMediaSilent(id, patch) {
    set((s) => ({ project: s.project && { ...s.project, media: s.project.media.map((m) => (m.id === id ? { ...m, ...patch } : m)) } }));
  },
  async importPaths(paths) {
    const ids = [];
    for (const p of paths) {
      if (!p) continue;
      const cur = get().project;
      const existing = cur.media.find((m) => m.path.toLowerCase() === p.toLowerCase());
      if (existing) { ids.push(existing.id); continue; }
      const id = uid('m');
      const name = p.split(/[\\/]/).pop();
      const m = { id, name, path: p, type: guessType(name), duration: 0, width: 0, height: 0, hasAudio: false };
      set((s) => ({ project: { ...s.project, media: [...s.project.media, m] } }));
      get().setMeta(id, { status: 'probing' });
      ids.push(id);
    }
    await Promise.all(ids.map((id) => get().prepareMedia(id, true)));
    return ids.filter((id) => get().project?.media.some((m) => m.id === id));
  },
  async prepareMedia(id, doProbe = false) {
    let m = get().project?.media.find((x) => x.id === id);
    if (!m) return;
    try {
      const [exists] = await api.exists([m.path]);
      if (!exists) { get().setMeta(id, { status: 'missing' }); return; }
      if (doProbe || (!m.width && m.type !== 'audio') || (!m.duration && m.type !== 'image')) {
        get().setMeta(id, { status: 'probing' });
        const info = await api.probe(m.path);
        get().updateMediaSilent(id, info);
        m = get().project.media.find((x) => x.id === id);
      }
      get().setMeta(id, { status: 'checking' });
      const res = await canPlay(m);
      let proxy = null;
      const badAudio = m.type !== 'image' && m.hasAudio && m.acodec && !OK_AUDIO.has(m.acodec);
      if (!res.ok || badAudio) {
        get().setMeta(id, { status: 'proxy', progress: 0 });
        proxy = await api.proxy(m.path, m.type, id);
      } else if (m.type === 'image' && res.w && m.width && res.w !== m.width && Math.abs(res.w - m.height) <= 2) {
        // foto com rotação EXIF: salva uma cópia já girada para a exportação ficar igual
        const c = makeCanvas(res.w, res.h);
        c.getContext('2d').drawImage(res.img, 0, 0);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        const file = await api.writeFile('cache', `${id}_orient.png`, new Uint8Array(await blob.arrayBuffer()));
        get().updateMediaSilent(id, { renderPath: file, width: res.w, height: res.h });
      }
      get().setMeta(id, { status: 'ready', proxy, error: null });
      m = get().project.media.find((x) => x.id === id);
      const [thumbs, waveform] = await Promise.all([
        m.type === 'video' ? api.thumbs(m.path, m).catch(() => null) : null,
        m.hasAudio ? api.waveform(m.path).catch(() => null) : null,
      ]);
      get().setMeta(id, { thumbs, waveform });
    } catch (e) {
      get().setMeta(id, { status: 'error', error: String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') });
    }
  },
  prepareAll() {
    for (const m of get().project?.media || []) get().prepareMedia(m.id, false);
  },
  async relinkMedia(id) {
    const m = get().project.media.find((x) => x.id === id);
    const p = await api.relinkDialog(m?.name || 'mídia');
    if (!p) return;
    get().updateMediaSilent(id, { path: p, renderPath: undefined });
    await get().prepareMedia(id, true);
  },
  removeMedia(id) {
    const used = get().project.tracks.some((t) => t.clips.some((c) => c.mediaId === id));
    if (used && !window.confirm('Esta mídia está na linha do tempo. Remover a mídia e os clipes que a usam?')) return;
    get().commit((p) => {
      for (const t of p.tracks) t.clips = t.clips.filter((c) => c.mediaId !== id);
      p.media = p.media.filter((m) => m.id !== id);
    }, { silent: true });
    set((s) => ({ selection: get().validSelection(s.project, s.selection) }));
  },

  // ---------- Adicionar à linha do tempo ----------
  // opts: { target: 'main' | 'overlay' | 'audio', time, index, trackId, newTrackPos }
  addMedia(mediaId, opts = {}) {
    const s = get();
    const m = s.project.media.find((x) => x.id === mediaId);
    const meta = s.meta[mediaId];
    if (!m) return null;
    if (!meta || ['probing', 'error', 'missing'].includes(meta.status) || (!m.duration && m.type !== 'image')) {
      s.toastMsg(meta?.status === 'error' ? `Não foi possível ler "${m.name}".` : 'Aguarde a mídia terminar de carregar.', meta?.status === 'error' ? 'err' : 'info');
      return null;
    }
    let target = opts.target || 'main';
    if (m.type === 'audio') target = 'audio';
    const clip = newMediaClip(m);
    get().commit((p) => {
      const main = mainTrack(p);
      if (target === 'main') {
        if (p.ratio === 'original' && !main.clips.length && m.width) {
          const sz = sizeFromMedia(m.width, m.height);
          p.width = sz.w; p.height = sz.h;
        }
        const idx = opts.index ?? main.clips.length;
        main.clips.splice(Math.max(0, Math.min(idx, main.clips.length)), 0, clip);
      } else {
        if (target === 'overlay' && m.type !== 'audio') clip.transform.scale = opts.fullSize ? 1 : 0.6;
        clip.start = Math.max(0, opts.time ?? s.time);
        placeInTrack(p, clip, opts.trackId, opts.newTrackPos ?? null);
      }
    });
    set({ selection: { type: 'clip', id: clip.id } });
    return clip.id;
  },
  addText(presetId = 'classic', opts = {}) {
    const preset = TEXT_PRESETS.find((x) => x.id === presetId) || TEXT_PRESETS[0];
    const clip = newTextClip(preset.style, { start: Math.max(0, opts.time ?? get().time) });
    if (opts.content) clip.text.content = opts.content;
    get().commit((p) => placeInTrack(p, clip, opts.trackId, opts.newTrackPos ?? null));
    set({ selection: { type: 'clip', id: clip.id } });
    return clip.id;
  },
  addSticker(emoji, opts = {}) {
    const clip = newTextClip({ content: emoji, font: 'emoji', weight: 400, size: 220 }, { start: Math.max(0, opts.time ?? get().time), sticker: true });
    get().commit((p) => placeInTrack(p, clip, opts.trackId, opts.newTrackPos ?? null));
    set({ selection: { type: 'clip', id: clip.id } });
  },
  addEffect(kind, id, opts = {}) {
    const dur = (kind === 'effect' && effectDef(id)?.dur) || 3;
    const clip = newEffectClip(kind, id, { start: Math.max(0, opts.time ?? get().time), duration: dur });
    get().commit((p) => placeInTrack(p, clip, opts.trackId, opts.newTrackPos ?? null));
    set({ selection: { type: 'clip', id: clip.id } });
  },
  applyFilter(clipId, filterId) {
    get().updateClip(clipId, (c) => { c.filter = { id: filterId, intensity: c.filter?.intensity ?? 100 }; });
  },
  setTransition(clipId, transId, duration) {
    get().commit((p) => {
      const f = findClip(p, clipId);
      if (!f || !f.track.main || f.index >= f.track.clips.length - 1) return false;
      f.clip.transition = transId && transId !== 'none' ? { id: transId, duration: duration ?? f.clip.transition?.duration ?? 0.6 } : null;
    });
    if (transId && transId !== 'none') set({ selection: { type: 'transition', id: clipId } });
  },
  applyTransitionAll(transId, duration) {
    get().commit((p) => {
      const main = mainTrack(p);
      main.clips.forEach((c, i) => { if (i < main.clips.length - 1) c.transition = { id: transId, duration }; });
    });
  },

  // ---------- Editar clipes ----------
  updateClip(id, patch, opts = {}) {
    return get().commit((p) => {
      const f = findClip(p, id);
      if (!f) return false;
      if (typeof patch === 'function') patch(f.clip, p, f);
      else deepMerge(f.clip, patch);
      clampClip(f.clip, p.media.find((m) => m.id === f.clip.mediaId));
    }, opts);
  },
  updateTrack(id, patch) {
    get().commit((p) => { const t = p.tracks.find((x) => x.id === id); if (!t) return false; Object.assign(t, patch); }, { keepTracks: true });
  },
  updateProject(patch, opts = {}) {
    get().commit((p) => { deepMerge(p, patch); }, opts);
  },

  splitAt(t = get().time) {
    const s = get();
    let ids = [];
    if (s.selection?.type === 'clip') ids = [s.selection.id];
    else {
      const main = mainTrack(s.project);
      const c = main?.clips.find((x) => t > x.start && t < x.start + x.duration);
      if (c) ids = [c.id];
    }
    if (!ids.length) { s.toastMsg('Selecione um clipe sob o cursor para dividir.'); return; }
    let newId = null;
    const ok = get().commit((p) => {
      let any = false;
      for (const id of ids) {
        const f = findClip(p, id);
        if (!f) continue;
        const c = f.clip;
        if (t <= c.start + MIN_CLIP / 2 || t >= c.start + c.duration - MIN_CLIP / 2) continue;
        const dl = t - c.start;
        const r = structuredClone(c);
        r.id = uid('c');
        r.start = t;
        r.duration = c.duration - dl;
        r.in = (c.in || 0) + dl * (c.speed || 1);
        if (r.animIn) r.animIn = { id: 'none', duration: 0.5 };
        r.fadeIn = 0;
        c.duration = dl;
        if (c.animOut) c.animOut = { id: 'none', duration: 0.5 };
        c.fadeOut = 0;
        c.transition = null;
        f.track.clips.splice(f.index + 1, 0, r);
        newId = r.id;
        any = true;
      }
      return any;
    });
    if (ok && newId) set({ selection: { type: 'clip', id: newId } });
  },

  deleteSelection() {
    const sel = get().selection;
    if (!sel) return;
    if (sel.type === 'transition') {
      get().commit((p) => { const f = findClip(p, sel.id); if (f) f.clip.transition = null; });
    } else {
      get().commit((p) => { const f = findClip(p, sel.id); if (!f) return false; f.track.clips.splice(f.index, 1); });
    }
    set({ selection: null });
  },

  duplicateSelection() {
    const sel = get().selection;
    if (sel?.type !== 'clip') return;
    let nid = null;
    get().commit((p) => {
      const f = findClip(p, sel.id);
      if (!f) return false;
      const c = structuredClone(f.clip);
      c.id = uid('c');
      nid = c.id;
      if (f.track.main) f.track.clips.splice(f.index + 1, 0, c);
      else { c.start = f.clip.start + f.clip.duration; placeInTrack(p, c, f.track.id); }
    });
    if (nid) set({ selection: { type: 'clip', id: nid } });
  },

  copySelection() {
    const sel = get().selection;
    if (sel?.type !== 'clip') return;
    const f = findClip(get().project, sel.id);
    if (f) { set({ clipboard: { clip: structuredClone(f.clip), main: !!f.track.main } }); get().toastMsg('Clipe copiado'); }
  },
  paste() {
    const cb = get().clipboard;
    if (!cb) return;
    const t = get().time;
    let nid = null;
    get().commit((p) => {
      const c = structuredClone(cb.clip);
      c.id = uid('c');
      nid = c.id;
      if (cb.main) {
        const main = mainTrack(p);
        let idx = main.clips.findIndex((x) => t < x.start + x.duration);
        idx = idx < 0 ? main.clips.length : idx + 1;
        main.clips.splice(idx, 0, c);
      } else { c.start = t; placeInTrack(p, c); }
    });
    set({ selection: { type: 'clip', id: nid } });
  },

  extractAudio(clipId) {
    let nid = null;
    get().commit((p) => {
      const f = findClip(p, clipId);
      if (!f || f.clip.type !== 'video') return false;
      const m = p.media.find((x) => x.id === f.clip.mediaId);
      if (!m?.hasAudio) return false;
      const c = f.clip;
      const a = newMediaClip({ ...m, type: 'audio' }, {
        type: 'audio', start: c.start, in: c.in, duration: c.duration, speed: c.speed, volume: c.volume ?? 1, fadeIn: c.fadeIn, fadeOut: c.fadeOut,
      });
      nid = a.id;
      c.muted = true;
      placeInTrack(p, a);
    });
    if (nid) { set({ selection: { type: 'clip', id: nid } }); get().toastMsg('Áudio separado em uma faixa própria'); }
    else get().toastMsg('Este clipe não tem áudio.');
  },

  // Mover/aparar clipes durante um arraste (sem histórico; checkpoint no início).
  setClipTiming(id, { start, in: inPoint, duration }) {
    get().commit((p) => {
      const f = findClip(p, id);
      if (!f) return false;
      if (start !== undefined) f.clip.start = Math.max(0, start);
      if (inPoint !== undefined) f.clip.in = Math.max(0, inPoint);
      if (duration !== undefined) f.clip.duration = duration;
      clampClip(f.clip, p.media.find((m) => m.id === f.clip.mediaId));
    }, { silent: true, keepTracks: true });
  },
}));
