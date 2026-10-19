// Teste da 1.6 (contribuição do Douglas Zanetti): largura (X) e altura (Y) independentes — controles no
// inspetor, alças laterais no reprodutor, projetos antigos sem os campos, pontos de modificação e exportação
// de texto girado com largura animada (precisa da caixa fixa antes do rotate do FFmpeg).
const { useStore, startExport } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => window.api.testCapture(n);
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const info = await window.api.info();
const DIR = info.tempDir.replace(/[\\/]munnin-cut-jobs$/, '/munnin-cut-test').replace(/\\/g, '/');
const res = {};
const check = (name, cond, i) => { res[name] = cond ? 'OK' : `FALHOU ${i !== undefined ? JSON.stringify(i) : ''}`; };
const waitReady = async (ids) => { for (let i = 0; i < 200 && !ids.every((x) => ['ready', 'missing', 'error'].includes(S().meta[x]?.status)); i++) await sleep(150); };
const clip = (id) => S().project.tracks.flatMap((t) => t.clips).find((c) => c.id === id);
const ev = (type, x, y, t = window) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, isPrimary: true }));

S().newProject('9:16');
await sleep(300);
const [a, c] = await S().importPaths([DIR + '/a.mp4', DIR + '/c.png']);
await waitReady([a, c]);
S().addMedia(a);
const o = S().addMedia(c, { target: 'overlay', time: 0 });
// projeto antigo: transform sem scaleX/scaleY
S().updateClip(o, (x) => { delete x.transform.scaleX; delete x.transform.scaleY; x.transform.scale = 0.5; });
S().select({ type: 'clip', id: o });
S().setTime(1);
await sleep(600);
const labels = [...document.querySelectorAll('.field label')].map((x) => x.textContent);
check('inspetor_largura_altura', labels.some((l) => /Largura X/.test(l)) && labels.some((l) => /Altura Y/.test(l)), labels.slice(0, 12));
check('projeto_antigo_vale_1', clip(o).transform.scaleX === undefined);

// alças laterais no reprodutor: a da direita estica só a largura
const handles = [...document.querySelectorAll('svg rect')].filter((r) => r.style.cursor === 'ew-resize');
const vhandles = [...document.querySelectorAll('svg rect')].filter((r) => r.style.cursor === 'ns-resize');
check('alcas_laterais', handles.length === 2 && vhandles.length === 2, { ew: handles.length, ns: vhandles.length });
const right = handles.map((h) => ({ h, r: h.getBoundingClientRect() })).sort((p, q) => q.r.left - p.r.left)[0];
const x0 = right.r.left + right.r.width / 2, y0 = right.r.top + right.r.height / 2;
ev('pointerdown', x0, y0, right.h);
for (let i = 1; i <= 6; i++) ev('pointermove', x0 + (40 * i) / 6, y0);
ev('pointerup', x0 + 40, y0);
await sleep(200);
const tf = clip(o).transform;
check('alca_estica_so_largura', (tf.scaleX ?? 1) > 1.05 && (tf.scaleY ?? 1) === 1 && Math.abs(tf.scale - 0.5) < 1e-6, tf);
await shot('v16_01_largura');

// pontos de modificação de largura/altura e girar
S().updateClip(o, (x) => { x.transform.rotation = 25; x.kf = { scaleX: [{ t: 0, v: 1 }, { t: 2, v: 2 }], scaleY: [{ t: 0, v: 1 }, { t: 2, v: 0.6 }] }; });
S().setTime(2.5);
await sleep(400);
await shot('v16_02_pontos');
// texto girado com largura animada (o caso que cortava sem a caixa fixa)
S().setTime(0);
const t1 = S().addText('classic', { time: 0, content: 'MUNNIN CUT' });
S().updateClip(t1, (x) => { x.duration = 3; x.transform.rotation = 30; x.kf = { scaleX: [{ t: 0, v: 1 }, { t: 2.5, v: 2.2 }] }; });
await sleep(300);
const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 720, fps: 30, quality: 'standard', vKbps: 4000, aKbps: 128, outPath: DIR + '/v16_escala.mp4' }).promise;
check('exporta_com_largura_altura', r.ok, r.error);
log({ export: r.ok, size: r.size });
log(res);
return res;
