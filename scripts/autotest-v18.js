// Teste da 1.8: HEIC do iPhone (grade de ladrilhos + giro), .mov HDR (cores), remover fundo branco
// (só o fundo das bordas; prévia = exportação), pesquisa e prévia do YouTube.
const { useStore, startExport, engine } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const info = await window.api.info();
const DIR = info.tempDir.replace(/[\\/]munnin-cut-jobs$/, '/munnin-cut-test').replace(/\\/g, '/');
const V = DIR + '/v18';
const res = {};
const check = (name, cond, i) => { res[name] = cond ? 'OK' : `FALHOU ${i !== undefined ? JSON.stringify(i) : ''}`; };
const waitFor = async (fn, ms = 15000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(100); } return null; };
const media = (id) => S().project.media.find((m) => m.id === id);
const pronto = (id) => waitFor(() => S().meta[id]?.status === 'ready', 60000);
const clickEl = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const setInput = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
const only = (window.__mcOnly || '').split(',').filter(Boolean);
const parte = (n) => !only.length || only.includes(n);

// lê um quadro de um vídeo exportado (no próprio Chromium)
async function quadro(path, t, w = 0) {
  const v = document.createElement('video');
  v.muted = true; v.crossOrigin = 'anonymous'; v.preload = 'auto';
  v.src = 'media://local/' + encodeURIComponent(path.replace(/\\/g, '/'));
  await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('video ' + path)); });
  v.currentTime = t;
  await new Promise((r) => { v.onseeked = r; });
  await sleep(80);
  const W = w || v.videoWidth, H = Math.round((v.videoHeight / v.videoWidth) * W);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(v, 0, 0, W, H);
  v.removeAttribute('src'); v.load();
  return x;
}
const px = (ctx, fx, fy) => { const { width: W, height: H } = ctx.canvas; return [...ctx.getImageData(Math.round(fx * (W - 1)), Math.round(fy * (H - 1)), 1, 1).data].slice(0, 3); };
const perto = (a, b, tol = 40) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
// saturação média (HSV) de um contexto
const satMedia = (ctx) => {
  const d = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
  let s = 0, l = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); s += mx ? (mx - mn) / mx : 0; l += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
  return { sat: +(s / n).toFixed(3), luz: +(l / n).toFixed(1) };
};

// ---------- 1) HEIC ----------
if (parte('heic')) {
  S().newProject('4:3');
  await sleep(300);
  const [h1, h2] = await S().importPaths([V + '/IMG_3301.HEIC', V + '/rot270.HEIC']);
  await pronto(h1); await pronto(h2);
  const m1 = media(h1), m2 = media(h2);
  check('heic_tamanho_inteiro', m1.width === 4032 && m1.height === 3024, [m1.width, m1.height]);
  check('heic_girado', m2.width === 3024 && m2.height === 4032, [m2.width, m2.height]);
  check('heic_copia_para_exportar', /_proxy\.jpg$/.test(m1.renderPath || '') && S().meta[h1].proxy === m1.renderPath, m1.renderPath);
  const c1 = S().addMedia(h1);
  S().setTime(0.5); engine.invalidate(); await sleep(400);
  await window.api.testCapture('v18_01_heic');
  // a exportação usa a foto inteira: canto inferior direito tem conteúdo (antes saía 1 ladrilho ampliado)
  const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 720, fps: 30, quality: 'standard', vKbps: 4000, aKbps: 128, outPath: V + '/heic.mp4', endAt: 1 }).promise;
  check('heic_exporta', r.ok, r.error);
  if (r.ok) {
    const q = await quadro(V + '/heic.mp4', 0.5, 320);
    const prev = document.createElement('canvas'); prev.width = 320; prev.height = 240;
    const pc = prev.getContext('2d', { willReadFrequently: true }); pc.drawImage(engine.canvas, 0, 0, 320, 240);
    // compara prévia × exportação em 12 pontos
    let dif = 0;
    for (const [fx, fy] of [[0.1, 0.1], [0.5, 0.1], [0.9, 0.1], [0.1, 0.5], [0.5, 0.5], [0.9, 0.5], [0.1, 0.9], [0.5, 0.9], [0.9, 0.9], [0.3, 0.3], [0.7, 0.7], [0.7, 0.3]]) {
      const a = px(q, fx, fy), b = px(pc, fx, fy);
      dif = Math.max(dif, ...a.map((v, i) => Math.abs(v - b[i])));
    }
    check('heic_previa_igual_exportacao', dif < 60, dif);
  }
  S().removeClip?.(c1);
}

