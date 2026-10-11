// Compositor da prévia: desenha um quadro da linha do tempo num canvas.
import { mainTrack, mediaLayerSize } from '../shared/timeline.js';
import { clipOps, effectClipOps, cssFilter, postOps, CSS_OPS } from '../shared/ops.js';
import { animState } from '../shared/anim.js';
import { drawTextBlock, layoutText } from './text.js';
import { drawTransition } from './transitions.js';
import { sharedSvg } from './svgFilters.js';
import { makeCanvas } from './util.js';

const DEF_BG = { type: 'color', color: '#000000', blur: 0.03 };

class Tmp {
  constructor() { this.canvas = makeCanvas(); this.ctx = this.canvas.getContext('2d'); }
  size(w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.filter = 'none';
    c.imageSmoothingEnabled = true;
    c.clearRect(0, 0, w, h);
    return this;
  }
}

function makeNoise() {
  const c = makeCanvas(256, 256);
  const x = c.getContext('2d');
  const img = x.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

// Caixa (sem animação) de um clipe visual em pixels do canvas W×H.
export function clipBox(project, mediaMap, clip, W, H) {
  const k = W / project.width;
  const tf = clip.transform || {};
  let w, h;
  if (clip.type === 'text') {
    const L = layoutText(clip.text, k * (tf.scale ?? 1));
    w = L.boxW; h = L.boxH;
  } else {
    const m = mediaMap[clip.mediaId];
    if (!m) return null;
    ({ w, h } = mediaLayerSize(clip, m, W, H));
  }
  return { cx: W / 2 + (tf.x || 0) * W, cy: H / 2 + (tf.y || 0) * H, w, h, rot: tf.rotation || 0 };
}

export class Compositor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.svg = sharedSvg();
    this.tmps = [];
    this.layers = new Map();
    this.noise = makeNoise();
  }

  tmp(i, w, h) {
    if (!this.tmps[i]) this.tmps[i] = new Tmp();
    return this.tmps[i].size(w, h);
  }

  layerCanvas(id, w, h) {
    let t = this.layers.get(id);
    if (!t) { t = new Tmp(); this.layers.set(id, t); }
    if (this.layers.size > 40) {
      const first = this.layers.keys().next().value;
      if (first !== id) this.layers.delete(first);
    }
    return t.size(w, h);
  }

  pixelate(ctx, w, h, b) {
    const sw = Math.max(1, Math.ceil(w / b)), sh = Math.max(1, Math.ceil(h / b));
    const s = this.tmp(5, sw, sh);
    s.ctx.imageSmoothingQuality = 'high';
    s.ctx.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, sw, sh);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.canvas, 0, 0, sw, sh, 0, 0, sw * b, sh * b);
    ctx.restore();
  }

  // Pós-processamento (vinheta, granulado, RGB, pixel, barras, flash, espelho).
  applyPost(ctx, w, h, ops, lt, scope) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const o of ops) {
      switch (o.op) {
        case 'vignette': {
          const ang = o.v * 1.2;
          const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w / 2, h / 2));
          for (let i = 0; i <= 20; i++) {
            const r = i / 20, c = Math.cos(ang * r);
            g.addColorStop(r, `rgba(0,0,0,${(1 - c * c * c * c).toFixed(4)})`);
          }
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'noise': {
          const pat = ctx.createPattern(this.noise, 'repeat');
          pat.setTransform(new DOMMatrix().translateSelf(Math.random() * 256, Math.random() * 256));
          ctx.globalAlpha = Math.min(1, o.v * 0.9);
          ctx.globalCompositeOperation = scope === 'frame' ? 'overlay' : 'source-atop';
          ctx.fillStyle = pat;
          ctx.fillRect(0, 0, w, h);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'rgbshift': {
          const px = Math.max(1, o.v * w);
          const src = this.tmp(5, w, h);
          src.ctx.drawImage(ctx.canvas, 0, 0);
          const ch = (i, color, dx) => {
            const t = this.tmp(i, w, h);
            t.ctx.drawImage(src.canvas, dx, 0);
            t.ctx.globalCompositeOperation = 'multiply';
            t.ctx.fillStyle = color;
            t.ctx.fillRect(0, 0, w, h);
            t.ctx.globalCompositeOperation = 'destination-in';
            t.ctx.drawImage(src.canvas, dx, 0);
            return t.canvas;
          };
          const R = ch(6, '#ff0000', -px), G = ch(7, '#00ff00', 0), B = ch(8, '#0000ff', px);
          ctx.globalCompositeOperation = 'copy';
          ctx.drawImage(R, 0, 0);
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(G, 0, 0);
          ctx.drawImage(B, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'pixelate': {
          const b = Math.max(2, Math.round(o.v * Math.min(w, h)));
          this.pixelate(ctx, w, h, b);
          break;
        }
        case 'letterbox': {
          const bh = o.v * h;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, w, bh);
          ctx.fillRect(0, h - bh, w, bh + 1);
          break;
        }
        case 'flash': {
          const a = o.v * Math.abs(Math.sin(Math.PI * (o.f || 2) * lt));
          if (a > 0.01) {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.globalAlpha = a;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
          break;
        }
        case 'mirror': {
          const s = this.tmp(5, w, h);
          s.ctx.drawImage(ctx.canvas, 0, 0);
          ctx.globalCompositeOperation = 'copy';
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(s.canvas, 0, 0);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        default: break;
      }
    }
    ctx.restore();
  }

  // Camada de mídia já recortada, no tamanho final e com cor/efeitos do clipe.
  mediaLayer(clip, media, src, W, H, lt) {
    const cr = clip.crop || {};
    const sx = src.w * (cr.l || 0), sy = src.h * (cr.t || 0);
    const sw = Math.max(1, src.w * (1 - (cr.l || 0) - (cr.r || 0)));
    const sh = Math.max(1, src.h * (1 - (cr.t || 0) - (cr.b || 0)));
    const { w, h } = mediaLayerSize(clip, media, W, H);
    if (w < 0.5 || h < 0.5) return null;
    const ops = clipOps(clip);
    if (!ops.length) return { img: src.el, sx, sy, sw, sh, w, h };
    const cap = Math.min(1, 2400 / Math.max(w, h));
    const ow = Math.max(1, Math.round(w * cap)), oh = Math.max(1, Math.round(h * cap));
    const L = this.layerCanvas(clip.id, ow, oh);
    L.ctx.filter = cssFilter(ops.filter((o) => CSS_OPS.has(o.op)), oh, this.svg);
    L.ctx.drawImage(src.el, sx, sy, sw, sh, 0, 0, ow, oh);
    L.ctx.filter = 'none';
    const post = postOps(ops);
    if (post.length) this.applyPost(L.ctx, ow, oh, post, lt, 'layer');
    return { img: L.canvas, sx: 0, sy: 0, sw: ow, sh: oh, w, h };
  }

  place(ctx, clip, L, lt, W, H) {
    const a = animState(clip, lt);
    const tf = clip.transform || {};
    const alpha = (clip.opacity ?? 1) * a.alpha;
    if (alpha <= 0.002 || a.scale <= 0.0005) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2 + ((tf.x || 0) + a.dx) * W, H / 2 + ((tf.y || 0) + a.dy) * H);
    ctx.rotate(((tf.rotation || 0) * Math.PI) / 180);
    ctx.scale(a.scale * (tf.flipH ? -1 : 1), a.scale * (tf.flipV ? -1 : 1));
    ctx.drawImage(L.img, L.sx, L.sy, L.sw, L.sh, -L.w / 2, -L.h / 2, L.w, L.h);
    ctx.restore();
  }

  offline(ctx, W, H, name) {
    ctx.fillStyle = '#3a0d0d';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffb4b4';
    ctx.font = `600 ${Math.max(10, H * 0.035)}px Segoe UI`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Mídia não encontrada', W / 2, H / 2 - H * 0.025);
    if (name) {
      ctx.font = `${Math.max(9, H * 0.025)}px Segoe UI`;
      ctx.fillText(name, W / 2, H / 2 + H * 0.025);
    }
  }

  drawMainClip(ctx, env, clip, lt, W, H) {
    const media = env.mediaMap[clip.mediaId];
    const bg = clip.bg || env.project.background || DEF_BG;
    const meta = media ? env.metaMap[media.id] : null;
    const src = media ? env.source(clip, media) : null;
    const fillBg = () => { ctx.fillStyle = bg.type === 'color' ? bg.color || '#000' : '#000'; ctx.fillRect(0, 0, W, H); };
    if (!src) {
      if (!media || meta?.status === 'missing') this.offline(ctx, W, H, media?.name);
      else fillBg();
      return;
    }
    const L = this.mediaLayer(clip, media, src, W, H, lt);
    if (!L) { fillBg(); return; }
    if (bg.type === 'blur') {
      const s = Math.max(W / L.w, H / L.h);
      const bw = L.w * s, bh = L.h * s;
      const bpx = (bg.blur ?? 0.03) * H;
      const ex = bpx * 1.5;
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.filter = `blur(${bpx.toFixed(1)}px)`;
      ctx.drawImage(L.img, L.sx, L.sy, L.sw, L.sh, (W - bw) / 2 - ex, (H - bh) / 2 - ex, bw + ex * 2, bh + ex * 2);
      ctx.restore();
    } else fillBg();
    this.place(ctx, clip, L, lt, W, H);
  }

  drawText(ctx, clip, lt, W, H, k) {
    const a = animState(clip, lt);
    const tf = clip.transform || {};
    const alpha = (clip.opacity ?? 1) * a.alpha;
    if (alpha <= 0.002 || a.scale <= 0.0005) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2 + ((tf.x || 0) + a.dx) * W, H / 2 + ((tf.y || 0) + a.dy) * H);
    ctx.rotate(((tf.rotation || 0) * Math.PI) / 180);
    const s = a.scale * (tf.scale ?? 1);
    ctx.scale(s, s);
    drawTextBlock(ctx, clip.text, k);
    ctx.restore();
  }

  applyFrameOps(ops, lt, W, H) {
    if (!ops.length) return;
    const css = ops.filter((o) => CSS_OPS.has(o.op));
    if (css.length) {
      const s = this.tmp(4, W, H);
      s.ctx.drawImage(this.canvas, 0, 0);
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.filter = cssFilter(css, H, this.svg);
      ctx.drawImage(s.canvas, 0, 0);
      ctx.restore();
    }
    this.applyPost(this.ctx, W, H, postOps(ops), lt, 'frame');
  }

  render(env) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const { project, t } = env;
    const k = W / project.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    const bgc = project.background?.color || '#000000';
    const main = mainTrack(project);
    if (main && !main.hidden) {
      const act = main.clips.filter((c) => t >= c.start && t < c.start + c.duration);
      if (!act.length) { ctx.fillStyle = bgc; ctx.fillRect(0, 0, W, H); }
      else if (act.length === 1) this.drawMainClip(ctx, env, act[0], t - act[0].start, W, H);
      else {
        const A = act[act.length - 2], B = act[act.length - 1];
        const d = A.start + A.duration - B.start;
        const p = d > 0 ? (t - B.start) / d : 1;
        const ta = this.tmp(0, W, H), tb = this.tmp(1, W, H);
        this.drawMainClip(ta.ctx, env, A, t - A.start, W, H);
        this.drawMainClip(tb.ctx, env, B, t - B.start, W, H);
        drawTransition(ctx, A.transition?.id || 'fade', ta.canvas, tb.canvas, p, W, H, this.tmp(2, W, H), (c, w, h, b) => this.pixelate(c, w, h, b));
      }
    } else { ctx.fillStyle = bgc; ctx.fillRect(0, 0, W, H); }

    const mi = main ? project.tracks.indexOf(main) : project.tracks.length;
    for (let i = mi - 1; i >= 0; i--) {
      const tr = project.tracks[i];
      if (tr.hidden || tr.kind === 'audio') continue;
      for (const c of tr.clips) {
        if (t < c.start || t >= c.start + c.duration) continue;
        const lt = t - c.start;
        if (c.type === 'effect') this.applyFrameOps(effectClipOps(c), lt, W, H);
        else if (c.type === 'text') this.drawText(ctx, c, lt, W, H, k);
        else if (c.type === 'video' || c.type === 'image') {
          const media = env.mediaMap[c.mediaId];
          const src = media ? env.source(c, media) : null;
          if (!src) continue;
          const L = this.mediaLayer(c, media, src, W, H, lt);
          if (L) this.place(ctx, c, L, lt, W, H);
        }
      }
    }
  }
}
