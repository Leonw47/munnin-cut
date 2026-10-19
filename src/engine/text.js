// Layout e desenho de texto em canvas — usado na prévia e para gerar os PNGs da exportação.
import { EMOJI_FONT } from '../shared/defs.js';
import { hexToRgba, makeCanvas } from './util.js';

export function fontCss(st, px) {
  const fam = st.font === 'emoji' ? EMOJI_FONT : `"${st.font}", "Segoe UI Emoji", "Segoe UI", sans-serif`;
  return `${st.italic ? 'italic ' : ''}${st.weight || 400} ${Math.max(1, px)}px ${fam}`;
}

let measureCtx = null;
function mctx() {
  if (!measureCtx) measureCtx = makeCanvas(4, 4).getContext('2d');
  return measureCtx;
}

export function layoutText(st, k, ctx = mctx()) {
  const size = st.size * k;
  ctx.font = fontCss(st, size);
  ctx.letterSpacing = `${(st.letterSpacing || 0) * k}px`;
  const content = st.uppercase ? (st.content || '').toUpperCase() : st.content || '';
  const lines = content.split('\n');
  const widths = lines.map((l) => ctx.measureText(l.length ? l : ' ').width);
  const lh = size * (st.lineHeight || 1.2);
  const tw = Math.max(1, ...widths);
  const th = lh * lines.length;
  const pad = st.background?.enabled ? (st.background.padding || 0) * k : 0;
  return { lines, widths, lh, tw, th, pad, boxW: tw + pad * 2, boxH: th + pad * 2 };
}

// Margem extra para contorno e sombra (usada no PNG de exportação).
export function textMargin(st, k) {
  let m = 4;
  if (st.stroke?.enabled) m += (st.stroke.width || 0) * k;
  if (st.shadow?.enabled) m += ((st.shadow.blur || 0) * 2 + Math.max(Math.abs(st.shadow.x || 0), Math.abs(st.shadow.y || 0))) * k;
  return Math.ceil(m);
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Desenha o bloco de texto centrado em (0,0) no sistema atual do ctx.
export function drawTextBlock(ctx, st, k) {
  const L = layoutText(st, k, ctx);
  const bg = st.background;
  if (bg?.enabled) {
    ctx.save();
    ctx.fillStyle = hexToRgba(bg.color, bg.opacity ?? 1);
    roundRect(ctx, -L.boxW / 2, -L.boxH / 2, L.boxW, L.boxH, (bg.radius || 0) * k);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.font = fontCss(st, st.size * k);
  ctx.letterSpacing = `${(st.letterSpacing || 0) * k}px`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const sh = st.shadow;
  const stroke = st.stroke;
  L.lines.forEach((line, i) => {
    const w = L.widths[i];
    const y = -L.th / 2 + L.lh * (i + 0.5);
    const x = st.align === 'left' ? -L.tw / 2 : st.align === 'right' ? L.tw / 2 - w : -w / 2;
    let shadowDone = false;
    const setShadow = () => {
      if (sh?.enabled && !shadowDone) {
        ctx.shadowColor = hexToRgba(sh.color, sh.opacity ?? 1);
        ctx.shadowBlur = (sh.blur || 0) * k;
        ctx.shadowOffsetX = (sh.x || 0) * k;
        ctx.shadowOffsetY = (sh.y || 0) * k;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    };
    if (stroke?.enabled && stroke.width > 0) {
      setShadow();
      shadowDone = true;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.lineWidth = stroke.width * 2 * k;
      ctx.strokeStyle = stroke.color;
      ctx.strokeText(line, x, y);
    }
    setShadow();
    ctx.fillStyle = st.color;
    ctx.fillText(line, x, y);
  });
  ctx.restore();
  return L;
}

// PNG de um clipe de texto já com escala, rotação e opacidade (para a exportação).
// Com pontos de modificação, o que muda fica de fora (scale: tamanho usado; rotate/opacity: false).
export async function renderTextPng(clip, k, { scale = null, scaleX = null, scaleY = null, rotate = true, opacity = true } = {}) {
  const st = clip.text;
  const tf = clip.transform || {};
  const kk = k * (scale ?? tf.scale ?? 1);
  const sx = scaleX ?? tf.scaleX ?? 1;
  const sy = scaleY ?? tf.scaleY ?? 1;
  await ensureFont(st, kk);
  const L = layoutText(st, kk);
  const m = textMargin(st, kk);
  const bw = (L.boxW + m * 2) * sx, bh = (L.boxH + m * 2) * sy;
  const rot = rotate ? ((tf.rotation || 0) * Math.PI) / 180 : 0;
  const rw = Math.ceil(Math.abs(bw * Math.cos(rot)) + Math.abs(bh * Math.sin(rot)));
  const rh = Math.ceil(Math.abs(bw * Math.sin(rot)) + Math.abs(bh * Math.cos(rot)));
  const c = makeCanvas(rw + 2, rh + 2);
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(rot);
  ctx.scale(sx, sy);
  ctx.globalAlpha = opacity ? clip.opacity ?? 1 : 1;
  drawTextBlock(ctx, st, kk);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

export async function ensureFont(st, k = 1) {
  if (st.font === 'emoji' || !document.fonts) return;
  try { await document.fonts.load(fontCss(st, Math.max(12, st.size * k)), st.content || 'A'); } catch { /* fonte do sistema */ }
}
