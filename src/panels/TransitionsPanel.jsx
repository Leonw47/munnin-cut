import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { TRANSITIONS, TRANSITION_CATS } from '../shared/defs.js';
import { mainTrack, findClip } from '../shared/timeline.js';
import { drawTransitionThumb } from '../engine/transitions.js';
import { makeCanvas } from '../engine/util.js';
import { startDrag, endDrag } from '../dnd.js';

const W = 96, H = 96;
const tmp = { canvas: null, ctx: null };

function Thumb({ id }) {
  const ref = useRef(null);
  const hover = useRef(false);
  useEffect(() => {
    if (!tmp.canvas) { tmp.canvas = makeCanvas(W, H); tmp.ctx = tmp.canvas.getContext('2d'); }
    const ctx = ref.current.getContext('2d');
    let raf = 0, t0 = performance.now();
    const draw = () => {
      const p = hover.current ? ((performance.now() - t0) / 1400) % 1.25 : 0.5;
      drawTransitionThumb(ctx, id, Math.min(1, p), W, H, tmp);
      if (hover.current) raf = requestAnimationFrame(draw);
    };
    draw();
    const el = ref.current.parentElement;
    const on = () => { hover.current = true; t0 = performance.now(); cancelAnimationFrame(raf); draw(); };
    const off = () => { hover.current = false; cancelAnimationFrame(raf); draw(); };
    el.addEventListener('mouseenter', on);
    el.addEventListener('mouseleave', off);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('mouseenter', on); el.removeEventListener('mouseleave', off); };
  }, [id]);
  return <canvas ref={ref} width={W} height={H} style={{ width: '100%', height: '100%' }} />;
}

// Junção (clipe da esquerda) mais próxima do cursor na faixa principal.
export function junctionAt(project, t) {
  const main = mainTrack(project);
  if (!main || main.clips.length < 2) return null;
  let best = null, bd = Infinity;
  main.clips.forEach((c, i) => {
    if (i >= main.clips.length - 1) return;
    const cut = c.start + c.duration;
    const d = Math.abs(cut - t);
    if (d < bd) { bd = d; best = c.id; }
  });
  return best;
}

export default function TransitionsPanel() {
  const sel = useStore((s) => s.selection);
  const current = useStore((s) => (s.selection?.type === 'transition' ? findClip(s.project, s.selection.id)?.clip?.transition?.id : null));
  const [cat, setCat] = useState(() => { try { return localStorage.getItem('mc.trcat') || 'basic'; } catch { return 'basic'; } });
  useEffect(() => { try { localStorage.setItem('mc.trcat', cat); } catch { /* ignore */ } }, [cat]);
  const pick = (id) => {
    const s = useStore.getState();
    const target = s.selection?.type === 'transition' ? s.selection.id : junctionAt(s.project, s.time);
    if (!target) { s.toastMsg('Coloque pelo menos dois clipes na faixa principal.'); return; }
    s.setTransition(target, id);
  };
  return (
    <div>
      <div className="hint" style={{ marginBottom: 10 }}>
        {sel?.type === 'transition' ? 'Trocando a transição selecionada.' : 'Clique para aplicar na junção mais próxima do cursor, ou arraste até a junção entre dois clipes.'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {TRANSITION_CATS.map((c) => <button key={c.id} className={`btn small ${cat === c.id ? 'primary' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
      </div>
      {cat === 'camera' && <div className="hint" style={{ marginBottom: 10 }}>Movimentos de câmera com desfoque de movimento. Use durações curtas (0,5 a 1 s) para ficar no ritmo.</div>}
      <div className="grid small">
        {TRANSITIONS.filter((t) => (t.cat || 'basic') === cat).map((t) => (
          <div key={t.id} className={`fx-card ${current === t.id ? 'active' : ''}`} title={t.name}
            draggable onDragStart={(e) => startDrag(e, { kind: 'transition', id: t.id }, t.name)} onDragEnd={endDrag}
            onClick={() => pick(t.id)}>
            <div className="trans-sw"><Thumb id={t.id} /></div>
            <div className="label">{t.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
