// Exporta um trecho curto para cada efeito animado (com FFmpeg) e confere erros/quadros.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildExport } from '../src/shared/graph.js';
import { EFFECTS } from '../src/shared/effects.js';

const FF = path.resolve('resources/bin/ffmpeg.exe'), FP = path.resolve('resources/bin/ffprobe.exe');
const DIR = path.join(os.tmpdir(), 'munnin-cut-test');
const OUT = path.join(DIR, 'fx');
fs.mkdirSync(OUT, { recursive: true });
const a = { id: 'a', path: path.join(DIR, 'a.mp4'), type: 'video', duration: 8, width: 1280, height: 720, hasAudio: true };
const base = { transform: { x: 0, y: 0, scale: 1, rotation: 0 }, opacity: 1, speed: 1, volume: 1, in: 0, start: 0 };
const only = process.argv.slice(2);
const list = EFFECTS.filter((e) => (e.ff || e.duo) && (!only.length || only.includes(e.id)));
const shots = [];
let fails = 0;
for (const fx of list) {
  const project = {
    width: 1080, height: 1920, fps: 30, background: { type: 'blur', blur: 0.03 },
    tracks: [
      { id: 'fx', kind: 'effect', clips: [{ ...base, id: `c_${fx.id}`, type: 'effect', start: 1, duration: 2, effect: { kind: 'effect', id: fx.id, intensity: 100 } }] },
      { id: 'main', kind: 'video', main: true, clips: [{ ...base, id: 'm1', type: 'video', mediaId: 'a', duration: 4 }] },
    ],
  };
  const outPath = path.join(OUT, `${fx.id}.mp4`), graphPath = path.join(OUT, `${fx.id}.txt`);
  const { args, graph } = buildExport({ project, mediaMap: { a }, out: { format: 'mp4', width: 270, height: 480, fps: 30, quality: 'small' }, outPath, graphPath });
  fs.writeFileSync(graphPath, graph);
  try {
    execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const n = execFileSync(FP, ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', outPath]).toString().trim();
    const shot = path.join(OUT, `${fx.id}.png`);
    execFileSync(FF, ['-v', 'error', '-y', '-ss', '2.2', '-i', outPath, '-frames:v', '1', '-vf', `scale=135:240,drawtext=text='${fx.id}':x=4:y=4:fontsize=13:fontcolor=white:box=1:boxcolor=black@0.6`, shot]);
    shots.push(shot);
    console.log(`${n === '120' ? 'OK ' : 'QTD'} ${fx.id.padEnd(14)} quadros=${n}`);
    if (n !== '120') fails++;
  } catch (e) {
    fails++;
    console.log(`ERRO ${fx.id}: ${e.stderr?.toString().trim().split('\n').slice(-3).join(' | ')}`);
  }
}
if (shots.length) {
  const cols = 8;
  const rows = [];
  for (let i = 0; i < shots.length; i += cols) {
    const grp = shots.slice(i, i + cols);
    while (grp.length < cols) grp.push(grp[grp.length - 1]);
    const r = path.join(OUT, `row_${i}.png`);
    execFileSync(FF, ['-v', 'error', '-y', ...grp.flatMap((s) => ['-i', s]), '-filter_complex', `hstack=${cols}`, r]);
    rows.push(r);
  }
  const sheet = path.join(OUT, 'sheet.png');
  if (rows.length > 1) execFileSync(FF, ['-v', 'error', '-y', ...rows.flatMap((s) => ['-i', s]), '-filter_complex', `vstack=${rows.length}`, sheet]);
  else fs.copyFileSync(rows[0], sheet);
  console.log('folha:', sheet);
}
console.log(fails ? `${fails} com problema` : 'todos OK');
