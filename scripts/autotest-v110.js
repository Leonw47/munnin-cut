// Teste da 1.10: zoom para fora do reprodutor + cor do fundo, escala até 2000% (recorte da parte visível),
// biblioteca em páginas, efeito aplicado só numa área e cortar silêncios.
const { useStore, startExport, engine } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const info = await window.api.info();
const DIR = info.tempDir.replace(/[\\/]munnin-cut-jobs$/, '/munnin-cut-test').replace(/\\/g, '/');
const V = DIR + '/v110';
const res = {};
const check = (name, cond, i) => { res[name] = cond ? 'OK' : `FALHOU ${i !== undefined ? JSON.stringify(i) : ''}`; };
const waitFor = async (fn, ms = 15000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(100); } return null; };
const pronto = (id) => waitFor(() => S().meta[id]?.status === 'ready', 60000);
const clickEl = (el) => el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const allClips = () => S().project.tracks.flatMap((t) => t.clips);
const only = (window.__mcOnly || '').split(',').filter(Boolean);
const parte = (n) => !only.length || only.includes(n);
async function quadro(path, t, w = 0) {
  const v = document.createElement('video');
  v.muted = true; v.crossOrigin = 'anonymous'; v.preload = 'auto';
  v.src = 'media://local/' + encodeURIComponent(path);
  await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('video ' + path)); });
  v.currentTime = t;
  await new Promise((r) => { v.onseeked = r; });
  await sleep(80);
  const W = w || v.videoWidth, H = Math.round((v.videoHeight / v.videoWidth) * W);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(v, 0, 0, W, H);
  const dur = v.duration;
  v.removeAttribute('src'); v.load();
  x.dur = dur;
  return x;
}
const px = (ctx, fx, fy) => { const { width: W, height: H } = ctx.canvas; return [...ctx.getImageData(Math.round(fx * (W - 1)), Math.round(fy * (H - 1)), 1, 1).data].slice(0, 3); };
const dif = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const previa = (w = 320) => { const h = Math.round((engine.canvas.height / engine.canvas.width) * w); const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(engine.canvas, 0, 0, w, h); return x; };

// ---------- 1) zoom para fora + cor do fundo ----------
if (parte('zoom')) {
  S().newProject('16:9');
  await sleep(300);
  const [img] = await S().importPaths([DIR + '/c.png']);
  await pronto(img);
  const cid = S().addMedia(img, { target: 'overlay' });
  S().updateClip(cid, (c) => { c.transform.x = 0.6; });   // metade para fora da tela
  S().select({ type: 'clip', id: cid });
  await sleep(300);
  const w0 = engine.canvas.getBoundingClientRect().width;
  const botao = [...document.querySelectorAll('.player-foot .btn')].find((b) => /Ajustar|%/.test(b.textContent));
  clickEl(botao); await sleep(150);
  clickEl([...document.querySelectorAll('.dd-menu .dd-item')].find((b) => /^50%/.test(b.textContent)));
  await sleep(500);
  const w1 = engine.canvas.getBoundingClientRect().width;
  check('zoom_50', Math.abs(w1 / w0 - 0.5) < 0.03, [w0, w1]);
  check('zoom_moldura_e_contornos', !!document.querySelector('.player-stage svg rect[stroke="#19d3df88"]'));
  // a caixa do clipe aparece e as alças de fora da tela dão para pegar
  const handles = [...document.querySelectorAll('.player-stage svg rect[width="10"]')];
  const st = document.querySelector('.player-stage').getBoundingClientRect();
  const fora = handles.filter((h) => { const r = h.getBoundingClientRect(); return r.left > st.left && r.right < st.right && r.left > engine.canvas.getBoundingClientRect().right; });
  check('zoom_alcas_fora_da_tela_visiveis', fora.length >= 1, handles.length);
  // cor do fundo
  clickEl(document.querySelector('.player-foot .icon-btn[title^="Cor do fundo"]')); await sleep(150);
  clickEl([...document.querySelectorAll('.dd-menu .dd-item')].find((b) => /^Claro$/.test(b.textContent.trim())));
  await sleep(200);
  check('fundo_editor_claro', getComputedStyle(document.querySelector('.player-stage')).backgroundColor === 'rgb(217, 217, 222)', getComputedStyle(document.querySelector('.player-stage')).backgroundColor);
  await window.api.testCapture('v110_01_zoom_fora');
  // Ctrl + roda volta a aproximar
  document.querySelector('.player-stage').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true }));
  await sleep(400);
  check('zoom_ctrl_roda', Math.abs(engine.canvas.getBoundingClientRect().width / w0 - 0.75) < 0.03, engine.canvas.getBoundingClientRect().width / w0);
  // volta ao normal para os outros testes
  try { localStorage.setItem('mc.pzoom', '1'); localStorage.removeItem('mc.stagebg'); } catch { /* ignore */ }
}

