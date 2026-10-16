// Formas padrão (quadrado, círculo, estrela…): desenho em canvas para a prévia e PNG para a exportação.
import { hexToRgba, makeCanvas } from './util.js';

// Modelos da aba Formas. w/h em pixels do projeto (k = 1).
export const SHAPES = [
  { id: 'rect', name: 'Quadrado', shape: { kind: 'rect', w: 520, h: 520 } },
  { id: 'roundrect', name: 'Arredondado', shape: { kind: 'roundrect', w: 640, h: 400, radius: 60 } },
  { id: 'circle', name: 'Círculo', shape: { kind: 'circle', w: 520, h: 520 } },
  { id: 'ring', name: 'Anel', shape: { kind: 'circle', w: 520, h: 520, fillOn: false, stroke: { enabled: true, color: '#ffffff', width: 22 } } },
  { id: 'triangle', name: 'Triângulo', shape: { kind: 'triangle', w: 560, h: 480 } },
  { id: 'diamond', name: 'Losango', shape: { kind: 'diamond', w: 480, h: 560 } },
  { id: 'hexagon', name: 'Hexágono', shape: { kind: 'hexagon', w: 560, h: 485 } },
  { id: 'star', name: 'Estrela', shape: { kind: 'star', w: 560, h: 540 } },
  { id: 'heart', name: 'Coração', shape: { kind: 'heart', w: 540, h: 480 } },
  { id: 'arrow', name: 'Seta', shape: { kind: 'arrow', w: 620, h: 300 } },
  { id: 'line', name: 'Linha', shape: { kind: 'rect', w: 760, h: 14 } },
  { id: 'speech', name: 'Balão', shape: { kind: 'speech', w: 640, h: 440, radius: 70 } },
  { id: 'frame', name: 'Moldura', shape: { kind: 'rect', w: 900, h: 600, fillOn: false, stroke: { enabled: true, color: '#ffffff', width: 18 } } },
];

export const SHAPE_KINDS = [
  { id: 'rect', name: 'Retângulo' }, { id: 'roundrect', name: 'Arredondado' }, { id: 'circle', name: 'Círculo / elipse' },
  { id: 'triangle', name: 'Triângulo' }, { id: 'diamond', name: 'Losango' }, { id: 'hexagon', name: 'Hexágono' },
  { id: 'star', name: 'Estrela' }, { id: 'heart', name: 'Coração' }, { id: 'arrow', name: 'Seta' }, { id: 'speech', name: 'Balão' },
];

export const DEFAULT_SHAPE = {
  kind: 'rect', w: 520, h: 520, radius: 40,
  fill: '#FFD60A', fillOn: true,
  stroke: { enabled: false, color: '#ffffff', width: 10 },
  shadow: { enabled: false, color: '#000000', blur: 24, x: 0, y: 8, opacity: 0.55 },
};

export function shapeName(sh) {
  return SHAPE_KINDS.find((k) => k.id === sh?.kind)?.name || 'Forma';
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function poly(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// Caminho da forma centrado em (0,0), com largura w e altura h (pixels do canvas).
export function shapePath(ctx, kind, w, h, r = 0) {
  const x = -w / 2, y = -h / 2;
  ctx.beginPath();
  switch (kind) {
    case 'roundrect': roundRectPath(ctx, x, y, w, h, r); break;
    case 'circle': ctx.ellipse(0, 0, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2); break;
    case 'triangle': poly(ctx, [[0, y], [x + w, y + h], [x, y + h]]); break;
    case 'diamond': poly(ctx, [[0, y], [x + w, 0], [0, y + h], [x, 0]]); break;
    case 'hexagon': poly(ctx, [[x + w * 0.25, y], [x + w * 0.75, y], [x + w, 0], [x + w * 0.75, y + h], [x + w * 0.25, y + h], [x, 0]]); break;
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const k = i % 2 ? 0.42 : 1;
        pts.push([Math.cos(a) * (w / 2) * k, Math.sin(a) * (h / 2) * k + h * 0.05]);
      }
      poly(ctx, pts);
      break;
    }
    case 'heart': {
      const tw = w / 2, th = h;
      ctx.moveTo(0, y + th * 0.28);
      ctx.bezierCurveTo(0, y + th * 0.02, -tw * 0.98, y, -tw, y + th * 0.3);
      ctx.bezierCurveTo(-tw, y + th * 0.6, -tw * 0.35, y + th * 0.78, 0, y + th);
      ctx.bezierCurveTo(tw * 0.35, y + th * 0.78, tw, y + th * 0.6, tw, y + th * 0.3);
      ctx.bezierCurveTo(tw * 0.98, y, 0, y + th * 0.02, 0, y + th * 0.28);
      ctx.closePath();
      break;
    }
    case 'arrow': {
      const sh = h * 0.2, hx = x + w * 0.58;
      poly(ctx, [[x, -sh], [hx, -sh], [hx, y], [x + w, 0], [hx, y + h], [hx, sh], [x, sh]]);
      break;
    }
    case 'speech': {
      const bh = h * 0.78;
      roundRectPath(ctx, x, y, w, bh, r);
      ctx.moveTo(x + w * 0.2, y + bh - 1);
      ctx.lineTo(x + w * 0.14, y + h);
      ctx.lineTo(x + w * 0.38, y + bh - 1);
      ctx.closePath();
      break;
    }
    default: ctx.rect(x, y, w, h);
  }
}

