// Teste da 1.11: legendas presas à voz (não aparecem no silêncio nem em clipe mudo) e edição em grupo
// (vários clipes do mesmo tipo ajustados juntos pelo painel da direita e pelo reprodutor).
const { useStore, generateCaptions } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const info = await window.api.info();
const DIR = info.tempDir.replace(/[\\/]munnin-cut-jobs$/, '/munnin-cut-test').replace(/\\/g, '/');
const V = DIR + '/v111';
const res = {};
const check = (name, cond, i) => { res[name] = cond ? 'OK' : `FALHOU ${i !== undefined ? JSON.stringify(i) : ''}`; };
const waitFor = async (fn, ms = 15000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(100); } return null; };
const pronto = (id) => waitFor(() => S().meta[id]?.status === 'ready', 60000);
const clickEl = (el) => el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const ev = (type, x, y, t = window) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, isPrimary: true }));
const setInput = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
const allClips = () => S().project.tracks.flatMap((t) => t.clips);
const clipById = (id) => allClips().find((c) => c.id === id);
const only = (window.__mcOnly || '').split(',').filter(Boolean);
const parte = (n) => !only.length || only.includes(n);
const aba = (n) => clickEl([...document.querySelectorAll('.insp-tab')].find((x) => x.textContent === n));
const campo = (rot) => [...document.querySelectorAll('.insp-body .field')].find((f) => f.querySelector('label')?.textContent.startsWith(rot));
const range = (rot, v) => { const el = campo(rot)?.querySelector('input[type=range]'); if (el) setInput(el, String(v)); return !!el; };
const secao = (re) => [...document.querySelectorAll('.insp-body .section')].find((x) => re.test(x.querySelector('.section-title')?.textContent || ''));
const main = () => S().project.tracks.find((t) => t.main).clips;

