import React, { useEffect, useRef, useState } from 'react';
import { FlipHorizontal2, FlipVertical2, RotateCcw, AlignLeft, AlignCenter, AlignRight, Italic, CaseUpper, AudioLines, Trash2, Link } from 'lucide-react';
import { useStore } from '../store.js';
import { findClip, fmtTime, projectDuration, mainTrack, transitionDuration } from '../shared/timeline.js';
import { FONTS, RATIOS, FPS_LIST, TEXT_PRESETS, TRANSITIONS, ANIMS_IN, ANIMS_OUT, DEFAULT_TEXT, sizeFromMedia } from '../shared/defs.js';
import { ADJUST_FIELDS, FILTERS } from '../shared/ops.js';
import { EFFECTS, FX_CATS } from '../shared/effects.js';
import { Slider, Field, Toggle, Seg, ColorInput, editClip, editProject } from './ui.jsx';
import { FxSample, EffectThumb } from '../panels/FxPanels.jsx';
import { presetCss } from '../panels/TextPanel.jsx';

function Tabs({ tabs, value, onChange }) {
  return (
    <div className="insp-tabs">
      {tabs.map((t) => <button key={t.id} className={`insp-tab ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>{t.name}</button>)}
    </div>
  );
}

function Section({ title, right, children }) {
  return (
    <div className="section">
      <div className="section-title"><span>{title}</span>{right}</div>
      {children}
    </div>
  );
}

// ---------- Projeto (nada selecionado) ----------
function ProjectPanel() {
  const p = useStore((s) => s.project);
  const bg = p.background || { type: 'color', color: '#000000', blur: 0.03 };
  const clips = p.tracks.reduce((n, t) => n + t.clips.length, 0);
  const setRatio = (id) => {
    const r = RATIOS.find((x) => x.id === id);
    useStore.getState().commit((d) => {
      d.ratio = id;
      if (id === 'original') {
        const first = mainTrack(d)?.clips[0];
        const m = first && d.media.find((x) => x.id === first.mediaId);
        const sz = m?.width ? sizeFromMedia(m.width, m.height) : { w: 1920, h: 1080 };
        d.width = sz.w; d.height = sz.h;
      } else { d.width = r.w; d.height = r.h; }
    }, { keepTracks: true });
  };
  return (
    <>
      <div className="insp-tabs"><button className="insp-tab active">Projeto</button></div>
      <div className="insp-body">
        <Section title="Projeto">
          <Field label="Nome"><input type="text" value={p.name} style={{ width: '100%' }} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => { const v = e.target.value; editProject((d) => { d.name = v; }); }} /></Field>
          <Field label="Proporção">
            <select value={p.ratio} style={{ width: '100%' }} onChange={(e) => setRatio(e.target.value)}>
              {RATIOS.map((r) => <option key={r.id} value={r.id}>{r.name}{r.hint ? ` · ${r.hint}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Quadros/s">
            <select value={p.fps} style={{ width: '100%' }} onChange={(e) => useStore.getState().updateProject({ fps: Number(e.target.value) })}>
              {FPS_LIST.map((f) => <option key={f} value={f}>{f} fps</option>)}
            </select>
          </Field>
        </Section>
        <Section title="Fundo da tela">
          <div className="hint" style={{ marginBottom: 8 }}>Aparece quando o vídeo não preenche o quadro (ex.: vídeo deitado num projeto 9:16).</div>
          <Field label="Tipo">
            <Seg value={bg.type} onChange={(v) => useStore.getState().updateProject({ background: { ...bg, type: v } })}
              options={[{ value: 'color', label: 'Cor' }, { value: 'blur', label: 'Desfoque' }]} />
          </Field>
          {bg.type === 'color'
            ? <Field label="Cor"><ColorInput value={bg.color} onChange={(c) => editProject((d) => { d.background = { ...bg, color: c }; })} /></Field>
            : <Field label="Desfoque"><Slider value={Math.round((bg.blur ?? 0.03) * 1000)} min={5} max={80} onChange={(v) => editProject((d) => { d.background = { ...bg, blur: v / 1000 }; })} /></Field>}
        </Section>
        <Section title="Informações">
          <div className="kv">
            <span>Resolução</span><span>{p.width} × {p.height}</span>
            <span>Duração</span><span>{fmtTime(projectDuration(p), p.fps, true)}</span>
            <span>Clipes</span><span>{clips}</span>
            <span>Mídias</span><span>{p.media.length}</span>
          </div>
        </Section>
        <div className="hint">Selecione um clipe na linha do tempo (ou clique no reprodutor) para editar.</div>
      </div>
    </>
  );
}

// ---------- Transição ----------
function TransitionPanel({ clipId }) {
  const project = useStore((s) => s.project);
  const found = findClip(project, clipId);
  if (!found || !found.clip.transition) return <div className="empty-insp">Transição removida.</div>;
  const { clip, track, index } = found;
  const next = track.clips[index + 1];
  const tr = clip.transition;
  const maxD = Math.max(0.1, Math.min(clip.duration, next?.duration || clip.duration) * 0.5);
  const s = useStore.getState;
  return (
    <>
      <div className="insp-tabs"><button className="insp-tab active">Transição</button></div>
      <div className="insp-body">
        <Section title="Tipo">
          <div className="anim-grid">
            {TRANSITIONS.map((t) => <button key={t.id} className={tr.id === t.id ? 'on' : ''} onClick={() => s().setTransition(clipId, t.id, tr.duration)}>{t.name}</button>)}
          </div>
        </Section>
        <Section title="Duração">
          <Slider value={Math.min(tr.duration, maxD)} min={0.1} max={Number(maxD.toFixed(2))} step={0.05}
            onChange={(v) => editClip(clipId, (c) => { c.transition.duration = v; })} />
          <div className="hint">Efetiva: {transitionDuration(clip, next).toFixed(2)} s (no máximo metade do clipe mais curto).</div>
        </Section>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => { s().applyTransitionAll(tr.id, tr.duration); s().toastMsg('Transição aplicada em todas as junções'); }}>Aplicar a todas</button>
          <button className="btn danger" onClick={() => s().setTransition(clipId, null)}><Trash2 size={14} /> Remover</button>
        </div>
      </div>
    </>
  );
}

// ---------- Abas de clipe ----------
function BasicTab({ clip, isMain }) {
  const tf = clip.transform || {};
  const cr = clip.crop || { l: 0, t: 0, r: 0, b: 0 };
  const id = clip.id;
  const isMedia = clip.type === 'video' || clip.type === 'image';
  const bgMode = clip.bg ? clip.bg.type : 'project';
  return (
    <>
      <Section title="Transformar" right={
        <button className="btn small ghost" title="Redefinir" onClick={() => useStore.getState().updateClip(id, (c) => { c.transform = { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false }; c.opacity = 1; })}><RotateCcw size={13} /> Redefinir</button>
      }>
        {isMedia && (
          <Field label="Encaixe">
            <Seg value={clip.fit || 'contain'} onChange={(v) => useStore.getState().updateClip(id, { fit: v })}
              options={[{ value: 'contain', label: 'Ajustar' }, { value: 'cover', label: 'Preencher' }]} />
          </Field>
        )}
        <Field label="Escala"><Slider value={Math.round((tf.scale ?? 1) * 100)} min={1} max={500} onChange={(v) => editClip(id, (c) => { c.transform.scale = v / 100; })} /></Field>
        <Field label="Posição X"><Slider value={Math.round((tf.x || 0) * 1000) / 10} min={-100} max={100} step={0.1} onChange={(v) => editClip(id, (c) => { c.transform.x = v / 100; })} /></Field>
        <Field label="Posição Y"><Slider value={Math.round((tf.y || 0) * 1000) / 10} min={-100} max={100} step={0.1} onChange={(v) => editClip(id, (c) => { c.transform.y = v / 100; })} /></Field>
        <Field label="Rotação"><Slider value={Math.round(tf.rotation || 0)} min={-180} max={180} onChange={(v) => editClip(id, (c) => { c.transform.rotation = v; })} /></Field>
        <Field label="Opacidade"><Slider value={Math.round((clip.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => editClip(id, (c) => { c.opacity = v / 100; })} /></Field>
        {isMedia && (
          <Field label="Espelhar">
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`btn small ${tf.flipH ? 'primary' : ''}`} onClick={() => useStore.getState().updateClip(id, (c) => { c.transform.flipH = !c.transform.flipH; })}><FlipHorizontal2 size={14} /> Horizontal</button>
              <button className={`btn small ${tf.flipV ? 'primary' : ''}`} onClick={() => useStore.getState().updateClip(id, (c) => { c.transform.flipV = !c.transform.flipV; })}><FlipVertical2 size={14} /> Vertical</button>
            </div>
          </Field>
        )}
      </Section>
      {isMedia && (
        <Section title="Recortar" right={<button className="btn small ghost" onClick={() => useStore.getState().updateClip(id, { crop: { l: 0, t: 0, r: 0, b: 0 } })}><RotateCcw size={13} /></button>}>
          {[['l', 'Esquerda'], ['r', 'Direita'], ['t', 'Topo'], ['b', 'Base']].map(([k, n]) => (
            <Field key={k} label={n}><Slider value={Math.round((cr[k] || 0) * 100)} min={0} max={45} onChange={(v) => editClip(id, (c) => { c.crop = { ...(c.crop || {}), [k]: v / 100 }; })} /></Field>
          ))}
        </Section>
      )}
      {isMedia && isMain && (
        <Section title="Fundo">
          <Field label="Tipo">
            <Seg value={bgMode} onChange={(v) => useStore.getState().updateClip(id, (c) => {
              const pb = useStore.getState().project.background;
              c.bg = v === 'project' ? null : { type: v, color: c.bg?.color || pb?.color || '#000000', blur: c.bg?.blur ?? pb?.blur ?? 0.03 };
            })} options={[{ value: 'project', label: 'Padrão' }, { value: 'color', label: 'Cor' }, { value: 'blur', label: 'Desfoque' }]} />
          </Field>
          {clip.bg?.type === 'color' && <Field label="Cor"><ColorInput value={clip.bg.color} onChange={(v) => editClip(id, (c) => { c.bg.color = v; })} /></Field>}
          {clip.bg?.type === 'blur' && <Field label="Desfoque"><Slider value={Math.round((clip.bg.blur ?? 0.03) * 1000)} min={5} max={80} onChange={(v) => editClip(id, (c) => { c.bg.blur = v / 1000; })} /></Field>}
        </Section>
      )}
    </>
  );
}

function AudioTab({ clip }) {
  const id = clip.id;
  const s = useStore.getState;
  return (
    <>
      <Section title="Som">
        <Field label="Volume"><Slider value={Math.round((clip.volume ?? 1) * 100)} min={0} max={200} onChange={(v) => editClip(id, (c) => { c.volume = v / 100; })} /></Field>
        <Field label="Entrada suave"><Slider value={clip.fadeIn || 0} min={0} max={Math.min(10, Number(clip.duration.toFixed(1)))} step={0.1} onChange={(v) => editClip(id, (c) => { c.fadeIn = v; })} /></Field>
        <Field label="Saída suave"><Slider value={clip.fadeOut || 0} min={0} max={Math.min(10, Number(clip.duration.toFixed(1)))} step={0.1} onChange={(v) => editClip(id, (c) => { c.fadeOut = v; })} /></Field>
        <Field label="Sem som"><Toggle on={!!clip.muted} onChange={(v) => s().updateClip(id, { muted: v })} /></Field>
      </Section>
      {clip.type === 'video' && (
        <button className="btn" onClick={() => s().extractAudio(id)}><AudioLines size={14} /> Separar áudio</button>
      )}
    </>
  );
}

function SpeedTab({ clip }) {
  const id = clip.id;
  const sp = clip.speed || 1;
  const setSpeed = (v) => editClip(id, (c, p) => {
    const m = p.media.find((x) => x.id === c.mediaId);
    const old = c.speed || 1;
    const src = c.duration * old;
    c.speed = v;
    c.duration = src / v;
    if (m && m.duration) c.duration = Math.min(c.duration, (m.duration - (c.in || 0)) / v);
  });
  return (
    <Section title="Velocidade">
      <Field label="Multiplicador">
        <Slider value={Math.round(Math.log2(sp) * 100) / 100} min={-3.32} max={3.32} step={0.01} onChange={(v) => setSpeed(Math.round(Math.pow(2, v) * 100) / 100)} />
      </Field>
      <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, margin: '4px 0 10px' }}>{sp.toFixed(2)}x</div>
      <div className="anim-grid">
        {[0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10].map((v) => <button key={v} className={Math.abs(sp - v) < 0.005 ? 'on' : ''} onClick={() => setSpeed(v)}>{v}x</button>)}
      </div>
      <div className="hint" style={{ marginTop: 10 }}>Duração no projeto: {fmtTime(clip.duration, 30, true)}. O som acompanha a velocidade mantendo o tom.</div>
    </Section>
  );
}

function AnimTab({ clip }) {
  const id = clip.id;
  const ai = clip.animIn || { id: 'none', duration: 0.5 };
  const ao = clip.animOut || { id: 'none', duration: 0.5 };
  const maxD = Math.max(0.1, Math.min(5, Number(clip.duration.toFixed(1))));
  return (
    <>
      <Section title="Entrada">
        <div className="anim-grid">
          {ANIMS_IN.map((a) => <button key={a.id} className={ai.id === a.id ? 'on' : ''} onClick={() => useStore.getState().updateClip(id, (c) => { c.animIn = { id: a.id, duration: ai.duration || 0.5 }; })}>{a.name}</button>)}
        </div>
        {ai.id !== 'none' && <Field label="Duração"><Slider value={Math.min(ai.duration, maxD)} min={0.1} max={maxD} step={0.1} onChange={(v) => editClip(id, (c) => { c.animIn.duration = v; })} /></Field>}
      </Section>
      <Section title="Saída">
        <div className="anim-grid">
          {ANIMS_OUT.map((a) => <button key={a.id} className={ao.id === a.id ? 'on' : ''} onClick={() => useStore.getState().updateClip(id, (c) => { c.animOut = { id: a.id, duration: ao.duration || 0.5 }; })}>{a.name}</button>)}
        </div>
        {ao.id !== 'none' && <Field label="Duração"><Slider value={Math.min(ao.duration, maxD)} min={0.1} max={maxD} step={0.1} onChange={(v) => editClip(id, (c) => { c.animOut.duration = v; })} /></Field>}
      </Section>
    </>
  );
}

function AdjustTab({ clip }) {
  const id = clip.id;
  const a = clip.adjust || {};
  return (
    <Section title="Ajustes de cor" right={<button className="btn small ghost" onClick={() => useStore.getState().updateClip(id, (c) => { c.adjust = {}; })}><RotateCcw size={13} /> Redefinir</button>}>
      {ADJUST_FIELDS.map((f) => (
        <Field key={f.key} label={f.name}><Slider value={a[f.key] || 0} min={f.min} max={f.max} onChange={(v) => editClip(id, (c) => { c.adjust = { ...(c.adjust || {}), [f.key]: v }; })} /></Field>
      ))}
    </Section>
  );
}

function FilterTab({ clip }) {
  const id = clip.id;
  const f = clip.filter || { id: 'none', intensity: 100 };
  return (
    <>
      <Section title="Filtro">
        <div className="grid small">
          {FILTERS.map((x) => (
            <div key={x.id} className={`fx-card ${f.id === x.id ? 'active' : ''}`} onClick={() => useStore.getState().applyFilter(id, x.id)}>
              <div className="sw"><FxSample ops={x.ops} /></div>
              <div className="label">{x.name}</div>
            </div>
          ))}
        </div>
      </Section>
      {f.id !== 'none' && <Field label="Intensidade"><Slider value={f.intensity ?? 100} min={0} max={100} onChange={(v) => editClip(id, (c) => { c.filter.intensity = v; })} /></Field>}
    </>
  );
}

function TextTab({ clip }) {
  const id = clip.id;
  const st = clip.text;
  const ref = useRef(null);
  const font = FONTS.find((f) => f.family === st.font);
  useEffect(() => {
    const h = () => { ref.current?.focus(); ref.current?.select(); };
    window.addEventListener('focus-text-editor', h);
    return () => window.removeEventListener('focus-text-editor', h);
  }, []);
  const set = (fn) => editClip(id, (c) => fn(c.text));
  if (clip.sticker) {
    return (
      <Section title="Sticker">
        <Field label="Emoji"><input type="text" value={st.content} style={{ width: 80, fontSize: 20, fontFamily: 'Segoe UI Emoji' }} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => { const v = e.target.value; set((t) => { t.content = v; }); }} /></Field>
        <Field label="Tamanho"><Slider value={st.size} min={20} max={800} onChange={(v) => set((t) => { t.size = v; })} /></Field>
        <Field label="Sombra"><Toggle on={!!st.shadow?.enabled} onChange={(v) => set((t) => { t.shadow = { ...t.shadow, enabled: v }; })} /></Field>
      </Section>
    );
  }
  return (
    <>
      <Section title="Texto">
        <textarea ref={ref} rows={3} value={st.content} onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => { const v = e.target.value; set((t) => { t.content = v; }); }} />
      </Section>
      <Section title="Fonte">
        <Field label="Família">
          <select className="font-select" value={st.font} style={{ fontFamily: `"${st.font}"` }}
            onChange={(e) => { const fam = e.target.value; const f = FONTS.find((x) => x.family === fam); useStore.getState().updateClip(id, (c) => { c.text.font = fam; if (!f.weights.includes(c.text.weight)) c.text.weight = f.weights[f.weights.length - 1]; }); }}>
            {FONTS.map((f) => <option key={f.family} value={f.family} style={{ fontFamily: `"${f.family}"` }}>{f.family}</option>)}
          </select>
        </Field>
        <Field label="Peso">
          <Seg value={st.weight} onChange={(v) => useStore.getState().updateClip(id, (c) => { c.text.weight = v; })}
            options={(font?.weights || [400, 700]).map((w) => ({ value: w, label: w === 400 ? 'Normal' : w === 700 ? 'Negrito' : 'Black' }))} />
        </Field>
        <Field label="Estilo">
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={`icon-btn ${st.italic ? 'active' : ''}`} title="Itálico" onClick={() => useStore.getState().updateClip(id, (c) => { c.text.italic = !c.text.italic; })}><Italic size={15} /></button>
            <button className={`icon-btn ${st.uppercase ? 'active' : ''}`} title="Maiúsculas" onClick={() => useStore.getState().updateClip(id, (c) => { c.text.uppercase = !c.text.uppercase; })}><CaseUpper size={15} /></button>
            <span style={{ width: 8 }} />
            {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([a, I]) => (
              <button key={a} className={`icon-btn ${st.align === a ? 'active' : ''}`} onClick={() => useStore.getState().updateClip(id, (c) => { c.text.align = a; })}><I size={15} /></button>
            ))}
          </div>
        </Field>
        <Field label="Tamanho"><Slider value={st.size} min={10} max={400} onChange={(v) => set((t) => { t.size = v; })} /></Field>
        <Field label="Cor"><ColorInput value={st.color} onChange={(v) => set((t) => { t.color = v; })} /></Field>
        <Field label="Espaçamento"><Slider value={st.letterSpacing || 0} min={-10} max={60} onChange={(v) => set((t) => { t.letterSpacing = v; })} /></Field>
        <Field label="Entrelinha"><Slider value={st.lineHeight || 1.2} min={0.7} max={3} step={0.05} onChange={(v) => set((t) => { t.lineHeight = v; })} /></Field>
      </Section>
      <Section title="Estilos prontos">
        <div className="grid small">
          {TEXT_PRESETS.map((p) => (
            <div key={p.id} className="text-preset" style={{ fontSize: 14 }} title={p.name}
              onClick={() => useStore.getState().updateClip(id, (c) => { c.text = { ...defaultsFor(p.style), content: c.text.content }; })}>
              <span style={{ ...presetCss(p.style), ...(p.style.background?.enabled ? { background: p.style.background.color, padding: '1px 5px', borderRadius: 3 } : {}) }}>Aa</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Contorno" right={<Toggle on={!!st.stroke?.enabled} onChange={(v) => useStore.getState().updateClip(id, (c) => { c.text.stroke = { ...c.text.stroke, enabled: v }; })} />}>
        {st.stroke?.enabled && <>
          <Field label="Cor"><ColorInput value={st.stroke.color} onChange={(v) => set((t) => { t.stroke.color = v; })} /></Field>
          <Field label="Espessura"><Slider value={st.stroke.width} min={1} max={30} onChange={(v) => set((t) => { t.stroke.width = v; })} /></Field>
        </>}
      </Section>
      <Section title="Fundo" right={<Toggle on={!!st.background?.enabled} onChange={(v) => useStore.getState().updateClip(id, (c) => { c.text.background = { ...c.text.background, enabled: v }; })} />}>
        {st.background?.enabled && <>
          <Field label="Cor"><ColorInput value={st.background.color} onChange={(v) => set((t) => { t.background.color = v; })} /></Field>
          <Field label="Opacidade"><Slider value={Math.round((st.background.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => set((t) => { t.background.opacity = v / 100; })} /></Field>
          <Field label="Margem"><Slider value={st.background.padding} min={0} max={100} onChange={(v) => set((t) => { t.background.padding = v; })} /></Field>
          <Field label="Cantos"><Slider value={st.background.radius} min={0} max={100} onChange={(v) => set((t) => { t.background.radius = v; })} /></Field>
        </>}
      </Section>
      <Section title="Sombra" right={<Toggle on={!!st.shadow?.enabled} onChange={(v) => useStore.getState().updateClip(id, (c) => { c.text.shadow = { ...c.text.shadow, enabled: v }; })} />}>
        {st.shadow?.enabled && <>
          <Field label="Cor"><ColorInput value={st.shadow.color} onChange={(v) => set((t) => { t.shadow.color = v; })} /></Field>
          <Field label="Opacidade"><Slider value={Math.round((st.shadow.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => set((t) => { t.shadow.opacity = v / 100; })} /></Field>
          <Field label="Desfoque"><Slider value={st.shadow.blur} min={0} max={80} onChange={(v) => set((t) => { t.shadow.blur = v; })} /></Field>
          <Field label="Distância X"><Slider value={st.shadow.x} min={-50} max={50} onChange={(v) => set((t) => { t.shadow.x = v; })} /></Field>
          <Field label="Distância Y"><Slider value={st.shadow.y} min={-50} max={50} onChange={(v) => set((t) => { t.shadow.y = v; })} /></Field>
        </>}
      </Section>
    </>
  );
}

function defaultsFor(style) {
  return { ...structuredClone(DEFAULT_TEXT), ...structuredClone(style) };
}

function EffectTab({ clip }) {
  const id = clip.id;
  const fx = clip.effect;
  const isFilter = fx.kind === 'filter';
  const cur = isFilter ? null : EFFECTS.find((e) => e.id === fx.id);
  const list = isFilter ? FILTERS.filter((f) => f.id !== 'none') : EFFECTS.filter((e) => e.cat === (cur?.cat || 'basic'));
  return (
    <>
      <Section title={isFilter ? 'Filtro' : `Efeito · ${FX_CATS.find((c) => c.id === cur?.cat)?.name || ''}`}>
        <div className="grid small">
          {list.map((x) => (
            <div key={x.id} className={`fx-card ${fx.id === x.id ? 'active' : ''}`} onClick={() => useStore.getState().updateClip(id, (c) => { c.effect.id = x.id; })}>
              <div className="sw">{isFilter ? <FxSample ops={x.ops} /> : <EffectThumb id={x.id} />}</div>
              <div className="label">{x.name}</div>
            </div>
          ))}
        </div>
        {!isFilter && <div className="hint" style={{ marginTop: 8 }}>Outras categorias ficam na aba Efeitos, à esquerda.</div>}
      </Section>
      <Field label="Intensidade"><Slider value={fx.intensity ?? 100} min={0} max={100} onChange={(v) => editClip(id, (c) => { c.effect.intensity = v; })} /></Field>
      <div className="hint" style={{ marginTop: 8 }}>Vale para todas as faixas abaixo, de {fmtTime(clip.start, 30, true)} a {fmtTime(clip.start + clip.duration, 30, true)}.</div>
    </>
  );
}

const TYPE_NAME = { video: 'Vídeo', image: 'Foto', audio: 'Áudio', text: 'Texto', effect: 'Efeito' };

function ClipPanel({ id }) {
  const project = useStore((s) => s.project);
  const meta = useStore((s) => s.meta);
  const found = findClip(project, id);
  const media = found?.clip.mediaId ? project.media.find((m) => m.id === found.clip.mediaId) : null;
  const missing = found?.clip.mediaId ? meta[found.clip.mediaId]?.status === 'missing' : false;
  const [tab, setTab] = useState(null);
  if (!found) return <div className="empty-insp">Nada selecionado.</div>;
  const { clip, track } = found;
  let tabs = [];
  if (clip.type === 'video' || clip.type === 'image') {
    tabs = [{ id: 'basic', name: clip.type === 'video' ? 'Vídeo' : 'Foto' }];
    if (clip.type === 'video' && media?.hasAudio) tabs.push({ id: 'audio', name: 'Áudio' });
    if (clip.type === 'video') tabs.push({ id: 'speed', name: 'Velocidade' });
    tabs.push({ id: 'anim', name: 'Animação' }, { id: 'adjust', name: 'Ajuste' }, { id: 'filter', name: 'Filtro' });
  } else if (clip.type === 'text') tabs = [{ id: 'text', name: clip.sticker ? 'Sticker' : 'Texto' }, { id: 'anim', name: 'Animação' }, { id: 'basic', name: 'Posição' }];
  else if (clip.type === 'audio') tabs = [{ id: 'audio', name: 'Áudio' }, { id: 'speed', name: 'Velocidade' }];
  else if (clip.type === 'effect') tabs = [{ id: 'effect', name: clip.effect.kind === 'filter' ? 'Filtro' : 'Efeito' }];
  const cur = tabs.find((t) => t.id === tab) ? tab : tabs[0].id;
  return (
    <>
      <Tabs tabs={tabs} value={cur} onChange={setTab} />
      <div className="insp-body">
        <div className="hint" style={{ marginBottom: 12 }}>
          {TYPE_NAME[clip.type]}{media ? ` · ${media.name}` : ''} · {fmtTime(clip.duration, 30, true)}{track.main ? ' · faixa principal' : ''}
        </div>
        {missing && (
          <div className="err-box" style={{ marginBottom: 12, fontFamily: 'inherit' }}>
            O arquivo desta mídia não foi encontrado.{' '}
            <button className="btn small" onClick={() => useStore.getState().relinkMedia(media.id)}><Link size={12} /> Localizar…</button>
          </div>
        )}
        {cur === 'basic' && <BasicTab clip={clip} isMain={!!track.main} />}
        {cur === 'audio' && <AudioTab clip={clip} />}
        {cur === 'speed' && <SpeedTab clip={clip} />}
        {cur === 'anim' && <AnimTab clip={clip} />}
        {cur === 'adjust' && <AdjustTab clip={clip} />}
        {cur === 'filter' && <FilterTab clip={clip} />}
        {cur === 'text' && <TextTab clip={clip} />}
        {cur === 'effect' && <EffectTab clip={clip} />}
      </div>
    </>
  );
}

export default function Inspector() {
  const sel = useStore((s) => s.selection);
  return (
    <div className="panel">
      {!sel && <ProjectPanel />}
      {sel?.type === 'transition' && <TransitionPanel key={sel.id} clipId={sel.id} />}
      {sel?.type === 'clip' && <ClipPanel key={sel.id} id={sel.id} />}
    </div>
  );
}
