// Teste da exportação das novidades da 1.4: transições nas faixas de cima, formas, chroma key,
// clipes invertidos, efeitos de áudio e pontos de modificação (keyframes).
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

const make = (name, args) => { if (!fs.existsSync(p(name))) run(FF, ['-v', 'error', '-y', ...args, p(name)]); };
make('a.mp4', ['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=8', '-f', 'lavfi', '-i', 'sine=f=440:d=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest']);
make('b.mp4', ['-f', 'lavfi', '-i', 'smptebars=s=640x480:r=25:d=6', '-f', 'lavfi', '-i', 'sine=f=660:d=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest']);
make('c.png', ['-f', 'lavfi', '-i', 'mandelbrot=s=800x800', '-frames:v', '1']);
make('m.mp3', ['-f', 'lavfi', '-i', 'sine=f=220:d=10', '-c:a', 'libmp3lame']);
make('t.png', ['-f', 'lavfi', '-i', 'color=c=yellow:s=420x140,format=rgba', '-frames:v', '1']);
make('shape.png', ['-f', 'lavfi', '-i', 'color=c=red@0.9:s=300x300,format=rgba', '-frames:v', '1']);
make('green.mp4', ['-f', 'lavfi', '-i', 'color=c=0x00d639:s=640x360:r=30:d=6', '-f', 'lavfi', '-i', 'testsrc=s=200x200:r=30:d=6', '-filter_complex', '[0][1]overlay=220:80', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
// cópias invertidas (o app gera com media.reverse; aqui, direto)
make('a_rev.mp4', ['-i', p('a.mp4'), '-vf', 'reverse', '-af', 'areverse', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac']);
make('m_rev.m4a', ['-i', p('m.mp3'), '-af', 'areverse', '-c:a', 'aac']);

function probe(file, type) {
  const j = JSON.parse(run(FP, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  return { id: path.basename(file), path: file, type, duration: parseFloat(j.format.duration || 5), width: v?.width, height: v?.height, hasAudio: !!a, hasAlpha: false };
}
const media = { a: probe(p('a.mp4'), 'video'), b: probe(p('b.mp4'), 'video'), c: probe(p('c.png'), 'image'), m: probe(p('m.mp3'), 'audio'), g: probe(p('green.mp4'), 'video') };
media.c.duration = 0;
media.a.rev = { video: { path: p('a_rev.mp4'), duration: probe(p('a_rev.mp4'), 'video').duration } };
media.m.rev = { audio: { path: p('m_rev.m4a'), duration: probe(p('m_rev.m4a'), 'audio').duration } };

const base = { transform: { x: 0, y: 0, scale: 1, rotation: 0 }, opacity: 1, speed: 1, volume: 1, in: 0, start: 0 };
const KF = process.argv.includes('--kf');
export const project = {
  width: 1280, height: 720, fps: 30, background: { type: 'color', color: '#000000' },
  tracks: [
    { id: 'tx', kind: 'text', clips: [
      { ...base, id: 's1', type: 'shape', start: 0.5, duration: 2, transform: { x: -0.3, y: -0.3, scale: 1, rotation: 0 }, transition: { id: 'wipeleft', duration: 0.8 },
        ...(KF ? { kf: { rotation: [{ t: 0, v: 0 }, { t: 1.5, v: 45 }], opacity: [{ t: 0, v: 1 }, { t: 1.5, v: 0.4 }], scale: [{ t: 0, v: 0.6 }, { t: 1.5, v: 1.2 }], y: [{ t: 0, v: -0.3 }, { t: 1.5, v: 0.2 }] } } : {}) },
      { ...base, id: 't1', type: 'text', start: 2.5, duration: 2, transform: { x: -0.3, y: -0.3, scale: 1, rotation: 0 }, animIn: { id: 'fade', duration: 0.5 } },
    ] },
    { id: 'ov', kind: 'overlay', clips: [
      { ...base, id: 'o1', type: 'image', mediaId: 'c', start: 1, duration: 2, transform: { x: 0.25, y: 0, scale: 0.45, rotation: 0 }, transition: { id: 'circleopen', duration: 1 } },
      { ...base, id: 'o2', type: 'video', mediaId: 'g', start: 3, duration: 2, transform: { x: 0.25, y: 0, scale: 0.6, rotation: 0 },
        chroma: { on: true, color: '#00d639', similarity: 30, smooth: 12, spill: true }, transition: { id: 'fade', duration: 0.6 } },
      { ...base, id: 'o3', type: 'video', mediaId: 'b', start: 5, duration: 2, transform: { x: 0.25, y: 0, scale: 0.45, rotation: 10 }, animOut: { id: 'zoomOut', duration: 0.5 },
        ...(KF ? { kf: { x: [{ t: 0, v: 0.25 }, { t: 1.5, v: -0.25 }], opacity: [{ t: 0, v: 1 }, { t: 1.5, v: 0.3 }], 'adjust.brightness': [{ t: 0, v: 0 }, { t: 1.5, v: 60 }] } } : {}) },
    ] },
    { id: 'main', kind: 'video', main: true, clips: [
      { ...base, id: 'm1', type: 'video', mediaId: 'a', in: 1, duration: 4, reverse: true, transition: { id: 'fade', duration: 0.5 },
        ...(KF ? { kf: { scale: [{ t: 0.5, v: 1 }, { t: 3, v: 1.6 }], rotation: [{ t: 0, v: 0 }, { t: 3.5, v: 20 }] } } : {}) },
      { ...base, id: 'm2', type: 'video', mediaId: 'a', in: 0, duration: 4 },
    ] },
    { id: 'au', kind: 'audio', clips: [
      { ...base, id: 'a1', type: 'audio', mediaId: 'm', start: 0, duration: 4, volume: 0.6, audioFx: { id: 'echo', mix: 80, bass: 3, treble: 0 } },
      { ...base, id: 'a2', type: 'audio', mediaId: 'm', start: 4, duration: 3, reverse: true, audioFx: { id: 'chipmunk', mix: 100 },
        ...(KF ? { kf: { volume: [{ t: 0, v: 1 }, { t: 2, v: 0.1 }] } } : {}) },
    ] },
  ],
};
const textAssets = { t1: { path: p('t.png'), cx: 384, cy: 216 }, s1: { path: p('shape.png'), cx: 384, cy: 216 } };

const size = exportSize(project, 720);
const outPath = p(`out_v14${KF ? '_kf' : ''}.mp4`), graphPath = p('graph_v14.txt');
const { args, graph, duration } = buildExport({ project, mediaMap: media, out: { format: 'mp4', ...size, fps: 30, quality: 'standard' }, textAssets, outPath, graphPath });
fs.writeFileSync(graphPath, graph);
const t0 = Date.now();
try {
  execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const d = run(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outPath]).trim();
  console.log(`OK  ${size.width}x${size.height}  esperado ${duration.toFixed(2)}s  obtido ${d}s  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  for (const t of [0.2, 1.2, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0]) run(FF, ['-v', 'error', '-y', '-ss', String(t), '-i', outPath, '-frames:v', '1', '-vf', 'scale=320:-1', p(`v14_${t.toFixed(1)}.png`)]);
  run(FF, ['-v', 'error', '-y', '-i', p('v14_0.2.png'), '-i', p('v14_1.2.png'), '-i', p('v14_2.5.png'), '-i', p('v14_3.0.png'), '-i', p('v14_3.5.png'), '-i', p('v14_4.0.png'), '-i', p('v14_5.0.png'), '-i', p('v14_6.0.png'),
    '-filter_complex', 'xstack=inputs=8:layout=0_0|w0_0|w0+w1_0|w0+w1+w2_0|0_h0|w0_h0|w0+w1_h0|w0+w1+w2_h0', p(`v14_mosaico${KF ? '_kf' : ''}.png`)]);
  console.log('mosaico:', p(`v14_mosaico${KF ? '_kf' : ''}.png`));
} catch (e) {
  console.log('ERRO:', e.stderr?.toString().slice(-2500));
  console.log(graph);
  process.exitCode = 1;
}
