// Teste das novidades da 1.2: corte antes de inserir, exportação (MP4/MOV, qualidade, tamanho),
// transições de câmera, giro de elementos e efeitos de iluminação/aura (prévia × exportação).
const { useStore, engine, startExport } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => window.api.testCapture(n);
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const DIR = 'C:/Users/leona/AppData/Local/Temp/munnin-cut-test';
const res = {};
const check = (name, cond, info) => { res[name] = cond ? 'OK' : `FALHOU ${info !== undefined ? JSON.stringify(info) : ''}`; };
const mainT = () => S().project.tracks.find((t) => t.main);

S().newProject('9:16');
const ids = await S().importPaths([DIR + '/a.mp4', DIR + '/c.png', DIR + '/m.mp3']);
for (let i = 0; i < 100 && !ids.every((x) => S().meta[x]?.status === 'ready' && (S().project.media.find((m) => m.id === x).type === 'image' || S().meta[x].waveform)); i++) await sleep(150);
const [a, c, mu] = ids;

// ---- 1) cortar antes de inserir (áudio) ----
document.querySelector(`.media-card[title^="m.mp3"]`)?.click();
await sleep(600);
check('janela_corte_abre', S().modal === 'trim' && S().trimMediaId === mu, S().modal);
// marca 2 s → 6,5 s pelos campos de texto
const fields = [...document.querySelectorAll('.modal input[type="text"]')];
const setField = async (el, v) => {
  el.focus();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.blur();
  await sleep(80);
};
await setField(fields[0], '00:02.00');
await setField(fields[1], '00:06.50');
await sleep(300);
await shot('60_corte_audio');
[...document.querySelectorAll('.modal .btn.primary')].find((b) => b.textContent.includes('Adicionar'))?.click();
await sleep(300);
const aud = S().project.tracks.find((t) => t.kind === 'audio')?.clips[0];
check('corte_aplicado', aud && Math.abs(aud.in - 2) < 0.02 && Math.abs(aud.duration - 4.5) < 0.02, aud && { in: aud.in, d: aud.duration });
check('corte_lembrado', !!S().project.media.find((m) => m.id === mu).trim, null);

// ---- 2) vídeo com corte e transição de câmera ----
S().openTrim(a);
await sleep(500);
await shot('61_corte_video');
useStore.setState({ modal: null, trimMediaId: null });
S().addMedia(a); S().addMedia(c); S().addMedia(a);
S().setTransition(mainT().clips[0].id, 'mc_spin', 1);
S().setTransition(mainT().clips[1].id, 'mc_whipl', 0.8);
// texto com giro de entrada
S().setTime(0.3);
const tid = S().addText('yellow', { content: 'GIRO!' });
S().updateClip(tid, (x) => { x.animIn = { id: 'spin', duration: 1 }; x.transform.y = 0.3; });
// efeitos de iluminação/aura em sequência
const seq = ['aura', 'rays', 'spotlight', 'flare', 'bokeh', 'neonBorder', 'auraNeon', 'auraWaves', 'halo', 'disco', 'lightSweep', 'fadeInOut'];
seq.forEach((id, i) => S().addEffect('effect', id, { time: 12 + i * 1.2 }));
for (const t of S().project.tracks) for (const x of t.clips) if (x.type === 'effect') S().updateClip(x.id, (y) => { y.duration = 1.2; });
S().select(null);
await sleep(300);
const m0 = mainT().clips;
log({ main: m0.map((x) => [x.type, +x.start.toFixed(2), +x.duration.toFixed(2), x.transition?.id]) });
const tSpin = +(m0[1].start + 0.25).toFixed(2), tSpin2 = +(m0[1].start + 0.6).toFixed(2), tWhip = +(m0[2].start + 0.3).toFixed(2);
const times = [0.6, 0.9, tSpin, tSpin2, tWhip, ...seq.map((_, i) => +(12 + i * 1.2 + 0.6).toFixed(2))];
const prev = [];
for (const t of times) {
  S().setTime(t);
  await sleep(800);
  const url = engine.canvas.toDataURL('image/png');
  const bytes = Uint8Array.from(atob(url.split(',')[1]), (ch) => ch.charCodeAt(0));
  prev.push(await window.api.writeFile('cache', `v12prev_${t}.png`, bytes));
}
S().setTime(tSpin);
await sleep(500);
await shot('62_transicao_giro');

// ---- 3) janela de exportação ----
useStore.setState({ modal: 'export' });
await sleep(500);
await shot('63_exportar_mp4');
[...document.querySelectorAll('.modal .seg.big button')].find((b) => b.textContent === 'MOV')?.click();
await sleep(200);
[...document.querySelectorAll('.modal .seg button')].find((b) => b.textContent === 'Personalizada')?.click();
await sleep(300);
await shot('64_exportar_mov');
const est = document.querySelector('.modal-foot b')?.textContent;
useStore.setState({ modal: null });
check('estimativa_visivel', !!est && est.includes('MB'), est);

const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 720, fps: 30, quality: 'standard', vKbps: 5000, aKbps: 192, hw: null, outPath: DIR + '/v12_export.mp4' }).promise;
check('exporta', r.ok, r.error);
log({ res, export: r, times, prev });
return res;
