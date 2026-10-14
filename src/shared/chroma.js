// Chroma key (remover fundo verde/azul). A prévia reproduz as contas dos filtros
// chromakey e despill do FFmpeg, usados na exportação — por isso o recorte é o mesmo.

export const DEFAULT_CHROMA = { on: false, color: '#00d639', similarity: 30, smooth: 12, spill: true };

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0x00ff00;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
// Mesma conversão do FFmpeg (RGB_TO_U_CCIR / RGB_TO_V_CCIR)
const U = (r, g, b) => 128 + (-0.16874 * r - 0.33126 * g + 0.5 * b) * (224 / 255);
const V = (r, g, b) => 128 + (0.5 * r - 0.41869 * g - 0.08131 * b) * (224 / 255);

// Controles da interface (0–100) → parâmetros do FFmpeg.
export function chromaParams(ch = {}) {
  const c = { ...DEFAULT_CHROMA, ...ch };
  const { r, g, b } = rgb(c.color);
  const similarity = 0.01 + (Math.max(0, Math.min(100, c.similarity)) / 100) * 0.49;
  const blend = (Math.max(0, Math.min(100, c.smooth)) / 100) * 0.3;
  let spill = null;
  if (c.spill) spill = g >= r && g >= b ? 'green' : b >= r && b >= g ? 'blue' : null;
  return { r, g, b, ku: U(r, g, b), kv: V(r, g, b), similarity, blend, spill, hex: ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0') };
}

// Filtros do FFmpeg (entrada: o vídeo já recortado e na escala da camada).
export function chromaFilters(ch) {
  const p = chromaParams(ch);
  const f = ['format=yuva444p', `chromakey=color=0x${p.hex}:similarity=${p.similarity.toFixed(4)}:blend=${p.blend.toFixed(4)}`, 'format=rgba'];
  if (p.spill) f.push(`despill=type=${p.spill}`);
  return f;
}

// Prévia: aplica o recorte nos pixels (RGBA) de uma camada.
export function keyPixels(data, ch) {
  const p = chromaParams(ch);
  const { ku, kv, similarity, blend, spill } = p;
  const inv = 1 / (255 * 255 * 2);
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    const du = U(r, g, b) - ku, dv = V(r, g, b) - kv;
    const diff = Math.sqrt((du * du + dv * dv) * inv);
    const a = blend > 0.0001 ? Math.max(0, Math.min(1, (diff - similarity) / blend)) : diff > similarity ? 1 : 0;
    if (spill === 'green') { const s = g - (r + b) / 2; if (s > 0) g -= s; }
    else if (spill === 'blue') { const s = b - (r + g) / 2; if (s > 0) b -= s; }
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = Math.round(data[i + 3] * a);
  }
}
