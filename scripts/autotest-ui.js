// Roteiro de teste executado dentro da interface (MC_AUTOTEST).
const { useStore, engine, startExport } = window.__mc;
const S = () => useStore.getState();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => window.api.testCapture(n);
const log = (m) => window.api.testLog(typeof m === 'string' ? m : JSON.stringify(m));
const DIR = 'C:/Users/leona/AppData/Local/Temp/munnin-cut-test';
const mainT = () => S().project.tracks.find((t) => t.main);

await sleep(400);
await shot('01_home');
S().newProject('9:16');
await sleep(500);
await shot('02_editor_vazio');

const ids = await S().importPaths([DIR + '/a.mp4', DIR + '/b.mp4', DIR + '/c.png', DIR + '/m.mp3']);
for (let i = 0; i < 150; i++) {
  const m = S().meta;
  const ok = ids.every((id) => {
    const md = S().project.media.find((x) => x.id === id);
    return m[id]?.status === 'ready' && (md.type !== 'video' || m[id].thumbs) && (!md.hasAudio || m[id].waveform);
  });
  if (ok) break;
  await sleep(200);
}
log({ meta: Object.fromEntries(Object.entries(S().meta).map(([k, v]) => [k, v.status])) });
await shot('03_midias');

const [a, b, c, mu] = ids;
S().addMedia(a);
S().addMedia(c);
S().addMedia(a);
S().setTransition(mainT().clips[0].id, 'circleopen', 0.8);
S().setTime(1);
S().addMedia(b, { target: 'overlay' });
S().setTime(0.5);
S().addText('yellow');
S().setTime(2);
S().addSticker('🔥');
S().addEffect('effect', 'vhs', { time: 3.2 });
S().addMedia(mu, { target: 'audio', time: 0 });
S().applyFilter(mainT().clips[1].id, 'warm');
const st = { clips: S().project.tracks.filter((t) => t.kind === 'text').flatMap((t) => t.clips) };
S().updateClip(st.clips.find((x) => x.sticker).id, (x) => { x.transform.x = 0.25; x.transform.y = -0.3; x.animIn = { id: 'pop', duration: 0.6 }; });
S().updateClip(st.clips.find((x) => !x.sticker).id, (x) => { x.text.content = 'Munnin Cut\nteste'; x.transform.y = 0.3; x.animIn = { id: 'zoomIn', duration: 0.5 }; });
S().select(null);
S().setTime(1.2);
await sleep(900);
await shot('04_timeline');

const ov = S().project.tracks.find((t) => t.kind === 'overlay').clips[0];
S().updateClip(ov.id, (x) => { x.transform.x = -0.2; x.transform.y = -0.25; x.transform.rotation = 10; });
S().select({ type: 'clip', id: ov.id });
S().setTime(1.6);
await sleep(700);
await shot('05_overlay_sel');

const tx = S().project.tracks.filter((t) => t.kind === 'text').flatMap((t) => t.clips).find((x) => !x.sticker);
S().select({ type: 'clip', id: tx.id });
await sleep(400);
await shot('06_texto_sel');

for (const tab of ['text', 'stickers', 'effects', 'transitions', 'filters', 'audio']) {
  useStore.setState({ leftTab: tab });
  await sleep(300);
  await shot('07_tab_' + tab);
}
useStore.setState({ leftTab: 'media' });

S().select({ type: 'transition', id: mainT().clips[0].id });
S().setTime(3.6);
await sleep(700);
await shot('08_transicao');

S().select(null);
S().setTime(0);
S().play();
await sleep(2000);
await shot('09_tocando');
S().pause();
log('tempo após 2s de reprodução: ' + S().time.toFixed(2));

// comparação prévia × exportação
const times = [0.4, 1.6, 3.6, 5.5, 8.5];
const prev = [];
for (const t of times) {
  S().setTime(t);
  await sleep(900);
  const url = engine.canvas.toDataURL('image/png');
  const bytes = Uint8Array.from(atob(url.split(',')[1]), (ch) => ch.charCodeAt(0));
  prev.push(await window.api.writeFile('cache', `prev_${t}.png`, bytes));
}
log({ previews: prev, project: { w: S().project.width, h: S().project.height, dur: S().project.tracks.map((t) => t.clips.map((x) => [x.type, +x.start.toFixed(2), +x.duration.toFixed(2)])) } });

// dividir / desfazer / refazer
S().setTime(1);
S().select({ type: 'clip', id: mainT().clips[0].id });
S().splitAt();
const n1 = mainT().clips.length;
S().undo();
const n2 = mainT().clips.length;
S().redo();
const n3 = mainT().clips.length;
log(`dividir: ${n1} | desfazer: ${n2} | refazer: ${n3}`);
S().undo();

useStore.setState({ modal: 'export' });
await sleep(500);
await shot('10_exportar');
useStore.setState({ modal: null });

const run = startExport({ project: S().project, meta: S().meta, format: 'mp4', res: 720, fps: 30, quality: 'standard', hw: null, outPath: DIR + '/ui_export.mp4', onProgress: () => {} });
const r = await run.promise;
log('exportação: ' + JSON.stringify(r));
return { ok: true };
