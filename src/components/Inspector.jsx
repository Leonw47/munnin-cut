import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { FlipHorizontal2, FlipVertical2, RotateCcw, AlignLeft, AlignCenter, AlignRight, Italic, CaseUpper, AudioLines, Trash2, Link, Pipette, Loader2, Headphones, Scissors, Layers } from 'lucide-react';
import { DEFAULT_CHROMA, chromaParams } from '../shared/chroma.js';
import { AREA_PADRAO } from '../shared/area.js';
import { AUDIO_FX, DEFAULT_AUDIO_FX } from '../shared/audiofx.js';
import { AMBIENTES, PRESETS_VOZ, VOZ_PADRAO, vozDoClipe, temVoz } from '../shared/voz.js';
import { hasKf, hasKfAt, propAt, upsertKf, removeKfAt, setPropAt, scaleKf, KF_PROPS } from '../shared/keyframes.js';
import { useStore } from '../store.js';
import { findClip, fmtTime, projectDuration, mainTrack, transitionDuration, nextAdjacent, overlayTransDur, OVERLAY_TRANSITIONS } from '../shared/timeline.js';
import { FONTS, RATIOS, FPS_LIST, TEXT_PRESETS, TRANSITIONS, ANIMS_IN, ANIMS_OUT, ANIMS_LOOP, DEFAULT_TEXT, sizeFromMedia } from '../shared/defs.js';
import { ADJUST_FIELDS, FILTERS } from '../shared/ops.js';
import { EFFECTS, FX_CATS } from '../shared/effects.js';
import { Slider, Field, Toggle, Seg, ColorInput, editClip, editGrupo, editProject } from './ui.jsx';
import { grupoDaSelecao, tipoGrupo, NOME_GRUPO } from '../shared/grupo.js';
import { FxSample, EffectThumb, fxHover, clearFxPreview, useClearFxPreviewOnUnmount } from '../panels/FxPanels.jsx';
import { presetCss } from '../panels/TextPanel.jsx';
import { ShapeThumb } from '../panels/ShapesPanel.jsx';
import { SHAPE_KINDS } from '../engine/shapes.js';
import TextoEmLote from './TextoEmLote.jsx';

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
  const isMain = !!track.main;
  const next = isMain ? track.clips[index + 1] : nextAdjacent(track, clip);
  const tr = clip.transition;
  const maxD = Math.max(0.1, Math.min(clip.duration, next?.duration || clip.duration) * 0.5);
  const s = useStore.getState;
  const list = isMain ? TRANSITIONS : TRANSITIONS.filter((t) => OVERLAY_TRANSITIONS.has(t.id));
  return (
    <>
      <div className="insp-tabs"><button className="insp-tab active">Transição</button></div>
      <div className="insp-body">
        <Section title="Tipo">
          <div className="anim-grid">
            {list.map((t) => <button key={t.id} className={tr.id === t.id ? 'on' : ''} onClick={() => s().setTransition(clipId, t.id, tr.duration)}>{t.name}</button>)}
          </div>
          {!isMain && <div className="hint" style={{ marginTop: 8 }}>Transição entre clipes de uma faixa de cima: durante a mistura, o primeiro fica parado no último quadro e o segundo no primeiro.</div>}
          {!isMain && next && overlayTransDur(clip, next) === 0 && <div className="err-box" style={{ marginTop: 8, fontFamily: 'inherit' }}>Os clipes não estão mais encostados: a transição só volta a valer quando um começar logo depois do outro.</div>}
        </Section>
        <Section title="Duração">
          <Slider value={Math.min(tr.duration, maxD)} min={0.1} max={Number(maxD.toFixed(2))} step={0.05}
            onChange={(v) => editClip(clipId, (c) => { c.transition.duration = v; })} />
          <div className="hint">Efetiva: {transitionDuration(clip, next).toFixed(2)} s (no máximo metade do clipe mais curto).</div>
        </Section>
        <div style={{ display: 'flex', gap: 8 }}>
          {isMain && <button className="btn" onClick={() => { s().applyTransitionAll(tr.id, tr.duration); s().toastMsg('Transição aplicada em todas as junções'); }}>Aplicar a todas</button>}
          <button className="btn danger" onClick={() => s().setTransition(clipId, null)}><Trash2 size={14} /> Remover</button>
        </div>
      </div>
    </>
  );
}

// ---------- Edição em grupo ----------
// Com vários clipes do mesmo tipo selecionados, o painel mostra o principal e cada mudança vale para todos
// (store.updateGrupo: só o que foi mexido passa para os outros, com o valor final).
const GrupoCtx = createContext(null);
function useEdicao() {
  const g = useContext(GrupoCtx);
  const outros = g?.outros || null;
  return {
    grupo: g, outros,
    ed: (id, fn, opts) => editGrupo(id, outros, fn, opts),
    upd: (id, patch, opts) => useStore.getState().updateGrupo(id, outros, patch, opts),
  };
}

// ---------- Controle com ponto de modificação (◆) ----------
// Sem pontos, o controle muda o valor fixo do clipe. Com pontos, mexer no controle cria/atualiza
// o ponto no instante da agulha — e entre os pontos a mudança é suave.
function KfSlider({ clip, prop, label, min, max, step = 1, toUi = (v) => v, fromUi = (v) => v }) {
  const time = useStore((s) => s.time);
  const project = useStore((s) => s.project);
  const { grupo, outros, ed } = useEdicao();
  const justCreatedAt = useRef(null);
  const lt = time - clip.start;
  const inside = lt >= -1e-3 && lt <= clip.duration + 1e-3;
  const tl = Math.max(0, Math.min(clip.duration, lt));
  const on = hasKf(clip, prop);
  const at = on && hasKfAt(clip, prop, tl);
  const v = propAt(clip, prop, tl);
  // grupo: os outros recebem o mesmo valor; quem tem pontos neste controle tem os pontos deslocados junto
  const vals = grupo ? outros.map((oid) => findClip(project, oid)?.clip).filter(Boolean).map((c) => KF_PROPS[prop].get(c)) : [];
  const varios = vals.some((x) => Math.abs(x - KF_PROPS[prop].get(clip)) > 1e-6);
  const mudarGrupo = (x) => {
    const nv = fromUi(x), delta = nv - v;
    const lo = fromUi(min), hi = fromUi(max);
    ed(clip.id, (c) => {
      if (c.id === clip.id) setPropAt(c, prop, nv, tl);
      else if (hasKf(c, prop)) c.kf = { ...c.kf, [prop]: c.kf[prop].map((k) => ({ t: k.t, v: Math.max(lo, Math.min(hi, k.v + delta)) })) };
      else KF_PROPS[prop].set(c, nv);
    }, { porClipe: true });
  };
  const toggle = () => {
    if (!inside) { useStore.getState().toastMsg('Coloque a agulha sobre o clipe para marcar o ponto.'); return; }
    if (at && justCreatedAt.current !== null && Math.abs(justCreatedAt.current - tl) < 1 / 60) {
      justCreatedAt.current = null;
      return;
    }
    justCreatedAt.current = null;
    useStore.getState().updateClip(clip.id, (c) => {
      if (hasKfAt(c, prop, tl)) removeKfAt(c, prop, tl);
      else upsertKf(c, prop, tl, propAt(c, prop, tl));
    });
  };
  return (
    <div className="field">
      <label>
        {label}
        {varios && <span className="hint" title="Os clipes estão com valores diferentes; mexer aqui deixa todos com o mesmo"> (vários)</span>}
        {!grupo && <button className={`kf-btn ${at ? 'on' : on ? 'has' : ''}`} onClick={toggle}
          title={at ? 'Tirar o ponto de modificação deste momento' : on ? 'Marcar um ponto neste momento (este valor já muda ao longo do clipe)' : 'Marcar ponto de modificação neste momento'}>◆</button>}
      </label>
      <div><Slider value={toUi(v)} min={min} max={max} step={step} onChange={(x) => {
        if (grupo) { mudarGrupo(x); return; }
        if (on && !at) justCreatedAt.current = tl;
        editClip(clip.id, (c) => setPropAt(c, prop, fromUi(x), tl));
      }} /></div>
    </div>
  );
}

