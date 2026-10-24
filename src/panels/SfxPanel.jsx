// Biblioteca de efeitos sonoros: categorias como em Efeitos/Transições; clique ouve, + (ou clique duplo)
// põe no cursor, ou arraste até a linha do tempo.
import React, { useEffect, useRef, useState } from 'react';
import { Play, Square, Plus, Search, ArrowLeftRight, MousePointerClick, Bomb, Laugh, Gamepad2, WandSparkles, Trees, Drum, AlarmClock, Heart, FolderPlus, FolderOpen, FilePlus2, Trash2, Check, X, Users, PawPrint, Mountain, Car, House, Rocket, Trophy, Flame, Mic } from 'lucide-react';
import { useStore } from '../store.js';
import { SFX, SFX_CATS, sfxDef } from '../shared/sfx.js';
import { mediaUrl } from '../engine/util.js';
import { startDrag, endDrag } from '../dnd.js';
import { ContextMenu, MenuItem } from '../components/ui.jsx';

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
  people: { icon: Users, bg: 'linear-gradient(135deg,#9a3412,#fb923c)' },
  animals: { icon: PawPrint, bg: 'linear-gradient(135deg,#365314,#a3e635)' },
  ambience: { icon: Mountain, bg: 'linear-gradient(135deg,#134e4a,#5eead4)' },
  city: { icon: Car, bg: 'linear-gradient(135deg,#1e293b,#eab308)' },
  home: { icon: House, bg: 'linear-gradient(135deg,#78350f,#d6a36b)' },
  scifi: { icon: Rocket, bg: 'linear-gradient(135deg,#0c4a6e,#818cf8)' },
  sports: { icon: Trophy, bg: 'linear-gradient(135deg,#166534,#facc15)' },
  weapons: { icon: Flame, bg: 'linear-gradient(135deg,#450a0a,#dc2626)' },
  voice: { icon: Mic, bg: 'linear-gradient(135deg,#312e81,#22d3ee)' },
};

