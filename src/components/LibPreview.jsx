// Prévia de uma mídia da biblioteca no reprodutor (sem pôr na linha do tempo): tocar, arrastar a barra,
// ver o corte definido e adicionar. Esc / X / clicar na linha do tempo volta ao projeto.
import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, X, Plus, Layers, Volume2, VolumeX, Music } from 'lucide-react';
import { useStore } from '../store.js';
import { mediaUrl } from '../engine/util.js';
import { fmtPrec } from './TrimDialog.jsx';

export default function LibPreview({ mediaId }) {
  const m = useStore((s) => s.project.media.find((x) => x.id === mediaId));
  const meta = useStore((s) => s.meta[mediaId]);
  const elRef = useRef(null);
  const [t, setT] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const fechar = () => useStore.getState().closeLibPreview();
  const D = m?.duration || 0;
  const corte = m?.trim ? { a: m.trim.in, b: m.trim.out } : null;

  useEffect(() => {
    const toggle = () => {
      const el = elRef.current;
      if (!el) return;
      if (el.paused) { if (corte && (el.currentTime < corte.a || el.currentTime >= corte.b - 0.05)) el.currentTime = corte.a; el.play().catch(() => {}); } else el.pause();
    };
    const onToggle = () => toggle();
    // clicar na linha do tempo ou no painel de edição volta ao projeto
    const onDown = (e) => { if (e.target?.closest?.('.timeline')) fechar(); };
    window.addEventListener('libprev-toggle', onToggle);
    window.addEventListener('pointerdown', onDown, true);
    return () => { window.removeEventListener('libprev-toggle', onToggle); window.removeEventListener('pointerdown', onDown, true); };
  });
  useEffect(() => {
    const el = elRef.current;
    if (!el) return undefined;
    let raf = 0;
    const tick = () => {
      setT(el.currentTime);
      // com corte definido, a prévia para no fim do trecho
      if (corte && !el.paused && el.currentTime >= corte.b) { el.pause(); el.currentTime = corte.b; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  if (!m) return null;
  const src = mediaUrl(meta?.proxy || m.renderPath || m.path) + (meta?.ver ? `?v=${meta.ver}` : '');
  const toggle = () => window.dispatchEvent(new Event('libprev-toggle'));
  const add = (target) => { fechar(); useStore.getState().addMedia(m.id, target ? { target } : {}); };
  const ev = { onPlay: () => setTocando(true), onPause: () => setTocando(false), onEnded: () => setTocando(false) };
  const inicio = (e) => { e.currentTarget.currentTime = corte ? corte.a : 0; };

  return (
    <div className="libprev" onPointerDown={(e) => e.stopPropagation()}>
      <div className="libprev-head">
        <span className="libprev-tag">Prévia da biblioteca</span>
        <span className="libprev-name" title={m.name}>{m.name}</span>
        <button className="icon-btn" title="Voltar ao projeto (Esc)" onClick={fechar}><X size={16} /></button>
      </div>
      <div className="libprev-stage" onClick={m.type !== 'image' ? toggle : undefined}>
        {m.type === 'video' && <video ref={elRef} src={src} muted={mudo} preload="auto" onLoadedMetadata={inicio} {...ev} />}
        {m.type === 'image' && <img src={src} alt="" draggable={false} />}
        {m.type === 'audio' && <>
          <div className="libprev-audio"><Music size={42} /></div>
          <audio ref={elRef} src={src} muted={mudo} preload="auto" onLoadedMetadata={inicio} {...ev} />
        </>}
      </div>
      <div className="libprev-foot">
        {m.type !== 'image' && <>
          <button className="play-btn" title="Tocar / pausar (Espaço)" onClick={toggle}>{tocando ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
          <div className="libprev-bar">
            {corte && D > 0 && <div className="libprev-corte" style={{ left: `${(corte.a / D) * 100}%`, width: `${((corte.b - corte.a) / D) * 100}%` }} title="Trecho escolhido no cartão" />}
            <input type="range" min={0} max={Math.max(D, 0.01)} step={0.01} value={Math.min(t, D)} style={{ '--p': `${D ? (Math.min(t, D) / D) * 100 : 0}%` }}
              onChange={(e) => { const el = elRef.current; if (el) el.currentTime = parseFloat(e.target.value); }} />
          </div>
          <span className="tc">{fmtPrec(t)} / {fmtPrec(D)}</span>
          <button className="icon-btn" title={mudo ? 'Ativar som' : 'Silenciar'} onClick={() => setMudo(!mudo)}>{mudo ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
        </>}
        {m.type === 'image' && <span className="hint" style={{ flex: 1 }}>{m.width} × {m.height}</span>}
        {m.type !== 'audio' && <button className="btn small" onClick={() => add('overlay')}><Layers size={13} /> Sobreposição</button>}
        <button className="btn small primary" onClick={() => add(null)}><Plus size={13} /> Adicionar</button>
      </div>
    </div>
  );
}
