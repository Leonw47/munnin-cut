// Pré-visualizar e cortar uma mídia (áudio/vídeo) antes de inserir — como no CapCut.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Plus, Layers, Scissors, RotateCcw, Music } from 'lucide-react';
import { useStore } from '../store.js';
import { mediaUrl } from '../engine/util.js';
import { fmtTime, MIN_CLIP } from '../shared/timeline.js';
import { Modal } from './ui.jsx';
import { useWave } from './Timeline.jsx';

export const fmtPrec = (t) => {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};
export const parseTime = (txt) => {
  const p = String(txt).trim().replace(',', '.').split(':').map(Number);
  if (p.some((x) => Number.isNaN(x))) return null;
  return p.length === 1 ? p[0] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2];
};

export function TimeField({ label, value, onCommit }) {
  const [txt, setTxt] = useState(fmtPrec(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setTxt(fmtPrec(value)); }, [value]);
  const commit = () => { const v = parseTime(txt); if (v !== null) onCommit(v); else setTxt(fmtPrec(value)); };
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--muted)', fontSize: 11 }}>
      {label}
      <input type="text" value={txt} style={{ width: 96, fontVariantNumeric: 'tabular-nums' }}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; commit(); }}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); }}
        onChange={(e) => setTxt(e.target.value)} />
    </label>
  );
}

function FullWave({ path, width, height, color }) {
  const data = useWave(path);
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !data || !width) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;
    const per = data.length / width;
    for (let x = 0; x < width; x++) {
      let mx = 0;
      const a = Math.floor(x * per), b = Math.max(a + 1, Math.floor((x + 1) * per));
      for (let i = a; i < b && i < data.length; i++) if (data[i] > mx) mx = data[i];
      const h = Math.max(1, (mx / 255) * height * 0.95);
      ctx.fillRect(x, (height - h) / 2, 1, h);
    }
  }, [data, width, height, color]);
  return <canvas ref={ref} style={{ position: 'absolute', left: 0, top: 0, width, height }} />;
}

