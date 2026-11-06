// Teste da 1.13: largura/altura da forma ligadas à Largura X/Altura Y, prévia da biblioteca encaixando mídia em pé,
// botão de transição sem cobrir as alças nas legendas, Ctrl+B em vários clipes, camadas (frente/trás, ordem das
// faixas, soltar em faixa ocupada), padrão das legendas, sombra, pivô e perspectiva (prévia × exportação).
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
const porTexto = (sel, re) => [...document.querySelectorAll(sel)].find((e) => re.test(e.textContent.trim()));
const campo = (re) => [...document.querySelectorAll('.field')].find((f) => re.test(f.querySelector('label')?.textContent.trim() || ''));
const setRange = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); };
const clip = (id) => S().project.tracks.flatMap((t) => t.clips).find((c) => c.id === id);
const faixaDe = (id) => S().project.tracks.findIndex((t) => t.clips.some((c) => c.id === id));
const only = (window.__mcOnly || '').split(',').filter(Boolean);
const parte = (n) => !only.length || only.includes(n);
// imagem gerada no canvas e gravada como arquivo (para importar)
async function png(nome, w, h, desenha) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  desenha(c.getContext('2d'), w, h);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return window.api.writeFile('job:teste113', nome, new Uint8Array(await blob.arrayBuffer()));
}

// ---------- 1) forma: Largura/Altura (aba Forma) e Largura X/Altura Y (aba Posição) são o mesmo tamanho ----------
if (parte('forma')) {
  S().newProject('16:9');
  await sleep(300);
  const id = S().addShape('rect');
  S().setTime(0.5);
  await sleep(300);
  clickEl(porTexto('.insp-tab', /^Forma$/));
  await sleep(200);
  const sh0 = clip(id).shape;
  const larg = campo(/^Largura$/)?.querySelector('input[type=range]');
  setRange(larg, Math.round(sh0.w * 2));
  await sleep(200);
  check('forma_largura_muda_largura_x', Math.abs((clip(id).transform.scaleX ?? 1) - 2) < 0.02 && clip(id).shape.w === sh0.w, { sx: clip(id).transform.scaleX, w: clip(id).shape.w });
  // e o contrário: mexer na Largura X (como as alças do reprodutor) aparece na Largura da aba Forma
  S().updateClip(id, (c) => { c.transform.scaleY = 0.5; });
  await sleep(200);
  const alt = campo(/^Altura$/)?.querySelector('input[type=number]');
  check('forma_altura_acompanha_altura_y', alt && Math.abs(Number(alt.value) - Math.round(sh0.h * 0.5)) <= 1, { alt: alt?.value, esperado: Math.round(sh0.h * 0.5) });
  clickEl(porTexto('.insp-tab', /^Posição$/));
  await sleep(200);
  const lx = campo(/^Largura X/)?.querySelector('input[type=number]');
  check('forma_posicao_mostra_200', lx && Number(lx.value) === 200, lx?.value);
}

// ---------- 2) prévia da biblioteca: foto/vídeo em pé cabem inteiros na área ----------
if (parte('libprev')) {
  S().newProject('16:9');
  await sleep(300);
  const f = await png('empe.png', 300, 900, (x, w, h) => { x.fillStyle = '#e33'; x.fillRect(0, 0, w, h); x.fillStyle = '#33e'; x.fillRect(0, h - 60, w, 60); });
  const [id] = await S().importPaths([f]);
  await pronto(id);
  S().openLibPreview(id);
  const img = await waitFor(() => { const i = document.querySelector('.libprev-stage img'); return i?.complete && i.naturalWidth ? i : null; }, 8000);
  await sleep(200);
  const st = document.querySelector('.libprev-stage').getBoundingClientRect();
  const r = img.getBoundingClientRect();
  // contain: a altura desenhada da foto (proporção 1:3) cabe na área; a imagem não passa da área
  const alturaDesenhada = Math.min(r.height, (r.width * 900) / 300);
  check('libprev_foto_em_pe_cabe', r.top >= st.top - 1 && r.bottom <= st.bottom + 1 && alturaDesenhada <= st.height + 1 && getComputedStyle(img).objectFit === 'contain', { st: [st.top, st.bottom], img: [r.top, r.bottom], alturaDesenhada });
  await window.api.testCapture('v113_01_libprev_em_pe');
  S().closeLibPreview();
}