// ---------- 2) escala 2000%: prévia = exportação, sem camada gigante ----------
if (parte('escala')) {
  S().newProject('16:9');
  await sleep(300);
  const [img] = await S().importPaths([DIR + '/v18/IMG_3301.HEIC']);
  await pronto(img);
  const cid = S().addMedia(img);
  S().updateClip(cid, (c) => { c.transform.scale = 20; c.transform.x = 3; c.transform.y = -2; c.duration = 2; });
  S().setTime(0.5); engine.invalidate(); await sleep(800);
  const p = previa(320);
  await window.api.testCapture('v110_02_escala_2000');
  const t0 = performance.now();
  const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 720, fps: 30, quality: 'high', vKbps: 6000, aKbps: 128, outPath: V + '/escala2000.mp4', endAt: 2 }).promise;
  const seg = (performance.now() - t0) / 1000;
  check('escala_2000_exporta_rapido', r.ok && seg < 25, { ok: r.ok, err: r.error, seg });
  if (r.ok) {
    const q = await quadro(V + '/escala2000.mp4', 0.5, 320);
    let mx = 0;
    for (const [fx, fy] of [[0.2, 0.2], [0.5, 0.5], [0.8, 0.8], [0.3, 0.7], [0.7, 0.3]]) mx = Math.max(mx, dif(px(q, fx, fy), px(p, fx, fy)));
    check('escala_2000_previa_igual_exportacao', mx < 45, mx);
  }
}

// ---------- 3) biblioteca em páginas ----------
if (parte('paginas')) {
  S().newProject('16:9');
  await sleep(300);
  useStore.setState({ leftTab: 'media' });
  try { localStorage.setItem('mc.porpagina', '60'); } catch { /* ignore */ }
  const nomes = Array.from({ length: 70 }, (_, i) => `${V}/lote/img_${String(i + 1).padStart(2, '0')}.png`);
  await S().importPaths(nomes);
  await sleep(600);
  const cards = document.querySelectorAll('.media-card').length;
  check('paginas_mostra_so_uma', cards === 10 || cards === 60, cards);   // importou → vai para a última página (10)
  const pg = document.querySelector('.paginador');
  check('paginas_paginador', !!pg && /de 70 mídias/.test(pg.textContent), pg?.textContent);
  clickEl([...document.querySelectorAll('.paginador .pg')].find((b) => b.textContent === '1'));
  await sleep(300);
  check('paginas_pagina_1', document.querySelectorAll('.media-card').length === 60, document.querySelectorAll('.media-card').length);
  // Ctrl+A seleciona todas (de todas as páginas)
  clickEl(document.querySelector('.media-card'));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
  await sleep(150);
  check('paginas_ctrl_a_todas', S().libSel.length === 70, S().libSel.length);
  S().libBlur();
  await window.api.testCapture('v110_03_paginas');
}

// ---------- 4) efeito só numa área ----------
if (parte('area')) {
  S().newProject('16:9');
  await sleep(300);
  const [vid] = await S().importPaths([DIR + '/a.mp4']);
  await pronto(vid);
  S().addMedia(vid);
  S().setTime(1); engine.invalidate(); await sleep(800);
  const sem = previa(320);
  // referência exportada sem efeito (comparar exportação com exportação)
  const r0 = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 360, fps: 30, quality: 'high', vKbps: 4000, aKbps: 128, outPath: V + '/area_sem.mp4', endAt: 3 }).promise;
  const semE = r0.ok ? await quadro(V + '/area_sem.mp4', 1, 320) : null;
  const eid = S().addEffect('effect', 'swirl', { time: 0 });
  S().updateClip(eid, (c) => { c.duration = 3; c.area = { on: true, forma: 'ellipse', x: 0.2, y: 0, w: 0.3, h: 0.5, suave: 20, inverter: false }; });
  S().setTime(1.5); engine.invalidate(); await sleep(400);
  S().setTime(1); engine.invalidate(); await sleep(800);
  const com = previa(320);
  const fora = dif(px(sem, 0.1, 0.1), px(com, 0.1, 0.1)) + dif(px(sem, 0.15, 0.85), px(com, 0.15, 0.85));
  let dentro = 0;
  for (const [fx, fy] of [[0.66, 0.4], [0.72, 0.6], [0.7, 0.5], [0.64, 0.55]]) dentro = Math.max(dentro, dif(px(sem, fx, fy), px(com, fx, fy)));
  check('area_previa_fora_intacta', fora < 12, fora);
  check('area_previa_dentro_muda', dentro > 30, dentro);
  S().select({ type: 'clip', id: eid });
  await sleep(300);
  check('area_no_reprodutor', !!document.querySelector('.player-stage svg ellipse'));
  await window.api.testCapture('v110_04_area');
  const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 360, fps: 30, quality: 'high', vKbps: 4000, aKbps: 128, outPath: V + '/area.mp4', endAt: 3 }).promise;
  check('area_exporta', r.ok, r.error);
  if (r.ok) {
    const q = await quadro(V + '/area.mp4', 1, 320);
    let foraE = 0;
    for (const [fx, fy] of [[0.1, 0.1], [0.15, 0.85], [0.3, 0.5], [0.95, 0.5], [0.5, 0.05]]) foraE = Math.max(foraE, dif(px(semE, fx, fy), px(q, fx, fy)));
    let dentroE = 0;
    for (const [fx, fy] of [[0.66, 0.4], [0.72, 0.6], [0.7, 0.5], [0.64, 0.55]]) dentroE = Math.max(dentroE, dif(px(semE, fx, fy), px(q, fx, fy)));
    check('area_exportacao_fora_intacta', foraE < 12, foraE);
    check('area_exportacao_dentro_muda', dentroE > 30, dentroE);
  }
  // camada (fogo) numa área também exporta
  S().updateClip(eid, (c) => { c.effect.id = 'fire'; });
  const r2 = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 360, fps: 30, quality: 'standard', vKbps: 2000, aKbps: 128, outPath: V + '/area_fogo.mp4', endAt: 3 }).promise;
  check('area_camada_exporta', r2.ok, r2.error);
}

