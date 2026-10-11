// Mede o tempo de exportação de um projeto (.json de rascunho) com as opções atuais.
// Uso: node scripts/bench-export.mjs <project.json> [segundos] [hw]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildExport, exportSize } from '../src/shared/graph.js';
import { videoKbps, audioKbps } from '../src/shared/defs.js';
import { projectDuration } from '../src/shared/timeline.js';

const [, , projPath, limit, hw] = process.argv;
const FF = path.resolve('resources/bin/ffmpeg.exe');
const project = JSON.parse(fs.readFileSync(projPath, 'utf8'));
if (limit) for (const t of project.tracks) for (const c of t.clips) {
  if (c.start >= +limit) c.duration = 0.01;
  else if (c.start + c.duration > +limit) c.duration = +limit - c.start;
}
for (const t of project.tracks) t.clips = t.clips.filter((c) => c.duration > 0.05);
const mediaMap = Object.fromEntries(project.media.map((m) => [m.id, m]));
const size = exportSize(project, 1080);
const vK = videoKbps({ format: 'mp4', res: 1080, fps: 30, width: size.width, height: size.height, quality: 'standard' });
const out = path.join(os.tmpdir(), 'munnin-cut-test', 'bench.mp4'), graphPath = path.join(os.tmpdir(), 'munnin-cut-test', 'bench.txt');
const { args, graph, duration } = buildExport({ project, mediaMap, out: { format: 'mp4', ...size, fps: 30, quality: 'standard', vKbps: vK, aKbps: audioKbps('mp4', 'standard'), hw: hw || null }, outPath: out, graphPath });
fs.writeFileSync(graphPath, graph);
const t0 = Date.now();
execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
const secs = (Date.now() - t0) / 1000;
console.log(`duração ${duration.toFixed(1)}s · ${size.width}x${size.height} · ${hw || 'cpu'} · exportou em ${secs.toFixed(1)}s (${(duration / secs).toFixed(1)}x tempo real) · ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
