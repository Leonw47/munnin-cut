// Monta o comando do FFmpeg (entradas + filter_complex + codificação) a partir do projeto.
// Função pura: roda no renderer e nos testes em Node.

import { EXPORT_FORMATS } from './defs.js';
import { layoutProject, mainTrack, transitionDuration, projectDuration, cropDims, fitScale } from './timeline.js';
import { clipOps, effectClipOps, ffFilters } from './ops.js';
import { animScaleExpr, animOffsetExprs, animFades } from './anim.js';
import { effectDef, isSegmentEffect, seedOf } from './effects.js';

const r3 = (x) => String(Math.round(x * 1000) / 1000);
const n4 = (x) => String(Math.round(x * 10000) / 10000);
const even = (x) => Math.max(2, Math.round(x / 2) * 2);
const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#000000');

export function exportSize(project, shortSide) {
  const s = shortSide / Math.min(project.width, project.height);
  return { width: even(project.width * s), height: even(project.height * s) };
}

// Trecho (em quadros) de cada clipe de efeito — usado pelo montador e pelo
// exportador (que precisa gerar exatamente esse número de quadros das camadas).
export function effectSegments(src, FPS) {
  const project = layoutProject(structuredClone(src));
  const T = Math.max(1 / FPS, projectDuration(project));
  const TF = Math.round(T * FPS);
  const out = [];
  const main = mainTrack(project);
  const mi = main ? project.tracks.indexOf(main) : project.tracks.length;
  for (let ti = mi - 1; ti >= 0; ti--) {
    const tr = project.tracks[ti];
    if (tr.hidden || tr.kind !== 'effect') continue;
    for (const c of tr.clips) {
      if (c.type !== 'effect' || c.effect?.kind === 'filter') continue;
      const def = effectDef(c.effect?.id);
      if (!isSegmentEffect(def)) continue;
      const a = Math.max(0, Math.round(c.start * FPS)), b = Math.min(TF, Math.round((c.start + c.duration) * FPS));
      if (b - a < 1) continue;
      out.push({ clip: c, def, a, b, frames: b - a, D: (b - a) / FPS, k: (c.effect.intensity ?? 100) / 100, seed: seedOf(c.id) });
    }
  }
  return { segments: out, TF };
}

/**
 * @param {object} job
 *   project, mediaMap {id: media}, out {format, width, height, fps, quality, hw},
 *   textAssets {clipId: {path, cx, cy}}, outPath, graphPath
 */
