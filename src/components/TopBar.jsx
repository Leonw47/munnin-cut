import React from 'react';
import { ChevronDown, Download, House, FilePlus2, FolderOpen, Save, Upload, Keyboard, Check } from 'lucide-react';
import { useStore } from '../store.js';
import { saveNow } from '../autosave.js';
import { openProjectFromFile } from '../App.jsx';
import { Dropdown, MenuItem, editProject } from './ui.jsx';

export default function TopBar() {
  const name = useStore((s) => s.project?.name || '');
  const savedAt = useStore((s) => s.savedAt);
  const s = useStore.getState;

  const goHome = async () => { await saveNow(); s().goHome(); };
  const newProject = async () => { await saveNow(); s().newProject('original'); };
  const saveAs = async () => {
    const p = s().project;
    const file = await window.api.saveProjectFile(JSON.stringify(p, null, 1), p.name.replace(/[\\/:*?"<>|]/g, '_'));
    if (file) s().toastMsg(`Projeto salvo em ${file}`);
  };
  const importMedia = async () => {
    const paths = await window.api.openMediaDialog();
    if (paths.length) s().importPaths(paths);
  };

  return (
    <div className="topbar">
      <div className="brand"><div className="logo">M</div></div>
      <Dropdown width={230} button={({ toggle }) => (
        <button className="btn small ghost" onClick={toggle}>Menu <ChevronDown size={13} /></button>
      )}>
        <MenuItem icon={<House size={15} />} label="Voltar ao início" onClick={goHome} />
        <MenuItem icon={<FilePlus2 size={15} />} label="Novo projeto" onClick={newProject} />
        <MenuItem icon={<FolderOpen size={15} />} label="Abrir projeto (.mcut)…" onClick={() => openProjectFromFile()} />
        <MenuItem icon={<Save size={15} />} label="Salvar cópia como .mcut…" onClick={saveAs} />
        <div className="dd-sep" />
        <MenuItem icon={<Upload size={15} />} label="Importar mídia…" kbd="Ctrl+I" onClick={importMedia} />
        <MenuItem icon={<Download size={15} />} label="Exportar…" kbd="Ctrl+E" onClick={() => useStore.setState({ modal: 'export' })} />
        <div className="dd-sep" />
        <MenuItem icon={<Keyboard size={15} />} label="Atalhos de teclado" onClick={() => useStore.setState({ modal: 'shortcuts' })} />
      </Dropdown>
      <div className="title">
        <input type="text" value={name} spellCheck={false}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); e.stopPropagation(); }}
          onChange={(e) => { const v = e.target.value; editProject((p) => { p.name = v; }); }} />
      </div>
      <div className="spacer" />
      {savedAt > 0 && <span className="saved-hint"><Check size={12} style={{ verticalAlign: -2 }} /> Salvo às {new Date(savedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
      <button className="btn primary" onClick={() => useStore.setState({ modal: 'export' })}><Download size={15} /> Exportar</button>
    </div>
  );
}
