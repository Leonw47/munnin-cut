// Cortar silêncios de um vídeo/áudio: analisa a forma de onda (instantâneo, dá para ajustar à vontade),
// mostra o que sai e o que fica e troca o clipe pelos trechos com fala. Um passo só de desfazer.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Scissors, Play, Pause } from 'lucide-react';
import { useStore } from '../store.js';
import { findClip, fmtTime } from '../shared/timeline.js';
import { analisarSilencios, SILENCIO_PADRAO } from '../shared/silencios.js';
import { mediaUrl } from '../engine/util.js';
import { Modal, Slider, Field } from './ui.jsx';
import { useWave } from './Timeline.jsx';

const ls = () => { try { return { ...SILENCIO_PADRAO, ...JSON.parse(localStorage.getItem('mc.silencio') || '{}') }; } catch { return { ...SILENCIO_PADRAO }; } };

export default function CortarSilencios() {
  const clipId = useStore((s) => s.silencioClipId);
  const project = useStore((s) => s.project);
  const meta = useStore((s) => s.meta);
  const fechar = () => useStore.setState({ modal: null, silencioClipId: null });
  const found = findClip(project, clipId);
  const c = found?.clip;
  const m = c ? project.media.find((x) => x.id === c.mediaId) : null;
  const mt = m ? meta[m.id] : null;
  const peaks = useWave(mt?.waveform);
  const [op, setOp] = useState(ls);
  useEffect(() => { try { localStorage.setItem('mc.silencio', JSON.stringify(op)); } catch { /* ignore */ } }, [op]);
  const sp = c?.speed || 1;
  const len = c ? c.duration * sp : 0;
  const r = useMemo(() => (peaks && c ? analisarSilencios(peaks, c.in || 0, len, op) : null), [peaks, c, len, op]);

  // ouvir o resultado: toca só os trechos que ficam, em sequência
  const elRef = useRef(null);
  const [tocando, setTocando] = useState(false);
  useEffect(() => () => elRef.current?.pause(), []);
  const ouvir = async () => {
    if (tocando) { elRef.current?.pause(); setTocando(false); return; }
    if (!r?.ficam.length) return;
    if (!elRef.current) { elRef.current = new Audio(); elRef.current.src = mediaUrl(mt?.proxy || m.path); }
    const el = elRef.current;
    setTocando(true);
    for (const [a, b] of r.ficam) {
      el.currentTime = (c.in || 0) + a;
      el.playbackRate = sp;
      await el.play().catch(() => {});
      await new Promise((res) => {
        const iv = setInterval(() => { if (el.paused || el.currentTime >= (c.in || 0) + b) { clearInterval(iv); res(); } }, 20);
      });
      if (el.paused && el.currentTime < (c.in || 0) + b - 0.05) break;   // parou no meio (clicou de novo)
    }
    el.pause();
    setTocando(false);
  };

  if (!c || !m) return null;
  const aplicar = () => {
    elRef.current?.pause();
    const { n, tirado } = useStore.getState().cortarSilencios(c.id, r.ficam);
    fechar();
    useStore.getState().toastMsg(n ? `Silêncios cortados: ${n} trechos, ${fmtTime(tirado)} a menos. Ctrl+Z desfaz.` : 'Nada para cortar.', 'info', 5000);
  };
  const x = (t) => `${(t / Math.max(0.001, len)) * 100}%`;
  const semAudio = !m.hasAudio;
  const footer = (
    <>
      <span className="hint" style={{ marginRight: 'auto' }}>
        {r && <>De <b style={{ color: 'var(--text)' }}>{fmtTime(r.antes / sp)}</b> para <b style={{ color: 'var(--text)' }}>{fmtTime(r.depois / sp)}</b> · {r.silencios.length} silêncios</>}
      </span>
      <button className="btn" disabled={!r?.ficam.length} onClick={ouvir}>{tocando ? <Pause size={14} /> : <Play size={14} />} Ouvir o resultado</button>
      <button className="btn primary" disabled={!r || !r.silencios.length || !r.ficam.length} onClick={aplicar}><Scissors size={14} /> Cortar silêncios</button>
    </>
  );
  return (
    <Modal title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Scissors size={16} /> Cortar silêncios · <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>{m.name}</span></span>} onClose={fechar} footer={footer} width={720}>
      {semAudio && <div className="err-box" style={{ fontFamily: 'inherit', marginBottom: 10 }}>Este clipe não tem som para analisar.</div>}
      {c.reverse && <div className="err-box" style={{ fontFamily: 'inherit', marginBottom: 10 }}>Desligue o "Reverter" deste clipe antes de cortar os silêncios.</div>}
      <div className="silencio-barra" title="Verde: fica · vermelho: sai">
        {r?.ficam.map(([a, b], i) => <div key={i} className="fica" style={{ left: x(a), width: `calc(${x(b)} - ${x(a)})` }} />)}
        {r?.silencios.map(([a, b], i) => <div key={`s${i}`} className="sai" style={{ left: x(a), width: `calc(${x(b)} - ${x(a)})` }} />)}
        {!peaks && <span className="hint" style={{ padding: 8 }}>Lendo a forma de onda…</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4, marginTop: 12 }}>
        <Field label="Sensibilidade" title="Abaixo deste volume conta como silêncio (dB). Mais alto = corta mais (inclui respiração e ruído baixo).">
          <Slider value={op.limiar} min={-60} max={-15} onChange={(v) => setOp((o) => ({ ...o, limiar: v }))} />
        </Field>
        <Field label="Silêncio mínimo (s)" title="Pausas mais curtas que isto ficam (ritmo natural da fala)">
          <Slider value={op.minimo} min={0.15} max={3} step={0.05} onChange={(v) => setOp((o) => ({ ...o, minimo: v }))} />
        </Field>
        <Field label="Margem (s)" title="Respiro que fica antes e depois de cada fala, para não cortar sílabas">
          <Slider value={op.margem} min={0} max={0.6} step={0.01} onChange={(v) => setOp((o) => ({ ...o, margem: v }))} />
        </Field>
      </div>
      <div className="hint" style={{ marginTop: 8 }}>
        Ajuste e veja na barra o que sai (vermelho). Na faixa principal os pedaços se juntam sozinhos; em outras faixas, o que vem depois
        na mesma faixa anda para trás. Textos e legendas em outras faixas não acompanham — ajuste depois, se precisar.
      </div>
    </Modal>
  );
}
