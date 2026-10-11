// Teste das novidades da 1.3: resiliência das mídias, legendas automáticas, play do trecho de áudio,
// luzes suaves e cache das camadas na exportação.
const { useStore, engine, startExport, generateCaptions } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => window.api.testCapture(n);
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const DIR = 'C:/Users/leona/AppData/Local/Temp/munnin-cut-test';
const res = {};
const check = (name, cond, info) => { res[name] = cond ? 'OK' : `FALHOU ${info !== undefined ? JSON.stringify(info) : ''}`; };
const waitReady = async (ids) => { for (let i = 0; i < 150 && !ids.every((x) => ['ready', 'missing', 'error'].includes(S().meta[x]?.status)); i++) await sleep(150); };
const mainT = () => S().project.tracks.find((t) => t.main);

S().newProject('9:16');
const ids = await S().importPaths([DIR + '/falado.mp4', DIR + '/resil/post.png', DIR + '/m.mp3']);
await waitReady(ids);
const [vid, img, mus] = ids;
S().addMedia(vid); S().addMedia(img);
S().applyFilter(mainT().clips[1].id, 'warm');
S().setTransition(mainT().clips[0].id, 'mc_spin', 0.8);
S().addMedia(mus, { target: 'audio', time: 0 });

// ---- 1) play toca só o trecho do áudio selecionado ----
const aud = S().project.tracks.find((t) => t.kind === 'audio').clips[0];
S().updateClip(aud.id, (c) => { c.start = 2; c.duration = 1.5; });
S().setTime(10);
S().select({ type: 'clip', id: aud.id });
check('clique_leva_ao_inicio_do_audio', Math.abs(S().time - 2) < 0.01, S().time);
S().play();
await sleep(2300);
check('play_para_no_fim_do_audio', !S().playing && Math.abs(S().time - 3.5) < 0.05, { playing: S().playing, t: S().time });
S().select(null);

// ---- 2) legendas automáticas ----
const t0 = performance.now();
let n = 0;
try { n = await generateCaptions({ source: 'project', language: 'pt', model: 'base', styleId: 'clean', lines: 2, replace: true, prompt: '' }); }
catch (e) { log('ERRO legendas ' + e.message); }
const caps = S().project.tracks.flatMap((t) => t.clips).filter((c) => c.caption).sort((a, b) => a.start - b.start);
const txt = caps.map((c) => c.text.content.replace(/\n/g, ' ')).join(' ');
check('legendas_criadas', n > 3 && /culto/i.test(txt) && /domingo/i.test(txt), { n, txt: txt.slice(0, 120) });
log({ legendas: caps.map((c) => [+c.start.toFixed(2), +c.duration.toFixed(2), c.text.content]), segundos: ((performance.now() - t0) / 1000).toFixed(1) });
useStore.setState({ leftTab: 'captions' });
S().setTime(caps[1]?.start + 0.3 || 3);
await sleep(800);
await shot('70_legendas');

// ---- 3) luz suave (prévia) ----
S().addEffect('effect', 'heavenly', { time: 0 });
S().addEffect('effect', 'softGlow', { time: 0 });
S().select(null);
S().setTime(6);
useStore.setState({ leftTab: 'effects' });
[...document.querySelectorAll('.lp-body .btn.small')].find((b) => b.textContent === 'Luz suave')?.click();
await sleep(900);
await shot('71_luz_suave');

// ---- 4) exportação: 1ª vez e de novo (cache das camadas) ----
const exp = async () => {
  const a = performance.now();
  const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 1080, fps: 30, quality: 'standard', vKbps: 8000, aKbps: 192, outPath: DIR + '/v13_export.mp4' }).promise;
  return { ok: r.ok, s: (performance.now() - a) / 1000, err: r.error };
};
const e1 = await exp();
const e2 = await exp();
check('exporta', e1.ok && e2.ok, [e1, e2]);
check('reexporta_mais_rapido', e2.s < e1.s, [e1.s.toFixed(1), e2.s.toFixed(1)]);
log({ export1: e1.s.toFixed(1), export2: e2.s.toFixed(1) });

// ---- 5) resiliência ----
const imgClip = () => mainT().clips.find((c) => c.mediaId === img);
// 5a) arquivo trocado no mesmo lugar, com o mesmo nome
await window.api.testFs('copy', DIR + '/c.png', DIR + '/resil/tmp.png');
await window.api.testFs('replaceWithVideoFrame', DIR + '/falado.mp4', DIR + '/resil/post.png');
await S().recheckMedia();
await waitReady([img]);
await sleep(500);
const m1 = S().project.media.find((m) => m.id === img);
check('arquivo_trocado_detectado', S().mediaNotices.some((x) => x.id === img && x.kind === 'updated') && m1.width === 1280, { notices: S().mediaNotices, w: m1.width });
check('efeito_mantido_apos_troca', imgClip()?.filter?.id === 'warm', imgClip()?.filter);
// 5b) arquivo movido para uma subpasta
await window.api.testFs('move', DIR + '/resil/post.png', DIR + '/resil/sub/post.png');
await S().recheckMedia();
await waitReady([img]);
await sleep(500);
const m2 = S().project.media.find((m) => m.id === img);
check('arquivo_movido_reencontrado', /sub[\\/]post\.png$/i.test(m2.path) && S().meta[img].status === 'ready', { path: m2.path, st: S().meta[img].status });
await sleep(300);
await shot('72_reencontrado');
// 5c) arquivo apagado
await window.api.testFs('delete', DIR + '/resil/sub/post.png');
await S().recheckMedia();
await waitReady([img]);
await sleep(500);
check('arquivo_ausente_avisado', S().meta[img].status === 'missing' && !!document.querySelector('.media-bar.warn'), S().meta[img]);
await shot('73_ausente');
await window.api.testFs('copy', DIR + '/c.png', DIR + '/resil/post.png');

log(res);
return res;
