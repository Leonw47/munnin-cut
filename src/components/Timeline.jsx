import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Undo2, Redo2, Scissors, Trash2, CopyPlus, AudioLines, FlipHorizontal2, RotateCw, Magnet, ZoomIn, ZoomOut, MoveHorizontal,
  Lock, LockOpen, Eye, EyeOff, Volume2, VolumeX, Film, Type, Sparkles, Music, Layers, Copy, Clipboard, ArrowLeftRight, Smile, Palette, Rewind,
  DiamondPlus, ChevronLeft, ChevronRight, Repeat,
} from 'lucide-react';
import { useStore, kindFor, placeInTrack, selIds } from '../store.js';
import { mainTrack, findClip, projectDuration, fmtTime, MIN_CLIP, maxDurationFor, transitionDuration, nextAdjacent, overlayTransDur } from '../shared/timeline.js';
import { FILTERS } from '../shared/ops.js';
import { EFFECTS } from '../shared/effects.js';
import { mediaUrl } from '../engine/util.js';
import { dnd } from '../dnd.js';
import { shapeName } from '../engine/shapes.js';
import { sliceKf, kfTimes, moveKfTime, removeKfTime } from '../shared/keyframes.js';
import { ContextMenu, MenuItem } from './ui.jsx';


const fmtPrec = (t) => {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};

const PAD = 14;
const RULER = 26;
const ROW_H = { video: 66, overlay: 50, text: 34, effect: 30, audio: 48 };
const KIND_ICON = { video: Film, overlay: Layers, text: Type, effect: Sparkles, audio: Music };

// ---------- Forma de onda (cache por arquivo) ----------
const waveCache = new Map();
export function useWave(path) {
  const [data, setData] = useState(() => (path ? waveCache.get(path) || null : null));
  useEffect(() => {
    if (!path) return;
    if (waveCache.has(path)) { setData(waveCache.get(path)); return; }
    let alive = true;
    fetch(mediaUrl(path)).then((r) => r.arrayBuffer()).then((b) => {
      const u = new Uint8Array(b);
      waveCache.set(path, u);
      if (alive) setData(u);
    }).catch(() => {});
    return () => { alive = false; };
  }, [path]);
  return data;
}

// Desenha só o trecho visível do bloco (em pedaços de 1024 px), na resolução da tela. Antes era um canvas
// de no máximo 4000 px esticado até a largura do bloco: em músicas longas ou com zoom a onda ficava esticada.
const WAVE_PASSO = 1024;
function Wave({ path, clip, width, height, viewL = 0, viewW = 4000, color = '#7ff0bf' }) {
  const data = useWave(path);
  const ref = useRef(null);
  const x0 = Math.max(0, Math.floor(viewL / WAVE_PASSO) * WAVE_PASSO - WAVE_PASSO);
  const x1 = Math.min(Math.ceil(width), Math.ceil((viewL + viewW) / WAVE_PASSO) * WAVE_PASSO + WAVE_PASSO);
  const cw = Math.max(0, x1 - x0);
  useEffect(() => {
    const c = ref.current;
    if (!c || !data || cw <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.max(1, Math.min(16000, Math.round(cw * dpr))), ph = Math.max(1, Math.round(height * dpr));
    c.width = pw;
    c.height = ph;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, pw, ph);
    ctx.fillStyle = color;
    const sp = clip.speed || 1;
    const t0 = clip.in || 0;
    const span = clip.duration * sp;
    const vol = Math.min(2, clip.muted ? 0 : clip.volume ?? 1);
    const k = Math.min(1, 0.85 * vol);
    const W = Math.max(1, width);
    const at = (px) => { const f = (x0 + (px / pw) * cw) / W; return t0 + (clip.reverse ? 1 - f : f) * span; }; // invertido: espelhada
    for (let x = 0; x < pw; x++) {
      const ta = at(x) * 100, tb = at(x + 1) * 100;
      const a = Math.min(ta, tb), b = Math.max(ta, tb);
      let mx = 0;
      if (b - a < 1) {
        // zoom grande: menos de um pico (10 ms) por pixel → interpola entre os picos vizinhos
        const i = Math.floor(a), fr = a - i;
        mx = i < data.length ? (data[i] * (1 - fr) + (data[Math.min(data.length - 1, i + 1)] * fr)) : 0;
      } else {
        for (let i = Math.floor(a); i < Math.ceil(b) && i < data.length; i++) if (data[i] > mx) mx = data[i];
      }
      const h = Math.max(dpr, (mx / 255) * ph * k);
      ctx.fillRect(x, ph - h, 1, h);
    }
  }, [data, width, height, x0, cw, clip.in, clip.duration, clip.speed, clip.volume, clip.muted, clip.reverse, color]);
  if (cw <= 0) return null;
  return <canvas ref={ref} className="wave" style={{ left: x0, width: cw, height }} />;
}

