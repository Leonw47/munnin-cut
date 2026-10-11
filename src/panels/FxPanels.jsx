import React from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '../store.js';
import { EFFECTS, FILTERS, cssFilter, CSS_OPS, canonical } from '../shared/ops.js';
import { findClip } from '../shared/timeline.js';
import { sharedSvg } from '../engine/svgFilters.js';
import { startDrag, endDrag } from '../dnd.js';

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

function selectedClip() {
  const s = useStore.getState();
  if (s.selection?.type !== 'clip') return null;
  return findClip(s.project, s.selection.id)?.clip || null;
}

export function EffectsPanel() {
  const sel = useStore((s) => (s.selection?.type === 'clip' ? findClip(s.project, s.selection.id)?.clip : null));
  const activeId = sel?.type === 'effect' && sel.effect.kind === 'effect' ? sel.effect.id : null;
  const pick = (id) => {
    const s = useStore.getState();
    const c = selectedClip();
    if (c?.type === 'effect' && c.effect.kind === 'effect') s.updateClip(c.id, (x) => { x.effect.id = id; });
    else s.addEffect('effect', id);
  };
  return (
    <div>
      <div className="hint" style={{ marginBottom: 10 }}>Efeitos entram numa faixa própria e valem para tudo o que está abaixo dela, durante o tempo do clipe. Estique o clipe para durar mais.</div>
      <div className="grid small">
        {EFFECTS.map((e) => (
          <div key={e.id} className={`fx-card ${activeId === e.id ? 'active' : ''}`} title={e.name}
            draggable onDragStart={(ev) => startDrag(ev, { kind: 'effect', id: e.id }, e.name)} onDragEnd={endDrag}
            onClick={() => pick(e.id)}>
            <div className="sw"><FxSample ops={e.ops} /><span className="plus"><Plus size={13} /></span></div>
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
        {visual ? <>Aplicando no clipe selecionado. Ajuste a intensidade no painel à direita.</> : <>Selecione um clipe para aplicar só nele, ou clique para criar um filtro na linha do tempo (vale para tudo abaixo).</>}
      </div>
      <div className="grid small">
        {FILTERS.map((f) => (
          <div key={f.id} className={`fx-card ${activeId === f.id ? 'active' : ''}`} title={f.name}
            draggable={f.id !== 'none'} onDragStart={(ev) => startDrag(ev, { kind: 'filter', id: f.id }, f.name)} onDragEnd={endDrag}
            onClick={() => pick(f.id)}>
            <div className="sw"><FxSample ops={f.ops} /></div>
            <div className="label">{f.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
