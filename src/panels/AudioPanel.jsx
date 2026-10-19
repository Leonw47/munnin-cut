import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Plus, Music, Upload, Info, Scissors, Download, X, RefreshCw, FolderOpen, Trash2, Loader2 } from 'lucide-react';
import { useStore, libView } from '../store.js';
import { fmtTime } from '../shared/timeline.js';
import { endDrag } from '../dnd.js';
import { ContextMenu, MenuItem, Toggle } from '../components/ui.jsx';
import InlineTrim from '../components/InlineTrim.jsx';
import { dragMedia } from './MediaPanel.jsx';

const cleanErr = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const parseTime = (txt) => {
  const p = String(txt).trim().replace(',', '.').split(':').map(Number);
  if (!String(txt).trim() || p.some((x) => Number.isNaN(x))) return null;
  return p.length === 1 ? p[0] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2];
};

function Recorder() {
  const [rec, setRec] = useState(null); // { mr, t0, startAt }
  const [elapsed, setElapsed] = useState(0);
  const chunks = useRef([]);

  useEffect(() => {
    if (!rec) return undefined;
    const id = setInterval(() => setElapsed((performance.now() - rec.t0) / 1000), 200);
    return () => clearInterval(id);
  }, [rec]);

  const start = async () => {
    const s = useStore.getState();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
        const file = await window.api.writeFile('recordings', `narracao_${stamp}.webm`, new Uint8Array(await blob.arrayBuffer()));
        const [id] = await useStore.getState().importPaths([file]);
        if (id) useStore.getState().addMedia(id, { target: 'audio', time: mr.startAt });
        useStore.getState().toastMsg('Narração adicionada à linha do tempo');
      };
      mr.startAt = s.time;
      mr.start(250);
      setElapsed(0);
      setRec({ mr, t0: performance.now() });
      if (!s.playing && s.project.tracks.some((t) => t.clips.length)) s.play();
    } catch (e) {
      s.toastMsg(`Não foi possível acessar o microfone: ${e.message}`, 'err');
    }
  };
  const stop = () => {
    rec?.mr.stop();
    setRec(null);
    useStore.getState().pause();
  };

  return rec ? (
    <div className="rec">
      <span className="dot" />
      <span style={{ flex: 1 }}>Gravando… {fmtTime(elapsed)}</span>
      <button className="btn danger small" onClick={stop}><Square size={12} /> Parar</button>
    </div>
  ) : (
    <button className="btn block" onClick={start}><Mic size={15} /> Gravar narração</button>
  );
}

