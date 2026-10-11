// Teste dos efeitos: miniaturas, prévia e exportação (camadas + trechos).
const { useStore, engine, startExport } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => window.api.testCapture(n);
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const DIR = 'C:/Users/leona/AppData/Local/Temp/munnin-cut-test';

S().newProject('9:16');
const ids = await S().importPaths([DIR + '/a.mp4', DIR + '/c.png']);
for (let i = 0; i < 100 && !ids.every((x) => S().meta[x]?.status === 'ready'); i++) await sleep(150);
S().addMedia(ids[0]); S().addMedia(ids[1]); S().addMedia(ids[0]);
useStore.setState({ leftTab: 'effects' });
for (const cat of ['camera', 'retro', 'glitch', 'light', 'split', 'party']) {
  [...document.querySelectorAll('.lp-body .btn.small')].find((b) => b.textContent === ({ camera: 'Câmera', retro: 'Retrô', glitch: 'Glitch', light: 'Luz e cor', split: 'Divisão', party: 'Partículas' })[cat])?.click();
  await sleep(700);
  await shot('40_fx_' + cat);
}
// uma sequência de efeitos, 1,5 s cada
const seq = ['zoomSlow', 'hearts', 'rec', 'vhs', 'glitchBlocks', 'lightLeak', 'split4', 'confetti', 'countdown', 'oldfilm', 'duoPink', 'stars'];
seq.forEach((id, i) => S().addEffect('effect', id, { time: 0.2 + i * 1.5 }));
for (const t of S().project.tracks) for (const c of t.clips) if (c.type === 'effect') S().updateClip(c.id, (x) => { x.duration = 1.5; });
S().select(null);
await sleep(300);
const times = seq.map((_, i) => +(0.2 + i * 1.5 + 0.8).toFixed(2));
const prev = [];
for (const t of times) {
  S().setTime(t);
  await sleep(700);
  const url = engine.canvas.toDataURL('image/png');
  const bytes = Uint8Array.from(atob(url.split(',')[1]), (ch) => ch.charCodeAt(0));
  prev.push(await window.api.writeFile('cache', `fxprev_${t}.png`, bytes));
}
S().setTime(times[1]);
await sleep(500);
await shot('41_fx_timeline');
const t0 = performance.now();
const labels = [];
const run = startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 720, fps: 30, quality: 'standard', hw: null, outPath: DIR + '/fx_export.mp4', onProgress: (p, sp, l) => { if (l && !labels.includes(l.split('…')[0])) labels.push(l.split('…')[0]); } });
const r = await run.promise;
log({ export: r, secs: ((performance.now() - t0) / 1000).toFixed(1), labels, times, prev });
return r.ok;