// ---------- 2) .mov HDR ----------
if (parte('hdr')) {
  S().newProject('9:16');
  await sleep(300);
  const [mv] = await S().importPaths([V + '/hdr.mov']);
  await pronto(mv);
  const m = media(mv);
  check('mov_hdr_detectado', m.hdr?.trc === 'arib-std-b67', m.hdr);
  const cid = S().addMedia(mv);
  S().setTime(3); engine.invalidate();
  await sleep(1500);
  const e = engine.pool.els.get(cid);
  const pv = document.createElement('canvas'); pv.width = 270; pv.height = 480;
  const pctx = pv.getContext('2d', { willReadFrequently: true });
  pctx.drawImage(e.el, 0, 0, 270, 480);
  const sPrev = satMedia(pctx);
  const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 480, fps: 30, quality: 'standard', vKbps: 3000, aKbps: 128, outPath: V + '/hdr_saida.mp4', endAt: 4 }).promise;
  check('mov_exporta', r.ok, r.error);
  if (r.ok) {
    const sExp = satMedia(await quadro(V + '/hdr_saida.mp4', 3, 270));
    log({ hdr_previa: sPrev, hdr_exportacao: sExp });
    // sem a conversão a exportação saía bem mais "lavada" (saturação menor) que a prévia
    check('mov_cores_como_previa', Math.abs(sExp.sat - sPrev.sat) < 0.08 && Math.abs(sExp.luz - sPrev.luz) < 30, { sPrev, sExp });
  }
}

// ---------- 3) remover fundo branco ----------
if (parte('chroma')) {
  S().newProject('4:3');
  await sleep(300);
  useStore.setState((s) => ({ project: { ...s.project, background: { type: 'color', color: '#00ff00' } } }));
  const [pid] = await S().importPaths([V + '/produto.png']);
  await pronto(pid);
  const cid = S().addMedia(pid);
  S().updateClip(cid, (c) => { c.chroma = { on: true, color: '#ffffff', similarity: 30, smooth: 12, spill: true }; c.fit = 'contain'; });
  S().setTime(0.5); engine.invalidate(); await sleep(500);
  await window.api.testCapture('v18_02_fundo_branco');
  const W = engine.canvas.width, H = engine.canvas.height;
  const pc = document.createElement('canvas'); pc.width = 400; pc.height = 300;
  const pctx = pc.getContext('2d', { willReadFrequently: true }); pctx.drawImage(engine.canvas, 0, 0, 400, 300);
  // pontos da imagem 800×600: fundo (50,50), vermelho (220,170), branco de dentro (400,300), azul (275,220)
  const P = { fundo: [50 / 800, 50 / 600], vermelho: [220 / 800, 170 / 600], branco_dentro: [400 / 800, 300 / 600], azul: [275 / 800, 220 / 600] };
  const esperado = { fundo: [0, 255, 0], vermelho: [208, 32, 48], branco_dentro: [255, 255, 255], azul: [32, 80, 224] };
  const prevOk = Object.entries(P).every(([k, [fx, fy]]) => perto(px(pctx, fx, fy), esperado[k]));
  check('fundo_branco_previa', prevOk, Object.fromEntries(Object.entries(P).map(([k, [fx, fy]]) => [k, px(pctx, fx, fy)])));
  const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 600, fps: 30, quality: 'high', vKbps: 4000, aKbps: 128, outPath: V + '/produto.mp4', endAt: 1 }).promise;
  check('fundo_branco_exporta', r.ok, r.error);
  if (r.ok) {
    const q = await quadro(V + '/produto.mp4', 0.5);
    const ok = Object.entries(P).every(([k, [fx, fy]]) => perto(px(q, fx, fy), esperado[k]));
    check('fundo_branco_exportacao', ok, Object.fromEntries(Object.entries(P).map(([k, [fx, fy]]) => [k, px(q, fx, fy)])));
  }
  // sem "só o fundo das bordas" o branco de dentro também some (comportamento de chroma comum)
  S().updateClip(cid, (c) => { c.chroma = { ...c.chroma, bordas: false }; });
  engine.invalidate(); await sleep(400);
  pctx.drawImage(engine.canvas, 0, 0, 400, 300);
  check('fundo_global_tira_branco_de_dentro', perto(px(pctx, ...P.branco_dentro), [0, 255, 0]), px(pctx, ...P.branco_dentro));
  log({ canvas: [W, H] });
}

