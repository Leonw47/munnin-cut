// Escalas grandes (até 2000%): a camada pode ficar dezenas de vezes maior que a tela. Desenhar/ampliar a
// mídia inteira nesse tamanho trava a prévia e a exportação (19 200 px de largura = ~800 MB por quadro).
// Quando a camada está parada (sem giro, sem pontos de modificação de posição/escala e sem animação de
// movimento), troca o clipe por um equivalente que mostra SÓ a parte visível: mais recorte + posição e escala
// ajustadas para o resultado na tela ser idêntico. A prévia e a exportação usam esta mesma conta.
import { cropDims, fitScale } from './timeline.js';

const MOVE = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation'];
const animaMovimento = (a) => a && a.id && a.id !== 'none' && a.id !== 'fade';

export function clipVisivel(clip, media, W, H) {
  if (!media || (clip.type !== 'video' && clip.type !== 'image')) return clip;
  const tf = clip.transform || {};
  if (Math.abs(tf.rotation || 0) > 1e-6) return clip;
  if (clip.kf && MOVE.some((p) => clip.kf[p]?.length)) return clip;
  // na exportação os pontos que mudam ficam em __dyn (splitKf tira o kf): também é movimento
  if (clip.__dyn && MOVE.some((p) => clip.__dyn[p]?.length)) return clip;
  if (animaMovimento(clip.animIn) || animaMovimento(clip.animOut) || (clip.animLoop && clip.animLoop.id !== 'none')) return clip;
  const cr = clip.crop || {};
  const { sw, sh } = cropDims(media, cr);
  const s0 = fitScale(sw, sh, W, H, clip.fit) * (tf.scale ?? 1);
  const sx = tf.scaleX ?? 1, sy = tf.scaleY ?? 1;
  const w = sw * s0 * sx, h = sh * s0 * sy;
  if (w <= W * 1.5 && h <= H * 1.5) return clip;
  const cx = W / 2 + (tf.x || 0) * W, cy = H / 2 + (tf.y || 0) * H;
  const x0 = cx - w / 2, y0 = cy - h / 2;
  // parte visível (com 2 px de folga), em coordenadas da tela
  const vx0 = Math.max(x0, -2), vx1 = Math.min(x0 + w, W + 2);
  const vy0 = Math.max(y0, -2), vy1 = Math.min(y0 + h, H + 2);
  if (vx1 - vx0 < 1 || vy1 - vy0 < 1) return clip;   // fora da tela: nada a desenhar, deixa como está
  let fl = (vx0 - x0) / w, fr = (x0 + w - vx1) / w, ft = (vy0 - y0) / h, fb = (y0 + h - vy1) / h;
  if (tf.flipH) [fl, fr] = [fr, fl];
  if (tf.flipV) [ft, fb] = [fb, ft];
  const lw = 1 - (cr.l || 0) - (cr.r || 0), lh = 1 - (cr.t || 0) - (cr.b || 0);
  const crop = { l: (cr.l || 0) + fl * lw, r: (cr.r || 0) + fr * lw, t: (cr.t || 0) + ft * lh, b: (cr.b || 0) + fb * lh };
  const { sw: sw2, sh: sh2 } = cropDims(media, crop);
  const scale = s0 / fitScale(sw2, sh2, W, H, clip.fit);
  return {
    ...clip,
    crop,
    transform: { ...tf, scale, x: ((vx0 + vx1) / 2 - W / 2) / W, y: ((vy0 + vy1) / 2 - H / 2) / H },
    __visivel: true,
  };
}
