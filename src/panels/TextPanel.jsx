import React from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '../store.js';
import { TEXT_PRESETS, DEFAULT_TEXT } from '../shared/defs.js';
import { startDrag, endDrag } from '../dnd.js';

export function presetCss(style) {
  const st = { ...DEFAULT_TEXT, ...style };
  const css = {
    fontFamily: `"${st.font}", sans-serif`,
    fontWeight: st.weight,
    fontStyle: st.italic ? 'italic' : 'normal',
    color: st.color,
    letterSpacing: `${(st.letterSpacing || 0) / 6}px`,
    textTransform: st.uppercase ? 'uppercase' : 'none',
  };
  const shadows = [];
  if (st.stroke?.enabled) {
    const w = Math.max(1, Math.round(st.stroke.width / 5));
    css.WebkitTextStroke = `${w}px ${st.stroke.color}`;
    css.paintOrder = 'stroke fill';
  }
  if (st.shadow?.enabled) shadows.push(`${st.shadow.x / 5}px ${st.shadow.y / 5}px ${st.shadow.blur / 4}px ${st.shadow.color}`);
  if (shadows.length) css.textShadow = shadows.join(',');
  return css;
}

export default function TextPanel() {
  const s = useStore.getState;
  return (
    <div>
      <button className="btn primary block" onClick={() => s().addText('classic')} style={{ height: 34, marginBottom: 6 }}>
        <Plus size={16} /> Adicionar texto
      </button>
      <div className="hint" style={{ marginBottom: 4 }}>O texto entra no cursor da linha do tempo. Clique num estilo ou arraste para a linha do tempo.</div>
      <div className="lp-section-title" style={{ marginTop: 14 }}>Estilos</div>
      <div className="grid">
        {TEXT_PRESETS.map((p) => {
          const st = { ...DEFAULT_TEXT, ...p.style };
          const bg = st.background?.enabled;
          return (
            <div key={p.id} className="fx-card" title={p.name}
              draggable onDragStart={(e) => startDrag(e, { kind: 'text', preset: p.id }, p.name)} onDragEnd={endDrag}
              onClick={() => s().addText(p.id)}>
              <div className="text-preset">
                <span style={{
                  ...presetCss(p.style),
                  ...(bg ? { background: st.background.color, opacity: 1, padding: '2px 7px', borderRadius: st.background.radius / 4 } : {}),
                }}>Texto</span>
              </div>
              <div className="label">{p.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
