// Teste do montador de exportação: gera mídias sintéticas, monta um projeto e exporta em vários formatos.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildExport, exportSize } from '../src/shared/graph.js';

const BIN = path.resolve('resources/bin');
const FF = path.join(BIN, 'ffmpeg.exe'), FP = path.join(BIN, 'ffprobe.exe');
const DIR = path.join(os.tmpdir(), 'munnin-cut-test');
fs.mkdirSync(DIR, { recursive: true });
const p = (n) => path.join(DIR, n);
const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

if (!fs.existsSync(p('a.mp4'))) {
  run(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=8', '-f', 'lavfi', '-i', 'sine=f=440:d=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', p('a.mp4')]);
  run(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'smptebars=s=640x480:r=25:d=6', '-f', 'lavfi', '-i', 'sine=f=660:d=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', p('b.mp4')]);
  run(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'mandelbrot=s=800x800', '-frames:v', '1', p('c.png')]);
  run(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=220:d=10', '-c:a', 'libmp3lame', p('m.mp3')]);
  run(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=yellow:s=420x140,format=rgba', '-frames:v', '1', p('t.png')]);
}

function probe(file, type) {
  const j = JSON.parse(run(FP, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  return { id: path.basename(file), path: file, type, duration: parseFloat(j.format.duration || 5), width: v?.width, height: v?.height, hasAudio: !!a, hasAlpha: false };
}
const media = { a: probe(p('a.mp4'), 'video'), b: probe(p('b.mp4'), 'video'), c: probe(p('c.png'), 'image'), m: probe(p('m.mp3'), 'audio') };
media.c.duration = 0;

const base = { transform: { x: 0, y: 0, scale: 1, rotation: 0 }, opacity: 1, speed: 1, volume: 1, in: 0, start: 0 };
const project = {
  width: 1080, height: 1920, fps: 30, background: { type: 'blur', blur: 0.03, color: '#000000' },
  tracks: [
    { id: 'fx', kind: 'effect', clips: [
      { ...base, id: 'e1', type: 'effect', start: 1, duration: 2, effect: { kind: 'effect', id: 'vhs', intensity: 100 } },
      { ...base, id: 'e2', type: 'effect', start: 6, duration: 3, effect: { kind: 'effect', id: 'cinema', intensity: 100 } },
      { ...base, id: 'e3', type: 'effect', start: 9.5, duration: 1.5, effect: { kind: 'filter', id: 'bw', intensity: 80 } },
    ] },
    { id: 'tx', kind: 'text', clips: [
      { ...base, id: 't1', type: 'text', start: 0.5, duration: 4, animIn: { id: 'pop', duration: 0.6 }, animOut: { id: 'slideLeft', duration: 0.5 } },
    ] },
    { id: 'ov', kind: 'overlay', clips: [
      { ...base, id: 'o1', type: 'video', mediaId: 'b', start: 2, duration: 4, transform: { x: 0.2, y: -0.3, scale: 0.4, rotation: 12 }, animIn: { id: 'zoomIn', duration: 0.5 }, adjust: { vignette: 60 }, volume: 0.5 },
    ] },
    { id: 'main', kind: 'video', main: true, clips: [
      { ...base, id: 'm1', type: 'video', mediaId: 'a', in: 1, duration: 4, filter: { id: 'vintage', intensity: 100 }, animIn: { id: 'fade', duration: 0.8 }, transition: { id: 'circleopen', duration: 0.8 } },
      { ...base, id: 'm2', type: 'image', mediaId: 'c', duration: 3, fit: 'cover', adjust: { temperature: 60, contrast: 30 }, transition: { id: 'slideleft', duration: 0.6 } },
      { ...base, id: 'm3', type: 'video', mediaId: 'b', duration: 2.5, speed: 2, bg: { type: 'color', color: '#203040' }, crop: { l: 0.1, r: 0.1, t: 0, b: 0 }, transform: { x: 0, y: 0, scale: 0.8, rotation: -5, flipH: true } },
      { ...base, id: 'm4', type: 'video', mediaId: 'a', in: 0, duration: 2, adjust: { sharpen: 50, blur: 20 } },
    ] },
    { id: 'au', kind: 'audio', clips: [
      { ...base, id: 'a1', type: 'audio', mediaId: 'm', start: 0, duration: 9, volume: 0.6, fadeIn: 1, fadeOut: 2 },
    ] },
  ],
};
const textAssets = { t1: { path: p('t.png'), cx: 360, cy: 1000 } };

const formats = process.argv.slice(2).length ? process.argv.slice(2) : ['mp4', 'webm', 'gif', 'mp3', 'prores'];
for (const format of formats) {
  const size = exportSize(project, format === 'prores' ? 480 : 720);
  const ext = { mp4: 'mp4', webm: 'webm', gif: 'gif', mp3: 'mp3', prores: 'mov', avi: 'avi', wav: 'wav', mkv: 'mkv', mp4_hevc: 'mp4' }[format];
  const outPath = p(`out_${format}.${ext}`), graphPath = p(`graph_${format}.txt`);
  const { args, graph, duration } = buildExport({ project, mediaMap: media, out: { format, ...size, fps: 30, quality: 'standard' }, textAssets, outPath, graphPath });
  fs.writeFileSync(graphPath, graph);
  const t0 = Date.now();
  try {
    execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const d = run(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outPath]).trim();
    console.log(`OK  ${format.padEnd(8)} ${size.width}x${size.height}  esperado ${duration.toFixed(2)}s  obtido ${d}s  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    console.log(`ERRO ${format}:`, e.stderr?.toString().slice(-1500));
    console.log(graph);
  }
}
if (formats.includes('mp4')) {
  const out = p('out_mp4.mp4');
  const times = [0.3, 1.5, 3.6, 4.2, 6.1, 7.6, 9.8];
  for (const t of times) run(FF, ['-v', 'error', '-y', '-ss', String(t), '-i', out, '-frames:v', '1', '-vf', 'scale=180:-1', p(`f_${t}.png`)]);
  run(FF, ['-v', 'error', '-y', ...times.flatMap((t) => ['-i', p(`f_${t}.png`)]), '-filter_complex', `hstack=${times.length}`, p('strip.png')]);
  console.log('tira:', p('strip.png'));
}
