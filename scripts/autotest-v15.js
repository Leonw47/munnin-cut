// Teste das novidades da 1.5: seleção na biblioteca (clique, Ctrl, Shift, Ctrl+A, Delete), corte direto no
// cartão (sem janela), arrastar vários itens, biblioteca de efeitos sonoros e áudio do YouTube.
const { useStore } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => window.api.testCapture(n);
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const DIR = 'C:/Users/leona/AppData/Local/Temp/munnin-cut-test';
const res = {};
const check = (name, cond, info) => { res[name] = cond ? 'OK' : `FALHOU ${info !== undefined ? JSON.stringify(info) : ''}`; };
const waitReady = async (ids) => { for (let i = 0; i < 200 && !ids.every((x) => ['ready', 'missing', 'error'].includes(S().meta[x]?.status)); i++) await sleep(150); };
const waitFor = async (fn, ms = 10000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(100); } return null; };
const ev = (type, x, y, t = window, mods = {}) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, isPrimary: true, ...mods }));
const clickEl = (el, mods = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...mods }));
const key = (k, mods = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }));
const card = (id) => document.querySelector(`.media-card[data-id="${id}"]`);
const setInput = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
const allClips = () => S().project.tracks.flatMap((t) => t.clips);
function dragHandle(el, dx, mods = {}) {
  const r = el.getBoundingClientRect(), x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
  ev('pointerdown', x0, y0, el, mods);
  for (let i = 1; i <= 6; i++) ev('pointermove', x0 + (dx * i) / 6, y0, window, mods);
  ev('pointerup', x0 + dx, y0, window, mods);
}
function dropOnTimeline(srcEl, fracX = 0.3) {
  const dt = new DataTransfer();
  srcEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  const tl = document.querySelector('.tl-content') || document.querySelector('[class*="timeline"] [class*="content"]');
  const r = tl.getBoundingClientRect();
  const x = r.left + r.width * fracX, y = r.top + r.height * 0.85;
  tl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
  tl.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
  srcEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
}
window.confirm = () => true;

S().newProject('9:16');
await sleep(300);
const ids = await S().importPaths([DIR + '/a.mp4', DIR + '/b.mp4', DIR + '/c.png', DIR + '/m.mp3']);
await waitReady(ids);
const [a, b, c, mu] = ids;
useStore.setState({ leftTab: 'media' });
await sleep(400);

// ---- 1) seleção: clique, Ctrl+clique, Shift+clique ----
clickEl(card(a));
await sleep(80);
check('clique_seleciona_um', S().libSel.join() === a && S().libFocus, S().libSel);
clickEl(card(c), { ctrlKey: true });
await sleep(80);
check('ctrl_clique_soma', S().libSel.length === 2 && S().libSel.includes(c), S().libSel);
clickEl(card(a), { ctrlKey: true });
await sleep(80);
check('ctrl_clique_tira', S().libSel.join() === c, S().libSel);
clickEl(card(b));
clickEl(card(mu), { shiftKey: true });
await sleep(80);
check('shift_clique_intervalo', S().libSel.join() === [b, c, mu].join(), S().libSel);
await shot('v15_01_selecao_varios');
key('Escape');
await sleep(50);
check('esc_limpa', S().libSel.length === 0);
clickEl(card(a));
key('a', { ctrlKey: true });
await sleep(50);
check('ctrl_a_na_biblioteca', S().libSel.length === 4, S().libSel);

// ---- 2) clicar fora devolve as teclas para a linha do tempo ----
S().addMedia(a);
const tlEl = document.querySelector('.timeline') || document.querySelector('[class*="timeline"]');
ev('pointerdown', 5, 5, tlEl);
ev('pointerup', 5, 5);
await sleep(50);
check('clique_fora_limpa_selecao', !S().libFocus && S().libSel.length === 0);
const clipA = allClips()[0].id;
S().select({ type: 'clip', id: clipA });
key('Delete');
await sleep(80);
check('delete_na_linha_do_tempo_continua', !allClips().some((x) => x.id === clipA) && S().project.media.some((m) => m.id === a));

// ---- 3) Delete remove os selecionados da biblioteca ----
clickEl(card(b));
clickEl(card(c), { ctrlKey: true });
key('Delete');
await sleep(150);
check('delete_remove_selecionados', !S().project.media.some((m) => m.id === b || m.id === c) && S().project.media.length === 2, S().project.media.map((m) => m.name));

