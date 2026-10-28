// Motor de reprodução: relógio, sincronização das mídias e desenho da prévia.
import { useStore } from '../store.js';
import { MediaPool } from './mediaPool.js';
import { Compositor } from './compositor.js';
import { projectDuration, findClip } from '../shared/timeline.js';
import { makeCanvas } from './util.js';
import { effectDef } from '../shared/effects.js';
import { propAt } from '../shared/keyframes.js';

const isVisual = (c) => c && (c.type === 'video' || c.type === 'image');

// Projeto "de mentira" para mostrar um filtro/efeito sob o mouse sem aplicá-lo de verdade.
function withFxPreview(project, s, now) {
  const fx = s.fxPreview;
  const t = s.time;
  const sel = s.selection?.type === 'clip' ? (s.selection.ids?.length ? s.selection.ids : [s.selection.id]) : [];
  const selClips = sel.map((id) => findClip(project, id)?.clip).filter(Boolean);
  const patch = (fn) => ({ ...project, tracks: project.tracks.map((tr) => ({ ...tr, clips: tr.clips.map((c) => fn(c) || c) })) });
  if (fx.kind === 'filter') {
    const vis = new Set(selClips.filter(isVisual).map((c) => c.id));
    if (vis.size) return patch((c) => (vis.has(c.id) ? { ...c, filter: { id: fx.id, intensity: 100 } } : null));
    const fc = selClips.find((c) => c.type === 'effect' && c.effect?.kind === 'filter');
    if (fc) return patch((c) => (c.id === fc.id ? { ...c, effect: { ...c.effect, id: fx.id } } : null));
  } else {
    const ec = selClips.find((c) => c.type === 'effect' && c.effect?.kind === 'effect');
    if (ec) return patch((c) => (c.id === ec.id ? { ...c, effect: { ...c.effect, id: fx.id } } : null));
  }
  // nada selecionado que combine: mostra o efeito no quadro inteiro, animando enquanto o mouse estiver em cima
  const D = (fx.kind === 'effect' && effectDef(fx.id)?.dur) || 3;
  const lt = ((now - (fx.since || now)) / 1000) % D;
  const clip = { id: `preview_${fx.id}`, type: 'effect', start: t - lt, duration: D, effect: { kind: fx.kind, id: fx.id, intensity: 100 } };
  return { ...project, tracks: [{ id: 'preview_track', kind: 'effect', clips: [clip] }, ...project.tracks] };
}

const NOT_READY = new Set(['missing', 'error', 'probing', 'checking', 'proxy']);

class Engine {
  constructor() {
    this.pool = null;
    this.comp = null;
    this.canvas = null;
    this.dirty = true;
    this.mapCache = { media: null, map: {} };
  }

  init() {
    if (this.pool) return;
    this.pool = new MediaPool(() => this.invalidate());
    this.pool.pedirAnalise = (mid) => useStore.getState().analisarVoz(mid);
    useStore.subscribe((s, prev) => {
      if (s.project !== prev.project || s.time !== prev.time || s.meta !== prev.meta || s.fxPreview !== prev.fxPreview
        || s.selection !== prev.selection || s.pickColor !== prev.pickColor) this.invalidate();
      if (s.playing !== prev.playing) {
        if (s.playing) this.pool.resume();
        else this.pool.pauseAll();
        this.invalidate();
      }
    });
    if (document.fonts) document.fonts.addEventListener('loadingdone', () => this.invalidate());
    const loop = () => {
      requestAnimationFrame(loop);
      try { this.tick(); } catch (e) { console.error(e); }
    };
    requestAnimationFrame(loop);
  }

  attach(canvas) {
    this.init();
    this.canvas = canvas;
    this.comp = new Compositor(canvas);
    this.invalidate();
  }

  detach(canvas) {
    if (this.canvas === canvas) { this.canvas = null; this.comp = null; }
  }

  invalidate() { this.dirty = true; }

  mediaMap(project) {
    if (this.mapCache.media !== project.media) {
      const map = {};
      for (const m of project.media) map[m.id] = m;
      this.mapCache = { media: project.media, map };
    }
    return this.mapCache.map;
  }

  source(clip, media, meta) {
    if (!meta || meta.status !== 'ready') return null;
    if (media.type === 'image') {
      const img = this.pool.image(media, meta);
      return img ? { el: img, w: img.naturalWidth, h: img.naturalHeight } : null;
    }
    if (media.type === 'video') {
      const e = this.pool.els.get(clip.id);
      if (e && e.el.readyState >= 2 && e.el.videoWidth) return { el: e.el, w: e.el.videoWidth, h: e.el.videoHeight };
      // buscando outro ponto: mostra o último quadro deste clipe (não deixa a camada sumir e piscar)
      const f = this.pool.frame(clip.id);
      return f ? { el: f, w: f.width, h: f.height } : null;
    }
    return null;
  }

