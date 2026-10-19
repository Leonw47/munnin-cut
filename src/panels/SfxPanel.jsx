// Biblioteca de efeitos sonoros: categorias como em Efeitos/Transições; clique ouve, + (ou clique duplo)
// põe no cursor, ou arraste até a linha do tempo.
import React, { useEffect, useRef, useState } from 'react';
import { Play, Square, Plus, Search, ArrowLeftRight, MousePointerClick, Bomb, Laugh, Gamepad2, WandSparkles, Trees, Drum, AlarmClock } from 'lucide-react';
import { useStore } from '../store.js';
import { SFX, SFX_CATS } from '../shared/sfx.js';
import { mediaUrl } from '../engine/util.js';
import { startDrag, endDrag } from '../dnd.js';

const CAT_LOOK = {
  trans: { icon: ArrowLeftRight, bg: 'linear-gradient(135deg,#1f4f86,#19d3df)' },
  ui: { icon: MousePointerClick, bg: 'linear-gradient(135deg,#334155,#64748b)' },
  impact: { icon: Bomb, bg: 'linear-gradient(135deg,#7f1d1d,#ea580c)' },
  funny: { icon: Laugh, bg: 'linear-gradient(135deg,#a16207,#facc15)' },
  game: { icon: Gamepad2, bg: 'linear-gradient(135deg,#4c1d95,#22c55e)' },
  magic: { icon: WandSparkles, bg: 'linear-gradient(135deg,#6d28d9,#ec4899)' },
  nature: { icon: Trees, bg: 'linear-gradient(135deg,#14532d,#0ea5e9)' },
  music: { icon: Drum, bg: 'linear-gradient(135deg,#7c2d12,#a855f7)' },
  alert: { icon: AlarmClock, bg: 'linear-gradient(135deg,#991b1b,#f97316)' },
};

let lib = null; // { dir, index } — lido uma vez
const player = { el: null, id: null, timer: 0 };

export default function SfxPanel() {
  const [info, setInfo] = useState(lib);
  const [cat, setCat] = useState(() => { try { return localStorage.getItem('mc.sfxcat') || 'trans'; } catch { return 'trans'; } });
  const [q, setQ] = useState('');
  const [playing, setPlaying] = useState(null);
  const [adding, setAdding] = useState(null);
  const mounted = useRef(true);
  useEffect(() => { try { localStorage.setItem('mc.sfxcat', cat); } catch { /* ignore */ } }, [cat]);
  useEffect(() => {
    mounted.current = true;
    if (!lib) window.api.sfxList().then((r) => { lib = r; if (mounted.current) setInfo(r); }).catch(() => {});
    return () => { mounted.current = false; stop(); };
  }, []);

  const stop = () => {
    clearTimeout(player.timer);
    if (player.el) player.el.pause();
    player.id = null;
    if (mounted.current) setPlaying(null);
  };
  const preview = (id) => {
    if (!info) return;
    if (player.id === id) { stop(); return; }
    if (!player.el) player.el = new Audio();
    const el = player.el;
    el.pause();
    el.src = mediaUrl(`${info.dir}\\${id}.wav`);
    el.currentTime = 0;
    el.onended = () => { if (player.id === id) stop(); };
    player.id = id;
    setPlaying(id);
    el.play().catch(() => stop());
  };
  const add = async (id) => {
    stop();
    setAdding(id);
    const cid = await useStore.getState().addSfx(id);
    if (mounted.current) setAdding(null);
    if (cid) useStore.getState().toastMsg(`"${SFX.find((x) => x.id === id)?.name}" adicionado no cursor.`);
  };

  const term = q.trim().toLowerCase();
  const list = SFX.filter((x) => (term ? x.name.toLowerCase().includes(term) : x.cat === cat));
  const missing = info && !Object.keys(info.index || {}).length;
  return (
    <div>
      <div className="lp-row">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--muted)' }} />
          <input type="text" placeholder={`Pesquisar entre ${SFX.length} sons`} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()} style={{ width: '100%', paddingLeft: 26 }} />
        </div>
      </div>
      {!term && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {SFX_CATS.map((c) => <button key={c.id} className={`btn small ${cat === c.id ? 'primary' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
        </div>
      )}
      <div className="hint" style={{ marginBottom: 10 }}>Clique para ouvir · <b>+</b> ou clique duplo põe no cursor · ou arraste até a linha do tempo.</div>
      {missing && <div className="yt-err" style={{ marginBottom: 10 }}>A biblioteca de sons não foi encontrada nesta instalação.</div>}
      <div className="grid small">
        {list.map((x) => {
          const look = CAT_LOOK[x.cat] || CAT_LOOK.ui;
          const Icon = look.icon;
          const d = info?.index?.[x.id]?.dur;
          return (
            <div key={x.id} className={`fx-card sfx-card ${playing === x.id ? 'active' : ''}`} data-sfx={x.id} title={`${x.name}${d ? ` · ${d.toFixed(1).replace('.', ',')} s` : ''}`}
              draggable onDragStart={(e) => startDrag(e, { kind: 'sfx', id: x.id }, x.name)} onDragEnd={endDrag}
              onClick={() => preview(x.id)} onDoubleClick={() => add(x.id)}>
              <div className="sw sfx-sw" style={{ background: look.bg }}>
                <Icon size={22} strokeWidth={1.7} color="#ffffffd0" />
                <span className="sfx-play">{playing === x.id ? <Square size={11} fill="currentColor" /> : <Play size={12} fill="currentColor" />}</span>
                {d != null && <span className="sfx-dur">{d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)} s</span>}
                <button className="plus" title="Pôr no cursor" disabled={adding === x.id} onClick={(e) => { e.stopPropagation(); add(x.id); }}><Plus size={13} /></button>
              </div>
              <div className="label">{x.name}</div>
            </div>
          );
        })}
      </div>
      {term && !list.length && <div className="hint">Nenhum som com “{q}”.</div>}
      <div className="hint" style={{ marginTop: 12 }}>Todos os sons são gerados pelo próprio Munnin Cut — pode usar à vontade, inclusive em vídeos monetizados.</div>
    </div>
  );
}
