// Exportar em partes: onde cortar o vídeo. Cada parte é montada por um FFmpeg separado — só com o que aparece
// nela — e as partes são emendadas sem recodificar. A memória fica do tamanho de uma parte, não do vídeo todo
// (o FFmpeg só solta a memória de uma foto ou camada no fim da exportação).
import { layoutProject, mainTrack, transitionDuration, projectDuration, overlayChains, overlayTransDur } from './timeline.js';
import { effectDef, isSegmentEffect } from './effects.js';

// Formatos que podem ser emendados sem recodificar (H.264/H.265 em MP4/MOV/MKV).
export const FORMATOS_EM_PARTES = new Set(['mp4', 'mov', 'mkv', 'mp4_hevc', 'mov_hevc']);

/**
 * Janelas [a, b) em segundos, de ~`alvo` segundos cada, com os cortes num quadro inteiro e fora de: transições da
 * faixa principal e das faixas de cima (dois clipes ao mesmo tempo) e efeitos que contam o próprio tempo
 * (partículas, distorções, efeito numa área). Vídeo curto: uma parte só.
 */
export function planejarPartes(src, fps = 30, alvo = 30, fim = null) {
  const p = layoutProject(structuredClone(src));
  const TF = Math.round((fim ? Math.min(fim, projectDuration(p)) : projectDuration(p)) * fps);
  if (TF <= Math.round(alvo * 1.5 * fps)) return [[0, TF / fps]];
  const q = (x) => Math.max(1, Math.round(x * fps)) / fps;
  const proib = []; // [início, fim] em quadros: cortar estritamente dentro não pode
  const main = mainTrack(p);
  if (main) {
    // mesma conta de quadros da montagem (concat/xfade em graph.js)
    let S = 0;
    main.clips.forEach((c, i) => {
      const durF = Math.round(q(c.duration) * fps);
      const td = transitionDuration(c, main.clips[i + 1]);
      const tdF = td > 0 ? Math.round(Math.min(Math.round(td * fps) / fps, q(c.duration) / 2) * fps) : 0;
      if (tdF > 0) proib.push([S + durF - tdF - 1, S + durF + 1]);
      S += durF - tdF;
    });
  }
  for (const tr of p.tracks) {
    if (tr.main || tr.hidden) continue;
    if (tr.kind !== 'effect') {
      for (const ch of overlayChains(tr)) {
        for (let i = 1; i < ch.length; i++) {
          const cut = Math.round(ch[i].start * fps), d = Math.round(overlayTransDur(ch[i - 1], ch[i]) * fps);
          proib.push([cut - d - 1, cut + d + 1]);
        }
      }
    }
    for (const c of tr.clips) {
      if (c.type !== 'effect') continue;
      const def = c.effect?.kind === 'filter' ? null : effectDef(c.effect?.id);
      if (def && (isSegmentEffect(def) || def.layer || c.area?.on)) proib.push([Math.floor(c.start * fps) - 1, Math.ceil((c.start + c.duration) * fps) + 1]);
    }
  }
  const livre = (f) => !proib.some(([a, b]) => f > a && f < b);
  const passo = Math.round(alvo * fps);
  const cortes = [0];
  for (let alvoF = passo; alvoF < TF - passo / 2; alvoF += passo) {
    let achou = null;
    for (let d = 0; d <= passo / 2 && achou === null; d++) {
      if (livre(alvoF + d)) achou = alvoF + d;
      else if (livre(alvoF - d)) achou = alvoF - d;
    }
    // sem lugar livre por perto (ex.: um efeito longo), essa parte fica maior
    const minimo = Math.min(fps * 5, passo / 2);
    if (achou !== null && achou > cortes[cortes.length - 1] + minimo && achou < TF - minimo) cortes.push(achou);
  }
  cortes.push(TF);
  return cortes.slice(0, -1).map((a, i) => [a / fps, cortes[i + 1] / fps]);
}
