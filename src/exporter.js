// Pipeline de exportação: gera os PNGs de texto, monta o grafo do FFmpeg e dispara o processo.
import { renderTextPng } from './engine/text.js';
import { buildExport, exportSize, effectSegments } from './shared/graph.js';
import { makeCanvas } from './engine/util.js';
import { EXPORT_FORMATS } from './shared/defs.js';
import { uid } from './shared/timeline.js';

/**
 * opts: { project, meta, format, res, fps, quality, hw, outPath, onProgress(pct, speed, label) }
 * Retorna { jobId, promise, cancel } — promise resolve com { ok, outPath, cancelled, error }.
 */
export function startExport(opts) {
  const jobId = uid('job');
  const { project, meta, format, res, fps, quality, hw, outPath, onProgress } = opts;
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
    const fxAssets = {};
    if (fmt.kind !== 'audio') {
      if (document.fonts) await document.fonts.load('900 64px Montserrat').catch(() => {});
      const { segments } = effectSegments(project, fps);
      const layered = segments.filter((sg) => sg.def.layer);
      const total = layered.reduce((n, sg) => n + sg.frames, 0);
      let done = 0;
      const cv = makeCanvas(size.width, size.height);
      const ctx = cv.getContext('2d');
      for (const sg of layered) {
        let first = null;
        for (let f = 0; f < sg.frames; f++) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.clearRect(0, 0, cv.width, cv.height);
          if (sg.def.layer.blend === 'screen') {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.globalCompositeOperation = 'screen';
          }
          ctx.save();
          sg.def.layer.draw(ctx, cv.width, cv.height, f / fps, sg.D, sg.k, sg.seed);
          ctx.restore();
          const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
          const p = await window.api.writeFile(`job:${jobId}`, `fx_${sg.clip.id}_${String(f).padStart(5, '0')}.png`, new Uint8Array(await blob.arrayBuffer()));
          if (!first) first = p;
          done++;
          if (onProgress && done % 5 === 0) onProgress(0, null, `Preparando efeitos… ${Math.round((done / total) * 100)}%`);
        }
        fxAssets[sg.clip.id] = { pattern: first.replace(/00000\.png$/, '%05d.png') };
      }
    }
    const mediaMap = {};
    for (const m of project.media) mediaMap[m.id] = { ...m, missing: meta[m.id]?.status === 'missing' };
    const { args, graph, duration } = buildExport({
      project, mediaMap,
      out: { format, width: size.width, height: size.height, fps, quality, hw },
      textAssets, fxAssets, outPath, graphPath: '__GRAPH__',
    });
    const off = window.api.onExportProgress((p) => { if (p.jobId === jobId && onProgress) onProgress(p.pct, p.speed); });
    try {
      return await window.api.exportStart({ jobId, args, graph, duration, outPath });
    } finally { off(); }
  })();
  return { jobId, promise, cancel: () => window.api.exportCancel(jobId) };
}
