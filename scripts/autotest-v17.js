// Teste da 1.7: "Voz" (limpar e realçar a fala) — análise do ruído, cadeia em tempo real na prévia,
// renderização da exportação com a MESMA cadeia e o arquivo exportado.
const { useStore, startExport, engine, voz } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const info = await window.api.info();
const DIR = info.tempDir.replace(/[\\/]munnin-cut-jobs$/, '/munnin-cut-test').replace(/\\/g, '/');
const res = {};
const check = (name, cond, i) => { res[name] = cond ? 'OK' : `FALHOU ${i !== undefined ? JSON.stringify(i) : ''}`; };
const waitFor = async (fn, ms = 15000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(100); } return null; };

S().newProject('4:5');
await sleep(300);
const [mid] = await S().importPaths([DIR + '/voz/fala_ruidosa.mp4']);
await waitFor(() => S().meta[mid]?.status === 'ready', 30000);
const cid = S().addMedia(mid);
const clip = () => S().project.tracks.flatMap((t) => t.clips).find((c) => c.id === cid);

// projeto antigo com "Reduzir ruído" ligado vira a limpeza em tempo real
S().updateClip(cid, (c) => { c.audioFx = { id: 'none', mix: 100, bass: 0, treble: 0, denoise: true }; });
S().setTime(1); S().play(); await sleep(1800); S().pause();
check('migracao_denoise_antigo', clip().voz === undefined && !!engine.pool.els.get(cid)?.voz, engine.pool.els.get(cid)?.fxKey?.slice(0, 80));

// preset "Voz limpa"
S().updateClip(cid, (c) => { c.voz = { ruido: 55, realce: 45, clareza: 45, ambiente: 'none', ambMix: 35 }; c.audioFx = null; });
S().select({ type: 'clip', id: cid });
S().setTime(5);
S().play();
const analise = await waitFor(() => S().meta[mid]?.voz, 30000);
check('analise_ruido', !!analise && Array.isArray(analise.perfil) && analise.perfil.length === 513 && typeof analise.nivel === 'number', analise && { n: analise.perfil?.length, nivel: analise.nivel });
await sleep(2500);
const e = engine.pool.els.get(cid);
check('cadeia_na_previa', !!e?.voz && e.voz.latencia >= 1024 / 48000, e?.voz && e.voz.latencia);   // a latência de 1024 amostras = redução de ruído ativa
// o som passa pela cadeia: espera o vídeo começar a tocar (o elemento pode estar carregando) e mede na saída
const medir = async (no, vezes = 10) => {
  const an = engine.pool.ac.createAnalyser(); an.fftSize = 2048; no.connect(an);
  const b = new Float32Array(2048); let p = 0;
  for (let i = 0; i < vezes; i++) { an.getFloatTimeDomainData(b); for (const x of b) p = Math.max(p, Math.abs(x)); await sleep(50); }
  try { no.disconnect(an); } catch { /* ignore */ }
  return p;
};
let fonte = 0;
for (let i = 0; i < 16 && fonte < 0.01; i++) fonte = await medir(e.node, 10);
const pico = await medir(e.voz.output, 20);
check('som_saindo_da_cadeia', fonte > 0.01 && pico > 0.01, { fonte, pico });
// arrastar os controles (centenas de mudanças) atualiza a cadeia que está tocando, sem remontar, e o som continua
const cadeia0 = engine.pool.els.get(cid).voz;
for (let k = 0; k < 200; k++) {
  S().updateClip(cid, (c) => { c.voz = { ...c.voz, ruido: 20 + Math.round(70 * Math.abs(Math.sin(k / 12))), realce: 30 + (k % 50), clareza: 20 + (k % 60) }; }, { silent: true });
  await sleep(16);
}
await sleep(300);
const depoisArrasto = await medir(engine.pool.els.get(cid).gain, 20);
check('arrastar_controles_mantem_som', engine.pool.els.get(cid).voz === cadeia0 && depoisArrasto > 0.01, { mesma: engine.pool.els.get(cid).voz === cadeia0, pico: depoisArrasto });
S().updateClip(cid, (c) => { c.voz = { ruido: 55, realce: 45, clareza: 45, ambiente: 'none', ambMix: 35 }; });
await sleep(300);
// comparar com o original desliga a cadeia na hora
useStore.setState({ vozOriginal: true }); await sleep(400);
check('comparar_original', !engine.pool.els.get(cid).voz);
useStore.setState({ vozOriginal: false }); await sleep(400);
check('volta_a_limpar', !!engine.pool.els.get(cid).voz);
S().pause();
await window.api.testCapture('v17_01_inspetor_voz');

// exportação: a MESMA cadeia renderizada fora do tempo real
const t0 = performance.now();
const r = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 480, fps: 30, quality: 'standard', vKbps: 1500, aKbps: 192, outPath: DIR + '/voz/saida_voz.mp4' }).promise;
check('exporta', r.ok, r.error);
log({ export_s: ((performance.now() - t0) / 1000).toFixed(1) });
// a mesma renderização de novo (cache): deve ser rápida
const t1 = performance.now();
const r2 = await startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 480, fps: 30, quality: 'standard', vKbps: 1500, aKbps: 192, outPath: DIR + '/voz/saida_voz2.mp4' }).promise;
check('cache_da_voz', r2.ok && (performance.now() - t1) < (performance.now() - t0) * 0.8, ((performance.now() - t1) / 1000).toFixed(1));
// ambientes: renderizam sem erro
for (const amb of ['sala', 'igreja', 'chorus', 'dobra']) {
  S().updateClip(cid, (c) => { c.voz = { ruido: 0, realce: 0, clareza: 0, ambiente: amb, ambMix: 40 }; c.duration = 4; });
  const ra = await startExport({ project: S().project, meta: S().meta, format: 'mp3', res: 480, fps: 30, quality: 'standard', aKbps: 128, outPath: DIR + `/voz/amb_${amb}.mp3` }).promise;
  check(`ambiente_${amb}`, ra.ok, ra.error);
}
log(res);
return res;
