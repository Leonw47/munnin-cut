import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, RotateCcw, House, FileText } from 'lucide-react';
import { useStore } from './store.js';
import { initAutosave, saveNow } from './autosave.js';
import { uid, projectDuration } from './shared/timeline.js';
import Home from './components/Home.jsx';
import Editor from './components/Editor.jsx';

initAutosave();

// Registra qualquer erro num arquivo (logs/erros.txt) para diagnóstico.
const logError = (msg) => { try { window.api.logError(msg); } catch { /* sem ponte */ } };
window.addEventListener('error', (e) => logError(`erro: ${e.message}
${e.error?.stack || ''}`));
window.addEventListener('unhandledrejection', (e) => logError(`promessa rejeitada: ${e.reason?.stack || e.reason}`));
// Informa ao processo principal o projeto aberto (para reabrir se a interface cair).
useStore.subscribe((s, prev) => {
  const id = s.project?.id || null;
  if (id !== (prev.project?.id || null)) window.api.setCurrentProject?.(id);
});

// Se algum componente falhar, mostra uma tela de recuperação em vez de deixar a janela preta.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, details: false }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { logError(`falha na interface: ${error?.stack || error}
${info?.componentStack || ''}`); }
  render() {
    if (!this.state.error) return this.props.children;
    const retry = () => this.setState({ error: null, details: false });
    const home = async () => { try { await saveNow(); } catch { /* ignore */ } useStore.getState().goHome(); retry(); };
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 30 }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <AlertTriangle size={36} color="#ffb74d" />
          <h2 style={{ margin: '12px 0 6px' }}>Algo deu errado nesta tela</h2>
          <div className="hint" style={{ fontSize: 13, marginBottom: 18 }}>Seu projeto está salvo. Você pode continuar de onde parou.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn primary" onClick={retry}><RotateCcw size={15} /> Continuar editando</button>
            <button className="btn" onClick={home}><House size={15} /> Voltar ao início</button>
            <button className="btn ghost" onClick={async () => window.api.openPath(await window.api.errorLogPath())}><FileText size={15} /> Registro</button>
          </div>
          <button className="btn small ghost" style={{ marginTop: 14 }} onClick={() => this.setState({ details: !this.state.details })}>Detalhes técnicos</button>
          {this.state.details && <div className="err-box" style={{ marginTop: 8, textAlign: 'left' }}>{String(this.state.error?.stack || this.state.error)}</div>}
        </div>
      </div>
    );
  }
}

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
    // Reabre o projeto se a interface foi reiniciada depois de uma falha.
    const reopen = new URLSearchParams(window.location.search).get('reopen');
    if (reopen) {
      window.api.loadDraft(reopen).then((p) => {
        useStore.getState().openEditor(p);
        useStore.getState().toastMsg('O editor foi reiniciado depois de um erro e seu projeto foi reaberto.', 'info', 6000);
      }).catch(() => {});
    }
    // ao voltar para a janela (ex.: depois de baixar um arquivo novo), confere as mídias
    let tm = null;
    const onFocus = () => { clearTimeout(tm); tm = setTimeout(() => useStore.getState().recheckMedia(), 400); };
    window.addEventListener('focus', onFocus);
    return () => { off1(); off2(); window.removeEventListener('focus', onFocus); };
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
      <ErrorBoundary>{screen === 'home' ? <Home /> : <Editor />}</ErrorBoundary>
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