// Tamanho ocupado (com contorno) em pixels do canvas, para a caixa de seleção do reprodutor.
export function shapeSize(sh, k) {
  const s = sh.stroke?.enabled ? (sh.stroke.width || 0) * k : 0;
  return { w: Math.max(1, sh.w * k + s), h: Math.max(1, sh.h * k + s) };
}

export function shapeMargin(sh, k) {
  let m = 3;
  if (sh.stroke?.enabled) m += (sh.stroke.width || 0) * k;
  if (sh.shadow?.enabled) m += ((sh.shadow.blur || 0) * 2 + Math.max(Math.abs(sh.shadow.x || 0), Math.abs(sh.shadow.y || 0))) * k;
  return Math.ceil(m);
}

// Desenha a forma centrada em (0,0) no sistema atual do ctx.
export function drawShape(ctx, sh, k) {
  const w = Math.max(0.5, sh.w * k), h = Math.max(0.5, sh.h * k);
  ctx.save();
  const sd = sh.shadow;
  const shadowOn = () => {
    if (!sd?.enabled) return;
    ctx.shadowColor = hexToRgba(sd.color, sd.opacity ?? 1);
    ctx.shadowBlur = (sd.blur || 0) * k;
    ctx.shadowOffsetX = (sd.x || 0) * k;
    ctx.shadowOffsetY = (sd.y || 0) * k;
  };
  const shadowOff = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };
  shapePath(ctx, sh.kind, w, h, (sh.radius || 0) * k);
  let shadowUsed = false;
  if (sh.fillOn !== false) {
    shadowOn();
    shadowUsed = true;
    ctx.fillStyle = sh.fill || '#ffffff';
    ctx.fill();
  }
  if (sh.stroke?.enabled && sh.stroke.width > 0) {
    if (shadowUsed) shadowOff(); else shadowOn();
    ctx.lineJoin = 'round';
    ctx.lineWidth = sh.stroke.width * k;
    ctx.strokeStyle = sh.stroke.color || '#ffffff';
    ctx.stroke();
  }
  ctx.restore();
}

// PNG de um clipe de forma (exportação). opts.bake: escala, rotação e opacidade já aplicadas.
export async function renderShapePng(clip, k, { scale = null, scaleX = null, scaleY = null, rotate = true, opacity = true } = {}) {
  const sh = clip.shape;
  const tf = clip.transform || {};
  const kk = k * (scale ?? tf.scale ?? 1);
  const sx = scaleX ?? tf.scaleX ?? 1;
  const sy = scaleY ?? tf.scaleY ?? 1;
  const { w, h } = shapeSize(sh, kk);
  const m = shapeMargin(sh, kk);
  const bw = (w + m * 2) * sx, bh = (h + m * 2) * sy;
  const rot = rotate ? ((tf.rotation || 0) * Math.PI) / 180 : 0;
  const rw = Math.ceil(Math.abs(bw * Math.cos(rot)) + Math.abs(bh * Math.sin(rot)));
  const rh = Math.ceil(Math.abs(bw * Math.sin(rot)) + Math.abs(bh * Math.cos(rot)));
  const c = makeCanvas(rw + 2, rh + 2);
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(rot);
  ctx.scale(sx * (tf.flipH ? -1 : 1), sy * (tf.flipV ? -1 : 1));
  ctx.globalAlpha = opacity ? clip.opacity ?? 1 : 1;
  drawShape(ctx, sh, kk);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