export default function TrimDialog() {
  const id = useStore((s) => s.trimMediaId);
  const m = useStore((s) => s.project?.media.find((x) => x.id === s.trimMediaId));
  const meta = useStore((s) => s.meta[s.trimMediaId]);
  const close = useCallback(() => useStore.setState({ modal: null, trimMediaId: null }), []);
  const D = m?.duration || 0;
  const [range, setRange] = useState(() => ({ a: m?.trim?.in ?? 0, b: Math.min(D, m?.trim?.out ?? D) }));
  const [pos, setPos] = useState(range.a);
  const [playing, setPlaying] = useState(false);
  const [stripW, setStripW] = useState(700);
  const elRef = useRef(null);
  const stripRef = useRef(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  useEffect(() => { useStore.getState().pause(); }, []);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setStripW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // relógio da reprodução: segue o elemento e para no fim da seleção
  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    const tick = () => {
      const el = elRef.current;
      if (!el) return;
      setPos(el.currentTime);
      if (el.currentTime >= rangeRef.current.b - 0.01) { el.pause(); setPlaying(false); setPos(rangeRef.current.b); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = (t) => {
    const v = Math.max(0, Math.min(D, t));
    setPos(v);
    if (elRef.current) elRef.current.currentTime = v;
  };
  const toggle = () => {
    const el = elRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); return; }
    let start = pos;
    if (start < range.a || start >= range.b - 0.05) start = range.a;
    el.currentTime = start;
    setPos(start);
    el.play().then(() => setPlaying(true)).catch(() => {});
  };
  const setA = (v) => setRange((r) => ({ a: Math.max(0, Math.min(v, r.b - MIN_CLIP)), b: r.b }));
  const setB = (v) => setRange((r) => ({ a: r.a, b: Math.min(D, Math.max(v, r.a + MIN_CLIP)) }));

  // teclas: espaço, I, O
  useEffect(() => {
    const k = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (key === ' ') { e.preventDefault(); toggle(); }
      else if (key === 'i') { e.preventDefault(); setA(elRef.current?.currentTime ?? pos); }
      else if (key === 'o') { e.preventDefault(); setB(elRef.current?.currentTime ?? pos); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  if (!m) return null;
  const isVideo = m.type === 'video';
  const src = mediaUrl(meta?.proxy || m.path);
  const x = (t) => (D > 0 ? (t / D) * stripW : 0);
  const tAt = (clientX) => {
    const r = stripRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(D, ((clientX - r.left) / r.width) * D));
  };

  const drag = (e, mode) => {
    e.stopPropagation();
    e.preventDefault();
    const t0 = tAt(e.clientX);
    const r0 = { ...range };
    const move = (ev) => {
      const t = tAt(ev.clientX);
      if (mode === 'a') { setA(t); seek(Math.max(0, Math.min(t, r0.b - MIN_CLIP))); }
      else if (mode === 'b') { setB(t); seek(Math.min(D, Math.max(t, r0.a + MIN_CLIP))); }
      else if (mode === 'move') {
        const len = r0.b - r0.a;
        const a = Math.max(0, Math.min(D - len, r0.a + (t - t0)));
        setRange({ a, b: a + len });
      } else seek(t);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    if (mode === 'seek') seek(t0);
  };

  const saveTrim = () => {
    const full = range.a <= 0.001 && range.b >= D - 0.001;
    useStore.getState().updateMediaSilent(id, { trim: full ? undefined : { in: range.a, out: range.b } });
  };
  const add = (target) => {
    saveTrim();
    close();
    useStore.getState().addMedia(id, target === 'overlay' ? { target: 'overlay' } : {});
  };

  const t = meta?.thumbs;
  const stripH = isVideo ? 64 : 84;
  const footer = (
    <>
      <span className="hint" style={{ marginRight: 'auto' }}>Seleção: <b style={{ color: 'var(--text)' }}>{fmtPrec(range.b - range.a)}</b></span>
      <button className="btn" onClick={() => { saveTrim(); close(); }}>Salvar seleção</button>
      {isVideo ? (
        <>
          <button className="btn" onClick={() => add('overlay')}><Layers size={15} /> Como sobreposição</button>
          <button className="btn primary" onClick={() => add('main')}><Plus size={15} /> Adicionar à faixa principal</button>
        </>
      ) : (
        <button className="btn primary" onClick={() => add('audio')}><Plus size={15} /> Adicionar no cursor</button>
      )}
    </>
  );

  return (
    <Modal title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Scissors size={16} /> Cortar antes de inserir · <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>{m.name}</span></span>} onClose={close} footer={footer} width={820}>
      {isVideo ? (
        <video ref={elRef} src={src} crossOrigin="anonymous" style={{ width: '100%', maxHeight: 300, background: '#000', borderRadius: 8, display: 'block' }}
          onLoadedMetadata={(e) => { e.currentTarget.currentTime = range.a; }} onClick={toggle} />
      ) : (
        <div style={{ height: 70, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-2)' }}>
          <div style={{ width: 52, height: 52, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#123d2c,#1d6f4d)' }}><Music size={24} color="#9ff0c8" /></div>
          <div><div style={{ fontWeight: 600, color: 'var(--text)' }}>{m.name}</div><div className="hint">Duração total {fmtTime(D)}</div></div>
          <audio ref={elRef} src={src} crossOrigin="anonymous" onLoadedMetadata={(e) => { e.currentTarget.currentTime = range.a; }} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 8px' }}>
        <button className="play-btn" style={{ background: 'var(--panel-3)' }} onClick={toggle} title="Reproduzir seleção (Espaço)">
          {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
        </button>
        <span className="timecode"><b>{fmtPrec(pos)}</b> / {fmtPrec(D)}</span>
        <div style={{ flex: 1 }} />
        <button className="btn small" onClick={() => setA(pos)} title="Atalho: I">Marcar início aqui</button>
        <button className="btn small" onClick={() => setB(pos)} title="Atalho: O">Marcar fim aqui</button>
        <button className="btn small ghost" onClick={() => setRange({ a: 0, b: D })} title="Usar a mídia inteira"><RotateCcw size={13} /></button>
      </div>

      <div ref={stripRef} style={{ position: 'relative', height: stripH, borderRadius: 6, background: '#16161a', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
        onPointerDown={(e) => drag(e, 'seek')}>
        {isVideo && t && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {Array.from({ length: Math.max(1, Math.ceil(stripW / (stripH * (t.tw / t.th)))) }).map((_, j, arr) => {
              const idx = Math.min(t.count - 1, Math.floor((j / arr.length) * t.count));
              const tw = stripH * (t.tw / t.th);
              return <div key={j} style={{ flex: '0 0 auto', width: tw, height: '100%', backgroundImage: `url("${mediaUrl(t.sprite)}")`, backgroundSize: `${t.count * tw}px ${stripH}px`, backgroundPosition: `${-idx * tw}px 0`, opacity: 0.85 }} />;
            })}
          </div>
        )}
        {meta?.waveform && <FullWave path={meta.waveform} width={stripW} height={isVideo ? 26 : stripH} color={isVideo ? '#ffffffb0' : '#7ff0bf'} />}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: x(range.a), background: '#000a' }} />
        <div style={{ position: 'absolute', left: x(range.b), top: 0, bottom: 0, right: 0, background: '#000a' }} />
        <div style={{ position: 'absolute', left: x(range.a), width: Math.max(2, x(range.b) - x(range.a)), top: 0, bottom: 0, boxShadow: 'inset 0 0 0 2px var(--accent)', borderRadius: 4, cursor: 'grab' }}
          onPointerDown={(e) => drag(e, 'move')} />
        {['a', 'b'].map((h) => (
          <div key={h} title={h === 'a' ? 'Início' : 'Fim'} onPointerDown={(e) => drag(e, h)}
            style={{ position: 'absolute', top: 0, bottom: 0, width: 12, left: x(range[h]) - (h === 'a' ? 0 : 12), background: 'var(--accent)', cursor: 'ew-resize', borderRadius: h === 'a' ? '4px 0 0 4px' : '0 4px 4px 0', display: 'grid', placeItems: 'center' }}>
            <span style={{ width: 2, height: 16, background: '#00262a', borderRadius: 2 }} />
          </div>
        ))}
        <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, left: x(pos) - 1, background: '#fff', pointerEvents: 'none' }} />
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginTop: 12 }}>
        <TimeField label="Início" value={range.a} onCommit={(v) => { setA(v); seek(Math.min(v, range.b - MIN_CLIP)); }} />
        <TimeField label="Fim" value={range.b} onCommit={(v) => setB(v)} />
        <TimeField label="Duração" value={range.b - range.a} onCommit={(v) => setB(range.a + v)} />
        <div className="hint" style={{ marginLeft: 'auto', maxWidth: 300, textAlign: 'right' }}>
          Ouça e aperte <b>I</b> para marcar o início e <b>O</b> para o fim — ou arraste as alças. O corte também vale ao arrastar a mídia para a linha do tempo.
        </div>
      </div>
    </Modal>
  );
}
