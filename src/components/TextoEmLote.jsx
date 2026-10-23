// Estilo de vários textos de uma vez (todas as legendas, ou os textos selecionados na linha do tempo).
// Mostra os valores do primeiro; cada mudança vale para todos, sem mexer no conteúdo de cada um.
import React from 'react';
import { useStore } from '../store.js';
import { findClip } from '../shared/timeline.js';
import { FONTS, DEFAULT_TEXT } from '../shared/defs.js';
import { Slider, Field, Toggle, ColorInput } from './ui.jsx';

export default function TextoEmLote({ ids, titulo = 'Estilo de todos' }) {
  const project = useStore((s) => s.project);
  const textos = ids.map((id) => findClip(project, id)?.clip).filter((c) => c?.type === 'text');
  if (!textos.length) return null;
  const t = { ...DEFAULT_TEXT, ...textos[0].text };
  // aplica em todos; `fn` recebe o objeto text de cada clipe
  const todos = (fn, silent = false) => useStore.getState().commit((p) => {
    for (const c of textos) {
      const f = findClip(p, c.id);
      if (f) { f.clip.text = { ...DEFAULT_TEXT, ...f.clip.text }; fn(f.clip.text); }
    }
  }, { silent, keepTracks: true });
  // sliders: um passo de desfazer por gesto (checkpoint no começo, mudanças silenciosas depois)
  const gesto = { onPointerDownCapture: () => useStore.getState().checkpoint() };
  const sub = (k, patch) => (x) => { x[k] = { ...DEFAULT_TEXT[k], ...(x[k] || {}), ...patch }; };

  return (
    <div className="section">
      <div className="section-title"><span>{titulo} ({textos.length})</span></div>
      <Field label="Fonte">
        <select value={t.font} style={{ width: '100%' }} onChange={(e) => { const v = e.target.value; todos((x) => { x.font = v; }); }}>
          {FONTS.map((f) => <option key={f.family} value={f.family} style={{ fontFamily: `"${f.family}"` }}>{f.family}</option>)}
        </select>
      </Field>
      <div {...gesto}><Field label="Tamanho"><Slider value={t.size} min={16} max={240} onChange={(v) => todos((x) => { x.size = v; }, true)} /></Field></div>
      <Field label="Cor do texto"><ColorInput value={t.color} onChange={(v) => todos((x) => { x.color = v; })} /></Field>
      <Field label="Negrito"><Toggle on={(t.weight || 400) >= 700} onChange={(v) => todos((x) => {
        const ws = FONTS.find((f) => f.family === x.font)?.weights || [400, 700];
        x.weight = v ? Math.max(...ws) : Math.min(...ws);
      })} /></Field>
      <Field label="Maiúsculas"><Toggle on={!!t.uppercase} onChange={(v) => todos((x) => { x.uppercase = v; })} /></Field>
      <Field label="Contorno"><Toggle on={!!t.stroke?.enabled} onChange={(v) => todos(sub('stroke', { enabled: v }))} /></Field>
      {t.stroke?.enabled && <>
        <Field label="Cor do contorno"><ColorInput value={t.stroke.color} onChange={(v) => todos(sub('stroke', { color: v }))} /></Field>
        <div {...gesto}><Field label="Espessura"><Slider value={t.stroke.width} min={1} max={24} onChange={(v) => todos(sub('stroke', { width: v }), true)} /></Field></div>
      </>}
      <Field label="Fundo"><Toggle on={!!t.background?.enabled} onChange={(v) => todos(sub('background', { enabled: v }))} /></Field>
      {t.background?.enabled && <>
        <Field label="Cor do fundo"><ColorInput value={t.background.color} onChange={(v) => todos(sub('background', { color: v }))} /></Field>
        <div {...gesto}><Field label="Opacidade do fundo"><Slider value={Math.round((t.background.opacity ?? 0.75) * 100)} min={0} max={100} onChange={(v) => todos(sub('background', { opacity: v / 100 }), true)} /></Field></div>
      </>}
      <Field label="Sombra"><Toggle on={!!t.shadow?.enabled} onChange={(v) => todos(sub('shadow', { enabled: v }))} /></Field>
    </div>
  );
}