export function buildExport({ project: src, mediaMap, out, textAssets = {}, fxAssets = {}, outPath, graphPath }) {
  const project = layoutProject(structuredClone(src));
  const fmt = EXPORT_FORMATS.find((f) => f.id === out.format) || EXPORT_FORMATS[0];
  const wantVideo = fmt.kind !== 'audio';
  const wantAudio = fmt.kind !== 'gif';
  const W = even(out.width), H = even(out.height), FPS = out.fps || 30;
  const T = Math.max(1 / FPS, projectDuration(project));
  const bgDefault = project.background || { type: 'color', color: '#000000' };
  const q = (x) => Math.max(1, Math.round(x * FPS)) / FPS; // duração em quadros inteiros

  const inputs = [];
  let nIn = 0;
  const F = [];
  let nl = 0;
  const L = (p) => `${p}${nl++}`;
  const audio = [];
  const inputCache = new Map();

  const addInput = (args) => { inputs.push(...args); return nIn++; };
  const mediaOf = (c) => mediaMap[c.mediaId];
  const usable = (m) => !!(m && !m.missing && (m.renderPath || m.path));

  function inputFor(c, m) {
    if (inputCache.has(c.id)) return inputCache.get(c.id);
    const p = m.renderPath || m.path;
    const idx = m.type === 'image'
      ? addInput(['-loop', '1', '-framerate', String(FPS), '-t', r3(c.duration + 0.5), '-i', p])
      : addInput(['-ss', r3(c.in || 0), '-t', r3(c.duration * (c.speed || 1) + 0.25), '-i', p]);
    inputCache.set(c.id, idx);
    return idx;
  }

  // Fonte → recorte → escala da camada → cor/efeitos do clipe.
  function preChain(c, m) {
    const f = ['setpts=PTS-STARTPTS'];
    const sp = c.speed || 1;
    if (m.type === 'video') {
      if (Math.abs(sp - 1) > 1e-3) f.push(`setpts=PTS/${n4(sp)}`);
      f.push(`fps=${FPS}`, 'tpad=stop_mode=clone:stop_duration=1');
    } else f.push(`fps=${FPS}`);
    f.push(`trim=duration=${r3(c.duration)}`, 'setpts=PTS-STARTPTS');
    const cr = c.crop || {};
    if (cr.l || cr.r || cr.t || cr.b) {
      f.push(`crop=w=iw*${n4(1 - (cr.l || 0) - (cr.r || 0))}:h=ih*${n4(1 - (cr.t || 0) - (cr.b || 0))}:x=iw*${n4(cr.l || 0)}:y=ih*${n4(cr.t || 0)}`);
    }
    const { sw, sh } = cropDims(m, cr);
    const s = fitScale(sw, sh, W, H, c.fit) * (c.transform?.scale ?? 1);
    const w = even(sw * s), h = even(sh * s);
    f.push(`scale=${w}:${h}`, 'setsar=1', 'format=rgba');
    const fx = ffFilters(clipOps(c), { w, h, alpha: !!m.hasAlpha });
    // alguns filtros (vinheta, eq) descartam o alfa; a rotação e as animações precisam dele
    if (fx.length) f.push(...fx, 'format=rgba');
    return { f, w, h };
  }

  // Espelhar → girar → opacidade → (deslocar no tempo) → animações.
  function placeChain(c, t0) {
    const f = [];
    const tf = c.transform || {};
    if (tf.flipH) f.push('hflip');
    if (tf.flipV) f.push('vflip');
    const rot = ((tf.rotation || 0) * Math.PI) / 180;
    if (Math.abs(rot) > 1e-4) f.push(`rotate=a=${n4(rot)}:c=none:ow=rotw(${n4(rot)}):oh=roth(${n4(rot)})`);
    const op = c.opacity ?? 1;
    if (op < 0.999) f.push(`colorchannelmixer=aa=${n4(op)}`);
    if (t0 > 0) f.push(`setpts=PTS+${r3(t0)}/TB`);
    const sx = animScaleExpr(c, t0);
    if (sx) f.push(`scale=w='max(2,trunc(iw*${sx}))':h='max(2,trunc(ih*${sx}))':eval=frame`);
    f.push(...animFades(c, t0));
    const { dx, dy } = animOffsetExprs(c, t0);
    const cx = W / 2 + (tf.x || 0) * W, cy = H / 2 + (tf.y || 0) * H;
    return {
      f,
      x: `${n4(cx)}-w/2${dx ? `+${W}*(${dx})` : ''}`,
      y: `${n4(cy)}-h/2${dy ? `+${H}*(${dy})` : ''}`,
    };
  }

  function audioPart(c, m) {
    const idx = inputFor(c, m);
    const f = ['asetpts=PTS-STARTPTS'];
    let sp = c.speed || 1;
    const tempos = [];
    while (sp > 2.0001) { tempos.push(2); sp /= 2; }
    while (sp < 0.4999) { tempos.push(0.5); sp /= 0.5; }
    if (Math.abs(sp - 1) > 1e-3) tempos.push(sp);
    for (const t of tempos) f.push(`atempo=${n4(t)}`);
    f.push(`atrim=duration=${r3(c.duration)}`, 'asetpts=PTS-STARTPTS');
    const vol = c.volume ?? 1;
    if (Math.abs(vol - 1) > 1e-3) f.push(`volume=${n4(vol)}`);
    if (c.fadeIn > 0) f.push(`afade=t=in:st=0:d=${r3(Math.min(c.fadeIn, c.duration))}`);
    if (c.fadeOut > 0) f.push(`afade=t=out:st=${r3(Math.max(0, c.duration - c.fadeOut))}:d=${r3(Math.min(c.fadeOut, c.duration))}`);
    f.push('aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo');
    if (c.start > 0.0005) f.push(`adelay=delays=${Math.round(c.start * 1000)}:all=1`);
    const l = L('a');
    F.push(`[${idx}:a]${f.join(',')}[${l}]`);
    audio.push(l);
  }

  const main = mainTrack(project);
  const mainClips = main ? main.clips : [];
  let base = null;

  if (wantVideo) {
    // ---- Faixa principal: cada clipe vira um quadro completo, depois concat/xfade ----
    const parts = [];
    const showMain = main && !main.hidden;
    mainClips.forEach((c, i) => {
      const m = mediaOf(c);
      const dur = q(c.duration);
      const td = transitionDuration(c, mainClips[i + 1]);
      const tdq = td > 0 ? Math.min(Math.round(td * FPS) / FPS, dur / 2) : 0;
      const lab = L('v');
      if (!showMain || !usable(m) || (m.type !== 'video' && m.type !== 'image')) {
        F.push(`color=c=${hex(bgDefault.color)}:s=${W}x${H}:r=${FPS}:d=${r3(dur)},format=yuv420p,setsar=1,settb=AVTB[${lab}]`);
      } else {
        const idx = inputFor(c, m);
        const { f: pre } = preChain(c, m);
        const pl = placeChain(c, 0);
        const bg = c.bg || bgDefault;
        const bgL = L('bg'), fgL = L('fg');
        if (bg.type === 'blur') {
          const a = L('s'), b = L('s');
          F.push(`[${idx}:v]${pre.join(',')},split=2[${a}][${b}]`);
          const sigma = Math.max(1, (bg.blur ?? 0.03) * H);
          F.push(`[${b}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=${sigma.toFixed(1)}[${bgL}]`);
          F.push(`[${a}]${pl.f.length ? pl.f.join(',') : 'null'}[${fgL}]`);
        } else {
          F.push(`color=c=${hex(bg.color)}:s=${W}x${H}:r=${FPS}:d=${r3(dur)}[${bgL}]`);
          F.push(`[${idx}:v]${[...pre, ...pl.f].join(',')}[${fgL}]`);
        }
        F.push(`[${bgL}][${fgL}]overlay=x='${pl.x}':y='${pl.y}':eof_action=pass:format=auto,trim=duration=${r3(dur)},setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p,setsar=1,settb=AVTB[${lab}]`);
      }
      parts.push({ lab, dur, tdq, tid: c.transition?.id });
    });

    let acc = null, accDur = 0, prevTd = 0, prevId = 'fade';
    let group = [], groupDur = 0;
    parts.forEach((p, i) => {
      group.push(p.lab);
      groupDur += p.dur;
      const last = i === parts.length - 1;
      if (p.tdq > 0 || last) {
        let gl = group[0];
        if (group.length > 1) {
          gl = L('c');
          F.push(`${group.map((g) => `[${g}]`).join('')}concat=n=${group.length}:v=1:a=0[${gl}]`);
        }
        if (acc === null) { acc = gl; accDur = groupDur; }
        else {
          const l = L('x');
          F.push(`[${acc}][${gl}]xfade=transition=${prevId}:duration=${r3(prevTd)}:offset=${r3(accDur - prevTd)}[${l}]`);
          acc = l;
          accDur += groupDur - prevTd;
        }
        prevTd = p.tdq;
        prevId = p.tid || 'fade';
        group = [];
        groupDur = 0;
      }
    });

    if (acc === null) {
      base = L('m');
      F.push(`color=c=${hex(bgDefault.color)}:s=${W}x${H}:r=${FPS}:d=${r3(T)},format=yuv420p,setsar=1[${base}]`);
    } else if (T - accDur > 0.5 / FPS) {
      base = L('m');
      F.push(`[${acc}]tpad=stop_mode=add:stop_duration=${r3(T - accDur)}:color=${hex(bgDefault.color)}[${base}]`);
    } else base = acc;

    // ---- Faixas acima da principal, de baixo para cima ----
    const mi = main ? project.tracks.indexOf(main) : project.tracks.length;
    for (let ti = mi - 1; ti >= 0; ti--) {
      const tr = project.tracks[ti];
      if (tr.hidden || tr.kind === 'audio') continue;
      for (const c of [...tr.clips].sort((a, b) => a.start - b.start)) {
        const s = c.start, e = c.start + c.duration;
        if (e <= 0 || s >= T) continue;
        const en = `between(t,${r3(s)},${r3(e)})`;
        if (c.type === 'effect') {
          const def = c.effect?.kind === 'filter' ? null : effectDef(c.effect?.id);
          if (!isSegmentEffect(def)) {
            const fl = ffFilters(effectClipOps(c), { w: W, h: H, enable: en, t0: s });
            if (!fl.length) continue;
            const needsRgb = fl.some((x) => x.startsWith('colorchannelmixer') || x.startsWith('lutrgb'));
            const l = L('b');
            F.push(`[${base}]${needsRgb ? 'format=gbrp,' : ''}${fl.join(',')}[${l}]`);
            base = l;
            continue;
          }
          // Efeito animado: isola o trecho do clipe (split/trim), processa e junta de volta (concat).
          const TF = Math.round(T * FPS);
          const a = Math.max(0, Math.round(s * FPS)), b = Math.min(TF, Math.round(e * FPS));
          if (b - a < 1) continue;
          const k = (c.effect.intensity ?? 100) / 100;
          const D = (b - a) / FPS;
          const pre = a > 0, post = b < TF;
          const lp = L('p'), lm = L('p'), lq = L('p');
          const outs = [pre ? lp : null, lm, post ? lq : null].filter(Boolean);
          F.push(`[${base}]split=${outs.length}${outs.map((o) => `[${o}]`).join('')}`);
          const segs = [];
          if (pre) { const l = L('sg'); F.push(`[${lp}]trim=end_frame=${a},setpts=PTS-STARTPTS,format=yuv420p,setsar=1[${l}]`); segs.push(l); }
          let m = L('fm');
          const opsF = ffFilters(effectClipOps(c), { w: W, h: H, t0: 0 });
          const needsRgb = opsF.some((x) => x.startsWith('colorchannelmixer') || x.startsWith('lutrgb'));
          F.push(`[${lm}]trim=start_frame=${a}:end_frame=${b},setpts=PTS-STARTPTS${opsF.length ? `,${needsRgb ? 'format=gbrp,' : ''}${opsF.join(',')}` : ''}[${m}]`);
          if (def.ff) {
            const o = L('fx');
            F.push(def.ff({ inL: m, outL: o, W, H, FPS, D, k, seed: seedOf(c.id), L }));
            m = o;
          }
          const asset = fxAssets[c.id];
          if (def.layer && asset) {
            const idx = addInput(['-framerate', String(FPS), '-start_number', '0', '-i', asset.pattern]);
            const o = L('fl'), y = L('ly');
            if (def.layer.blend === 'screen') {
              const x = L('lx');
              F.push(`[${m}]format=gbrp[${x}];[${idx}:v]format=gbrp,setpts=PTS-STARTPTS[${y}];[${x}][${y}]blend=all_mode=screen[${o}]`);
            } else {
              F.push(`[${idx}:v]format=rgba,setpts=PTS-STARTPTS[${y}];[${m}][${y}]overlay=eof_action=pass:format=auto[${o}]`);
            }
            m = o;
          }
          const me = L('sg');
          F.push(`[${m}]format=yuv420p,setsar=1[${me}]`);
          segs.push(me);
          if (post) { const l = L('sg'); F.push(`[${lq}]trim=start_frame=${b},setpts=PTS-STARTPTS,format=yuv420p,setsar=1[${l}]`); segs.push(l); }
          const nb = L('b');
          F.push(segs.length > 1 ? `${segs.map((x) => `[${x}]`).join('')}concat=n=${segs.length}:v=1:a=0,settb=AVTB[${nb}]` : `[${segs[0]}]null[${nb}]`);
          base = nb;
        } else if (c.type === 'text') {
          const a = textAssets[c.id];
          if (!a) continue;
          const idx = addInput(['-loop', '1', '-framerate', String(FPS), '-t', r3(c.duration + 0.1), '-i', a.path]);
          const f = ['format=rgba', `setpts=PTS-STARTPTS+${r3(s)}/TB`];
          const sx = animScaleExpr(c, s);
          if (sx) f.push(`scale=w='max(2,trunc(iw*${sx}))':h='max(2,trunc(ih*${sx}))':eval=frame`);
          f.push(...animFades(c, s));
          const { dx, dy } = animOffsetExprs(c, s);
          const tl = L('t'), l = L('b');
          F.push(`[${idx}:v]${f.join(',')}[${tl}]`);
          F.push(`[${base}][${tl}]overlay=x='${n4(a.cx)}-w/2${dx ? `+${W}*(${dx})` : ''}':y='${n4(a.cy)}-h/2${dy ? `+${H}*(${dy})` : ''}':eof_action=pass:enable='${en}'[${l}]`);
          base = l;
        } else if (c.type === 'video' || c.type === 'image') {
          const m = mediaOf(c);
          if (!usable(m)) continue;
          const idx = inputFor(c, m);
          const { f: pre } = preChain(c, m);
          const pl = placeChain(c, s);
          const ol = L('o'), l = L('b');
          F.push(`[${idx}:v]${[...pre, ...pl.f].join(',')}[${ol}]`);
          F.push(`[${base}][${ol}]overlay=x='${pl.x}':y='${pl.y}':eof_action=pass:enable='${en}'[${l}]`);
          base = l;
        }
      }
    }

    if (fmt.kind === 'gif') {
      const gw = even(Math.min(W, W >= H ? 960 : 540));
      F.push(`[${base}]fps=${Math.min(FPS, 15)},scale=${gw}:-2:flags=lanczos,split[g1][g2];[g1]palettegen=stats_mode=diff[gp];[g2][gp]paletteuse=dither=bayer:bayer_scale=4[vout]`);
    } else F.push(`[${base}]format=yuv420p[vout]`);
  }

  // ---- Áudio de todas as faixas ----
  if (wantAudio) {
    for (const tr of project.tracks) {
      if (tr.muted) continue;
      for (const c of tr.clips) {
        if (c.muted || (c.volume ?? 1) <= 0) continue;
        if (c.type !== 'video' && c.type !== 'audio') continue;
        const m = mediaOf(c);
        if (!usable(m) || !m.hasAudio) continue;
        if (c.start >= T) continue;
        audioPart(c, m);
      }
    }
    if (!audio.length) F.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${r3(T)}[aout]`);
    else if (audio.length === 1) F.push(`[${audio[0]}]apad=whole_dur=${r3(T)},atrim=duration=${r3(T)}[aout]`);
    else F.push(`${audio.map((a) => `[${a}]`).join('')}amix=inputs=${audio.length}:duration=longest:normalize=0:dropout_transition=0,apad=whole_dur=${r3(T)},atrim=duration=${r3(T)}[aout]`);
  }

  // ---- Codificação ----
  const crf = { high: 18, standard: 21, small: 26 }[out.quality] ?? 21;
  const nv = out.hw === 'nvenc';
  const v = [], a = [];
  switch (fmt.id) {
    case 'mp4': case 'mov': case 'mkv':
      if (nv) v.push('-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', String(crf + 2), '-b:v', '0', '-pix_fmt', 'yuv420p');
      else v.push('-c:v', 'libx264', '-preset', out.quality === 'high' ? 'slow' : 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p');
      if (fmt.id !== 'mkv') v.push('-movflags', '+faststart');
      a.push('-c:a', 'aac', '-b:a', '192k');
      break;
    case 'mp4_hevc':
      if (nv) v.push('-c:v', 'hevc_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', String(crf + 4), '-b:v', '0', '-pix_fmt', 'yuv420p');
      else v.push('-c:v', 'libx265', '-preset', 'medium', '-crf', String(crf + 5), '-pix_fmt', 'yuv420p');
      v.push('-tag:v', 'hvc1', '-movflags', '+faststart');
      a.push('-c:a', 'aac', '-b:a', '192k');
      break;
    case 'prores':
      v.push('-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le');
      a.push('-c:a', 'pcm_s16le');
      break;
    case 'webm':
      v.push('-c:v', 'libvpx-vp9', '-crf', String(crf + 12), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', '-pix_fmt', 'yuv420p');
      a.push('-c:a', 'libopus', '-b:a', '160k');
      break;
    case 'avi':
      v.push('-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', String({ high: 2, standard: 3, small: 5 }[out.quality] ?? 3));
      a.push('-c:a', 'libmp3lame', '-b:a', '192k');
      break;
    case 'gif':
      v.push('-loop', '0');
      break;
    case 'mp3': a.push('-c:a', 'libmp3lame', '-b:a', { high: '320k', standard: '192k', small: '128k' }[out.quality] || '192k'); break;
    case 'wav': a.push('-c:a', 'pcm_s16le'); break;
    case 'm4a': a.push('-c:a', 'aac', '-b:a', { high: '256k', standard: '192k', small: '128k' }[out.quality] || '192k'); break;
    case 'flac': a.push('-c:a', 'flac'); break;
    default: break;
  }

  const args = ['-y', '-hide_banner', '-nostdin', ...inputs, '-/filter_complex', graphPath];
  if (wantVideo) args.push('-map', '[vout]', ...v, '-r', String(fmt.kind === 'gif' ? Math.min(FPS, 15) : FPS));
  if (wantAudio) args.push('-map', '[aout]', ...a, '-ar', '48000');
  args.push('-t', r3(T), '-progress', 'pipe:1', '-nostats', '-loglevel', 'error', outPath);
  return { args, graph: F.join(';\n'), duration: T };
}
