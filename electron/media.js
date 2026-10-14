// Tarefas de mídia no processo principal: ffprobe, miniaturas, forma de onda, proxies.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff', '.heic', '.heif', '.avif', '.svg', '.jfif']);
const IMAGE_CODECS = new Set(['mjpeg', 'png', 'bmp', 'webp', 'tiff', 'jpegls', 'jpeg2000', 'hevc_image', 'av1_image', 'svg', 'gif']);

export function createMedia({ ffmpeg, ffprobe, cacheDir }) {
  fs.mkdirSync(cacheDir, { recursive: true });

  // Fila simples: no máximo 2 processos pesados ao mesmo tempo.
  let running = 0;
  const queue = [];
  function enqueue(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      pump();
    });
  }
  function pump() {
    while (running < 2 && queue.length) {
      const { fn, resolve, reject } = queue.shift();
      running++;
      fn().then(resolve, reject).finally(() => { running--; pump(); });
    }
  }

  function run(bin, args, { onStdout, binary = false } = {}) {
    return new Promise((resolve, reject) => {
      const p = spawn(bin, args, { windowsHide: true });
      const out = [];
      let err = '';
      p.stdout.on('data', (d) => { if (onStdout) onStdout(d); else out.push(d); });
      p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 20000) err = err.slice(-20000); });
      p.on('error', reject);
      p.on('close', (code) => {
        const buf = Buffer.concat(out);
        if (code === 0) resolve(binary ? buf : buf.toString());
        else reject(new Error(err.trim().split('\n').slice(-4).join('\n') || `código ${code}`));
      });
    });
  }

  async function keyFor(file, extra = '') {
    const st = await fsp.stat(file);
    return crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}|${extra}`).digest('hex').slice(0, 20);
  }

  async function probe(file) {
    const st = await fsp.stat(file);
    const j = JSON.parse(await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
    const streams = j.streams || [];
    const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
    const a = streams.find((s) => s.codec_type === 'audio');
    const ext = path.extname(file).toLowerCase();
    let duration = parseFloat(j.format?.duration || v?.duration || a?.duration || 0) || 0;
    let type = null;
    if (v) {
      const frames = parseInt(v.nb_frames || '0', 10);
      const still = IMAGE_EXTS.has(ext) || (IMAGE_CODECS.has(v.codec_name) && (!duration || duration < 0.05 || frames === 1));
      if (v.codec_name === 'gif') type = frames > 1 || duration > 0.15 ? 'video' : 'image';
      else type = still ? 'image' : 'video';
    } else if (a) type = 'audio';
    if (!type) throw new Error('Formato não reconhecido');

    let width = v?.width || 0, height = v?.height || 0;
    let rotation = 0;
    for (const sd of v?.side_data_list || []) if (sd.rotation !== undefined) rotation = sd.rotation;
    if (v?.tags?.rotate) rotation = parseInt(v.tags.rotate, 10) || rotation;
    if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];

    let fps = 30;
    if (v?.avg_frame_rate && v.avg_frame_rate !== '0/0') {
      const [n, d] = v.avg_frame_rate.split('/').map(Number);
      if (n && d) fps = Math.round((n / d) * 100) / 100;
    }
    const pix = v?.pix_fmt || '';
    return {
      type,
      duration: type === 'image' ? 0 : duration,
      width, height, fps,
      hasAudio: !!a && type !== 'image',
      hasAlpha: type !== 'audio' && /rgba|bgra|argb|abgr|ya8|ya16|yuva|gbrap|pal8/.test(pix),
      vcodec: v?.codec_name || null,
      acodec: a?.codec_name || null,
      size: st.size,
    };
  }

  // Tira de miniaturas: um único JPEG com N quadros lado a lado.
  async function thumbs(file, info) {
    if (info.type !== 'video') return null;
    const key = await keyFor(file, 'thumbs3');
    const out = path.join(cacheDir, `${key}_thumbs.jpg`);
    const th = 90;
    const aspect = info.width && info.height ? info.width / info.height : 16 / 9;
    const tw = Math.max(16, Math.min(180, Math.round((th * aspect) / 2) * 2));
    const dur = Math.max(0.1, info.duration || 1);
    const count = Math.max(1, Math.min(80, Math.round(dur)));
    if (!fs.existsSync(out)) {
      await enqueue(() => run(ffmpeg, [
        '-v', 'error', '-y', ...(dur > 60 ? ['-skip_frame', 'nokey'] : []), '-i', file, '-an',
        '-vf', `fps=${(count / dur).toFixed(6)},scale=${tw}:${th},tile=${count}x1`,
        '-frames:v', '1', '-q:v', '5', out,
      ]));
    }
    return { sprite: out, count, tw, th };
  }

  // Forma de onda: 100 picos por segundo, 1 byte cada (0–255).
  async function waveform(file) {
    const key = await keyFor(file, 'wave2');
    const out = path.join(cacheDir, `${key}_wave.bin`);
    if (fs.existsSync(out)) return out;
    const raw = await enqueue(() => run(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], { binary: true }));
    const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
    const per = 80;
    const n = Math.ceil(samples.length / per);
    const peaks = Buffer.alloc(n);
    for (let i = 0; i < n; i++) {
      let mx = 0;
      const end = Math.min(samples.length, (i + 1) * per);
      for (let j = i * per; j < end; j++) { const v = Math.abs(samples[j]); if (v > mx) mx = v; }
      peaks[i] = Math.min(255, Math.round(Math.pow(mx / 32768, 0.7) * 255));
    }
    await fsp.writeFile(out, peaks);
    return out;
  }

  // Proxy para a prévia quando o Chromium não consegue tocar o arquivo original.
  async function proxy(file, kind, onProgress) {
    const key = await keyFor(file, `proxy2-${kind}`);
    const ext = kind === 'audio' ? 'm4a' : kind === 'image' ? 'png' : 'mp4';
    const out = path.join(cacheDir, `${key}_proxy.${ext}`);
    if (fs.existsSync(out)) return out;
    const tmp = `${out}.part.${ext}`;
    let args;
    if (kind === 'image') args = ['-v', 'error', '-y', '-i', file, '-frames:v', '1', tmp];
    else if (kind === 'audio') args = ['-v', 'error', '-y', '-i', file, '-vn', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-progress', 'pipe:1', '-nostats', tmp];
    else args = [
      '-v', 'error', '-y', '-i', file, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-g', '15', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', tmp,
    ];
    let total = 0;
    try { total = (await probe(file)).duration; } catch { /* sem duração */ }
    await enqueue(() => run(ffmpeg, args, {
      onStdout: (d) => {
        const m = /out_time_us=(\d+)/.exec(d.toString());
        if (m && total > 0 && onProgress) onProgress(Math.min(0.99, parseInt(m[1], 10) / 1e6 / total));
      },
    }));
    await fsp.rename(tmp, out);
    return out;
  }

  // Cópia invertida (de trás para frente) para os clipes com "Reverter".
  // O filtro reverse guarda tudo na memória, então o arquivo é invertido em pedaços e
  // os pedaços são juntados na ordem contrária. Fica em cache (mesmo arquivo = mesma cópia).
  const reversing = new Map();
  function reverse(file, kind, onProgress) {
    const k = `${file}|${kind}`;
    if (!reversing.has(k)) reversing.set(k, doReverse(file, kind, onProgress).finally(() => reversing.delete(k)));
    return reversing.get(k);
  }
  async function doReverse(file, kind, onProgress) {
    const audioOnly = kind === 'audio';
    const key = await keyFor(file, `rev1-${kind}`);
    const ext = audioOnly ? 'm4a' : 'mp4';
    const out = path.join(cacheDir, `${key}_rev.${ext}`);
    if (fs.existsSync(out)) return { path: out, duration: (await probe(out)).duration };
    const info = await probe(file);
    const D = info.duration || 0;
    if (D <= 0) throw new Error('mídia sem duração');
    const CH = audioOnly ? 120 : 6;
    const n = Math.max(1, Math.ceil(D / CH - 1e-6));
    const dir = path.join(cacheDir, `${key}_rev_parts`);
    await fsp.rm(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const parts = [];
    for (let i = n - 1, j = 0; i >= 0; i--, j++) {
      const st = i * CH, len = Math.min(CH, D - st);
      if (len <= 0.01) continue;
      const part = path.join(dir, `p${String(j).padStart(4, '0')}.${ext}`);
      const args = ['-v', 'error', '-y', '-ss', st.toFixed(3), '-t', len.toFixed(3), '-i', file];
      if (audioOnly) args.push('-vn', '-af', 'areverse', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000', part);
      else {
        args.push('-map', '0:v:0', '-vf', 'reverse', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p');
        if (info.hasAudio) args.push('-map', '0:a:0', '-af', 'areverse', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000');
        args.push(part);
      }
      await enqueue(() => run(ffmpeg, args));
      parts.push(part);
      if (onProgress) onProgress(Math.min(0.97, (j + 1) / n));
    }
    const list = path.join(dir, 'lista.txt');
    await fsp.writeFile(list, parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
    const tmp = `${out}.part.${ext}`;
    await enqueue(() => run(ffmpeg, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', ...(audioOnly ? [] : ['-movflags', '+faststart']), tmp]));
    await fsp.rename(tmp, out);
    await fsp.rm(dir, { recursive: true, force: true });
    if (onProgress) onProgress(1);
    return { path: out, duration: (await probe(out)).duration };
  }

  async function hasEncoder(name) {
    try {
      await run(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=256x256:d=0.2', '-c:v', name, '-f', 'null', '-']);
      return true;
    } catch { return false; }
  }

  return { probe, thumbs, waveform, proxy, reverse, hasEncoder, run };
}
