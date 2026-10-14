import React, { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '../store.js';
import { FILTERS, cssFilter, CSS_OPS, canonical } from '../shared/ops.js';
import { EFFECTS, FX_CATS } from '../shared/effects.js';
import { findClip } from '../shared/timeline.js';
import { sharedSvg } from '../engine/svgFilters.js';
import { startDrag, endDrag } from '../dnd.js';
import { Compositor } from '../engine/compositor.js';
import { makeCanvas } from '../engine/util.js';
import { Seg } from '../components/ui.jsx';

// Amostra visual de uma lista de ops (cena em CSS + filtro real da prévia).
export function FxSample({ ops }) {
  const c = canonical(ops);
  const css = cssFilter(c.filter((o) => CSS_OPS.has(o.op)), 96, sharedSvg());
  const vig = c.find((o) => o.op === 'vignette');
  const bars = c.find((o) => o.op === 'letterbox');
  const pix = c.find((o) => o.op === 'pixelate');
  const rgb = c.find((o) => o.op === 'rgbshift');
  const mirror = c.find((o) => o.op === 'mirror');
  return (
    <>
      <div className="scene" style={{ filter: css === 'none' ? undefined : css, transform: mirror ? 'scaleX(-1)' : undefined }} />
      {rgb && <div style={{ position: 'absolute', inset: 0, mixBlendMode: 'screen', boxShadow: 'inset 3px 0 0 #f004, inset -3px 0 0 #00f4' }} />}
      {pix && <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(#0002 1px, transparent 1px), linear-gradient(90deg, #0002 1px, transparent 1px)', backgroundSize: '8px 8px' }} />}
      {vig && <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle, transparent 35%, rgba(0,0,0,${Math.min(0.95, vig.v * 1.1)}) 100%)` }} />}
      {bars && <><div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${bars.v * 100}%`, background: '#000' }} /><div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${bars.v * 100}%`, background: '#000' }} /></>}
    </>
  );
}

// Passar o mouse num filtro/efeito mostra o resultado no reprodutor, sem aplicar.
let hoverTimer = null;
export function clearFxPreview() {
  clearTimeout(hoverTimer);
  if (useStore.getState().fxPreview) useStore.setState({ fxPreview: null });
}
export function fxHover(kind, id) {
  return {
    onMouseEnter: () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => useStore.setState({ fxPreview: { kind, id, since: performance.now() } }), 140);
    },
    onMouseLeave: clearFxPreview,
  };
}
export function useClearFxPreviewOnUnmount() {
  useEffect(() => clearFxPreview, []);
}

function selectedClip() {
  const s = useStore.getState();
  if (s.selection?.type !== 'clip') return null;
  return findClip(s.project, s.selection.id)?.clip || null;
}

// ---------- Miniaturas animadas: o próprio efeito aplicado numa cena de exemplo ----------
let thumbComp = null;
function drawScene(ctx, W, H, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, '#ffb35c'); g.addColorStop(0.35, '#ff6f61'); g.addColorStop(0.7, '#8a5cf6'); g.addColorStop(1, '#1fb5c9');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,248,220,0.9)';
  ctx.beginPath(); ctx.arc(W * 0.3, H * 0.3, W * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const cx = ((t * 0.08) % 1.4 - 0.2) * W;
  ctx.beginPath(); ctx.ellipse(cx, H * 0.18, W * 0.14, H * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b6b45';
  ctx.beginPath(); ctx.ellipse(W * 0.75, H * 0.95, W * 0.55, H * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b3d2a';
  ctx.beginPath(); ctx.ellipse(W * 0.15, H * 1.02, W * 0.5, H * 0.3, 0, 0, Math.PI * 2); ctx.fill();
}
export function renderFxThumb(target, effect, t) {
  if (!thumbComp) thumbComp = new Compositor(makeCanvas(120, 120));
  const W = thumbComp.canvas.width, H = thumbComp.canvas.height;
  drawScene(thumbComp.ctx, W, H, t);
  thumbComp.applyEffectClip({ id: `thumb_${effect.id}`, type: 'effect', start: 0, duration: 3, effect }, t % 3, W, H);
  const x = target.getContext('2d');
  x.clearRect(0, 0, target.width, target.height);
  x.drawImage(thumbComp.canvas, 0, 0, target.width, target.height);
}
export function EffectThumb({ id, kind = 'effect' }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const eff = { kind, id, intensity: 100 };
    let raf = 0, t0 = 0, hover = false;
    const frame = () => {
      renderFxThumb(c, eff, hover ? (performance.now() - t0) / 1000 : 1.2);
      if (hover) raf = requestAnimationFrame(frame);
    };
    const idle = (window.requestIdleCallback || setTimeout)(frame);
    const el = c.parentElement;
    const on = () => { hover = true; t0 = performance.now(); cancelAnimationFrame(raf); frame(); };
    const off = () => { hover = false; cancelAnimationFrame(raf); frame(); };
    el.addEventListener('mouseenter', on);
    el.addEventListener('mouseleave', off);
    return () => {
      (window.cancelIdleCallback || clearTimeout)(idle);
      cancelAnimationFrame(raf);
      el.removeEventListener('mouseenter', on);
      el.removeEventListener('mouseleave', off);
    };
  }, [id, kind]);
  return <canvas ref={ref} width={120} height={120} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

export function EffectsPanel() {
  const sel = useStore((s) => (s.selection?.type === 'clip' ? findClip(s.project, s.selection.id)?.clip : null));
  const [cat, setCat] = useState(() => localStorage.getItem('mc.fxcat') || 'all');
  useEffect(() => { localStorage.setItem('mc.fxcat', cat); }, [cat]);
  useClearFxPreviewOnUnmount();
  const activeId = sel?.type === 'effect' && sel.effect.kind === 'effect' ? sel.effect.id : null;
  const pick = (id) => {
    const s = useStore.getState();
    const c = selectedClip();
    if (c?.type === 'effect' && c.effect.kind === 'effect') s.updateClip(c.id, (x) => { x.effect.id = id; });
    else s.addEffect('effect', id);
  };
  const list = EFFECTS.filter((e) => cat === 'all' || e.cat === cat);
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {FX_CATS.map((c) => (
          <button key={c.id} className={`btn small ${cat === c.id ? 'primary' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>
        ))}
      </div>
      <div className="hint" style={{ marginBottom: 10 }}>Passe o mouse para ver o efeito no reprodutor, sem aplicar. Clique para aplicar: ele entra numa faixa própria no cursor e vale para tudo o que está abaixo; estique o clipe para durar mais.</div>
      <div className="grid small">
        {list.map((e) => (
          <div key={e.id} className={`fx-card ${activeId === e.id ? 'active' : ''}`} title={e.name}
            draggable onDragStart={(ev) => { clearFxPreview(); startDrag(ev, { kind: 'effect', id: e.id }, e.name); }} onDragEnd={endDrag}
            {...fxHover('effect', e.id)}
            onClick={() => { clearFxPreview(); pick(e.id); }}>
            <div className="sw"><EffectThumb id={e.id} /><span className="plus"><Plus size={13} /></span></div>
            <div className="label">{e.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FiltersPanel() {
  const sel = useStore((s) => (s.selection?.type === 'clip' ? findClip(s.project, s.selection.id)?.clip : null));
  const visual = sel && (sel.type === 'video' || sel.type === 'image');
  const activeId = visual ? sel.filter?.id || 'none' : sel?.type === 'effect' && sel.effect.kind === 'filter' ? sel.effect.id : null;
  useClearFxPreviewOnUnmount();
  const pick = (id) => {
    const s = useStore.getState();
    const c = selectedClip();
    if (c && (c.type === 'video' || c.type === 'image')) s.applyFilter(c.id, id);
    else if (c?.type === 'effect' && c.effect.kind === 'filter') s.updateClip(c.id, (x) => { x.effect.id = id; });
    else if (id !== 'none') s.addEffect('filter', id);
  };
  return (
    <div>
      <div className="hint" style={{ marginBottom: 10 }}>
        {visual ? <>Passe o mouse para ver no reprodutor; clique para aplicar no clipe selecionado. Ajuste a intensidade no painel à direita.</> : <>Passe o mouse para ver no reprodutor. Selecione um clipe para aplicar só nele, ou clique para criar um filtro na linha do tempo (vale para tudo abaixo).</>}
      </div>
      <div className="grid small">
        {FILTERS.map((f) => (
          <div key={f.id} className={`fx-card ${activeId === f.id ? 'active' : ''}`} title={f.name}
            draggable={f.id !== 'none'} onDragStart={(ev) => { clearFxPreview(); startDrag(ev, { kind: 'filter', id: f.id }, f.name); }} onDragEnd={endDrag}
            {...fxHover('filter', f.id)}
            onClick={() => { clearFxPreview(); pick(f.id); }}>
            <div className="sw"><FxSample ops={f.ops} /></div>
            <div className="label">{f.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