const pct = { toUi: (v) => Math.round(v * 1000) / 10, fromUi: (x) => x / 100 };

function clearKf(c, props) {
  if (!c.kf) return;
  for (const p of props) delete c.kf[p];
  if (!Object.keys(c.kf).length) delete c.kf;
}

// ---------- Abas de clipe ----------
function BasicTab({ clip, isMain }) {
  const { ed, upd, grupo } = useEdicao();
  const tf = clip.transform || {};
  const cr = clip.crop || { l: 0, t: 0, r: 0, b: 0 };
  const id = clip.id;
  const isMedia = clip.type === 'video' || clip.type === 'image';
  const bgMode = clip.bg ? clip.bg.type : 'project';
  return (
    <>
      <Section title="Transformar" right={
        <button className="btn small ghost" title="Redefinir" onClick={() => upd(id, (c) => { c.transform = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, flipH: false, flipV: false }; c.opacity = 1; clearKf(c, ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation', 'opacity']); }, { porClipe: true })}><RotateCcw size={13} /> Redefinir</button>
      }>
        {isMedia && (
          <Field label="Encaixe">
            <Seg value={clip.fit || 'contain'} onChange={(v) => upd(id, { fit: v })}
              options={[{ value: 'contain', label: 'Ajustar' }, { value: 'cover', label: 'Preencher' }]} />
          </Field>
        )}
        <KfSlider clip={clip} prop="scale" label="Escala" min={1} max={2000} toUi={(v) => Math.round(v * 100)} fromUi={(x) => x / 100} />
        <KfSlider clip={clip} prop="scaleX" label="Largura X" min={1} max={2000} toUi={(v) => Math.round(v * 100)} fromUi={(x) => x / 100} />
        <KfSlider clip={clip} prop="scaleY" label="Altura Y" min={1} max={2000} toUi={(v) => Math.round(v * 100)} fromUi={(x) => x / 100} />
        <KfSlider clip={clip} prop="x" label="Posição X" min={-300} max={300} step={0.1} {...pct} />
        <KfSlider clip={clip} prop="y" label="Posição Y" min={-300} max={300} step={0.1} {...pct} />
        <KfSlider clip={clip} prop="rotation" label="Rotação" min={-180} max={180} toUi={(v) => Math.round(v)} />
        <KfSlider clip={clip} prop="opacity" label="Opacidade" min={0} max={100} toUi={(v) => Math.round(v * 100)} fromUi={(x) => x / 100} />
        {!grupo && <div className="hint" style={{ marginBottom: 8 }}>◆ marca um ponto de modificação no momento da agulha (ou use a tecla K). Com dois pontos ou mais, o valor muda suavemente entre eles.</div>}
        {(isMedia || clip.type === 'shape') && (
          <Field label="Espelhar">
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`btn small ${tf.flipH ? 'primary' : ''}`} onClick={() => upd(id, (c) => { c.transform.flipH = !c.transform.flipH; })}><FlipHorizontal2 size={14} /> Horizontal</button>
              <button className={`btn small ${tf.flipV ? 'primary' : ''}`} onClick={() => upd(id, (c) => { c.transform.flipV = !c.transform.flipV; })}><FlipVertical2 size={14} /> Vertical</button>
            </div>
          </Field>
        )}
      </Section>
      {isMedia && (
        <Section title="Recortar" right={<button className="btn small ghost" onClick={() => upd(id, { crop: { l: 0, t: 0, r: 0, b: 0 } })}><RotateCcw size={13} /></button>}>
          {[['l', 'Esquerda'], ['r', 'Direita'], ['t', 'Topo'], ['b', 'Base']].map(([k, n]) => (
            <Field key={k} label={n}><Slider value={Math.round((cr[k] || 0) * 100)} min={0} max={45} onChange={(v) => ed(id, (c) => { c.crop = { ...(c.crop || {}), [k]: v / 100 }; })} /></Field>
          ))}
        </Section>
      )}
      {isMedia && <ChromaSection clip={clip} />}
      {isMedia && isMain && (
        <Section title="Fundo">
          <Field label="Tipo">
            <Seg value={bgMode} onChange={(v) => upd(id, (c) => {
              const pb = useStore.getState().project.background;
              c.bg = v === 'project' ? null : { type: v, color: c.bg?.color || pb?.color || '#000000', blur: c.bg?.blur ?? pb?.blur ?? 0.03 };
            })} options={[{ value: 'project', label: 'Padrão' }, { value: 'color', label: 'Cor' }, { value: 'blur', label: 'Desfoque' }]} />
          </Field>
          {clip.bg?.type === 'color' && <Field label="Cor"><ColorInput value={clip.bg.color} onChange={(v) => ed(id, (c) => { c.bg.color = v; })} /></Field>}
          {clip.bg?.type === 'blur' && <Field label="Desfoque"><Slider value={Math.round((clip.bg.blur ?? 0.03) * 1000)} min={5} max={80} onChange={(v) => ed(id, (c) => { c.bg.blur = v / 1000; })} /></Field>}
          <FundoEscondido clip={clip} />
        </Section>
      )}
    </>
  );
}

// O fundo só aparece onde o vídeo não cobre a tela; quando cobre tudo, avisa (senão parece que não funciona).
function FundoEscondido({ clip }) {
  const m = useStore((s) => s.project.media.find((x) => x.id === clip.mediaId));
  const W = useStore((s) => s.project.width), H = useStore((s) => s.project.height);
  if (!m?.width || !m?.height || Object.keys(clip.kf || {}).length) return null;
  const tf = clip.transform || {}, cr = clip.crop || {};
  const anima = (a) => a && a.id && a.id !== 'none';
  if ((tf.scale ?? 1) * Math.min(tf.scaleX ?? 1, tf.scaleY ?? 1) < 1 || tf.x || tf.y || tf.rotation || anima(clip.animIn) || anima(clip.animOut) || anima(clip.animLoop)) return null;
  const a = (m.width * (1 - (cr.l || 0) - (cr.r || 0))) / (m.height * (1 - (cr.t || 0) - (cr.b || 0)));
  const cobre = clip.fit === 'cover' || Math.abs(a - W / H) / (W / H) < 0.01;
  if (!cobre) return null;
  return (
    <div className="hint" style={{ marginTop: 4 }}>
      Agora {clip.type === 'image' ? 'a imagem' : 'o vídeo'} cobre a tela inteira, então o fundo não aparece. Ele aparece nas sobras: mude a proporção do projeto (ex.: 9:16 com vídeo deitado), diminua a escala ou use “Ajustar” no encaixe.
    </div>
  );
}

// Fundo colorido (verde, azul…) tem reflexo para tirar; branco/cinza/preto não.
const isColorida = (hex) => chromaParams({ color: hex }).modo === 'uv';

// Chroma key: remove o fundo verde/azul (ou de outra cor) do vídeo ou da foto.
function ChromaSection({ clip }) {
  const { ed, upd, outros } = useEdicao();
  const id = clip.id;
  const ch = { ...DEFAULT_CHROMA, ...(clip.chroma || {}) };
  const picking = useStore((s) => s.pickColor?.clipId === id);
  const set = (fn) => ed(id, (c) => { c.chroma = { ...DEFAULT_CHROMA, ...(c.chroma || {}) }; fn(c.chroma); });
  return (
    <Section title="Remover fundo (chroma key)" right={<Toggle on={ch.on} onChange={(v) => upd(id, (c) => { c.chroma = { ...DEFAULT_CHROMA, ...(c.chroma || {}), on: v }; })} />}>
      {!ch.on && <div className="hint">Para fundo verde, azul ou de uma cor só (como o branco de foto de produto): a cor do fundo fica transparente e aparece o que estiver embaixo.</div>}
      {ch.on && <>
        <Field label="Cor do fundo">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <ColorInput value={ch.color} swatches={false} onChange={(v) => set((c) => { c.color = v; })} />
            <button className={`btn small ${picking ? 'primary' : ''}`} title="Clique e depois clique no fundo do vídeo, no reprodutor"
              onClick={() => useStore.setState({ pickColor: picking ? null : { clipId: id, outros } })}><Pipette size={13} /> {picking ? 'Clique no vídeo…' : 'Escolher no vídeo'}</button>
          </div>
        </Field>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button className="btn small" onClick={() => set((c) => { c.color = '#00d639'; })}>Verde</button>
          <button className="btn small" onClick={() => set((c) => { c.color = '#1f5bff'; })}>Azul</button>
          <button className="btn small" onClick={() => set((c) => { c.color = '#ffffff'; })}>Branco</button>
        </div>
        <Field label="Intensidade"><Slider value={ch.similarity} min={0} max={100} onChange={(v) => set((c) => { c.similarity = v; })} /></Field>
        <Field label="Bordas suaves"><Slider value={ch.smooth} min={0} max={100} onChange={(v) => set((c) => { c.smooth = v; })} /></Field>
        {clip.type === 'image' && (
          <Field label="Só o fundo das bordas" title="Some só o fundo que encosta nas bordas da foto; a mesma cor dentro do objeto (uma etiqueta branca, um brilho) fica">
            <Toggle on={ch.bordas !== false} onChange={(v) => set((c) => { c.bordas = v; })} />
          </Field>
        )}
        {isColorida(ch.color) && <Field label="Tirar reflexo" title="Tira o tom verde/azul que a luz do fundo deixa na pessoa"><Toggle on={!!ch.spill} onChange={(v) => set((c) => { c.spill = v; })} /></Field>}
        <div className="hint">Aumente a intensidade até o fundo sumir todo; se o objeto ou a pessoa começar a ficar transparente, diminua. Com fundo branco, cinza ou preto o claro/escuro também conta, então as cores do objeto não somem junto. Coloque um vídeo ou foto na faixa de baixo para aparecer no lugar do fundo.</div>
      </>}
    </Section>
  );
}

function AudioTab({ clip }) {
  const { ed, upd, grupo } = useEdicao();
  const id = clip.id;
  const s = useStore.getState;
  const sp = clip.speed || 1;
  const fmtP = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60); return `${String(m).padStart(2, '0')}:${(t - m * 60).toFixed(2).padStart(5, '0')}`; };
  return (
    <>
      {clip.type === 'audio' && !grupo && (
        <Section title="Trecho usado">
          <div className="kv" style={{ marginBottom: 10 }}>
            <span>Início no arquivo</span><span>{fmtP(clip.in || 0)}</span>
            <span>Fim no arquivo</span><span>{fmtP((clip.in || 0) + clip.duration * sp)}</span>
            <span>Duração</span><span><b>{fmtP(clip.duration)}</b></span>
          </div>
          <button className="btn" onClick={() => { s().select({ type: 'clip', id }); s().setTime(clip.start); s().play(); }}>▶ Ouvir este trecho</button>
          <div className="hint" style={{ marginTop: 8 }}>Puxe as bordas do bloco na linha do tempo para escolher o trecho; com o áudio selecionado, o play toca do início ao fim dele.</div>
        </Section>
      )}
      <Section title="Som">
        <KfSlider clip={clip} prop="volume" label="Volume" min={0} max={200} toUi={(v) => Math.round(v * 100)} fromUi={(x) => x / 100} />
        <Field label="Entrada suave"><Slider value={clip.fadeIn || 0} min={0} max={Math.min(10, Number(clip.duration.toFixed(1)))} step={0.1} onChange={(v) => ed(id, (c) => { c.fadeIn = v; })} /></Field>
        <Field label="Saída suave"><Slider value={clip.fadeOut || 0} min={0} max={Math.min(10, Number(clip.duration.toFixed(1)))} step={0.1} onChange={(v) => ed(id, (c) => { c.fadeOut = v; })} /></Field>
        <Field label="Sem som"><Toggle on={!!clip.muted} onChange={(v) => upd(id, { muted: v })} /></Field>
      </Section>
      <VozSection clip={clip} />
      <AudioFxSection clip={clip} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {clip.type === 'video' && <button className="btn" onClick={() => s().extractAudio(grupo ? grupo.ids : id)}><AudioLines size={14} /> Separar áudio{grupo ? ` dos ${grupo.ids.length}` : ''}</button>}
        {!grupo && <button className="btn" onClick={() => s().openSilencios(id)} title="Tira as pausas e silêncios automaticamente"><Scissors size={14} /> Cortar silêncios</button>}
      </div>
    </>
  );
}

