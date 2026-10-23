// Prévia de um vídeo do YouTube antes de baixar: o player oficial (num <webview> isolado, veja main.js)
// para conferir se é o vídeo certo, e a escolha do trecho — marcando início/fim enquanto assiste.
import React, { useEffect, useRef, useState } from 'react';
import { Download, Play, RotateCcw, ExternalLink, Music, Film } from 'lucide-react';
import { Modal, Toggle } from './ui.jsx';
import { TimeField, fmtPrec } from './TrimDialog.jsx';
import { MIN_CLIP } from '../shared/timeline.js';

// identifica o app para o YouTube (o player embutido exige um Referer)
const REFERER = 'https://github.com/Leonw47/munnin-cut';

const LER = `(() => { const v = document.querySelector('video');
  const e = document.querySelector('.ytp-error');
  return { t: v ? v.currentTime : 0, d: v && isFinite(v.duration) ? v.duration : 0, tocando: !!(v && !v.paused),
    erro: e && e.offsetParent ? (e.innerText || 'erro').trim().slice(0, 200) : '' }; })()`;

export default function YoutubePreview({ video, inicial, onClose, onBaixar }) {
  const wvRef = useRef(null);
  const stripRef = useRef(null);
  const pronto = useRef(false);
  const [pos, setPos] = useState(0);
  const [D, setD] = useState(video.duration || 0);
  const [tocando, setTocando] = useState(false);
  const [erro, setErro] = useState('');
  const [sect, setSect] = useState(!!inicial?.sect);
  const [range, setRange] = useState({ a: inicial?.start ?? 0, b: inicial?.end ?? (video.duration || 0) });
  const [kind, setKind] = useState(inicial?.kind || 'audio');
  const [toTimeline, setToTimeline] = useState(inicial?.toTimeline ?? true);
  const url = `https://www.youtube.com/watch?v=${video.id}`;
  const src = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;

  const js = (code) => (pronto.current && wvRef.current ? wvRef.current.executeJavaScript(code).catch(() => null) : Promise.resolve(null));

  useEffect(() => {
    const wv = wvRef.current;
    if (!wv) return undefined;
    const onReady = () => { pronto.current = true; };
    wv.addEventListener('dom-ready', onReady);
    const iv = setInterval(async () => {
      const r = await js(LER);
      if (!r) return;
      setPos(r.t);
      setTocando(r.tocando);
      if (r.d > 0) {
        // duração conhecida agora: "até o fim" (b = 0) ou fim antigo no final viram a duração real
        setD((d) => {
          if (Math.abs(d - r.d) > 0.5) setRange((g) => ({ a: Math.min(g.a, r.d), b: g.b <= 0 || g.b > r.d || (d > 0 && g.b >= d - 0.5) ? r.d : g.b }));
          return r.d;
        });
      }
      setErro(r.erro);
    }, 250);
    return () => { clearInterval(iv); wv.removeEventListener('dom-ready', onReady); };
  }, []);

  const seek = (t, tocar = false) => js(`(() => { const v = document.querySelector('video'); if (v) { v.currentTime = ${Math.max(0, t).toFixed(3)}; ${tocar ? 'v.play();' : ''} } })()`);
  const toggle = () => js(`(() => { const v = document.querySelector('video'); if (v) { if (v.paused) v.play(); else v.pause(); } })()`);
  // b = 0: "até o fim" (a duração só chega quando o player carrega; dá para digitar o trecho antes)
  const setA = (t) => { setSect(true); setRange((g) => ({ a: Math.max(0, g.b > 0 ? Math.min(t, g.b - MIN_CLIP) : t), b: g.b })); };
  const setB = (t) => { setSect(true); setRange((g) => ({ a: g.a, b: D > 0 ? Math.min(D, Math.max(t, g.a + MIN_CLIP)) : Math.max(t, g.a + MIN_CLIP) })); };

  const x = (t) => (D > 0 ? `${(t / D) * 100}%` : '0%');
  const tAt = (clientX) => {
    const r = stripRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(D, ((clientX - r.left) / r.width) * D));
  };
  const drag = (e, mode) => {
    if (!D) return;
    e.stopPropagation();
    e.preventDefault();
    const t0 = tAt(e.clientX);
    const r0 = { ...range };
    const move = (ev) => {
      const t = tAt(ev.clientX);
      if (mode === 'a') { setA(t); seek(t); }
      else if (mode === 'b') { setB(t); seek(t); }
      else if (mode === 'move') {
        const len = r0.b - r0.a;
        const a = Math.max(0, Math.min(D - len, r0.a + (t - t0)));
        setRange({ a, b: a + len });
      } else seek(t);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    if (mode === 'seek') seek(t0);
  };

  const ateFim = range.b <= 0 || (D > 0 && range.b >= D - 0.05);
  const inteiro = !sect || (range.a <= 0.05 && ateFim);
  const baixar = () => onBaixar({
    url, kind, toTimeline,
    ...(inteiro ? {} : { start: range.a, end: ateFim ? undefined : range.b }),
    title: video.title,
  });

  const footer = (
    <>
      <div className="seg" style={{ marginRight: 'auto' }}>
        <button className={kind === 'audio' ? 'on' : ''} onClick={() => setKind('audio')}><Music size={13} /> Só o áudio</button>
        <button className={kind === 'video' ? 'on' : ''} onClick={() => setKind('video')}><Film size={13} /> Vídeo</button>
      </div>
      <label className="yt-opt"><Toggle on={toTimeline} onChange={setToTimeline} /> Pôr na linha do tempo</label>
      <button className="btn primary" onClick={baixar}>
        <Download size={15} /> Baixar {inteiro ? (kind === 'video' ? 'o vídeo' : 'o áudio') : (ateFim && !D ? `a partir de ${fmtPrec(range.a)}` : `o trecho (${fmtPrec((ateFim ? D : range.b) - range.a)})`)}
      </button>
    </>
  );

  return (
    <Modal width={860} onClose={onClose} footer={footer}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Play size={16} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.title || 'Vídeo do YouTube'}</span>
        {video.channel && <span style={{ fontWeight: 400, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>· {video.channel}</span>}
      </span>}>
      <div className="yt-player">
        <webview ref={wvRef} src={src} httpreferrer={REFERER} partition="yt" style={{ width: '100%', height: '100%' }} />
      </div>
      {erro && (
        <div className="yt-err" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1 }}>O dono deste vídeo não deixa ele tocar fora do YouTube ({erro.split('\n')[0]}). Dá para baixar mesmo assim; para conferir, abra no YouTube.</span>
          <button className="btn small" onClick={() => window.open(url)}><ExternalLink size={13} /> Abrir no YouTube</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 8px' }}>
        <button className="play-btn" style={{ background: 'var(--panel-3)' }} onClick={toggle} title="Tocar / pausar">
          <Play size={17} fill={tocando ? 'none' : 'currentColor'} />
        </button>
        <span className="timecode"><b>{fmtPrec(pos)}</b> / {fmtPrec(D)}</span>
        <div style={{ flex: 1 }} />
        <button className="btn small" onClick={() => setA(pos)} disabled={!D}>Marcar início aqui</button>
        <button className="btn small" onClick={() => setB(pos)} disabled={!D}>Marcar fim aqui</button>
        {sect && <button className="btn small" onClick={() => seek(range.a, true)} title="Tocar a partir do início do trecho"><Play size={12} /> Trecho</button>}
        <button className="btn small ghost" onClick={() => { setSect(false); setRange({ a: 0, b: D }); }} title="Usar o vídeo inteiro"><RotateCcw size={13} /></button>
      </div>

      <div ref={stripRef} className="yt-strip" onPointerDown={(e) => drag(e, 'seek')}>
        {sect && D > 0 && <>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: x(range.a), background: '#000a' }} />
          <div style={{ position: 'absolute', left: x(range.b), top: 0, bottom: 0, right: 0, background: '#000a' }} />
          <div style={{ position: 'absolute', left: x(range.a), width: `calc(${x(range.b)} - ${x(range.a)})`, top: 0, bottom: 0, boxShadow: 'inset 0 0 0 2px var(--accent)', borderRadius: 4, cursor: 'grab' }}
            onPointerDown={(e) => drag(e, 'move')} />
          {['a', 'b'].map((h) => (
            <div key={h} title={h === 'a' ? 'Início' : 'Fim'} onPointerDown={(e) => drag(e, h)} className="yt-handle"
              style={{ left: h === 'a' ? x(range.a) : `calc(${x(range.b)} - 10px)`, borderRadius: h === 'a' ? '4px 0 0 4px' : '0 4px 4px 0' }} />
          ))}
        </>}
        <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, left: `calc(${x(pos)} - 1px)`, background: '#fff', pointerEvents: 'none' }} />
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginTop: 12 }}>
        <label className="yt-opt" style={{ alignSelf: 'center' }}><Toggle on={sect} onChange={(v) => { setSect(v); if (v && range.b <= range.a) setRange({ a: 0, b: D }); }} /> Só um trecho</label>
        {sect && <>
          <TimeField label="Início" value={range.a} onCommit={(v) => { setA(v); seek(v); }} />
          <TimeField label="Fim" value={range.b > 0 ? range.b : D} onCommit={(v) => setB(v)} />
          <TimeField label="Duração" value={Math.max(0, (range.b > 0 ? range.b : D) - range.a)} onCommit={(v) => setB(range.a + v)} />
        </>}
        <div className="hint" style={{ marginLeft: 'auto', maxWidth: 300, textAlign: 'right' }}>
          Assista para conferir e marque o início e o fim do que quer usar — ou arraste as alças na barra.
        </div>
      </div>
    </Modal>
  );
}