function Thumbs({ clip, media, meta, width, height, zoom }) {
  if (!media) return null;
  if (media.type === 'image') {
    const src = mediaUrl(meta?.proxy || media.renderPath || media.path) + (meta?.ver ? `?v=${meta.ver}` : '');
    const tileW = Math.max(20, height * ((media.width || 16) / (media.height || 9)));
    const n = Math.min(120, Math.ceil(width / tileW));
    return (
      <div className="thumbs">
        {Array.from({ length: n }, (_, i) => <div key={i} style={{ width: tileW, backgroundImage: `url("${src}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />)}
      </div>
    );
  }
  const t = meta?.thumbs;
  if (!t || media.type !== 'video') return null;
  let tileW = height * (t.tw / t.th);
  const n0 = Math.ceil(width / tileW);
  if (n0 > 160) tileW = width / 160;
  const n = Math.min(160, Math.ceil(width / tileW));
  const url = mediaUrl(t.sprite);
  const sp = clip.speed || 1;
  const dur = media.duration || 1;
  return (
    <div className="thumbs">
      {Array.from({ length: n }, (_, j) => {
        const lt = ((j + 0.5) * tileW) / zoom;
        const st = (clip.in || 0) + (clip.reverse ? Math.max(0, clip.duration - lt) : lt) * sp;
        const idx = Math.max(0, Math.min(t.count - 1, Math.floor((st / dur) * t.count)));
        const th = height * (t.tw / t.th);
        return <div key={j} style={{ width: tileW, backgroundImage: `url("${url}")`, backgroundSize: `${t.count * th}px ${height}px`, backgroundPosition: `${-idx * th}px 0` }} />;
      })}
    </div>
  );
}

function clipClass(clip, track) {
  if (clip.type === 'text') return clip.sticker ? 'stk' : 'text';
  if (clip.type === 'shape') return 'shape';
  if (clip.type === 'effect') return clip.effect.kind === 'filter' ? 'filter' : 'effect';
  if (clip.type === 'audio') return 'audio';
  return track.main ? '' : 'overlay';
}

function clipLabel(clip, media) {
  if (clip.type === 'text') return clip.sticker ? clip.text.content : (clip.text.content || 'Texto').replace(/\n/g, ' ');
  if (clip.type === 'shape') return shapeName(clip.shape);
  if (clip.type === 'effect') {
    const list = clip.effect.kind === 'filter' ? FILTERS : EFFECTS;
    return list.find((e) => e.id === clip.effect.id)?.name || 'Efeito';
  }
  return media?.name || 'Mídia';
}

// ---------- Régua ----------
function Ruler({ zoom, scrollLeft, width, fps, onScrub }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, width * dpr);
    c.height = RULER * dpr;
    c.style.width = `${width}px`;
    c.style.height = `${RULER}px`;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, RULER);
    const steps = [1 / fps, 2 / fps, 5 / fps, 10 / fps, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200];
    const major = steps.find((s) => s * zoom >= 90) || 1800;
    const minor = major / (major >= 1 ? 5 : 2);
    const t0 = Math.max(0, (scrollLeft - PAD) / zoom);
    const t1 = (scrollLeft + width - PAD) / zoom;
    ctx.font = '10px Segoe UI';
    ctx.textBaseline = 'top';
    for (let i = Math.floor(t0 / minor); i * minor <= t1; i++) {
      const t = i * minor;
      const x = Math.round(t * zoom + PAD - scrollLeft) + 0.5;
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-4;
      ctx.fillStyle = isMajor ? '#6c6c74' : '#45454c';
      ctx.fillRect(x, isMajor ? RULER - 10 : RULER - 5, 1, isMajor ? 10 : 5);
      if (isMajor) {
        ctx.fillStyle = '#8b8b93';
        const tt = Math.round(t * 1000) / 1000;
        const label = major < 1 ? `${fmtTime(tt)}:${String(Math.round((tt % 1) * fps) % fps).padStart(2, '0')}` : fmtTime(tt + 1e-6);
        ctx.fillText(label, x + 4, 4);
      }
    }
  }, [zoom, scrollLeft, width, fps]);
  return (
    <div className="tl-ruler" onPointerDown={onScrub}>
      <canvas ref={ref} style={{ position: 'absolute', left: scrollLeft, top: 0 }} />
      <LoopBand zoom={zoom} />
    </div>
  );
}

// Trecho repetido (loop): faixa na régua; arrastar as bordas muda o trecho, arrastar o meio move,
// clique duplo apaga. Shift+arrastar na régua cria um trecho novo.
function LoopBand({ zoom }) {
  const loop = useStore((s) => s.loop);
  if (!loop) return null;
  const down = (e, modo) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const x0 = e.clientX, l0 = { ...loop };
    const move = (ev) => {
      const dt = (ev.clientX - x0) / zoom;
      if (modo === 'a') useStore.getState().setLoop(Math.min(l0.a + dt, l0.b - 0.1), l0.b, l0.on);
      else if (modo === 'b') useStore.getState().setLoop(l0.a, Math.max(l0.b + dt, l0.a + 0.1), l0.on);
      else { const len = l0.b - l0.a; const a = Math.max(0, l0.a + dt); useStore.getState().setLoop(a, a + len, l0.on); }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className={`loop-band ${loop.on ? 'on' : ''}`} style={{ left: loop.a * zoom + PAD, width: (loop.b - loop.a) * zoom }}
      title={`Trecho repetido ${fmtTime(loop.a)}–${fmtTime(loop.b)} · arraste para mover, bordas para ajustar, clique duplo apaga`}
      onPointerDown={(e) => down(e, 'move')} onDoubleClick={(e) => { e.stopPropagation(); useStore.getState().clearLoop(); }}>
      <div className="lb-h a" onPointerDown={(e) => down(e, 'a')} />
      <div className="lb-h b" onPointerDown={(e) => down(e, 'b')} />
    </div>
  );
}

function Playhead({ zoom, scrollRef, follow }) {
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  const x = time * zoom + PAD;
  useEffect(() => {
    if (!playing || !follow) return;
    const sc = scrollRef.current;
    if (!sc) return;
    if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.2);
  }, [x, playing, follow, scrollRef]);
  return (
    <div className="playhead" style={{ left: x }}>
      <div className="knob" onPointerDown={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('tl-scrub', { detail: e })); }} />
    </div>
  );
}

export default function Timeline({ height }) {
  const project = useStore((s) => s.project);
  const meta = useStore((s) => s.meta);
  const sel = useStore((s) => s.selection);
  const zoom = useStore((s) => s.zoom);
  const snapping = useStore((s) => s.snapping);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0, w: 800, h: 300 });
  const [ghost, setGhost] = useState(null);
  const [snapLine, setSnapLine] = useState(null);
  const [dropHint, setDropHint] = useState(null);
  const [menu, setMenu] = useState(null);
  const [trimTip, setTrimTip] = useState(null);
  const [marquee, setMarquee] = useState(null);
  const [groupDx, setGroupDx] = useState(null);
  const [kfDrag, setKfDrag] = useState(null); // { clipId, t } — ponto de modificação sendo arrastado
  const loopOn = useStore((s) => !!s.loop?.on);
  const S = useStore.getState;
  const selSet = useMemo(() => new Set(selIds(sel)), [sel]);

  // Ponto de modificação: clique leva a agulha até ele; arrastar muda o momento (todas as propriedades juntas).
  const dragKf = (e, c, kt) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const s = S();
    s.select({ type: 'clip', id: c.id });
    s.pause();
    s.setTime(c.start + kt);
    const x0 = e.clientX;
    let cur = kt, moved = false;
    const outros = kfTimes(c).filter((t) => Math.abs(t - kt) > 1e-6);
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      if (!moved) { moved = true; s.checkpoint(); }
      let t = Math.max(0, Math.min(c.duration, kt + (ev.clientX - x0) / S().zoom));
      if (!ev.shiftKey) t = Math.round(t * fps) / fps;          // encaixa nos quadros (Shift = livre)
      for (const o of outros) if (Math.abs(o - t) < 4 / S().zoom) t = o; // gruda nos outros pontos
      const atual = findClip(S().project, c.id)?.clip;
      if (!atual) return;
      S().updateClip(c.id, (d) => { moveKfTime(d, cur, t); }, { silent: true });
      cur = t;
      setKfDrag({ clipId: c.id, t });
      S().setTime(c.start + t);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setKfDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const mediaMap = useMemo(() => Object.fromEntries(project.media.map((m) => [m.id, m])), [project.media]);
  const duration = projectDuration(project);
  const fps = project.fps || 30;

  // Layout vertical das faixas
  const tracksH = project.tracks.reduce((n, t) => n + ROW_H[t.kind], 0);
  const free = Math.max(0, scroll.h - RULER - tracksH);
  const topZone = Math.max(30, free * 0.45);
  const bottomZone = Math.max(40, free - topZone + 20);
  const rows = useMemo(() => {
    let y = RULER + topZone;
    return project.tracks.map((t) => { const r = { track: t, top: y, h: ROW_H[t.kind] }; y += r.h; return r; });
  }, [project.tracks, topZone]);
  const contentH = RULER + topZone + tracksH + bottomZone;
  const contentW = Math.max(scroll.w, (Math.max(duration, 5) + Math.max(10, duration * 0.3)) * zoom + PAD * 2);

  useLayoutEffect(() => {
    const sc = scrollRef.current;
    const ro = new ResizeObserver(() => setScroll((s) => ({ ...s, w: sc.clientWidth, h: sc.clientHeight })));
    ro.observe(sc);
    return () => ro.disconnect();
  }, []);

  const xToTime = useCallback((clientX) => {
    const r = contentRef.current.getBoundingClientRect();
    return Math.max(0, (clientX - r.left - PAD) / zoom);
  }, [zoom]);
  const yToRow = (clientY) => {
    const r = contentRef.current.getBoundingClientRect();
    const y = clientY - r.top;
    if (y < RULER + topZone) return { zone: 'top', y };
    const row = rows.find((rw) => y >= rw.top && y < rw.top + rw.h);
    if (row) return { row, y };
    return { zone: 'bottom', y };
  };

  const snapPoints = (excludeId) => {
    const pts = [0, S().time];
    for (const t of project.tracks) for (const c of t.clips) if (c.id !== excludeId) pts.push(c.start, c.start + c.duration);
    return pts;
  };
  const snapTo = (t, pts) => {
    if (!snapping) return { t, line: null };
    let best = null, bd = 8 / zoom;
    for (const p of pts) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
    return best === null ? { t, line: null } : { t: best, line: best };
  };

  const mainInsertIndex = (t, excludeId) => {
    const main = mainTrack(project);
    const list = main.clips.filter((c) => c.id !== excludeId);
    let acc = 0;
    for (let i = 0; i < list.length; i++) {
      if (t < acc + list[i].duration / 2) return { index: i, x: acc };
      acc += list[i].duration;
    }
    return { index: list.length, x: acc };
  };

  // ---------- Rolagem e zoom ----------
  const onWheel = (e) => {
    const sc = scrollRef.current;
    if (e.ctrlKey) {
      e.preventDefault();
      const r = sc.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const t = (sc.scrollLeft + mx - PAD) / zoom;
      const nz = Math.max(2, Math.min(600, zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
      useStore.setState({ zoom: nz });
      requestAnimationFrame(() => { sc.scrollLeft = Math.max(0, t * nz + PAD - mx); });
    } else if (!e.shiftKey && sc.scrollHeight <= sc.clientHeight + 2) {
      sc.scrollLeft += e.deltaY;
    }
  };
  useEffect(() => {
    const sc = scrollRef.current;
    const h = (e) => onWheel(e);
    sc.addEventListener('wheel', h, { passive: false });
    return () => sc.removeEventListener('wheel', h);
  });

  // ---------- Arrastar o cursor (régua / knob / área vazia) ----------
  const scrub = useCallback((e) => {
    const s = S();
    s.pause();
    s.setTime(xToTime(e.clientX));
    const move = (ev) => S().setTime(xToTime(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [xToTime]);
  useEffect(() => {
    const h = (ev) => scrub(ev.detail);
    window.addEventListener('tl-scrub', h);
    return () => window.removeEventListener('tl-scrub', h);
  }, [scrub]);
  // Shift+arrastar na régua: marca o trecho que vai se repetir (loop) e já liga
  const marcarLoop = (e) => {
    const s = S();
    s.pause();
    const a = xToTime(e.clientX);
    const move = (ev) => S().setLoop(a, xToTime(ev.clientX), true);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ---------- Área vazia: clique leva o cursor; arrastar desenha um retângulo de seleção ----------
  const startMarquee = (e) => {
    const r0 = contentRef.current.getBoundingClientRect();
    const x0 = e.clientX - r0.left, y0 = e.clientY - r0.top;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const base = additive ? selIds(S().selection) : [];
    let active = false;
    const move = (ev) => {
      const r = contentRef.current.getBoundingClientRect();
      const x1 = ev.clientX - r.left, y1 = ev.clientY - r.top;
      if (!active && Math.hypot(x1 - x0, y1 - y0) < 5) return;
      active = true;
      const box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      setMarquee(box);
      const ta = (box.x - PAD) / zoom, tb = (box.x + box.w - PAD) / zoom;
      const hit = [];
      for (const rw of rows) {
        if (rw.track.locked || rw.top + rw.h < box.y || rw.top > box.y + box.h) continue;
        for (const c of rw.track.clips) if (c.start < tb && c.start + c.duration > ta) hit.push(c.id);
      }
      S().selectMany([...base, ...hit]);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setMarquee(null);
      if (!active) {
        if (!additive) S().select(null);
        S().pause();
        S().setTime(xToTime(ev.clientX));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ---------- Arrastar / aparar clipes ----------
  const onClipDown = (e, clip, track, mode) => {
    if (e.button === 2) return;
    e.stopPropagation();
    const s = S();
    // Ctrl/Shift + clique: inclui ou tira o clipe da seleção
    if (mode === 'move' && (e.ctrlKey || e.metaKey || e.shiftKey)) { s.toggleSelect(clip.id); return; }
    const groupIds = selIds(s.selection);
    const inGroup = mode === 'move' && groupIds.length > 1 && groupIds.includes(clip.id) && !track.main;
    if (!inGroup) s.select({ type: 'clip', id: clip.id });
    if (track.locked) return;
    const startX = e.clientX, startY = e.clientY;
    const orig = { start: clip.start, in: clip.in || 0, duration: clip.duration, speed: clip.speed || 1, kf: clip.kf };
    const media = mediaMap[clip.mediaId];
    const pts = snapPoints(clip.id);
    // vizinhos na mesma faixa: puxar a borda não pode invadir o clipe ao lado
    const others = track.main ? [] : track.clips.filter((x) => x.id !== clip.id);
    const nextStart = Math.min(Infinity, ...others.filter((x) => x.start >= orig.start + orig.duration - 1e-3).map((x) => x.start));
    const prevEnd = Math.max(-Infinity, ...others.filter((x) => x.start + x.duration <= orig.start + 1e-3).map((x) => x.start + x.duration));
    let moved = false;
    let result = null;

    const move = (ev) => {
      const dxPx = ev.clientX - startX;
      if (!moved && Math.abs(dxPx) < 3 && Math.abs(ev.clientY - startY) < 3) return;
      if (!moved) { moved = true; if (mode !== 'move') s.checkpoint(); s.pause(); }
      const dt = dxPx / zoom;
      if (inGroup) {
        // vários clipes: todos andam juntos no tempo, cada um na sua faixa
        const minStart = Math.min(...groupIds.map((id) => findClip(project, id)).filter((f) => f && !f.track.main).map((f) => f.clip.start));
        let t = Math.max(orig.start - minStart, orig.start + dt);
        const sn = snapTo(t, pts);
        if (sn.line !== null) t = Math.max(orig.start - minStart, sn.t);
        setSnapLine(sn.line);
        result = { group: true, dt: t - orig.start };
        setGroupDx((t - orig.start) * zoom);
        return;
      }
      if (mode === 'trim-r') {
        const maxD = maxDurationFor({ ...clip, in: orig.in }, media);
        let end = orig.start + orig.duration + dt;
        const sn = snapTo(end, pts);
        end = sn.t;
        const d = Math.max(MIN_CLIP, Math.min(maxD, end - orig.start, nextStart - orig.start));
        setSnapLine(sn.line);
        S().setClipTiming(clip.id, { duration: d });
        const row = rows.find((r) => r.track.id === track.id);
        const isMedia = clip.type === 'video' || clip.type === 'audio';
        setTrimTip({ x: (S().project.tracks.flatMap((t) => t.clips).find((x) => x.id === clip.id)?.start ?? orig.start) * zoom + PAD + d * zoom, y: (row?.top ?? 0) - 2,
          text: `Duração ${fmtPrec(d)}${isMedia ? ` · fim no arquivo ${fmtPrec(orig.in + d * orig.speed)}` : ''}` });
      } else if (mode === 'trim-l') {
        const isMedia = clip.type === 'video' || clip.type === 'audio';
        let newStart = orig.start + dt;
        const sn = track.main ? { t: newStart, line: null } : snapTo(newStart, pts);
        newStart = sn.t;
        let delta = newStart - orig.start;
        if (isMedia) delta = Math.max(delta, -orig.in / orig.speed);
        if (!track.main) delta = Math.max(delta, -orig.start);
        if (isFinite(prevEnd)) delta = Math.max(delta, prevEnd - orig.start);
        delta = Math.min(delta, orig.duration - MIN_CLIP);
        setSnapLine(sn.line);
        S().setClipTiming(clip.id, {
          start: track.main ? undefined : orig.start + delta,
          in: isMedia ? orig.in + delta * orig.speed : undefined,
          duration: orig.duration - delta,
          // os pontos de modificação acompanham o conteúdo (o início do clipe mudou)
          kf: orig.kf ? sliceKf(orig.kf, delta, orig.duration) || null : undefined,
        });
        const row = rows.find((r) => r.track.id === track.id);
        const cs = track.main ? orig.start : orig.start + delta;
        setTrimTip({ x: cs * zoom + PAD, y: (row?.top ?? 0) - 2,
          text: `Duração ${fmtPrec(orig.duration - delta)}${isMedia ? ` · início no arquivo ${fmtPrec(orig.in + delta * orig.speed)}` : ''}` });
      } else {
        // mover: fantasma que segue o ponteiro
        const hit = yToRow(ev.clientY);
        let t = Math.max(0, orig.start + dt);
        const snS = snapTo(t, pts), snE = snapTo(t + orig.duration, pts);
        let line = null;
        if (snS.line !== null && (snE.line === null || Math.abs(snS.t - t) <= Math.abs(snE.t - (t + orig.duration)))) { t = snS.t; line = snS.line; }
        else if (snE.line !== null) { t = snE.t - orig.duration; line = snE.line; }
        const kind = kindFor(clip);
        const visualMedia = clip.type === 'video' || clip.type === 'image';
        let target = null;
        if (hit.row?.track.main && visualMedia) {
          const ins = mainInsertIndex(xToTime(ev.clientX), clip.id);
          target = { type: 'main', index: ins.index, x: ins.x, rowTop: hit.row.top, h: hit.row.h };
          line = null;
        } else if (hit.row && !hit.row.track.main && hit.row.track.kind === (track.main ? 'overlay' : kind)) {
          target = { type: 'track', trackId: hit.row.track.id, rowTop: hit.row.top, h: hit.row.h };
        } else if (hit.zone === 'top' && kind !== 'audio') {
          target = { type: 'new-top', rowTop: RULER + topZone - 26, h: 26 };
        } else if (hit.zone === 'bottom' && kind === 'audio') {
          const lastRow = rows[rows.length - 1];
          target = { type: 'new-bottom', rowTop: lastRow.top + lastRow.h + 2, h: 26 };
        } else if (track.main) {
          const mr = rows.find((r) => r.track.main);
          const ins = mainInsertIndex(xToTime(ev.clientX), clip.id);
          target = { type: 'main', index: ins.index, x: ins.x, rowTop: mr.top, h: mr.h };
          line = null;
        } else {
          const own = rows.find((r) => r.track.id === track.id);
          target = { type: 'track', trackId: track.id, rowTop: own.top, h: own.h };
        }
        result = { t, target };
        setSnapLine(line);
        setGhost({
          clipId: clip.id, cls: clipClass(clip, track), label: clipLabel(clip, media),
          x: (target.type === 'main' ? Math.max(0, orig.start + dt) : t) * zoom + PAD,
          w: orig.duration * zoom, top: target.rowTop + 3, h: target.h - 6,
          insertX: target.type === 'main' ? target.x * zoom + PAD : null,
          insertTop: target.rowTop, insertH: target.h,
        });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setSnapLine(null);
      setGhost(null);
      setTrimTip(null);
      setGroupDx(null);
      if (!moved) { if (inGroup) S().select({ type: 'clip', id: clip.id }); return; }
      if (mode !== 'move') { S().commit(() => {}, { silent: true }); return; }
      if (!result) return;
      if (result.group) { if (Math.abs(result.dt) > 1e-6) S().moveGroup(groupIds, result.dt); return; }
      const { t, target } = result;
      S().commit((p) => {
        const f = findClip(p, clip.id);
        if (!f) return false;
        const c = f.clip;
        const fromMain = !!f.track.main;
        if (target.type === 'main') {
          f.track.clips.splice(f.index, 1);
          const main = mainTrack(p);
          if (!fromMain) { c.transform.scale = 1; c.transform.x = 0; c.transform.y = 0; }
          main.clips.splice(Math.min(target.index, main.clips.length), 0, c);
          return;
        }
        f.track.clips.splice(f.index, 1);
        c.start = t;
        if (fromMain) { c.transition = null; if ((c.transform.scale ?? 1) === 1) c.transform.scale = 0.6; }
        if (target.type === 'track') placeInTrack(p, c, target.trackId);
        else if (target.type === 'new-top') placeInTrack(p, c, null, 0);
        else if (target.type === 'new-bottom') placeInTrack(p, c, null, p.tracks.length);
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ---------- Soltar itens da biblioteca / arquivos ----------
  const dropTarget = (e) => {
    const item = dnd.item;
    const hit = yToRow(e.clientY);
    const t = xToTime(e.clientX);
    return { item, hit, t };
  };
  const onDragOver = (e) => {
    const files = [...(e.dataTransfer?.types || [])].includes('Files');
    if (!dnd.item && !files) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const { item, hit, t } = dropTarget(e);
    const main = mainTrack(project);
    if (item?.kind === 'transition') {
      setDropHint(null);
      return;
    }
    const isMainDrop = (files || item?.kind === 'media') && (hit.row?.track.main || (!main.clips.length && !hit.row));
    if (isMainDrop) {
      const mr = rows.find((r) => r.track.main);
      const ins = mainInsertIndex(t);
      setDropHint({ insertX: ins.x * zoom + PAD, top: mr.top, h: mr.h });
    } else if (hit.row) setDropHint({ rowTop: hit.row.top, h: hit.row.h, x: t * zoom + PAD });
    else setDropHint({ rowTop: hit.zone === 'top' ? RULER + topZone - 30 : rows[rows.length - 1].top + rows[rows.length - 1].h, h: 30, x: t * zoom + PAD });
  };
  const onDragLeave = (e) => { if (!contentRef.current.contains(e.relatedTarget)) setDropHint(null); };
  const onDrop = async (e) => {
    setDropHint(null);
    const files = [...(e.dataTransfer?.files || [])];
    const { item, hit, t } = dropTarget(e);
    if (!item && !files.length) return;
    e.preventDefault();
    e.nativeEvent.__timelineHandled = true;
    const s = S();
    const sn = snapTo(t, snapPoints(null)).t;
    const rowTrack = hit.row?.track;
    const opts = (kind) => {
      if (rowTrack && !rowTrack.main && rowTrack.kind === kind) return { time: sn, trackId: rowTrack.id };
      if (hit.zone === 'top' && kind !== 'audio') return { time: sn, newTrackPos: 0 };
      return { time: sn };
    };
    const addMediaAt = (mid) => {
      const m = S().project.media.find((x) => x.id === mid);
      if (!m) return;
      if (m.type === 'audio') { s.addMedia(mid, { target: 'audio', ...opts('audio') }); return; }
      if (rowTrack?.main || (!rowTrack && hit.zone !== 'top') || rowTrack?.kind === 'audio') {
        s.addMedia(mid, { target: 'main', index: mainInsertIndex(t).index });
      } else s.addMedia(mid, { target: 'overlay', ...opts('overlay') });
    };
    if (files.length) {
      const paths = files.map((f) => window.api.pathForFile(f)).filter((p) => p && !p.toLowerCase().endsWith('.mcut'));
      const ids = await s.importPaths(paths);
      for (const id of ids) addMediaAt(id);
      return;
    }
    switch (item.kind) {
      case 'media': {
        const ids = item.ids?.length ? item.ids : [item.id];
        if (ids.length === 1) { addMediaAt(ids[0]); break; }
        // vários itens da biblioteca: um depois do outro, na ordem da seleção
        const toMain = rowTrack?.main || (!rowTrack && hit.zone !== 'top') || rowTrack?.kind === 'audio';
        let idx = mainInsertIndex(t).index, at = sn;
        for (const mid of ids) {
          const m = S().project.media.find((x) => x.id === mid);
          if (!m) continue;
          let cid;
          if (m.type === 'audio') cid = s.addMedia(mid, { target: 'audio', time: at });
          else if (toMain) cid = s.addMedia(mid, { target: 'main', index: idx++ });
          else cid = s.addMedia(mid, { target: 'overlay', time: at });
          const c = cid && S().project.tracks.flatMap((tr) => tr.clips).find((x) => x.id === cid);
          if (c && (m.type === 'audio' || !toMain)) at = c.start + c.duration;
        }
        break;
      }
      case 'sfx': s.addSfx(item.id, opts('audio')); break;
      case 'usersfx': s.addUserSfx(item.path, opts('audio')); break;
      case 'text': s.addText(item.preset, opts('text')); break;
      case 'sticker': s.addSticker(item.emoji, opts('text')); break;
      case 'shape': s.addShape(item.id, opts('text')); break;
      case 'effect': s.addEffect('effect', item.id, opts('effect')); break;
      case 'filter': {
        const target = rowTrack?.clips.find((c) => sn >= c.start && sn < c.start + c.duration && (c.type === 'video' || c.type === 'image'));
        if (target) s.applyFilter(target.id, item.id);
        else s.addEffect('filter', item.id, opts('effect'));
        break;
      }
      case 'transition': {
        // solta numa faixa de cima: junção entre dois clipes encostados dessa faixa
        if (rowTrack && !rowTrack.main) {
          let best = null, bd = Infinity;
          for (const c of rowTrack.clips) {
            const nx = nextAdjacent(rowTrack, c);
            if (!nx) continue;
            const d = Math.abs(nx.start - t);
            if (d < bd) { bd = d; best = c.id; }
          }
          if (best && bd * zoom < 120) s.setTransition(best, item.id);
          else s.toastMsg('Nas faixas de cima, encoste dois clipes (um logo depois do outro) e solte a transição na junção.', 'info', 5000);
          break;
        }
        const main = mainTrack(project);
        let best = null, bd = Infinity;
        main.clips.forEach((c, i) => {
          if (i >= main.clips.length - 1) return;
          const d = Math.abs(c.start + c.duration - t);
          if (d < bd) { bd = d; best = c.id; }
        });
        if (best && bd * zoom < 120) s.setTransition(best, item.id);
        else s.toastMsg('Solte a transição sobre a junção entre dois clipes.');
        break;
      }
      default: break;
    }
  };

  // ---------- Ações da barra ----------
  const selClip = sel?.type === 'clip' ? findClip(project, sel.id) : null;
  const zoomFit = () => {
    const w = scrollRef.current.clientWidth - 60;
    useStore.setState({ zoom: Math.max(2, Math.min(600, w / Math.max(duration, 5))) });
    scrollRef.current.scrollLeft = 0;
  };
  const zl = Math.log(zoom);

  const mainRow = rows.find((r) => r.track.main);
  const mainEmpty = !mainTrack(project).clips.length;

  return (
    <div className="timeline" style={{ height }}>
      <div className="tl-toolbar">
        <button className="icon-btn" title="Desfazer (Ctrl+Z)" disabled={!canUndo} onClick={() => S().undo()}><Undo2 size={16} /></button>
        <button className="icon-btn" title="Refazer (Ctrl+Y)" disabled={!canRedo} onClick={() => S().redo()}><Redo2 size={16} /></button>
        <span className="sep" />
        <button className="icon-btn" title="Dividir no cursor (Ctrl+B)" onClick={() => S().splitAt()}><Scissors size={16} /></button>
        <button className="icon-btn" title="Excluir (Delete)" disabled={!sel} onClick={() => S().deleteSelection()}><Trash2 size={16} /></button>
        <button className="icon-btn" title="Duplicar (Ctrl+D)" disabled={!selClip} onClick={() => S().duplicateSelection()}><CopyPlus size={16} /></button>
        <span className="sep" />
        <button className="icon-btn" title="Separar áudio" disabled={selClip?.clip.type !== 'video'} onClick={() => S().extractAudio(selClip.clip.id)}><AudioLines size={16} /></button>
        <button className="icon-btn" title="Espelhar" disabled={!(selClip && (selClip.clip.type === 'video' || selClip.clip.type === 'image'))}
          onClick={() => S().updateClip(selClip.clip.id, (c) => { c.transform.flipH = !c.transform.flipH; })}><FlipHorizontal2 size={16} /></button>
        <button className="icon-btn" title="Girar 90°" disabled={!(selClip && selClip.clip.type !== 'audio' && selClip.clip.type !== 'effect')}
          onClick={() => S().updateClip(selClip.clip.id, (c) => { c.transform.rotation = ((((c.transform.rotation || 0) + 90) + 180) % 360) - 180; })}><RotateCw size={16} /></button>
        <span className="sep" />
        <button className="icon-btn" title="Ponto de modificação anterior" disabled={!selClip?.clip.kf} onClick={() => S().jumpKeyframe(-1)}><ChevronLeft size={15} /></button>
        <button className="icon-btn kf-main" title="Adicionar/remover ponto de modificação no cursor (K)" disabled={!selClip || selClip.clip.type === 'effect'}
          onClick={() => S().toggleKeyframes()}><DiamondPlus size={16} /></button>
        <button className="icon-btn" title="Próximo ponto de modificação" disabled={!selClip?.clip.kf} onClick={() => S().jumpKeyframe(1)}><ChevronRight size={15} /></button>
        <span className="sep" />
        <button className={`icon-btn ${loopOn ? 'active' : ''}`} title={loopOn ? 'Repetindo o trecho — clique para desligar' : 'Repetir um trecho em loop (usa os clipes selecionados; ou Shift+arrastar na régua)'}
          onClick={() => S().toggleLoop()}><Repeat size={16} /></button>
        <div className="grow" />
        <span className="timecode" style={{ marginRight: 10 }}>{fmtTime(duration, fps, true)}</span>
        <button className={`icon-btn ${snapping ? 'active' : ''}`} title="Ímã (encaixar nas bordas)" onClick={() => useStore.setState({ snapping: !snapping })}><Magnet size={16} /></button>
        <span className="sep" />
        <button className="icon-btn" title="Afastar" onClick={() => useStore.setState({ zoom: Math.max(2, zoom / 1.3) })}><ZoomOut size={16} /></button>
        <input type="range" min={Math.log(2)} max={Math.log(600)} step={0.01} value={zl}
          style={{ '--p': `${((zl - Math.log(2)) / (Math.log(600) - Math.log(2))) * 100}%` }}
          onChange={(e) => useStore.setState({ zoom: Math.exp(parseFloat(e.target.value)) })} />
        <button className="icon-btn" title="Aproximar" onClick={() => useStore.setState({ zoom: Math.min(600, zoom * 1.3) })}><ZoomIn size={16} /></button>
        <button className="icon-btn" title="Ajustar à janela" onClick={zoomFit}><MoveHorizontal size={16} /></button>
      </div>
      <div className="tl-main">
        <div className="tl-heads">
          <div className="tl-heads-inner" style={{ top: -scroll.top }}>
            <div style={{ height: RULER + topZone }} />
            {rows.map(({ track, h }) => {
              const I = KIND_ICON[track.kind] || Film;
              const visual = track.kind !== 'audio';
              const audible = track.kind === 'audio' || track.kind === 'video' || track.kind === 'overlay';
              return (
                <div key={track.id} className={`track-head ${track.main ? 'main' : ''}`} style={{ height: h }}>
                  <span className="ico" title={track.main ? 'Faixa principal' : ''}><I size={14} /></span>
                  <button className="icon-btn sm" title={track.locked ? 'Destravar' : 'Travar'} onClick={() => S().updateTrack(track.id, { locked: !track.locked })}>
                    {track.locked ? <Lock size={12} color="#ffb74d" /> : <LockOpen size={12} />}
                  </button>
                  {visual && (
                    <button className="icon-btn sm" title={track.hidden ? 'Mostrar' : 'Ocultar'} onClick={() => S().updateTrack(track.id, { hidden: !track.hidden })}>
                      {track.hidden ? <EyeOff size={12} color="#ff8b8b" /> : <Eye size={12} />}
                    </button>
                  )}
                  {audible && (
                    <button className="icon-btn sm" title={track.muted ? 'Ativar som' : 'Silenciar faixa'} onClick={() => S().updateTrack(track.id, { muted: !track.muted })}>
                      {track.muted ? <VolumeX size={12} color="#ff8b8b" /> : <Volume2 size={12} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="tl-scroll" ref={scrollRef}
          onScroll={(e) => { const { scrollLeft, scrollTop } = e.currentTarget; setScroll((s) => ({ ...s, left: scrollLeft, top: scrollTop })); }}>
          <div className="tl-content" ref={contentRef} style={{ width: contentW, height: contentH }}
            onPointerDown={(e) => { if (e.button === 0) startMarquee(e); }}
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
            <Ruler zoom={zoom} scrollLeft={scroll.left} width={scroll.w} fps={fps} onScrub={(e) => { e.stopPropagation(); if (e.shiftKey) marcarLoop(e); else scrub(e); }} />
            {rows.map(({ track, top, h }) => (
              <div key={track.id} className={`track-row ${track.main ? 'main' : ''}`} style={{ position: 'absolute', left: 0, right: 0, top, height: h, opacity: track.hidden ? 0.45 : 1 }}>
                {track.clips.map((c, i) => {
                  const media = mediaMap[c.mediaId];
                  const mt = media ? meta[media.id] : null;
                  const x = c.start * zoom + PAD;
                  const w = Math.max(4, c.duration * zoom);
                  const selected = selSet.has(c.id);
                  const shifted = groupDx !== null && selected && !track.main;
                  const prev = track.main ? track.clips[i - 1] : null;
                  const overlapPx = prev ? transitionDuration(prev, c) * zoom : 0;
                  const ch = h - 6;
                  const showWave = mt?.waveform && (c.type === 'audio' || (c.type === 'video' && media?.hasAudio && !c.muted));
                  const waveH = c.type === 'audio' ? ch - 14 : Math.min(16, ch * 0.3);
                  return (
                    <div key={c.id} data-id={c.id}
                      className={`clip ${clipClass(c, track)} ${selected ? 'selected' : ''} ${mt?.status === 'missing' ? 'missing' : ''} ${ghost?.clipId === c.id || shifted ? 'dragging' : ''}`}
                      style={{ left: x, width: w, opacity: ghost?.clipId === c.id ? 0.35 : 1, transform: shifted ? `translateX(${groupDx}px)` : undefined }}
                      onPointerDown={(e) => onClipDown(e, c, track, 'move')}
                      onDoubleClick={() => { if (c.type === 'text') window.dispatchEvent(new Event('focus-text-editor')); }}
                      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!selSet.has(c.id)) S().select({ type: 'clip', id: c.id }); setMenu({ x: e.clientX, y: e.clientY, clip: c, track }); }}>
                      {(c.type === 'video' || c.type === 'image') && <Thumbs clip={c} media={media} meta={mt} width={w} height={ch} zoom={zoom} />}
                      {showWave && <Wave path={mt.waveform} clip={c} width={w} height={waveH} viewL={scroll.left - x} viewW={scroll.w} color={c.type === 'audio' ? '#8af5c6' : '#ffffffaa'} />}
                      <div className="clabel">
                        {c.type === 'effect' && (c.effect.kind === 'filter' ? <Palette size={11} /> : <Sparkles size={11} />)}
                        {c.type === 'text' && !c.sticker && <Type size={11} />}
                        {c.reverse && <span className="speed-tag" title="De trás para frente">◀◀</span>}
                        {(c.speed || 1) !== 1 && <span className="speed-tag">{(c.speed).toFixed(2)}x</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{clipLabel(c, media)}</span>
                        {w > 120 && <span className="dur">{fmtTime(c.duration, fps, false)}</span>}
                      </div>
                      {c.kf && kfTimes(c).map((kt) => (
                        <div key={kt} className={`kf-dot ${selected ? 'sel' : ''} ${kfDrag?.clipId === c.id && Math.abs(kfDrag.t - kt) < 1e-6 ? 'drag' : ''}`} style={{ left: kt * zoom }}
                          title="Ponto de modificação — clique para ir até ele, arraste para mudar o momento, botão direito para apagar"
                          onPointerDown={(e) => dragKf(e, c, kt)}
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); S().updateClip(c.id, (d) => { removeKfTime(d, kt); }); }} />
                      ))}
                      {kfDrag?.clipId === c.id && <div className="kf-tip" style={{ left: kfDrag.t * zoom }}>{fmtTime(c.start + kfDrag.t, fps, false)}</div>}
                      {c.fadeIn > 0 && <div className="fade" style={{ left: 0, width: c.fadeIn * zoom }} />}
                      {c.fadeOut > 0 && <div className="fade out" style={{ right: 0, width: c.fadeOut * zoom }} />}
                      {overlapPx > 0 && <div className="overlap" style={{ left: 0, width: overlapPx }} />}
                      {!track.locked && <>
                        <div className="handle l" onPointerDown={(e) => onClipDown(e, c, track, 'trim-l')} />
                        <div className="handle r" onPointerDown={(e) => onClipDown(e, c, track, 'trim-r')} />
                      </>}
                    </div>
                  );
                })}
                {!track.main && (track.kind === 'overlay' || track.kind === 'text') && track.clips.map((c) => {
                  // faixas de cima: botão de transição entre dois clipes encostados
                  const nx = nextAdjacent(track, c);
                  if (!nx) return null;
                  const d = overlayTransDur(c, nx);
                  const has = d > 0;
                  const selected = sel?.type === 'transition' && sel.id === c.id;
                  return (
                    <React.Fragment key={`otr${c.id}`}>
                      {has && <div className="tr-zone" style={{ left: (nx.start - d / 2) * zoom + PAD, width: d * zoom }} />}
                      <button data-tr={c.id} className={`trans-btn ${has ? '' : 'empty'} ${selected ? 'selected' : ''}`} style={{ left: nx.start * zoom + PAD }}
                        title={has ? 'Transição (clique para editar)' : 'Adicionar transição'}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (has) S().select({ type: 'transition', id: c.id });
                          else S().setTransition(c.id, 'fade', 0.6);
                        }}>
                        <ArrowLeftRight size={12} />
                      </button>
                    </React.Fragment>
                  );
                })}
                {track.main && track.clips.map((c, i) => {
                  if (i >= track.clips.length - 1) return null;
                  const next = track.clips[i + 1];
                  const ov = transitionDuration(c, next);
                  const x = (next.start + ov / 2) * zoom + PAD;
                  const has = !!(c.transition && c.transition.id);
                  const selected = sel?.type === 'transition' && sel.id === c.id;
                  return (
                    <button key={`tr${c.id}`} data-tr={c.id} className={`trans-btn ${has ? '' : 'empty'} ${selected ? 'selected' : ''}`} style={{ left: x }}
                      title={has ? 'Transição (clique para editar)' : 'Adicionar transição'}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (has) S().select({ type: 'transition', id: c.id });
                        else S().setTransition(c.id, 'fade', 0.6);
                      }}>
                      <ArrowLeftRight size={12} />
                    </button>
                  );
                })}
              </div>
            ))}
            {mainEmpty && mainRow && (
              <div style={{ position: 'absolute', left: PAD, top: mainRow.top + 8, height: mainRow.h - 16, right: 20, border: '1.5px dashed #3a3a40', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: 'var(--faint)', pointerEvents: 'none' }}>
                <Film size={16} /> Arraste mídias para cá
              </div>
            )}
            {ghost && (
              <>
                <div className={`clip ${ghost.cls} dragging`} style={{ left: ghost.x, width: ghost.w, top: ghost.top, height: ghost.h, bottom: 'auto', pointerEvents: 'none' }}>
                  <div className="clabel">{ghost.label}</div>
                </div>
                {ghost.insertX !== null && <div className="insert-line" style={{ left: ghost.insertX - 1, top: ghost.insertTop, height: ghost.insertH }} />}
              </>
            )}
            {dropHint && (dropHint.insertX !== undefined
              ? <div className="insert-line" style={{ left: dropHint.insertX - 1, top: dropHint.top, height: dropHint.h }} />
              : <div className="marquee" style={{ left: 0, right: 0, top: dropHint.rowTop, height: dropHint.h }} />)}
            {marquee && <div className="sel-box" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
            {snapLine !== null && <div className="snapline" style={{ left: snapLine * zoom + PAD }} />}
            {trimTip && <div className="trim-tip" style={{ left: trimTip.x, top: trimTip.y }}>{trimTip.text}</div>}
            <Playhead zoom={zoom} scrollRef={scrollRef} follow />
          </div>
        </div>
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <MenuItem icon={<Scissors size={14} />} label="Dividir no cursor" kbd="Ctrl+B" onClick={() => S().splitAt()} />
          <MenuItem icon={<CopyPlus size={14} />} label="Duplicar" kbd="Ctrl+D" onClick={() => S().duplicateSelection()} />
          <MenuItem icon={<Copy size={14} />} label="Copiar" kbd="Ctrl+C" onClick={() => S().copySelection()} />
          <MenuItem icon={<Clipboard size={14} />} label="Colar no cursor" kbd="Ctrl+V" disabled={!S().clipboard} onClick={() => S().paste()} />
          {menu.clip.type === 'video' && mediaMap[menu.clip.mediaId]?.hasAudio && <>
            <div className="dd-sep" />
            <MenuItem icon={<AudioLines size={14} />} label="Separar áudio" onClick={() => S().extractAudio(menu.clip.id)} />
          </>}
          {(menu.clip.type === 'video' || menu.clip.type === 'audio') && <>
            <MenuItem icon={menu.clip.muted ? <Volume2 size={14} /> : <VolumeX size={14} />} label={menu.clip.muted ? 'Ativar som' : 'Silenciar'} onClick={() => S().updateClip(menu.clip.id, { muted: !menu.clip.muted })} />
            <MenuItem icon={<Rewind size={14} />} on={!!menu.clip.reverse} label={menu.clip.reverse ? 'Tocar normal (desfazer reverso)' : 'Reverter (de trás para frente)'} onClick={() => S().toggleReverse(menu.clip.id)} />
          </>}
          <div className="dd-sep" />
          <MenuItem icon={<Trash2 size={14} />} label="Excluir" kbd="Delete" onClick={() => S().deleteSelection()} />
        </ContextMenu>
      )}
    </div>
  );
}
