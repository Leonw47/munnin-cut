import React, { useMemo, useState } from 'react';
import { Upload, Plus, Film, Image as ImageIcon, Music, Loader2, AlertTriangle, Search, Layers, Trash2, FolderOpen, Link, Scissors, Replace, Download, Eye } from 'lucide-react';
import { useStore, libView } from '../store.js';
import { fmtTime } from '../shared/timeline.js';
import { mediaUrl } from '../engine/util.js';
import { startDrag, endDrag } from '../dnd.js';
import { ContextMenu, MenuItem, Seg } from '../components/ui.jsx';
import InlineTrim from '../components/InlineTrim.jsx';

/** at: tempo (s) para mostrar o quadro do vídeo nesse ponto (durante o corte no cartão) */
export function MediaThumb({ m, meta, at = null }) {
  if (m.type === 'image') {
    const src = meta?.proxy || m.renderPath || m.path;
    return meta?.status === 'ready' ? <img src={mediaUrl(src) + (meta.ver ? `?v=${meta.ver}` : '')} alt="" draggable={false} /> : null;
  }
  if (m.type === 'video' && meta?.thumbs) {
    const t = meta.thumbs;
    const idx = at != null && m.duration > 0
      ? Math.max(0, Math.min(t.count - 1, Math.round((at / m.duration) * (t.count - 1))))
      : Math.min(t.count - 1, Math.floor(t.count * 0.15));
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

// arrastar um item selecionado leva junto todos os selecionados (na ordem da biblioteca)
export function dragMedia(e, m, order) {
  const sel = useStore.getState().libSel;
  if (sel.length > 1 && sel.includes(m.id)) {
    const ids = order.filter((id) => sel.includes(id));
    startDrag(e, { kind: 'media', id: m.id, ids }, `${ids.length} itens`);
  } else startDrag(e, { kind: 'media', id: m.id }, m.name);
}

function MediaCard({ m, mt, used, selected, multi, order, onMenu }) {
  const [scrub, setScrub] = useState(null);
  const [hover, setHover] = useState(null); // passar o mouse no vídeo mostra o quadro daquele ponto
  const s = useStore.getState;
  const st = statusText(mt);
  const ready = mt?.status === 'ready';
  const trimming = selected && !multi && ready && (m.type === 'video' || m.type === 'audio') && m.duration > 0;
  const varre = m.type === 'video' && ready && !trimming && m.duration > 0 && mt?.thumbs;
  return (
    <div className={`media-card ${selected ? 'selected' : ''} ${selected && multi ? 'multi' : ''} ${trimming ? 'trimming' : ''}`} data-id={m.id} draggable={ready}
      onDragStart={(e) => dragMedia(e, m, order)}
      onDragEnd={endDrag}
      onClick={(e) => s().libClick(m.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, order })}
      onDoubleClick={() => ready && s().addMedia(m.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!s().libSel.includes(m.id)) s().libClick(m.id, { order });
        onMenu({ x: e.clientX, y: e.clientY, m });
      }}
      title={`${m.name}${m.width ? ` · ${m.width}×${m.height}` : ''} — clique para selecionar (Ctrl/Shift: vários), clique duplo para adicionar`}>
      <div className="thumb"
        onMouseMove={varre ? (e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * m.duration); } : undefined}
        onMouseLeave={() => setHover(null)}>
        <MediaThumb m={m} meta={mt} at={scrub ?? (varre ? hover : null)} />
        {varre && hover != null && <div className="hover-line" style={{ left: `${(hover / m.duration) * 100}%` }} />}
        {!trimming && <span className="kind">{m.type === 'video' ? <Film size={12} /> : m.type === 'image' ? <ImageIcon size={12} /> : <Music size={12} />}</span>}
        {!trimming && m.type !== 'image' && m.duration > 0 && !m.trim && <span className="badge">{varre && hover != null ? fmtTime(hover) : fmtTime(m.duration)}</span>}
        {!trimming && used && <span className="used" title="Em uso na linha do tempo" />}
        {ready && <button className="see" title="Ver no reprodutor (prévia, sem pôr na linha do tempo)" onClick={(e) => { e.stopPropagation(); s().openLibPreview(m.id); }}><Eye size={13} /></button>}
        {ready && <button className="add" title="Adicionar à linha do tempo" onClick={(e) => { e.stopPropagation(); s().addMedia(m.id); }}><Plus size={14} /></button>}
        {!trimming && m.trim && <span className="trim-badge" title="Corte definido antes de inserir"><Scissors size={10} /> {fmtTime(m.trim.in)}–{fmtTime(m.trim.out)}</span>}
        {trimming && <InlineTrim m={m} meta={mt} full={m.type === 'audio'} onScrub={m.type === 'video' ? setScrub : undefined} />}
        {st && <div className={`status ${mt.status === 'error' || mt.status === 'missing' ? 'err' : ''}`}>{st}</div>}
      </div>
      <div className="name">{m.name}</div>
    </div>
  );
}

