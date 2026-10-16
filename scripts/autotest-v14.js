// Teste das novidades da 1.4 (feedback do Douglas): seleção múltipla, corte sem invadir o vizinho,
// formas, prévia de efeito no mouse, prévia sem piscar, pontos de modificação, transições nas faixas
// de cima, reverso, efeitos de áudio, chroma key e controles da tela cheia.
const { useStore, engine, startExport } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => window.api.testCapture(n);
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const info = await window.api.info();
const DIR = info.tempDir.replace(/[\\/]munnin-cut-jobs$/, '/munnin-cut-test').replace(/\\/g, '/');
const res = {};
const check = (name, cond, info) => { res[name] = cond ? 'OK' : `FALHOU ${info !== undefined ? JSON.stringify(info) : ''}`; };
const mainT = () => S().project.tracks.find((t) => t.main);
const clipById = (id) => S().project.tracks.flatMap((t) => t.clips).find((c) => c.id === id);
const el = (id) => document.querySelector(`.clip[data-id="${id}"]`);
const waitReady = async (ids) => { for (let i = 0; i < 200 && !ids.every((x) => ['ready', 'missing', 'error'].includes(S().meta[x]?.status)); i++) await sleep(150); };
const ev = (type, x, y, t = window, mods = {}) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, isPrimary: true, ...mods }));
function drag(target, dx, dy, opts = {}) {
  const r = target.getBoundingClientRect();
  const x0 = r.left + (opts.ox ?? r.width / 2), y0 = r.top + (opts.oy ?? r.height / 2);
  ev('pointerdown', x0, y0, target, opts.mods || {});
  for (let i = 1; i <= 8; i++) ev('pointermove', x0 + (dx * i) / 8, y0 + (dy * i) / 8);
  ev('pointerup', x0 + dx, y0 + dy);
}
const click = (target, mods = {}) => { const r = target.getBoundingClientRect(); ev('pointerdown', r.left + r.width / 2, r.top + r.height / 2, target, mods); ev('pointerup', r.left + r.width / 2, r.top + r.height / 2, window, mods); };
const px = (x, y) => { const c = document.querySelector('.player-stage canvas'); const d = c.getContext('2d').getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data; return [d[0], d[1], d[2], d[3]]; };

S().newProject('16:9');
await sleep(300);
const ids = await S().importPaths([DIR + '/a.mp4', DIR + '/b.mp4', DIR + '/c.png', DIR + '/m.mp3', DIR + '/green.mp4']);
await waitReady(ids);
const [a, b, c, mu, gr] = ids;
S().addMedia(a); S().addMedia(b);
const o1 = S().addMedia(c, { target: 'overlay', time: 0 });
const ovTrack = () => S().project.tracks.find((t) => t.clips.some((x) => x.id === o1));
S().updateClip(o1, (x) => { x.duration = 2; x.transform.x = 0.25; x.transform.scale = 0.4; });
const o2 = S().addMedia(c, { target: 'overlay', time: 2, trackId: ovTrack().id });
S().updateClip(o2, (x) => { x.duration = 2; x.transform.x = 0.25; x.transform.scale = 0.4; x.adjust = { hue: 80, saturation: 60 }; });
useStore.setState({ zoom: 50 });
S().select(null);
await sleep(500);
check('dois_na_mesma_faixa', ovTrack().clips.length === 2, ovTrack().clips.map((x) => [x.start, x.duration]));

// ---- 1) corte não invade o clipe ao lado (puxar a borda direita de o1 sobre o2) ----
drag(el(o1).querySelector('.handle.r'), 150, 0, { ox: 3 });
await sleep(200);
check('corte_nao_sobrepoe', clipById(o1).duration <= 2.001 && ovTrack().clips.length === 2, { d: clipById(o1).duration });
// puxar a borda esquerda de o2 para cima de o1
drag(el(o2).querySelector('.handle.l'), -120, 0, { ox: 3 });
await sleep(200);
check('corte_esquerdo_nao_sobrepoe', clipById(o2).start >= 1.999, { s: clipById(o2).start });