// ---------- 3b) fundo do clipe (Cor / Desfoque) pela interface ----------
if (parte('fundo')) {
  S().newProject('9:16');
  await sleep(300);
  const [vid] = await S().importPaths([DIR + '/a.mp4']);
  await pronto(vid);
  const cid = S().addMedia(vid);
  S().select({ type: 'clip', id: cid });
  S().setTime(1); engine.invalidate(); await sleep(600);
  const secFundo = () => [...document.querySelectorAll('.section')].find((x) => x.querySelector('.section-title')?.textContent.trim() === 'Fundo');
  const botao = (txt) => [...(secFundo()?.querySelectorAll('.seg button') || [])].find((b) => b.textContent.trim() === txt);
  const bCor = botao('Cor'), bDesf = botao('Desfoque');
  check('fundo_botoes_visiveis', !!bCor && !!bDesf, { cor: !!bCor, desf: !!bDesf, sec: !!secFundo() });
  const topo = () => { const c = document.createElement('canvas'); c.width = 90; c.height = 160; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(engine.canvas, 0, 0, 90, 160); return x; };
  if (bCor) {
    clickEl(bCor); await sleep(200);
    S().updateClip(cid, (c) => { c.bg.color = '#ff0000'; });
    engine.invalidate(); await sleep(400);
    const p = px(topo(), 0.5, 0.05);
    check('fundo_cor_previa', perto(p, [255, 0, 0]), { p, bg: S().project.tracks.flatMap((t) => t.clips).find((c) => c.id === cid)?.bg });
  }
  if (bDesf) {
    clickEl(bDesf); await sleep(200);
    engine.invalidate(); await sleep(400);
    const p = px(topo(), 0.5, 0.1);
    check('fundo_desfoque_previa', !perto(p, [0, 0, 0], 12) && !perto(p, [255, 0, 0], 30), { p, bg: S().project.tracks.flatMap((t) => t.clips).find((c) => c.id === cid)?.bg });
    await window.api.testCapture('v18_05_fundo_desfoque');
    const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 480, fps: 30, quality: 'standard', vKbps: 2000, aKbps: 128, outPath: V + '/fundo.mp4', endAt: 2 }).promise;
    if (r.ok) { const q = await quadro(V + '/fundo.mp4', 1, 90); const pe = px(q, 0.5, 0.1); check('fundo_desfoque_exportacao', perto(pe, p, 45), { previa: p, exportado: pe }); } else check('fundo_desfoque_exportacao', false, r.error);
  }
}