// ---- 4) corte direto no cartão (vídeo) ----
clickEl(card(a));
await sleep(300);
const bar = card(a).querySelector('.itrim');
check('cartao_mostra_alcas', !!bar && !!card(a).querySelector('.itrim-h.a') && !!card(a).querySelector('.itrim-h.b'));
const bw = bar.getBoundingClientRect().width;
const dA = S().project.media.find((m) => m.id === a).duration;
dragHandle(card(a).querySelector('.itrim-h.a'), bw * 0.25);
await sleep(150);
let tr = S().project.media.find((m) => m.id === a).trim;
check('arrastar_inicio', tr && Math.abs(tr.in - dA * 0.25) < dA * 0.04 && Math.abs(tr.out - dA) < 0.01, tr);
dragHandle(card(a).querySelector('.itrim-h.b'), -bw * 0.25);
await sleep(150);
tr = S().project.media.find((m) => m.id === a).trim;
check('arrastar_fim', tr && Math.abs(tr.out - dA * 0.75) < dA * 0.04, tr);
const before = tr.out;
dragHandle(card(a).querySelector('.itrim-h.b'), -bw * 0.2, { shiftKey: true });
await sleep(150);
tr = S().project.media.find((m) => m.id === a).trim;
check('shift_ajuste_fino', tr && Math.abs((before - tr.out) - dA * 0.02) < dA * 0.01, { before, out: tr.out });
check('mostra_tempos', /\d:\d\d\.\d–\d:\d\d\.\d/.test(card(a).querySelector('.itrim-times')?.textContent || ''), card(a).querySelector('.itrim-times')?.textContent);
await shot('v15_02_corte_no_cartao_video');
const cid = S().addMedia(a);
const cl = allClips().find((x) => x.id === cid);
check('insercao_usa_o_corte', cl && Math.abs(cl.in - tr.in) < 0.01 && Math.abs(cl.duration - (tr.out - tr.in)) < 0.05, { in: cl?.in, dur: cl?.duration, tr });
card(a).querySelector('.itrim').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
await sleep(100);
check('clique_duplo_volta_inteira', !S().project.media.find((m) => m.id === a).trim);

// ---- 5) corte no cartão (áudio, ocupa a miniatura) + janela continua no botão direito ----
clickEl(card(mu));
await sleep(300);
const abar = card(mu).querySelector('.itrim.full');
check('audio_alcas_na_miniatura', !!abar);
dragHandle(card(mu).querySelector('.itrim-h.a'), abar.getBoundingClientRect().width * 0.5);
await sleep(150);
check('audio_corte', Math.abs((S().project.media.find((m) => m.id === mu).trim?.in || 0) - 5) < 0.5, S().project.media.find((m) => m.id === mu).trim);
await shot('v15_03_corte_no_cartao_audio');
card(mu).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 300 }));
await sleep(150);
const mi = [...document.querySelectorAll('.ctx-menu .dd-item')].find((x) => /Cortar antes de inserir/.test(x.textContent));
check('menu_direito_tem_janela_de_corte', !!mi);
mi?.click();
await sleep(400);
check('janela_de_corte_abre', S().modal === 'trim');
useStore.setState({ modal: null, trimMediaId: null });
await sleep(200);

// ---- 6) arrastar vários itens para a linha do tempo ----
const nBefore = allClips().length;
clickEl(card(a));
clickEl(card(mu), { ctrlKey: true });
dropOnTimeline(card(a), 0.2);
await sleep(400);
check('arrastar_varios', allClips().length === nBefore + 2, { antes: nBefore, depois: allClips().length });

// ---- 7) efeitos sonoros ----
useStore.setState({ leftTab: 'sfx' });
await sleep(600);
[...document.querySelectorAll('.lp-body .btn.small')].find((x) => x.textContent === 'Transições')?.click();
await sleep(200);
const cats = [...document.querySelectorAll('.lp-body .btn.small')].map((x) => x.textContent);
// 1.8: + "Meus sons" (biblioteca pessoal) antes das 9 categorias do app
// 1.9: + categorias dos sons livres (CC0)
check('sfx_categorias', cats.length === 19 && /Meus sons/.test(cats[0]) && cats.includes('Transições') && cats.includes('Natureza e clima') && cats.includes('Animais'), cats);
check('sfx_cartoes', document.querySelectorAll('.sfx-card').length >= 25 && !!document.querySelector('.sfx-card[data-sfx="whoosh"]') && !!document.querySelector('.sfx-card[data-sfx="b1796"]'), document.querySelectorAll('.sfx-card').length);
await shot('v15_04_sons_transicoes');
const whoosh = document.querySelector('.sfx-card[data-sfx="whoosh"]');
clickEl(whoosh);
await sleep(500);
check('sfx_previa_toca', whoosh.classList.contains('active'));
clickEl(whoosh);
const tSfx = 1.5;
S().setTime(tSfx);
whoosh.querySelector('button.plus').click();
const sfxClip = await waitFor(() => allClips().find((x) => x.type === 'audio' && S().project.media.find((m) => m.id === x.mediaId)?.name === 'Whoosh.wav'));
check('sfx_entra_no_cursor', sfxClip && Math.abs(sfxClip.start - tSfx) < 0.05, sfxClip);
const mWhoosh = sfxClip && S().project.media.find((m) => m.id === sfxClip.mediaId);
const [ex] = mWhoosh ? await window.api.exists([mWhoosh.path]) : [false];
check('sfx_copiado_para_documentos', ex && /Efeitos sonoros[\\/]Whoosh\.wav$/.test(mWhoosh.path), mWhoosh?.path);
// pesquisa e arrastar
const search = document.querySelector('.lp-body input[type=text]');
setInput(search, 'sino');
await sleep(200);
const found = [...document.querySelectorAll('.sfx-card')].map((x) => x.dataset.sfx);
check('sfx_pesquisa', found.includes('churchBell') && found.includes('bell') && found.includes('chimes'), found);
await shot('v15_05_sons_pesquisa');
const nB = allClips().length;
dropOnTimeline(document.querySelector('.sfx-card[data-sfx="churchBell"]'), 0.5);
await waitFor(() => allClips().length > nB, 8000);
check('sfx_arrastar', allClips().length === nB + 1 && S().project.media.some((m) => m.name === 'Sino de igreja.wav'));
setInput(search, '');
for (const catName of ['Natureza e clima', 'Games 8-bit']) {
  [...document.querySelectorAll('.lp-body .btn.small')].find((x) => x.textContent === catName)?.click();
  await sleep(250);
}
await shot('v15_06_sons_games');