// Limpeza e realce da fala, em tempo real (a mesma cadeia vai para a exportação).
function VozSection({ clip }) {
  const { ed, upd } = useEdicao();
  const id = clip.id;
  const v = vozDoClipe(clip);
  const original = useStore((s) => s.vozOriginal);
  const status = useStore((s) => s.meta[clip.mediaId]?.vozStatus);
  const set = (patch) => ed(id, (c) => {
    c.voz = { ...vozDoClipe(c), ...patch };
    if (c.audioFx?.denoise) c.audioFx = { ...c.audioFx, denoise: false };   // o "reduzir ruído" antigo passa a ser este
  });
  const preset = PRESETS_VOZ.find((p) => Object.entries(p.v).every(([k, x]) => v[k] === x));
  const ativo = temVoz(clip);
  return (
    <Section title="Voz — limpar e realçar" right={
      <button className="btn small ghost" title="Desligar tudo" onClick={() => upd(id, (c) => { c.voz = { ...VOZ_PADRAO }; if (c.audioFx?.denoise) c.audioFx = { ...c.audioFx, denoise: false }; })}><RotateCcw size={13} /></button>
    }>
      <div className="anim-grid" style={{ marginBottom: 10 }}>
        {PRESETS_VOZ.map((p) => (
          <button key={p.id} className={preset?.id === p.id ? 'on' : ''} title="Ponto de partida; ajuste nos controles abaixo"
            onClick={() => upd(id, (c) => { c.voz = { ...VOZ_PADRAO, ...p.v }; if (c.audioFx?.denoise) c.audioFx = { ...c.audioFx, denoise: false }; })}>{p.name}</button>
        ))}
      </div>
      <Field label="Reduzir ruído" title="Tira o ruído de fundo (ventilador, carro, conversa distante, chiado). Funciona na prévia, em tempo real.">
        <Slider value={v.ruido} min={0} max={100} onChange={(x) => set({ ruido: x })} />
      </Field>
      <Field label="Realçar a voz" title="Deixa a fala mais alta e por igual (normaliza o volume e comprime os picos), sem estourar.">
        <Slider value={v.realce} min={0} max={100} onChange={(x) => set({ realce: x })} />
      </Field>
      <Field label="Clareza" title="Corta o zumbido grave, tira o som abafado e dá presença e brilho à voz.">
        <Slider value={v.clareza} min={0} max={100} onChange={(x) => set({ clareza: x })} />
      </Field>
      <div className="hint" style={{ margin: '8px 0 6px' }}>Ambiente</div>
      <div className="anim-grid">
        {AMBIENTES.map((a) => <button key={a.id} className={v.ambiente === a.id ? 'on' : ''} onClick={() => set({ ambiente: a.id })}>{a.name}</button>)}
      </div>
      {v.ambiente !== 'none' && <Field label="Quantidade"><Slider value={v.ambMix} min={0} max={100} onChange={(x) => set({ ambMix: x })} /></Field>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className={`btn small ${original ? 'primary' : ''}`} disabled={!ativo} title="Desliga a limpeza só na prévia, para comparar antes e depois"
          onClick={() => useStore.setState((st) => ({ vozOriginal: !st.vozOriginal }))}>
          <Headphones size={13} /> {original ? 'Ouvindo o original — voltar' : 'Comparar com o original'}
        </button>
        {status === 'analisando' && <span className="hint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Loader2 size={12} className="spin" /> analisando o ruído…</span>}
      </div>
      <div className="hint" style={{ marginTop: 6 }}>Em tempo real: dê play e ajuste ouvindo. O que você ouve aqui é o que sai na exportação.</div>
    </Section>
  );
}

function AudioFxSection({ clip }) {
  const { ed, upd } = useEdicao();
  const id = clip.id;
  const fx = { ...DEFAULT_AUDIO_FX, ...(clip.audioFx || {}) };
  const set = (fn) => ed(id, (c) => { c.audioFx = { ...DEFAULT_AUDIO_FX, ...(c.audioFx || {}) }; fn(c.audioFx); });
  const pick = (fid) => upd(id, (c) => { c.audioFx = { ...DEFAULT_AUDIO_FX, ...(c.audioFx || {}), id: fid }; });
  return (
    <>
      <Section title="Efeitos de voz" right={<button className="btn small ghost" title="Redefinir" onClick={() => upd(id, (c) => { c.audioFx = null; })}><RotateCcw size={13} /></button>}>
        <div className="anim-grid">
          {AUDIO_FX.map((a) => <button key={a.id} className={fx.id === a.id ? 'on' : ''} onClick={() => pick(a.id)}>{a.name}</button>)}
        </div>
        {fx.id !== 'none' && <Field label="Intensidade"><Slider value={fx.mix} min={0} max={100} onChange={(v) => set((a) => { a.mix = v; })} /></Field>}
        <div className="hint" style={{ marginTop: 6 }}>Dê play para ouvir. Na exportação, a voz fina/grossa usa um processamento de qualidade maior que o da prévia.</div>
      </Section>
      <Section title="Equalizador">
        <Field label="Graves"><Slider value={fx.bass} min={-12} max={12} step={0.5} onChange={(v) => set((a) => { a.bass = v; })} /></Field>
        <Field label="Agudos"><Slider value={fx.treble} min={-12} max={12} step={0.5} onChange={(v) => set((a) => { a.treble = v; })} /></Field>
      </Section>
    </>
  );
}

function SpeedTab({ clip }) {
  const { ed } = useEdicao();
  const id = clip.id;
  const sp = clip.speed || 1;
  const setSpeed = (v) => ed(id, (c, p) => {
    const m = p.media.find((x) => x.id === c.mediaId);
    const old = c.speed || 1;
    const src = c.duration * old;
    c.speed = v;
    c.duration = src / v;
    if (c.kf) c.kf = scaleKf(c.kf, old / v); // os pontos acompanham o conteúdo
    if (m && m.duration) c.duration = Math.min(c.duration, (m.duration - (c.in || 0)) / v);
  }, { porClipe: true });
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
      <ReverseRow clip={clip} />
    </Section>
  );
}

function ReverseRow({ clip }) {
  const { outros } = useEdicao();
  const rev = useStore((s) => s.meta[clip.mediaId]?.rev?.[clip.type === 'audio' ? 'audio' : 'video']);
  const working = clip.reverse && rev?.status === 'working';
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
      <Field label="Reverter" title="Toca o clipe de trás para frente (imagem e som)">
        <Toggle on={!!clip.reverse} onChange={() => useStore.getState().toggleReverse(clip.id, outros || [])} />
      </Field>
      <div className="hint">
        {working ? `Preparando a cópia invertida… ${Math.round((rev.progress || 0) * 100)}%`
          : clip.reverse ? 'Tocando de trás para frente (imagem e som).' : 'Toca o clipe de trás para frente. Na primeira vez, o app prepara uma cópia invertida (fica guardada).'}
      </div>
    </div>
  );
}