// Baixa o áudio de um vídeo do YouTube (yt-dlp, atualizado sozinho) e já põe no projeto.
export function YoutubeImport() {
  const ytFocus = useStore((s) => s.ytFocus);
  const inputRef = useRef(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState(null);
  const [sect, setSect] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [toTimeline, setToTimeline] = useState(true);
  const [updating, setUpdating] = useState(false);

  const refresh = () => window.api.ytStatus().then(setStatus).catch(() => {});
  useEffect(() => { refresh(); }, []);
  useEffect(() => window.api.onYtProgress((p) => setProg(p)), []);
  useEffect(() => {
    if (!ytFocus) return;
    const el = inputRef.current;
    if (el) { el.scrollIntoView({ block: 'center' }); setTimeout(() => el.focus(), 50); }
  }, [ytFocus]);

  const go = async () => {
    if (busy) return;
    setErr('');
    const at = useStore.getState().time;
    const opts = { url: url.trim() };
    if (!opts.url) { setErr('Cole o link do vídeo do YouTube.'); return; }
    if (sect) {
      const sa = parseTime(a), sb = parseTime(b);
      if (sa == null || sb == null || sb <= sa) { setErr('Trecho inválido: escreva início e fim, por exemplo 1:30 e 2:10.'); return; }
      opts.start = sa; opts.end = sb;
    }
    setBusy(true);
    setProg({ stage: 'info', text: 'Preparando…' });
    try {
      const r = await window.api.ytDownload(opts);
      const [id] = await useStore.getState().importPaths([r.path]);
      if (id && toTimeline) useStore.getState().addMedia(id, { target: 'audio', time: at });
      useStore.getState().toastMsg(`"${r.title}" ${toTimeline ? 'foi adicionado à linha do tempo' : 'está na biblioteca'}.`, 'info', 5000);
      setUrl('');
    } catch (e) {
      setErr(cleanErr(e));
    } finally {
      setBusy(false);
      setProg(null);
      refresh();
    }
  };
  const update = async () => {
    setUpdating(true);
    setErr('');
    try {
      const r = await window.api.ytUpdate();
      setStatus(r);
      useStore.getState().toastMsg(r.updated ? `Baixador atualizado para a versão ${r.version}.` : `O baixador já está na versão mais nova (${r.version}).`);
    } catch (e) { setErr(`Não foi possível atualizar agora: ${cleanErr(e)}`); } finally { setUpdating(false); setProg(null); }
  };
  const pct = prog?.pct != null ? Math.round(prog.pct * 100) : null;
  const fmtDay = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  return (
    <div className="yt-box">
      <div style={{ display: 'flex', gap: 6 }}>
        <input ref={inputRef} type="text" placeholder="Cole o link do YouTube" value={url} disabled={busy}
          onChange={(e) => setUrl(e.target.value)} style={{ flex: 1, minWidth: 0 }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') go(); }} />
        {busy
          ? <button className="btn" title="Cancelar" onClick={() => window.api.ytCancel()}><X size={14} /> Cancelar</button>
          : <button className="btn primary" onClick={go} disabled={updating}><Download size={14} /> Baixar</button>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <label className="yt-opt"><Toggle on={toTimeline} onChange={setToTimeline} /> Pôr na linha do tempo (no cursor)</label>
        <label className="yt-opt"><Toggle on={sect} onChange={setSect} /> Só um trecho</label>
      </div>
      {sect && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <span className="hint">De</span>
          <input type="text" placeholder="1:30" value={a} onChange={(e) => setA(e.target.value)} onKeyDown={(e) => e.stopPropagation()} style={{ width: 70 }} />
          <span className="hint">até</span>
          <input type="text" placeholder="2:10" value={b} onChange={(e) => setB(e.target.value)} onKeyDown={(e) => e.stopPropagation()} style={{ width: 70 }} />
        </div>
      )}
      {(busy || updating) && prog && (
        <div style={{ marginTop: 10 }}>
          <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} className="spin" /> {prog.text}{pct != null && prog.stage !== 'convert' ? ` ${pct}%` : ''}</div>
          <div className="yt-bar"><div style={{ width: `${pct != null ? pct : 100}%` }} className={pct == null ? 'indet' : ''} /></div>
        </div>
      )}
      {err && <div className="yt-err">{err}</div>}
      <div className="hint" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 140 }}>
          {status?.installed
            ? <>Baixador yt-dlp {status.version}{status.channel === 'nightly' ? ' (noturna)' : ''}{status.checkedAt ? ` · conferido em ${fmtDay(status.checkedAt)}` : ''}</>
            : 'Na primeira vez o app instala o baixador (yt-dlp, ~18 MB).'}
        </span>
        <button className="btn small ghost" disabled={busy || updating} title="Procurar versão nova do yt-dlp agora (o app também confere sozinho todo dia)" onClick={update}>
          <RefreshCw size={12} className={updating ? 'spin' : ''} /> Atualizar
        </button>
        <button className="btn small ghost" title="Abrir a pasta dos áudios baixados" onClick={async () => window.api.openPath(await window.api.ytFolder())}><FolderOpen size={12} /></button>
      </div>
      <div className="hint" style={{ marginTop: 4 }}>Use só áudios que você tem direito de usar (próprios, liberados ou com autorização).</div>
    </div>
  );
}

