// Elementos <video>/<audio>/<img> da prévia, sincronizados com o relógio da linha do tempo.
import { mediaUrl } from './util.js';
import { hasAudioFx, audioFxPlan } from '../shared/audiofx.js';
import { buildAudioFx, loadPitchWorklet, workletReady } from './audioFx.js';
import { temVoz, vozDoClipe } from '../shared/voz.js';
import { montarVoz, carregarVoz, vozPronta } from './voz.js';

export class MediaPool {
  constructor(onNeedRender) {
    this.onNeedRender = onNeedRender;
    this.els = new Map(); // clipId -> { el, src, gain, kind }
    this.imgs = new Map(); // src -> HTMLImageElement
    // Último quadro de cada vídeo: enquanto o elemento busca outro ponto (arrastar a agulha),
    // a prévia mostra este quadro em vez de "pular" para a camada de baixo.
    this.frames = new Map(); // clipId -> canvas
    this.box = document.createElement('div');
    this.box.style.cssText = 'position:fixed;left:-10px;top:-10px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    document.body.appendChild(this.box);
    this.ac = null;
    this.vozOriginal = false;     // "Ouvir original": desliga a cadeia Voz na prévia (comparar antes/depois)
    this.pedirAnalise = null;     // (mediaId) → pede o perfil de ruído / nível da fala da mídia
  }

  audioCtx() {
    if (!this.ac) this.ac = new AudioContext({ latencyHint: 'interactive' });
    return this.ac;
  }

  resume() {
    if (this.ac && this.ac.state === 'suspended') this.ac.resume().catch(() => {});
  }

  // Cópia invertida pronta para um clipe com "Reverter" (ou null).
  revInfo(clip, meta) {
    if (!clip?.reverse) return null;
    const r = meta?.rev?.[clip.type === 'audio' ? 'audio' : 'video'];
    return r?.status === 'ready' ? r : null;
  }

  srcFor(media, meta, clip = null) {
    const r = this.revInfo(clip, meta);
    if (r) return r.path;
    const p = meta?.proxy || media.renderPath || media.path;
    return meta?.ver ? `${p}|${meta.ver}` : p;
  }