function AnimTab({ clip }) {
  const { ed, upd } = useEdicao();
  const id = clip.id;
  const ai = clip.animIn || { id: 'none', duration: 0.5 };
  const ao = clip.animOut || { id: 'none', duration: 0.5 };
  const al = clip.animLoop || { id: 'none' };
  const maxD = Math.max(0.1, Math.min(5, Number(clip.duration.toFixed(1))));
  return (
    <>
      <Section title="Entrada">
        <div className="anim-grid">
          {ANIMS_IN.map((a) => <button key={a.id} className={ai.id === a.id ? 'on' : ''} onClick={() => upd(id, (c) => { c.animIn = { id: a.id, duration: ai.duration || 0.5 }; })}>{a.name}</button>)}
        </div>
        {ai.id !== 'none' && <Field label="Duração"><Slider value={Math.min(ai.duration, maxD)} min={0.1} max={maxD} step={0.1} onChange={(v) => ed(id, (c) => { c.animIn.duration = v; })} /></Field>}
      </Section>
      <Section title="Saída">
        <div className="anim-grid">
          {ANIMS_OUT.map((a) => <button key={a.id} className={ao.id === a.id ? 'on' : ''} onClick={() => upd(id, (c) => { c.animOut = { id: a.id, duration: ao.duration || 0.5 }; })}>{a.name}</button>)}
        </div>
        {ao.id !== 'none' && <Field label="Duração"><Slider value={Math.min(ao.duration, maxD)} min={0.1} max={maxD} step={0.1} onChange={(v) => ed(id, (c) => { c.animOut.duration = v; })} /></Field>}
      </Section>
      <Section title="Contínua (o clipe todo)">
        <div className="anim-grid">
          {ANIMS_LOOP.map((a) => <button key={a.id} className={al.id === a.id ? 'on' : ''} onClick={() => upd(id, (c) => { c.animLoop = a.id === 'none' ? null : { id: a.id, speed: al.speed ?? 1, amount: al.amount ?? 100 }; })}>{a.name}</button>)}
        </div>
        {al.id !== 'none' && <>
          {al.id !== 'kenburns' && <Field label="Velocidade"><Slider value={al.speed ?? 1} min={0.25} max={3} step={0.05} onChange={(v) => ed(id, (c) => { c.animLoop.speed = v; })} /></Field>}
          {al.id !== 'spin' && <Field label="Intensidade"><Slider value={al.amount ?? 100} min={10} max={200} onChange={(v) => ed(id, (c) => { c.animLoop.amount = v; })} /></Field>}
        </>}
        <div className="hint">Fica junto com a entrada e a saída: dá para entrar quicando e continuar pulsando, por exemplo.</div>
      </Section>
    </>
  );
}

