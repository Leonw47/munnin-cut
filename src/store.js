// Estado da aplicação (zustand): projeto, histórico, seleção, reprodução e operações de edição.
import { create } from 'zustand';
import { RATIOS, sizeFromMedia, DEFAULT_TEXT, TEXT_PRESETS, MEDIA_EXTS } from './shared/defs.js';
import { layoutProject, mainTrack, findClip, projectDuration, uid, MIN_CLIP, maxDurationFor, nextAdjacent, OVERLAY_TRANSITIONS } from './shared/timeline.js';
import { mediaUrl, OK_AUDIO, makeCanvas } from './engine/util.js';
import { effectDef } from './shared/effects.js';
import { SHAPES, DEFAULT_SHAPE } from './engine/shapes.js';
import { sliceKf, kfPropsFor, hasKfAt, removeKfAt, upsertKf, propAt, kfTimes } from './shared/keyframes.js';
import { sfxFileName } from './shared/sfx.js';
import { espelhar } from './shared/grupo.js';

const api = window.api;
// ordem dos itens mostrados no painel da biblioteca aberto (para Shift+clique e Ctrl+A)
export const libView = { order: [] };

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
  transform: { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, flipH: false, flipV: false },
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

export function newShapeClip(preset = {}, extra = {}) {
  const shape = { ...structuredClone(DEFAULT_SHAPE), ...structuredClone(preset) };
  return { id: uid('c'), type: 'shape', start: 0, duration: 4, ...baseVisual(), shape, ...extra };
}

export function newEffectClip(kind, id, extra = {}) {
  return { id: uid('c'), type: 'effect', start: 0, duration: 3, effect: { kind, id, intensity: 100 }, ...extra };
}

export const kindFor = (clip) => (clip.type === 'text' || clip.type === 'shape' ? 'text' : clip.type === 'effect' ? 'effect' : clip.type === 'audio' ? 'audio' : 'overlay');