// ---- 8) áudio do YouTube ----
useStore.setState((st) => ({ leftTab: 'audio', ytFocus: st.ytFocus + 1 }));
await sleep(600);
// 1.8: o link abre a prévia (player do YouTube) e o trecho é escolhido lá
const yin = document.querySelector('.yt-box input[type=text]');
check('youtube_campo_focado', document.activeElement === yin);
await shot('v15_07_youtube_painel');
setInput(yin, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
await sleep(100);
[...document.querySelectorAll('.yt-box .btn')].find((x) => /Ver/.test(x.textContent))?.click();
await waitFor(() => document.querySelector('.modal .yt-player webview'), 8000);
[...document.querySelectorAll('.modal .yt-opt')].find((x) => /trecho/.test(x.textContent))?.querySelector('.toggle')?.click();
await sleep(200);
const campo = (rot) => [...document.querySelectorAll('.modal label')].find((l) => l.textContent.trim().startsWith(rot))?.querySelector('input');
for (const [rot, v] of [['Início', '0:30'], ['Fim', '0:41']]) {
  const inp = campo(rot);
  inp?.focus();
  if (inp) setInput(inp, v);
  await sleep(50);
  inp?.blur();   // o campo de tempo confirma ao sair dele
  await sleep(100);
}
S().setTime(3);
const nY = S().project.media.length;
[...document.querySelectorAll('.modal-foot .btn.primary')].find((x) => /Baixar/.test(x.textContent))?.click();
await sleep(1500);
await shot('v15_08_youtube_baixando');
let ym = await waitFor(() => S().project.media.length > nY && S().project.media.find((m) => /Áudios do YouTube/.test(m.path)), 180000);
await waitReady(ym ? [ym.id] : []);
ym = ym && S().project.media.find((m) => m.id === ym.id);
check('youtube_baixa_e_importa', !!ym && /Big Buck Bunny/.test(ym.name) && Math.abs(ym.duration - 11) < 1.2, ym && { name: ym.name, dur: ym.duration });
const yc = ym && allClips().find((x) => x.mediaId === ym.id);
check('youtube_entra_no_cursor', yc && Math.abs(yc.start - 3) < 0.05, yc);
await sleep(500);
await shot('v15_09_youtube_pronto');
const st = await window.api.ytStatus();
check('youtube_status', st.installed && !!st.version && Date.now() - st.checkedAt < 86400e3, st);
setInput(yin, 'https://vimeo.com/1');
await sleep(100);
[...document.querySelectorAll('.yt-box .btn')].find((x) => /Pesquisar|Ver/.test(x.textContent))?.click();
await waitFor(() => document.querySelector('.yt-err'), 5000);
check('youtube_erro_amigavel', /YouTube e do Instagram/.test(document.querySelector('.yt-err')?.textContent || ''), document.querySelector('.yt-err')?.textContent);

// ---- 9) painel Mídia: botão YouTube leva ao campo ----
useStore.setState({ leftTab: 'media' });
await sleep(300);
[...document.querySelectorAll('.lp-row .btn')].find((x) => /YouTube/.test(x.textContent))?.click();
await sleep(500);
check('botao_youtube_na_midia', S().leftTab === 'audio' && document.activeElement === document.querySelector('.yt-box input[type=text]'));

log(res);
return res;
