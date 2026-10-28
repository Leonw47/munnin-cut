// Cortar silêncios: acha os trechos em silêncio de um clipe pela forma de onda que o app já calcula
// (100 picos por segundo, 0–255, em escala pico^0,7 — veja electron/media.js) e devolve os trechos que ficam.
// Tudo em segundos do ARQUIVO, relativos ao início do clipe (clip.in).

export const SILENCIO_PADRAO = { limiar: -38, minimo: 0.5, margem: 0.15 };

const dbDoPico = (v) => (v <= 0 ? -120 : 20 * Math.log10(Math.pow(v / 255, 1 / 0.7)));

/**
 * peaks: Uint8Array (100/s do arquivo inteiro); ini/len: trecho do arquivo usado pelo clipe (s).
 * Devolve { silencios: [[a, b]], ficam: [[a, b]], antes, depois } — "ficam" já com a margem e sem pedaços minúsculos.
 */
export function analisarSilencios(peaks, ini, len, opts = {}) {
  const { limiar, minimo, margem } = { ...SILENCIO_PADRAO, ...opts };
  const i0 = Math.max(0, Math.floor(ini * 100)), i1 = Math.min(peaks.length, Math.ceil((ini + len) * 100));
  const silencios = [];
  let ia = -1;
  for (let i = i0; i <= i1; i++) {
    const quieto = i < i1 && dbDoPico(peaks[i]) < limiar;
    if (quieto && ia < 0) ia = i;
    if (!quieto && ia >= 0) {
      const a = ia / 100 - ini, b = i / 100 - ini;
      if (b - a >= minimo) silencios.push([Math.max(0, a), Math.min(len, b)]);
      ia = -1;
    }
  }
  // o que fica: o complemento dos silêncios, com uma margem de respiro antes/depois da fala
  const ficam = [];
  let cur = 0;
  for (const [a, b] of silencios) {
    const fimFala = Math.min(len, a + margem), iniProx = Math.max(0, b - margem);
    if (fimFala - cur > 0.05) ficam.push([cur, fimFala]);
    cur = Math.max(cur, iniProx);
  }
  if (len - cur > 0.05) ficam.push([cur, len]);
  // junta pedaços que encostaram por causa da margem e descarta migalhas (< 0,12 s)
  const juntos = [];
  for (const k of ficam) {
    const ult = juntos[juntos.length - 1];
    if (ult && k[0] - ult[1] < 0.02) ult[1] = Math.max(ult[1], k[1]);
    else juntos.push([...k]);
  }
  const final = juntos.filter(([a, b]) => b - a >= 0.12);
  const depois = final.reduce((s, [a, b]) => s + (b - a), 0);
  return { silencios, ficam: final, antes: len, depois };
}