export default function AudioPanel() {
  const media = useStore((s) => s.project.media);
  const meta = useStore((s) => s.meta);
  const libSel = useStore((s) => s.libSel);
  const [menu, setMenu] = useState(null);
  const audios = media.filter((m) => m.type === 'audio');
  const order = audios.map((m) => m.id);
  libView.order = order;
  const s = useStore.getState;
  const importMedia = async () => {
    const paths = await window.api.openMediaDialog();
    if (paths.length) s().importPaths(paths);
  };
  const multi = libSel.length > 1;
  const menuIds = menu && multi && libSel.includes(menu.m.id) ? order.filter((id) => libSel.includes(id)) : null;
  return (
    <div>
      <div className="lp-section-title">Narração</div>
      <Recorder />
      <div className="hint" style={{ marginTop: 6 }}>A gravação começa no cursor da linha do tempo e o vídeo toca junto, para você narrar em cima.</div>

      <div className="lp-section-title" style={{ marginTop: 18 }}>Áudio do YouTube</div>
      <YoutubeImport />

      <div className="lp-section-title" style={{ marginTop: 18 }}>Músicas e sons do projeto</div>
      <button className="btn block" onClick={importMedia} style={{ marginBottom: 10 }}><Upload size={15} /> Importar áudio</button>
      {!audios.length && <div className="hint">Nenhum áudio importado ainda.</div>}
      <div className="media-lib">
        {multi && (
          <div className="hint" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1 }}><b style={{ color: 'var(--text)' }}>{libSel.length} selecionados</b> — Delete remove do projeto.</span>
            <button className="btn small" onClick={() => s().removeMediaMany(libSel)}><Trash2 size={13} /> Remover</button>
          </div>
        )}
        {audios.map((m) => {
          const ready = meta[m.id]?.status === 'ready';
          const sel = libSel.includes(m.id);
          return (
            <React.Fragment key={m.id}>
              <div className={`list-item ${sel ? 'selected' : ''}`} data-id={m.id} draggable={ready}
                onDragStart={(e) => dragMedia(e, m, order)} onDragEnd={endDrag}
                onClick={(e) => s().libClick(m.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, order })}
                onDoubleClick={() => ready && s().addMedia(m.id)}
                onContextMenu={(e) => { e.preventDefault(); if (!s().libSel.includes(m.id)) s().libClick(m.id, { order }); setMenu({ x: e.clientX, y: e.clientY, m }); }}
                title="Clique para selecionar e cortar · clique duplo para adicionar no cursor">
                <Music size={15} color="#7fe0b0" />
                <span className="grow" title={m.name}>{m.name}</span>
                <span style={{ color: m.trim ? 'var(--accent)' : 'var(--muted)' }}>{m.trim ? `✂ ${fmtTime(m.trim.out - m.trim.in)}` : fmtTime(m.duration)}</span>
                <button className="icon-btn sm" disabled={!ready} title="Abrir a janela de corte" onClick={(e) => { e.stopPropagation(); s().openTrim(m.id); }}><Scissors size={14} /></button>
                <button className="icon-btn sm" disabled={!ready} title="Adicionar no cursor" onClick={(e) => { e.stopPropagation(); s().addMedia(m.id); }}><Plus size={14} /></button>
              </div>
              {sel && !multi && ready && m.duration > 0 && <div className="list-trim"><InlineTrim m={m} meta={meta[m.id]} full /></div>}
            </React.Fragment>
          );
        })}
      </div>
      <div className="hint" style={{ marginTop: 14, display: 'flex', gap: 6 }}>
        <Info size={14} style={{ flex: '0 0 auto', marginTop: 1 }} />
        <span>Efeitos sonoros prontos estão na aba <b>Sons</b>. Para usar só o som de um vídeo: botão direito no clipe da linha do tempo → <b>Separar áudio</b>.</span>
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {menuIds ? (
            <MenuItem icon={<Trash2 size={14} />} label={`Remover ${menuIds.length} itens do projeto`} kbd="Delete" onClick={() => s().removeMediaMany(menuIds)} />
          ) : (
            <>
              <MenuItem icon={<Plus size={14} />} label="Adicionar no cursor" onClick={() => s().addMedia(menu.m.id)} />
              <MenuItem icon={<Scissors size={14} />} label="Cortar antes de inserir…" onClick={() => s().openTrim(menu.m.id)} />
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
