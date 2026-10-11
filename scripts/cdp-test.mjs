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
  S().addEffect('effect', 'hearts', { time: 0 }); S().addEffect('effect', 'glitch', { time: 1 }); S().addEffect('effect', 'zoomSlow', { time: 2 });
  S().setTime(2);
  await sleep(1200);
  const pid = S().project.id;
  const run = startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 720, fps: 30, quality: 'standard', hw: null, outPath: '${DIR}/pacote_export.mp4' });
  const res = await run.promise;
  const info = await window.api.info();
  const nv = await window.api.nvenc();
  return { meta: Object.values(S().meta).map((m) => m.status), size: [S().project.width, S().project.height], res, nvenc: nv, pid, drafts: info.draftsDir };
`);
console.log(JSON.stringify(r, null, 1));
await shot('p2_editor');
// limpa o rascunho de teste da pasta Documentos
await sleep(1600);
await evaluate(`await window.api.deleteDraft('${r?.pid}'); return true;`);
proc.kill();
process.exit(0);
