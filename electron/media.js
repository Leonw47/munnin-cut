// Tarefas de mídia no processo principal: ffprobe, miniaturas, forma de onda, proxies.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff', '.heic', '.heif', '.avif', '.svg', '.jfif']);
const IMAGE_CODECS = new Set(['mjpeg', 'png', 'bmp', 'webp', 'tiff', 'jpegls', 'jpeg2000', 'hevc_image', 'av1_image', 'svg', 'gif']);
const HEIF_EXTS = new Set(['.heic', '.heif', '.hif']);
const HDR_TRC = new Set(['arib-std-b67', 'smpte2084']);

// Caixas ISO-BMFF de um trecho (buf, início, fim) → [{ type, s (conteúdo), e }]
function caixas(b, s, e) {
  const out = [];
  while (s + 8 <= e) {
    let size = b.readUInt32BE(s);
    const type = b.toString('latin1', s + 4, s + 8);
    let h = 8;
    if (size === 1) { size = Number(b.readBigUInt64BE(s + 8)); h = 16; } else if (size === 0) size = e - s;
    if (size < h || s + size > e) break;
    out.push({ type, s: s + h, e: s + size });
    s += size;
  }
  return out;
}

/**
 * Orientação da foto principal de um HEIC/HEIF: as propriedades 'irot' (giro anti-horário em passos
 * de 90°) e 'imir' (espelho), na ordem em que vêm. O FFmpeg não aplica isso nas fotos em grade.
 */
async function heifOrientacao(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const { size: total } = await fh.stat();
    const ler = async (pos, len) => {
      const b = Buffer.alloc(len);
      const { bytesRead } = await fh.read(b, 0, len, pos);
      return b.subarray(0, bytesRead);
    };
    let pos = 0, meta = null;
    while (pos + 8 <= total) {
      const h = await ler(pos, 16);
      let size = h.readUInt32BE(0), hd = 8;
      const type = h.toString('latin1', 4, 8);
      if (size === 1) { size = Number(h.readBigUInt64BE(8)); hd = 16; } else if (size === 0) size = total - pos;
      if (type === 'meta') { meta = await ler(pos + hd, Math.min(size - hd, 8 << 20)); break; }
      if (size < 8) break;
      pos += size;
    }
    if (!meta) return [];
    const top = caixas(meta, 4, meta.length);           // 'meta' é FullBox (4 bytes de versão/flags)
    const pitm = top.find((x) => x.type === 'pitm'), iprp = top.find((x) => x.type === 'iprp');
    if (!pitm || !iprp) return [];
    const principal = meta[pitm.s] === 0 ? meta.readUInt16BE(pitm.s + 4) : meta.readUInt32BE(pitm.s + 4);
    const ip = caixas(meta, iprp.s, iprp.e);
    const ipco = ip.find((x) => x.type === 'ipco');
    if (!ipco) return [];
    const props = caixas(meta, ipco.s, ipco.e);
    const ops = [];
    for (const ipma of ip.filter((x) => x.type === 'ipma')) {
      const ver = meta[ipma.s], largo = meta.readUIntBE(ipma.s + 1, 3) & 1;
      let p = ipma.s + 4;
      const n = meta.readUInt32BE(p); p += 4;
      for (let i = 0; i < n && p < ipma.e; i++) {
        const id = ver < 1 ? meta.readUInt16BE(p) : meta.readUInt32BE(p);
        p += ver < 1 ? 2 : 4;
        const cnt = meta[p++];
        for (let k = 0; k < cnt; k++) {
          const idx = largo ? meta.readUInt16BE(p) & 0x7fff : meta[p] & 0x7f;
          p += largo ? 2 : 1;
          const pr = id === principal && idx ? props[idx - 1] : null;
          if (pr?.type === 'irot') ops.push({ giro: (meta[pr.s] & 3) * 90 });
          else if (pr?.type === 'imir') ops.push({ espelho: meta[pr.s] & 1 });   // 0 = eixo vertical (esq↔dir)
        }
      }
    }
    return ops;
  } catch { return []; } finally { await fh.close(); }
}

