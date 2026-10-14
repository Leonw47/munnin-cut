import { effectDef } from './effects.js';

// Operações de imagem. Cada filtro, ajuste e efeito vira uma lista de "ops".
// A mesma lista gera o CSS da prévia (canvas) e os filtros do FFmpeg na exportação,
// com as mesmas matrizes de cor — por isso o que se vê é o que se exporta.
//
// Unidades relativas à camada (não a pixels), para valerem em qualquer resolução:
//   blur: sigma em fração da altura · rgbshift: fração da largura · pixelate: fração do menor lado
//   letterbox: fração da altura por barra · vignette/noise/sharpen/flash: 0..1

const IDENT = {
  brightness: 1, contrast: 1, saturate: 1, hue: 0, grayscale: 0, sepia: 0, invert: 0,
  blur: 0, sharpen: 0, vignette: 0, noise: 0, rgbshift: 0, pixelate: 0, letterbox: 0, flash: 0,
};

// Ops que a prévia aplica durante o desenho (ctx.filter); o resto é pós-processamento.
export const CSS_OPS = new Set(['brightness', 'contrast', 'saturate', 'hue', 'grayscale', 'sepia', 'invert', 'blur', 'tint', 'sharpen']);

export function isIdentity(o) {
  if (o.op === 'tint') return Math.abs(o.r - 1) < 1e-3 && Math.abs(o.g - 1) < 1e-3 && Math.abs(o.b - 1) < 1e-3;
  if (o.op === 'mirror') return false;
  return Math.abs((o.v ?? 0) - (IDENT[o.op] ?? 0)) < 1e-4;
}

export function scaleOps(ops, k) {
  if (Math.abs(k - 1) < 1e-3) return ops;
  return ops
    .map((o) => {
      if (o.op === 'tint') return { ...o, r: 1 + (o.r - 1) * k, g: 1 + (o.g - 1) * k, b: 1 + (o.b - 1) * k };
      if (o.op === 'mirror') return k >= 0.5 ? o : null;
      const id = IDENT[o.op] ?? 0;
      return { ...o, v: id + (o.v - id) * k };
    })
    .filter(Boolean);
}

// Ordem canônica (igual nos dois lados): primeiro as de desenho, depois as de pós.
export function canonical(ops) {
  const clean = ops.filter((o) => o && !isIdentity(o));
  return [...clean.filter((o) => CSS_OPS.has(o.op)), ...clean.filter((o) => !CSS_OPS.has(o.op))];
}

// ---------- Ajustes (inspetor > Ajuste), sliders de -100 a 100 ----------
export const ADJUST_FIELDS = [
  { key: 'brightness', name: 'Brilho', min: -100, max: 100 },
  { key: 'contrast', name: 'Contraste', min: -100, max: 100 },
  { key: 'saturation', name: 'Saturação', min: -100, max: 100 },
  { key: 'temperature', name: 'Temperatura', min: -100, max: 100 },
  { key: 'hue', name: 'Matiz', min: -100, max: 100 },
  { key: 'sharpen', name: 'Nitidez', min: 0, max: 100 },
  { key: 'vignette', name: 'Vinheta', min: 0, max: 100 },
  { key: 'blur', name: 'Desfoque', min: 0, max: 100 },
];

export function adjustOps(a = {}) {
  const ops = [];
  if (a.brightness) ops.push({ op: 'brightness', v: 1 + a.brightness / 200 });
  if (a.contrast) ops.push({ op: 'contrast', v: 1 + a.contrast / 150 });
  if (a.saturation) ops.push({ op: 'saturate', v: 1 + a.saturation / 100 });
  if (a.temperature) {
    const k = a.temperature / 100;
    ops.push(k > 0 ? { op: 'tint', r: 1 + 0.1 * k, g: 1 + 0.02 * k, b: 1 - 0.18 * k } : { op: 'tint', r: 1 + 0.14 * k, g: 1 + 0.01 * k, b: 1 - 0.12 * k });
  }
  if (a.hue) ops.push({ op: 'hue', v: a.hue * 1.8 });
  if (a.sharpen) ops.push({ op: 'sharpen', v: a.sharpen / 100 });
  if (a.vignette) ops.push({ op: 'vignette', v: a.vignette / 100 });
  if (a.blur) ops.push({ op: 'blur', v: (a.blur / 100) * 0.02 });
  return ops;
}