let lib = null; // { dir, index, livresDir, livresIndex } — lido uma vez
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
  const preview = (id, arquivo) => {
    if (!info && !arquivo) return;
    if (player.id === id) { stop(); return; }
    if (!player.el) player.el = new Audio();
    const el = player.el;
    el.pause();
    el.src = mediaUrl(arquivo || (sfxDef(id)?.livre ? `${info.livresDir}\\${id}.ogg` : `${info.dir}\\${id}.wav`));
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
  const list = cat === 'meus' && !term ? [] : SFX.filter((x) => (term ? x.name.toLowerCase().includes(term) : x.cat === cat));
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
          <button className={`btn small ${cat === 'meus' ? 'primary' : ''}`} onClick={() => setCat('meus')} title="Sua biblioteca: sons que você baixou ou gravou, organizados em categorias"><Heart size={12} /> Meus sons</button>
          {SFX_CATS.map((c) => <button key={c.id} className={`btn small ${cat === c.id ? 'primary' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
        </div>
      )}
      <div className="hint" style={{ marginBottom: 10 }}>Clique para ouvir · <b>+</b> ou clique duplo põe no cursor · ou arraste até a linha do tempo.</div>
      {(cat === 'meus' || term) && <MeusSons term={term} playing={playing} preview={preview} stop={stop} soResultado={cat !== 'meus'} />}
      {missing && <div className="yt-err" style={{ marginBottom: 10 }}>A biblioteca de sons não foi encontrada nesta instalação.</div>}
      <div className="grid small">
        {list.map((x) => {
          const look = CAT_LOOK[x.cat] || CAT_LOOK.ui;
          const Icon = look.icon;
          const d = (x.livre ? info?.livresIndex : info?.index)?.[x.id]?.dur;
          return (
            <div key={x.id} className={`fx-card sfx-card ${playing === x.id ? 'active' : ''}`} data-sfx={x.id} title={`${x.name}${d ? ` · ${d.toFixed(1).replace('.', ',')} s` : ''}${x.livre ? ` · ${x.fonte} (domínio público)` : ''}`}
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
      {term && !list.length && <div className="hint">Nenhum som da biblioteca com “{q}”.</div>}
      {cat !== 'meus' && (
        <div className="hint" style={{ marginTop: 12 }}>
          Sons criados pelo Munnin Cut e de domínio público (CC0) da Kenney (kenney.nl) e do BigSoundBank (Joseph Sardin, bigsoundbank.com):
          pode usar à vontade, inclusive em vídeos monetizados.
        </div>
      )}
    </div>
  );
}

// ---------- Meus sons: biblioteca pessoal (pastas em Documentos\Munnin Cut\Meus sons) ----------
let meus = null; // { dir, cats } — cache entre aberturas da aba
const recarregar = () => window.api.meusSons().then((r) => { meus = r; return r; });

function MeusSons({ term, playing, preview, stop, soResultado }) {
  const [data, setData] = useState(meus);
  const [cat, setCat] = useState(() => { try { return localStorage.getItem('mc.meuscat') || ''; } catch { return ''; } });
  const [nova, setNova] = useState(null); // nome sendo digitado
  const [menu, setMenu] = useState(null);
  const [soltar, setSoltar] = useState(false);
  const [adding, setAdding] = useState(null);
  const vivo = useRef(true);
  const atualizar = () => recarregar().then((r) => { if (vivo.current) setData(r); }).catch(() => {});
  useEffect(() => { vivo.current = true; atualizar(); return () => { vivo.current = false; }; }, []);
  useEffect(() => { try { localStorage.setItem('mc.meuscat', cat); } catch { /* ignore */ } }, [cat]);

  const cats = data?.cats || [];
  const atual = cats.find((c) => c.name === cat) || cats[0] || null;
  const sons = term ? cats.flatMap((c) => c.sons.filter((x) => x.name.toLowerCase().includes(term)).map((x) => ({ ...x, cat: c.name }))) : atual?.sons || [];

  const criar = async () => {
    const n = (nova || '').trim();
    setNova(null);
    if (!n) return;
    try { await window.api.meusSonsCategoria(n); setCat(n.replace(/[<>:"/\\|?*]/g, '').trim()); await atualizar(); } catch (e) { useStore.getState().toastMsg(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'err'); }
  };
  const adicionarArquivos = async (files) => {
    if (!files.length) return;
    const destino = atual?.dir || data?.dir;
    const n = await window.api.meusSonsAdicionar(destino, files).catch(() => 0);
    await atualizar();
    useStore.getState().toastMsg(n ? `${n} ${n === 1 ? 'som adicionado' : 'sons adicionados'} em “${atual?.name || 'Geral'}”.` : 'Nenhum arquivo de áudio novo para adicionar.', n ? 'info' : 'err');
  };
  const add = async (som) => {
    stop();
    setAdding(som.path);
    const cid = await useStore.getState().addUserSfx(som.path);
    if (vivo.current) setAdding(null);
    if (cid) useStore.getState().toastMsg(`"${som.name}" adicionado no cursor.`);
  };
  const remover = async (som) => {
    stop();
    try { await window.api.meusSonsRemover(som.path); await atualizar(); useStore.getState().toastMsg(`"${som.name}" foi para a Lixeira.`); } catch (e) { useStore.getState().toastMsg(String(e.message || e), 'err'); }
  };
  const temArquivos = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

  if (soResultado && !sons.length) return null;
  return (
    <div className={`meus-sons ${soltar ? 'soltar' : ''}`}
      onDragOver={(e) => { if (!soResultado && temArquivos(e)) { e.preventDefault(); e.stopPropagation(); setSoltar(true); } }}
      onDragLeave={() => setSoltar(false)}
      onDrop={(e) => {
        if (soResultado || !temArquivos(e)) return;
        e.preventDefault();
        e.nativeEvent.__timelineHandled = true;   // a janela não importa estes arquivos para o projeto
        setSoltar(false);
        adicionarArquivos([...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean));
      }}>
      {!soResultado && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {cats.map((c) => (
              <button key={c.name} className={`btn small ${atual?.name === c.name ? 'primary' : ''}`} onClick={() => setCat(c.name)}>
                {c.name} <span style={{ opacity: 0.6 }}>{c.sons.length}</span>
              </button>
            ))}
            {nova === null
              ? <button className="btn small ghost" onClick={() => setNova('')} title="Nova categoria (uma pasta)"><FolderPlus size={13} /> Categoria</button>
              : (
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  <input autoFocus type="text" value={nova} placeholder="Ex.: Rodrigo Faro" style={{ width: 130 }}
                    onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') criar(); if (e.key === 'Escape') setNova(null); }} />
                  <button className="btn small primary" onClick={criar} title="Criar"><Check size={13} /></button>
                  <button className="btn small ghost" onClick={() => setNova(null)} title="Cancelar"><X size={13} /></button>
                </span>
              )}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button className="btn small" disabled={!data} onClick={async () => adicionarArquivos(await window.api.meusSonsEscolher())}><FilePlus2 size={13} /> Adicionar sons{atual ? ` em “${atual.name}”` : ''}</button>
            <button className="btn small ghost" disabled={!data} title="Abrir a pasta (cada subpasta é uma categoria)" onClick={() => window.api.openPath(atual?.dir || data.dir)}><FolderOpen size={13} /></button>
          </div>
        </>
      )}
      {!soResultado && !cats.length && (
        <div className="hint" style={{ marginBottom: 10 }}>
          Crie uma categoria (ex.: “Rodrigo Faro”, “Memes”, “Transições”) e adicione os sons que você baixou — ou arraste os arquivos para cá.
          Ficam só neste computador, em Documentos\Munnin Cut\Meus sons.
        </div>
      )}
      {!soResultado && atual && !atual.sons.length && <div className="hint" style={{ marginBottom: 10 }}>Categoria vazia: arraste arquivos de áudio para cá ou use “Adicionar sons”.</div>}
      {!!sons.length && (
        <div className="grid small" style={{ marginBottom: 12 }}>
          {sons.map((x) => {
            const id = `meu:${x.path}`;
            return (
              <div key={x.path} className={`fx-card sfx-card ${playing === id ? 'active' : ''}`} data-meusom={x.name} title={`${x.name}${x.cat ? ` · ${x.cat}` : ''}${x.dur ? ` · ${x.dur.toFixed(1).replace('.', ',')} s` : ''}`}
                draggable onDragStart={(e) => startDrag(e, { kind: 'usersfx', path: x.path }, x.name)} onDragEnd={endDrag}
                onClick={() => preview(id, x.path)} onDoubleClick={() => add(x)}
                onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, som: x }); }}>
                <div className="sw sfx-sw" style={{ background: 'linear-gradient(135deg,#9d174d,#f472b6)' }}>
                  <Heart size={20} strokeWidth={1.7} color="#ffffffd0" />
                  <span className="sfx-play">{playing === id ? <Square size={11} fill="currentColor" /> : <Play size={12} fill="currentColor" />}</span>
                  {x.dur > 0 && <span className="sfx-dur">{x.dur < 10 ? x.dur.toFixed(1).replace('.', ',') : Math.round(x.dur)} s</span>}
                  <button className="plus" title="Pôr no cursor" disabled={adding === x.path} onClick={(e) => { e.stopPropagation(); add(x); }}><Plus size={13} /></button>
                </div>
                <div className="label">{x.name}</div>
              </div>
            );
          })}
        </div>
      )}
      {!soResultado && (
        <div className="hint" style={{ marginBottom: 12 }}>
          Sons de sites e programas de TV têm direitos: use só onde a licença deixa (alguns sites liberam o uso em vídeos, mas não a redistribuição dos arquivos).
        </div>
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <MenuItem icon={<Plus size={14} />} label="Pôr no cursor" onClick={() => add(menu.som)} />
          <MenuItem icon={<FolderOpen size={14} />} label="Mostrar na pasta" onClick={() => window.api.showItem(menu.som.path)} />
          <MenuItem icon={<Trash2 size={14} />} label="Mover para a Lixeira" onClick={() => remover(menu.som)} />
        </ContextMenu>
      )}
    </div>
  );
}
