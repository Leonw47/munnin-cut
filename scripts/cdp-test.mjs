// Testa o app EMPACOTADO via protocolo de depuração do Chromium (sem mexer na tela).
// Uso: node scripts/cdp-test.mjs "<caminho do Munnin Cut.exe>" <pasta de saída>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const exe = process.argv[2];
const out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const proc = spawn(exe, ['--remote-debugging-port=9333'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500);
  try {
    const list = await (await fetch('http://127.0.0.1:9333/json')).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* ainda abrindo */ }
}
if (!target) { console.log('não conectou'); proc.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const r = await call('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { erro: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
  return r.result?.result?.value;
};
const shot = async (name) => {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};

await sleep(1500);
await shot('p1_inicio');
const DIR = 'C:/Users/leona/AppData/Local/Temp/munnin-cut-test';
const r = await evaluate(`
  const { useStore, startExport } = window.__mc;
  const S = () => useStore.getState();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  S().newProject('original');
  const ids = await S().importPaths(['${DIR}/a.mp4', '${DIR}/c.png', '${DIR}/m.mp3']);
  for (let i = 0; i < 100 && !ids.every((x) => S().meta[x]?.status === 'ready'); i++) await sleep(150);
  S().addMedia(ids[0]); S().addMedia(ids[1]);
  S().setTransition(S().project.tracks.find((t) => t.main).clips[0].id, 'slideleft', 0.6);
  S().addMedia(ids[2], { target: 'audio', time: 0 });
  S().setTime(0.5); S().addText('neon');
  S().addEffect('effect', 'hearts', { time: 0 }); S().addEffect('effect', 'glitch', { time: 1 }); S().addEffect('effect', 'zoomSlow', { time: 2 }); S().addEffect('effect', 'softGlow', { time: 3 });
  // 1.4: forma com pontos de modificação, reverso (FFmpeg empacotado) e voz fina (worklet empacotado)
  const sh = S().addShape('heart', { time: 0 });
  S().updateClip(sh, (c) => { c.kf = { rotation: [{ t: 0, v: 0 }, { t: 3, v: 90 }], opacity: [{ t: 0, v: 1 }, { t: 3, v: 0.3 }] }; });
  const m1 = S().project.tracks.find((t) => t.main).clips[0].id;
  S().toggleReverse(m1);
  for (let i = 0; i < 200 && S().meta[ids[0]]?.rev?.video?.status !== 'ready'; i++) await sleep(150);
  S().updateClip(m1, (c) => { c.audioFx = { id: 'chipmunk', mix: 100 }; });
  S().setTime(0.2); S().play(); await sleep(1500); S().pause();
  const fxKey = window.__mc.engine.pool.els.get(m1)?.fxKey || '';
  const v14 = { reverso: S().meta[ids[0]]?.rev?.video?.status, voz_fina_worklet: fxKey.endsWith('|w') };
  S().setTime(2);
  await sleep(1200);
  const pid = S().project.id;
  const run = startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 720, fps: 30, quality: 'standard', hw: null, outPath: '${DIR}/pacote_export.mp4' });
  const res = await run.promise;
  const info = await window.api.info();
  const nv = await window.api.nvenc();
  let legendas;
  try {
    const t = await window.api.captionTranscribe({ audioPath: '${DIR}/fala.wav', model: 'base', language: 'pt' });
    const w = t.words || t.segments || t;
    legendas = Array.isArray(w) ? w.slice(0, 12).map((x) => x.text).join('').trim() : JSON.stringify(t).slice(0, 200);
  } catch (e) { legendas = 'ERRO: ' + e.message; }
  return { v14, meta: Object.values(S().meta).map((m) => m.status), size: [S().project.width, S().project.height], res, nvenc: nv, legendas, pid, drafts: info.draftsDir };
`);
console.log(JSON.stringify(r, null, 1));
await shot('p2_editor');
// limpa o rascunho de teste da pasta Documentos
await sleep(1600);
await evaluate(`await window.api.deleteDraft('${r?.pid}'); return true;`);
proc.kill();
process.exit(0);
