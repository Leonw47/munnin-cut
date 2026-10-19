// Confere se a exportação deixa barra preta na lateral direita (bug do FFmpeg 8.0.1 na conversão
// yuv420p → gbrp em larguras como 1080 e 1350). Exporta em tamanhos reais de rede social cada efeito,
// filtro e transição e mede as últimas colunas do quadro.
//   node scripts/test-bordas.mjs                 → testa com a correção (rgbSafe)
//   node scripts/test-bordas.mjs --sem-correcao  → desfaz a correção no grafo (deve acusar barras)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildExport } from '../src/shared/graph.js';
import { EFFECTS } from '../src/shared/effects.js';
import { TRANSITIONS } from '../src/shared/defs.js';
import { FILTERS } from '../src/shared/ops.js';

const FF = path.resolve('resources/bin/ffmpeg.exe');
const DIR = path.join(os.tmpdir(), 'munnin-cut-test', 'bordas');
fs.mkdirSync(DIR, { recursive: true });
const p = (n) => path.join(DIR, n);
const semCorrecao = process.argv.includes('--sem-correcao');
const so = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const W = 1080, H = 1350;
if (!fs.existsSync(p('v.mp4'))) {
  execFileSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x8c8c8c:s=${W}x${H}:r=30:d=4,noise=alls=12:allf=t+u`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', p('v.mp4')]);
  execFileSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x6a7a8a:s=${W}x${H}`, '-frames:v', '1', p('i.png')]);
  fs.mkdirSync(p('camada'), { recursive: true });
  // camada preta: no blend "screen" não muda nada, só exercita o caminho da camada
  execFileSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=540x676:r=30:d=1', '-start_number', '0', p('camada/f_%05d.png')]);
}
const v = { id: 'v', path: p('v.mp4'), type: 'video', duration: 4, width: W, height: H, hasAudio: false };
const i = { id: 'i', path: p('i.png'), type: 'image', duration: 0, width: W, height: H, hasAudio: false };
const base = { transform: { x: 0, y: 0, scale: 1, rotation: 0 }, opacity: 1, speed: 1, volume: 1, in: 0, start: 0, fit: 'cover' };

function projeto({ w = W, h = H, fx = [], clip1 = {}, transicao = null }) {
  return {
    width: w, height: h, fps: 30, background: { type: 'color', color: '#000000' },
    tracks: [
      { id: 'fx', kind: 'effect', clips: fx },
      { id: 'main', kind: 'video', main: true, clips: [
        { ...base, id: 'm1', type: 'video', mediaId: 'v', duration: 1.5, transition: transicao, ...clip1 },
        { ...base, id: 'm2', type: 'image', mediaId: 'i', duration: 1.5 },
      ] },
    ],
  };
}

// colunas escuras no fim da linha, com as vizinhas claras (vinheta/escurecer não dão queda brusca)
function barra(file, t, w, h) {
  const raw = execFileSync(FF, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 64 << 20 });
  const col = new Array(w).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) col[x] += raw[y * w + x] / h;
  const ref = col.slice(w - 40, w - 20).reduce((a, b) => a + b, 0) / 20;
  if (ref < 25) return 0;
  let n = 0;
  for (let x = w - 1; x >= w - 20 && col[x] < 0.35 * ref; x--) n++;
  return n;
}

const casos = [{ nome: 'sem efeito', proj: projeto({}), tempos: [0.5, 2.2] }];
for (const [w, h] of [[1080, 1920], [1080, 1080]]) casos.push({ nome: `sem efeito ${w}x${h}`, proj: projeto({ w, h }), tempos: [0.5, 2.2], w, h });
for (const fx of EFFECTS.filter((e) => e.ff || e.duo)) {
  casos.push({ nome: `efeito ${fx.id}`, proj: projeto({ fx: [{ ...base, id: `e_${fx.id}`, type: 'effect', start: 0.5, duration: 1, effect: { kind: 'effect', id: fx.id, intensity: 100 } }] }), tempos: [1.0, 2.2] });
}
casos.push({ nome: 'camada rays', proj: projeto({ fx: [{ ...base, id: 'e_rays', type: 'effect', start: 0.5, duration: 1, effect: { kind: 'effect', id: 'rays', intensity: 100 } }] }),
  fxAssets: { e_rays: { pattern: p('camada/f_%05d.png'), scaled: true } }, tempos: [1.0, 2.2] });
for (const f of FILTERS.filter((x) => x.id !== 'none')) {
  casos.push({ nome: `filtro ${f.id}`, proj: projeto({ clip1: { filter: { id: f.id, intensity: 100 } } }), tempos: [1.0] });
  casos.push({ nome: `filtro na faixa ${f.id}`, proj: projeto({ fx: [{ ...base, id: `f_${f.id}`, type: 'effect', start: 0.5, duration: 1, effect: { kind: 'filter', id: f.id, intensity: 100 } }] }), tempos: [1.0, 2.2] });
}
for (const tr of TRANSITIONS) {
  casos.push({ nome: `transição ${tr.id}`, proj: projeto({ transicao: { id: tr.id, duration: 0.6 } }), tempos: [1.3, 2.3] });
}
casos.push({ nome: 'transição mc_whipr 1080x1920', proj: projeto({ w: 1080, h: 1920, transicao: { id: 'mc_whipr', duration: 0.6 } }), tempos: [0.5, 1.3, 2.3], w: 1080, h: 1920 });

let falhas = 0, feitos = 0;
for (const c of casos) {
  if (so.length && !so.some((s) => c.nome.includes(s))) continue;
  const w = c.w || W, h = c.h || H;
  const out = p('out.mp4'), graphPath = p('graph.txt');
  const { args, graph } = buildExport({ project: c.proj, mediaMap: { v, i }, out: { format: 'mp4', width: w, height: h, fps: 30, quality: 'small' }, fxAssets: c.fxAssets || {}, outPath: out, graphPath });
  fs.writeFileSync(graphPath, semCorrecao ? graph.replaceAll('scale=flags=bicubic+accurate_rnd,format=gbrp', 'format=gbrp') : graph);
  feitos++;
  try {
    execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    falhas++;
    console.log(`ERRO  ${c.nome}: ${e.stderr?.toString().trim().split('\n').slice(-2).join(' | ')}`);
    continue;
  }
  const n = c.tempos.map((t) => barra(out, t, w, h));
  const ruim = n.some((x) => x >= 2);
  if (ruim) falhas++;
  if (ruim || so.length) console.log(`${ruim ? 'BARRA' : 'OK   '} ${c.nome.padEnd(34)} colunas pretas no fim: ${n.join(', ')}`);
}
console.log(`${feitos} exportações; ${falhas ? `${falhas} com barra ou erro` : 'nenhuma barra lateral'}${semCorrecao ? ' (SEM a correção)' : ''}`);
process.exitCode = falhas ? 1 : 0;