// ---------- 1) legendas: só onde há fala ----------
if (parte('legendas')) {
  // fala.mp4: 1,2 s de silêncio e depois voz em 1,24–3,16 · 3,96–7,97 · 8,78–10,20 s
  const FALA = [[1.24, 3.16], [3.96, 7.97], [8.78, 10.2]];
  const t = await window.api.captionTranscribe({ audioPath: V + '/fala.mp4', model: 'base', language: 'pt' });
  const comDtw = (t.words || []).filter((w) => w.td != null).length;
  check('legendas_dtw_e_volume', t.words?.length > 5 && comDtw / t.words.length > 0.8 && Math.abs(t.energia?.db.length - 1020) < 15,
    { n: t.words?.length, comDtw, janelas: t.energia?.db.length });

  S().newProject('16:9');
  await sleep(300);
  const [mi, mf] = await S().importPaths([V + '/intro.mp4', V + '/fala.mp4']);
  await pronto(mi); await pronto(mf);
  const ci = S().addMedia(mi);
  const cf = S().addMedia(mf);
  S().updateClip(ci, { muted: true }); // abertura sem som (como uma vinheta silenciada)
  const ini = clipById(cf).start;
  const fala = FALA.map(([a, b]) => [a + ini, b + ini]);
  const dentro = (a, b) => fala.reduce((s, [x, y]) => s + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
  const avaliar = (caps) => {
    const total = caps.reduce((s, c) => s + c.duration, 0);
    const fora = caps.reduce((s, c) => s + c.duration - dentro(c.start, c.start + c.duration), 0);
    return { n: caps.length, total: +total.toFixed(2), fora: +fora.toFixed(2), ini: +caps[0]?.start.toFixed(2), fim: +(caps.at(-1)?.start + caps.at(-1)?.duration).toFixed(2) };
  };
  const legendas = () => allClips().filter((c) => c.caption).sort((a, b) => a.start - b.start);
  await generateCaptions({ source: 'project', language: 'pt', model: 'base', styleId: 'clean', lines: 2, replace: true });
  let caps = legendas();
  let a = avaliar(caps);
  check('legendas_nada_na_abertura_muda', caps.length > 2 && caps[0].start >= ini + FALA[0][0] - 0.15, { ...a, abertura: ini });
  check('legendas_so_durante_a_fala', a.fora <= Math.max(0.6, a.total * 0.12), a);
  check('legendas_terminam_com_a_voz', a.fim <= ini + FALA[2][1] + 0.4, a);
  check('legendas_pausa_separa', !caps.some((c) => c.start < ini + 3.3 && c.start + c.duration > ini + 3.85), caps.map((c) => [+c.start.toFixed(2), +(c.start + c.duration).toFixed(2)]));
  await window.api.testCapture('v111_01_legendas');
  // só do clipe selecionado
  S().select({ type: 'clip', id: cf });
  await generateCaptions({ source: 'clip', clipId: cf, language: 'pt', model: 'base', styleId: 'box', lines: 1, replace: true });
  caps = legendas();
  a = avaliar(caps);
  check('legendas_clipe_comeca_na_voz', caps.length > 2 && caps[0].start >= ini + FALA[0][0] - 0.15 && a.fim <= ini + clipById(cf).duration + 1e-6, a);
}

// ---------- 2) edição em grupo pelo painel ----------
if (parte('grupo')) {
  S().newProject('16:9');
  await sleep(300);
  const [vid] = await S().importPaths([DIR + '/a.mp4']);
  await pronto(vid);
  S().addMedia(vid);
  for (const t of [2, 4, 6]) { S().select(null); S().splitAt(t); }
  const ids = main().map((c) => c.id);
  S().selectMany(ids, ids[1]);
  await sleep(400);
  const banner = document.querySelector('.grupo-box');
  check('grupo_painel', ids.length === 4 && /Editando 4 vídeos juntos/.test(banner?.textContent || ''), banner?.textContent);
  check('grupo_sem_pontos_de_modificacao', !document.querySelector('.insp-body .kf-btn'));
  await window.api.testCapture('v111_02_grupo');

  aba('Ajuste'); await sleep(150);
  range('Brilho', 40); await sleep(150);
  check('grupo_brilho', main().every((c) => c.adjust?.brightness === 40), main().map((c) => c.adjust?.brightness));

  aba('Filtro'); await sleep(150);
  clickEl([...document.querySelectorAll('.insp-body .fx-card')].find((x) => x.textContent.includes('Vívido'))); await sleep(150);
  check('grupo_filtro', main().every((c) => c.filter?.id === 'vivid'), main().map((c) => c.filter?.id));

  aba('Animação'); await sleep(150);
  clickEl([...(secao(/^Entrada/)?.querySelectorAll('.anim-grid button') || [])].find((b) => b.textContent === 'Surgir')); await sleep(150);
  check('grupo_animacao', main().every((c) => c.animIn?.id === 'fade'), main().map((c) => c.animIn?.id));

  aba('Áudio'); await sleep(150);
  range('Volume', 150); await sleep(150);
  check('grupo_volume', main().every((c) => c.volume === 1.5), main().map((c) => c.volume));
  clickEl([...(secao(/^Voz/)?.querySelectorAll('.anim-grid button') || [])][0]); await sleep(150);
  const v0 = JSON.stringify(clipById(ids[1]).voz);
  check('grupo_voz', !!clipById(ids[1]).voz && main().every((c) => JSON.stringify(c.voz) === v0), main().map((c) => c.voz));
  check('grupo_sem_cortar_silencios_e_separar_todos', ![...document.querySelectorAll('.insp-body .btn')].some((b) => /Cortar silêncios/.test(b.textContent))
    && [...document.querySelectorAll('.insp-body .btn')].some((b) => /Separar áudio dos 4/.test(b.textContent)));

  aba('Velocidade'); await sleep(150);
  clickEl([...document.querySelectorAll('.insp-body .anim-grid button')].find((b) => b.textContent === '2x')); await sleep(200);
  const m = main();
  check('grupo_velocidade', m.every((c) => c.speed === 2 && Math.abs(c.duration - 1) < 1e-6) && m.every((c, i) => Math.abs(c.start - i) < 1e-6) && m.every((c, i) => Math.abs(c.in - i * 2) < 1e-6),
    m.map((c) => [c.speed, +c.duration.toFixed(3), +c.start.toFixed(3), c.in]));

  aba('Vídeo'); await sleep(150);
  range('Escala', 150); await sleep(150);
  check('grupo_escala', main().every((c) => c.transform.scale === 1.5), main().map((c) => c.transform.scale));
  S().undo();
  check('grupo_desfaz_de_uma_vez', main().every((c) => (c.transform.scale ?? 1) === 1), main().map((c) => c.transform.scale));
  S().redo();
  S().updateClip(ids[2], (c) => { c.kf = { x: [{ t: 0, v: 0 }, { t: 0.5, v: 0.2 }] }; });
  await sleep(150);
  clickEl([...(secao(/^Transformar/)?.querySelectorAll('button') || [])].find((b) => /Redefinir/.test(b.textContent))); await sleep(150);
  check('grupo_redefinir_todos', main().every((c) => c.transform.scale === 1 && !c.kf?.x), main().map((c) => [c.transform.scale, c.kf]));
  // posição: todos com o mesmo valor; o tempo e o trecho de cada um não mudam
  const antes = main().map((c) => [c.start, c.duration, c.in]);
  range('Posição X', 25); await sleep(150);
  check('grupo_posicao_tempo_intacto', main().every((c) => c.transform.x === 0.25) && JSON.stringify(main().map((c) => [c.start, c.duration, c.in])) === JSON.stringify(antes));

  // mistura de tipos: escolher o tipo
  S().addText('classic', { time: 0 });
  const t1 = S().selection.id;
  S().addText('classic', { time: 2 });
  const t2 = S().selection.id;
  S().updateClip(t1, (c) => { c.text.content = 'Primeiro'; });
  S().updateClip(t2, (c) => { c.text.content = 'Segundo'; });
  S().selectMany([ids[0], t1, t2], ids[0]);
  await sleep(300);
  const bt = [...document.querySelectorAll('.insp-body .btn')].find((b) => /2 textos/.test(b.textContent));
  check('grupo_misto_oferece_tipos', !!bt && !document.querySelector('.grupo-box'));
  clickEl(bt); await sleep(300);
  check('grupo_misto_abre_textos', /Editando 2 textos juntos/.test(document.querySelector('.grupo-box')?.textContent || '') && !document.querySelector('.insp-body textarea'));
  range('Tamanho', 120); await sleep(150);
  check('grupo_texto_mantem_conteudo', clipById(t1).text.size === 120 && clipById(t2).text.size === 120 && clipById(t1).text.content === 'Primeiro' && clipById(t2).text.content === 'Segundo' && main().every((c) => !c.text));
  clickEl([...document.querySelectorAll('.grupo-box .btn')].find((b) => /Ver a seleção toda/.test(b.textContent))); await sleep(200);
  check('grupo_volta_para_selecao', !document.querySelector('.grupo-box') && !!secao(/clipes selecionados/));
  // um clipe só: o painel normal, com os pontos de modificação
  S().select({ type: 'clip', id: ids[0] });
  await sleep(200);
  aba('Vídeo'); await sleep(150);
  check('um_clipe_painel_normal', !document.querySelector('.grupo-box') && !!document.querySelector('.insp-body .kf-btn'));
}

// ---------- 3) reprodutor: arrastar move todos juntos ----------
if (parte('reprodutor')) {
  S().newProject('16:9');
  await sleep(300);
  const [img] = await S().importPaths([V + '/q1.png']);
  await pronto(img);
  const q1 = S().addMedia(img, { target: 'overlay', time: 0 });
  const q2 = S().addMedia(img, { target: 'overlay', time: 0 });
  S().updateClip(q1, (c) => { c.transform.x = -0.2; c.transform.scale = 0.5; });
  S().updateClip(q2, (c) => { c.transform.x = 0.25; c.transform.scale = 0.8; });
  S().setTime(0.5);
  S().selectMany([q1, q2], q1);
  await sleep(400);
  const poly = document.querySelector('.player-stage svg polygon');
  const r = poly?.getBoundingClientRect();
  const W = window.__mc.engine.canvas.getBoundingClientRect().width || 1;
  if (r) {
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    ev('pointerdown', x0, y0, poly);
    for (let i = 1; i <= 8; i++) { ev('pointermove', x0 + i * 6, y0); await sleep(16); }
    ev('pointerup', x0 + 48, y0);
    await sleep(200);
  }
  const a = clipById(q1).transform, b = clipById(q2).transform;
  const d1 = a.x + 0.2, d2 = b.x - 0.25;
  check('reprodutor_move_juntos', r && d1 > 0.02 && Math.abs(d1 - d2) < 1e-6 && Math.abs(d1 - 48 / W) < 0.02, { d1, d2, esperado: 48 / W });
  check('reprodutor_escala_de_cada_um', a.scale === 0.5 && b.scale === 0.8);
  await window.api.testCapture('v111_03_reprodutor');
}

log(res);
return res;
