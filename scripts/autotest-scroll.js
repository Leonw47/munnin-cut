// Regressão da "tela preta" (1.1): a rolagem automática da linha do tempo durante a reprodução
// derrubava a interface. Toca com zoom alto (força a rolagem) e confere que a interface continua de pé.
const { useStore } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIR = 'C:/Users/leona/AppData/Local/Temp/munnin-cut-test';
S().newProject('16:9');
const ids = await S().importPaths([DIR + '/a.mp4', DIR + '/m.mp3']);
for (let i = 0; i < 100 && !ids.every((x) => S().meta[x]?.status === 'ready'); i++) await sleep(150);
S().addMedia(ids[0]);
S().addMedia(ids[1], { target: 'audio', time: 0 });
useStore.setState({ zoom: 400 });
S().setTime(1); S().play();
await sleep(3500);
S().pause();
const sc = document.querySelector('.tl-scroll');
const ok = document.getElementById('root').children.length > 0 && !!document.querySelector('.timeline') && sc.scrollLeft > 0;
await window.api.testLog(JSON.stringify({ ok, scrollLeft: sc.scrollLeft }));
return { rolagem_durante_reproducao: ok ? 'OK' : 'FALHOU' };