  tick() {
    const s = useStore.getState();
    const project = s.project;
    if (!project) { if (this.pool && this.pool.els.size) this.pool.prune(new Set()); return; }
    if (this.pool) this.pool.vozOriginal = !!s.vozOriginal;
    let t = s.time;
    if (s.playing && s.anchor) {
      const dur = projectDuration(project);
      t = s.anchor.t + (performance.now() - s.anchor.now) / 1000;
      const end = s.stopAt != null ? Math.min(dur, s.stopAt) : dur;
      const lp = s.loop?.on ? s.loop : null;
      if (lp && t >= Math.min(lp.b, dur)) {
        // repetir trecho: volta ao início (os vídeos/áudios se reposicionam no sync)
        t = lp.a;
        useStore.setState({ time: t, anchor: { t, now: performance.now() } });
      } else if (t >= end) {
        t = end;
        useStore.setState({ playing: false, anchor: null, time: end, stopAt: null });
      } else useStore.setState({ time: t });
    }
    const mediaMap = this.mediaMap(project);
    const live = new Set();
    const fps = project.fps || 30;
    for (const tr of project.tracks) {
      for (const c of tr.clips) {
        if (c.type !== 'video' && c.type !== 'audio') continue;
        const m = mediaMap[c.mediaId];
        const meta = s.meta[c.mediaId];
        if (!m || !meta || NOT_READY.has(meta.status)) continue;
        if (t < c.start - 3 || t > c.start + c.duration + 1) continue;
        live.add(c.id);
        const local = t - c.start;
        let vol = s.previewMuted || c.muted || tr.muted || (c.type === 'video' && !m.hasAudio) ? 0 : propAt(c, 'volume', Math.max(0, Math.min(c.duration, t - c.start)));
        if (vol > 0) {
          if (c.fadeIn > 0 && local < c.fadeIn) vol *= Math.max(0, local / c.fadeIn);
          if (c.fadeOut > 0 && local > c.duration - c.fadeOut) vol *= Math.max(0, (c.duration - local) / c.fadeOut);
        }
        this.pool.sync(c, m, meta, t, s.playing, fps, vol);
      }
    }
    this.pool.prune(live);
    if (this.comp && (this.dirty || s.playing || s.fxPreview)) {
      this.dirty = false;
      // conta-gotas: mostra o clipe sem o recorte para escolher a cor original
      this.comp.noChroma = s.pickColor ? new Set([s.pickColor.clipId]) : null;
      const env = {
        project: s.fxPreview ? withFxPreview(project, s, performance.now()) : project, mediaMap, metaMap: s.meta, t,
        source: (clip, media) => this.source(clip, media, s.meta[media.id]),
      };
      this.comp.render(env);
      if (this.fora) this.desenhaFora(env);
    }
  }

  // Zoom para fora: o que passa da borda da tela aparece meio transparente em volta (canvas atrás do quadro).
  // fora = { canvas, x, y, w, h, sw, sh } em pixels de tela (CSS); definido pelo reprodutor.
  desenhaFora(env) {
    const g = this.fora;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(2, Math.round(g.sw * dpr)), ch = Math.max(2, Math.round(g.sh * dpr));
    if (g.canvas.width !== cw || g.canvas.height !== ch) { g.canvas.width = cw; g.canvas.height = ch; }
    if (!this.foraComp || this.foraComp.canvas !== g.canvas) this.foraComp = new Compositor(g.canvas);
    const ctx = g.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cw, ch);
    const W = Math.round(g.w * dpr), H = Math.round(g.h * dpr);
    // desenha opaco num rascunho do tamanho do palco (a tela deslocada até onde ela aparece) e aplica a
    // transparência de uma vez — as camadas passam da borda da tela sem serem cortadas
    const big = this.foraComp.tmp(30, cw, ch);
    big.ctx.save();
    big.ctx.translate(Math.round(g.x * dpr), Math.round(g.y * dpr));
    try { this.foraComp.renderFora(big.ctx, env, W, H); } catch { big.ctx.restore(); return; }
    big.ctx.restore();
    ctx.globalAlpha = 0.38;
    ctx.drawImage(big.canvas, 0, 0);
    ctx.globalAlpha = 1;
  }

  // Miniatura JPEG do quadro atual (capa do rascunho).
  async captureCover() {
    if (!this.canvas) return null;
    try {
      const w = 320, h = Math.round((this.canvas.height / this.canvas.width) * 320);
      const c = makeCanvas(w, h);
      c.getContext('2d').drawImage(this.canvas, 0, 0, w, h);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    } catch { return null; }
  }

  /**
   * Quadro da agulha no tamanho cheio do projeto (capa do vídeo): o mesmo desenho da prévia, num canvas à
   * parte. Espera os vídeos terminarem de buscar o quadro antes de desenhar. Devolve PNG (bytes).
   */
  async snapshotPng() {
    const s = useStore.getState();
    const project = s.project;
    if (!project || !this.pool) return null;
    s.pause();
    this.invalidate();
    await new Promise((r) => setTimeout(r, 200));
    for (let i = 0; i < 60; i++) {
      const ocupado = [...this.pool.els.values()].some((e) => e.kind === 'video' && (e.el.seeking || e.el.readyState < 2));
      if (!ocupado) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const st = useStore.getState();
    const c = makeCanvas(project.width, project.height);
    const comp = new Compositor(c);
    comp.render({ project, mediaMap: this.mediaMap(project), metaMap: st.meta, t: st.time, source: (clip, media) => this.source(clip, media, st.meta[media.id]) });
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  }
}

export const engine = new Engine();
