// Transições na prévia — reproduzem (de perto) o xfade do FFmpeg usado na exportação.
import { clamp, smoothstep, makeCanvas } from './util.js';
import { isCamTransition, drawCamTransition } from '../shared/camtrans.js';

function masked(ctx, src, tmp, W, H, paintMask) {
  // desenha src através de uma máscara (alfa) pintada por paintMask(ctx)
  const t = tmp.ctx;
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.globalCompositeOperation = 'source-over';
  t.globalAlpha = 1;
  t.clearRect(0, 0, W, H);
  t.drawImage(src, 0, 0);
  t.globalCompositeOperation = 'destination-in';
  paintMask(t);
  t.globalCompositeOperation = 'source-over';
  ctx.drawImage(tmp.canvas, 0, 0);
}

function smoothStops(g, from, to, invert = false) {
  // gradiente com curva smoothstep entre as posições [0..1] from→to
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    const pos = clamp(from + (to - from) * u);
    const a = u * u * (3 - 2 * u);
    g.addColorStop(pos, `rgba(0,0,0,${invert ? 1 - a : a})`);
  }
}

export function drawTransition(ctx, id, A, B, p, W, H, tmp, pixelate, tmpFn) {
  p = clamp(p);
  if (isCamTransition(id) && tmpFn) { drawCamTransition(ctx, id, A, B, p, W, H, tmpFn); return; }
  ctx.save();
  switch (id) {
    case 'fadeblack':
    case 'fadewhite': {
      const c = id === 'fadeblack' ? '#000' : '#fff';
      ctx.drawImage(p < 0.5 ? A : B, 0, 0);
      ctx.globalAlpha = p < 0.5 ? p * 2 : (1 - p) * 2;
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'wipeleft': ctx.drawImage(A, 0, 0); ctx.beginPath(); ctx.rect(W * (1 - p), 0, W * p, H); ctx.clip(); ctx.drawImage(B, 0, 0); break;
    case 'wiperight': ctx.drawImage(A, 0, 0); ctx.beginPath(); ctx.rect(0, 0, W * p, H); ctx.clip(); ctx.drawImage(B, 0, 0); break;
    case 'wipeup': ctx.drawImage(A, 0, 0); ctx.beginPath(); ctx.rect(0, H * (1 - p), W, H * p); ctx.clip(); ctx.drawImage(B, 0, 0); break;
    case 'wipedown': ctx.drawImage(A, 0, 0); ctx.beginPath(); ctx.rect(0, 0, W, H * p); ctx.clip(); ctx.drawImage(B, 0, 0); break;
    case 'slideleft': ctx.drawImage(A, -p * W, 0); ctx.drawImage(B, (1 - p) * W, 0); break;
    case 'slideright': ctx.drawImage(A, p * W, 0); ctx.drawImage(B, -(1 - p) * W, 0); break;
    case 'slideup': ctx.drawImage(A, 0, -p * H); ctx.drawImage(B, 0, (1 - p) * H); break;
    case 'slidedown': ctx.drawImage(A, 0, p * H); ctx.drawImage(B, 0, -(1 - p) * H); break;
    case 'coverleft': ctx.drawImage(A, 0, 0); ctx.drawImage(B, (1 - p) * W, 0); break;
    case 'coverright': ctx.drawImage(A, 0, 0); ctx.drawImage(B, -(1 - p) * W, 0); break;
    case 'smoothleft':
    case 'smoothright': {
      ctx.drawImage(A, 0, 0);
      // peso de B: smoothstep(0,1, x/W - 1 + 2p) (esquerda) — espelhado para a direita
      const g = id === 'smoothleft' ? ctx.createLinearGradient(0, 0, W, 0) : ctx.createLinearGradient(W, 0, 0, 0);
      const s0 = 1 - 2 * p; // posição (fração) onde o peso começa a subir
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        g.addColorStop(u, `rgba(0,0,0,${smoothstep(0, 1, u - s0)})`);
      }
      masked(ctx, B, tmp, W, H, (t) => { t.fillStyle = g; t.fillRect(0, 0, W, H); });
      break;
    }
    case 'circleopen':
    case 'circleclose': {
      const z = Math.hypot(W / 2, H / 2);
      const open = id === 'circleopen';
      const pp = open ? p : 1 - p;
      const r1 = Math.max(0.001, (3 * pp - 0.5) * z);
      const r0 = Math.max(0, Math.min(r1 - 0.001, (3 * pp - 1.5) * z));
      ctx.drawImage(open ? A : B, 0, 0);
      const g = ctx.createRadialGradient(W / 2, H / 2, r0, W / 2, H / 2, r1);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      masked(ctx, open ? B : A, tmp, W, H, (t) => { t.fillStyle = g; t.fillRect(0, 0, W, H); });
      break;
    }
    case 'horzopen':
    case 'vertopen': {
      ctx.drawImage(A, 0, 0);
      const horiz = id === 'horzopen';
      const g = horiz ? ctx.createLinearGradient(0, 0, 0, H) : ctx.createLinearGradient(0, 0, W, 0);
      for (let i = 0; i <= 16; i++) {
        const u = i / 16;
        const d = Math.abs(u - 0.5) * 2;
        g.addColorStop(u, `rgba(0,0,0,${smoothstep(0, 1, 2 * p - d)})`);
      }
      masked(ctx, B, tmp, W, H, (t) => { t.fillStyle = g; t.fillRect(0, 0, W, H); });
      break;
    }
    case 'radial': {
      ctx.drawImage(A, 0, 0);
      const R = Math.hypot(W, H);
      ctx.beginPath();
      ctx.moveTo(W / 2, H / 2);
      ctx.arc(W / 2, H / 2, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p, false);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(B, 0, 0);
      break;
    }
    case 'pixelize': {
      ctx.drawImage(A, 0, 0);
      ctx.globalAlpha = p;
      ctx.drawImage(B, 0, 0);
      ctx.globalAlpha = 1;
      const d = Math.ceil(Math.min(p, 1 - p) * 50) / 50;
      const block = Math.max(1, (2 * d * Math.min(W, H)) / 20);
      if (block > 1.5) pixelate(ctx, W, H, block);
      break;
    }
    case 'zoomin': {
      const z = 1 + 2.5 * smoothstep(0, 0.5, p);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(z, z);
      ctx.drawImage(A, -W / 2, -H / 2);
      ctx.restore();
      ctx.globalAlpha = smoothstep(0.5, 1, p);
      ctx.drawImage(B, 0, 0);
      break;
    }
    case 'hblur': {
      const b = Math.sin(Math.PI * p) * 0.02 * W;
      ctx.filter = b > 0.3 ? `blur(${b.toFixed(1)}px)` : 'none';
      ctx.drawImage(A, 0, 0);
      ctx.globalAlpha = p;
      ctx.drawImage(B, 0, 0);
      break;
    }
    case 'fade':
    case 'dissolve':
    default:
      ctx.drawImage(A, 0, 0);
      ctx.globalAlpha = p;
      ctx.drawImage(B, 0, 0);
      break;
  }
  ctx.restore();
}

