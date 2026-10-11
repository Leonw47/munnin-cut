import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { useStore } from './store.js';
import { initAutosave, saveNow } from './autosave.js';
import { uid, projectDuration } from './shared/timeline.js';
import Home from './components/Home.jsx';
import Editor from './components/Editor.jsx';

initAutosave();

export async function openProjectFromFile(path) {
  const s = useStore.getState();
  try {
    const json = await window.api.openProjectFile(path);
    if (!json) return;
    if (!json.tracks || !json.media) throw new Error('arquivo inválido');
    if (s.project) await saveNow();
    s.openEditor({ ...json, id: json.id || uid('p') });
  } catch (e) {
    s.toastMsg(`Não foi possível abrir o projeto: ${e.message}`, 'err', 5000);
  }
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export default function App() {
  const screen = useStore((s) => s.screen);
  const toast = useStore((s) => s.toast);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const off1 = window.api.onProxyProgress(({ jobId, pct }) => useStore.getState().setMeta(jobId, { progress: pct }));
    const off2 = window.api.onOpenFile((f) => openProjectFromFile(f));
    window.api.pendingFile().then((f) => { if (f) openProjectFromFile(f); });
    return () => { off1(); off2(); };
  }, []);

  // Atalhos de teclado do editor
  useEffect(() => {
    const onKey = (e) => {
      const s = useStore.getState();
      if (s.screen !== 'editor' || s.modal || isTyping(e)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      let handled = true;
      if (k === ' ') s.togglePlay();
      else if (ctrl && k === 'b') s.splitAt();
      else if (k === 'delete' || k === 'backspace') s.deleteSelection();
      else if (ctrl && k === 'z' && !e.shiftKey) s.undo();
      else if ((ctrl && k === 'y') || (ctrl && e.shiftKey && k === 'z')) s.redo();
      else if (ctrl && k === 'c') s.copySelection();
      else if (ctrl && k === 'v') s.paste();
      else if (ctrl && k === 'd') s.duplicateSelection();
      else if (ctrl && k === 'e') useStore.setState({ modal: 'export' });
      else if (ctrl && k === 'i') window.api.openMediaDialog().then((p) => p.length && s.importPaths(p));
      else if (ctrl && k === 's') saveNow({ force: true }).then(() => s.toastMsg('Projeto salvo'));
      else if (k === 'arrowleft') s.stepFrames(e.shiftKey ? -(s.project.fps || 30) : -1);
      else if (k === 'arrowright') s.stepFrames(e.shiftKey ? s.project.fps || 30 : 1);
      else if (k === 'home') s.setTime(0);
      else if (k === 'end') s.setTime(projectDuration(s.project));
      else if (k === '=' || k === '+') useStore.setState({ zoom: Math.min(600, s.zoom * 1.25) });
      else if (k === '-') useStore.setState({ zoom: Math.max(2, s.zoom / 1.25) });
      else if (k === 'escape') s.select(null);
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Arrastar arquivos do Explorer para a janela
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    const enter = (e) => { if (!hasFiles(e)) return; depth++; setDragging(true); };
    const leave = (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const over = (e) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = async (e) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.defaultPrevented && e.__handled) return;
      const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean);
      const s = useStore.getState();
      const mcut = paths.find((p) => p.toLowerCase().endsWith('.mcut'));
      if (mcut) { openProjectFromFile(mcut); return; }
      if (e.__timelineHandled) return;
      if (s.screen === 'home') s.newProject('original');
      if (paths.length) await useStore.getState().importPaths(paths);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div className="app" onContextMenu={(e) => { if (!isTyping(e)) e.preventDefault(); }}>
      {screen === 'home' ? <Home /> : <Editor />}
      {toast && (
        <div className={`toast ${toast.kind === 'err' ? 'err' : ''}`}>
          {toast.kind === 'err' ? <AlertTriangle size={16} color="#ff8b8b" /> : <Info size={16} color="#19d3df" />}
          <span>{toast.text}</span>
        </div>
      )}
      {dragging && <div className="drag-overlay">Solte os arquivos para importar</div>}
    </div>
  );
}
