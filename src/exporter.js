// Pipeline de exportação: gera os PNGs de texto, monta o grafo do FFmpeg e dispara o processo.
import { renderTextPng } from './engine/text.js';
import { buildExport, exportSize } from './shared/graph.js';
import { EXPORT_FORMATS } from './shared/defs.js';
import { uid } from './shared/timeline.js';

/**
 * opts: { project, meta, format, res, fps, quality, hw, outPath, onProgress(pct, speed) }
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
    const mediaMap = {};
    for (const m of project.media) mediaMap[m.id] = { ...m, missing: meta[m.id]?.status === 'missing' };
    const { args, graph, duration } = buildExport({
      project, mediaMap,
      out: { format, width: size.width, height: size.height, fps, quality, hw },
      textAssets, outPath, graphPath: '__GRAPH__',
    });
    const off = window.api.onExportProgress((p) => { if (p.jobId === jobId && onProgress) onProgress(p.pct, p.speed); });
    try {
      return await window.api.exportStart({ jobId, args, graph, duration, outPath });
    } finally { off(); }
  })();
  return { jobId, promise, cancel: () => window.api.exportCancel(jobId) };
}
