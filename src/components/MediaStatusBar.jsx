// Avisos sobre os arquivos do projeto: ausentes (com Localizar/Substituir) e religados/atualizados.
import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, X, Link, Replace, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useStore } from '../store.js';

export default function MediaStatusBar() {
  const notices = useStore((s) => s.mediaNotices);
  const media = useStore((s) => s.project?.media || []);
  const meta = useStore((s) => s.meta);
  const [open, setOpen] = useState(false);
  const S = useStore.getState;

  const missing = media.filter((m) => meta[m.id]?.status === 'missing');
  const infos = notices.filter((n) => n.kind === 'relocated' || n.kind === 'updated');
  if (!missing.length && !infos.length) return null;

  return (
    <div className="media-bar-wrap">
      {missing.length > 0 && (
        <div className="media-bar warn">
          <AlertTriangle size={16} />
          <span className="grow">
            <b>{missing.length === 1 ? '1 arquivo não encontrado' : `${missing.length} arquivos não encontrados`}:</b>{' '}
            {missing.map((m) => m.name).join(', ')}. Os clipes continuam no projeto com os efeitos; é só apontar o arquivo.
          </span>
          <button className="btn small" onClick={() => S().recheckMedia()} title="Procurar de novo nas pastas"><RefreshCw size={13} /> Procurar de novo</button>
          <button className="btn small" onClick={() => setOpen((o) => !o)}>{open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Resolver</button>
        </div>
      )}
      {missing.length > 0 && open && (
        <div className="media-bar-list">
          {missing.map((m) => (
            <div key={m.id} className="media-bar-item">
              <span className="grow" title={m.path}><b>{m.name}</b> <span className="hint">— estava em {m.path.replace(/[\\/][^\\/]*$/, '')}</span></span>
              <button className="btn small" onClick={() => S().relinkMedia(m.id)}><Link size={13} /> Localizar…</button>
              <button className="btn small" onClick={() => S().replaceMedia(m.id)}><Replace size={13} /> Substituir por outro…</button>
            </div>
          ))}
        </div>
      )}
      {infos.length > 0 && (
        <div className="media-bar info">
          <CheckCircle2 size={16} />
          <span className="grow">
            {infos.map((n) => (
              <span key={n.id} style={{ marginRight: 14 }}>
                <b>{n.name}</b>{' '}
                {n.kind === 'relocated'
                  ? <>reencontrado em <span title={n.path}>{n.path.replace(/[\\/][^\\/]*$/, '')}</span></>
                  : <>foi trocado por um arquivo novo com o mesmo nome</>}
              </span>
            ))}
            — efeitos e transições mantidos.
          </span>
          <button className="icon-btn sm" title="Fechar" onClick={() => S().dismissNotices()}><X size={14} /></button>
        </div>
      )}
    </div>
  );
}
