// Confere a estimativa de tamanho contra o arquivo real, em formatos e qualidades diferentes.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildExport, exportSize } from '../src/shared/graph.js';
import { EXPORT_FORMATS, videoKbps, audioKbps, estimateBytes, fmtBytes } from '../src/shared/defs.js';

const FF = path.resolve('resources/bin/ffmpeg.exe');
const DIR = path.join(os.tmpdir(), 'munnin-cut-test');
const a = { id: 'a', path: path.join(DIR, 'a.mp4'), type: 'video', duration: 8, width: 1280, height: 720, hasAudio: true };
const m = { id: 'm', path: path.join(DIR, 'm.mp3'), type: 'audio', duration: 10, hasAudio: true };
const base = { transform: { x: 0, y: 0, scale: 1, rotation: 0 }, opacity: 1, speed: 1, volume: 1, in: 0, start: 0 };
const project = { width: 1920, height: 1080, fps: 30, background: { type: 'color', color: '#000000' }, tracks: [
  { id: 'main', kind: 'video', main: true, clips: [{ ...base, id: 'v1', type: 'video', mediaId: 'a', duration: 8 }, { ...base, id: 'v2', type: 'video', mediaId: 'a', in: 1, duration: 6 }] },
  { id: 'au', kind: 'audio', clips: [{ ...base, id: 'a1', type: 'audio', mediaId: 'm', duration: 10 }] },
] };
const cases = [['mp4', 1080, 'standard'], ['mp4', 720, 'small'], ['mov', 1080, 'high'], ['mp4_hevc', 1080, 'standard'], ['mov_hevc', 720, 'standard'], ['prores', 720, 'standard'], ['webm', 720, 'standard'], ['mp3', 1080, 'standard']];
for (const [format, res, quality] of cases) {
  const fmt = EXPORT_FORMATS.find((f) => f.id === format);
  const size = exportSize(project, res);
  const vK = fmt.kind === 'video' ? videoKbps({ format, res, fps: 30, width: size.width, height: size.height, quality }) : 0;
  const aK = audioKbps(format, quality);
  const est = estimateBytes({ kind: fmt.kind, width: size.width, height: size.height, fps: 30, duration: 14, vKbps: vK, aKbps: aK });
  const outPath = path.join(DIR, `size_${format}_${res}.${fmt.ext}`), graphPath = path.join(DIR, `size_${format}.txt`);
  const { args, graph } = buildExport({ project, mediaMap: { a, m }, out: { format, ...size, fps: 30, quality, vKbps: format === 'prores' ? 0 : vK, aKbps: format === 'prores' ? 0 : aK }, outPath, graphPath });
  fs.writeFileSync(graphPath, graph);
  try {
    execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const real = fs.statSync(outPath).size;
    console.log(`${format.padEnd(9)} ${String(res).padEnd(5)} ${quality.padEnd(9)} estimado ${fmtBytes(est).padStart(8)}  real ${fmtBytes(real).padStart(8)}  (${Math.round((real / est) * 100)}%)`);
  } catch (e) {
    console.log(`ERRO ${format}: ${e.stderr?.toString().trim().split('\n').slice(-2).join(' | ')}`);
  }
}
