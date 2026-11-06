// Monta o comando do FFmpeg (entradas + filter_complex + codificação) a partir do projeto.
// Função pura: roda no renderer e nos testes em Node.

import { EXPORT_FORMATS } from './defs.js';
import { layoutProject, mainTrack, transitionDuration, projectDuration, cropDims, fitScale, overlayChains, overlayTransDur } from './timeline.js';
import { clipOps, effectClipOps, ffFilters } from './ops.js';
import { animScaleExpr, animOffsetExprs, animFades, animRotExpr } from './anim.js';
import { effectDef, isSegmentEffect, seedOf } from './effects.js';
import { isCamTransition, camClipChain, camMixExpr } from './camtrans.js';
import { chromaFilters } from './chroma.js';
import { clipVisivel } from './visivel.js';
import { sombraDe, sombraPx } from './sombra.js';
import { pivoDe, temPivo, padPivo, filtroPivo } from './pivo.js';
import { temPersp, filtroPerspectiva } from './perspectiva.js';
import { areaCaixa } from './area.js';
import { audioFxFilters } from './audiofx.js';
import { splitKf, maxScale, maxScaleX, maxScaleY, kfExpr, kfWindows, KF_PROPS, COLOR_PROPS } from './keyframes.js';

const r3 = (x) => String(Math.round(x * 1000) / 1000);
// Tempo de um quadro exato (n/FPS) para o FFmpeg, sem passar do quadro: arredondado PARA BAIXO no microssegundo.
// (r3 em 7,0667 dava 7,067 — depois do quadro —, e o xfade de uma sequência de fotos punha tudo o que vinha
// depois um quadro atrasado.)
const tq = (x) => String(Math.floor(x * 1e6 + 1e-4) / 1e6);
const n4 = (x) => String(Math.round(x * 10000) / 10000);
const even = (x) => Math.max(2, Math.round(x / 2) * 2);
const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#000000');

// Bug do FFmpeg 8.0.1: a conversão rápida yuv420p → gbrp deixa as últimas colunas pretas em algumas
// larguras (1080 → 8 px, 1350 → 6 px, 1078, 1076, 1012…), o que virava uma barra preta na lateral
// direita de quase todo vídeo 1080 de largura (Instagram 4:5, 9:16, 1:1). Com accurate_rnd o
// swscale usa o caminho correto; aplicado só nas passagens para gbrp custa ~5% de tempo (no grafo
// inteiro custaria ~25%).
const TO_GBRP = 'scale=flags=bicubic+accurate_rnd,format=gbrp';
export const rgbSafe = (graph) => graph.replace(/format=gbrp\b/g, TO_GBRP);

// Vídeo HDR (iPhone grava em HLG/Dolby Vision) → SDR BT.709; sem isso as cores saem "lavadas".
// Mesma conversão do proxy (electron/media.js). Roda depois de reduzir a camada (mais leve).
export function hdrParaSdr(hdr) {
  if (!hdr) return [];
  return [
    `zscale=tin=${hdr.trc}:min=${hdr.matrix}:pin=${hdr.prim}:rin=${hdr.range}:t=linear:npl=100`, 'format=gbrpf32le',
    'zscale=p=bt709', 'tonemap=tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv', 'format=yuv420p',
  ];
}

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
      if (!isSegmentEffect(def) && !(def && c.area?.on)) continue;
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
/**
 * janela {a, b}: exportar em partes — monta só o trecho [a, b) do vídeo (segundos), tudo deslocado para começar
 * em 0. O que começou antes fica com início negativo (animações e pontos de modificação seguem no tempo certo) e
 * vídeos/faixa principal pulam o pedaço anterior; o que passa do fim é cortado. soVideo: sem áudio (feito à parte).
 */