// ---------- 5) cortar silêncios ----------
if (parte('silencio')) {
  S().newProject('16:9');
  await sleep(300);
  const [vid] = await S().importPaths([V + '/pausas.mp4']);
  await pronto(vid);
  await waitFor(() => S().meta[vid]?.waveform, 15000);
  const cid = S().addMedia(vid);
  const d0 = allClips().find((c) => c.id === cid).duration;
  S().openSilencios(cid);
  const bt = await waitFor(() => [...document.querySelectorAll('.modal-foot .btn.primary')].find((b) => /Cortar silêncios/.test(b.textContent) && !b.disabled), 10000);
  await sleep(300);
  await window.api.testCapture('v110_05_silencios');
  const rot = document.querySelector('.modal-foot .hint')?.textContent || '';
  check('silencio_analisa', /2 silêncios/.test(rot), rot);
  clickEl(bt);
  await sleep(400);
  const main = S().project.tracks.find((t) => t.main);
  const pecas = main.clips;
  const total = pecas.reduce((s, c) => s + c.duration, 0);
  // 5,3 s com pausas de 1,5 e 0,8 s; margem padrão 0,15 s → tira ~ (1,5−0,3) + (0,8−0,3) = 1,7 s
  check('silencio_corta', pecas.length === 3 && Math.abs(d0 - total - 1.7) < 0.15, { n: pecas.length, d0, total });
  check('silencio_encosta_na_principal', Math.abs(pecas[1].start - (pecas[0].start + pecas[0].duration)) < 1e-6, pecas.map((c) => [c.start, c.duration, c.in]));
  S().undo();
  check('silencio_desfaz', S().project.tracks.find((t) => t.main).clips.length === 1);
  S().redo();
  const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 360, fps: 30, quality: 'standard', vKbps: 1500, aKbps: 128, outPath: V + '/sem_pausas.mp4' }).promise;
  if (r.ok) { const q = await quadro(V + '/sem_pausas.mp4', 0.1); check('silencio_exporta', Math.abs(q.dur - total) < 0.15, [q.dur, total]); } else check('silencio_exporta', false, r.error);
  // áudio numa faixa de áudio: o que vinha depois na mesma faixa anda para trás
  S().newProject('16:9');
  await sleep(300);
  const [au] = await S().importPaths([V + '/pausas.wav']);
  await pronto(au);
  await waitFor(() => S().meta[au]?.waveform, 15000);
  const a1 = S().addMedia(au, { target: 'audio', time: 0 });
  const a2 = S().addMedia(au, { target: 'audio', time: 6 });
  const tr = S().project.tracks.find((t) => t.clips.some((c) => c.id === a1));
  const mesma = tr.clips.some((c) => c.id === a2);
  const { n, tirado } = S().cortarSilencios(a1, [[0, 1.15], [2.35, 3.45], [4.15, 5.3]]);
  const depois = allClips().find((c) => c.id === a2);
  check('silencio_faixa_audio_puxa_o_resto', n === 3 && (!mesma || Math.abs(depois.start - (6 - tirado)) < 1e-6), { n, tirado, mesma, start: depois?.start });
}

log(res);
return res;
