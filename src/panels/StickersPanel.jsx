import React from 'react';
import { useStore } from '../store.js';
import { STICKERS } from '../shared/defs.js';
import { startDrag, endDrag } from '../dnd.js';

export default function StickersPanel() {
  const s = useStore.getState;
  return (
    <div>
      <div className="hint" style={{ marginBottom: 8 }}>Clique para adicionar no cursor, ou arraste para a linha do tempo. Depois, ajuste tamanho e posição direto no reprodutor.</div>
      {STICKERS.map((g) => (
        <div key={g.name}>
          <div className="lp-section-title">{g.name}</div>
          <div className="grid stickers">
            {g.items.map((e, i) => (
              <div key={`${e}${i}`} className="sticker" draggable
                onDragStart={(ev) => startDrag(ev, { kind: 'sticker', emoji: e }, e)} onDragEnd={endDrag}
                onClick={() => s().addSticker(e)}>{e}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