// ---------- 3) legendas: o botão de transição não cobre a parte de baixo das alças ----------
if (parte('legendas_botao')) {
  S().newProject('16:9');
  await sleep(300);
  S().applyCaptions([{ start: 1, end: 2, text: 'um' }, { start: 2, end: 3, text: 'dois' }], { font: 'Montserrat', size: 60, color: '#ffffff' });
  await sleep(400);
  const caps = S().project.tracks.flatMap((t) => t.clips).filter((c) => c.caption);
  S().select({ type: 'clip', id: caps[0].id });
  await sleep(300);
  const el = document.querySelector(`.clip[data-id="${caps[0].id}"] .handle.r`);
  const row = el?.closest('.track-row');
  row?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  const btn = document.querySelector(`.trans-btn[data-tr="${caps[0].id}"]`);
  const hr = el.getBoundingClientRect(), br = btn.getBoundingClientRect();
  const alvo = document.elementFromPoint(hr.left + hr.width / 2, hr.bottom - 4);
  check('legenda_botao_pequeno_em_cima', btn.classList.contains('topo') && br.height <= 14 && br.top <= hr.top + 1, { br: [br.top, br.height], hr: [hr.top, hr.height] });
  check('legenda_alca_livre_embaixo', alvo === el, alvo?.className);
}

// ---------- 4) Ctrl+B com vários clipes selecionados ----------
if (parte('dividir')) {
  S().newProject('16:9');
  await sleep(300);
  const [v] = await S().importPaths([DIR + '/a.mp4']);
  await pronto(v);
  const a = S().addMedia(v);
  const t1 = S().addText('classic', { time: 0 });
  S().updateClip(t1, (c) => { c.duration = 6; });
  const sh = S().addShape('rect', { time: 7 }); // não está sob a agulha
  S().setTime(3);
  S().select({ type: 'clip', id: a, ids: [a, t1, sh] });
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
  await sleep(300);
  const todos = S().project.tracks.flatMap((t) => t.clips);
  const sel = S().selection;
  check('ctrl_b_divide_todos_sob_a_agulha', todos.filter((c) => c.type === 'video').length === 2 && todos.filter((c) => c.type === 'text').length === 2 && todos.filter((c) => c.type === 'shape').length === 1, todos.map((c) => [c.type, +c.start.toFixed(2), +c.duration.toFixed(2)]));
  check('ctrl_b_seleciona_as_partes_da_direita', sel.ids?.length === 2 && sel.ids.every((id) => Math.abs(clip(id).start - 3) < 1e-6), sel);
}

// ---------- 5) camadas: trazer para frente/enviar para trás, ordem das faixas, soltar em faixa ocupada ----------
if (parte('camadas')) {
  S().newProject('16:9');
  await sleep(300);
  const [img] = await S().importPaths([DIR + '/c.png']);
  await pronto(img);
  const foto = S().addMedia(img, { target: 'overlay', time: 0 });
  const txt = S().addText('classic', { time: 0 });
  await sleep(200);
  check('camadas_texto_comeca_por_cima', faixaDe(txt) < faixaDe(foto), [faixaDe(txt), faixaDe(foto)]);
  S().select({ type: 'clip', id: foto });
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', ctrlKey: true, bubbles: true }));
  await sleep(200);
  check('camadas_foto_para_frente', faixaDe(foto) < faixaDe(txt), [faixaDe(foto), faixaDe(txt)]);
  S().moverCamada('tras');
  await sleep(200);
  check('camadas_foto_para_tras', faixaDe(foto) > faixaDe(txt), [faixaDe(foto), faixaDe(txt)]);
  // ordem da faixa pelas setas do cabeçalho
  const tTxt = S().project.tracks[faixaDe(txt)].id;
  S().moverFaixa(tTxt, 1);
  await sleep(200);
  check('camadas_faixa_desce', faixaDe(txt) > faixaDe(foto) && S().project.tracks.findIndex((t) => t.main) > faixaDe(txt), S().project.tracks.map((t) => t.kind));
  check('camadas_setas_no_cabecalho', document.querySelectorAll('.track-head .ordem button').length >= 4);
  // menu do clipe
  const el = document.querySelector(`.clip[data-id="${foto}"]`);
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
  await sleep(200);
  check('camadas_no_menu', !!porTexto('.dd-item, .menu-item, button, div', /^Trazer para frente/) && !!porTexto('.dd-item, .menu-item, button, div', /^Enviar para trás/));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  // soltar num trecho ocupado de uma faixa: faixa nova logo acima dela
  const outra = S().addMedia(img, { target: 'overlay', time: 0, trackId: S().project.tracks[faixaDe(foto)].id });
  await sleep(200);
  check('camadas_ocupada_vira_faixa_acima', faixaDe(outra) === faixaDe(foto) - 1, [faixaDe(outra), faixaDe(foto)]);
}