// ---- 2) seleção múltipla: Ctrl+clique, arrastar em grupo, Ctrl+A, retângulo ----
S().select(null);
click(el(o1));
await sleep(50);
click(el(o2), { ctrlKey: true });
await sleep(100);
check('ctrl_clique_seleciona_dois', S().selection?.ids?.length === 2, S().selection);
check('painel_selecao_multipla', !!document.querySelector('.insp-tab.active') && document.querySelector('.insp-tab.active').textContent === 'Seleção');
await shot('80_selecao_multipla');
drag(el(o1), 50, 0);
await sleep(200);
check('mover_em_grupo', Math.abs(clipById(o1).start - 1) < 0.05 && Math.abs(clipById(o2).start - 3) < 0.05, [clipById(o1).start, clipById(o2).start]);
S().undo();
await sleep(100);
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
await sleep(100);
const total = S().project.tracks.reduce((n, t) => n + t.clips.length, 0);
check('ctrl_a_seleciona_tudo', S().selection?.ids?.length === total, { sel: S().selection?.ids?.length, total });
S().select(null);
// retângulo: da área vazia acima das faixas até a faixa principal, cobrindo 0–3 s
const content = document.querySelector('.tl-content');
const rc = content.getBoundingClientRect();
const mainRow = document.querySelector('.track-row.main').getBoundingClientRect();
const ovRow = el(o1).parentElement.getBoundingClientRect();
ev('pointerdown', rc.left + 14 + 0.2 * 50, ovRow.top - 4, content);
for (let i = 1; i <= 6; i++) ev('pointermove', rc.left + 14 + 0.2 * 50 + (i * 150) / 6, ovRow.top - 4 + (i * (mainRow.top + 20 - ovRow.top + 4)) / 6);
await sleep(50);
await shot('81_retangulo_selecao');
ev('pointerup', rc.left + 14 + 150, mainRow.top + 16);
await sleep(100);
check('retangulo_seleciona', (S().selection?.ids || []).includes(o1) && (S().selection?.ids || []).includes(mainT().clips[0].id), S().selection);
S().select(null);

// ---- 3) formas ----
S().setTime(1);
const sh = S().addShape('star', { time: 0.5 });
S().updateClip(sh, (x) => { x.transform.x = -0.3; x.transform.y = -0.25; x.shape.fill = '#ff4d9d'; x.shape.stroke = { enabled: true, color: '#ffffff', width: 12 }; });
useStore.setState({ leftTab: 'shapes' });
await sleep(400);
check('forma_criada', clipById(sh)?.type === 'shape' && !!document.querySelector('.shape-card'));
await shot('82_formas');

// ---- 4) transição entre clipes de uma faixa de cima ----
const okT = S().setTransition(o1, 'circleopen', 1);
await sleep(100);
check('transicao_faixa_de_cima', okT && clipById(o1).transition?.id === 'circleopen' && !!document.querySelector(`.trans-btn[data-tr="${o1}"]`));
S().setTransition(o1, 'slideleft', 1);
check('so_transicoes_de_mistura', clipById(o1).transition?.id === 'fade', clipById(o1).transition);
S().setTransition(o1, 'circleopen', 1);
S().select(null);
S().setTime(2.0);
await sleep(700);
await shot('83_transicao_faixa_de_cima');

// ---- 5) pontos de modificação ----
S().select({ type: 'clip', id: o2 });
S().setTime(2.2);
S().toggleKeyframes();
S().setTime(3.6);
S().updateClip(o2, (x) => {
  x.kf.x = x.kf.x.concat([{ t: 1.6, v: -0.25 }]);
  x.kf.scale = x.kf.scale.concat([{ t: 1.6, v: 0.7 }]);
  x.kf.scaleX = x.kf.scaleX.concat([{ t: 1.6, v: 1.6 }]);
  x.kf.scaleY = x.kf.scaleY.concat([{ t: 1.6, v: 0.75 }]);
  x.kf['adjust.brightness'] = x.kf['adjust.brightness'].concat([{ t: 1.6, v: 70 }]);
});
const k2 = clipById(o2).kf;
check('pontos_criados', k2 && k2.x?.length === 2 && k2.scaleX?.length === 2 && k2.scaleY?.length === 2 && k2.opacity?.length === 1, k2 && Object.fromEntries(Object.entries(k2).map(([p, l]) => [p, l.length])));
S().setTime(2.9);
await sleep(400);
useStore.setState({ leftTab: 'media' });
await sleep(200);
const dots = el(o2).querySelectorAll('.kf-dot').length;
check('losangos_na_linha_do_tempo', dots === 2, dots);
const sliders = [...document.querySelectorAll('.kf-btn')];
check('losangos_no_inspetor', sliders.length >= 7 && sliders.some((x) => x.classList.contains('has')), sliders.length);
await shot('84_pontos_modificacao');
// dividir mantém os valores nos dois lados
const before = JSON.stringify(clipById(o2).kf.x);
S().select({ type: 'clip', id: o2 });
S().splitAt(3.0);
const right = S().selection.id;
check('dividir_mantem_pontos', clipById(o2).kf?.x?.length >= 2 && clipById(right).kf?.x?.length >= 1, { antes: before, esq: clipById(o2).kf?.x, dir: clipById(right).kf?.x });
S().undo();