export default function MediaPanel() {
  const media = useStore((s) => s.project.media);
  const meta = useStore((s) => s.meta);
  const tracks = useStore((s) => s.project.tracks);
  const libSel = useStore((s) => s.libSel);
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
  const order = list.map((m) => m.id);
  libView.order = order;
  const importMedia = async () => {
    const paths = await window.api.openMediaDialog();
    if (paths.length) s().importPaths(paths);
  };
  const multi = libSel.length > 1;
  const menuIds = menu && multi && libSel.includes(menu.m.id) ? order.filter((id) => libSel.includes(id)) : null;

  return (
    <div className="media-lib">
      <div className="lp-row">
        <button className="btn primary" onClick={importMedia}><Upload size={15} /> Importar</button>
        <button className="btn" title="Baixar o áudio de um vídeo do YouTube direto para o projeto"
          onClick={() => useStore.setState((st) => ({ leftTab: 'audio', ytFocus: st.ytFocus + 1 }))}><Download size={15} /> YouTube</button>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--muted)' }} />
          <input type="text" placeholder="Pesquisar" value={q} onChange={(e) => setQ(e.target.value)}
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
      {multi && (
        <div className="hint" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1 }}><b style={{ color: 'var(--text)' }}>{libSel.length} selecionados</b> — Delete remove do projeto; arraste para a linha do tempo para inserir todos.</span>
          <button className="btn small" onClick={() => s().removeMediaMany(libSel)}><Trash2 size={13} /> Remover</button>
        </div>
      )}
      <div className="grid">
        {list.map((m) => (
          <MediaCard key={m.id} m={m} mt={meta[m.id]} used={used.has(m.id)} selected={libSel.includes(m.id)} multi={multi} order={order} onMenu={setMenu} />
        ))}
      </div>
      {media.length > 0 && !multi && (
        <div className="hint" style={{ marginTop: 10 }}>
          Clique num vídeo ou áudio para cortar direto no cartão (arraste as alças; Shift = ajuste fino). Ctrl+clique ou Shift+clique selecionam vários; Delete remove.
        </div>
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {menuIds ? (
            <MenuItem icon={<Trash2 size={14} />} label={`Remover ${menuIds.length} itens do projeto`} kbd="Delete" onClick={() => s().removeMediaMany(menuIds)} />
          ) : (
            <>
              {menu.m.type !== 'audio' && <MenuItem icon={<Plus size={14} />} label="Adicionar à faixa principal" onClick={() => s().addMedia(menu.m.id)} />}
              {menu.m.type !== 'audio' && <MenuItem icon={<Layers size={14} />} label="Adicionar como sobreposição" onClick={() => s().addMedia(menu.m.id, { target: 'overlay' })} />}
              {menu.m.type === 'audio' && <MenuItem icon={<Plus size={14} />} label="Adicionar no cursor" onClick={() => s().addMedia(menu.m.id)} />}
              {menu.m.type !== 'image' && <MenuItem icon={<Scissors size={14} />} label="Cortar antes de inserir…" onClick={() => s().openTrim(menu.m.id)} />}
              {meta[menu.m.id]?.status === 'missing' && <MenuItem icon={<Link size={14} />} label="Localizar arquivo…" onClick={() => s().relinkMedia(menu.m.id)} />}
              <MenuItem icon={<Replace size={14} />} label="Substituir por outro arquivo…" onClick={() => s().replaceMedia(menu.m.id)} />
              <MenuItem icon={<FolderOpen size={14} />} label="Mostrar no Explorer" onClick={() => window.api.showItem(menu.m.path)} />
              <div className="dd-sep" />
              <MenuItem icon={<Trash2 size={14} />} label="Remover do projeto" kbd="Delete" onClick={() => s().removeMedia(menu.m.id)} />
            </>
          )}
        </ContextMenu>
      )}
    </div>
  );
}
