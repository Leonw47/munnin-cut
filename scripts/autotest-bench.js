// Mede o tempo de exportação de um projeto real dentro do app (preparação das camadas × FFmpeg).
const { useStore, startExport } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const path = window.__benchProject || 'C:/Users/leona/Documents/Munnin Cut/Projetos/p_mv3w82qnvux5yc/project.json';
const proj = await (await fetch('media://local/' + encodeURIComponent(path))).json();
S().openEditor(proj);
for (let i = 0; i < 100 && !S().project.media.every((m) => S().meta[m.id]?.status === 'ready'); i++) await sleep(150);
const runs = [];
for (const hw of [null, null]) {
  const t0 = performance.now();
  let tPrep = null;
  const r = await startExport({
    project: S().project, meta: S().meta, format: 'mp4', res: 1080, fps: 30, quality: 'standard', vKbps: 8000, aKbps: 192, hw,
    outPath: `C:/Users/leona/AppData/Local/Temp/munnin-cut-test/bench_${hw || 'cpu'}.mp4`,
    onProgress: (p, sp, label) => { if (!label && tPrep === null) tPrep = performance.now(); },
  }).promise;
  const total = (performance.now() - t0) / 1000;
  runs.push({ hw: hw || 'cpu', ok: r.ok, error: r.error?.slice(0, 200), total: total.toFixed(1), preparo: tPrep ? ((tPrep - t0) / 1000).toFixed(1) : '?', mb: r.size ? (r.size / 1048576).toFixed(1) : null });
}
await window.api.testLog(JSON.stringify(runs));
return runs;
