// Teste da 1.12: biblioteca em lista (miniaturas só ao "Visualizar"), miniaturas pequenas das fotos, foto conferida
// não é decodificada de novo ao abrir, prévia com pré-carregamento e exportar em partes.
const { useStore, startExport, engine } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const info = await window.api.info();
const DIR = info.tempDir.replace(/[\\/]munnin-cut-jobs$/, '/munnin-cut-test').replace(/\\/g, '/');
const res = {};
const check = (name, cond, i) => { res[name] = cond ? 'OK' : `FALHOU ${i !== undefined ? JSON.stringify(i) : ''}`; };
const waitFor = async (fn, ms = 20000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(100); } return null; };
const pronto = (id) => waitFor(() => S().meta[id]?.status === 'ready', 60000);
const clickEl = (el) => el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const only = (window.__mcOnly || '').split(',').filter(Boolean);
const parte = (n) => !only.length || only.includes(n);

// ---------- 1) biblioteca: lista por padrão, "Visualizar" mostra as miniaturas (pequenas) ----------
if (parte('biblioteca')) {
  try { localStorage.removeItem('mc.libVer'); } catch {}
  S().newProject('16:9');
  await sleep(300);
  useStore.setState({ leftTab: 'media' });
  const ids = await S().importPaths([DIR + '/cadeia/foto.jpg', DIR + '/a.mp4', DIR + '/c.png']);
  for (const id of ids) await pronto(id);
  const foto = ids[0];
  await waitFor(() => S().meta[foto]?.thumbs?.mini, 20000);
  await sleep(300);
  check('lista_por_padrao', document.querySelectorAll('.media-row').length === 3 && !document.querySelector('.media-card') && !document.querySelector('.media-lib img'),
    { linhas: document.querySelectorAll('.media-row').length, cartoes: document.querySelectorAll('.media-card').length });
  const mini = S().meta[foto]?.thumbs?.mini;
  const st = mini ? (await window.api.statFiles([mini]))[0] : null;
  check('miniatura_pequena_da_foto', !!mini && /_mini\.jpg$/.test(mini) && st?.exists && st.size < 120000, { mini, size: st?.size });
  check('png_mantem_transparencia', /_mini\.png$/.test(S().meta[ids[2]]?.thumbs?.mini || ''), S().meta[ids[2]]?.thumbs);
  await window.api.testCapture('v112_01_lista');
  clickEl([...document.querySelectorAll('.media-lib .btn')].find((b) => /Visualizar/.test(b.textContent)));
  await sleep(400);
  const imgs = [...document.querySelectorAll('.media-card img')];
  check('visualizar_mostra_miniaturas', document.querySelectorAll('.media-card').length === 3 && imgs.length >= 2 && imgs.every((i) => /_mini\./.test(decodeURIComponent(i.src))),
    imgs.map((i) => decodeURIComponent(i.src).split('/').pop()));
  check('visualizar_fica_guardado', localStorage.getItem('mc.libVer') === 'miniaturas');
  await window.api.testCapture('v112_02_miniaturas');
  clickEl([...document.querySelectorAll('.media-lib .btn')].find((b) => /Ocultar/.test(b.textContent)));
  await sleep(300);
  check('ocultar_volta_para_lista', !!document.querySelector('.media-row') && !document.querySelector('.media-card'));
  // na linha do tempo, a foto também usa a miniatura
  S().addMedia(foto);
  await sleep(500);
  const tile = document.querySelector('.clip .thumbs > div');
  check('linha_do_tempo_usa_miniatura', !!tile && /_mini\./.test(decodeURIComponent(tile.style.backgroundImage || '')), tile?.style.backgroundImage);
  // clique duplo na linha adiciona
  const antes = S().project.tracks.flatMap((t) => t.clips).length;
  document.querySelector(`.media-row[data-id="${ids[1]}"]`)?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await sleep(300);
  check('lista_clique_duplo_adiciona', S().project.tracks.flatMap((t) => t.clips).length === antes + 1);
}