// ---------- Filtros (predefinições de cor) ----------
export const FILTERS = [
  { id: 'none', name: 'Nenhum', ops: [] },
  { id: 'vivid', name: 'Vívido', ops: [{ op: 'saturate', v: 1.45 }, { op: 'contrast', v: 1.08 }] },
  { id: 'warm', name: 'Quente', ops: [{ op: 'tint', r: 1.08, g: 1.0, b: 0.84 }, { op: 'saturate', v: 1.1 }] },
  { id: 'cool', name: 'Frio', ops: [{ op: 'tint', r: 0.88, g: 0.98, b: 1.1 }] },
  { id: 'bw', name: 'P&B', ops: [{ op: 'grayscale', v: 1 }, { op: 'contrast', v: 1.1 }] },
  { id: 'noir', name: 'Noir', ops: [{ op: 'grayscale', v: 1 }, { op: 'contrast', v: 1.45 }, { op: 'brightness', v: 0.9 }] },
  { id: 'sepia', name: 'Sépia', ops: [{ op: 'sepia', v: 0.85 }] },
  { id: 'vintage', name: 'Vintage', ops: [{ op: 'sepia', v: 0.4 }, { op: 'contrast', v: 1.1 }, { op: 'saturate', v: 0.85 }, { op: 'brightness', v: 1.05 }, { op: 'vignette', v: 0.35 }] },
  { id: 'drama', name: 'Drama', ops: [{ op: 'contrast', v: 1.35 }, { op: 'saturate', v: 0.75 }, { op: 'brightness', v: 0.92 }] },
  { id: 'faded', name: 'Desbotado', ops: [{ op: 'contrast', v: 0.82 }, { op: 'brightness', v: 1.08 }, { op: 'saturate', v: 0.75 }] },
  { id: 'pastel', name: 'Pastel', ops: [{ op: 'saturate', v: 0.6 }, { op: 'brightness', v: 1.12 }, { op: 'contrast', v: 0.9 }] },
  { id: 'film', name: 'Filme', ops: [{ op: 'sepia', v: 0.2 }, { op: 'contrast', v: 1.15 }, { op: 'saturate', v: 1.1 }] },
  { id: 'retro', name: 'Retrô', ops: [{ op: 'sepia', v: 0.3 }, { op: 'hue', v: -12 }, { op: 'saturate', v: 1.3 }, { op: 'contrast', v: 1.05 }] },
  { id: 'lomo', name: 'Lomo', ops: [{ op: 'contrast', v: 1.3 }, { op: 'saturate', v: 1.3 }, { op: 'vignette', v: 0.5 }] },
  { id: 'autumn', name: 'Outono', ops: [{ op: 'tint', r: 1.1, g: 0.95, b: 0.8 }, { op: 'saturate', v: 1.15 }, { op: 'hue', v: -8 }] },
  { id: 'teal', name: 'Azulado', ops: [{ op: 'tint', r: 0.9, g: 1.02, b: 1.08 }, { op: 'contrast', v: 1.12 }, { op: 'saturate', v: 1.1 }] },
  { id: 'dream', name: 'Sonho', ops: [{ op: 'brightness', v: 1.1 }, { op: 'saturate', v: 1.2 }, { op: 'contrast', v: 0.9 }] },
  { id: 'neonf', name: 'Neon', ops: [{ op: 'saturate', v: 2 }, { op: 'contrast', v: 1.15 }, { op: 'hue', v: 10 }] },
];

export function filterOps(filter) {
  if (!filter || !filter.id || filter.id === 'none') return [];
  const def = FILTERS.find((f) => f.id === filter.id);
  return def ? scaleOps(def.ops, (filter.intensity ?? 100) / 100) : [];
}

