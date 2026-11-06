// Sombra de foto/vídeo (faixas de cima). Calculada no espaço da camada, antes do giro e das animações: gira e
// cresce junto com a camada, igual na prévia (canvas) e na exportação (FFmpeg). Desfoque e distância são
// relativos ao tamanho da camada — a mesma sombra em qualquer resolução e com qualquer zoom.
export const SOMBRA_PADRAO = { on: false, cor: '#000000', opacidade: 0.6, desfoque: 30, distancia: 25, angulo: 45 };

export function sombraDe(clip) {
  if (!clip?.sombra?.on || (clip.type !== 'video' && clip.type !== 'image')) return null;
  return { ...SOMBRA_PADRAO, ...clip.sombra };
}

// Em pixels de uma camada w×h: sigma do desfoque gaussiano, deslocamento (ângulo 0° = direita, 90° = para baixo)
// e a margem em volta que cabe o desfoque e o deslocamento.
export function sombraPx(sb, w, h) {
  const base = Math.max(1, Math.min(w, h));
  const sigma = (sb.desfoque / 100) * 0.08 * base;
  const d = (sb.distancia / 100) * 0.15 * base;
  const a = (sb.angulo * Math.PI) / 180;
  return { sigma, dx: Math.cos(a) * d, dy: Math.sin(a) * d, P: Math.ceil(3 * sigma + d) + 2 };
}