// Ids dos clipes selecionados (um ou vários).
export const selIds = (sel) => (sel?.type === 'clip' ? (sel.ids?.length ? sel.ids : [sel.id]) : []);

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
  trimMediaId: null,
  silencioClipId: null, // clipe aberto na janela "Cortar silêncios"
  mediaNotices: [],
  stopAt: null,
  captionBusy: null,
  clipboard: null,
  savedAt: 0,
  fullscreen: false,
  previewMuted: false,
  fxPreview: null, // { kind: 'filter' | 'effect', id } — efeito sob o mouse, mostrado sem aplicar
  pickColor: null, // { clipId } — conta-gotas do chroma key ativo (próximo clique no reprodutor escolhe a cor)
  libSel: [], // mídias selecionadas na biblioteca (Delete remove do projeto)
  libAnchor: null, // último item clicado (início do Shift+clique)
  libFocus: false, // a biblioteca recebe as teclas (Delete, Ctrl+A, Esc) em vez da linha do tempo
  ytFocus: 0, // pedido para focar o campo de link do YouTube (painel Áudio)
  vozOriginal: false, // "Ouvir original": a prévia toca sem a limpeza da voz (comparar)
  loop: null, // { a, b, on } — trecho da linha do tempo repetido na reprodução
  setLoop(a, b, on = true) {
    const d = projectDuration(get().project || { tracks: [] });
    const x = Math.max(0, Math.min(a, b)), y = Math.min(Math.max(d, 0.1), Math.max(a, b));
    if (y - x < 0.1) return;
    set({ loop: { a: x, b: y, on } });
  },
  // botão "Repetir trecho": liga/desliga; sem trecho, usa os clipes selecionados (ou 5 s a partir da agulha)
  toggleLoop() {
    const s = get();
    if (s.loop) { set({ loop: { ...s.loop, on: !s.loop.on } }); return; }
    const sel = selIds(s.selection).map((id) => findClip(s.project, id)?.clip).filter(Boolean);
    if (sel.length) get().setLoop(Math.min(...sel.map((c) => c.start)), Math.max(...sel.map((c) => c.start + c.duration)));
    else get().setLoop(s.time, s.time + 5);
  },
  clearLoop() { set({ loop: null }); },
  libPreview: null, // { mediaId } — mídia da biblioteca aberta no reprodutor (sem pôr na linha do tempo)
  openLibPreview(mediaId) { get().pause(); set({ libPreview: { mediaId } }); },
  closeLibPreview() { if (get().libPreview) set({ libPreview: null }); },

  toastMsg(text, kind = 'info', ms = 3500) {
    clearTimeout(toastTimer);
    set({ toast: { text, kind } });
    toastTimer = setTimeout(() => set({ toast: null }), ms);
  },

  // ---------- Telas ----------
  openEditor(project) {
    if (!project.tracks?.some((t) => t.main)) project.tracks = [newTrack('video', true), ...(project.tracks || [])];
    set({ screen: 'editor', project: layoutProject(project), past: [], future: [], selection: null, time: 0, playing: false, anchor: null, meta: {}, zoom: 60, libSel: [], libAnchor: null, libFocus: false, loop: null, libPreview: null });
    get().prepareAll();
  },
  newProject(ratioId) { get().openEditor(createProject(ratioId)); },
  goHome() { set({ screen: 'home', project: null, playing: false, anchor: null, selection: null, meta: {}, libSel: [], libAnchor: null, libFocus: false }); },

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
    if (sel.type === 'clip' && sel.ids?.length) {
      const ids = sel.ids.filter((id) => findClip(project, id));
      if (!ids.length) return null;
      if (ids.length === 1) return { type: 'clip', id: ids[0] };
      return { type: 'clip', id: ids.includes(sel.id) ? sel.id : ids[0], ids, ...(sel.grupo ? { grupo: sel.grupo } : {}) };
    }
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
    let stopAt = null;
    // Com um áudio selecionado, o play toca só o trecho dele (do início ao fim do bloco).
    const sel = s.selection?.type === 'clip' ? findClip(s.project, s.selection.id)?.clip : null;
    const lp = s.loop?.on ? s.loop : null;
    if (lp) {
      // repetir trecho: começa no início do trecho se a agulha estiver fora dele (o motor volta ao início no fim)
      if (t < lp.a || t >= Math.min(lp.b, d) - 0.02) t = lp.a;
    } else if (sel && sel.type === 'audio') {
      const end = sel.start + sel.duration;
      if (t < sel.start || t >= end - 0.05) t = sel.start;
      stopAt = end;
    } else if (t >= d - 1e-3) t = 0;
    set({ playing: true, time: t, anchor: { t, now: performance.now() }, stopAt });
  },
  pause() { set({ playing: false, anchor: null, stopAt: null }); },
  togglePlay() { get().closeLibPreview(); if (get().playing) get().pause(); else get().play(); },
  stepFrames(n) {
    const fps = get().project?.fps || 30;
    get().pause();
    get().setTime(Math.round(get().time * fps + n) / fps);
  },

  select(sel) {
    set({ selection: sel });
    // clicar num bloco de áudio leva o cursor ao início dele (para ouvir com o play)
    const s = get();
    const c = sel?.type === 'clip' && !sel.ids ? findClip(s.project, sel.id)?.clip : null;
    if (c && c.type === 'audio' && !s.playing && (s.time < c.start || s.time >= c.start + c.duration)) s.setTime(c.start);
  },
  // Seleção de vários clipes (Ctrl+clique, Ctrl+A, arrastar um retângulo na linha do tempo).
  selectMany(ids, primary = null) {
    const uniq = [...new Set(ids)].filter((id) => findClip(get().project, id));
    if (!uniq.length) { set({ selection: null }); return; }
    if (uniq.length === 1) { set({ selection: { type: 'clip', id: uniq[0] } }); return; }
    set({ selection: { type: 'clip', id: primary && uniq.includes(primary) ? primary : uniq[0], ids: uniq } });
  },
  toggleSelect(id) {
    const cur = selIds(get().selection);
    get().selectMany(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id], id);
  },
  selectAll() {
    const ids = get().project.tracks.filter((t) => !t.locked).flatMap((t) => t.clips.map((c) => c.id));
    get().selectMany(ids);
  },

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
  noteMedia(kind, m, extra = {}) {
    set((s) => ({ mediaNotices: [...s.mediaNotices.filter((n) => !(n.id === m.id)), { id: m.id, kind, name: m.name, path: extra.path || m.path, ts: Date.now() }] }));
  },
  dismissNotices(kind) {
    set((s) => ({ mediaNotices: kind ? s.mediaNotices.filter((n) => n.kind !== kind) : s.mediaNotices.filter((n) => n.kind === 'missing') }));
  },
  // Ajusta os clipes de uma mídia que mudou (outra duração/tipo), mantendo efeitos e transições.
  adjustClipsForMedia(id) {
    const m = get().project?.media.find((x) => x.id === id);
    if (!m) return;
    get().commit((p) => {
      let any = false;
      for (const tr of p.tracks) for (const c of tr.clips) {
        if (c.mediaId !== id) continue;
        any = true;
        if (c.type !== 'audio' && (m.type === 'video' || m.type === 'image') && c.type !== m.type) {
          c.type = m.type;
          if (m.type === 'video') c.in = 0;
        }
        clampClip(c, m);
      }
      return any;
    }, { silent: true, keepTracks: true });
  },
  /**
   * Prepara uma mídia: confere se o arquivo existe e se mudou desde a última vez.
   * - sumiu → procura um arquivo com o mesmo nome em outras pastas (e religa sozinho);
   * - mesmo caminho com arquivo novo (tamanho/data diferentes) → relê e ajusta os clipes;
   * - não achou → marca como ausente e avisa.
   */
  async prepareMedia(id, doProbe = false) {
    let m = get().project?.media.find((x) => x.id === id);
    if (!m) return;
    try {
      let [st] = await api.statFiles([m.path]);
      let changed = false;
      if (!st.exists) {
        get().setMeta(id, { status: 'probing' });
        const hints = [...new Set(get().project.media.map((x) => x.path.replace(/[\\/][^\\/]*$/, '')))];
        const found = await api.findByName(m.name, hints).catch(() => []);
        if (!found.length) {
          get().setMeta(id, { status: 'missing' });
          get().noteMedia('missing', m);
          return;
        }
        const f = found[0];
        get().updateMediaSilent(id, { path: f.path, renderPath: undefined });
        get().noteMedia('relocated', m, { path: f.path });
        st = { exists: true, size: f.size, mtimeMs: f.mtimeMs };
        m = get().project.media.find((x) => x.id === id);
        doProbe = true;
        changed = !m.fp || m.fp.size !== f.size;
      } else if (m.fp && (m.fp.size !== st.size || Math.abs(m.fp.mtimeMs - st.mtimeMs) > 2000)) {
        doProbe = true;
        changed = true;
      }
      if (get().mediaNotices.some((n) => n.id === id && n.kind === 'missing')) {
        set((s) => ({ mediaNotices: s.mediaNotices.filter((n) => !(n.id === id && n.kind === 'missing')) }));
      }
      // leitura antiga (antes da v1.8): fotos HEIC saíam com o tamanho de um ladrilho e vídeos HDR sem o aviso
      const leituraVelha = (m.pv || 1) < 2 && /\.(heic|heif|hif|mov|mp4|m4v)$/i.test(m.path);
      if (doProbe || leituraVelha || (!m.width && m.type !== 'audio') || (!m.duration && m.type !== 'image')) {
        get().setMeta(id, { status: 'probing' });
        const info = await api.probe(m.path);
        const mudouTam = leituraVelha && (info.width !== m.width || info.height !== m.height);
        get().updateMediaSilent(id, { ...info, ...(leituraVelha ? { renderPath: undefined } : {}), fp: { size: st.size, mtimeMs: st.mtimeMs } });
        m = get().project.media.find((x) => x.id === id);
        if (mudouTam && !changed) get().adjustClipsForMedia(id);
        if (changed) {
          get().adjustClipsForMedia(id);
          if (!get().mediaNotices.some((n) => n.id === id && n.kind === 'relocated')) get().noteMedia('updated', m);
        }
      } else if (!m.fp) {
        get().updateMediaSilent(id, { fp: { size: st.size, mtimeMs: st.mtimeMs } });
      }
      get().setMeta(id, { status: 'checking' });
      const res = await canPlay(m);
      let proxy = null;
      const badAudio = m.type !== 'image' && m.hasAudio && m.acodec && !OK_AUDIO.has(m.acodec);
      const heif = m.type === 'image' && /\.(heic|heif|hif)$/i.test(m.path);
      if (!res.ok || badAudio || heif) {
        get().setMeta(id, { status: 'proxy', progress: 0 });
        proxy = await api.proxy(m.path, m.type, id);
        // HEIC: a cópia é a foto inteira (o FFmpeg sozinho só lê um pedaço) — a exportação usa ela também
        if (heif && m.renderPath !== proxy) get().updateMediaSilent(id, { renderPath: proxy });
      } else if (m.type === 'image' && res.w && m.width && res.w !== m.width && Math.abs(res.w - m.height) <= 2) {
        // foto com rotação EXIF: salva uma cópia já girada para a exportação ficar igual
        const c = makeCanvas(res.w, res.h);
        c.getContext('2d').drawImage(res.img, 0, 0);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        const file = await api.writeFile('cache', `${id}_orient_${st.mtimeMs}.png`, new Uint8Array(await blob.arrayBuffer()));
        get().updateMediaSilent(id, { renderPath: file, width: res.w, height: res.h });
      }
      // ver: muda quando o arquivo muda, para a prévia recarregar (o caminho pode ser o mesmo)
      get().setMeta(id, { status: 'ready', proxy, error: null, ver: st.mtimeMs });
      m = get().project.media.find((x) => x.id === id);
      const [thumbs, waveform] = await Promise.all([
        m.type === 'video' ? api.thumbs(m.path, m).catch(() => null) : null,
        m.hasAudio ? api.waveform(m.path).catch(() => null) : null,
      ]);
      get().setMeta(id, { thumbs, waveform });
      // clipes desta mídia marcados com "Reverter": prepara (ou reaproveita do cache) a cópia invertida
      for (const kind of ['video', 'audio']) {
        const need = get().project.tracks.some((t) => t.clips.some((c) => c.mediaId === id && c.reverse && (c.type === 'audio' ? 'audio' : 'video') === kind));
        if (need) get().ensureReverse(id, kind);
      }
    } catch (e) {
      const msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      // o arquivo sumiu no meio da leitura → trata como ausente (com aviso), não como erro
      if (/ENOENT|No such file|não encontrado/i.test(msg)) {
        const mm = get().project?.media.find((x) => x.id === id);
        get().setMeta(id, { status: 'missing' });
        if (mm) get().noteMedia('missing', mm);
      } else get().setMeta(id, { status: 'error', error: msg });
    }
  },
  prepareAll() {
    set({ mediaNotices: [] });
    for (const m of get().project?.media || []) get().prepareMedia(m.id, false);
  },
  // Confere de novo os arquivos (ao voltar para a janela): achou o que faltava? algo mudou?
  async recheckMedia() {
    const s = get();
    if (!s.project || s.screen !== 'editor') return;
    const media = s.project.media;
    if (!media.length) return;
    const stats = await api.statFiles(media.map((m) => m.path));
    const jobs = [];
    media.forEach((m, i) => {
      const st = stats[i];
      const status = get().meta[m.id]?.status;
      if (['probing', 'checking', 'proxy'].includes(status)) return;
      if (status === 'missing' || !st.exists) { jobs.push(get().prepareMedia(m.id, false)); return; }
      if (m.fp && (m.fp.size !== st.size || Math.abs(m.fp.mtimeMs - st.mtimeMs) > 2000)) jobs.push(get().prepareMedia(m.id, true));
    });
    await Promise.all(jobs);
  },
  async relinkMedia(id) {
    const m = get().project.media.find((x) => x.id === id);
    const p = await api.relinkDialog(m?.name || 'mídia');
    if (!p) return;
    get().updateMediaSilent(id, { path: p, renderPath: undefined, fp: undefined });
    set((s) => ({ mediaNotices: s.mediaNotices.filter((n) => n.id !== id) }));
    await get().prepareMedia(id, true);
    get().adjustClipsForMedia(id);
  },
  // Troca o arquivo de uma mídia por outro (qualquer nome): os clipes mantêm efeitos e transições.
  async replaceMedia(id) {
    const m = get().project.media.find((x) => x.id === id);
    const p = await api.replaceDialog(m?.name || 'mídia');
    if (!p) return;
    const name = p.split(/[\\/]/).pop();
    get().checkpoint();
    get().updateMediaSilent(id, { path: p, name, renderPath: undefined, fp: undefined, trim: undefined });
    set((s) => ({ mediaNotices: s.mediaNotices.filter((n) => n.id !== id) }));
    await get().prepareMedia(id, true);
    get().adjustClipsForMedia(id);
    get().toastMsg(`"${m.name}" foi substituída por "${name}". Efeitos e transições mantidos.`);
  },
  // Cópia invertida de uma mídia (para clipes com "Reverter"). kind: 'video' (com o som) ou 'audio'.
  async ensureReverse(mediaId, kind) {
    const m = get().project?.media.find((x) => x.id === mediaId);
    if (!m) return null;
    const cur = get().meta[mediaId]?.rev?.[kind];
    if (cur?.status === 'ready') return cur;
    if (cur?.status === 'working' && cur.promise) return cur.promise;
    const setRev = (patch) => {
      const rev = get().meta[mediaId]?.rev || {};
      get().setMeta(mediaId, { rev: { ...rev, [kind]: { ...(rev[kind] || {}), ...patch } } });
    };
    const job = (async () => {
      try {
        const r = await api.reverse(m.path, kind, `rev_${kind}_${mediaId}`);
        setRev({ status: 'ready', path: r.path, duration: r.duration, promise: null, progress: 1 });
        return get().meta[mediaId].rev[kind];
      } catch (e) {
        setRev({ status: 'error', promise: null });
        get().toastMsg(`Não foi possível inverter "${m.name}": ${String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, 'err', 6000);
        return null;
      }
    })();
    setRev({ status: 'working', progress: 0, promise: job });
    return job;
  },
  // outros: os demais clipes do grupo (edição em grupo) — todos ficam como o principal
  toggleReverse(clipId, outros = []) {
    const f = findClip(get().project, clipId);
    if (!f || (f.clip.type !== 'video' && f.clip.type !== 'audio')) return;
    const on = !f.clip.reverse;
    get().updateGrupo(clipId, outros, (c) => { c.reverse = on; }, { porClipe: true });
    if (!on) return;
    const kind = f.clip.type === 'audio' ? 'audio' : 'video';
    const mids = [...new Set([clipId, ...outros].map((id) => findClip(get().project, id)?.clip.mediaId).filter(Boolean))];
    const ready = mids.every((mid) => get().meta[mid]?.rev?.[kind]?.status === 'ready');
    if (!ready) get().toastMsg('Preparando o clipe de trás para frente… a prévia atualiza sozinha quando terminar.', 'info', 5000);
    Promise.all(mids.map((mid) => get().ensureReverse(mid, kind))).then((rs) => { if (rs.every(Boolean) && !ready) get().toastMsg(mids.length > 1 ? 'Clipes invertidos prontos.' : 'Clipe invertido pronto.'); });
  },
  openTrim(id) {
    const m = get().project?.media.find((x) => x.id === id);
    const meta = get().meta[id];
    if (!m || (m.type !== 'video' && m.type !== 'audio')) return;
    if (meta?.status !== 'ready') { get().toastMsg('Aguarde a mídia terminar de carregar.'); return; }
    get().pause();
    set({ modal: 'trim', trimMediaId: id });
  },
  removeMedia(id) { get().removeMediaMany([id]); },
  removeMediaMany(ids) {
    const p0 = get().project;
    const del = new Set(ids.filter((id) => p0.media.some((m) => m.id === id)));
    if (!del.size) return;
    const used = [...del].filter((id) => p0.tracks.some((t) => t.clips.some((c) => c.mediaId === id))).length;
    if (used) {
      const msg = del.size === 1 ? 'Esta mídia está na linha do tempo. Remover a mídia e os clipes que a usam?'
        : `${used === del.size ? `As ${del.size} mídias estão` : `${used} das ${del.size} mídias estão`} na linha do tempo. Remover as mídias e os clipes que as usam?`;
      if (!window.confirm(msg)) return;
    }
    get().commit((p) => {
      for (const t of p.tracks) t.clips = t.clips.filter((c) => !del.has(c.mediaId));
      p.media = p.media.filter((m) => !del.has(m.id));
    }, { silent: true });
    set((s) => ({
      selection: get().validSelection(s.project, s.selection),
      libSel: s.libSel.filter((x) => !del.has(x)),
      libAnchor: del.has(s.libAnchor) ? null : s.libAnchor,
    }));
    if (del.size > 1) get().toastMsg(`${del.size} itens removidos do projeto (os arquivos continuam no computador).`);
  },

  // Perfil do ruído e nível da fala de uma mídia (para a limpeza da voz) — calculado uma vez, com cache em disco.
  async analisarVoz(mediaId) {
    const m = get().project?.media.find((x) => x.id === mediaId);
    const mt = get().meta[mediaId];
    if (!m || mt?.voz || mt?.vozStatus === 'analisando') return mt?.voz || null;
    get().setMeta(mediaId, { vozStatus: 'analisando' });
    try {
      const r = await api.vozAnalisar(m.path, m.duration);
      get().setMeta(mediaId, { voz: r, vozStatus: 'pronta' });
      return r;
    } catch (e) {
      get().setMeta(mediaId, { vozStatus: 'erro' });
      get().toastMsg(`Não foi possível analisar o áudio de "${m.name}": ${String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, 'err', 6000);
      return null;
    }
  },

  // ---------- Seleção na biblioteca de mídia ----------
  // clique = um item; Ctrl+clique = liga/desliga; Shift+clique = do último clicado até este (na ordem mostrada)
  libClick(id, { ctrl = false, shift = false, order = [] } = {}) {
    const s = get();
    if (shift && s.libAnchor && order.includes(s.libAnchor) && order.includes(id)) {
      const a = order.indexOf(s.libAnchor), b = order.indexOf(id);
      const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
      set({ libSel: ctrl ? [...new Set([...s.libSel, ...range])] : range, libFocus: true });
      return;
    }
    if (ctrl) {
      set({ libSel: s.libSel.includes(id) ? s.libSel.filter((x) => x !== id) : [...s.libSel, id], libAnchor: id, libFocus: true });
      return;
    }
    set({ libSel: [id], libAnchor: id, libFocus: true });
  },
  libSelectAll(order) { set({ libSel: [...order], libFocus: true }); },
  libBlur() { if (get().libFocus || get().libSel.length) set({ libFocus: false, libSel: [], libAnchor: null }); },

  // ---------- Efeitos sonoros ----------
  // copia o som da biblioteca para Documentos\Munnin Cut\Efeitos sonoros, importa e põe no cursor (faixa de áudio)
  async addSfx(sfxId, opts = {}) {
    try {
      const file = await api.sfxMaterialize(sfxId, sfxFileName(sfxId));
      const [mid] = await get().importPaths([file]);
      if (!mid) return null;
      return get().addMedia(mid, { target: 'audio', time: opts.time ?? get().time, trackId: opts.trackId });
    } catch (e) {
      get().toastMsg(`Não foi possível adicionar o som: ${String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, 'err');
      return null;
    }
  },
  // som de "Meus sons" (arquivo do usuário): importa e põe numa faixa de áudio
  async addUserSfx(path, opts = {}) {
    const [mid] = await get().importPaths([path]);
    if (!mid) return null;
    return get().addMedia(mid, { target: 'audio', time: opts.time ?? get().time, trackId: opts.trackId });
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
    // corte feito antes de inserir (janela "Cortar antes de inserir")
    if (m.trim && (m.type === 'video' || m.type === 'audio')) {
      clip.in = Math.max(0, m.trim.in);
      clip.duration = Math.max(MIN_CLIP, Math.min(m.duration, m.trim.out) - clip.in);
    }
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
  addShape(presetId = 'rect', opts = {}) {
    const preset = SHAPES.find((x) => x.id === presetId) || SHAPES[0];
    const p = get().project;
    // tamanho proporcional ao projeto (os modelos foram pensados para 1080 no lado menor)
    const k = Math.min(p.width, p.height) / 1080;
    const sh = { ...preset.shape, w: Math.round(preset.shape.w * k), h: Math.max(4, Math.round(preset.shape.h * k)) };
    const clip = newShapeClip(sh, { start: Math.max(0, opts.time ?? get().time) });
    get().commit((d) => placeInTrack(d, clip, opts.trackId, opts.newTrackPos ?? null));
    set({ selection: { type: 'clip', id: clip.id } });
    return clip.id;
  },
  addEffect(kind, id, opts = {}) {
    const dur = (kind === 'effect' && effectDef(id)?.dur) || 3;
    const clip = newEffectClip(kind, id, { start: Math.max(0, opts.time ?? get().time), duration: dur });
    get().commit((p) => placeInTrack(p, clip, opts.trackId, opts.newTrackPos ?? null));
    set({ selection: { type: 'clip', id: clip.id } });
    return clip.id;
  },
  // Legendas automáticas: substitui as anteriores (se pedido) e cria uma faixa só para elas.
  applyCaptions(caps, style, { replace = true, y = 0.32 } = {}) {
    let n = 0;
    get().commit((p) => {
      if (replace) for (const t of p.tracks) t.clips = t.clips.filter((c) => !c.caption);
      if (!caps.length) return;
      const tr = newTrack('text');
      tr.captions = true;
      p.tracks.unshift(tr);
      for (const c of caps) {
        const clip = newTextClip(style, { start: c.start, duration: Math.max(MIN_CLIP, c.end - c.start), caption: true });
        clip.text.content = c.text;
        clip.transform.y = y;
        tr.clips.push(clip);
        n++;
      }
    });
    return n;
  },
  applyFilter(clipId, filterId) {
    // com vários clipes selecionados, o filtro vale para todos os visuais da seleção
    const ids = selIds(get().selection);
    const targets = ids.length > 1 && ids.includes(clipId) ? ids : [clipId];
    get().commit((p) => {
      let any = false;
      for (const id of targets) {
        const f = findClip(p, id);
        if (!f || (f.clip.type !== 'video' && f.clip.type !== 'image')) continue;
        f.clip.filter = { id: filterId, intensity: f.clip.filter?.intensity ?? 100 };
        any = true;
      }
      return any;
    });
  },
  setTransition(clipId, transId, duration) {
    let ok = false;
    get().commit((p) => {
      const f = findClip(p, clipId);
      if (!f) return false;
      if (f.track.main) {
        if (f.index >= f.track.clips.length - 1) return false;
      } else {
        // faixas de cima: precisa de um clipe encostado depois, e só transições de mistura
        if (!nextAdjacent(f.track, f.clip)) return false;
        if (transId && transId !== 'none' && !OVERLAY_TRANSITIONS.has(transId)) {
          get().toastMsg('Nas faixas de cima entram as transições de mistura (dissolver, limpar, círculo, relógio, abrir). Usei "Dissolver".', 'info', 5000);
          transId = 'fade';
        }
      }
      f.clip.transition = transId && transId !== 'none' ? { id: transId, duration: duration ?? f.clip.transition?.duration ?? 0.6 } : null;
      ok = true;
    });
    if (ok && transId && transId !== 'none') set({ selection: { type: 'transition', id: clipId } });
    return ok;
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
  // Edição em grupo (vários clipes do mesmo tipo pelo painel da direita): o que mudou no clipe principal vai
  // para os outros — só os campos mexidos, com o valor final; tempo, trecho, texto e pontos de cada um ficam.
  // porClipe: roda a mesma alteração em cada clipe (velocidade, pontos de modificação, "redefinir").
  updateGrupo(id, outros, patch, opts = {}) {
    const { porClipe = false, ...copts } = opts;
    if (!outros?.length) return get().updateClip(id, patch, copts);
    return get().commit((p) => {
      const f = findClip(p, id);
      if (!f) return false;
      const aplicar = (g) => {
        if (typeof patch === 'function') patch(g.clip, p, g);
        else deepMerge(g.clip, structuredClone(patch));
        clampClip(g.clip, p.media.find((m) => m.id === g.clip.mediaId));
      };
      const antes = porClipe ? null : structuredClone(f.clip);
      aplicar(f);
      for (const oid of outros) {
        const g = oid !== id && findClip(p, oid);
        if (!g || g.clip.type !== f.clip.type) continue;
        if (porClipe) aplicar(g);
        else {
          espelhar(antes, f.clip, g.clip);
          clampClip(g.clip, p.media.find((m) => m.id === g.clip.mediaId));
        }
      }
    }, copts);
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
        // pontos de modificação: cada parte fica com o seu trecho (valores no corte preservados)
        if (c.kf) { r.kf = sliceKf(c.kf, dl, c.duration); c.kf = sliceKf(c.kf, 0, dl); }
        if (!r.kf) delete r.kf;
        if (!c.kf) delete c.kf;
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

  openSilencios(clipId) { get().pause(); set({ modal: 'silencios', silencioClipId: clipId }); },
  /**
   * Cortar silêncios: troca o clipe pelos trechos que ficam (segundos do arquivo, relativos a clip.in).
   * Na faixa principal o ímã já junta os pedaços; nas outras, os pedaços ficam encostados e o que vinha
   * depois na mesma faixa anda para trás. Um passo só de desfazer.
   */
  cortarSilencios(clipId, ficam) {
    let n = 0, tirado = 0;
    get().commit((p) => {
      const f = findClip(p, clipId);
      if (!f || !ficam?.length) return false;
      const c = f.clip, sp = c.speed || 1;
      const pecas = ficam.map(([a, b], i) => {
        const r = structuredClone(c);
        if (i > 0) r.id = uid('c');
        const la = a / sp, lb = b / sp;
        r.in = (c.in || 0) + a;
        r.duration = Math.max(MIN_CLIP, lb - la);
        r.start = c.start + la;
        if (c.kf) { r.kf = sliceKf(c.kf, la, lb); if (!r.kf) delete r.kf; }
        if (i > 0) { if (r.animIn) r.animIn = { id: 'none', duration: 0.5 }; r.fadeIn = 0; }
        if (i < ficam.length - 1) { if (r.animOut) r.animOut = { id: 'none', duration: 0.5 }; r.fadeOut = 0; r.transition = null; }
        return r;
      });
      tirado = c.duration - pecas.reduce((s, r) => s + r.duration, 0);
      if (!f.track.main) {
        const fim = c.start + c.duration;
        let t = c.start;
        for (const r of pecas) { r.start = t; t += r.duration; }
        for (const o of f.track.clips) if (o.id !== c.id && o.start >= fim - 1e-6) o.start = Math.max(0, o.start - tirado);
      }
      f.track.clips.splice(f.index, 1, ...pecas);
      n = pecas.length;
      return true;
    });
    return { n, tirado };
  },

  deleteSelection() {
    const sel = get().selection;
    if (!sel) return;
    if (sel.type === 'transition') {
      get().commit((p) => { const f = findClip(p, sel.id); if (f) f.clip.transition = null; });
    } else {
      const ids = new Set(selIds(sel));
      get().commit((p) => {
        let any = false;
        for (const t of p.tracks) {
          const n = t.clips.length;
          t.clips = t.clips.filter((c) => !ids.has(c.id));
          if (t.clips.length !== n) any = true;
        }
        return any;
      });
    }
    set({ selection: null });
  },

  // Duplica a seleção. Vários clipes: as cópias vêm logo depois do grupo, na mesma ordem.
  duplicateSelection() {
    const ids = selIds(get().selection);
    if (!ids.length) return;
    const found = ids.map((id) => findClip(get().project, id)).filter(Boolean);
    const free = found.filter((f) => !f.track.main);
    const g0 = Math.min(...free.map((f) => f.clip.start)), g1 = Math.max(...free.map((f) => f.clip.start + f.clip.duration));
    const span = free.length > 1 ? g1 - g0 : 0;
    const nids = [];
    get().commit((p) => {
      for (const id of ids) {
        const f = findClip(p, id);
        if (!f) continue;
        const c = structuredClone(f.clip);
        c.id = uid('c');
        nids.push(c.id);
        if (f.track.main) f.track.clips.splice(f.index + 1, 0, c);
        else { c.start = f.clip.start + (span || f.clip.duration); placeInTrack(p, c, f.track.id); }
      }
      return nids.length > 0;
    });
    if (nids.length) get().selectMany(nids);
  },

  copySelection() {
    const ids = selIds(get().selection);
    const found = ids.map((id) => findClip(get().project, id)).filter(Boolean);
    if (!found.length) return;
    const free = found.filter((f) => !f.track.main);
    const base = free.length ? Math.min(...free.map((f) => f.clip.start)) : 0;
    const items = found.map((f) => ({ clip: structuredClone(f.clip), main: !!f.track.main, offset: f.track.main ? 0 : f.clip.start - base }));
    set({ clipboard: { items } });
    get().toastMsg(items.length > 1 ? `${items.length} clipes copiados` : 'Clipe copiado');
  },
  paste() {
    const cb = get().clipboard;
    if (!cb) return;
    const items = cb.items || [{ clip: cb.clip, main: cb.main, offset: 0 }];
    const t = get().time;
    const nids = [];
    get().commit((p) => {
      const main = mainTrack(p);
      let idx = main.clips.findIndex((x) => t < x.start + x.duration);
      idx = idx < 0 ? main.clips.length : idx + 1;
      for (const it of items) {
        const c = structuredClone(it.clip);
        c.id = uid('c');
        nids.push(c.id);
        if (it.main) main.clips.splice(idx++, 0, c);
        else { c.start = t + (it.offset || 0); placeInTrack(p, c); }
      }
    });
    get().selectMany(nids);
  },

  // clipId pode ser uma lista (edição em grupo): todos os áudios vão para a mesma faixa nova.
  extractAudio(clipId) {
    const nids = [];
    get().commit((p) => {
      let tr = null;
      for (const id of [clipId].flat()) {
        const f = findClip(p, id);
        if (!f || f.clip.type !== 'video') continue;
        const m = p.media.find((x) => x.id === f.clip.mediaId);
        if (!m?.hasAudio) continue;
        const c = f.clip;
        const a = newMediaClip({ ...m, type: 'audio' }, {
          type: 'audio', start: c.start, in: c.in, duration: c.duration, speed: c.speed, volume: c.volume ?? 1, fadeIn: c.fadeIn, fadeOut: c.fadeOut,
          ...(c.audioFx ? { audioFx: structuredClone(c.audioFx) } : {}),
          ...(c.voz ? { voz: structuredClone(c.voz) } : {}),
          ...(c.kf?.volume ? { kf: { volume: structuredClone(c.kf.volume) } } : {}),
        });
        nids.push(a.id);
        c.muted = true;
        tr = placeInTrack(p, a, tr?.id ?? null);
      }
      if (!nids.length) return false;
    });
    if (nids.length > 1) { get().selectMany(nids); get().toastMsg(`Áudio de ${nids.length} clipes separado em uma faixa própria`); }
    else if (nids.length) { set({ selection: { type: 'clip', id: nids[0] } }); get().toastMsg('Áudio separado em uma faixa própria'); }
    else get().toastMsg('Este clipe não tem áudio.');
  },

  // ◆ Ponto de modificação: grava (ou tira) os valores atuais do clipe selecionado no cursor.
  toggleKeyframes() {
    const s = get();
    const sel = s.selection;
    if (sel?.type !== 'clip' || sel.ids?.length > 1) { s.toastMsg('Selecione um clipe para marcar um ponto de modificação.'); return; }
    const f = findClip(s.project, sel.id);
    if (!f) return;
    const c = f.clip;
    const lt = s.time - c.start;
    if (lt < -1e-3 || lt > c.duration + 1e-3) { s.toastMsg('Coloque a agulha sobre o clipe selecionado para marcar o ponto.'); return; }
    const media = s.project.media.find((m) => m.id === c.mediaId);
    const props = kfPropsFor(c, media);
    if (!props.length) { s.toastMsg('Este tipo de clipe não tem pontos de modificação.'); return; }
    const t = Math.max(0, Math.min(c.duration, lt));
    const allAt = props.every((p) => hasKfAt(c, p, t));
    s.updateClip(c.id, (cl) => {
      for (const p of props) {
        if (allAt) removeKfAt(cl, p, t);
        else upsertKf(cl, p, t, propAt(cl, p, t));
      }
    });
    s.toastMsg(allAt ? 'Ponto de modificação removido.'
      : 'Ponto marcado ◆. Agora leve a agulha a outro momento e mude posição, tamanho, luz, cor ou volume: o app cria outro ponto e faz a passagem suave entre eles.', 'info', 6500);
  },
  jumpKeyframe(dir) {
    const s = get();
    const c = s.selection?.type === 'clip' ? findClip(s.project, s.selection.id)?.clip : null;
    if (!c?.kf) return;
    const lt = s.time - c.start;
    const ts = kfTimes(c);
    const t = dir > 0 ? ts.find((x) => x > lt + 1e-3) : [...ts].reverse().find((x) => x < lt - 1e-3);
    if (t !== undefined) { s.pause(); s.setTime(c.start + t); }
  },

  // Move vários clipes no tempo (mesmo deslocamento); clipes da faixa principal ficam onde estão.
  moveGroup(ids, dt) {
    get().commit((p) => {
      const moving = [];
      for (const id of ids) {
        const f = findClip(p, id);
        if (f && !f.track.main) moving.push({ clip: f.clip, trackId: f.track.id });
      }
      if (!moving.length) return false;
      const d = Math.max(dt, -Math.min(...moving.map((m) => m.clip.start)));
      const ms = new Set(moving.map((m) => m.clip.id));
      for (const t of p.tracks) t.clips = t.clips.filter((c) => !ms.has(c.id));
      for (const m of moving.sort((a, b) => a.clip.start - b.clip.start)) {
        m.clip.start += d;
        placeInTrack(p, m.clip, m.trackId);
      }
    });
  },

  // Mover/aparar clipes durante um arraste (sem histórico; checkpoint no início).
  setClipTiming(id, { start, in: inPoint, duration, kf }) {
    get().commit((p) => {
      const f = findClip(p, id);
      if (!f) return false;
      if (start !== undefined) f.clip.start = Math.max(0, start);
      if (inPoint !== undefined) f.clip.in = Math.max(0, inPoint);
      if (duration !== undefined) f.clip.duration = duration;
      if (kf !== undefined) { if (kf) f.clip.kf = kf; else delete f.clip.kf; }
      clampClip(f.clip, p.media.find((m) => m.id === f.clip.mediaId));
    }, { silent: true, keepTracks: true });
  },
}));
