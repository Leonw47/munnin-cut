// Voz em muitos clipes (mais de 40): a limpeza do cache apagava as vozes dos primeiros clipes antes de o FFmpeg
// lê-las ("Error opening input ... voz.wav" ao gerar legendas). E um voz.wav apagado à mão tem de ser refeito.
const { useStore, startExport } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const info = await window.api.info();
const DIR = info.tempDir.replace(/[\\/]munnin-cut-jobs$/, '/munnin-cut-test').replace(/\\/g, '/');
const res = {};
const check = (n, c, i) => { res[n] = c ? 'OK' : `FALHOU ${i !== undefined ? JSON.stringify(i) : ''}`; };
S().newProject('16:9');
await sleep(300);
const [mid] = await S().importPaths([DIR + '/voz/fala_cache_teste.mp4']);
for (let i = 0; i < 300 && S().meta[mid]?.status !== 'ready'; i++) await sleep(100);
// 45 clipes curtos, cada um com "Voz" e um trecho diferente do arquivo (um cache por clipe)
for (let i = 0; i < 45; i++) {
  const id = S().addMedia(mid);
  S().updateClip(id, (c) => { c.in = (i * 0.07) % 2; c.duration = 0.4; c.voz = { ruido: 0, realce: 40, clareza: 30, ambiente: 'none', ambMix: 35 }; });
}
await sleep(300);
const exportar = async (nome) => {
  const out = DIR.replace(/\//g, '\\') + `\\${nome}.wav`;
  return startExport({ project: S().project, meta: S().meta, format: 'wav', res: 720, fps: 30, quality: 'standard', outPath: out }).promise;
};
const r1 = await exportar('voz_cache_1');
check('muitos_clipes_com_voz_exporta', r1.ok, r1.error);
// apaga um voz.wav do cache (como se a pasta tivesse sido mexida): a próxima exportação refaz
const fx = info.cacheDir ? info.cacheDir + '\\fx' : null;
let apagou = false;
if (window.api.testApagarUmaVoz) apagou = await window.api.testApagarUmaVoz();
const r2 = await exportar('voz_cache_2');
check('voz_apagada_e_refeita', r2.ok, { apagou, erro: r2.error });
void fx;
window.api.testLog(JSON.stringify(res));
return res;
