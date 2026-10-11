import React, { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Play, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { useStore } from '../store.js';
import { engine } from '../engine/index.js';
import { EXPORT_FORMATS, RESOLUTIONS, FPS_LIST, QUALITIES } from '../shared/defs.js';
import { exportSize } from '../shared/graph.js';
import { startExport } from '../exporter.js';
import { projectDuration, fmtTime } from '../shared/timeline.js';
import { Modal, Seg, Toggle } from './ui.jsx';

export default function ExportDialog() {
  const project = useStore((s) => s.project);
  const meta = useStore((s) => s.meta);
  const close = () => useStore.setState({ modal: null });
  const [name, setName] = useState(project.name.replace(/[\\/:*?"<>|]/g, '_'));
  const [format, setFormat] = useState(() => localStorage.getItem('mc.format') || 'mp4');
  const [res, setRes] = useState(() => Number(localStorage.getItem('mc.res')) || 1080);
  const [fps, setFps] = useState(project.fps || 30);
  const [quality, setQuality] = useState(() => localStorage.getItem('mc.quality') || 'standard');
  const [nvenc, setNvenc] = useState(false);
  const [hw, setHw] = useState(() => localStorage.getItem('mc.hw') === '1');
  const [st, setSt] = useState({ phase: 'setup' });
  const [cover, setCover] = useState(null);
  const job = useRef(null);

  useEffect(() => {
    window.api.nvenc().then(setNvenc).catch(() => setNvenc(false));
    try { setCover(engine.canvas?.toDataURL('image/jpeg', 0.7)); } catch { setCover(null); }
  }, []);
  useEffect(() => {
    localStorage.setItem('mc.format', format);
    localStorage.setItem('mc.res', String(res));
    localStorage.setItem('mc.quality', quality);
    localStorage.setItem('mc.hw', hw ? '1' : '0');
  }, [format, res, quality, hw]);

  const fmt = EXPORT_FORMATS.find((f) => f.id === format) || EXPORT_FORMATS[0];
  const duration = projectDuration(project);
  const size = exportSize(project, res);
  const hwUsable = nvenc && ['mp4', 'mov', 'mkv', 'mp4_hevc'].includes(format);
  const missing = project.media.filter((m) => meta[m.id]?.status === 'missing' && project.tracks.some((t) => t.clips.some((c) => c.mediaId === m.id)));
  const running = st.phase === 'running';

  const start = async () => {
    const outPath = await window.api.pickExportPath(name || 'video', fmt.ext, fmt.name);
    if (!outPath) return;
    const t0 = performance.now();
    setSt({ phase: 'running', pct: 0, label: 'Preparando…', t0 });
    try {
      const run = startExport({
        project, meta, format, res, fps, quality, hw: hw && hwUsable ? 'nvenc' : null, outPath,
        onProgress: (pct, speed) => setSt((s) => (s.phase === 'running' ? { ...s, pct, speed, label: 'Exportando…' } : s)),
      });
      job.current = run;
      const r = await run.promise;
      if (r.ok) setSt({ phase: 'done', outPath, secs: (performance.now() - t0) / 1000 });
      else if (r.cancelled) setSt({ phase: 'setup' });
      else setSt({ phase: 'error', error: r.error });
    } catch (e) {
      setSt({ phase: 'error', error: String(e.message || e) });
    }
  };

  const cancel = () => { job.current?.cancel(); };

  const pct = st.pct || 0;
  const elapsed = st.t0 ? (performance.now() - st.t0) / 1000 : 0;
  const eta = pct > 0.02 ? (elapsed * (1 - pct)) / pct : null;

  const footer = st.phase === 'done' ? (
    <>
      <button className="btn" onClick={() => window.api.showItem(st.outPath)}><FolderOpen size={15} /> Abrir pasta</button>
      <button className="btn" onClick={() => window.api.openPath(st.outPath)}><Play size={15} /> Reproduzir</button>
      <button className="btn primary" onClick={close}>Concluir</button>
    </>
  ) : running ? (
    <button className="btn danger" onClick={cancel}>Cancelar</button>
  ) : (
    <>
      <button className="btn" onClick={close}>Fechar</button>
      <button className="btn primary" disabled={duration <= 0} onClick={start}><Download size={15} /> Exportar</button>
    </>
  );

  return (
    <Modal title="Exportar" onClose={running ? null : close} footer={footer} width={620}>
      <div className="export-preview">
        {cover ? <img src={cover} alt="" /> : <div style={{ width: 120, height: 68, background: '#000', borderRadius: 8 }} />}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{project.name}</div>
          <div className="hint">Duração {fmtTime(duration, project.fps, true)} · {fmt.kind === 'audio' ? 'somente áudio' : `${size.width}×${size.height} · ${fmt.kind === 'gif' ? Math.min(fps, 15) : fps} fps`}</div>
        </div>
      </div>

      {st.phase === 'setup' && (
        <div className="export-grid">
          <label>Nome</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value.replace(/[\\/:*?"<>|]/g, '_'))} onKeyDown={(e) => e.stopPropagation()} />
          <label style={{ alignSelf: 'start', paddingTop: 8 }}>Formato</label>
          <div className="format-list">
            {EXPORT_FORMATS.map((f) => (
              <button key={f.id} className={format === f.id ? 'on' : ''} onClick={() => setFormat(f.id)}>
                {f.name}<small>{f.desc}</small>
              </button>
            ))}
          </div>
          {fmt.kind !== 'audio' && <>
            <label>Resolução</label>
            <Seg value={res} onChange={setRes} options={RESOLUTIONS.map((r) => ({ value: r.id, label: r.name }))} />
            <label>Quadros/s</label>
            <Seg value={fps} onChange={setFps} options={FPS_LIST.map((f) => ({ value: f, label: String(f) }))} />
          </>}
          {fmt.id !== 'prores' && fmt.id !== 'gif' && fmt.id !== 'wav' && fmt.id !== 'flac' && <>
            <label>Qualidade</label>
            <Seg value={quality} onChange={setQuality} options={QUALITIES.map((q) => ({ value: q.id, label: q.name }))} />
          </>}
          {hwUsable && <>
            <label>Placa de vídeo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Toggle on={hw} onChange={setHw} />
              <span className="hint">Usar a NVIDIA (NVENC) para exportar mais rápido</span>
            </div>
          </>}
        </div>
      )}

      {st.phase === 'setup' && missing.length > 0 && (
        <div className="err-box" style={{ marginTop: 14, fontFamily: 'inherit' }}>
          <AlertTriangle size={13} style={{ verticalAlign: -2 }} /> Mídias não encontradas (serão exportadas como tela vazia): {missing.map((m) => m.name).join(', ')}
        </div>
      )}

      {running && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span>{st.label}</span>
            <span className="timecode">{Math.round(pct * 100)}%{st.speed ? ` · ${st.speed.toFixed(2)}x` : ''}{eta !== null ? ` · faltam ~${fmtTime(eta)}` : ''}</span>
          </div>
          <div className="progress"><div style={{ width: `${pct * 100}%` }} /></div>
          <div className="hint" style={{ marginTop: 10 }}>Você pode continuar usando o computador. Não feche o Munnin Cut até terminar.</div>
        </div>
      )}

      {st.phase === 'done' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <CheckCircle2 size={22} color="#19d3df" />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Exportação concluída em {fmtTime(st.secs)}</div>
            <div className="hint" style={{ userSelect: 'text', wordBreak: 'break-all' }}>{st.outPath}</div>
          </div>
        </div>
      )}

      {st.phase === 'error' && (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, color: '#ff8b8b', fontWeight: 600 }}><AlertTriangle size={18} /> A exportação falhou</div>
          <div className="err-box">{st.error}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn small" onClick={async () => window.api.openPath(await window.api.exportLogPath())}><FileText size={13} /> Ver registro completo</button>
            <button className="btn small" onClick={() => setSt({ phase: 'setup' })}>Voltar</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