// Pequena animação para o cartão da transição na biblioteca (A = azul, B = laranja).
export function drawTransitionThumb(ctx, id, p, W, H, tmp) {
  const mk = (color, label) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, W, H);
    x.fillStyle = '#ffffffcc'; x.font = `700 ${Math.round(H * 0.42)}px Segoe UI`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(label, W / 2, H / 2 + 1);
    return c;
  };
  if (!drawTransitionThumb.cache || drawTransitionThumb.cache.W !== W) {
    drawTransitionThumb.cache = { W, A: mk('#2563c9', 'A'), B: mk('#e8772e', 'B') };
  }
  const { A, B } = drawTransitionThumb.cache;
  ctx.clearRect(0, 0, W, H);
  const pool = drawTransitionThumb.pool || (drawTransitionThumb.pool = {});
  const tmpFn = (i) => {
    let t = pool[i];
    if (!t || t.canvas.width !== W) { const c = makeCanvas(W, H); t = pool[i] = { canvas: c, ctx: c.getContext('2d') }; }
    t.ctx.setTransform(1, 0, 0, 1, 0, 0); t.ctx.globalAlpha = 1; t.ctx.filter = 'none'; t.ctx.clearRect(0, 0, W, H);
    return t;
  };
  drawTransition(ctx, id, A, B, p, W, H, tmp, (c, w, h, b) => {
    const s = document.createElement('canvas');
    s.width = Math.max(1, Math.ceil(w / b)); s.height = Math.max(1, Math.ceil(h / b));
    s.getContext('2d').drawImage(c.canvas, 0, 0, s.width, s.height);
    c.imageSmoothingEnabled = false; c.drawImage(s, 0, 0, w, h); c.imageSmoothingEnabled = true;
  }, tmpFn);
}
