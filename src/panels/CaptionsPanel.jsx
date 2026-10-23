import React, { useEffect, useMemo, useState } from 'react';
import { Captions, Trash2, Loader2, Download, Wand2 } from 'lucide-react';
import { useStore } from '../store.js';
import { findClip, fmtTime } from '../shared/timeline.js';
import { CAPTION_STYLES, CAPTION_LANGS, captionStyle, generateCaptions } from '../captions.js';
import { presetCss } from './TextPanel.jsx';
import { editClip, Seg, Slider } from '../components/ui.jsx';
import { fmtBytes } from '../shared/defs.js';
import TextoEmLote from '../components/TextoEmLote.jsx';

const STAGES = { download: 'Baixando o modelo de legendas…', audio: 'Preparando o áudio…', transcribe: 'Ouvindo e transcrevendo…', apply: 'Criando as legendas…' };
const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

export default function CaptionsPanel() {
  const project = useStore((s) => s.project);
  const sel = useStore((s) => s.selection);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(() => ls('mc.capModel', 'small'));
  const [language, setLanguage] = useState(() => ls('mc.capLang', 'pt'));
  const [styleId, setStyleId] = useState(() => ls('mc.capStyle', 'clean'));
  const [lines, setLines] = useState(() => Number(ls('mc.capLines', 2)));
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(null); // { stage, pct }
  const S = useStore.getState;

  const refresh = () => window.api.captionModels().then(setModels).catch(() => setModels([]));
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    try { localStorage.setItem('mc.capModel', model); localStorage.setItem('mc.capLang', language); localStorage.setItem('mc.capStyle', styleId); localStorage.setItem('mc.capLines', String(lines)); } catch { /* ignore */ }
  }, [model, language, styleId, lines]);
  useEffect(() => window.api.onCaptionProgress(({ stage, pct }) => setBusy((b) => (b ? { stage, pct } : b))), []);

  const selClip = sel?.type === 'clip' ? findClip(project, sel.id)?.clip : null;
  const clipOk = selClip && (selClip.type === 'video' || selClip.type === 'audio');
  const caps = useMemo(() => project.tracks.flatMap((t) => t.clips).filter((c) => c.caption).sort((a, b) => a.start - b.start), [project.tracks]);
  const md = models.find((m) => m.id === model);

  const run = async (source) => {
    S().pause();
    setBusy({ stage: 'audio', pct: 0 });
    try {
      const n = await generateCaptions({ source, clipId: selClip?.id, language, model, styleId, lines, replace: true, prompt, onStage: (stage, pct) => setBusy({ stage, pct }) });
      S().toastMsg(n ? `${n} legendas criadas. Revise o texto abaixo, se precisar.` : 'Nenhuma fala foi encontrada no áudio.');
    } catch (e) {
      S().toastMsg(`Não foi possível gerar as legendas: ${String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, 'err', 7000);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const restyle = (id) => {
    setStyleId(id);
    if (!caps.length) return;
    const style = captionStyle(id);
    S().commit((p) => {
      for (const t of p.tracks) for (const c of t.clips) if (c.caption) c.text = { ...structuredClone(style), content: c.text.content };
    }, { keepTracks: true });
  };
  const setY = (y) => {
    for (const c of caps) editClip(c.id, (x) => { x.transform.y = y; });
  };

  return (
    <div>
      <div className="lp-section-title">Legendas automáticas</div>
      <div className="hint" style={{ marginBottom: 10 }}>O áudio é transcrito no próprio computador (sem internet depois do primeiro uso) e vira textos editáveis na linha do tempo.</div>

      <div className="field"><label>Idioma</label>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ width: '100%' }}>
          {CAPTION_LANGS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <div className="field"><label>Precisão</label>
        <select value={model} onChange={(e) => setModel(e.target.value)} style={{ width: '100%' }}>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.downloaded ? 'pronto' : `baixar ${fmtBytes(m.size)}`}</option>)}
        </select>
      </div>
      <div className="field"><label>Linhas</label>
        <Seg value={lines} onChange={setLines} options={[{ value: 1, label: '1 linha' }, { value: 2, label: '2 linhas' }]} />
      </div>
      <div className="field" title="Ajuda a acertar nomes próprios e termos específicos"><label>Palavras-chave</label>
        <input type="text" placeholder="ex.: AD Vale, Jozyanne, culto" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.stopPropagation()} style={{ width: '100%' }} />
      </div>

      <div className="lp-section-title">Estilo</div>
      <div className="grid small" style={{ marginBottom: 12 }}>
        {CAPTION_STYLES.map((s) => {
          const st = captionStyle(s.id);
          return (
            <div key={s.id} className={`fx-card ${styleId === s.id ? 'active' : ''}`} onClick={() => restyle(s.id)} title={caps.length ? 'Aplica a todas as legendas' : ''}>
              <div className="text-preset" style={{ fontSize: 14, border: styleId === s.id ? '1.5px solid var(--accent)' : undefined }}>
                <span style={{ ...presetCss(st), ...(st.background?.enabled ? { background: st.background.color, padding: '1px 5px', borderRadius: 3 } : {}) }}>Legenda</span>
              </div>
              <div className="label">{s.name}</div>
            </div>
          );
        })}
      </div>

      {busy ? (
        <div className="rec" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={15} className="spin" /> {STAGES[busy.stage] || 'Processando…'} {busy.pct > 0 && busy.pct < 1 ? `${Math.round(busy.pct * 100)}%` : ''}</div>
          <div className="progress"><div style={{ width: `${Math.round((busy.pct || 0) * 100)}%` }} /></div>
          <button className="btn small" onClick={() => window.api.captionCancel()}>Cancelar</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="btn primary block" style={{ height: 34 }} onClick={() => run('project')} disabled={!md?.available}>
            {md && !md.downloaded ? <Download size={15} /> : <Wand2 size={15} />} Gerar legendas do projeto{md && !md.downloaded ? ` (baixa ${fmtBytes(md.size)})` : ''}
          </button>
          <button className="btn block" onClick={() => run('clip')} disabled={!clipOk || !md?.available} title={clipOk ? '' : 'Selecione um vídeo ou áudio na linha do tempo'}>
            <Captions size={15} /> Só do clipe selecionado
          </button>
          {md && !md.available && <div className="err-box" style={{ fontFamily: 'inherit' }}>O componente de legendas não está nesta instalação.</div>}
        </div>
      )}

      {caps.length > 0 && (
        <>
          <div className="lp-section-title" style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ flex: 1 }}>Legendas ({caps.length})</span>
            <button className="btn small ghost" onClick={() => { if (window.confirm('Apagar todas as legendas?')) S().commit((p) => { for (const t of p.tracks) t.clips = t.clips.filter((c) => !c.caption); }); }}><Trash2 size={13} /> Apagar todas</button>
          </div>
          <div className="field"><label>Altura</label><Slider value={Math.round((caps[0].transform?.y ?? 0.32) * 100)} min={-45} max={45} onChange={(v) => setY(v / 100)} /></div>
          <TextoEmLote ids={caps.map((c) => c.id)} titulo="Personalizar todas as legendas" />
          <div className="cap-list">
            {caps.map((c) => (
              <div key={c.id} className="cap-item">
                <button className="cap-time" onClick={() => { S().select({ type: 'clip', id: c.id }); S().setTime(c.start + 0.01); }}>{fmtTime(c.start)}</button>
                <textarea rows={c.text.content.includes('\n') ? 2 : 1} value={c.text.content}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) => { const v = e.target.value; editClip(c.id, (x) => { x.text.content = v; }); }} />
                <button className="icon-btn sm" title="Apagar esta legenda" onClick={() => S().commit((p) => { const f = findClip(p, c.id); if (f) f.track.clips.splice(f.index, 1); })}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
