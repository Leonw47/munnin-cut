import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Plus, Music, Upload, Info } from 'lucide-react';
import { useStore } from '../store.js';
import { fmtTime } from '../shared/timeline.js';
import { startDrag, endDrag } from '../dnd.js';

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

export default function AudioPanel() {
  const media = useStore((s) => s.project.media);
  const meta = useStore((s) => s.meta);
  const audios = media.filter((m) => m.type === 'audio');
  const s = useStore.getState;
  const importMedia = async () => {
    const paths = await window.api.openMediaDialog();
    if (paths.length) s().importPaths(paths);
  };
  return (
    <div>
      <div className="lp-section-title">Narração</div>
      <Recorder />
      <div className="hint" style={{ marginTop: 6 }}>A gravação começa no cursor da linha do tempo e o vídeo toca junto, para você narrar em cima.</div>

      <div className="lp-section-title" style={{ marginTop: 18 }}>Músicas e sons do projeto</div>
      <button className="btn block" onClick={importMedia} style={{ marginBottom: 10 }}><Upload size={15} /> Importar áudio</button>
      {!audios.length && <div className="hint">Nenhum áudio importado ainda.</div>}
      {audios.map((m) => {
        const ready = meta[m.id]?.status === 'ready';
        return (
          <div key={m.id} className="list-item" draggable={ready}
            onDragStart={(e) => startDrag(e, { kind: 'media', id: m.id }, m.name)} onDragEnd={endDrag}
            onDoubleClick={() => ready && s().addMedia(m.id)}>
            <Music size={15} color="#7fe0b0" />
            <span className="grow" title={m.name}>{m.name}</span>
            <span style={{ color: 'var(--muted)' }}>{fmtTime(m.duration)}</span>
            <button className="icon-btn sm" disabled={!ready} title="Adicionar no cursor" onClick={() => s().addMedia(m.id)}><Plus size={14} /></button>
          </div>
        );
      })}
      <div className="hint" style={{ marginTop: 14, display: 'flex', gap: 6 }}>
        <Info size={14} style={{ flex: '0 0 auto', marginTop: 1 }} />
        <span>Para usar só o som de um vídeo: clique com o botão direito no clipe da linha do tempo → <b>Separar áudio</b>.</span>
      </div>
    </div>
  );
}
