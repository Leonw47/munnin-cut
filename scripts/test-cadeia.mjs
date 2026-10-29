// Teste das cadeias de clipes com transição numa faixa de cima (slideshow de fotos):
// 1) muitas fotos encostadas com transição sobre um vídeo exportam até o fim, com memória limitada
//    (antes o fundo era dividido em um pedaço por foto e a exportação parava em 0% com dezenas de GB);
// 2) a mistura das transições é a certa: (1−p)·(fundo+A) + p·(fundo+B), conferida pixel a pixel.
// node scripts/test-cadeia.mjs
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildExport } from '../src/shared/graph.js';

const FF = path.resolve('resources/bin/ffmpeg.exe');
const DIR = path.join(os.tmpdir(), 'munnin-cut-test', 'cadeia');
fs.mkdirSync(DIR, { recursive: true });
const p = (n) => path.join(DIR, n);
const run = (args) => execFileSync(FF, ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
let falhas = 0;
const ok = (cond, nome, extra = '') => { console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ` — ${extra}` : ''}`); if (!cond) falhas++; };

if (!fs.existsSync(p('fundo.mp4'))) run(['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=125', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', p('fundo.mp4')]);
if (!fs.existsSync(p('foto.jpg'))) run(['-f', 'lavfi', '-i', 'testsrc=s=4032x3024', '-frames:v', '1', p('foto.jpg')]);
for (const [n, c] of [['amarelo', 'yellow'], ['ciano', 'cyan'], ['cinza', 'gray']]) if (!fs.existsSync(p(`${n}.png`))) run(['-f', 'lavfi', '-i', `color=${c}:s=400x300`, '-frames:v', '1', p(`${n}.png`)]);

function exportar(project, W, H, nome, { limiteMB = 6000 } = {}) {
  const mediaMap = Object.fromEntries(project.media.map((m) => [m.id, m]));
  const outPath = p(`${nome}.mp4`);
  const graphPath = p(`${nome}_grafo.txt`);
  const r = buildExport({ project, mediaMap, out: { format: 'mp4', width: W, height: H, fps: 30, quality: 'standard', vKbps: 4000, aKbps: 128 }, outPath, graphPath: '__GRAPH__' });
  fs.writeFileSync(graphPath, r.graph);
  const args = r.args.map((a) => (a === '__GRAPH__' ? graphPath : a)).map((a) => (a === 'pipe:1' ? p(`${nome}_prog.txt`) : a));
  return new Promise((resolve) => {
    const t0 = performance.now();
    const pr = spawn(FF, args, { windowsHide: true });
    let err = '', pico = 0;
    pr.stderr.on('data', (d) => { err += d; });
    const tick = setInterval(() => {
      try {
        const o = execFileSync('tasklist', ['/FI', `PID eq ${pr.pid}`, '/FO', 'CSV', '/NH']).toString();
        const mb = Number((o.split('","')[4] || '').replace(/[^\d]/g, '')) / 1024;
        if (mb > pico) pico = mb;
        if (mb > limiteMB) pr.kill();
      } catch { /* terminou */ }
    }, 300);
    pr.on('close', (code) => { clearInterval(tick); resolve({ code, args, s: (performance.now() - t0) / 1000, picoMB: Math.round(pico), err: err.trim().split('\n').slice(-3).join(' '), outPath, grafo: r.graph }); });
  });
}
const base = { in: 0, speed: 1, opacity: 1, volume: 1 };
const tfm = (o = {}) => ({ x: 0, y: 0, scale: 1, rotation: 0, ...o });

// ---- 1) slideshow longo sobre vídeo ----
{
  const N = 48;
  const media = [{ id: 'v', type: 'video', path: p('fundo.mp4'), width: 1280, height: 720, duration: 125, hasAudio: false }, { id: 'f', type: 'image', path: p('foto.jpg'), width: 4032, height: 3024, duration: 0 }];
  const clips = [];
  for (let i = 0; i < N; i++) clips.push({ ...base, id: `f${i}`, type: 'image', mediaId: 'f', start: 1 + i * 2.5, duration: 2.5, transform: tfm({ scale: 1.2 }), animLoop: { id: 'kenburns', speed: 1, amount: 100 }, ...(i < N - 1 ? { transition: { id: i % 2 ? 'fade' : 'wipeleft', duration: 0.5 } } : {}) });
  const project = { width: 1280, height: 720, fps: 30, background: { type: 'color', color: '#000000' }, media, tracks: [{ id: 'ov', kind: 'overlay', clips }, { id: 'main', kind: 'video', main: true, clips: [{ ...base, id: 'm', type: 'video', mediaId: 'v', start: 0, duration: 122, transform: tfm() }] }] };
  const r = await exportar(project, 1280, 720, 'slideshow');
  const quadros = (() => { try { return Number([...fs.readFileSync(p('slideshow_prog.txt'), 'utf8').matchAll(/frame=(\d+)/g)].pop()[1]); } catch { return 0; } })();
  ok(r.code === 0 && quadros >= 3650, `${N} fotos com transição sobre vídeo exportam até o fim`, `${quadros} quadros em ${r.s.toFixed(1)} s ${r.err}`);
  ok(r.picoMB < 6000, 'memória limitada', `${r.picoMB} MB`);
  ok(!/split=\d{2}/.test(r.grafo), 'o fundo não é dividido em um pedaço por foto');
  ok(r.args.includes('-lowres'), 'foto 4032×3024 decodificada já reduzida (lowres)', r.args[r.args.indexOf('-lowres') + 1]);
}

// ---- 2) mistura certa: amarelo → ciano sobre cinza, com cobertura parcial ----
{
  const media = [
    { id: 'a', type: 'image', path: p('amarelo.png'), width: 400, height: 300, duration: 0 },
    { id: 'b', type: 'image', path: p('ciano.png'), width: 400, height: 300, duration: 0 },
    { id: 'g', type: 'image', path: p('cinza.png'), width: 400, height: 300, duration: 0 },
  ];
  // A à esquerda, B à direita, sobrepostos no meio; transição "fade" de 1 s centrada em 2,5 s
  const clips = [
    { ...base, id: 'A', type: 'image', mediaId: 'a', start: 0.5, duration: 2, transform: tfm({ scale: 0.5, x: -0.15 }), transition: { id: 'fade', duration: 1 } },
    { ...base, id: 'B', type: 'image', mediaId: 'b', start: 2.5, duration: 2, transform: tfm({ scale: 0.5, x: 0.15 }) },
  ];
  const project = { width: 640, height: 360, fps: 30, background: { type: 'color', color: '#000000' }, media, tracks: [{ id: 'ov', kind: 'overlay', clips }, { id: 'main', kind: 'video', main: true, clips: [{ ...base, id: 'm', type: 'image', mediaId: 'g', start: 0, duration: 5, fit: 'cover', transform: tfm() }] }] };
  const r = await exportar(project, 640, 360, 'mistura');
  ok(r.code === 0, 'exporta a mistura', r.err);
  // quadro 75 (2,5 s) = meio da transição (p = 0,5); A cobre x 96–416, B cobre x 224–544 (tela 640×360)
  const px = (x, y) => [...execFileSync(FF, ['-v', 'error', '-i', r.outPath, '-vf', `select=eq(n\\,75),format=rgb24,crop=1:1:${x}:${y}`, '-frames:v', '1', '-f', 'rawvideo', '-'])];
  const perto = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 8);
  const soA = px(140, 180), ambos = px(320, 180), soB = px(500, 180), fundo = px(20, 20);
  ok(perto(soA, [191, 191, 64]), 'só A: metade amarelo, metade fundo', soA.join(','));
  ok(perto(ambos, [128, 255, 128]), 'A e B: metade amarelo, metade ciano', ambos.join(','));
  ok(perto(soB, [64, 191, 191]), 'só B: metade fundo, metade ciano', soB.join(','));
  ok(perto(fundo, [128, 128, 128]), 'fundo intacto', fundo.join(','));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
