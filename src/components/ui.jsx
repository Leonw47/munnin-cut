import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store.js';

// Edições agrupadas: mudanças seguidas (arrastar slider, digitar) viram um único passo de desfazer.
let lastEdit = 0;
function groupCheckpoint() {
  const now = performance.now();
  if (now - lastEdit > 700) useStore.getState().checkpoint();
  lastEdit = now;
}
export function editClip(id, fn) {
  groupCheckpoint();
  useStore.getState().updateClip(id, fn, { silent: true });
}
export function editProject(fn) {
  groupCheckpoint();
  useStore.getState().commit(fn, { silent: true, keepTracks: true });
}

const round = (v, step) => {
  const d = step < 1 ? Math.max(0, Math.ceil(-Math.log10(step))) : 0;
  return Number(v.toFixed(d));
};

export function Slider({ value, min, max, step = 1, onChange }) {
  const v = Number.isFinite(value) ? value : 0;
  const p = Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const [txt, setTxt] = useState(String(round(v, step)));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setTxt(String(round(v, step))); }, [v, step]);
  return (
    <div className="slider-row">
      <input type="range" min={min} max={max} step={step} value={v} style={{ '--p': `${p}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => onChange(min < 0 && max > 0 ? 0 : v)} />
      <input type="number" min={min} max={max} step={step} value={txt}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; setTxt(String(round(v, step))); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); e.stopPropagation(); }}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = parseFloat(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }} />
    </div>
  );
}

export function Field({ label, children, title }) {
  return (
    <div className="field" title={title}>
      <label>{label}</label>
      <div>{children}</div>
    </div>
  );
}

export function Toggle({ on, onChange, title }) {
  return <button className={`toggle ${on ? 'on' : ''}`} title={title} onClick={() => onChange(!on)} />;
}

export function Seg({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} title={o.title} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

const SWATCHES = ['#ffffff', '#000000', '#ffd60a', '#ff4d4d', '#ff4d9d', '#a855f7', '#3b82f6', '#19d3df', '#22c55e', '#f97316', '#8b5a2b', '#9ca3af'];

export function ColorInput({ value, onChange, swatches = true }) {
  return (
    <div>
      <div className="color-in">
        <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} />
        <input type="text" value={value || ''} style={{ width: 86 }}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value); }} />
      </div>
      {swatches && (
        <div className="swatches">
          {SWATCHES.map((c) => <button key={c} style={{ background: c }} onClick={() => onChange(c)} title={c} />)}
        </div>
      )}
    </div>
  );
}

export function useOutside(ref, onOut, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    const k = (e) => { if (e.key === 'Escape') onOut(); };
    window.addEventListener('pointerdown', h, true);
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('pointerdown', h, true); window.removeEventListener('keydown', k); };
  }, [ref, onOut, active]);
}

export function Dropdown({ button, children, align = 'left', up = false, width }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutside(ref, () => setOpen(false), open);
  return (
    <div className="dd" ref={ref}>
      {button({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className="dd-menu" style={{ [align]: 0, [up ? 'bottom' : 'top']: 'calc(100% + 4px)', minWidth: width }} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, label, kbd, onClick, disabled, on }) {
  return (
    <button className={`dd-item ${on ? 'on' : ''}`} disabled={disabled} onClick={onClick}>
      {icon}<span>{label}</span>{kbd && <span className="kbd">{kbd}</span>}
    </button>
  );
}

export function ContextMenu({ x, y, onClose, children }) {
  const ref = useRef(null);
  useOutside(ref, onClose, true);
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ left: Math.min(x, window.innerWidth - r.width - 8), top: Math.min(y, window.innerHeight - r.height - 8) });
  }, [x, y]);
  return (
    <div className="ctx-menu dd-menu" ref={ref} style={pos} onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, width }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={{ width }}>
        <div className="modal-head">{title}{onClose && <button className="icon-btn" onClick={onClose}><X size={16} /></button>}</div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// Listas longas (ex.: 1000 mídias importadas) em páginas: só a página atual vai para a tela, o resto fica
// guardado. Seleção, Ctrl+A e Shift+clique continuam valendo para a lista inteira.
const POR_PAGINA = [30, 60, 120, 240];
export function usePaginas(total, chave, { novosNoFim = true } = {}) {
  const [pp, setPp] = useState(() => { try { return Number(localStorage.getItem('mc.porpagina')) || 60; } catch { return 60; } });
  const [pag, setPag] = useState(1);
  const ult = useRef(total);
  const paginas = Math.max(1, Math.ceil(total / pp));
  // filtro/pesquisa mudou → primeira página; itens novos importados → página onde eles estão (a última)
  useEffect(() => { setPag(1); }, [chave]);
  useEffect(() => {
    if (novosNoFim && total > ult.current) setPag(Math.max(1, Math.ceil(total / pp)));
    ult.current = total;
  }, [total, pp, novosNoFim]);
  const atual = Math.min(pag, paginas);
  const mudarPp = (n) => { setPp(n); setPag(1); try { localStorage.setItem('mc.porpagina', String(n)); } catch { /* ignore */ } };
  return { pp, pag: atual, paginas, ini: (atual - 1) * pp, fim: Math.min(total, atual * pp), setPag, mudarPp };
}

export function Paginador({ p, total, rotulo = 'itens' }) {
  if (total <= POR_PAGINA[0]) return null;
  const { pag, paginas, ini, fim, setPag, pp, mudarPp } = p;
  const nums = [];
  for (let i = 1; i <= paginas; i++) if (i === 1 || i === paginas || Math.abs(i - pag) <= 1) nums.push(i);
  const comPontos = [];
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) comPontos.push(`…${n}`); comPontos.push(n); });
  return (
    <div className="paginador">
      <button className="icon-btn sm" disabled={pag <= 1} onClick={() => setPag(pag - 1)} title="Página anterior">‹</button>
      {comPontos.map((n) => (typeof n === 'string'
        ? <span key={n} className="pg-pontos">…</span>
        : <button key={n} className={`pg ${n === pag ? 'on' : ''}`} onClick={() => setPag(n)}>{n}</button>))}
      <button className="icon-btn sm" disabled={pag >= paginas} onClick={() => setPag(pag + 1)} title="Próxima página">›</button>
      <span className="pg-info">{ini + 1}–{fim} de {total} {rotulo}</span>
      <select value={pp} onChange={(e) => mudarPp(Number(e.target.value))} title="Quantos por página">
        {POR_PAGINA.map((n) => <option key={n} value={n}>{n} por página</option>)}
      </select>
    </div>
  );
}
