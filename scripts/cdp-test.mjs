// Testa o app EMPACOTADO via protocolo de depuração do Chromium (sem mexer na tela).
// Uso: node scripts/cdp-test.mjs "<caminho do Munnin Cut.exe>" <pasta de saída>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const exe = process.argv[2];
const out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
// perfil separado: roda ao lado do app aberto do usuário (instância única é por perfil) sem mexer nas configurações
// dele; o modelo de legendas é copiado para o perfil de teste
const perfil = path.join(process.env.TEMP || '.', 'munnin-cut-cdp-perfil');
const modelo = path.join(process.env.APPDATA || '', 'Munnin Cut', 'models', 'ggml-base-q5_1.bin');
fs.mkdirSync(path.join(perfil, 'models'), { recursive: true });
if (fs.existsSync(modelo) && !fs.existsSync(path.join(perfil, 'models', 'ggml-base-q5_1.bin'))) fs.copyFileSync(modelo, path.join(perfil, 'models', 'ggml-base-q5_1.bin'));
const proc = spawn(exe, ['--remote-debugging-port=9333', `--user-data-dir=${perfil}`], { stdio: 'ignore' });
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
// 1.5: o que o teste criar em Documentos\Munnin Cut é apagado no fim (só se não existia antes)
const docsRoot = path.dirname(await evaluate('return (await window.api.info()).draftsDir;'));
const sfxTeste = path.join(docsRoot, 'Efeitos sonoros', 'Sino de igreja.wav');
const sfxJaExistia = fs.existsSync(sfxTeste);
const galoTeste = path.join(docsRoot, 'Efeitos sonoros', 'Galo cantando.ogg');
const galoJaExistia = fs.existsSync(galoTeste);
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
  // 1.5: biblioteca de sons empacotada e áudio do YouTube (yt-dlp com o próprio app como runtime de JS)
  const sfxL = await window.api.sfxList();
  const sfxClip = await S().addSfx('churchBell', { time: 0 });
  const sfxPath = S().project.media.find((m) => m.name === 'Sino de igreja.wav')?.path;
  let yt;
  try { const d = await window.api.ytDownload({ url: 'https://youtu.be/aqz-KE-bpKQ', start: 1, end: 4 }); yt = { ok: true, path: d.path, title: d.title }; }
  catch (e) { yt = { erro: e.message }; }
  const v15 = { sons: Object.keys(sfxL.index || {}).length, sfxDir: sfxL.dir, sfxClip: !!sfxClip, sfxPath, yt, ytStatus: await window.api.ytStatus() };
  // 1.7: limpeza da voz no pacote (worklet em dist/, análise no processo principal, exportação offline)
  const ca = S().project.tracks.find((t) => t.kind === 'audio')?.clips[0];
  S().updateClip(ca.id, (c) => { c.voz = { ruido: 50, realce: 50, clareza: 40, ambiente: 'sala', ambMix: 20 }; });
  const an17 = await window.api.vozAnalisar('${DIR}/m.mp3', 10);
  const rv = await startExport({ project: S().project, meta: S().meta, format: 'mp3', res: 480, fps: 30, quality: 'standard', aKbps: 128, outPath: '${DIR}/pacote_voz.mp3' }).promise;
  const v17 = { analise: Array.isArray(an17?.perfil) ? an17.perfil.length : null, exportVoz: rv.ok ? 'ok' : rv.error };
  // 1.8: HEIC (grade montada pelo FFmpeg empacotado), efeito de camada novo e pesquisa no YouTube
  const [h18] = await S().importPaths(['${DIR}/v18/IMG_3301.HEIC']);
  for (let i = 0; i < 100 && S().meta[h18]?.status !== 'ready'; i++) await sleep(150);
  const mh = S().project.media.find((m) => m.id === h18);
  S().addEffect('effect', 'explosion', { time: 0 });
  S().addEffect('effect', 'ripple', { time: 1 });
  const r18 = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 360, fps: 30, quality: 'small', outPath: '${DIR}/pacote_v18.mp4', endAt: 3 }).promise;
  let busca = [];
  try { busca = await window.api.ytSearch('big buck bunny'); } catch (e) { busca = [{ erro: e.message }]; }
  const v18 = { heic: mh && [mh.width, mh.height, /_proxy\.jpg$/.test(mh.renderPath || '')], exportEfeitos: r18.ok ? 'ok' : r18.error, busca: busca.length };
  // 1.9: sons livres (CC0) empacotados
  const galo = await window.api.sfxMaterialize('b0283', 'Galo cantando.ogg').catch((e) => 'ERRO ' + e.message);
  const v19 = { livres: Object.keys(sfxL.livresIndex || {}).length, galo };
  // 1.10: efeito só numa área (alphamerge no FFmpeg empacotado)
  const ef = S().project.tracks.flatMap((t) => t.clips).find((c) => c.type === 'effect' && c.effect?.id === 'ripple');
  if (ef) S().updateClip(ef.id, (c) => { c.area = { on: true, forma: 'ellipse', x: 0, y: 0, w: 0.4, h: 0.4, suave: 30 }; });
  const r110 = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 360, fps: 30, quality: 'small', outPath: '${DIR}/pacote_v110.mp4', endAt: 3 }).promise;
  const v110 = { area: ef ? (r110.ok ? 'ok' : r110.error) : 'sem efeito' };
  return { v14, v15, v17, v18, v19, v110, meta: Object.values(S().meta).map((m) => m.status), size: [S().project.width, S().project.height], res, nvenc: nv, legendas, pid, drafts: info.draftsDir };
`);
console.log(JSON.stringify(r, null, 1));
await shot('p2_editor');
// limpa o rascunho de teste da pasta Documentos
await sleep(1600);
await evaluate(`await window.api.deleteDraft('${r?.pid}'); return true;`);
proc.kill();
await sleep(800);
if (!sfxJaExistia) fs.rmSync(sfxTeste, { force: true });
if (!galoJaExistia) fs.rmSync(galoTeste, { force: true });
if (r?.v15?.yt?.path) fs.rmSync(r.v15.yt.path, { force: true });
process.exit(0);