export function buildExport({ project: src, mediaMap, out, textAssets = {}, fxAssets = {}, vozAssets = {}, chromaAssets = {}, areaAssets = {}, coverAsset = null, outPath, graphPath, janela = null, soVideo = false }) {
  const project = layoutProject(structuredClone(src));
  // pontos de modificação: valores constantes viram fixos; o que muda fica em c.__dyn
  for (const tr of project.tracks) {
    tr.clips = tr.clips.map((c) => {
      const { base, dyn } = splitKf(c);
      if (Object.keys(dyn).length) base.__dyn = dyn;
      return base;
    });
  }
  const fmt = EXPORT_FORMATS.find((f) => f.id === out.format) || EXPORT_FORMATS[0];
  const wantVideo = fmt.kind !== 'audio';
  const wantAudio = fmt.kind !== 'gif';
  const W = even(out.width), H = even(out.height), FPS = out.fps || 30;
  const A0 = janela ? Math.round(janela.a * FPS) : 0, B0 = janela ? Math.round(janela.b * FPS) : 0;
  if (janela) {
    // faixas de cima: o que toca a janela (com folga, para as transições entre clipes seguirem inteiras), deslocado
    const a = A0 / FPS, b = B0 / FPS, folga = 3;
    for (const tr of project.tracks) {
      if (tr.main) continue;
      tr.clips = tr.clips.filter((c) => c.start < b + folga && c.start + c.duration > a - folga).map((c) => ({ ...c, start: c.start - a }));
    }
  }
  const T = janela ? Math.max(1, B0 - A0) / FPS
    : Math.max(1 / FPS, out.endAt ? Math.min(out.endAt, projectDuration(project)) : projectDuration(project));
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

  // Tamanho em que a camada é preparada: o encaixe na tela × a maior escala (pontos de modificação e animações).
  // Com a escala mudando quadro a quadro, nunca acima do tamanho original da mídia: ampliar antes não acrescenta
  // detalhe (a prévia também desenha a partir do original) e uma foto de 1600 px com zoom de 600% virava 56
  // megapixels por quadro. k = parte da maior escala já aplicada na preparação (o resto, 1/k, fica para cada quadro);
  // wMax/hMax = maior tamanho que a camada chega a ter na tela.
  function tamanhoCamada(c, m) {
    const { sw, sh } = cropDims(m, c.crop || {});
    const dyn = c.__dyn || {};
    const s = fitScale(sw, sh, W, H, c.fit) * maxScale(c, dyn);
    const wMax = sw * s * maxScaleX(c, dyn), hMax = sh * s * maxScaleY(c, dyn);
    const animado = !!(dyn.scale || dyn.scaleX || dyn.scaleY);
    const k = animado ? Math.min(1, Math.max(sw / wMax, sh / hMax)) : 1;
    return { sw, sh, w: even(wMax * k), h: even(hMax * k), wMax: even(wMax), hMax: even(hMax), k };
  }

  // corte: segundos do começo do clipe que não entram (exportar em partes: o clipe começou antes da janela)
  function inputFor(c, m, corte = 0) {
    if (inputCache.has(c.id)) return inputCache.get(c.id);
    // "Reverter": usa a cópia invertida; o trecho [in, in + dur·vel] do original fica em [D − in − dur·vel, D − in]
    const rev = c.reverse && m.rev ? m.rev[c.type === 'audio' ? 'audio' : 'video'] : null;
    const p = rev ? rev.path : m.renderPath || m.path;
    const inPt = (rev ? Math.max(0, rev.duration - (c.in || 0) - c.duration * (c.speed || 1)) : c.in || 0) + corte * (c.speed || 1);
    let idx;
    if (m.type === 'image') {
      // foto com "remover fundo": o PNG já recortado pela mesma conta da prévia (engine/chromaImg.js)
      const src = chromaAssets[c.id]?.path || p;
      // foto JPEG bem maior que o necessário (ex.: 6240×4160 numa tela de 1920): o decodificador já lê em 1/2,
      // 1/4 ou 1/8 do tamanho — com dezenas de fotos, são gigabytes a menos e a preparação fica mais rápida
      let lowres = 0;
      if (/\.jpe?g$/i.test(src) && m.width && m.height) {
        const { sw, sh, w, h } = tamanhoCamada(c, m);
        while (lowres < 3 && sw / 2 ** (lowres + 1) >= w && sh / 2 ** (lowres + 1) >= h) lowres++;
      }
      idx = addInput([...(lowres ? ['-lowres', String(lowres)] : []), '-i', src]);
    } else idx = addInput(['-ss', r3(inPt), '-t', r3((c.duration - corte) * (c.speed || 1) + 0.25), '-i', p]);
    inputCache.set(c.id, idx);
    return idx;
  }

  // Laço que transforma o quadro único de uma imagem num trecho de vídeo (sem decodificar de novo).
  // settb antes de numerar: a imagem chega com a base de tempo de 25/s e N/(30*TB) nessa base arredondava —
  // 1 quadro em cada 6 caía no mesmo instante do anterior e todo zoom/movimento de foto "soluçava" 5 vezes por segundo.
  // O grafo inteiro trabalha em 1/FPS (cada quadro é um inteiro): em microssegundos 1/30 s não é exato e, depois de
  // cada xfade, os quadros da foto seguinte saíam um atrás e um deles repetido.
  const loopFor = (dur) => ['loop=loop=-1:size=1:start=0', `settb=1/${FPS}`, `setpts=N/(${FPS}*TB)`, `trim=duration=${r3(dur)}`, 'setpts=PTS-STARTPTS'];

  // Leva a camada para começar em t0, MAS no primeiro quadro do vídeo a partir de t0 (um múltiplo de 1/FPS). Fora da
  // grade (ex.: clipe em 13,716 s), a camada vinha com quadros em 13,749, 13,782… e o vídeo, em 13,733, 13,767…:
  // cada quadro mostrava o zoom/opacidade de meio quadro antes e a posição do instante certo — diferente da prévia.
  // Na grade, o tempo da camada é o do vídeo e tudo é calculado no mesmo instante. (Em frações de quadro, sem
  // arredondar para milésimos: um quadro da camada não pode cair depois do quadro do vídeo que ele preenche.)
  const naGrade = (t0) => {
    const k = Math.ceil(t0 * FPS - 1e-6);
    return k ? [`setpts=PTS+${k}/(${FPS}*TB)`] : [];
  };

  // Giro fixo exato: múltiplos de 90° viram espelhar/transpor (sem interpolação); o resto, rotate.
  // (Todo rotate usa fundo transparente explícito, c=black@0: com c=none o FFmpeg não limpa o quadro de saída e
  // os giros anteriores ficam desenhados como rastro — uma "estrela" de cópias.)
  function giroFixo(rad) {
    const q = ((Math.round((rad * 180) / Math.PI) % 360) + 360) % 360;
    if (Math.abs((rad * 180) / Math.PI - Math.round((rad * 180) / Math.PI)) < 1e-6 && q % 90 === 0) {
      return q === 0 ? [] : q === 90 ? ['transpose=clock'] : q === 180 ? ['hflip', 'vflip'] : ['transpose=cclock'];
    }
    return [`rotate=a=${n4(rad)}:c=black@0:ow=rotw(${n4(rad)}):oh=roth(${n4(rad)})`];
  }
  // Espelhar e girar fixos podem ir para a parte estática (antes do laço) quando nada disso muda no clipe.
  const giroEstatico = (c) => { const d = c.__dyn || {}; return !d.rotation && !d.scaleX && !d.scaleY; };

  // Fonte → recorte → escala da camada → cor/efeitos do clipe.
  // Para imagens, tudo isso é estático: roda uma vez e o laço (loopFor) entra depois (veja o "static").
  // girarAqui: numa foto, espelhar/girar fixos entram aqui (uma vez) e não a cada quadro — devolve girado: true.
  // corte: segundos do começo do clipe que não entram (o fluxo começa nesse ponto do clipe)
  function preChain(c, m, { girarAqui = false, corte = 0 } = {}) {
    const f = [];
    const sp = c.speed || 1;
    if (m.type === 'video') {
      f.push('setpts=PTS-STARTPTS');
      if (Math.abs(sp - 1) > 1e-3) f.push(`setpts=PTS/${n4(sp)}`);
      f.push(`fps=${FPS}`, 'tpad=stop_mode=clone:stop_duration=1');
      f.push(`trim=duration=${r3(c.duration - corte)}`, 'setpts=PTS-STARTPTS');
    }
    const cr = c.crop || {};
    if (cr.l || cr.r || cr.t || cr.b) {
      f.push(`crop=w=iw*${n4(1 - (cr.l || 0) - (cr.r || 0))}:h=ih*${n4(1 - (cr.t || 0) - (cr.b || 0))}:x=iw*${n4(cr.l || 0)}:y=ih*${n4(cr.t || 0)}`);
    }
    const dyn = c.__dyn || {};
    // com escala em pontos de modificação, a camada sai no maior tamanho e é reduzida quadro a quadro
    const { w, h, wMax, hMax, k } = tamanhoCamada(c, m);
    f.push(`scale=${w}:${h}`, 'setsar=1');
    if (m.type === 'video') f.push(...hdrParaSdr(m.hdr));
    if (c.chroma?.on && !chromaAssets[c.id]) f.push(...chromaFilters(c.chroma)); // termina em rgba
    else f.push('format=rgba');
    // cor com pontos de modificação: filtros por trechos (tempo local), senão filtros fixos
    const colorDyn = COLOR_PROPS.some((p) => dyn[p]);
    const fx = colorDyn ? [] : ffFilters(clipOps(c), { w, h, alpha: !!m.hasAlpha });
    // alguns filtros (vinheta, eq) descartam o alfa; a rotação e as animações precisam dele
    if (fx.length) f.push(...fx, 'format=rgba');
    const steps = colorDyn ? colorSteps(c, dyn, w, h, m, corte) : [];
    const isStatic = m.type === 'image';
    if (!isStatic) return { f: [...f, ...steps], stat: null, loop: null, w, h, wMax, hMax, k, passos: steps.length };
    let girado = false;
    if (girarAqui && giroEstatico(c)) {
      const tf = c.transform || {};
      if (tf.flipH) f.push('hflip');
      if (tf.flipV) f.push('vflip');
      f.push(...giroFixo(((tf.rotation || 0) * Math.PI) / 180));
      girado = true;
    }
    const loop = [...loopFor(c.duration - corte), ...steps];
    return { f: [...f, ...loop], stat: f, loop, w, h, wMax, hMax, k, girado, passos: steps.length };
  }

  // Ajustes/filtro que mudam ao longo do clipe: um conjunto de filtros por trecho (a cada 2 quadros).
  function colorSteps(c, dyn, w, h, m, corte = 0) {
    const props = COLOR_PROPS.filter((p) => dyn[p]);
    const wins = kfWindows({ ...c, kf: dyn }, props, FPS, { step: 2, quant: (p, v) => Math.round(v) });
    const out = [];
    wins.forEach((wd, i) => {
      const rc = { ...c, adjust: { ...(c.adjust || {}) }, filter: c.filter ? { ...c.filter } : c.filter };
      for (const p of props) KF_PROPS[p].set(rc, wd.vals[p]);
      const a = i === 0 ? -1e6 : wd.a - corte, b = i === wins.length - 1 ? 1e6 : wd.b - corte;
      out.push(...ffFilters(clipOps(rc), { w, h, alpha: !!m.hasAlpha, enable: `gte(t,${r3(a)})*lt(t,${r3(b)})` }));
    });
    return out.length ? [...out, 'format=rgba'] : [];
  }

  // Opacidade que muda: colorchannelmixer por trechos de 1 quadro (tempo do fluxo; at0 = início do clipe).
  // Os quadros de uma foto vêm do laço e não podem ser alterados no lugar: cada trecho copiaria a imagem para
  // uma reserva própria (dezenas de cópias grandes guardadas até o fim). Um único colorchannelmixer neutro, ligado
  // só nos instantes que mudam, faz UMA cópia alterável e os trechos trabalham nela sem alocar nada.
  function opacitySteps(c, dyn, at0) {
    const wins = kfWindows({ ...c, kf: dyn }, ['opacity'], FPS, { step: 1, quant: (p, v) => Math.round(v * 100) / 100 });
    const faixas = [];
    const steps = wins.map((wd, i) => {
      const v = wd.vals.opacity;
      if (v >= 0.995) return null;
      const a = i === 0 ? -1e6 : at0 + wd.a, b = i === wins.length - 1 ? 1e6 : at0 + wd.b;
      const u = faixas[faixas.length - 1];
      if (u && Math.abs(u[1] - a) < 1e-6) u[1] = b;
      else faixas.push([a, b]);
      return `colorchannelmixer=aa=${n4(Math.max(0, v))}:enable='gte(t,${r3(a)})*lt(t,${r3(b)})'`;
    }).filter(Boolean);
    if (steps.length < 2) return steps;
    const copia = `colorchannelmixer=aa=1:enable='${faixas.map(([a, b]) => `gte(t,${r3(a)})*lt(t,${r3(b)})`).join('+')}'`;
    return [copia, ...steps];
  }

  // Giro e escala: animação de entrada/saída + pontos de modificação na mesma expressão.
  // alfa: filtros só de transparência (esmaecer das animações) — entram junto com a opacidade dos pontos, ANTES
  // da escala quadro a quadro: no FFmpeg, colorchannelmixer/fade depois de um scale que muda de tamanho a cada
  // quadro prendem a camada no tamanho do 1º quadro (o zoom "parava" e a camada saía maior e fora do lugar).
  function motionFilters(c, dyn, at0, { rotBaked = true, staticRot = 0, scaleBase = null, scaleXBase = null, scaleYBase = null, boxW = null, boxH = null, alfa = [], k = 1 } = {}) {
    const f = [...(dyn.opacity ? opacitySteps(c, dyn, at0) : []), ...alfa];
    const rx = [dyn.rotation && rotBaked === false ? kfExpr(dyn.rotation, at0, Math.PI / 180) : '', animRotExpr(c, at0)].filter(Boolean).join('+');
    const sb = scaleBase ?? maxScale(c, dyn);
    const sxb = scaleXBase ?? maxScaleX(c, dyn);
    const syb = scaleYBase ?? maxScaleY(c, dyn);
    // k < 1: a camada foi preparada menor que o maior tamanho (no tamanho original da mídia); cada quadro amplia 1/k
    const su = [animScaleExpr(c, at0), dyn.scale ? `(${kfExpr(dyn.scale, at0)})/${n4(sb)}` : '', k < 0.9999 ? n4(1 / k) : ''].filter(Boolean);
    const sx = [...su, dyn.scaleX ? `(${kfExpr(dyn.scaleX, at0)})/${n4(sxb)}` : ''].filter(Boolean).map((e) => `(${e})`).join('*');
    const sy = [...su, dyn.scaleY ? `(${kfExpr(dyn.scaleY, at0)})/${n4(syb)}` : ''].filter(Boolean).map((e) => `(${e})`).join('*');
    const hasDynStretch = !!(dyn.scaleX || dyn.scaleY);
    const hasRot = Math.abs(staticRot) > 1e-4 || !!rx;
    if (hasDynStretch && hasRot) {
      const wExpr = sx ? `max(2,trunc(iw*${sx}))` : 'iw';
      const hExpr = sy ? `max(2,trunc(ih*${sy}))` : 'ih';
      f.push(`scale=w='${wExpr}':h='${hExpr}':eval=frame`);
      // caixa fixa (o rotate fixa o tamanho no 1º quadro); par, porque o pad arredonda para baixo em formatos 4:2:0
      const up2 = (v) => Math.ceil(v / 2) * 2;
      if (boxW && boxH) f.push(`pad=w='max(iw,${up2(boxW)})':h='max(ih,${up2(boxH)})':x='(ow-iw)/2':y='(oh-ih)/2':color=0x00000000:eval=frame`);
      if (Math.abs(staticRot) > 1e-4) f.push(`rotate=a=${n4(staticRot)}:c=black@0:ow=rotw(${n4(staticRot)}):oh=roth(${n4(staticRot)})`);
      if (rx) f.push(`rotate=a='${rx}':c=black@0:ow='hypot(iw,ih)':oh='ow'`);
    } else {
      if (Math.abs(staticRot) > 1e-4) f.push(`rotate=a=${n4(staticRot)}:c=black@0:ow=rotw(${n4(staticRot)}):oh=roth(${n4(staticRot)})`);
      if (rx) f.push(`rotate=a='${rx}':c=black@0:ow='hypot(iw,ih)':oh='ow'`);
      if (sx || sy) {
        const wExpr = sx ? `max(2,trunc(iw*${sx}))` : 'iw';
        const hExpr = sy ? `max(2,trunc(ih*${sy}))` : 'ih';
        f.push(`scale=w='${wExpr}':h='${hExpr}':eval=frame`);
      }
    }
    return f;
  }

  // Posição (centro) com pontos de modificação + deslocamento das animações.
  function posExprs(c, dyn, at0, cx, cy) {
    const { dx, dy } = animOffsetExprs(c, at0);
    const X = dyn.x ? `${n4(W / 2)}+${W}*(${kfExpr(dyn.x, at0)})` : n4(cx);
    const Y = dyn.y ? `${n4(H / 2)}+${H}*(${kfExpr(dyn.y, at0)})` : n4(cy);
    return { x: `${X}-w/2${dx ? `+${W}*(${dx})` : ''}`, y: `${Y}-h/2${dy ? `+${H}*(${dy})` : ''}` };
  }

  // Espelhar → girar → opacidade → (deslocar no tempo) → animações.
  // t0: onde o fluxo da camada começa; at0: onde o clipe "de verdade" começa (difere quando há
  // quadros parados antes dele, nas transições das faixas de cima).
  // girado: espelhar/girar fixos já feitos na parte estática (preChain com girarAqui).
  // pivo: filtros da margem do pivô (shared/pivo.js) — depois de espelhar, antes de girar/escalar
  function placeChain(c, t0, at0 = t0, boxW = null, boxH = null, girado = false, k = 1, pivo = []) {
    const f = [];
    const tf = c.transform || {};
    const dyn = c.__dyn || {};
    if (tf.flipH && !girado) f.push('hflip');
    if (tf.flipV && !girado) f.push('vflip');
    f.push(...pivo);
    const rot = ((tf.rotation || 0) * Math.PI) / 180;
    const staticRot = !dyn.rotation && Math.abs(rot) > 1e-4 ? rot : 0;
    const hasDynStretch = !!(dyn.scaleX || dyn.scaleY);
    if (staticRot && !hasDynStretch && !girado) f.push(...giroFixo(staticRot));
    const op = c.opacity ?? 1;
    if (!dyn.opacity && op < 0.999) f.push(`colorchannelmixer=aa=${n4(op)}`);
    f.push(...naGrade(t0));
    f.push(...motionFilters(c, dyn, at0, { rotBaked: false, staticRot: hasDynStretch ? staticRot : 0, boxW, boxH, alfa: animFades(c, at0, FPS), k }));
    const cx = W / 2 + (tf.x || 0) * W, cy = H / 2 + (tf.y || 0) * H;
    return { f, ...posExprs(c, dyn, at0, cx, cy) };
  }

  function audioPart(c, m) {
    // com "Voz": o trecho já limpo (mesma cadeia da prévia) entra no lugar do áudio da mídia
    const idx = vozAssets[c.id] ? addInput(['-i', vozAssets[c.id].path]) : inputFor(c, m);
    const f = ['asetpts=PTS-STARTPTS'];
    let sp = c.speed || 1;
    const tempos = [];
    while (sp > 2.0001) { tempos.push(2); sp /= 2; }
    while (sp < 0.4999) { tempos.push(0.5); sp /= 0.5; }
    if (Math.abs(sp - 1) > 1e-3) tempos.push(sp);
    for (const t of tempos) f.push(`atempo=${n4(t)}`);
    f.push(`atrim=duration=${r3(c.duration)}`, 'asetpts=PTS-STARTPTS');
    f.push('aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo');
    f.push(...audioFxFilters(c.audioFx)); // eco, robô, telefone, voz fina/grossa, graves/agudos…
    const vol = c.volume ?? 1;
    if (c.__dyn?.volume) f.push(`volume=volume='${kfExpr(c.__dyn.volume, 0)}':eval=frame`); // volume com pontos de modificação
    else if (Math.abs(vol - 1) > 1e-3) f.push(`volume=${n4(vol)}`);
    if (c.fadeIn > 0) f.push(`afade=t=in:st=0:d=${r3(Math.min(c.fadeIn, c.duration))}`);
    if (c.fadeOut > 0) f.push(`afade=t=out:st=${r3(Math.max(0, c.duration - c.fadeOut))}:d=${r3(Math.min(c.fadeOut, c.duration))}`);
    if (c.start > 0.0005) f.push(`adelay=delays=${Math.round(c.start * 1000)}:all=1`);
    const l = L('a');
    F.push(`[${idx}:a]${f.join(',')}[${l}]`);
    audio.push(l);
  }

  const main = mainTrack(project);
  let mainClips = main ? main.clips : [];
  let base = null;

  if (wantVideo) {
    // ---- Faixa principal: cada clipe vira um quadro completo, depois concat/xfade ----
    const parts = [];
    const showMain = main && !main.hidden;
    let tdqs = mainClips.map((c, i) => {
      const dur = q(c.duration);
      const td = transitionDuration(c, mainClips[i + 1]);
      return td > 0 ? Math.min(Math.round(td * FPS) / FPS, dur / 2) : 0;
    });
    // exportar em partes: os mesmos quadros da exportação inteira — conta onde cada clipe começa (em quadros, como
    // o concat/xfade abaixo), fica só com os que tocam a janela e corta o começo do primeiro
    let corteMain = 0;
    if (janela) {
      const ini = [];
      let S = 0;
      mainClips.forEach((c, i) => { ini.push(S); S += Math.round(q(c.duration) * FPS) - Math.round(tdqs[i] * FPS); });
      const fica = mainClips.map((c, i) => ini[i] + Math.round(q(c.duration) * FPS) > A0 && ini[i] < B0);
      const prim = fica.indexOf(true);
      corteMain = prim >= 0 ? Math.max(0, A0 - ini[prim]) / FPS : 0;
      tdqs = tdqs.filter((_, i) => fica[i]);
      mainClips = mainClips.filter((_, i) => fica[i]);
    }
    mainClips.forEach((c, i) => {
      const m = mediaOf(c);
      const corte = i === 0 ? corteMain : 0;
      const dur = q(c.duration) - corte;
      const tdq = tdqs[i];
      const outT = tdq > 0 && isCamTransition(c.transition?.id) ? { id: c.transition.id, d: tdq } : null;
      const prevC = mainClips[i - 1];
      const inT = i > 0 && tdqs[i - 1] > 0 && isCamTransition(prevC.transition?.id) ? { id: prevC.transition.id, d: tdqs[i - 1] } : null;
      const camL = outT || inT ? L('cv') : null;
      const lab = camL ? L('vr') : L('v');
      if (!showMain || !usable(m) || (m.type !== 'video' && m.type !== 'image')) {
        F.push(`color=c=${hex(bgDefault.color)}:s=${W}x${H}:r=${FPS}:d=${r3(dur)},format=yuv420p,setsar=1,settb=1/${FPS}[${lab}]`);
      } else {
        c = clipVisivel(c, m, W, H);   // escala grande parada: só a parte visível
        const idx = inputFor(c, m, corte);
        const bg = c.bg || bgDefault;
        const { f: pre, stat, loop, wMax, hMax, k, girado } = preChain(c, m, { girarAqui: bg.type !== 'blur', corte });
        // com corte, o fluxo começa no meio do clipe: as animações contam a partir do começo de verdade (−corte)
        const pl = placeChain(c, 0, -corte, wMax, hMax, girado, k);
        const bgL = L('bg'), fgL = L('fg');
        if (bg.type === 'blur') {
          const a = L('s'), b = L('s');
          // imagem: separa antes do laço, assim o desfoque é calculado uma única vez
          F.push(`[${idx}:v]${(stat || pre).join(',') || 'null'},split=2[${a}][${b}]`);
          // o desfoque é de baixa frequência: calcular em 1/4 do tamanho e ampliar dá o mesmo resultado
          const sigma = Math.max(1, (bg.blur ?? 0.03) * H);
          const bw = even(W / 4), bh = even(H / 4);
          F.push(`[${b}]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},gblur=sigma=${(sigma / 4).toFixed(2)},scale=${W}:${H}:flags=bicubic${loop ? `,${loop.join(',')}` : ''}[${bgL}]`);
          F.push(`[${a}]${[...(loop || []), ...pl.f].join(',') || 'null'}[${fgL}]`);
        } else {
          F.push(`color=c=${hex(bg.color)}:s=${W}x${H}:r=${FPS}:d=${r3(dur)}[${bgL}]`);
          F.push(`[${idx}:v]${[...pre, ...pl.f].join(',')}[${fgL}]`);
        }
        F.push(`[${bgL}][${fgL}]overlay=x='${pl.x}':y='${pl.y}':eof_action=pass:format=auto,trim=duration=${r3(dur)},setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p,setsar=1,settb=1/${FPS}[${lab}]`);
      }
      if (camL) F.push(...camClipChain({ inL: lab, outL: camL, inc: inT, out: outT, dur, FPS, H, L }));
      parts.push({ lab: camL || lab, dur, tdq, tid: c.transition?.id });
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
          // (o concat devolve em microssegundos: de volta a 1/FPS, como o resto — o xfade exige a mesma base)
          F.push(`${group.map((g) => `[${g}]`).join('')}concat=n=${group.length}:v=1:a=0,settb=1/${FPS}[${gl}]`);
        }
        if (acc === null) { acc = gl; accDur = groupDur; }
        else {
          const l = L('x');
          const tr = isCamTransition(prevId) ? `custom:expr='${camMixExpr(prevId)}'` : prevId;
          F.push(`[${acc}][${gl}]xfade=transition=${tr}:duration=${tq(prevTd)}:offset=${tq(accDur - prevTd)}[${l}]`);
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

    // Camada de um clipe (texto, forma, foto ou vídeo) no tempo do fluxo "base".
    // t0: onde o fluxo da camada começa; pre/post: segundos de quadro parado antes/depois do clipe
    // (usados nas transições entre clipes das faixas de cima).
    function layerOf(c, t0, pre = 0, post = 0) {
      const at0 = t0 + pre;
      if (c.type === 'text' || c.type === 'shape') {
        const a = textAssets[c.id];
        if (!a) return null;
        const dyn = c.__dyn || {};
        const idx = addInput(['-i', a.path]);
        // perspectiva e pivô: o PNG vem sem giro (exporter); a distorção e a margem que põe o pivô no centro são
        // feitas uma vez, antes do laço
        const comPivo = temPivo(c.transform), comPersp = temPersp(c.transform) && c.type === 'shape';
        const bw = a.bw ?? a.w, bh = a.bh ?? a.h;
        const pe = comPersp ? filtroPerspectiva(c.transform.persp, bw, bh, a.w, a.h) : { M: 0, f: [] };
        const pp = comPivo ? padPivo(pivoDe(c.transform).px, pivoDe(c.transform).py, bw, bh) : { dW: 0, dH: 0 };
        const f = ['format=rgba', ...pe.f, ...(comPivo ? filtroPivo(pp) : []), ...loopFor(c.duration + pre + post + 0.05), ...naGrade(t0)];
        // o PNG já vem com escala/giro/opacidade fixos; o que muda (pontos de modificação) é aplicado aqui
        const rotBaked = !dyn.rotation && !dyn.scaleX && !dyn.scaleY && !comPivo && !comPersp;
        const staticRot = !rotBaked && !dyn.rotation ? ((c.transform?.rotation || 0) * Math.PI) / 180 : 0;
        f.push(...motionFilters(c, dyn, at0, {
          rotBaked,
          staticRot: Math.abs(staticRot) > 1e-4 ? staticRot : 0,
          scaleBase: a.scale ?? maxScale(c, dyn),
          scaleXBase: a.scaleX ?? maxScaleX(c, dyn),
          scaleYBase: a.scaleY ?? maxScaleY(c, dyn),
          boxW: a.w + 2 * pe.M + pp.dW, boxH: a.h + 2 * pe.M + pp.dH,
          alfa: animFades(c, at0, FPS),
        }));
        const l = L('t');
        F.push(`[${idx}:v]${f.join(',')}[${l}]`);
        return { l, ...posExprs(c, dyn, at0, a.cx, a.cy) };
      }
      const m = mediaOf(c);
      if (!usable(m)) return null;
      c = clipVisivel(c, m, W, H);   // escala grande parada: só a parte visível
      // exportar em partes: vídeo que começou antes da janela pula o pedaço anterior (não decodifica para jogar fora)
      const corte = m.type === 'video' && pre === 0 && t0 < 0 ? Math.min(-t0, Math.max(0, c.duration - 1 / FPS)) : 0;
      const idx = inputFor(c, m, corte);
      // (fotos: o laço, os trechos de cor e o giro fixo já vêm no preChain; os quadros parados entram depois)
      // com sombra, o giro fica para depois dela (a sombra gira junto com a camada, como na prévia); com pivô, depois
      // da margem que põe o pivô no centro
      // (perspectiva: idem — depois de espelhar, antes do pivô e do giro)
      const sb = sombraDe(c);
      const comPivo = temPivo(c.transform), comPersp = temPersp(c.transform);
      const pc = preChain(c, m, { girarAqui: !sb && !comPivo && !comPersp, corte });
      const { k, girado } = pc;
      const P = sb ? sombraPx(sb, pc.w, pc.h).P : 0;
      const pe = comPersp ? filtroPerspectiva(c.transform.persp, pc.w, pc.h, pc.w + 2 * P, pc.h + 2 * P) : { M: 0, f: [] };
      const pp = comPivo ? padPivo(pivoDe(c.transform).px, pivoDe(c.transform).py, pc.w, pc.h) : { dW: 0, dH: 0 };
      const pivo = [...pe.f, ...(comPivo ? filtroPivo(pp) : [])];
      // as caixas fixas (giro com esticar) crescem junto com as margens (sombra, perspectiva, pivô)
      const wMax = pc.wMax * ((pc.w + 2 * P + 2 * pe.M + pp.dW) / pc.w), hMax = pc.hMax * ((pc.h + 2 * P + 2 * pe.M + pp.dH) / pc.h);
      const tpad = pre > 0 || post > 0 ? [`tpad=start_mode=clone:start_duration=${r3(pre)}:stop_mode=clone:stop_duration=${r3(post)}`] : [];
      const l = L('o');
      if (!sb) {
        const pl = placeChain(c, t0 + corte, at0, wMax, hMax, girado, k, pivo);
        F.push(`[${idx}:v]${[...pc.f, ...tpad, ...pl.f].join(',')}[${l}]`);
        return { l, x: pl.x, y: pl.y };
      }
      // Sombra: a camada (sem giro/animação) ganha uma margem com a sombra — cor da sombra no lugar das cores, alfa ×
      // opacidade, deslocada e desfocada — e a camada por cima. A margem é igual dos dois lados: o centro não muda.
      // Numa foto sem ajustes de cor que mudam, é feita uma vez só, antes do laço.
      const { sigma, dx, dy } = sombraPx(sb, pc.w, pc.h);
      const fixa = !!pc.stat && !pc.passos;
      const [cr, cg, cb] = [1, 3, 5].map((i) => parseInt(hex(sb.cor).slice(i, i + 2), 16) || 0);
      const s0 = L('sa'), s1 = L('sb'), s2 = L('sc'), s3 = L('sd');
      F.push(`[${idx}:v]${(fixa ? pc.stat : pc.f).join(',') || 'null'},split[${s0}][${s1}]`);
      F.push(`[${s1}]lutrgb=r=${cr}:g=${cg}:b=${cb}:a=val*${n4(Math.max(0, Math.min(1, sb.opacidade)))},` +
        `pad=${pc.w + 2 * P}:${pc.h + 2 * P}:${P + Math.round(dx)}:${P + Math.round(dy)}:color=${hex(sb.cor)}@0,` +
        `format=gbrap,gblur=sigma=${Math.max(0.01, sigma).toFixed(2)},format=rgba[${s2}]`);
      F.push(`[${s2}][${s0}]overlay=${P}:${P}:format=auto[${s3}]`);
      const pl = placeChain(c, t0 + corte, at0, wMax, hMax, girado, k, pivo);
      F.push(`[${s3}]${[...(fixa ? pc.loop : []), ...tpad, ...pl.f].join(',') || 'null'}[${l}]`);
      return { l, x: pl.x, y: pl.y };
    }

    // Clipes encostados com transição (A→B→C…): cada um vai num quadro transparente do tamanho da tela (o
    // pedaço de tempo dele) e os pedaços são unidos com xfade — A segura o último quadro e B o primeiro durante
    // a mistura. Misturando com alfa pré-multiplicado o resultado é exatamente (1−p)·(fundo+A) + p·(fundo+B),
    // e a cadeia entra UMA vez sobre o fundo. (Antes o fundo era dividido em um pedaço por clipe: com dezenas de
    // fotos o FFmpeg produzia o fundo muito à frente e guardava os quadros na memória — a exportação ficava
    // parada em 0% enquanto a memória subia para dezenas de GB.)
    function chainTransition(X, chain) {
      const n = chain.length;
      const TF = Math.round(T * FPS);
      const cuts = [], ds = [];
      for (let i = 1; i < n; i++) {
        cuts.push(Math.round(chain[i].start * FPS));
        ds.push(2 * Math.max(1, Math.round((overlayTransDur(chain[i - 1], chain[i]) * FPS) / 2)));
      }
      const segs = [];
      for (let i = 0; i < n; i++) {
        const c = chain[i];
        const aF = i === 0 ? 0 : cuts[i - 1] - ds[i - 1] / 2;
        // o último pedaço vai 2 quadros além do fim (o xfade come um quadro; o excesso é cortado na saída)
        const bF = i === n - 1 ? TF + 2 : cuts[i] + ds[i] / 2;
        const pre = i === 0 ? 0 : ds[i - 1] / 2 / FPS;
        const post = i === n - 1 ? 0 : ds[i] / 2 / FPS;
        const t0 = i === 0 ? c.start : 0;
        const sg = L('sx'), out = L('sy');
        F.push(`color=c=black@0:s=${W}x${H}:r=${FPS},format=gbrap,trim=end_frame=${bF - aF},setpts=PTS-STARTPTS,setsar=1[${sg}]`);
        const ly = layerOf(c, t0, pre, post);
        if (ly) F.push(`[${sg}][${ly.l}]overlay=x='${ly.x}':y='${ly.y}':eof_action=pass:enable='between(t,${r3(t0)},${r3(t0 + pre + c.duration + post)})':format=auto,premultiply=inplace=1,settb=1/${FPS}[${out}]`);
        else F.push(`[${sg}]settb=1/${FPS}[${out}]`);
        segs.push(out);
      }
      let acc = segs[0];
      for (let i = 1; i < n; i++) {
        const l = L('xo');
        F.push(`[${acc}][${segs[i]}]xfade=transition=${chain[i - 1].transition.id}:duration=${tq(ds[i - 1] / FPS)}:offset=${tq((cuts[i - 1] - ds[i - 1] / 2) / FPS)}[${l}]`);
        acc = l;
      }
      const u = L('xu'), o = L('xo');
      F.push(`[${acc}]unpremultiply=inplace=1[${u}]`);
      F.push(`[${X}][${u}]overlay=eof_action=pass:format=auto,format=yuv420p,setsar=1,settb=1/${FPS}[${o}]`);
      return o;
    }

    // ---- Faixas acima da principal, de baixo para cima ----
    const mi = main ? project.tracks.indexOf(main) : project.tracks.length;
    for (let ti = mi - 1; ti >= 0; ti--) {
      const tr = project.tracks[ti];
      if (tr.hidden || tr.kind === 'audio') continue;
      // cadeias com transição, aparadas no trecho exportado: saem do fim os clipes cuja transição passaria do fim e
      // (exportar em partes) do começo os que já terminaram antes da janela — o resto da cadeia segue com as transições
      const TFr = Math.round(T * FPS);
      const meiaTr = (a, b) => Math.max(1, Math.round((overlayTransDur(a, b) * FPS) / 2));
      const aparar = (ch) => {
        let fim = ch.length, ini = 0;
        while (fim > 1 && Math.round(ch[fim - 1].start * FPS) + meiaTr(ch[fim - 2], ch[fim - 1]) > TFr) fim--;
        while (fim - ini > 1 && Math.round(ch[ini + 1].start * FPS) + meiaTr(ch[ini], ch[ini + 1]) <= 0) ini++;
        return ch.slice(ini, fim);
      };
      const chains = tr.kind === 'effect' ? [] : overlayChains(tr).map(aparar).filter((ch) => ch.length > 1);
      const chained = new Set(chains.flat().map((c) => c.id));
      for (const ch of chains) base = chainTransition(base, ch);
      for (const c of [...tr.clips].sort((a, b) => a.start - b.start)) {
        if (chained.has(c.id)) continue;
        const s = c.start, e = c.start + c.duration;
        if (e <= 0 || s >= T) continue;
        const en = `between(t,${r3(s)},${r3(e)})`;
        if (c.type === 'effect') {
          const def = c.effect?.kind === 'filter' ? null : effectDef(c.effect?.id);
          // efeito só numa área: calculado num recorte do tamanho da área (veja shared/area.js)
          const bb = def && c.area?.on ? areaCaixa(c.area, W, H) : null;
          if (!isSegmentEffect(def) && !bb) {
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
          const EW = bb ? bb.w : W, EH = bb ? bb.h : H;   // tamanho do "quadro" que o efeito enxerga
          const opsF = ffFilters(effectClipOps(c), { w: EW, h: EH, t0: 0 });
          const needsRgb = opsF.some((x) => x.startsWith('colorchannelmixer') || x.startsWith('lutrgb'));
          const opsTxt = opsF.length ? `,${needsRgb ? 'format=gbrp,' : ''}${opsF.join(',')}` : '';
          let orig = null;
          if (bb) {
            const t = L('fm'), x = L('ax');
            orig = L('ao');
            F.push(`[${lm}]trim=start_frame=${a}:end_frame=${b},setpts=PTS-STARTPTS,split[${orig}][${x}]`);
            F.push(`[${x}]crop=${bb.w}:${bb.h}:${bb.x}:${bb.y}${opsTxt}[${t}]`);
            m = t;
          } else F.push(`[${lm}]trim=start_frame=${a}:end_frame=${b},setpts=PTS-STARTPTS${opsTxt}[${m}]`);
          if (def.ff) {
            const o = L('fx');
            F.push(def.ff({ inL: m, outL: o, W: EW, H: EH, FPS, D, k, seed: seedOf(c.id), L }));
            m = o;
          }
          const asset = fxAssets[c.id];
          if (def.layer && asset) {
            const idx = addInput(['-framerate', String(FPS), '-start_number', '0', '-i', asset.pattern]);
            const o = L('fl'), y = L('ly');
            const up = asset.scaled ? `scale=${EW}:${EH}:flags=bicubic,` : '';
            if (def.layer.blend === 'screen') {
              const x = L('lx');
              F.push(`[${m}]format=gbrp[${x}];[${idx}:v]${up}format=gbrp,setpts=PTS-STARTPTS[${y}];[${x}][${y}]blend=all_mode=screen[${o}]`);
            } else {
              F.push(`[${idx}:v]${up}format=rgba,setpts=PTS-STARTPTS[${y}];[${m}][${y}]overlay=eof_action=pass:format=auto[${o}]`);
            }
            m = o;
          }
          if (bb) {
            // volta para o quadro: o recorte com efeito entra por cima do original, com a máscara de bordas suaves
            const mk = areaAssets[c.id];
            const fa = L('fa'), r = L('ar');
            if (mk) {
              const mi = addInput(['-i', mk.path]);
              const g = L('mg'), x = L('mx');
              F.push(`[${mi}:v]scale=${bb.w}:${bb.h},format=gray[${g}];[${m}]format=rgba[${x}];[${x}][${g}]alphamerge[${fa}]`);
            } else F.push(`[${m}]format=rgba[${fa}]`);
            F.push(`[${orig}][${fa}]overlay=${bb.x}:${bb.y}:format=auto[${r}]`);
            m = r;
          }
          const me = L('sg');
          F.push(`[${m}]format=yuv420p,setsar=1[${me}]`);
          segs.push(me);
          if (post) { const l = L('sg'); F.push(`[${lq}]trim=start_frame=${b},setpts=PTS-STARTPTS,format=yuv420p,setsar=1[${l}]`); segs.push(l); }
          const nb = L('b');
          F.push(segs.length > 1 ? `${segs.map((x) => `[${x}]`).join('')}concat=n=${segs.length}:v=1:a=0,settb=1/${FPS}[${nb}]` : `[${segs[0]}]null[${nb}]`);
          base = nb;
        } else if (c.type === 'text' || c.type === 'shape' || c.type === 'video' || c.type === 'image') {
          const ly = layerOf(c, s);
          if (!ly) continue;
          const l = L('b');
          F.push(`[${base}][${ly.l}]overlay=x='${ly.x}':y='${ly.y}':eof_action=pass:enable='${en}'[${l}]`);
          base = l;
        }
      }
    }

    // capa: a imagem escolhida vira o 1º quadro (é o que as redes e o Windows mostram como miniatura)
    if (coverAsset?.path && fmt.kind === 'video') {
      const ci = addInput(['-i', coverAsset.path]);
      const cv = L('cv'), bc = L('b');
      F.push(`[${ci}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuva420p[${cv}]`);
      F.push(`[${base}][${cv}]overlay=0:0:eof_action=repeat:enable='eq(n,0)'[${bc}]`);
      base = bc;
    }
    if (fmt.kind === 'gif') {
      const gw = even(Math.min(W, W >= H ? 960 : 540));
      F.push(`[${base}]fps=${Math.min(FPS, 15)},scale=${gw}:-2:flags=lanczos,split[g1][g2];[g1]palettegen=stats_mode=diff[gp];[g2][gp]paletteuse=dither=bayer:bayer_scale=4[vout]`);
    } else F.push(`[${base}]format=yuv420p[vout]`);
  }

  // ---- Áudio de todas as faixas ----
  if (wantAudio && !soVideo) {
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
  // Com out.vKbps (taxa de bits alvo) o tamanho final fica previsível; sem ele, usa CRF.
  const crf = { high: 18, standard: 21, small: 26 }[out.quality] ?? 21;
  const nv = out.hw === 'nvenc';
  const vk = out.vKbps ? Math.round(out.vKbps) : 0;
  const rate = vk ? ['-b:v', `${vk}k`, '-maxrate', `${Math.round(vk * 1.5)}k`, '-bufsize', `${vk * 2}k`] : null;
  const ak = out.aKbps ? `${Math.round(out.aKbps)}k` : null;
  const v = [], a = [];
  switch (fmt.id) {
    case 'mp4': case 'mov': case 'mkv':
      if (nv) v.push('-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', ...(rate || ['-cq', String(crf + 2), '-b:v', '0']), '-pix_fmt', 'yuv420p');
      else v.push('-c:v', 'libx264', '-preset', { high: 'medium', small: 'veryfast' }[out.quality] || 'faster', ...(rate || ['-crf', String(crf)]), '-pix_fmt', 'yuv420p');
      if (fmt.id !== 'mkv') v.push('-movflags', '+faststart');
      a.push('-c:a', 'aac', '-b:a', ak || '192k');
      break;
    case 'mp4_hevc': case 'mov_hevc':
      if (nv) v.push('-c:v', 'hevc_nvenc', '-preset', 'p5', '-rc', 'vbr', ...(rate || ['-cq', String(crf + 4), '-b:v', '0']), '-pix_fmt', 'yuv420p');
      else v.push('-c:v', 'libx265', '-preset', { high: 'medium', small: 'veryfast' }[out.quality] || 'faster', ...(rate || ['-crf', String(crf + 5)]), '-pix_fmt', 'yuv420p');
      v.push('-tag:v', 'hvc1', '-movflags', '+faststart');
      a.push('-c:a', 'aac', '-b:a', ak || '192k');
      break;
    case 'prores':
      v.push('-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le');
      a.push('-c:a', 'pcm_s16le');
      break;
    case 'webm':
      if (vk) v.push('-c:v', 'libvpx-vp9', '-b:v', `${vk}k`, '-minrate', `${Math.round(vk * 0.5)}k`, '-maxrate', `${Math.round(vk * 1.45)}k`);
      else v.push('-c:v', 'libvpx-vp9', '-crf', String(crf + 12), '-b:v', '0');
      v.push('-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', '-pix_fmt', 'yuv420p');
      a.push('-c:a', 'libopus', '-b:a', ak || '160k');
      break;
    case 'avi':
      v.push('-c:v', 'mpeg4', '-vtag', 'xvid', ...(vk ? ['-b:v', `${vk}k`] : ['-q:v', String({ high: 2, standard: 3, small: 5 }[out.quality] ?? 3)]));
      a.push('-c:a', 'libmp3lame', '-b:a', ak || '192k');
      break;
    case 'gif':
      v.push('-loop', '0');
      break;
    case 'mp3': a.push('-c:a', 'libmp3lame', '-b:a', ak || { high: '320k', standard: '192k', small: '128k' }[out.quality] || '192k'); break;
    case 'wav': a.push('-c:a', 'pcm_s16le'); break;
    case 'm4a': a.push('-c:a', 'aac', '-b:a', ak || { high: '256k', standard: '192k', small: '128k' }[out.quality] || '192k'); break;
    case 'flac': a.push('-c:a', 'flac'); break;
    default: break;
  }

  const args = ['-y', '-hide_banner', '-nostdin', ...inputs, '-/filter_complex', graphPath];
  if (wantVideo) args.push('-map', '[vout]', ...v, '-r', String(fmt.kind === 'gif' ? Math.min(FPS, 15) : FPS));
  if (wantAudio && !soVideo) args.push('-map', '[aout]', ...a, '-ar', '48000');
  // uma parte termina num número exato de quadros: `-t` arredondado para milésimos (30,1667 → 30,167 s) dava um
  // quadro a mais, e cada parte assim empurrava o resto do vídeo emendado um quadro para trás
  if (janela) args.push('-frames:v', String(Math.max(1, B0 - A0)));
  else args.push('-t', r3(T));
  args.push('-progress', 'pipe:1', '-nostats', '-loglevel', 'error', outPath);
  return { args, graph: rgbSafe(F.join(';\n')), duration: T };
}
