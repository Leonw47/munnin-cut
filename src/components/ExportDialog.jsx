import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FolderOpen, Play, CheckCircle2, AlertTriangle, FileText, HardDrive, Image as ImageIcon, Crosshair, X, Loader2 } from 'lucide-react';
import { useStore } from '../store.js';
import { engine } from '../engine/index.js';
import { EXPORT_FORMATS, RESOLUTIONS, FPS_LIST, QUALITIES, CONTAINERS, videoKbps, audioKbps, estimateBytes, fmtBytes } from '../shared/defs.js';
import { exportSize } from '../shared/graph.js';
import { projectDuration, fmtTime } from '../shared/timeline.js';
import { startExport } from '../exporter.js';
import { mediaUrl } from '../engine/util.js';
import { Modal, Seg, Toggle, Slider } from './ui.jsx';

const OTHER = EXPORT_FORMATS.filter((f) => !['mp4', 'mp4_hevc', 'mov', 'mov_hevc', 'prores'].includes(f.id));
const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

export default function ExportDialog() {
  const project = useStore((s) => s.project);
  const meta = useStore((s) => s.meta);
  const close = () => useStore.setState({ modal: null });
  const [name, setName] = useState(project.name.replace(/[\\/:*?"<>|]/g, '_'));
  const [container, setContainer] = useState(() => ls('mc.container', 'mp4'));
  const [codec, setCodec] = useState(() => ls('mc.codec', 'h264'));
  const [other, setOther] = useState(() => ls('mc.other', 'webm'));
  const [res, setRes] = useState(() => Number(ls('mc.res', 1080)));
  const [fps, setFps] = useState(project.fps || 30);
  const [quality, setQuality] = useState(() => ls('mc.quality2', 'standard'));
  const [customMbps, setCustomMbps] = useState(() => Number(ls('mc.mbps', 10)));
  const [nvenc, setNvenc] = useState(false);
  const [hw, setHw] = useState(() => ls('mc.hw', '0') === '1');
  const [st, setSt] = useState({ phase: 'setup' });
  const [cutTail, setCutTail] = useState(true);
  const [cover, setCover] = useState(null);
  const job = useRef(null);

  useEffect(() => {
    window.api.nvenc().then(setNvenc).catch(() => setNvenc(false));
    try { setCover(engine.canvas?.toDataURL('image/jpeg', 0.7)); } catch { setCover(null); }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('mc.container', container); localStorage.setItem('mc.codec', codec); localStorage.setItem('mc.other', other);
      localStorage.setItem('mc.res', String(res)); localStorage.setItem('mc.quality2', quality); localStorage.setItem('mc.mbps', String(customMbps));
      localStorage.setItem('mc.hw', hw ? '1' : '0');
    } catch { /* ignore */ }
  }, [container, codec, other, res, quality, customMbps, hw]);

  const codecs = CONTAINERS[container]?.codecs || [];
  const codecDef = codecs.find((c) => c.id === codec) || codecs[0];
  const format = container === 'other' ? other : codecDef.format;
  const fmt = EXPORT_FORMATS.find((f) => f.id === format) || EXPORT_FORMATS[0];
  const fullDuration = projectDuration(project);
  // fim da última imagem/vídeo/texto: se só o áudio continua depois, oferecemos encerrar ali
  const visualEnd = project.tracks.filter((t) => t.kind !== 'audio').reduce((m, t) => Math.max(m, ...t.clips.filter((c) => c.type !== 'effect').map((c) => c.start + c.duration), 0), 0);
  const tail = fullDuration - visualEnd;
  const offerCut = visualEnd > 0 && tail > 1;
  const duration = offerCut && cutTail ? visualEnd : fullDuration;
  const size = exportSize(project, res);
  const hwUsable = nvenc && ['mp4', 'mov', 'mkv', 'mp4_hevc', 'mov_hevc'].includes(format);
  const hasQuality = !['prores', 'gif', 'wav', 'flac'].includes(format);
  const vK = fmt.kind === 'audio' || fmt.kind === 'gif' ? 0 : videoKbps({ format, res, fps, width: size.width, height: size.height, quality, customMbps });
  const aK = audioKbps(format, quality);
  const bytes = useMemo(() => estimateBytes({ kind: fmt.kind, width: size.width, height: size.height, fps, duration, vKbps: vK, aKbps: aK }), [fmt.kind, size.width, size.height, fps, duration, vK, aK]);
  const missing = project.media.filter((m) => meta[m.id]?.status === 'missing' && project.tracks.some((t) => t.clips.some((c) => c.mediaId === m.id)));
  const running = st.phase === 'running';

  const start = async () => {
    const outPath = await window.api.pickExportPath(name || 'video', fmt.ext, fmt.name);
    if (!outPath) return;
    const t0 = performance.now();
    setSt({ phase: 'running', pct: 0, label: 'Preparando…', t0 });
    try {
      const run = startExport({
        project, meta, format, res, fps, quality, endAt: offerCut && cutTail ? visualEnd : undefined,
        vKbps: hasQuality && fmt.kind === 'video' ? vK : 0,
        aKbps: hasQuality ? aK : 0,
        hw: hw && hwUsable ? 'nvenc' : null, outPath,
        onProgress: (pct, speed, label) => setSt((s) => (s.phase === 'running' ? { ...s, pct, speed, label: label || 'Exportando…' } : s)),
      });
      job.current = run;
      const r = await run.promise;
      if (r.ok) setSt({ phase: 'done', outPath, size: r.size, secs: (performance.now() - t0) / 1000 });
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
      <span style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <HardDrive size={16} color="var(--accent)" />
        <span>Tamanho estimado: <b style={{ fontSize: 14 }}>{['prores', 'webm', 'gif'].includes(format) ? 'até ' : ''}≈ {fmtBytes(bytes)}</b></span>
        {fmt.kind === 'video' && hasQuality && <span className="hint">({(vK / 1000).toFixed(1).replace('.', ',')} Mbps)</span>}
        {fmt.kind === 'gif' && <span className="hint">(GIF varia muito)</span>}
      </span>
      <button className="btn" onClick={close}>Fechar</button>
      <button className="btn primary" disabled={duration <= 0} onClick={start}><Download size={15} /> Exportar</button>
    </>
  );

  return (
    <Modal title="Exportar" onClose={running ? null : close} footer={footer} width={640}>
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

          <label>Formato</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="seg big">
              <button className={container === 'mp4' ? 'on' : ''} onClick={() => setContainer('mp4')}>MP4</button>
              <button className={container === 'mov' ? 'on' : ''} onClick={() => setContainer('mov')}>MOV</button>
              <button className={container === 'other' ? 'on' : ''} onClick={() => setContainer('other')}>Outros</button>
            </div>
            {container === 'other' && (
              <select value={other} onChange={(e) => setOther(e.target.value)}>
                {OTHER.map((f) => <option key={f.id} value={f.id}>{f.name} — {f.desc}</option>)}
              </select>
            )}
          </div>

          {container !== 'other' && <>
            <label>Codec</label>
            <div>
              <Seg value={codecDef.id} onChange={setCodec} options={codecs.map((c) => ({ value: c.id, label: c.name }))} />
              <div className="hint" style={{ marginTop: 4 }}>{fmt.desc}{codecDef.id === 'hevc' ? ' · alguns players antigos não abrem H.265' : ''}</div>
            </div>
          </>}

          {fmt.kind !== 'audio' && <>
            <label>Resolução</label>
            <Seg value={res} onChange={setRes} options={RESOLUTIONS.map((r) => ({ value: r.id, label: r.name }))} />
            <label>Quadros/s</label>
            <Seg value={fps} onChange={setFps} options={FPS_LIST.map((f) => ({ value: f, label: String(f) }))} />
          </>}

          {hasQuality && <>
            <label>Qualidade</label>
            <div>
              <Seg value={quality} onChange={setQuality} options={QUALITIES.filter((q) => fmt.kind === 'video' || q.id !== 'custom').map((q) => ({ value: q.id, label: q.name }))} />
              {quality === 'custom' && fmt.kind === 'video' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', marginTop: 8, maxWidth: 360 }}>
                  <Slider value={customMbps} min={1} max={80} step={0.5} onChange={setCustomMbps} />
                  <span className="hint">Taxa de bits do vídeo, em Mbps</span>
                </div>
              )}
              <div className="hint" style={{ marginTop: 4 }}>
                {fmt.kind === 'video' ? `Vídeo ${(vK / 1000).toFixed(1).replace('.', ',')} Mbps · áudio ${aK} kbps` : `Áudio ${aK} kbps`}
              </div>
            </div>
          </>}

          {offerCut && fmt.kind !== 'audio' && <>
            <label>Duração</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Toggle on={cutTail} onChange={setCutTail} />
              <span className="hint">Terminar no fim das imagens ({fmtTime(visualEnd)}) — o áudio continua até {fmtTime(fullDuration)} sobre tela preta</span>
            </div>
          </>}

          {fmt.kind === 'video' && <>
            <label>Capa</label>
            <CapaEscolha />
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
          <div className="hint" style={{ marginTop: 10 }}>Tamanho estimado ≈ {fmtBytes(bytes)}. Você pode continuar usando o computador; não feche o Munnin Cut até terminar.</div>
        </div>
      )}

      {st.phase === 'done' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <CheckCircle2 size={22} color="#19d3df" />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Exportação concluída em {fmtTime(st.secs)}{st.size ? ` · ${fmtBytes(st.size)}` : ''}</div>
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

// Capa do vídeo: um quadro do próprio projeto (o da agulha) ou uma imagem; entra no 1º quadro do arquivo.
const IMG_CAPA = /\.(jpe?g|png|webp|bmp|heic|heif|hif|avif|tiff?)$/i;
function CapaEscolha() {
  const cover = useStore((s) => s.project.cover);
  const time = useStore((s) => s.time);
  const [ocupado, setOcupado] = useState(false);
  const s = useStore.getState;
  const salvar = (c) => s().commit((p) => { p.cover = c; }, { keepTracks: true });
  const doQuadro = async () => {
    setOcupado(true);
    try {
      const png = await engine.snapshotPng();
      if (!png) throw new Error('sem quadro');
      const path = await window.api.writeFile('capas', `${s().project.id || 'projeto'}_${Date.now()}.png`, png);
      salvar({ path, origem: 'quadro', t: s().time });
    } catch (e) { s().toastMsg(`Não foi possível pegar o quadro: ${e.message || e}`, 'err'); } finally { setOcupado(false); }
  };
  const doImagem = async () => {
    const paths = await window.api.openMediaDialog();
    const p = paths.find((x) => IMG_CAPA.test(x));
    if (!p) { if (paths.length) s().toastMsg('Escolha uma imagem (JPG, PNG, WEBP, HEIC…).', 'err'); return; }
    setOcupado(true);
    try {
      // HEIC e outros que o FFmpeg não lê inteiros: usa a cópia em JPG/PNG
      const final = /\.(heic|heif|hif|tiff?|avif)$/i.test(p) ? await window.api.proxy(p, 'image', 'capa') : p;
      salvar({ path: final, origem: 'imagem' });
    } catch (e) { s().toastMsg(`Não foi possível usar a imagem: ${e.message || e}`, 'err'); } finally { setOcupado(false); }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {cover?.path && <img src={mediaUrl(cover.path)} alt="" style={{ height: 44, maxWidth: 80, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--line-2)' }} />}
      <button className="btn small" disabled={ocupado} onClick={doQuadro} title="Usa o quadro que está no reprodutor agora (posicione a agulha antes)">
        {ocupado ? <Loader2 size={13} className="spin" /> : <Crosshair size={13} />} Quadro da agulha ({fmtTime(time)})
      </button>
      <button className="btn small" disabled={ocupado} onClick={doImagem}><ImageIcon size={13} /> Imagem…</button>
      {cover?.path && <button className="btn small ghost" onClick={() => salvar(null)} title="Sem capa"><X size={13} /></button>}
      <div className="hint" style={{ flexBasis: '100%' }}>
        {cover?.path ? (cover.origem === 'quadro' ? `Capa: quadro de ${fmtTime(cover.t || 0)}.` : 'Capa: imagem escolhida.') : 'Sem capa: a miniatura será o primeiro quadro do vídeo.'}
        {' '}A capa ocupa só o 1º quadro (1/{useStore.getState().project.fps || 30} s) — é a miniatura que Instagram, WhatsApp e o Windows mostram.
      </div>
    </div>
  );
}
