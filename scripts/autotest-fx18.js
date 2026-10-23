// Folha de quadros dos efeitos da 1.8 (prévia) + exportação de alguns para comparar.
const { useStore, startExport, engine } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const info = await window.api.info();
const DIR = info.tempDir.replace(/[\\/]munnin-cut-jobs$/, '/munnin-cut-test').replace(/\\/g, '/');
const res = {};
const waitFor = async (fn, ms = 15000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(100); } return null; };

const IDS = (window.__fxIds || 'fire,fireFrame,explosion,impactBurst,lightning,sparks,smoke,speedLines,underwater,lensDrops,splash,ripple,swirl,heat,fisheye,melt,jelly,breatheStretch,handheld,camBounce,dramaZoom').split(',');
const TIMES = [0.15, 0.6, 1.3];
S().newProject('16:9');
await sleep(300);
const [mid] = await S().importPaths([DIR + '/v18/IMG_3301.HEIC']);
await waitFor(() => S().meta[mid]?.status === 'ready', 30000);
const cid = S().addMedia(mid);
S().updateClip(cid, { duration: 3 });
const tw = 320, th = 180;
const sheet = document.createElement('canvas');
sheet.width = tw * TIMES.length; sheet.height = th * IDS.length;
const sx = sheet.getContext('2d');
sx.font = 'bold 14px Segoe UI';
for (let r = 0; r < IDS.length; r++) {
  const id = IDS[r];
  const eid = S().addEffect('effect', id, { time: 0 });
  const tr = S().project.tracks.find((t) => t.clips.some((c) => c.id === eid));
  if (eid) S().updateClip(eid, { start: 0, duration: 2.5 });
  for (let j = 0; j < TIMES.length; j++) {
    S().setTime(TIMES[j]); engine.invalidate();
    await sleep(160);
    sx.drawImage(engine.canvas, j * tw, r * th, tw, th);
  }
  sx.fillStyle = '#000a'; sx.fillRect(0, r * th, 150, 20);
  sx.fillStyle = '#fff'; sx.fillText(id, 4, r * th + 15);
  if (eid) S().commit((p) => { for (const t of p.tracks) t.clips = t.clips.filter((c) => c.id !== eid); });
  void tr;
}
const blob = await new Promise((r) => sheet.toBlob(r, 'image/png'));
const p = await window.api.writeFile('job:fx18', 'folha_previa.png', new Uint8Array(await blob.arrayBuffer()));
log({ folha: p });

// exportação de alguns efeitos de camada (para comparar com a prévia)
const EXP = (window.__fxExp || 'fire,explosion,lightning,underwater').split(',');
for (const id of EXP) {
  const eid = S().addEffect('effect', id, { time: 0 });
  S().updateClip(eid, { start: 0, duration: 2.5 });
  const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 360, fps: 30, quality: 'standard', vKbps: 2500, aKbps: 128, outPath: `${DIR}/v18/fx_${id}.mp4`, endAt: 2.5 }).promise;
  res[`exporta_${id}`] = r.ok ? 'OK' : `FALHOU ${r.error}`;
  S().commit((pp) => { for (const t of pp.tracks) t.clips = t.clips.filter((c) => c.id !== eid); });
}
log(res);
return res;
