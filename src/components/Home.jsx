import React, { useEffect, useState } from 'react';
import { Plus, FolderOpen, Trash2, Pencil, Film, Copy } from 'lucide-react';
import { useStore } from '../store.js';
import { RATIOS } from '../shared/defs.js';
import { fmtTime } from '../shared/timeline.js';
import { mediaUrl } from '../engine/util.js';
import { openProjectFromFile } from '../App.jsx';

function Shape({ r }) {
  const w = r.w ? (r.w >= r.h ? 22 : (22 * r.w) / r.h) : 18;
  const h = r.w ? (r.h >= r.w ? 22 : (22 * r.h) / r.w) : 18;
  return <span className="shape" style={{ width: w, height: h, borderStyle: r.id === 'original' ? 'dashed' : 'solid' }} />;
}

export default function Home() {
  const [drafts, setDrafts] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const newProject = useStore((s) => s.newProject);
  const openEditor = useStore((s) => s.openEditor);
  const toastMsg = useStore((s) => s.toastMsg);

  const load = () => window.api.listDrafts().then(setDrafts).catch(() => setDrafts([]));
  useEffect(() => { load(); }, []);

  const open = async (d) => {
    try { openEditor(await window.api.loadDraft(d.id)); }
    catch (e) { toastMsg(`Não foi possível abrir: ${e.message}`, 'err'); }
  };
  const rename = async (d, name) => {
    setRenaming(null);
    if (name && name.trim() && name.trim() !== d.name) { await window.api.renameDraft(d.id, name.trim()); load(); }
  };
  const remove = async (d) => {
    if (!window.confirm(`Excluir o projeto "${d.name}"? Os arquivos de mídia não serão apagados.`)) return;
    await window.api.deleteDraft(d.id);
    load();
  };

  return (
    <>
      <div className="topbar">
        <div className="brand"><div className="logo">M</div>Munnin Cut</div>
        <div className="spacer" />
      </div>
      <div className="home">
        <h1>Criar e editar vídeos</h1>
        <div className="sub">Edição completa, sem marca d'água e sem recursos pagos.</div>
        <button className="create-card" onClick={() => newProject('original')}>
          <div className="big"><Plus size={30} /></div>
          <div>
            <h2>Novo projeto</h2>
            <div style={{ opacity: 0.8 }}>Comece importando vídeos, fotos e músicas. A proporção se ajusta à primeira mídia.</div>
          </div>
        </button>
        <div className="lp-section-title" style={{ marginTop: 6 }}>Ou escolha a proporção</div>
        <div className="ratio-pick">
          {RATIOS.filter((r) => r.id !== 'original').map((r) => (
            <button key={r.id} onClick={() => newProject(r.id)} title={r.hint || ''}>
              <Shape r={r} /> {r.name}{r.hint && <span style={{ color: 'var(--muted)' }}>· {r.hint}</span>}
            </button>
          ))}
          <button onClick={() => openProjectFromFile()}><FolderOpen size={16} /> Abrir arquivo .mcut</button>
        </div>

        <div className="lp-section-title">Projetos recentes</div>
        {drafts && !drafts.length && <div className="hint">Nenhum projeto ainda. Eles aparecem aqui e são salvos automaticamente enquanto você edita.</div>}
        <div className="drafts">
          {(drafts || []).map((d) => (
            <div key={d.id} className="draft" onClick={() => open(d)}>
              <div className="cover" style={d.cover ? { backgroundImage: `url("${mediaUrl(d.cover)}?v=${d.updatedAt}")`, backgroundColor: '#000' } : {}}>
                {!d.cover && <Film size={26} />}
              </div>
              <div className="dactions">
                <button className="icon-btn sm" title="Renomear" onClick={(e) => { e.stopPropagation(); setRenaming(d.id); }}><Pencil size={13} /></button>
                <button className="icon-btn sm" title="Duplicar (usar como modelo)" onClick={async (e) => { e.stopPropagation(); await window.api.duplicateDraft(d.id); load(); }}><Copy size={13} /></button>
                <button className="icon-btn sm" title="Excluir" onClick={(e) => { e.stopPropagation(); remove(d); }}><Trash2 size={13} /></button>
              </div>
              {renaming === d.id ? (
                <input type="text" autoFocus defaultValue={d.name} style={{ width: '100%', marginTop: 6 }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => { if (e.key === 'Enter') rename(d, e.currentTarget.value); if (e.key === 'Escape') setRenaming(null); }}
                  onBlur={(e) => rename(d, e.currentTarget.value)} />
              ) : <div className="dname">{d.name}</div>}
              <div className="dmeta">{fmtTime(d.duration || 0)} · {d.ratio === 'original' ? `${d.width}×${d.height}` : d.ratio} · {new Date(d.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
