// Pipeline de exportação: gera os PNGs de texto, monta o grafo do FFmpeg e dispara o processo.
import { renderTextPng } from './engine/text.js';
import { buildExport, exportSize, effectSegments } from './shared/graph.js';
import { makeCanvas } from './engine/util.js';
import { EXPORT_FORMATS } from './shared/defs.js';
import { uid } from './shared/timeline.js';

// Mude quando o desenho de alguma camada mudar, para invalidar o cache antigo.
const LAYER_VERSION = 3;
function hashKey(str) {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822507);
  }
  return ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).padStart(16, '0');
}

/**
 * opts: { project, meta, format, res, fps, quality, vKbps, aKbps, hw, outPath, onProgress(pct, speed, label) }
 * Retorna { jobId, promise, cancel } — promise resolve com { ok, outPath, cancelled, error }.
 */
export function startExport(opts) {
  const jobId = uid('job');
  const { project, meta, format, res, fps, quality, vKbps, aKbps, hw, outPath, onProgress, endAt } = opts;
  const promise = (async () => {
    const fmt = EXPORT_FORMATS.find((f) => f.id === format) || EXPORT_FORMATS[0];
    const size = exportSize(project, res);
    const textAssets = {};
    if (fmt.kind !== 'audio') {
      const k = size.width / project.width;
      for (const tr of project.tracks) {
        if (tr.hidden) continue;
        for (const c of tr.clips) {
          if (c.type !== 'text') continue;
          const bytes = await renderTextPng(c, k);
          const path = await window.api.writeFile(`job:${jobId}`, `text_${c.id}.png`, bytes);
          textAssets[c.id] = {
            path,
            cx: size.width / 2 + (c.transform?.x || 0) * size.width,
            cy: size.height / 2 + (c.transform?.y || 0) * size.height,
          };
        }
      }
    }
    // Camadas desenhadas dos efeitos (partículas, REC, VHS, luz…): um PNG por quadro.
    // Otimizações: camadas suaves em resolução menor, codificação PNG em paralelo e cache
    // (reexportar sem mudar o efeito reaproveita os quadros — ex.: só trocou as fotos).
    const fxAssets = {};
    if (fmt.kind !== 'audio') {
      if (document.fonts) await document.fonts.load('900 64px Montserrat').catch(() => {});
      const { segments } = effectSegments(project, fps);
      const layered = segments.filter((sg) => sg.def.layer);
      const total = layered.reduce((n, sg) => n + sg.frames, 0);
      let done = 0;
      for (const sg of layered) {
        const res = sg.def.layer.res || 1;
        const lw = Math.max(2, Math.round((size.width * res) / 2) * 2), lh = Math.max(2, Math.round((size.height * res) / 2) * 2);
        const key = `${sg.def.id}_${lw}x${lh}_${sg.frames}_${hashKey(JSON.stringify([LAYER_VERSION, sg.def.id, sg.frames, sg.D, sg.k, sg.seed, lw, lh, fps, sg.def.layer.blend]))}`;
        const st = await window.api.fxCacheStatus(key);
        if (!st.done) {
          const cv = makeCanvas(lw, lh);
          const ctx = cv.getContext('2d');
          const inflight = [];
          for (let f = 0; f < sg.frames; f++) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.clearRect(0, 0, lw, lh);
            if (sg.def.layer.blend === 'screen') {
              ctx.fillStyle = '#000';
              ctx.fillRect(0, 0, lw, lh);
              ctx.globalCompositeOperation = 'screen';
            }
            ctx.save();
            sg.def.layer.draw(ctx, lw, lh, f / fps, sg.D, sg.k, sg.seed);
            ctx.restore();
            const name = `f_${String(f).padStart(5, '0')}.png`;
            // toBlob copia o quadro na hora; vários PNGs são codificados ao mesmo tempo
            inflight.push(new Promise((r) => cv.toBlob(r, 'image/png')).then(async (blob) => {
              await window.api.writeFile(`fxcache:${key}`, name, new Uint8Array(await blob.arrayBuffer()));
              done++;
              if (onProgress && done % 10 === 0) onProgress(0, null, `Preparando efeitos… ${Math.round((done / total) * 100)}%`);
            }));
            if (inflight.length >= 12) await inflight.shift();
          }
          await Promise.all(inflight);
          await window.api.fxCacheDone(key);
        } else {
          done += sg.frames;
        }
        fxAssets[sg.clip.id] = { pattern: `${st.dir}\\f_%05d.png`, scaled: lw !== size.width || lh !== size.height };
      }
    }
    const mediaMap = {};
    for (const m of project.media) mediaMap[m.id] = { ...m, missing: meta[m.id]?.status === 'missing' };
    const { args, graph, duration } = buildExport({
      project, mediaMap,
      out: { format, width: size.width, height: size.height, fps, quality, vKbps, aKbps, hw, endAt },
      textAssets, fxAssets, outPath, graphPath: '__GRAPH__',
    });
    const off = window.api.onExportProgress((p) => { if (p.jobId === jobId && onProgress) onProgress(p.pct, p.speed); });
    try {
      return await window.api.exportStart({ jobId, args, graph, duration, outPath });
    } finally { off(); }
  })();
  return { jobId, promise, cancel: () => window.api.exportCancel(jobId) };
}
