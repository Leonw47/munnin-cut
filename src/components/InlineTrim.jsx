// Corte direto no item da biblioteca (sem janela): alças de início e fim sobre a miniatura.
// Arraste as alças (Shift = ajuste fino), arraste o meio para mover o trecho, clique duplo para usar a mídia
// inteira. Enquanto arrasta, toca um pedacinho do ponto para você ouvir onde está cortando.
import React, { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { useStore } from '../store.js';
import { MIN_CLIP } from '../shared/timeline.js';
import { mediaUrl } from '../engine/util.js';
import { useWave } from './Timeline.jsx';

export const fmtCut = (t) => {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function Wave({ path, w, h, color }) {
  const data = useWave(path);
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !data || !w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = color;
    const per = data.length / w;
    for (let x = 0; x < w; x++) {
      let mx = 0;
      for (let i = Math.floor(x * per), e = Math.max(i + 1, Math.floor((x + 1) * per)); i < e && i < data.length; i++) if (data[i] > mx) mx = data[i];
      const bh = Math.max(1, (mx / 255) * h * 0.9);
      ctx.fillRect(x, (h - bh) / 2, 1, bh);
    }
  }, [data, w, h, color]);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: w, height: h, pointerEvents: 'none' }} />;
}

/**
 * m: mídia (vídeo/áudio); full: ocupa a miniatura inteira (áudio) em vez de uma faixa embaixo (vídeo);
 * onScrub(t | null): tempo sob a alça durante o arraste (para mostrar o quadro do vídeo).
 */
export default function InlineTrim({ m, meta, full = false, height = 22, onScrub }) {
  const D = m.duration || 0;
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [w, setW] = useState(0);
  const barRef = useRef(null);
  const elRef = useRef(null);
  const timer = useRef(0);
  const cur = drag || { a: m.trim?.in ?? 0, b: Math.min(D, m.trim?.out ?? D) };

  useEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const stop = () => { clearTimeout(timer.current); elRef.current?.pause(); setPlaying(false); };
  useEffect(() => () => { clearTimeout(timer.current); if (elRef.current) { elRef.current.pause(); elRef.current.removeAttribute('src'); elRef.current.load(); } }, []);
  const audio = () => {
    if (!elRef.current) { const el = new Audio(); el.preload = 'auto'; el.src = mediaUrl(meta?.proxy || m.path); elRef.current = el; }
    return elRef.current;
  };
  const playFrom = (t, len) => {
    const el = audio();
    clearTimeout(timer.current);
    el.currentTime = clamp(t, 0, D);
    el.play().then(() => setPlaying(true)).catch(() => {});
    timer.current = setTimeout(stop, Math.max(50, len * 1000));
  };

  const x = (t) => (D > 0 ? (t / D) * w : 0);
  const commit = (r) => {
    const fullRange = r.a <= 0.001 && r.b >= D - 0.001;
    useStore.getState().updateMediaSilent(m.id, { trim: fullRange ? undefined : { in: r.a, out: r.b } });
  };
  const down = (e, which) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    useStore.getState().pause();
    const rect = barRef.current.getBoundingClientRect();
    const r0 = { ...cur }, x0 = e.clientX;
    let last = 0;
    const move = (ev) => {
      const k = (D / Math.max(1, rect.width)) * (ev.shiftKey ? 0.1 : 1);
      const dt = (ev.clientX - x0) * k;
      let { a, b } = r0;
      if (which === 'a') a = clamp(r0.a + dt, 0, r0.b - MIN_CLIP);
      else if (which === 'b') b = clamp(r0.b + dt, r0.a + MIN_CLIP, D);
      else { const len = r0.b - r0.a; a = clamp(r0.a + dt, 0, D - len); b = a + len; }
      dragRef.current = { a, b, which };
      setDrag(dragRef.current);
      const at = which === 'b' ? b : a;
      onScrub?.(at);
      const now = performance.now();
      if (now - last > 250) { last = now; if (which === 'b') playFrom(Math.max(a, b - 0.7), 0.7); else playFrom(a, 0.7); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (dragRef.current) commit(dragRef.current);
      dragRef.current = null;
      setDrag(null);
      onScrub?.(null);
      stop();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const hBar = full ? '100%' : height;
  const trimmed = cur.a > 0.001 || cur.b < D - 0.001;
  return (
    <>
      <button className={`itrim-play ${full ? 'full' : ''}`} title={playing ? 'Parar' : 'Ouvir o trecho escolhido'}
        onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); if (playing) stop(); else playFrom(cur.a, cur.b - cur.a); }}>
        {playing ? <Square size={10} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
      </button>
      <div className={`itrim ${full ? 'full' : ''}`} ref={barRef} style={{ height: hBar }}
        draggable onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => { e.stopPropagation(); commit({ a: 0, b: D }); }}
        title="Arraste as alças para escolher o início e o fim (Shift = ajuste fino). Clique duplo: mídia inteira.">
        {meta?.waveform && w > 0 && <Wave path={meta.waveform} w={w} h={full ? barRef.current?.clientHeight || 60 : height} color={full ? '#7ff0bf' : '#ffffffa0'} />}
        <div className="itrim-out" style={{ left: 0, width: x(cur.a) }} />
        <div className="itrim-out" style={{ left: x(cur.b), right: 0 }} />
        <div className="itrim-sel" style={{ left: x(cur.a), width: Math.max(2, x(cur.b) - x(cur.a)) }} onPointerDown={(e) => down(e, 'move')} />
        <div className="itrim-h a" style={{ left: x(cur.a) }} onPointerDown={(e) => down(e, 'a')} />
        <div className="itrim-h b" style={{ left: x(cur.b) - 8 }} onPointerDown={(e) => down(e, 'b')} />
        {drag && <div className="itrim-tip" style={{ left: clamp(x(drag.which === 'b' ? drag.b : drag.a), 18, Math.max(18, w - 18)) }}>{fmtCut(drag.which === 'b' ? drag.b : drag.a)}</div>}
      </div>
      <div className={`itrim-times ${trimmed ? 'on' : ''}`} style={{ bottom: full ? 3 : height + 3 }}>
        {fmtCut(cur.a)}–{fmtCut(cur.b)}
      </div>
    </>
  );
}
