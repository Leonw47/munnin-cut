import React, { useMemo, useState } from 'react';
import { Upload, Plus, Film, Image as ImageIcon, Music, Loader2, AlertTriangle, Search, Layers, Trash2, FolderOpen, Link } from 'lucide-react';
import { useStore } from '../store.js';
import { fmtTime } from '../shared/timeline.js';
import { mediaUrl } from '../engine/util.js';
import { startDrag, endDrag } from '../dnd.js';
import { ContextMenu, MenuItem, Seg } from '../components/ui.jsx';

export function MediaThumb({ m, meta }) {
  if (m.type === 'image') {
    const src = meta?.proxy || m.renderPath || m.path;
    return meta?.status === 'ready' ? <img src={mediaUrl(src)} alt="" draggable={false} /> : null;
  }
  if (m.type === 'video' && meta?.thumbs) {
    const t = meta.thumbs;
    const idx = Math.min(t.count - 1, Math.floor(t.count * 0.15));
    return (
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url("${mediaUrl(t.sprite)}")`,
        backgroundSize: `${t.count * 100}% 100%`,
        backgroundPosition: `${t.count > 1 ? (idx / (t.count - 1)) * 100 : 0}% 0`,
      }} />
    );
  }
  if (m.type === 'audio') {
    return <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#123d2c,#1d6f4d)' }}><Music size={26} color="#9ff0c8" /></div>;
  }
  return null;
}

function statusText(meta) {
  if (!meta) return null;
  switch (meta.status) {
    case 'probing': return <><Loader2 size={16} className="spin" /> Lendo…</>;
    case 'checking': return <><Loader2 size={16} className="spin" /></>;
    case 'proxy': return <span>Convertendo para prévia<br />{Math.round((meta.progress || 0) * 100)}%</span>;
    case 'missing': return <span><AlertTriangle size={15} /><br />Arquivo não encontrado</span>;
    case 'error': return <span title={meta.error}><AlertTriangle size={15} /><br />Formato não suportado</span>;
    default: return null;
  }
}

export default function MediaPanel() {
  const media = useStore((s) => s.project.media);
  const meta = useStore((s) => s.meta);
  const tracks = useStore((s) => s.project.tracks);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(null);
  const s = useStore.getState;

  const used = useMemo(() => {
    const u = new Set();
    for (const t of tracks) for (const c of t.clips) if (c.mediaId) u.add(c.mediaId);
    return u;
  }, [tracks]);

  const list = media.filter((m) => (filter === 'all' || m.type === filter) && (!q || m.name.toLowerCase().includes(q.toLowerCase())));
  const importMedia = async () => {
    const paths = await window.api.openMediaDialog();
    if (paths.length) s().importPaths(paths);
  };

  return (
    <div>
      <div className="lp-row">
        <button className="btn primary" onClick={importMedia}><Upload size={15} /> Importar</button>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--muted)' }} />
          <input type="text" placeholder="Pesquisar mídia" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()} style={{ width: '100%', paddingLeft: 26 }} />
        </div>
      </div>
      {media.length > 0 && (
        <div className="lp-row">
          <Seg value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'Todos' }, { value: 'video', label: 'Vídeos' }, { value: 'image', label: 'Fotos' }, { value: 'audio', label: 'Áudios' },
          ]} />
        </div>
      )}
      {!media.length && (
        <div className="drop-hint" onClick={importMedia}>
          <Upload size={28} />
          <div><b>Importar mídia</b></div>
          <div className="hint">Clique aqui ou arraste vídeos, fotos e áudios do Explorer.<br />MP4, MOV, MKV, AVI, WEBM, GIF, JPG, PNG, HEIC, MP3, WAV, M4A e outros.</div>
        </div>
      )}
      <div className="grid">
        {list.map((m) => {
          const mt = meta[m.id];
          const st = statusText(mt);
          const ready = mt?.status === 'ready';
          return (
            <div key={m.id} className="media-card" draggable={ready}
              onDragStart={(e) => startDrag(e, { kind: 'media', id: m.id }, m.name)}
              onDragEnd={endDrag}
              onDoubleClick={() => ready && s().addMedia(m.id)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, m }); }}
              title={`${m.name}${m.width ? ` · ${m.width}×${m.height}` : ''}`}>
              <div className="thumb">
                <MediaThumb m={m} meta={mt} />
                <span className="kind">{m.type === 'video' ? <Film size={12} /> : m.type === 'image' ? <ImageIcon size={12} /> : <Music size={12} />}</span>
                {m.type !== 'image' && m.duration > 0 && <span className="badge">{fmtTime(m.duration)}</span>}
                {used.has(m.id) && <span className="used" title="Em uso na linha do tempo" />}
                {ready && <button className="add" title="Adicionar à linha do tempo" onClick={(e) => { e.stopPropagation(); s().addMedia(m.id); }}><Plus size={14} /></button>}
                {st && <div className={`status ${mt.status === 'error' || mt.status === 'missing' ? 'err' : ''}`}>{st}</div>}
              </div>
              <div className="name">{m.name}</div>
            </div>
          );
        })}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {menu.m.type !== 'audio' && <MenuItem icon={<Plus size={14} />} label="Adicionar à faixa principal" onClick={() => s().addMedia(menu.m.id)} />}
          {menu.m.type !== 'audio' && <MenuItem icon={<Layers size={14} />} label="Adicionar como sobreposição" onClick={() => s().addMedia(menu.m.id, { target: 'overlay' })} />}
          {menu.m.type === 'audio' && <MenuItem icon={<Plus size={14} />} label="Adicionar no cursor" onClick={() => s().addMedia(menu.m.id)} />}
          {meta[menu.m.id]?.status === 'missing' && <MenuItem icon={<Link size={14} />} label="Localizar arquivo…" onClick={() => s().relinkMedia(menu.m.id)} />}
          <MenuItem icon={<FolderOpen size={14} />} label="Mostrar no Explorer" onClick={() => window.api.showItem(menu.m.path)} />
          <div className="dd-sep" />
          <MenuItem icon={<Trash2 size={14} />} label="Remover do projeto" onClick={() => s().removeMedia(menu.m.id)} />
        </ContextMenu>
      )}
    </div>
  );
}
