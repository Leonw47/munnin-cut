// Exportar em partes = exportar inteiro: o mesmo projeto exportado de uma vez e em partes (janelas emendadas sem
// recodificar + áudio à parte), as duas versões SEM PERDA, têm de dar os mesmos quadros. O projeto cruza os
// cortes com: vídeo na faixa principal, transição de câmera, sequência de fotos com Ken Burns e transição,
// vídeo sobreposto que começou antes da parte, texto, zoom/giro/opacidade animados e um filtro.
// node scripts/test-partes.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildExport } from '../src/shared/graph.js';
import { planejarPartes } from '../src/shared/partes.js';

const FF = path.resolve('resources/bin/ffmpeg.exe');
const DIR = path.join(os.tmpdir(), 'munnin-cut-test', 'partes');
fs.mkdirSync(DIR, { recursive: true });
const p = (n) => path.join(DIR, n);
const run = (args) => execFileSync(FF, ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256e6 });
let falhas = 0;
const ok = (cond, nome, extra = '') => { console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ` — ${extra}` : ''}`); if (!cond) falhas++; };

if (!fs.existsSync(p('v1.mp4'))) run(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=12', '-f', 'lavfi', '-i', 'sine=f=330:d=12', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', p('v1.mp4')]);
if (!fs.existsSync(p('v2.mp4'))) run(['-f', 'lavfi', '-i', 'smptebars=s=640x360:r=30:d=10', '-f', 'lavfi', '-i', 'sine=f=550:d=10', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', p('v2.mp4')]);
if (!fs.existsSync(p('foto.jpg'))) run(['-f', 'lavfi', '-i', 'mandelbrot=s=1200x900', '-frames:v', '1', p('foto.jpg')]);
if (!fs.existsSync(p('texto.png'))) run(['-f', 'lavfi', '-i', 'color=yellow@0.9:s=300x80,format=rgba', '-frames:v', '1', p('texto.png')]);
const probe = (f, type, w, h, d, au) => ({ id: path.basename(f), path: f, type, width: w, height: h, duration: d, hasAudio: au });
const media = [probe(p('v1.mp4'), 'video', 640, 360, 12, true), probe(p('v2.mp4'), 'video', 640, 360, 10, true), probe(p('foto.jpg'), 'image', 1200, 900, 0, false)];
const mediaMap = Object.fromEntries(media.map((m) => [m.id, m]));
const base = { in: 0, speed: 1, opacity: 1, volume: 1 };
const tf = (o = {}) => ({ x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, ...o });
const fotos = [];
for (let i = 0; i < 6; i++) {
  fotos.push({ ...base, id: `f${i}`, type: 'image', mediaId: 'foto.jpg', start: 1 + i * 2.2, duration: 2.2, transform: tf({ scale: 0.45, x: -0.25 }),
    animLoop: { id: 'kenburns', speed: 1, amount: 100 }, ...(i < 5 ? { transition: { id: i % 2 ? 'fade' : 'wipeleft', duration: 0.5 } } : {}) });
}
const project = {
  width: 640, height: 360, fps: 30, background: { type: 'color', color: '#101820' }, media,
  tracks: [
    { id: 'tx', kind: 'text', clips: [{ ...base, id: 't1', type: 'text', start: 3, duration: 8, transform: tf({ y: 0.35 }), kf: { scale: [{ t: 0, v: 0.6 }, { t: 8, v: 1.2 }] }, animIn: { id: 'fade', duration: 0.6 } }] },
    { id: 'fx', kind: 'effect', clips: [{ ...base, id: 'e1', type: 'effect', start: 2, duration: 11, effect: { kind: 'filter', id: 'warm', intensity: 80 } }] },
    { id: 'ov2', kind: 'overlay', clips: [
      { ...base, id: 'o1', type: 'video', mediaId: 'v2.mp4', start: 0.5, duration: 9, transform: tf({ scale: 0.35, x: 0.3, y: -0.25 }),
        kf: { rotation: [{ t: 0, v: 0 }, { t: 9, v: 90 }], opacity: [{ t: 0, v: 0 }, { t: 0.4, v: 1 }], scale: [{ t: 0, v: 0.25 }, { t: 9, v: 0.45 }] } },
    ] },
    { id: 'ov', kind: 'overlay', clips: fotos },
    { id: 'main', kind: 'video', main: true, clips: [
      { ...base, id: 'm1', type: 'video', mediaId: 'v1.mp4', duration: 7, transform: tf(), transition: { id: 'mc_spin', duration: 0.8 } },
      { ...base, id: 'm2', type: 'image', mediaId: 'foto.jpg', duration: 5, fit: 'cover', transform: tf(), animLoop: { id: 'kenburns', speed: 1, amount: 100 } },
    ] },
  ],
};
const out = { format: 'mp4', width: 640, height: 360, fps: 30, quality: 'high', aKbps: 128 };
// sem perda: troca a qualidade (CRF) por -qp 0, para comparar os quadros exatos
const semPerda = (args) => { const i = args.indexOf('-crf'); const a = [...args]; if (i >= 0) a.splice(i, 2, '-qp', '0'); return a; };
function exportar(nome, extra = {}) {
  const outPath = p(nome);
  const r = buildExport({ project, mediaMap, out: { ...out, ...(extra.out || {}) }, outPath, graphPath: '__GRAPH__', textAssets: { t1: { path: p('texto.png'), w: 300, h: 80, scale: 1.2, scaleX: 1, scaleY: 1, cx: 320, cy: 306 } }, ...extra.job });
  const g = outPath.replace(/\.\w+$/, '_grafo.txt');
  fs.writeFileSync(g, r.graph);
  let args = semPerda(r.args.map((a) => (a === '__GRAPH__' ? g : a === 'pipe:1' ? p('prog.txt') : a)));
  if (extra.parte) args = args.filter((a, i, l) => !(a === '-movflags' || l[i - 1] === '-movflags'));
  execFileSync(FF, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  return r;
}
exportar('inteiro.mp4');
const janelas = planejarPartes(project, 30, 4);
ok(janelas.length >= 3, 'o projeto de 14 s em partes de ~4 s', janelas.map(([a, b]) => `${a.toFixed(2)}–${b.toFixed(2)}`).join(' '));
const lista = [];
janelas.forEach(([a, b], i) => {
  exportar(`parte_${i}.ts`, { job: { janela: { a, b }, soVideo: true }, parte: true });
  lista.push(`file '${p(`parte_${i}.ts`).replace(/\\/g, '/')}'`);
});
exportar('audio.m4a', { out: { format: 'm4a' } });
fs.writeFileSync(p('lista.txt'), lista.join('\n'));
run(['-f', 'concat', '-safe', '0', '-i', p('lista.txt'), '-i', p('audio.m4a'), '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', p('partes.mp4')]);
const quadros = (f) => Number(execFileSync(path.resolve('resources/bin/ffprobe.exe'), ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f]).toString().trim());
const qi = quadros(p('inteiro.mp4')), qp = quadros(p('partes.mp4'));
ok(qi === qp, 'mesmo número de quadros', `${qi} × ${qp}`);
// comparação quadro a quadro (as duas sem perda): PSNR infinito = idênticos
const psnr = execFileSync(FF, ['-hide_banner', '-i', p('inteiro.mp4'), '-i', p('partes.mp4'), '-lavfi', `[0:v]setpts=N/(30*TB)[a];[1:v]setpts=N/(30*TB)[b];[a][b]psnr=stats_file=psnr.txt`, '-f', 'null', '-'], { cwd: DIR, stdio: ['ignore', 'pipe', 'pipe'] });
const linhas = fs.readFileSync(p('psnr.txt'), 'utf8').trim().split('\n');
// iguais, a menos de arredondamentos (1 px no tamanho de uma foto com zoom, 1 quadro na borda do desfoque de uma
// transição de câmera): nenhum quadro com diferença visível (< 28 dB) e quase todos praticamente idênticos (≥ 38 dB)
const vals = linhas.map((l) => { const n = Number(/n:(\d+)/.exec(l)[1]) - 1; const v = /psnr_avg:(\S+)/.exec(l)[1]; return { n, v: v === 'inf' ? 999 : Number(v) }; });
const visiveis = vals.filter((x) => x.v < 28);
const leves = vals.filter((x) => x.v < 38);
ok(visiveis.length === 0, 'nenhum quadro diferente da exportação inteira', visiveis.slice(0, 8).map((x) => `quadro ${x.n}: ${x.v.toFixed(1)} dB`).join(' '));
ok(leves.length <= vals.length * 0.05, 'quase todos os quadros idênticos (≥ 38 dB)', `${vals.length - leves.length} de ${vals.length}; pior ${Math.min(...vals.map((x) => x.v)).toFixed(1)} dB`);
const ai = execFileSync(path.resolve('resources/bin/ffprobe.exe'), ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', p('partes.mp4')]).toString().trim();
ok(Math.abs(Number(ai) - qi / 30) < 0.1, 'áudio do vídeo todo junto', `${ai} s`);
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