// ---------- 4) YouTube: pesquisa + prévia ----------
if (parte('youtube')) {
  S().newProject('16:9');
  await sleep(300);
  useStore.setState({ leftTab: 'audio' });
  await sleep(400);
  const inp = await waitFor(() => document.querySelector('.yt-box input[type=text]'));
  setInput(inp, 'big buck bunny blender');
  await sleep(100);
  clickEl([...document.querySelectorAll('.yt-box .btn.primary')].find((b) => /Pesquisar/.test(b.textContent)));
  const itens = await waitFor(() => (document.querySelectorAll('.yt-item').length ? document.querySelectorAll('.yt-item') : null), 90000);
  check('youtube_pesquisa', !!itens && itens.length >= 3, itens?.length);
  await window.api.testCapture('v18_03_youtube_pesquisa');
  if (itens) {
    clickEl(itens[0]);
    const wv = await waitFor(() => document.querySelector('.yt-player webview'), 5000);
    check('youtube_modal', !!wv);
    // o player carrega e toca (autoplay); lê o tempo pelo próprio vídeo do player
    let estado = null;
    await waitFor(() => false, 1500);
    for (let i = 0; i < 60; i++) {
      try { estado = await wv.executeJavaScript(`(() => { const v = document.querySelector('video'); const e = document.querySelector('.ytp-error'); return { t: v ? v.currentTime : -1, d: v ? v.duration : 0, erro: e && e.offsetParent ? e.innerText : '' }; })()`); } catch (er) { estado = { exc: String(er) }; }
      if (estado?.t > 1 || estado?.erro) break;
      await sleep(500);
    }
    log({ youtube_player: estado });
    await window.api.testCapture('v18_04_youtube_previa');
    check('youtube_player_toca', estado?.t > 1 && !estado?.erro, estado);
    const tc = document.querySelector('.modal .timecode')?.textContent || '';
    check('youtube_tempo_na_tela', /\d\d:\d\d\.\d\d \/ \d\d:\d\d\.\d\d/.test(tc) && !/00:00\.00 \/ 00:00\.00/.test(tc), tc);
    // marca início/fim pelos botões
    const btn = (re) => [...document.querySelectorAll('.modal .btn')].find((b) => re.test(b.textContent));
    clickEl(btn(/Marcar início/)); await sleep(1600); clickEl(btn(/Marcar fim/)); await sleep(300);
    const foot = document.querySelector('.modal-foot .btn.primary')?.textContent || '';
    check('youtube_trecho_marcado', /trecho \(\d\d:\d\d\.\d\d\)/.test(foot), foot);
    document.querySelector('.modal-head .icon-btn')?.click();
    await sleep(300);
  }
}

const allClips = () => S().project.tracks.flatMap((t) => t.clips);
const clipById = (id) => allClips().find((c) => c.id === id);
const ev = (type, x, y, t = window, mods = {}) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, isPrimary: true, ...mods }));

// ---------- 5) Meus sons ----------
if (parte('meus')) {
  S().newProject('16:9');
  await sleep(300);
  const dir = await window.api.meusSonsCategoria('Rodrigo Faro');
  const n = await window.api.meusSonsAdicionar(dir, [DIR + '/m.mp3', DIR + '/fala.wav']);
  const n2 = await window.api.meusSonsAdicionar(dir, [DIR + '/m.mp3']);   // o mesmo arquivo de novo não duplica
  const lista = await window.api.meusSons();
  const cat = lista.cats.find((c) => c.name === 'Rodrigo Faro');
  check('meus_adiciona', cat?.sons.length === 2 && n2 === 0 && cat.sons.every((s) => s.dur > 0), { n, n2, sons: cat?.sons.map((s) => [s.name, s.dur]) });
  useStore.setState({ leftTab: 'sfx' });
  await sleep(300);
  clickEl([...document.querySelectorAll('.lp-body .btn.small')].find((b) => /Meus sons/.test(b.textContent)));
  await waitFor(() => document.querySelector('.sfx-card[data-meusom]'), 8000);
  clickEl([...document.querySelectorAll('.meus-sons .btn.small')].find((b) => /Rodrigo Faro/.test(b.textContent)) || document.body);
  await sleep(300);
  const cards = document.querySelectorAll('.sfx-card[data-meusom]');
  check('meus_cartoes', cards.length >= 1, cards.length);
  await window.api.testCapture('v18_06_meus_sons');
  cards[0]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  const audio = await waitFor(() => allClips().find((c) => c.type === 'audio'), 10000);
  check('meus_vai_para_linha_do_tempo', !!audio);
}