  image(media, meta) {
    const src = this.srcFor(media, meta);
    let img = this.imgs.get(src);
    if (!img) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => this.onNeedRender();
      img.src = mediaUrl(src.split('|')[0]) + (src.includes('|') ? `?v=${src.split('|')[1]}` : '');
      this.imgs.set(src, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  element(clip, media, meta) {
    const kind = clip.type === 'audio' ? 'audio' : 'video';
    const src = this.srcFor(media, meta, clip);
    let e = this.els.get(clip.id);
    if (e && (e.src !== src || e.kind !== kind)) { this.drop(clip.id); e = null; }
    if (!e) {
      const el = document.createElement(kind);
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      el.playsInline = true;
      el.disablePictureInPicture = true;
      el.src = mediaUrl(src.split('|')[0]) + (src.includes('|') ? `?v=${src.split('|')[1]}` : '');
      const rerender = () => this.onNeedRender();
      const snap = () => { this.snap(clip.id, el); rerender(); };
      el.addEventListener('seeked', snap);
      el.addEventListener('loadeddata', snap);
      el.addEventListener('canplay', rerender);
      this.box.appendChild(el);
      let gain = null, node = null;
      try {
        const ac = this.audioCtx();
        node = ac.createMediaElementSource(el);
        gain = ac.createGain();
        gain.gain.value = 0;
        node.connect(gain).connect(ac.destination);
      } catch { el.volume = 0; }
      e = { el, src, gain, node, kind, fx: null, voz: null, fxKey: '' };
      this.els.set(clip.id, e);
    }
    return e;
  }

  snap(id, el) {
    if (!el.videoWidth || el.readyState < 2) return;
    const k = Math.min(1, 1280 / Math.max(el.videoWidth, el.videoHeight));
    const w = Math.max(2, Math.round(el.videoWidth * k)), h = Math.max(2, Math.round(el.videoHeight * k));
    let c = this.frames.get(id);
    if (!c) c = document.createElement('canvas');
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    try { c.getContext('2d').drawImage(el, 0, 0, w, h); } catch { return; }
    this.frames.delete(id);
    this.frames.set(id, c);
    while (this.frames.size > 24) this.frames.delete(this.frames.keys().next().value);
  }

  frame(id) { return this.frames.get(id) || null; }

  drop(id) {
    const e = this.els.get(id);
    if (!e) return;
    try { e.el.pause(); e.el.removeAttribute('src'); e.el.load(); } catch { /* ignore */ }
    try { e.gain?.disconnect(); } catch { /* ignore */ }
    if (e.fx) e.fx.dispose();
    if (e.voz) e.voz.dispose();
    e.el.remove();
    this.els.delete(id);
  }

  // Mantém só os elementos de clipes que ainda existem.
  prune(liveIds) {
    for (const id of [...this.els.keys()]) if (!liveIds.has(id)) this.drop(id);
  }

  pauseAll() {
    for (const { el, gain } of this.els.values()) {
      if (!el.paused) el.pause();
      if (gain) gain.gain.value = 0;
    }
  }

  /**
   * Sincroniza um clipe de vídeo/áudio com o tempo t da linha do tempo.
   * vol: volume já com fades, mudo etc. (0 = silêncio)
   */
  // Liga/troca as cadeias de áudio do clipe, entre a fonte e o volume: Voz (limpeza/realce) → efeitos de voz.
  applyFx(e, clip, media, meta) {
    const ac = this.ac;
    if (!ac || !e.node || !e.gain) return;
    const fx = clip.audioFx;
    const comFx = hasAudioFx(fx) ? fx : null;
    const v = temVoz(clip) && !this.vozOriginal ? vozDoClipe(clip) : null;
    if (v && (v.ruido > 0.5 || v.realce > 0.5) && !meta?.voz && meta?.vozStatus !== 'analisando' && meta?.vozStatus !== 'erro') {
      this.pedirAnalise?.(media.id);
    }
    const key = (comFx || v) ? JSON.stringify([comFx, v, !!meta?.voz]) + (workletReady.has(ac) ? '|w' : '') + (vozPronta.has(ac) ? '|v' : '') : '';
    if (e.fxKey === key) return;
    e.fxKey = key;
    try { e.node.disconnect(); } catch { /* ignore */ }
    if (e.fx) { e.fx.dispose(); e.fx = null; }
    if (e.voz) { e.voz.dispose(); e.voz = null; }
    if (comFx && audioFxPlan(comFx).pitch && !workletReady.has(ac)) {
      loadPitchWorklet(ac).then((ok) => { if (ok) e.fxKey = null; });
    }
    if (v && v.ruido > 0.5 && !vozPronta.has(ac)) {
      carregarVoz(ac).then((ok) => { if (ok) { e.fxKey = null; this.onNeedRender(); } });
    }
    let cur = e.node;
    try {
      if (v) {
        e.voz = montarVoz(ac, v, meta?.voz || null);
        cur.connect(e.voz.input);
        cur = e.voz.output;
      }
      if (comFx) {
        e.fx = buildAudioFx(ac, comFx);
        cur.connect(e.fx.input);
        cur = e.fx.output;
      }
      cur.connect(e.gain);
    } catch {
      try { e.node.disconnect(); } catch { /* ignore */ }
      if (e.voz) { e.voz.dispose(); e.voz = null; }
      if (e.fx) { e.fx.dispose(); e.fx = null; }
      e.node.connect(e.gain);
    }
  }

  sync(clip, media, meta, t, playing, fps, vol) {
    const e = this.element(clip, media, meta);
    this.applyFx(e, clip, media, meta);
    const el = e.el;
    const local = t - clip.start;
    const active = local >= 0 && local < clip.duration;
    const speed = clip.speed || 1;
    // invertido: o trecho [in, in + dur·vel] do original fica, na cópia invertida, em [D − in − dur·vel, D − in]
    const r = this.revInfo(clip, meta);
    const inPt = r ? Math.max(0, r.duration - (clip.in || 0) - clip.duration * speed) : clip.in || 0;
    const target = inPt + Math.max(0, local) * speed;
    if (active) {
      const rate = Math.max(0.0625, Math.min(16, speed));
      if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
      if (playing) {
        if (el.paused) {
          if (Math.abs(el.currentTime - target) > 0.04) el.currentTime = target;
          el.play().catch(() => {});
        } else if (Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.5 / fps && el.readyState >= 1) el.currentTime = target;
      }
      if (e.gain) e.gain.gain.value = playing ? vol : 0;
    } else {
      if (!el.paused) el.pause();
      if (e.gain) e.gain.gain.value = 0;
      if (local < 0 && local > -2.5 && Math.abs(el.currentTime - inPt) > 0.05 && !el.seeking && el.readyState >= 1) {
        el.currentTime = inPt;
      }
      // logo depois do fim: estaciona no último quadro (transição nas faixas de cima mostra A parado)
      const last = inPt + Math.max(0, clip.duration - 0.5 / fps) * speed;
      if (local >= clip.duration && local < clip.duration + 1 && Math.abs(el.currentTime - last) > 0.05 && !el.seeking && el.readyState >= 1) {
        el.currentTime = last;
      }
    }
    return el;
  }
}
