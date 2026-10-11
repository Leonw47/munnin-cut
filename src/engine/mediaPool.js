// Elementos <video>/<audio>/<img> da prévia, sincronizados com o relógio da linha do tempo.
import { mediaUrl } from './util.js';

export class MediaPool {
  constructor(onNeedRender) {
    this.onNeedRender = onNeedRender;
    this.els = new Map(); // clipId -> { el, src, gain, kind }
    this.imgs = new Map(); // src -> HTMLImageElement
    this.box = document.createElement('div');
    this.box.style.cssText = 'position:fixed;left:-10px;top:-10px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    document.body.appendChild(this.box);
    this.ac = null;
  }

  audioCtx() {
    if (!this.ac) this.ac = new AudioContext({ latencyHint: 'interactive' });
    return this.ac;
  }

  resume() {
    if (this.ac && this.ac.state === 'suspended') this.ac.resume().catch(() => {});
  }

  srcFor(media, meta) {
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
    const src = this.srcFor(media, meta);
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
      el.addEventListener('seeked', rerender);
      el.addEventListener('loadeddata', rerender);
      el.addEventListener('canplay', rerender);
      this.box.appendChild(el);
      let gain = null;
      try {
        const ac = this.audioCtx();
        const node = ac.createMediaElementSource(el);
        gain = ac.createGain();
        gain.gain.value = 0;
        node.connect(gain).connect(ac.destination);
      } catch { el.volume = 0; }
      e = { el, src, gain, kind };
      this.els.set(clip.id, e);
    }
    return e;
  }

  drop(id) {
    const e = this.els.get(id);
    if (!e) return;
    try { e.el.pause(); e.el.removeAttribute('src'); e.el.load(); } catch { /* ignore */ }
    try { e.gain?.disconnect(); } catch { /* ignore */ }
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
  sync(clip, media, meta, t, playing, fps, vol) {
    const e = this.element(clip, media, meta);
    const el = e.el;
    const local = t - clip.start;
    const active = local >= 0 && local < clip.duration;
    const speed = clip.speed || 1;
    const target = (clip.in || 0) + Math.max(0, local) * speed;
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
      if (local < 0 && local > -2.5 && Math.abs(el.currentTime - (clip.in || 0)) > 0.05 && !el.seeking && el.readyState >= 1) {
        el.currentTime = clip.in || 0;
      }
    }
    return el;
  }
}