// ---------- 6) prévia da biblioteca ----------
if (parte('libprev')) {
  S().newProject('16:9');
  await sleep(300);
  const [vid] = await S().importPaths([DIR + '/a.mp4']);
  await pronto(vid);
  useStore.setState({ leftTab: 'media' });
  await sleep(300);
  S().openLibPreview(vid);
  const v = await waitFor(() => document.querySelector('.libprev video'), 5000);
  check('libprev_abre', !!v);
  if (v) {
    await waitFor(() => v.readyState >= 2, 5000);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await sleep(1200);
    check('libprev_toca_com_espaco', v.currentTime > 0.5 && S().playing === false, { t: v.currentTime, playing: S().playing });
    await window.api.testCapture('v18_07_previa_biblioteca');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(200);
    check('libprev_esc_fecha', !S().libPreview && !document.querySelector('.libprev'));
  }
}

// ---------- 7) arrastar ponto de modificação + loop + edição em lote + texto em lote ----------
if (parte('edicao')) {
  S().newProject('16:9');
  await sleep(300);
  const [vid] = await S().importPaths([DIR + '/a.mp4']);
  await pronto(vid);
  const c1 = S().addMedia(vid);
  S().updateClip(c1, (c) => { c.kf = { scale: [{ t: 0.5, v: 1 }, { t: 2, v: 1.4 }] }; });
  useStore.setState({ zoom: 100 });
  S().select({ type: 'clip', id: c1 });
  await sleep(300);
  const dot = [...document.querySelectorAll('.clip .kf-dot')][0];
  if (dot) {
    const r = dot.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    ev('pointerdown', x, y, dot);
    for (let i = 1; i <= 10; i++) { ev('pointermove', x + i * 5, y); await sleep(16); }
    ev('pointerup', x + 50, y);
    await sleep(200);
    const ks = clipById(c1).kf.scale.map((k) => +k.t.toFixed(2));
    check('kf_arrastar_muda_momento', Math.abs(ks[0] - 1.0) < 0.05 && ks[1] === 2, ks);
  } else check('kf_arrastar_muda_momento', false, 'sem ponto na tela');
  // loop
  S().setLoop(1, 2);
  S().setTime(0.2);
  S().play();
  await sleep(2600);
  const tl = S().time;
  S().pause();
  check('loop_repete_trecho', tl >= 1 && tl < 2.05, tl);
  check('loop_faixa_na_regua', !!document.querySelector('.loop-band.on'));
  S().clearLoop();
  // edição em lote (1.11: vários do mesmo tipo abrem o painel completo e o que muda vale para todos)
  const c2 = S().addMedia(vid);
  S().select({ type: 'clip', id: c2, ids: [c1, c2] }); // c2 é o principal (sem pontos)
  await sleep(300);
  const aba = (n) => { const b = [...document.querySelectorAll('.insp-tab')].find((x) => x.textContent === n); if (b) clickEl(b); };
  const campo = (rot) => [...document.querySelectorAll('.insp-body .field')].find((f) => f.querySelector('label')?.textContent.startsWith(rot));
  aba('Áudio');
  await sleep(200);
  const vol = campo('Volume')?.querySelector('input[type=range]');
  if (vol) { setInput(vol, '50'); await sleep(200); }
  check('lote_volume', clipById(c1).volume === 0.5 && clipById(c2).volume === 0.5, [clipById(c1).volume, clipById(c2).volume]);
  aba('Vídeo');
  await sleep(200);
  const esc = campo('Escala')?.querySelector('input[type=range]');
  if (esc) { setInput(esc, '200'); await sleep(200); }
  // c2 recebe 2; c1 tem pontos de escala (1 → 1,4): os pontos andam o mesmo tanto (+1)
  check('lote_escala_proporcional', Math.abs(clipById(c2).transform.scale - 2) < 1e-6 && Math.abs(clipById(c1).kf.scale[0].v - 2) < 1e-6 && Math.abs(clipById(c1).kf.scale[1].v - 2.4) < 1e-6, [clipById(c2).transform.scale, clipById(c1).kf.scale.map((k) => k.v)]);
  // texto em lote
  S().addText('classic', { time: 0 });
  const t1 = S().selection.id;
  S().addText('classic', { time: 2 });
  const t2 = S().selection.id;
  S().select({ type: 'clip', id: t1, ids: [t1, t2] });
  await sleep(300);
  const tog = document.querySelector('.insp-body button[title="Maiúsculas"]');
  if (tog) clickEl(tog);
  await sleep(200);
  check('lote_texto_maiusculas', clipById(t1)?.text.uppercase === true && clipById(t2)?.text.uppercase === true, [clipById(t1)?.text.uppercase, clipById(t2)?.text.uppercase, !!tog]);
  await window.api.testCapture('v18_08_lote');
}