// ---------- 6) padrão das legendas: aplicar uma legenda personalizada nas outras e salvar como meu estilo ----------
if (parte('legendas_padrao')) {
  S().newProject('16:9');
  await sleep(300);
  try { localStorage.removeItem('mc.legendasMinhas'); } catch {}
  S().applyCaptions([{ start: 0, end: 1, text: 'primeira' }, { start: 1, end: 2, text: 'segunda' }, { start: 2, end: 3, text: 'terceira' }], { font: 'Montserrat', size: 60, color: '#ffffff' });
  await sleep(300);
  const caps = S().project.tracks.flatMap((t) => t.clips).filter((c) => c.caption);
  S().updateClip(caps[0].id, (c) => { c.text.color = '#ffd60a'; c.text.size = 90; c.transform.y = -0.3; c.animIn = { id: 'fade', duration: 0.4 }; });
  S().select({ type: 'clip', id: caps[0].id });
  useStore.setState({ leftTab: 'captions' });
  await sleep(400);
  const btn = porTexto('button', /^Aplicar a todas as legendas/);
  clickEl(btn);
  await sleep(300);
  const depois = S().project.tracks.flatMap((t) => t.clips).filter((c) => c.caption);
  check('padrao_aplica_em_todas', depois.every((c) => c.text.color === '#ffd60a' && c.text.size === 90 && Math.abs(c.transform.y + 0.3) < 1e-6 && c.animIn?.id === 'fade'), depois.map((c) => [c.text.color, c.text.size, c.transform.y, c.animIn?.id]));
  check('padrao_mantem_o_texto', depois.map((c) => c.text.content).join(',') === 'primeira,segunda,terceira');
  const nome = [...document.querySelectorAll('input[placeholder="Nome do estilo"]')][0];
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(nome, 'Amarelo de cima');
  nome.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(100);
  clickEl(porTexto('button', /^Salvar$/));
  await sleep(300);
  check('padrao_salvo_em_meus_estilos', !!porTexto('.fx-card.meu .label', /^Amarelo de cima$/), [...document.querySelectorAll('.fx-card .label')].map((e) => e.textContent));
  await window.api.testCapture('v113_02_legendas_padrao');
}

// ---------- 7) sombra, pivô e perspectiva: a prévia e o vídeo exportado mostram a mesma coisa ----------
if (parte('efeitos')) {
  S().newProject('16:9');
  await sleep(300);
  const f = await png('xadrez.png', 400, 300, (x, w, h) => { for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) { x.fillStyle = (i + j) % 2 ? '#f5c518' : '#1e6fd9'; x.fillRect(i * 50, j * 50, 50, 50); } });
  const [img] = await S().importPaths([f]);
  await pronto(img);
  const a = S().addMedia(img, { target: 'overlay', time: 0 });
  S().updateClip(a, (c) => {
    c.duration = 2;
    c.transform = { ...c.transform, x: -0.18, y: 0.02, scale: 0.45, rotation: 12, pivoX: -0.5, pivoY: 0.5,
      persp: { on: true, tl: { x: 0.12, y: 0.08 }, tr: { x: -0.05, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0.04, y: -0.06 } } };
    c.sombra = { on: true, cor: '#000000', opacidade: 0.7, desfoque: 30, distancia: 30, angulo: 60 };
  });
  const sh = S().addShape('star', { time: 0 });
  S().updateClip(sh, (c) => {
    c.duration = 2;
    c.transform = { ...c.transform, x: 0.25, y: -0.05, rotation: -15, pivoX: 0.5, pivoY: -0.5, persp: { on: true, tl: { x: 0, y: 0 }, tr: { x: 0, y: 0.15 }, br: { x: 0, y: -0.1 }, bl: { x: 0, y: 0 } } };
  });
  S().select(null);
  S().setTime(1);
  await sleep(900);
  await engine.snapshotPng();
  await sleep(300);
  const previa = await window.api.writeFile('job:teste113', 'efeitos_previa.png', await engine.snapshotPng());
  const out = DIR.replace(/\//g, '\\') + '\\v113_efeitos.mp4';
  const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 1080, fps: 30, quality: 'high', vKbps: 12000, aKbps: 128, outPath: out }).promise;
  check('efeitos_exporta', r.ok, r.error);
  // a comparação prévia × exportação (PSNR) é feita fora, com o FFmpeg (caminhos no registro)
  if (r.ok) log({ efeitos_previa: previa, efeitos_export: out });
  await window.api.testCapture('v113_03_efeitos');
  // pivô no reprodutor: o alvo aparece com a camada selecionada; trocar o pivô não tira a camada do lugar
  S().select({ type: 'clip', id: a });
  await sleep(300);
  check('pivo_alvo_no_reprodutor', !!document.querySelector('svg title') && [...document.querySelectorAll('svg title')].some((t) => /Pivô/.test(t.textContent)));
  S().mudarPivo(a, 0, 0);
  const tf = clip(a).transform;
  check('pivo_centro_remove', tf.pivoX === undefined && tf.pivoY === undefined, tf);
  // perspectiva: modo de edição mostra os cantos
  useStore.setState({ perspEdit: a });
  await sleep(300);
  check('perspectiva_cantos_no_reprodutor', [...document.querySelectorAll('svg circle title')].filter((t) => /distorcer este canto/.test(t.textContent)).length === 4);
  await window.api.testCapture('v113_04_perspectiva_edicao');
  useStore.setState({ perspEdit: null });
}

log(res);
return res;