// ---- 6) prévia do efeito ao passar o mouse (sem aplicar) ----
S().select({ type: 'clip', id: mainT().clips[0].id });
S().setTime(1.0);
await sleep(500);
const p0 = px(0.15, 0.85);
useStore.setState({ fxPreview: { kind: 'filter', id: 'bw', since: performance.now() } });
await sleep(400);
const p1 = px(0.15, 0.85);
const gray = Math.abs(p1[0] - p1[1]) < 6 && Math.abs(p1[1] - p1[2]) < 6;
check('previa_filtro_no_mouse', gray && mainT().clips[0].filter?.id !== 'bw', { p0, p1, filtro: mainT().clips[0].filter });
await shot('85_previa_filtro_mouse');
useStore.setState({ fxPreview: null });

// ---- 7) chroma key ----
const g1 = S().addMedia(gr, { target: 'overlay', time: 4.2 });
S().updateClip(g1, (x) => { x.duration = 2; x.transform.scale = 0.5; x.transform.x = -0.2; x.chroma = { on: true, color: '#00d639', similarity: 30, smooth: 12, spill: true }; });
S().select(null);
S().setTime(5.0);
await sleep(1200);
const L = engine.comp.layers.get(g1);
const corner = L ? L.ctx.getImageData(2, 2, 1, 1).data[3] : -1;
const middle = L ? L.ctx.getImageData(Math.floor(L.canvas.width / 2), Math.floor(L.canvas.height / 2), 1, 1).data[3] : -1;
check('chroma_remove_fundo', corner === 0 && middle > 200, { corner, middle });
await shot('86_chroma_key');

// ---- 8) reverso ----
const m1 = mainT().clips[0].id;
S().toggleReverse(m1);
for (let i = 0; i < 200 && S().meta[a]?.rev?.video?.status !== 'ready'; i++) await sleep(150);
const rv = S().meta[a]?.rev?.video;
check('reverso_preparado', rv?.status === 'ready' && Math.abs(rv.duration - 8) < 0.2, rv && { st: rv.status, d: rv.duration, p: rv.path });
S().setTime(0.5);
await sleep(600);
const e1 = engine.pool.els.get(m1);
check('reverso_na_previa', !!e1 && /_rev\.mp4/.test(decodeURIComponent(e1.el.src)), e1 && decodeURIComponent(e1.el.src).slice(-40));

// ---- 9) efeito de áudio ----
S().updateClip(m1, (x) => { x.audioFx = { id: 'echo', mix: 80, bass: 3, treble: 0, denoise: false }; });
S().play();
await sleep(600);
S().pause();
check('efeito_audio_na_previa', !!engine.pool.els.get(m1)?.fx, engine.pool.els.get(m1)?.fxKey);
S().select({ type: 'clip', id: m1 });
await sleep(200);
[...document.querySelectorAll('.insp-tab')].find((x) => x.textContent === 'Áudio')?.click();
await sleep(300);
await shot('87_efeitos_audio');

// ---- 10) prévia sem piscar: quadro guardado depois de buscar ----
S().select(null);
for (const t of [4.3, 4.8, 5.4]) { S().setTime(t); await sleep(300); }
check('quadro_guardado_para_nao_piscar', engine.pool.frames.has(g1), [...engine.pool.frames.keys()]);

// ---- 11) tela cheia com controles ----
const fsr = await window.api.testGesture("document.querySelector('.player-stage').requestFullscreen().then(() => 'ok').catch((e) => e.message)");
if (fsr !== 'ok') log('tela cheia: ' + fsr);
await sleep(800);
const bar = document.querySelector('.fs-bar');
check('controles_tela_cheia', !!bar && !!bar.querySelector('.play-btn') && !!bar.querySelector('input[type=range]'), !!bar);
await shot('88_tela_cheia');
if (document.fullscreenElement) await document.exitFullscreen();
await sleep(400);

// ---- 12) exportação com tudo ----
S().select(null);
const t0 = performance.now();
const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 720, fps: 30, quality: 'standard', vKbps: 5000, aKbps: 192, outPath: DIR + '/ui_v14.mp4' }).promise;
check('exporta_tudo', r.ok, r.error);
log({ export_s: ((performance.now() - t0) / 1000).toFixed(1), tamanho: r.size });

log(res);
return res;
