// Salvamento automático do projeto (rascunho), como no CapCut.
import { useStore } from './store.js';
import { engine } from './engine/index.js';
import { projectDuration } from './shared/timeline.js';

let timer = null;
let lastCover = 0;
let saving = Promise.resolve();

function isEmpty(p) {
  return !p.media.length && p.tracks.every((t) => !t.clips.length);
}

export function saveNow({ force = false } = {}) {
  saving = saving.then(async () => {
    const p = useStore.getState().project;
    if (!p || (!force && isEmpty(p))) return;
    const meta = {
      id: p.id,
      name: p.name,
      updatedAt: Date.now(),
      duration: projectDuration(p),
      ratio: p.ratio,
      width: p.width,
      height: p.height,
      clips: p.tracks.reduce((n, t) => n + t.clips.length, 0),
    };
    let cover = null;
    if (Date.now() - lastCover > 6000 || force) {
      cover = await engine.captureCover();
      lastCover = Date.now();
    }
    try {
      await window.api.saveDraft(p.id, JSON.stringify(p), meta, cover);
      useStore.setState({ savedAt: Date.now() });
    } catch (e) {
      useStore.getState().toastMsg(`Não foi possível salvar: ${e.message}`, 'err');
    }
  });
  return saving;
}

export function initAutosave() {
  useStore.subscribe((s, prev) => {
    if (s.project && s.project !== prev.project && prev.project && s.project.id === prev.project.id) {
      clearTimeout(timer);
      timer = setTimeout(() => saveNow(), 1200);
    }
  });
  window.addEventListener('beforeunload', () => { clearTimeout(timer); saveNow(); });
}
