// Perspectiva (distorcer os cantos para parecer 3D) de fotos, vídeos, textos e formas. transform.persp guarda o
// deslocamento de cada canto em frações do tamanho da camada: { on, tl, tr, br, bl } com { x, y } (0 = no lugar).
// Feita no espaço da camada, depois de espelhar e antes do pivô/giro/escala — igual na prévia (malha de triângulos
// no canvas) e na exportação (filtro perspective do FFmpeg), com a mesma homografia.
export const CANTOS = ['tl', 'tr', 'br', 'bl'];
const SINAL = { tl: [-1, -1], tr: [1, -1], br: [1, 1], bl: [-1, 1] };

export const perspDe = (tf) => tf?.persp || null;
export function temPersp(tf) {
  const p = tf?.persp;
  return !!p?.on && CANTOS.some((k) => Math.abs(p[k]?.x || 0) > 1e-4 || Math.abs(p[k]?.y || 0) > 1e-4);
}

// Cantos da camada w×h depois de distorcer, em relação ao centro (ordem: tl, tr, br, bl).
export function quadLocal(p, w, h) {
  return CANTOS.map((k) => [SINAL[k][0] * w / 2 + (p[k]?.x || 0) * w, SINAL[k][1] * h / 2 + (p[k]?.y || 0) * h]);
}

// Margem em volta da camada que cabe os cantos distorcidos.
export function margemPersp(p, w, h) {
  let m = 0;
  for (const [x, y] of quadLocal(p, w, h)) m = Math.max(m, Math.abs(x) - w / 2, Math.abs(y) - h / 2);
  return Math.ceil(Math.max(0, m)) + 2;
}

// Homografia que leva os 4 pontos src nos 4 pontos dst (resolve o sistema 8×8 por eliminação de Gauss).
export function homografia(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c || !A[c][c]) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((v, i) => v / (A[i][i] || 1));
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
export function aplicaH(H, x, y) {
  const d = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
}

// Exportação: o quadro (fw×fh, com a camada w0×h0 no centro) ganha a margem e é distorcido — os cantos do
// quadro com margem vão para onde a homografia da camada os leva (sense=destination). O centro não muda.
export function filtroPerspectiva(p, w0, h0, fw, fh) {
  const M = margemPersp(p, w0, h0);
  const PW = fw + 2 * M, PH = fh + 2 * M, cx = PW / 2, cy = PH / 2;
  const caixa = [[cx - w0 / 2, cy - h0 / 2], [cx + w0 / 2, cy - h0 / 2], [cx + w0 / 2, cy + h0 / 2], [cx - w0 / 2, cy + h0 / 2]];
  const quad = quadLocal(p, w0, h0).map(([x, y]) => [cx + x, cy + y]);
  const H = homografia(caixa, quad);
  const [c0, c1, c2, c3] = [[0, 0], [PW, 0], [0, PH], [PW, PH]].map(([x, y]) => aplicaH(H, x, y).map((v) => Math.round(v * 100) / 100));
  return {
    M,
    f: [`pad=w=iw+${2 * M}:h=ih+${2 * M}:x=${M}:y=${M}:color=black@0`, 'format=gbrap',
      `perspective=x0=${c0[0]}:y0=${c0[1]}:x1=${c1[0]}:y1=${c1[1]}:x2=${c2[0]}:y2=${c2[1]}:x3=${c3[0]}:y3=${c3[1]}:sense=destination`, 'format=rgba'],
  };
}

// Prévia: desenha a imagem (recorte sx,sy,sw,sh) no quadrilátero dst (tl,tr,br,bl, em px do ctx) com uma malha de
// triângulos — cada um é afim, e os vértices seguem a homografia (como na exportação).
export function desenhaPerspectiva(ctx, img, sx, sy, sw, sh, dst, N = 14) {
  const H = homografia([[0, 0], [1, 0], [1, 1], [0, 1]], dst);
  const P = (u, v) => aplicaH(H, u, v);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N, v0 = j / N, v1 = (j + 1) / N;
      const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1);
      tri(ctx, img, [sx + u0 * sw, sy + v0 * sh], [sx + u1 * sw, sy + v0 * sh], [sx + u1 * sw, sy + v1 * sh], a, b, c);
      tri(ctx, img, [sx + u0 * sw, sy + v0 * sh], [sx + u1 * sw, sy + v1 * sh], [sx + u0 * sw, sy + v1 * sh], a, c, d);
    }
  }
}

// Um triângulo da origem (s0,s1,s2) no destino (d0,d1,d2): recorte levemente aumentado (sem fresta entre os
// triângulos) e transformação afim; desenha só o retângulo da origem que o triângulo cobre.
function tri(ctx, img, s0, s1, s2, d0, d1, d2) {
  const mx = (d0[0] + d1[0] + d2[0]) / 3, my = (d0[1] + d1[1] + d2[1]) / 3;
  const inf = (p) => { const dx = p[0] - mx, dy = p[1] - my, l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * 0.7, p[1] + (dy / l) * 0.7]; };
  const [e0, e1, e2] = [inf(d0), inf(d1), inf(d2)];
  const den = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
  if (Math.abs(den) < 1e-9) return;
  const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / den;
  const b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / den;
  const c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / den;
  const d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / den;
  const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b * s0[0] - d * s0[1];
  const bx = Math.floor(Math.min(s0[0], s1[0], s2[0])) - 1, by = Math.floor(Math.min(s0[1], s1[1], s2[1])) - 1;
  const bw = Math.ceil(Math.max(s0[0], s1[0], s2[0])) + 1 - bx, bh = Math.ceil(Math.max(s0[1], s1[1], s2[1])) + 1 - by;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.closePath(); ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  const iw = img.videoWidth || img.naturalWidth || img.width, ih = img.videoHeight || img.naturalHeight || img.height;
  const x0 = Math.max(0, bx), y0 = Math.max(0, by), x1 = Math.min(iw, bx + bw), y1 = Math.min(ih, by + bh);
  if (x1 > x0 && y1 > y0) ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}