// Ops de um clipe de mídia (ajustes + filtro).
export function clipOps(clip) {
  return canonical([...adjustOps(clip.adjust), ...filterOps(clip.filter)]);
}

// Ops de um clipe da faixa de efeitos (efeito ou filtro).
export function effectClipOps(clip) {
  const fx = clip.effect || {};
  const def = fx.kind === 'filter' ? FILTERS.find((e) => e.id === fx.id) : effectDef(fx.id);
  if (!def || !def.ops) return [];
  return canonical(scaleOps(def.ops, (fx.intensity ?? 100) / 100));
}

// ---------- Matrizes de cor (as mesmas do CSS Filter Effects) ----------
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

export function matrixOf(o) {
  switch (o.op) {
    case 'brightness': return [o.v, 0, 0, 0, o.v, 0, 0, 0, o.v];
    case 'tint': return [o.r, 0, 0, 0, o.g, 0, 0, 0, o.b];
    case 'saturate': {
      const s = o.v;
      return [
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
      ];
    }
    case 'hue': {
      const a = (o.v * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      return [
        0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
      ];
    }
    case 'grayscale': {
      const g = 1 - clamp01(o.v);
      return [
        0.2126 + 0.7874 * g, 0.7152 - 0.7152 * g, 0.0722 - 0.0722 * g,
        0.2126 - 0.2126 * g, 0.7152 + 0.2848 * g, 0.0722 - 0.0722 * g,
        0.2126 - 0.2126 * g, 0.7152 - 0.7152 * g, 0.0722 + 0.9278 * g,
      ];
    }
    case 'sepia': {
      const g = 1 - clamp01(o.v);
      return [
        0.393 + 0.607 * g, 0.769 - 0.769 * g, 0.189 - 0.189 * g,
        0.349 - 0.349 * g, 0.686 + 0.314 * g, 0.168 - 0.168 * g,
        0.272 - 0.272 * g, 0.534 - 0.534 * g, 0.131 + 0.869 * g,
      ];
    }
    default: return null;
  }
}

function mul3(a, b) { // a * b
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}

const n4 = (x) => String(Math.round(x * 10000) / 10000);

// ---------- Prévia: string de ctx.filter ----------
// svg: registro de filtros SVG (para tint e nitidez), ou null.
export function cssFilter(ops, h, svg) {
  const parts = [];
  for (const o of ops) {
    switch (o.op) {
      case 'brightness': parts.push(`brightness(${n4(o.v)})`); break;
      case 'contrast': parts.push(`contrast(${n4(o.v)})`); break;
      case 'saturate': parts.push(`saturate(${n4(o.v)})`); break;
      case 'hue': parts.push(`hue-rotate(${n4(o.v)}deg)`); break;
      case 'grayscale': parts.push(`grayscale(${n4(clamp01(o.v))})`); break;
      case 'sepia': parts.push(`sepia(${n4(clamp01(o.v))})`); break;
      case 'invert': parts.push(`invert(${n4(clamp01(o.v))})`); break;
      case 'blur': { const px = o.v * h; if (px > 0.25) parts.push(`blur(${px.toFixed(2)}px)`); break; }
      case 'tint': if (svg) parts.push(`url(#${svg.matrix(o.r, o.g, o.b)})`); break;
      case 'sharpen': if (svg) parts.push(`url(#${svg.kernel(o.v)})`); break;
      default: break;
    }
  }
  return parts.length ? parts.join(' ') : 'none';
}

export function postOps(ops) { return ops.filter((o) => !CSS_OPS.has(o.op)); }

// ---------- Exportação: filtros do FFmpeg ----------
// w,h: tamanho da camada nesse ponto · enable: expressão de tempo (faixa de efeitos)
// t0: início do clipe (para efeitos que dependem do tempo) · alpha: preservar transparência
export function ffFilters(ops, { w, h, enable = '', t0 = 0, alpha = false } = {}) {
  const en = enable ? `:enable='${enable}'` : '';
  const out = [];
  let mat = null;
  const flush = () => {
    if (!mat) return;
    // o colorchannelmixer só aceita coeficientes entre −2 e 2: com ajustes fortes combinados,
    // a matriz é dividida por s e o fator s volta num segundo passo (mesmo resultado, já que
    // os dois passos limitam a 0–255 do mesmo jeito que a conta única)
    const big = Math.max(...mat.map(Math.abs));
    let s = big > 1.99 ? big / 1.99 : 1;
    const m = mat.map((v) => n4(v / s));
    out.push(`colorchannelmixer=rr=${m[0]}:rg=${m[1]}:rb=${m[2]}:gr=${m[3]}:gg=${m[4]}:gb=${m[5]}:br=${m[6]}:bg=${m[7]}:bb=${m[8]}${en}`);
    while (s > 1.0001) {
      const k = Math.min(s, 1.99);
      out.push(`colorchannelmixer=rr=${n4(k)}:gg=${n4(k)}:bb=${n4(k)}${en}`);
      s /= k;
    }
    mat = null;
  };
  for (const o of ops) {
    const m = matrixOf(o);
    if (m) { mat = mat ? mul3(m, mat) : m; continue; }
    flush();
    switch (o.op) {
      case 'contrast': {
        const e = `clip((val-127.5)*${n4(o.v)}+127.5,0,255)`;
        out.push(`lutrgb=r='${e}':g='${e}':b='${e}'${en}`);
        break;
      }
      case 'invert': {
        const a = clamp01(o.v);
        const e = `clip(val*${n4(1 - 2 * a)}+${n4(255 * a)},0,255)`;
        out.push(`lutrgb=r='${e}':g='${e}':b='${e}'${en}`);
        break;
      }
      case 'blur': { const s = o.v * h; if (s > 0.25) out.push(`gblur=sigma=${s.toFixed(2)}${en}`); break; }
      case 'sharpen': {
        const a = n4(o.v), c = n4(1 + 4 * o.v);
        const k = `0 -${a} 0 -${a} ${c} -${a} 0 -${a} 0`;
        out.push(`convolution=0m='${k}':1m='${k}':2m='${k}':3m='0 0 0 0 1 0 0 0 0'${en}`);
        break;
      }
      case 'vignette': {
        const ang = n4(o.v * 1.2);
        if (alpha) {
          const f = `pow(cos(min(1,hypot(X-W/2,Y-H/2)/hypot(W/2,H/2))*${ang}),4)`;
          out.push(`geq=r='r(X,Y)*${f}':g='g(X,Y)*${f}':b='b(X,Y)*${f}':a='alpha(X,Y)'${en}`);
        } else out.push(`vignette=angle=${ang}${en}`);
        break;
      }
      case 'noise': out.push(`noise=alls=${Math.round(o.v * 50)}:allf=t+u${en}`); break;
      case 'rgbshift': { const px = Math.max(1, Math.round(o.v * w)); out.push(`rgbashift=rh=-${px}:bh=${px}${en}`); break; }
      case 'pixelate': { const b = Math.max(2, Math.round(o.v * Math.min(w, h))); out.push(`pixelize=w=${b}:h=${b}${en}`); break; }
      case 'letterbox': {
        const f = n4(o.v);
        out.push(`drawbox=x=0:y=0:w=iw:h=ih*${f}:color=black:t=fill${en}`);
        out.push(`drawbox=x=0:y=ih-ih*${f}:w=iw:h=ih*${f}+2:color=black:t=fill${en}`);
        break;
      }
      case 'flash': out.push(`eq=brightness='${n4(o.v)}*abs(sin(PI*${n4(o.f || 2)}*(t-${n4(t0)})))':eval=frame${en}`); break;
      case 'mirror': out.push(`hflip${en}`); break;
      default: break;
    }
  }
  flush();
  return out;
}

// Cor de amostra para os cartões de filtro/efeito na biblioteca (CSS puro, sem SVG).
export function previewCss(ops) {
  return cssFilter(ops.filter((o) => o.op !== 'blur' || o.v < 0.01), 120, null);
}
