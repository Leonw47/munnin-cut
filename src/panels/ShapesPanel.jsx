import React, { useEffect, useRef } from 'react';
import { useStore } from '../store.js';
import { SHAPES, DEFAULT_SHAPE, drawShape } from '../engine/shapes.js';
import { startDrag, endDrag } from '../dnd.js';

// Miniatura desenhada com o mesmo código da prévia.
export function ShapeThumb({ shape, size = 96 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const sh = { ...DEFAULT_SHAPE, ...shape };
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const k = (size * 0.78) / Math.max(sh.w, sh.h, 1);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    drawShape(ctx, sh, k);
    ctx.restore();
  }, [shape, size]);
  return <canvas ref={ref} width={size} height={size} />;
}

export default function ShapesPanel() {
  const s = useStore.getState;
  return (
    <div>
      <div className="hint" style={{ marginBottom: 10 }}>Clique para adicionar no cursor ou arraste para a linha do tempo. Cor, contorno, cantos e sombra ficam no painel à direita; tamanho e posição, direto no reprodutor.</div>
      <div className="grid small">
        {SHAPES.map((p) => (
          <div key={p.id} className="shape-card" title={p.name} draggable
            onDragStart={(ev) => startDrag(ev, { kind: 'shape', id: p.id }, p.name)} onDragEnd={endDrag}
            onClick={() => s().addShape(p.id)}>
            <ShapeThumb shape={p.shape} />
            <span className="label">{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
