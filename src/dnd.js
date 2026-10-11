// Arrastar da biblioteca para a linha do tempo. O conteúdo do dataTransfer não é legível
// durante o dragover, então guardamos o item arrastado aqui.
export const dnd = { item: null };

export function startDrag(e, item, label) {
  dnd.item = item;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('application/x-mcut', JSON.stringify(item));
  if (label) {
    const g = document.createElement('div');
    g.textContent = label;
    g.style.cssText = 'position:fixed;top:-100px;left:-100px;padding:4px 8px;background:#19d3df;color:#00262a;border-radius:6px;font:600 12px Segoe UI';
    document.body.appendChild(g);
    e.dataTransfer.setDragImage(g, 10, 10);
    setTimeout(() => g.remove(), 0);
  }
}

export function endDrag() { dnd.item = null; }