// ---------- 2) foto já conferida não é decodificada de novo ao abrir ----------
if (parte('abrir')) {
  S().newProject('16:9');
  await sleep(300);
  const [foto] = await S().importPaths([DIR + '/cadeia/foto.jpg']);
  await pronto(foto);
  const m = S().project.media.find((x) => x.id === foto);
  check('foto_marcada_conferida', !!m.chk && m.chk.size > 0, m.chk);
  // reabre: a conferência não cria <img> da foto original
  const orig = window.Image;
  let criadas = 0;
  window.Image = function (...a) { criadas++; return new orig(...a); };
  const p = structuredClone(S().project);
  S().openEditor(p);
  await pronto(foto);
  await sleep(300);
  window.Image = orig;
  check('reabrir_nao_decodifica_foto', criadas === 0, { criadas });
}

// ---------- 3) prévia: fotos dos próximos segundos já carregadas; as distantes são soltas ----------
if (parte('previa')) {
  S().newProject('16:9');
  await sleep(300);
  const [a, b] = await S().importPaths([DIR + '/cadeia/foto.jpg', DIR + '/c.png']);
  await pronto(a); await pronto(b);
  S().addMedia(a);
  const cb = S().addMedia(b, { target: 'overlay', time: 3 });
  S().setTime(0.5);
  await sleep(900);
  const pool = engine.pool;
  const srcB = pool.srcFor(S().project.media.find((m) => m.id === b), S().meta[b]);
  check('previa_pre_carrega_proxima_foto', pool.imgs.has(srcB), [...pool.imgs.keys()].map((k) => k.split(/[\\/]/).pop()));
  // longe da agulha por mais de 15 s: sai da memória
  S().updateClip(cb, (c) => { c.start = 60; });
  const img = pool.imgs.get(srcB);
  if (img) img.__uso = performance.now() - 20000;
  await sleep(700);
  check('previa_solta_foto_distante', !pool.imgs.has(srcB));
}

// ---------- 4) exportar em partes (app): a opção aparece e o vídeo sai inteiro, com áudio ----------
if (parte('partes')) {
  S().newProject('16:9');
  await sleep(300);
  const [v, foto] = await S().importPaths([DIR + '/a.mp4', DIR + '/cadeia/foto.jpg']);
  await pronto(v); await pronto(foto);
  for (let i = 0; i < 9; i++) S().addMedia(v); // 72 s de vídeo na faixa principal
  const f1 = S().addMedia(foto, { target: 'overlay', time: 20 });
  S().updateClip(f1, (c) => { c.duration = 25; c.transform.scale = 0.4; c.animLoop = { id: 'kenburns', speed: 1, amount: 100 }; });
  await sleep(300);
  useStore.setState({ modal: 'export' });
  await sleep(500);
  const temOpcao = [...document.querySelectorAll('label')].some((e) => /^Em partes$/.test(e.textContent.trim()));
  check('opcao_em_partes_no_dialogo', temOpcao);
  useStore.setState({ modal: null });
  await sleep(200);
  const out = DIR.replace(/\//g, '\\') + '\\v112_partes.mp4';
  const rotulos = new Set();
  const t0 = performance.now();
  const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 480, fps: 30, quality: 'standard', vKbps: 1500, aKbps: 128, outPath: out,
    partes: true, alvoParte: 20, paralelo: 2, onProgress: (p, sp, l) => l && rotulos.add(l.replace(/\d+ de \d+/, 'N')) }).promise;
  const segs = (performance.now() - t0) / 1000;
  check('exportar_em_partes_ok', r.ok, r.error);
  check('exportar_em_partes_mostra_progresso', [...rotulos].some((l) => /parte/.test(l)) && [...rotulos].some((l) => /Juntando/.test(l)), [...rotulos]);
  if (r.ok) {
    const v2 = document.createElement('video');
    v2.src = 'media://local/' + encodeURIComponent(out);
    await new Promise((ok) => { v2.onloadedmetadata = ok; v2.onerror = ok; });
    check('em_partes_duracao_certa', Math.abs(v2.duration - 72) < 0.2, { duracao: v2.duration });
    log({ partes_segundos: segs.toFixed(1), tamanho: r.size });
  }
}

log(res);
return res;
