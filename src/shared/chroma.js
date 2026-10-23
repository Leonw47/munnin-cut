// Chroma key (remover fundo). A prévia reproduz as contas dos filtros do FFmpeg usados na exportação
// (chromakey/colorkey e despill) — por isso o recorte é o mesmo.
//
// Fundo colorido (verde, azul…): compara só a cor (U/V), assim a sombra no pano continua sendo fundo.
// Fundo neutro (branco, cinza, preto, bege): comparar só a cor apagava tudo o que é neutro na imagem
// (roupa branca, cinza, preto…); aí a conta usa R, G e B, que inclui o claro/escuro (filtro colorkey).
// Fotos: por padrão só some o fundo ligado às bordas — o branco DENTRO do objeto fica.

export const DEFAULT_CHROMA = { on: false, color: '#00d639', similarity: 30, smooth: 12, spill: true, bordas: true };

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
  const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  const modo = sat < 0.3 ? 'rgb' : 'uv';
  let spill = null;
  // reflexo só existe com fundo colorido (antes o branco caía em "verde" e esverdeava/tirava o verde da foto)
  if (c.spill && modo === 'uv') spill = g >= r && g >= b ? 'green' : b >= r && b >= g ? 'blue' : null;
  return { r, g, b, ku: U(r, g, b), kv: V(r, g, b), similarity, blend, spill, modo, hex: ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0') };
}

// Filtros do FFmpeg (entrada: o vídeo já recortado e na escala da camada).
export function chromaFilters(ch) {
  const p = chromaParams(ch);
  const ps = `color=0x${p.hex}:similarity=${p.similarity.toFixed(4)}:blend=${p.blend.toFixed(4)}`;
  const f = p.modo === 'rgb' ? ['format=rgba', `colorkey=${ps}`] : ['format=yuva444p', `chromakey=${ps}`, 'format=rgba'];
  if (p.spill) f.push(`despill=type=${p.spill}`);
  return f;
}

// Opacidade (0–1) de cada pixel e tira o reflexo (muda data no lugar). Mesmas contas dos filtros.
function alfas(data, p) {
  const { r: kr, g: kg, b: kb, ku, kv, similarity, blend, spill, modo } = p;
  const n = data.length >> 2;
  const A = new Float32Array(n);
  const invUV = 1 / (255 * 255 * 2), invRGB = 1 / (255 * 255 * 3);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const r = data[i];
    let g = data[i + 1], b = data[i + 2];
    let diff;
    if (modo === 'rgb') {
      const dr = r - kr, dg = g - kg, db = b - kb;
      diff = Math.sqrt((dr * dr + dg * dg + db * db) * invRGB);
    } else {
      const du = U(r, g, b) - ku, dv = V(r, g, b) - kv;
      diff = Math.sqrt((du * du + dv * dv) * invUV);
    }
    A[j] = blend > 0.0001 ? Math.max(0, Math.min(1, (diff - similarity) / blend)) : diff > similarity ? 1 : 0;
    if (spill === 'green') { const s = g - (r + b) / 2; if (s > 0) g -= s; }
    else if (spill === 'blue') { const s = b - (r + g) / 2; if (s > 0) b -= s; }
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return A;
}

// Prévia de vídeo: aplica o recorte nos pixels (RGBA) de uma camada.
export function keyPixels(data, ch) {
  const A = alfas(data, chromaParams(ch));
  for (let i = 3, j = 0; i < data.length; i += 4, j++) data[i] = Math.round(data[i] * A[j]);
}

/**
 * Foto: recorte com "só o fundo ligado às bordas" (ch.bordas, padrão ligado). Parte das bordas e
 * avança pelos pixels que não são totalmente opacos; o que tem a cor do fundo mas está cercado pelo
 * objeto (o branco de uma etiqueta, o reflexo num copo) não é alcançado e fica.
 */
export function keyImage(data, w, h, ch) {
  const c = { ...DEFAULT_CHROMA, ...ch };
  const A = alfas(data, chromaParams(c));
  const n = w * h;
  if (c.bordas !== false && n > 0) {
    const visto = new Uint8Array(n);
    const fila = new Int32Array(n);
    let ini = 0, fim = 0;
    const semente = (j) => { if (!visto[j] && A[j] < 0.999) { visto[j] = 1; fila[fim++] = j; } };
    for (let x = 0; x < w; x++) { semente(x); semente((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { semente(y * w); semente(y * w + w - 1); }
    while (ini < fim) {
      const j = fila[ini++];
      const x = j % w;
      if (x > 0) semente(j - 1);
      if (x < w - 1) semente(j + 1);
      if (j >= w) semente(j - w);
      if (j < n - w) semente(j + w);
    }
    for (let j = 0; j < n; j++) if (!visto[j]) A[j] = 1;
  }
  for (let i = 3, j = 0; j < n; i += 4, j++) data[i] = Math.round(data[i] * A[j]);
}
