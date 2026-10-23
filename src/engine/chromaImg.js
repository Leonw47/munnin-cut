// Foto com "remover fundo": o recorte é calculado uma vez na foto inteira (não a cada quadro, e antes
// do corte — as bordas da foto são as mesmas sempre). A exportação usa a mesma função para gerar o PNG.
import { keyImage } from '../shared/chroma.js';
import { makeCanvas } from './util.js';

export function recortarFoto(el, w0, h0, ch, cap) {
  const k = Math.min(1, cap / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(el, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  keyImage(img.data, w, h, ch);
  ctx.putImageData(img, 0, 0);
  return c;
}