function AdjustTab({ clip }) {
  const { upd, grupo } = useEdicao();
  const id = clip.id;
  const a = clip.adjust || {};
  return (
    <Section title="Ajustes de cor" right={<button className="btn small ghost" onClick={() => upd(id, (c) => { c.adjust = {}; clearKf(c, ADJUST_FIELDS.map((f) => `adjust.${f.key}`)); }, { porClipe: true })}><RotateCcw size={13} /> Redefinir</button>}>
      {ADJUST_FIELDS.map((f) => (
        <KfSlider key={f.key} clip={clip} prop={`adjust.${f.key}`} label={f.name} min={f.min} max={f.max} toUi={(v) => Math.round(v)} />
      ))}
      {!grupo && <div className="hint">◆ marca um ponto neste momento: dá para clarear, escurecer ou mudar a cor aos poucos ao longo do clipe.</div>}
    </Section>
  );
}

function FilterTab({ clip }) {
  const id = clip.id;
  const f = clip.filter || { id: 'none', intensity: 100 };
  useClearFxPreviewOnUnmount();
  return (
    <>
      <Section title="Filtro">
        <div className="grid small">
          {FILTERS.map((x) => (
            <div key={x.id} className={`fx-card ${f.id === x.id ? 'active' : ''}`} {...fxHover('filter', x.id)}
              onClick={() => { clearFxPreview(); useStore.getState().applyFilter(id, x.id); }}>
              <div className="sw"><FxSample ops={x.ops} /></div>
              <div className="label">{x.name}</div>
            </div>
          ))}
        </div>
      </Section>
      {f.id !== 'none' && <KfSlider clip={clip} prop="filter" label="Intensidade" min={0} max={100} toUi={(v) => Math.round(v)} />}
    </>
  );
}

