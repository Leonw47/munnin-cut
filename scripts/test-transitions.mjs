// Exporta dois clipes com cada transição de câmera e monta uma folha com 4 momentos da transição.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildExport } from '../src/shared/graph.js';
import { TRANSITIONS } from '../src/shared/defs.js';

const FF = path.resolve('resources/bin/ffmpeg.exe'), FP = path.resolve('resources/bin/ffprobe.exe');
const DIR = path.join(os.tmpdir(), 'munnin-cut-test');
const OUT = path.join(DIR, 'tr');
fs.mkdirSync(OUT, { recursive: true });
const a = { id: 'a', path: path.join(DIR, 'a.mp4'), type: 'video', duration: 8, width: 1280, height: 720, hasAudio: true };
const c = { id: 'c', path: path.join(DIR, 'c.png'), type: 'image', duration: 0, width: 800, height: 800, hasAudio: false };
const base = { transform: { x: 0, y: 0, scale: 1, rotation: 0 }, opacity: 1, speed: 1, volume: 1, in: 0, start: 0 };
const only = process.argv.slice(2);
const list = TRANSITIONS.filter((t) => t.cat === 'camera' && (!only.length || only.includes(t.id)));
const rows = [];
let fails = 0;
for (const tr of list) {
  const project = {
    width: 1080, height: 1920, fps: 30, background: { type: 'color', color: '#000000' },
    tracks: [{ id: 'main', kind: 'video', main: true, clips: [
      { ...base, id: 'm1', type: 'video', mediaId: 'a', duration: 3, transition: { id: tr.id, duration: 1 } },
      { ...base, id: 'm2', type: 'image', mediaId: 'c', duration: 3, fit: 'cover' },
    ] }],
  };
  const outPath = path.join(OUT, `${tr.id}.mp4`), graphPath = path.join(OUT, `${tr.id}.txt`);
  const { args, graph } = buildExport({ project, mediaMap: { a, c }, out: { format: 'mp4', width: 270, height: 480, fps: 30, quality: 'small' }, outPath, graphPath });
  fs.writeFileSync(graphPath, graph);
  try {
    execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const n = execFileSync(FP, ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', outPath]).toString().trim();
    const shots = [1.9, 2.25, 2.5, 2.75].map((t) => {
      const s = path.join(OUT, `${tr.id}_${t}.png`);
      execFileSync(FF, ['-v', 'error', '-y', '-ss', String(t), '-i', outPath, '-frames:v', '1', '-vf', 'scale=90:160', s]);
      return s;
    });
    const row = path.join(OUT, `${tr.id}_row.png`);
    execFileSync(FF, ['-v', 'error', '-y', ...shots.flatMap((s) => ['-i', s]), '-filter_complex', 'hstack=4', row]);
    rows.push(row);
    console.log(`${n === '150' ? 'OK ' : 'QTD'} ${tr.id.padEnd(12)} quadros=${n}`);
    if (n !== '150') fails++;
  } catch (e) {
    fails++;
    console.log(`ERRO ${tr.id}: ${e.stderr?.toString().trim().split('\n').slice(-3).join(' | ')}`);
  }
}
if (rows.length) {
  const half = Math.ceil(rows.length / 2);
  const colA = rows.slice(0, half), colB = rows.slice(half);
  while (colB.length < colA.length) colB.push(colA[0]);
  const ca = path.join(OUT, 'colA.png'), cb = path.join(OUT, 'colB.png');
  execFileSync(FF, ['-v', 'error', '-y', ...colA.flatMap((s) => ['-i', s]), '-filter_complex', `vstack=${colA.length}`, ca]);
  execFileSync(FF, ['-v', 'error', '-y', ...colB.flatMap((s) => ['-i', s]), '-filter_complex', `vstack=${colB.length}`, cb]);
  execFileSync(FF, ['-v', 'error', '-y', '-i', ca, '-i', cb, '-filter_complex', 'hstack=2', path.join(OUT, 'sheet.png')]);
  console.log('folha:', path.join(OUT, 'sheet.png'));
}
console.log(fails ? `${fails} com problema` : 'todos OK');
