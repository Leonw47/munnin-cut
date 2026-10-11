// Teste de interações (mouse/teclado simulados) dentro da interface.
const { useStore } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => window.api.testCapture(n);
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const DIR = 'C:/Users/leona/AppData/Local/Temp/munnin-cut-test';
const mainT = () => S().project.tracks.find((t) => t.main);
const el = (id) => document.querySelector(`.clip[data-id="${id}"]`);
const res = {};
const check = (name, cond, info) => { res[name] = cond ? 'OK' : `FALHOU ${info ? JSON.stringify(info) : ''}`; };

function drag(target, dx, dy, opts = {}) {
  const r = target.getBoundingClientRect();
  const x0 = r.left + (opts.ox ?? r.width / 2), y0 = r.top + (opts.oy ?? r.height / 2);
  const ev = (type, x, y, t = window) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, isPrimary: true }));
  ev('pointerdown', x0, y0, target);
  for (let i = 1; i <= 8; i++) ev('pointermove', x0 + (dx * i) / 8, y0 + (dy * i) / 8);
  ev('pointerup', x0 + dx, y0 + dy);
}
const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));

S().newProject('16:9');
await sleep(300);
const ids = await S().importPaths([DIR + '/a.mp4', DIR + '/b.mp4', DIR + '/c.png', DIR + '/m.mp3']);
for (let i = 0; i < 100 && !ids.every((id) => S().meta[id]?.status === 'ready'); i++) await sleep(150);
const [a, b, c, mu] = ids;
S().addMedia(a); S().addMedia(c); S().addMedia(b);
useStore.setState({ zoom: 50 });
await sleep(400);

// 1) aparar à direita o 1º clipe (−100 px = −2 s)
let c0 = mainT().clips[0];
drag(el(c0.id).querySelector('.handle.r'), -100, 0, { ox: 3 });
await sleep(200);
check('aparar_direita', Math.abs(mainT().clips[0].duration - 6) < 0.05, mainT().clips[0].duration);
check('magnetica_apos_aparar', Math.abs(mainT().clips[1].start - 6) < 0.05, mainT().clips[1].start);

// 2) aparar à esquerda o 1º clipe (+50 px = +1 s no ponto de entrada)
drag(el(c0.id).querySelector('.handle.l'), 50, 0, { ox: 3 });
await sleep(200);
c0 = mainT().clips[0];
check('aparar_esquerda', Math.abs(c0.in - 1) < 0.05 && Math.abs(c0.duration - 5) < 0.05, { in: c0.in, d: c0.duration });

// 3) reordenar: arrastar o último clipe (b) para o começo
const last = mainT().clips[2];
const r0 = el(mainT().clips[0].id).getBoundingClientRect();
const rl = el(last.id).getBoundingClientRect();
drag(el(last.id), r0.left + 5 - (rl.left + rl.width / 2), 0);
await sleep(250);
check('reordenar', mainT().clips[0].id === last.id, mainT().clips.map((x) => x.mediaId));

// 4) arrastar um clipe da principal para cima (vira sobreposição)
const mv = mainT().clips[1];
drag(el(mv.id), 40, -90);
await sleep(250);
const ovT = S().project.tracks.find((t) => t.kind === 'overlay');
check('virar_sobreposicao', !!ovT && ovT.clips.some((x) => x.id === mv.id), S().project.tracks.map((t) => t.kind));

// 5) texto: adicionar e arrastar para a direita (+100 px = +2 s)
S().setTime(1);
const tid = S().addText('outline');
await sleep(200);
const t0 = S().project.tracks.flatMap((t) => t.clips).find((x) => x.id === tid).start;
drag(el(tid), 100, 0);
await sleep(200);
const t1 = S().project.tracks.flatMap((t) => t.clips).find((x) => x.id === tid).start;
check('mover_texto', Math.abs(t1 - t0 - 2) < 0.3, { t0, t1 });

// 6) caixa de transformação no reprodutor: mover o texto
S().select({ type: 'clip', id: tid });
S().setTime(t1 + 0.5);
await sleep(400);
const poly = document.querySelector('.player-stage svg polygon');
const before = { ...S().project.tracks.flatMap((t) => t.clips).find((x) => x.id === tid).transform };
if (poly) drag(poly, 40, 30);
await sleep(200);
const after = S().project.tracks.flatMap((t) => t.clips).find((x) => x.id === tid).transform;
check('arrastar_no_reprodutor', !!poly && after.x > before.x + 0.01 && after.y > before.y + 0.01, { before, after });
await shot('20_interacoes');

// 7) transição pelo botão da junção
const trBtn = document.querySelector('.trans-btn');
trBtn?.click();
await sleep(200);
check('transicao_botao', mainT().clips.some((x) => x.transition?.id === 'fade'), mainT().clips.map((x) => x.transition));

// 8) menu de contexto → Separar áudio no clipe de vídeo da principal
const vclip = mainT().clips.find((x) => x.type === 'video');
el(vclip.id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 600, clientY: 900 }));
await sleep(200);
const item = [...document.querySelectorAll('.ctx-menu .dd-item')].find((b) => b.textContent.includes('Separar áudio'));
item?.click();
await sleep(200);
check('separar_audio', S().project.tracks.some((t) => t.kind === 'audio' && t.clips.some((x) => x.mediaId === vclip.mediaId)) && mainT().clips.find((x) => x.id === vclip.id).muted, null);

// 9) teclado: espaço toca/pausa; Ctrl+Z desfaz
S().select(null);
key(' ');
await sleep(400);
const playing1 = S().playing;
key(' ');
await sleep(100);
check('espaco_toca_pausa', playing1 && !S().playing, { playing1, now: S().playing });
const nAudio = S().project.tracks.filter((t) => t.kind === 'audio').length;
key('z', { ctrlKey: true });
await sleep(100);
check('ctrl_z', S().project.tracks.filter((t) => t.kind === 'audio').length === nAudio - 1, null);
key('y', { ctrlKey: true });

// 10) salvar automático, voltar ao início e reabrir
const pid = S().project.id;
const nClips = S().project.tracks.reduce((n, t) => n + t.clips.length, 0);
await sleep(2500);
S().goHome();
await sleep(500);
await shot('21_inicio_com_rascunho');
const drafts = await window.api.listDrafts();
const d = drafts.find((x) => x.id === pid);
check('rascunho_salvo', !!d, drafts.map((x) => x.id));
if (d) {
  S().openEditor(await window.api.loadDraft(pid));
  await sleep(1500);
  const n2 = S().project.tracks.reduce((n, t) => n + t.clips.length, 0);
  check('rascunho_reaberto', n2 === nClips, { nClips, n2 });
  await shot('22_reaberto');
}
log(res);
return res;