function TextTab({ clip }) {
  const { ed, upd, grupo } = useEdicao();
  const id = clip.id;
  const st = clip.text;
  const ref = useRef(null);
  const font = FONTS.find((f) => f.family === st.font);
  useEffect(() => {
    const h = () => { ref.current?.focus(); ref.current?.select(); };
    window.addEventListener('focus-text-editor', h);
    return () => window.removeEventListener('focus-text-editor', h);
  }, []);
  const set = (fn) => ed(id, (c) => fn(c.text));
  if (clip.sticker) {
    return (
      <Section title="Sticker">
        {!grupo && <Field label="Emoji"><input type="text" value={st.content} style={{ width: 80, fontSize: 20, fontFamily: 'Segoe UI Emoji' }} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => { const v = e.target.value; set((t) => { t.content = v; }); }} /></Field>}
        <Field label="Tamanho"><Slider value={st.size} min={20} max={800} onChange={(v) => set((t) => { t.size = v; })} /></Field>
        <Field label="Sombra"><Toggle on={!!st.shadow?.enabled} onChange={(v) => set((t) => { t.shadow = { ...t.shadow, enabled: v }; })} /></Field>
      </Section>
    );
  }
  return (
    <>
      {grupo ? <div className="hint" style={{ marginBottom: 10 }}>Cada um continua com o próprio texto; o resto (fonte, cor, contorno, fundo…) muda em todos.</div> : (
        <Section title="Texto">
          <textarea ref={ref} rows={3} value={st.content} onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => { const v = e.target.value; set((t) => { t.content = v; }); }} />
        </Section>
      )}
      <Section title="Fonte">
        <Field label="Família">
          <select className="font-select" value={st.font} style={{ fontFamily: `"${st.font}"` }}
            onChange={(e) => { const fam = e.target.value; const f = FONTS.find((x) => x.family === fam); upd(id, (c) => { c.text.font = fam; if (!f.weights.includes(c.text.weight)) c.text.weight = f.weights[f.weights.length - 1]; }); }}>
            {FONTS.map((f) => <option key={f.family} value={f.family} style={{ fontFamily: `"${f.family}"` }}>{f.family}</option>)}
          </select>
        </Field>
        <Field label="Peso">
          <Seg value={st.weight} onChange={(v) => upd(id, (c) => { c.text.weight = v; })}
            options={(font?.weights || [400, 700]).map((w) => ({ value: w, label: w === 400 ? 'Normal' : w === 700 ? 'Negrito' : 'Black' }))} />
        </Field>
        <Field label="Estilo">
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={`icon-btn ${st.italic ? 'active' : ''}`} title="Itálico" onClick={() => upd(id, (c) => { c.text.italic = !c.text.italic; })}><Italic size={15} /></button>
            <button className={`icon-btn ${st.uppercase ? 'active' : ''}`} title="Maiúsculas" onClick={() => upd(id, (c) => { c.text.uppercase = !c.text.uppercase; })}><CaseUpper size={15} /></button>
            <span style={{ width: 8 }} />
            {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([a, I]) => (
              <button key={a} className={`icon-btn ${st.align === a ? 'active' : ''}`} onClick={() => upd(id, (c) => { c.text.align = a; })}><I size={15} /></button>
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
              onClick={() => upd(id, (c) => { c.text = { ...defaultsFor(p.style), content: c.text.content }; })}>
              <span style={{ ...presetCss(p.style), ...(p.style.background?.enabled ? { background: p.style.background.color, padding: '1px 5px', borderRadius: 3 } : {}) }}>Aa</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Contorno" right={<Toggle on={!!st.stroke?.enabled} onChange={(v) => upd(id, (c) => { c.text.stroke = { ...c.text.stroke, enabled: v }; })} />}>
        {st.stroke?.enabled && <>
          <Field label="Cor"><ColorInput value={st.stroke.color} onChange={(v) => set((t) => { t.stroke.color = v; })} /></Field>
          <Field label="Espessura"><Slider value={st.stroke.width} min={1} max={30} onChange={(v) => set((t) => { t.stroke.width = v; })} /></Field>
        </>}
      </Section>
      <Section title="Fundo" right={<Toggle on={!!st.background?.enabled} onChange={(v) => upd(id, (c) => { c.text.background = { ...c.text.background, enabled: v }; })} />}>
        {st.background?.enabled && <>
          <Field label="Cor"><ColorInput value={st.background.color} onChange={(v) => set((t) => { t.background.color = v; })} /></Field>
          <Field label="Opacidade"><Slider value={Math.round((st.background.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => set((t) => { t.background.opacity = v / 100; })} /></Field>
          <Field label="Margem"><Slider value={st.background.padding} min={0} max={100} onChange={(v) => set((t) => { t.background.padding = v; })} /></Field>
          <Field label="Cantos"><Slider value={st.background.radius} min={0} max={100} onChange={(v) => set((t) => { t.background.radius = v; })} /></Field>
        </>}
      </Section>
      <Section title="Sombra" right={<Toggle on={!!st.shadow?.enabled} onChange={(v) => upd(id, (c) => { c.text.shadow = { ...c.text.shadow, enabled: v }; })} />}>
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

function ShapeTab({ clip }) {
  const { ed, upd } = useEdicao();
  const id = clip.id;
  const sh = clip.shape;
  const set = (fn) => ed(id, (c) => fn(c.shape));
  const big = Math.max(useStore.getState().project.width, useStore.getState().project.height);
  return (
    <>
      <Section title="Forma">
        <div className="grid small">
          {SHAPE_KINDS.map((k) => (
            <div key={k.id} className={`shape-card ${sh.kind === k.id ? 'active' : ''}`} style={sh.kind === k.id ? { borderColor: 'var(--accent)' } : undefined}
              title={k.name} onClick={() => upd(id, (c) => { c.shape.kind = k.id; })}>
              <ShapeThumb shape={{ kind: k.id, w: 100, h: k.id === 'arrow' ? 60 : 100, radius: 18, fill: '#d9d9de' }} size={56} />
            </div>
          ))}
        </div>
      </Section>
      <Section title="Tamanho">
        <Field label="Largura"><Slider value={Math.round(sh.w)} min={4} max={big * 2} onChange={(v) => set((s) => { s.w = v; })} /></Field>
        <Field label="Altura"><Slider value={Math.round(sh.h)} min={4} max={big * 2} onChange={(v) => set((s) => { s.h = v; })} /></Field>
        {(sh.kind === 'roundrect' || sh.kind === 'speech') && (
          <Field label="Cantos"><Slider value={sh.radius || 0} min={0} max={400} onChange={(v) => set((s) => { s.radius = v; })} /></Field>
        )}
      </Section>
      <Section title="Preenchimento" right={<Toggle on={sh.fillOn !== false} onChange={(v) => upd(id, (c) => { c.shape.fillOn = v; })} />}>
        {sh.fillOn !== false && <Field label="Cor"><ColorInput value={sh.fill} onChange={(v) => set((s) => { s.fill = v; })} /></Field>}
      </Section>
      <Section title="Contorno" right={<Toggle on={!!sh.stroke?.enabled} onChange={(v) => upd(id, (c) => { c.shape.stroke = { ...c.shape.stroke, enabled: v }; })} />}>
        {sh.stroke?.enabled && <>
          <Field label="Cor"><ColorInput value={sh.stroke.color} onChange={(v) => set((s) => { s.stroke.color = v; })} /></Field>
          <Field label="Espessura"><Slider value={sh.stroke.width} min={1} max={120} onChange={(v) => set((s) => { s.stroke.width = v; })} /></Field>
        </>}
      </Section>
      <Section title="Sombra" right={<Toggle on={!!sh.shadow?.enabled} onChange={(v) => upd(id, (c) => { c.shape.shadow = { ...c.shape.shadow, enabled: v }; })} />}>
        {sh.shadow?.enabled && <>
          <Field label="Cor"><ColorInput value={sh.shadow.color} onChange={(v) => set((s) => { s.shadow.color = v; })} /></Field>
          <Field label="Opacidade"><Slider value={Math.round((sh.shadow.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => set((s) => { s.shadow.opacity = v / 100; })} /></Field>
          <Field label="Desfoque"><Slider value={sh.shadow.blur} min={0} max={120} onChange={(v) => set((s) => { s.shadow.blur = v; })} /></Field>
          <Field label="Distância Y"><Slider value={sh.shadow.y} min={-80} max={80} onChange={(v) => set((s) => { s.shadow.y = v; })} /></Field>
        </>}
      </Section>
    </>
  );
}

function defaultsFor(style) {
  return { ...structuredClone(DEFAULT_TEXT), ...structuredClone(style) };
}

function EffectTab({ clip }) {
  const { ed, upd } = useEdicao();
  const id = clip.id;
  const fx = clip.effect;
  const isFilter = fx.kind === 'filter';
  const cur = isFilter ? null : EFFECTS.find((e) => e.id === fx.id);
  const list = isFilter ? FILTERS.filter((f) => f.id !== 'none') : EFFECTS.filter((e) => e.cat === (cur?.cat || 'basic'));
  useClearFxPreviewOnUnmount();
  return (
    <>
      <Section title={isFilter ? 'Filtro' : `Efeito · ${FX_CATS.find((c) => c.id === cur?.cat)?.name || ''}`}>
        <div className="grid small">
          {list.map((x) => (
            <div key={x.id} className={`fx-card ${fx.id === x.id ? 'active' : ''}`} {...fxHover(isFilter ? 'filter' : 'effect', x.id)}
              onClick={() => { clearFxPreview(); upd(id, (c) => { c.effect.id = x.id; }); }}>
              <div className="sw">{isFilter ? <FxSample ops={x.ops} /> : <EffectThumb id={x.id} />}</div>
              <div className="label">{x.name}</div>
            </div>
          ))}
        </div>
        {!isFilter && <div className="hint" style={{ marginTop: 8 }}>Outras categorias ficam na aba Efeitos, à esquerda.</div>}
      </Section>
      <Field label="Intensidade"><Slider value={fx.intensity ?? 100} min={0} max={100} onChange={(v) => ed(id, (c) => { c.effect.intensity = v; })} /></Field>
      {!isFilter && <AreaSection clip={clip} />}
      <div className="hint" style={{ marginTop: 8 }}>Vale para todas as faixas abaixo, de {fmtTime(clip.start, 30, true)} a {fmtTime(clip.start + clip.duration, 30, true)}.</div>
    </>
  );
}

// Onde o efeito vale: a tela inteira ou só uma área (arrastada e redimensionada no reprodutor, como uma imagem).
function AreaSection({ clip }) {
  const { ed, upd } = useEdicao();
  const id = clip.id;
  const a = { ...AREA_PADRAO, ...(clip.area || {}), on: !!clip.area?.on };
  const set = (fn) => ed(id, (c) => { c.area = { ...AREA_PADRAO, ...(c.area || {}) }; fn(c.area); });
  return (
    <Section title="Onde aplicar">
      <Field label="Aplicar em">
        <Seg value={a.on ? 'area' : 'tudo'} onChange={(v) => upd(id, (c) => { c.area = { ...AREA_PADRAO, ...(c.area || {}), on: v === 'area' }; })}
          options={[{ value: 'tudo', label: 'Tela inteira' }, { value: 'area', label: 'Só uma área' }]} />
      </Field>
      {a.on && <>
        <Field label="Forma">
          <Seg value={a.forma} onChange={(v) => set((x) => { x.forma = v; })} options={[{ value: 'ellipse', label: 'Oval' }, { value: 'rect', label: 'Retângulo' }]} />
        </Field>
        <Field label="Largura"><Slider value={Math.round(a.w * 100)} min={2} max={200} onChange={(v) => set((x) => { x.w = v / 100; })} /></Field>
        <Field label="Altura"><Slider value={Math.round(a.h * 100)} min={2} max={200} onChange={(v) => set((x) => { x.h = v / 100; })} /></Field>
        <Field label="Bordas suaves"><Slider value={a.suave} min={0} max={100} onChange={(v) => set((x) => { x.suave = v; })} /></Field>
        <Field label="Inverter" title="O efeito vale em tudo, MENOS na área"><Toggle on={!!a.inverter} onChange={(v) => set((x) => { x.inverter = v; })} /></Field>
        <div className="hint">Arraste a área no reprodutor para pôr no lugar certo (ex.: no rosto) e puxe os cantos para mudar o tamanho. O efeito é calculado só dentro dela — uma torção fica centrada na área.</div>
      </>}
    </Section>
  );
}

const TYPE_NAME = { video: 'Vídeo', image: 'Foto', audio: 'Áudio', text: 'Texto', effect: 'Efeito', shape: 'Forma' };

function ClipPanel({ id, grupo = null }) {
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
  else if (clip.type === 'shape') tabs = [{ id: 'shape', name: 'Forma' }, { id: 'anim', name: 'Animação' }, { id: 'basic', name: 'Posição' }];
  else if (clip.type === 'audio') tabs = [{ id: 'audio', name: 'Áudio' }, { id: 'speed', name: 'Velocidade' }];
  else if (clip.type === 'effect') tabs = [{ id: 'effect', name: clip.effect.kind === 'filter' ? 'Filtro' : 'Efeito' }];
  const cur = tabs.find((t) => t.id === tab) ? tab : tabs[0].id;
  const ctx = grupo ? { ...grupo, outros: grupo.ids.filter((x) => x !== id) } : null;
  return (
    <GrupoCtx.Provider value={ctx}>
      <Tabs tabs={tabs} value={cur} onChange={setTab} />
      <div className="insp-body">
        {grupo ? <GrupoBanner grupo={grupo} clip={clip} /> : (
          <div className="hint" style={{ marginBottom: 12 }}>
            {TYPE_NAME[clip.type]}{media ? ` · ${media.name}` : ''} · {fmtTime(clip.duration, 30, true)}{track.main ? ' · faixa principal' : ''}
          </div>
        )}
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
        {cur === 'shape' && <ShapeTab clip={clip} />}
      </div>
    </GrupoCtx.Provider>
  );
}

// Aviso no topo do painel quando vários clipes estão sendo editados juntos, com as ações da seleção.
function GrupoBanner({ grupo, clip }) {
  const s = useStore.getState;
  const [um, varios] = NOME_GRUPO[grupo.tipo] || ['clipe', 'clipes'];
  return (
    <div className="grupo-box">
      <div className="grupo-tit"><Layers size={14} /> Editando {grupo.ids.length} {varios} juntos</div>
      <div className="hint">
        O que você mudar aqui vale para todos{grupo.resto ? ` (os outros ${grupo.resto} itens da seleção ficam como estão)` : ''}.
        Os valores mostrados são os do {um} em {fmtTime(clip.start, 30, true)}; cada um continua com o próprio trecho{grupo.tipo === 'text' ? ' e o próprio texto' : ''}.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        <button className="btn small" onClick={() => s().duplicateSelection()}>Duplicar</button>
        <button className="btn small" onClick={() => s().copySelection()}>Copiar</button>
        <button className="btn small danger" onClick={() => s().deleteSelection()}><Trash2 size={13} /> Excluir</button>
        {grupo.resto > 0 && <button className="btn small ghost" onClick={() => useStore.setState((st) => ({ selection: { ...st.selection, grupo: null } }))}>Ver a seleção toda</button>}
      </div>
    </div>
  );
}

// ---------- Vários clipes selecionados ----------
function MultiPanel({ ids }) {
  const project = useStore((s) => s.project);
  const s = useStore.getState;
  const clips = ids.map((id) => findClip(project, id)?.clip).filter(Boolean);
  const count = (pred) => clips.filter(pred).length;
  const sound = clips.filter((c) => c.type === 'video' || c.type === 'audio');
  const visual = clips.filter((c) => c.type !== 'audio' && c.type !== 'effect');
  const allMuted = sound.length && sound.every((c) => c.muted);
  const setMuted = (v) => s().commit((p) => { for (const id of ids) { const f = findClip(p, id); if (f && (f.clip.type === 'video' || f.clip.type === 'audio')) f.clip.muted = v; } });
  return (
    <>
      <div className="insp-tabs"><button className="insp-tab active">Seleção</button></div>
      <div className="insp-body">
        <Section title={`${clips.length} clipes selecionados`}>
          <div className="kv" style={{ marginBottom: 12 }}>
            {count((c) => c.type === 'video') > 0 && <><span>Vídeos</span><span>{count((c) => c.type === 'video')}</span></>}
            {count((c) => c.type === 'image') > 0 && <><span>Fotos</span><span>{count((c) => c.type === 'image')}</span></>}
            {count((c) => c.type === 'audio') > 0 && <><span>Áudios</span><span>{count((c) => c.type === 'audio')}</span></>}
            {count((c) => c.type === 'text') > 0 && <><span>Textos e stickers</span><span>{count((c) => c.type === 'text')}</span></>}
            {count((c) => c.type === 'shape') > 0 && <><span>Formas</span><span>{count((c) => c.type === 'shape')}</span></>}
            {count((c) => c.type === 'effect') > 0 && <><span>Efeitos e filtros</span><span>{count((c) => c.type === 'effect')}</span></>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="btn" onClick={() => s().duplicateSelection()}>Duplicar</button>
            <button className="btn" onClick={() => s().copySelection()}>Copiar</button>
            {sound.length > 0 && <button className="btn" onClick={() => setMuted(!allMuted)}>{allMuted ? 'Ativar som' : 'Silenciar'}</button>}
            <button className="btn danger" onClick={() => s().deleteSelection()}><Trash2 size={14} /> Excluir</button>
          </div>
        </Section>
        {(sound.length > 0 || visual.length > 0) && (
          <Section title="Ajustar todos de uma vez">
            {sound.length > 0 && <BatchSlider ids={sound.map((c) => c.id)} prop="volume" label="Volume" min={0} max={200} toUi={(v) => Math.round(v * 100)} fromUi={(x) => x / 100} />}
            {visual.length > 0 && <BatchSlider ids={visual.map((c) => c.id)} prop="scale" label="Escala" min={1} max={2000} toUi={(v) => Math.round(v * 100)} fromUi={(x) => x / 100} />}
            {visual.length > 0 && <BatchSlider ids={visual.map((c) => c.id)} prop="opacity" label="Opacidade" min={0} max={100} toUi={(v) => Math.round(v * 100)} fromUi={(x) => x / 100} />}
            <div className="hint">Vale para todos os clipes selecionados que têm essa opção. Quem tem pontos de modificação mantém a animação, só que proporcional ao novo valor.</div>
          </Section>
        )}
        <EditarJuntos clips={clips} />
        <TextoEmLote ids={ids} titulo="Texto dos selecionados" />
        <div className="hint">Arraste qualquer um deles na linha do tempo para mover todos juntos. Escolher um filtro na aba Filtros aplica em todos os vídeos e fotos da seleção. Ctrl + clique tira ou põe um clipe na seleção.</div>
      </div>
    </>
  );
}

// Seleção com tipos diferentes: escolher um tipo abre o painel completo dele, valendo para todos desse tipo.
function EditarJuntos({ clips }) {
  const por = new Map();
  for (const c of clips) { const t = tipoGrupo(c); if (NOME_GRUPO[t]) por.set(t, [...(por.get(t) || []), c]); }
  const tipos = [...por].filter(([, cs]) => cs.length > 1);
  if (!tipos.length) return null;
  return (
    <Section title="Editar juntos">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {tipos.map(([t, cs]) => (
          <button key={t} className="btn small" onClick={() => useStore.setState((st) => ({ selection: { ...st.selection, id: cs[0].id, grupo: t } }))}>
            <Layers size={13} /> {cs.length} {NOME_GRUPO[t][1]}
          </button>
        ))}
      </div>
      <div className="hint">Abre todas as opções (filtro, ajustes, animação, voz…) de um tipo: o que mudar vale para todos os dele.</div>
    </Section>
  );
}

// Controle que muda a mesma propriedade em vários clipes. O valor mostrado é o do primeiro; ao arrastar,
// quem não tem pontos de modificação recebe o valor novo e quem tem tem os pontos multiplicados na mesma
// proporção (a conta parte sempre do estado do começo do gesto, sem acumular erro).
function BatchSlider({ ids, prop, label, min, max, toUi, fromUi }) {
  const project = useStore((s) => s.project);
  const snap = useRef(null);
  const clips = ids.map((id) => findClip(project, id)?.clip).filter(Boolean);
  if (!clips.length) return null;
  const vals = clips.map((c) => KF_PROPS[prop].get(c));
  const igual = vals.every((v) => Math.abs(v - vals[0]) < 1e-6);
  const inicio = () => {
    const s = useStore.getState();
    s.checkpoint();
    snap.current = { v0: vals[0], itens: clips.map((c) => ({ id: c.id, base: KF_PROPS[prop].get(c), kf: c.kf?.[prop] ? c.kf[prop].map((k) => ({ ...k })) : null })) };
  };
  const mudar = (ui) => {
    if (!snap.current) inicio();
    const v = fromUi(ui);
    const { v0, itens } = snap.current;
    const lo = fromUi(min), hi = fromUi(max);
    const cl = (x) => Math.max(lo, Math.min(hi, x));
    useStore.getState().commit((p) => {
      for (const it of itens) {
        const f = findClip(p, it.id);
        if (!f) continue;
        if (it.kf && v0 > 1e-6) f.clip.kf = { ...f.clip.kf, [prop]: it.kf.map((k) => ({ t: k.t, v: cl(k.v * (v / v0)) })) };
        else KF_PROPS[prop].set(f.clip, v);
      }
    }, { silent: true });
  };
  return (
    <div onPointerDownCapture={inicio} onPointerUpCapture={() => { snap.current = null; }} onBlurCapture={() => { snap.current = null; }}>
      <Field label={<span>{label}{!igual && <span className="hint" title="Os clipes têm valores diferentes; mostra o do primeiro"> (vários)</span>}</span>}>
        <Slider value={toUi(vals[0])} min={min} max={max} onChange={mudar} />
      </Field>
    </div>
  );
}

export default function Inspector() {
  const sel = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const grupo = grupoDaSelecao(project, sel);
  return (
    <div className="panel">
      {!sel && <ProjectPanel />}
      {sel?.type === 'transition' && <TransitionPanel key={sel.id} clipId={sel.id} />}
      {sel?.type === 'clip' && sel.ids?.length > 1 && (grupo ? <ClipPanel key={`g_${grupo.lider}`} id={grupo.lider} grupo={grupo} /> : <MultiPanel ids={sel.ids} />)}
      {sel?.type === 'clip' && !(sel.ids?.length > 1) && <ClipPanel key={sel.id} id={sel.id} />}
    </div>
  );
}
