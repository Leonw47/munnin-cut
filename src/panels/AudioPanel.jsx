import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Plus, Music, Upload, Info, Scissors, Download, X, RefreshCw, FolderOpen, Trash2, Loader2, Search, Play } from 'lucide-react';
import { useStore, libView } from '../store.js';
import { fmtTime } from '../shared/timeline.js';
import { endDrag } from '../dnd.js';
import { ContextMenu, MenuItem, Toggle, Paginador, usePaginas } from '../components/ui.jsx';
import InlineTrim from '../components/InlineTrim.jsx';
import YoutubePreview from '../components/YoutubePreview.jsx';
import { dragMedia } from './MediaPanel.jsx';

const cleanErr = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

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
const isYtUrl = (u) => /^\s*(https?:\/\/)?([a-z0-9-]+\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(u || '');
const isIgUrl = (u) => /^\s*(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|reels|tv)\/[\w-]+/i.test(u || '');
const fmtViews = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',')} mi` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(n || 0));

// Link ou pesquisa do YouTube → prévia (para conferir o vídeo e escolher o trecho) → baixa áudio ou vídeo.
export function YoutubeImport() {
  const ytFocus = useStore((s) => s.ytFocus);
  const inputRef = useRef(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [res, setRes] = useState(null); // resultados da pesquisa
  const [prev, setPrev] = useState(null); // vídeo aberto na prévia
  const [ultimo, setUltimo] = useState(null); // escolhas da última prévia (áudio/vídeo, linha do tempo)

  const refresh = () => window.api.ytStatus().then(setStatus).catch(() => {});
  useEffect(() => { refresh(); }, []);
  useEffect(() => window.api.onYtProgress((p) => setProg(p)), []);
  useEffect(() => {
    if (!ytFocus) return;
    const el = inputRef.current;
    if (el) { el.scrollIntoView({ block: 'center' }); setTimeout(() => el.focus(), 50); }
  }, [ytFocus]);

  const baixar = async (opts) => {
    if (busy) return;
    setPrev(null);
    setUltimo({ kind: opts.kind, toTimeline: opts.toTimeline });
    setErr('');
    const at = useStore.getState().time;
    setBusy(true);
    setProg({ stage: 'info', text: 'Preparando…' });
    try {
      const url = /^https?:\/\//i.test(opts.url) ? opts.url : `https://${opts.url.replace(/^\/+/, '')}`;
      const r = await window.api.ytDownload({ url, start: opts.start, end: opts.end, kind: opts.kind });
      const [id] = await useStore.getState().importPaths([r.path]);
      if (id && opts.toTimeline) useStore.getState().addMedia(id, opts.kind === 'video' ? {} : { target: 'audio', time: at });
      const onde = opts.toTimeline ? (opts.kind === 'video' ? 'foi para o fim da faixa principal' : 'foi adicionado à linha do tempo') : 'está na biblioteca';
      useStore.getState().toastMsg(`"${r.title}" ${onde}.`, 'info', 5000);
    } catch (e) {
      setErr(cleanErr(e));
    } finally {
      setBusy(false);
      setProg(null);
      refresh();
    }
  };

  const abrir = (v) => { setErr(''); setPrev(v); };
  const ir = async () => {
    const txt = q.trim();
    setErr('');
    if (!txt) { setErr('Cole um link do YouTube ou escreva o que quer procurar.'); return; }
    if (isIgUrl(txt)) { baixar({ url: txt.startsWith('http') ? txt : `https://${txt}`, kind: 'video', toTimeline: true }); return; }
    if (isYtUrl(txt)) {
      const info = await window.api.ytTitulo(txt).catch(() => null);
      if (!info?.id) { setErr('Link não reconhecido. Copie o endereço do vídeo no YouTube (barra do navegador ou "Compartilhar").'); return; }
      abrir({ id: info.id, title: info.title, channel: info.channel, duration: 0 });
      return;
    }
    // link de outro site: avisa em vez de pesquisar o endereço no YouTube
    if (/^(https?:\/\/|www\.)\S+$/i.test(txt)) { setErr('Por enquanto dá para baixar só links do YouTube e do Instagram (post ou reel).'); return; }
    setBuscando(true);
    try { setRes(await window.api.ytSearch(txt)); } catch (e) { setErr(cleanErr(e)); setRes(null); } finally { setBuscando(false); refresh(); }
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
  const ehLink = isYtUrl(q);
  const ehIg = isIgUrl(q);

  return (
    <div className="yt-box">
      <div style={{ display: 'flex', gap: 6 }}>
        <input ref={inputRef} type="text" placeholder="Link do YouTube/Instagram ou pesquise no YouTube" value={q} disabled={busy}
          onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 0 }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') ir(); }} />
        {busy
          ? <button className="btn" title="Cancelar" onClick={() => window.api.ytCancel()}><X size={14} /> Cancelar</button>
          : ehIg ? (
            <>
              <button className="btn primary" onClick={() => baixar({ url: q.trim(), kind: 'video', toTimeline: true })} title="Baixa o vídeo do post/reel e põe no fim da faixa principal"><Download size={14} /> Vídeo</button>
              <button className="btn" onClick={() => baixar({ url: q.trim(), kind: 'audio', toTimeline: true })} title="Baixa só o som e põe no cursor"><Music size={14} /> Áudio</button>
            </>
          ) : (
            <button className="btn primary" onClick={ir} disabled={updating || buscando}>
              {buscando ? <Loader2 size={14} className="spin" /> : ehLink ? <Play size={14} /> : <Search size={14} />} {ehLink ? 'Ver' : 'Pesquisar'}
            </button>
          )}
      </div>
      {res && (
        <div className="yt-res">
          {!res.length && <div className="hint" style={{ padding: 6 }}>Nada encontrado. Tente outras palavras.</div>}
          {res.map((v) => (
            <div key={v.id} className="yt-item" title="Ver o vídeo e escolher o trecho" onClick={() => !busy && abrir(v)}>
              <div className="yt-thumb" style={{ backgroundImage: `url("https://i.ytimg.com/vi/${v.id}/mqdefault.jpg")` }}>
                {v.live ? <span>AO VIVO</span> : v.duration ? <span>{fmtTime(v.duration)}</span> : null}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="yt-title">{v.title}</div>
                <div className="hint">{v.channel}{v.views ? ` · ${fmtViews(v.views)} visualizações` : ''}</div>
              </div>
            </div>
          ))}
          {!!res.length && <button className="btn small ghost" style={{ marginTop: 4 }} onClick={() => setRes(null)}>Fechar resultados</button>}
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
        <button className="btn small ghost" title="Abrir a pasta dos áudios baixados" onClick={async () => window.api.openPath(await window.api.ytFolder('audio'))}><FolderOpen size={12} /></button>
        <button className="btn small ghost" title="Abrir a pasta dos vídeos baixados (YouTube e Instagram)" onClick={async () => window.api.openPath(await window.api.ytFolder('video'))}>Vídeos</button>
      </div>
      <div className="hint" style={{ marginTop: 4 }}>Use só o que você tem direito de usar (próprio, liberado ou com autorização).</div>
      {prev && <YoutubePreview video={prev} inicial={ultimo} onClose={() => setPrev(null)} onBaixar={baixar} />}
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
  const pg = usePaginas(audios.length, 'audios');
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

      <div className="lp-section-title" style={{ marginTop: 18 }}>YouTube e Instagram</div>
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
        <Paginador p={pg} total={audios.length} rotulo="áudios" />
        {audios.slice(pg.ini, pg.fim).map((m) => {
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