// Vídeo HDR → SDR BT.709 (sem isso as cores saem "lavadas"). Mesma conversão de src/shared/graph.js.
function hdrParaSdr(hdr) {
  if (!hdr) return [];
  return [
    `zscale=tin=${hdr.trc}:min=${hdr.matrix}:pin=${hdr.prim}:rin=${hdr.range}:t=linear:npl=100`, 'format=gbrpf32le',
    'zscale=p=bt709', 'tonemap=tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv', 'format=yuv420p',
  ];
}

// irot/imir → filtros do FFmpeg (o giro do irot é anti-horário)
function filtrosOrientacao(ops) {
  const f = [];
  for (const o of ops) {
    if (o.giro === 90) f.push('transpose=cclock');
    else if (o.giro === 180) f.push('hflip', 'vflip');
    else if (o.giro === 270) f.push('transpose=clock');
    else if (o.espelho === 0) f.push('hflip');
    else if (o.espelho === 1) f.push('vflip');
  }
  return f;
}

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

  async function probeJson(file) {
    return JSON.parse(await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '-show_stream_groups', file]));
  }

  /**
   * HEIC/HEIF: fotos do iPhone vêm em grade de ladrilhos (ex.: 48 de 512×512) que precisam ser juntados.
   * Devolve { w, h, filtro } — o filtro (filter_complex) monta a foto inteira, desfaz o corte da grade,
   * aplica giro/espelho e converte as cores de Display P3 para sRGB. null se não for HEIF.
   */
  async function heifPlano(file, j) {
    if (!HEIF_EXTS.has(path.extname(file).toLowerCase())) return null;
    j = j || await probeJson(file);
    const ops = await heifOrientacao(file);
    const grade = (j.stream_groups || []).find((g) => /tile grid/i.test(g.type || ''))?.components?.[0];
    const streams = j.streams || [];
    let entrada, w, h, ref;
    if (grade?.subcomponents?.length) {
      const subs = grade.subcomponents;
      ref = streams.find((s) => s.index === subs[0].stream_index) || {};
      const labels = subs.map((s) => `[0:${s.stream_index}]`).join('');
      const corte = `crop=${grade.width}:${grade.height}:${grade.horizontal_offset || 0}:${grade.vertical_offset || 0}`;
      entrada = subs.length > 1
        ? `${labels}xstack=inputs=${subs.length}:layout=${subs.map((s) => `${s.tile_horizontal_offset}_${s.tile_vertical_offset}`).join('|')}:fill=black,${corte}`
        : `${labels}${corte}`;
      w = grade.width; h = grade.height;
    } else {
      // foto única: a maior imagem do arquivo (as menores são miniaturas)
      ref = streams.filter((s) => s.codec_type === 'video').sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (!ref) return null;
      entrada = `[0:${ref.index}]null`;
      w = ref.width; h = ref.height;
    }
    const giros = ops.filter((o) => o.giro === 90 || o.giro === 270).length;
    if (giros % 2) [w, h] = [h, w];
    const f = [entrada, ...filtrosOrientacao(ops)];
    if (ref.color_primaries === 'smpte432' || ref.color_primaries === 'bt2020') {
      const cheio = ref.color_range !== 'tv';
      f.push(`colorspace=space=bt709:trc=srgb:primaries=bt709:range=pc:ispace=${ref.color_space === 'bt709' ? 'bt709' : 'smpte170m'}:itrc=srgb:iprimaries=${ref.color_primaries}:irange=${cheio ? 'pc' : 'tv'}:format=yuv444p`);
    }
    return { w, h, filtro: `${f.join(',')}[out]` };
  }

  async function probe(file) {
    const st = await fsp.stat(file);
    const j = await probeJson(file);
    const streams = j.streams || [];
    const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
    const a = streams.find((s) => s.codec_type === 'audio');
    const ext = path.extname(file).toLowerCase();
    if (HEIF_EXTS.has(ext) && v) {
      const hp = await heifPlano(file, j);
      if (hp) return { type: 'image', duration: 0, width: hp.w, height: hp.h, fps: 30, hasAudio: false, hasAlpha: false, vcodec: v.codec_name, acodec: null, size: st.size, pv: 2 };
    }
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
      // vídeo HDR (iPhone grava em HLG/Dolby Vision): a exportação converte para SDR
      hdr: type === 'video' && HDR_TRC.has(v?.color_transfer) ? {
        trc: v.color_transfer,
        matrix: ['bt2020nc', 'bt709', 'smpte170m', 'bt470bg'].includes(v.color_space) ? v.color_space : 'bt2020nc',
        prim: v.color_primaries === 'bt709' ? 'bt709' : 'bt2020',
        range: v.color_range === 'pc' ? 'pc' : 'tv',
      } : null,
      pv: 2,
    };
  }

  // Tira de miniaturas: um único JPEG com N quadros lado a lado.
  async function thumbs(file, info) {
    if (info.type !== 'video') return null;
    const key = await keyFor(file, info.hdr ? 'thumbs4' : 'thumbs3');
    const out = path.join(cacheDir, `${key}_thumbs.jpg`);
    const th = 90;
    const aspect = info.width && info.height ? info.width / info.height : 16 / 9;
    const tw = Math.max(16, Math.min(180, Math.round((th * aspect) / 2) * 2));
    const dur = Math.max(0.1, info.duration || 1);
    const count = Math.max(1, Math.min(80, Math.round(dur)));
    if (!fs.existsSync(out)) {
      await enqueue(() => run(ffmpeg, [
        '-v', 'error', '-y', ...(dur > 60 ? ['-skip_frame', 'nokey'] : []), '-i', file, '-an',
        '-vf', [`fps=${(count / dur).toFixed(6)}`, `scale=${tw}:${th}`, ...hdrParaSdr(info.hdr), `tile=${count}x1`].join(','),
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
  // HEIC/HEIF: a cópia é a foto inteira (grade montada, girada, em sRGB) e serve também para a exportação.
  // Vídeo HDR: a cópia já sai convertida para SDR (mesma conversão da exportação).
  async function proxy(file, kind, onProgress) {
    const heif = kind === 'image' ? await heifPlano(file).catch(() => null) : null;
    const info = kind === 'video' ? await probe(file).catch(() => null) : null;
    const especial = heif || info?.hdr;
    const key = await keyFor(file, `${especial ? 'proxy3' : 'proxy2'}-${kind}`);
    const ext = kind === 'audio' ? 'm4a' : kind === 'image' ? (heif ? 'jpg' : 'png') : 'mp4';
    const out = path.join(cacheDir, `${key}_proxy.${ext}`);
    if (fs.existsSync(out)) return out;
    const tmp = `${out}.part.${ext}`;
    let args;
    if (heif) args = ['-v', 'error', '-y', '-noautorotate', '-i', file, '-filter_complex', heif.filtro, '-map', '[out]', '-frames:v', '1', '-update', '1', '-q:v', '2', tmp];
    else if (kind === 'image') args = ['-v', 'error', '-y', '-i', file, '-frames:v', '1', tmp];
    else if (kind === 'audio') args = ['-v', 'error', '-y', '-i', file, '-vn', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-progress', 'pipe:1', '-nostats', tmp];
    else args = [
      '-v', 'error', '-y', '-i', file, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', ["scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'", ...hdrParaSdr(info?.hdr)].join(','),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-g', '15', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', tmp,
    ];
    let total = info?.duration || 0;
    if (!total && kind !== 'image') try { total = (await probe(file)).duration; } catch { /* sem duração */ }
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

  return { probe, thumbs, waveform, proxy, reverse, hasEncoder, run, heifPlano };
}