// ---------- 8) capa + animação contínua na exportação ----------
if (parte('capa')) {
  S().newProject('16:9');
  await sleep(300);
  const [vid] = await S().importPaths([DIR + '/a.mp4']);
  await pronto(vid);
  const c = S().addMedia(vid);
  S().updateClip(c, (x) => { x.duration = 2; x.animLoop = { id: 'pulse', speed: 1, amount: 100 }; x.animIn = { id: 'drop', duration: 0.6 }; });
  S().commit((p) => { p.cover = { path: V + '/produto.png', origem: 'imagem' }; }, { keepTracks: true });
  const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 360, fps: 30, quality: 'standard', vKbps: 2000, aKbps: 128, outPath: V + '/capa.mp4', endAt: 2 }).promise;
  check('capa_exporta', r.ok, r.error);
  if (r.ok) {
    const q0 = await quadro(V + '/capa.mp4', 0);
    const q1 = await quadro(V + '/capa.mp4', 1);
    check('capa_no_primeiro_quadro', perto(px(q0, 0.6, 0.6), [208, 32, 48], 50) && !perto(px(q1, 0.6, 0.6), [208, 32, 48], 50), { q0: px(q0, 0.6, 0.6), q1: px(q1, 0.6, 0.6) });
  }
  // capa pelo quadro da agulha
  S().setTime(1);
  const png = await engine.snapshotPng();
  check('capa_quadro_da_agulha', !!png && png.length > 1000, png?.length);
}

// ---------- 9) sons livres (CC0): prévia, pôr no cursor (OGG copiado para Documentos) ----------
if (parte('livres')) {
  S().newProject('16:9');
  await sleep(300);
  useStore.setState({ leftTab: 'sfx' });
  await sleep(300);
  clickEl([...document.querySelectorAll('.lp-body .btn.small')].find((b) => b.textContent === 'Animais'));
  await sleep(300);
  const galo = document.querySelector('.sfx-card[data-sfx="b0283"]');
  check('livres_cartao', !!galo && /Galo cantando/.test(galo.textContent) && /\d s/.test(galo.textContent), galo?.textContent);
  if (galo) {
    clickEl(galo);
    await sleep(500);
    check('livres_previa_toca', galo.classList.contains('active'));
    clickEl(galo);
    galo.querySelector('button.plus').click();
    const c = await waitFor(() => allClips().find((x) => x.type === 'audio'), 10000);
    const m = c && S().project.media.find((x) => x.id === c.mediaId);
    check('livres_no_cursor', !!m && /Efeitos sonoros[\\/]Galo cantando\.ogg$/.test(m.path) && m.duration > 1, m && { path: m.path, dur: m.duration });
  }
  const nCats = [...document.querySelectorAll('.lp-body .btn.small')].filter((b) => !/Categoria|Adicionar/.test(b.textContent)).length;
  check('livres_categorias', nCats >= 19, nCats);
}

log(res);
return res;
