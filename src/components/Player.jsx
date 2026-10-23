import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Play, Pause, Maximize, Minimize, ChevronDown, Clapperboard, SkipBack, SkipForward, Rewind, FastForward, Volume2, VolumeX } from 'lucide-react';
import { useStore } from '../store.js';
import { engine } from '../engine/index.js';
import { clipBox } from '../engine/compositor.js';
import { RATIOS, sizeFromMedia } from '../shared/defs.js';
import { fmtTime, projectDuration, mainTrack, findClip } from '../shared/timeline.js';
import { Dropdown, MenuItem } from './ui.jsx';
import { resolveAt, setPropAt } from '../shared/keyframes.js';
import LibPreview from './LibPreview.jsx';

function useMediaMap(project) {
  const ref = useRef({ media: null, map: {} });
  if (ref.current.media !== project.media) {
    const map = {};
    for (const m of project.media) map[m.id] = m;
    ref.current = { media: project.media, map };
  }
  return ref.current.map;
}

function visibleClipsTopFirst(project, t) {
  const out = [];
  const main = mainTrack(project);
  const mi = main ? project.tracks.indexOf(main) : project.tracks.length;
  for (let i = 0; i < mi; i++) {
    const tr = project.tracks[i];
    if (tr.hidden || tr.locked) continue;
    for (const c of tr.clips) if (c.type !== 'effect' && t >= c.start && t < c.start + c.duration) out.push(c);
  }
  if (main && !main.hidden && !main.locked) {
    const act = main.clips.filter((c) => t >= c.start && t < c.start + c.duration);
    if (act.length) out.push(act[act.length - 1]);
  }
  return out;
}

function inBox(b, x, y) {
  const r = (-b.rot * Math.PI) / 180;
  const dx = x - b.cx, dy = y - b.cy;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2;
}

function TransformOverlay({ W, H }) {
  const project = useStore((s) => s.project);
  const time = useStore((s) => s.time);
  const sel = useStore((s) => s.selection);
  const playing = useStore((s) => s.playing);
  const mediaMap = useMediaMap(project);
  const [guides, setGuides] = useState({ x: false, y: false, angle: null });
  const svgRef = useRef(null);

  const found = sel?.type === 'clip' ? findClip(project, sel.id) : null;
  const clip = found?.clip;
  const visible = clip && clip.type !== 'effect' && clip.type !== 'audio' && !found.track.hidden && time >= clip.start && time < clip.start + clip.duration;
  const box = visible ? clipBox(project, mediaMap, resolveAt(clip, time - clip.start), W, H) : null;

  const local = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const beginGesture = (e, mode, target, b0) => {
    e.stopPropagation();
    e.preventDefault();
    const s = useStore.getState();
    s.pause();
    const p0 = local(e);
    // com pontos de modificação, mexer no reprodutor cria/atualiza o ponto no instante da agulha
    const lt = Math.max(0, Math.min(target.duration, s.time - target.start));
    const tf0 = { ...(resolveAt(target, lt).transform || {}) };
    let moved = false;
    const move = (ev) => {
      const p = local(ev);
      if (!moved) { s.checkpoint(); moved = true; }
      if (mode === 'move') {
        let nx = (tf0.x || 0) + (p.x - p0.x) / W;
        let ny = (tf0.y || 0) + (p.y - p0.y) / H;
        const gx = Math.abs(nx * W) < 6, gy = Math.abs(ny * H) < 6;
        if (gx) nx = 0;
        if (gy) ny = 0;
        setGuides({ x: gx, y: gy, angle: null });
        s.updateClip(target.id, (c) => { setPropAt(c, 'x', nx, lt); setPropAt(c, 'y', ny, lt); }, { silent: true });
      } else if (mode === 'scale') {
        const d0 = Math.hypot(p0.x - b0.cx, p0.y - b0.cy) || 1;
        const d1 = Math.hypot(p.x - b0.cx, p.y - b0.cy);
        const ns = Math.max(0.02, Math.min(20, (tf0.scale ?? 1) * (d1 / d0)));
        s.updateClip(target.id, (c) => { setPropAt(c, 'scale', ns, lt); }, { silent: true });
      } else if (mode === 'scale-x') {
        const rad = (b0.rot * Math.PI) / 180;
        const d0 = Math.max(4, Math.abs((p0.x - b0.cx) * Math.cos(rad) + (p0.y - b0.cy) * Math.sin(rad)));
        const d1 = Math.abs((p.x - b0.cx) * Math.cos(rad) + (p.y - b0.cy) * Math.sin(rad));
        const nsx = Math.max(0.01, Math.min(20, (tf0.scaleX ?? 1) * (d1 / d0)));
        s.updateClip(target.id, (c) => { setPropAt(c, 'scaleX', nsx, lt); }, { silent: true });
      } else if (mode === 'scale-y') {
        const rad = (b0.rot * Math.PI) / 180;
        const d0 = Math.max(4, Math.abs(-(p0.x - b0.cx) * Math.sin(rad) + (p0.y - b0.cy) * Math.cos(rad)));
        const d1 = Math.abs(-(p.x - b0.cx) * Math.sin(rad) + (p.y - b0.cy) * Math.cos(rad));
        const nsy = Math.max(0.01, Math.min(20, (tf0.scaleY ?? 1) * (d1 / d0)));
        s.updateClip(target.id, (c) => { setPropAt(c, 'scaleY', nsy, lt); }, { silent: true });
      } else if (mode === 'rotate') {
        const a0 = Math.atan2(p0.y - b0.cy, p0.x - b0.cx);
        const a1 = Math.atan2(p.y - b0.cy, p.x - b0.cx);
        let deg = (tf0.rotation || 0) + ((a1 - a0) * 180) / Math.PI;
        deg = ((deg + 540) % 360) - 180;
        const snap = Math.round(deg / 90) * 90;
        if (Math.abs(deg - snap) < 4) deg = snap;
        setGuides({ x: false, y: false, angle: Math.round(deg) });
        s.updateClip(target.id, (c) => { setPropAt(c, 'rotation', deg, lt); }, { silent: true });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGuides({ x: false, y: false, angle: null });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Clique no reprodutor: seleciona o item de cima e já permite arrastar.
  const onStageDown = (e) => {
    if (e.button !== 0) return;
    const p = local(e);
    const s = useStore.getState();
    for (const c of visibleClipsTopFirst(project, time)) {
      const b = clipBox(project, mediaMap, resolveAt(c, time - c.start), W, H);
      if (b && inBox(b, p.x, p.y)) {
        s.select({ type: 'clip', id: c.id });
        beginGesture(e, 'move', c, b);
        return;
      }
    }
    s.select(null);
  };

  const r = box ? (box.rot * Math.PI) / 180 : 0;
  const corner = (sx, sy) => ({
    x: box.cx + (sx * box.w) / 2 * Math.cos(r) - (sy * box.h) / 2 * Math.sin(r),
    y: box.cy + (sx * box.w) / 2 * Math.sin(r) + (sy * box.h) / 2 * Math.cos(r),
  });

  return (
    <svg ref={svgRef} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', cursor: 'default' }}
      onPointerDown={onStageDown}
      onDoubleClick={() => { if (clip?.type === 'text') window.dispatchEvent(new Event('focus-text-editor')); }}>
      {guides.x && <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="#ff4fd8" strokeDasharray="4 3" />}
      {guides.y && <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#ff4fd8" strokeDasharray="4 3" />}
      {box && !playing && (() => {
        const pts = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
        const sides = [
          { p: corner(-1, 0), mode: 'scale-x', w: 6, h: 16, cursor: 'ew-resize', title: 'Esticar largura (X)' },
          { p: corner(1, 0), mode: 'scale-x', w: 6, h: 16, cursor: 'ew-resize', title: 'Esticar largura (X)' },
          { p: corner(0, -1), mode: 'scale-y', w: 16, h: 6, cursor: 'ns-resize', title: 'Esticar altura (Y)' },
          { p: corner(0, 1), mode: 'scale-y', w: 16, h: 6, cursor: 'ns-resize', title: 'Esticar altura (Y)' },
        ];
        const top = corner(0, -1);
        const rh = { x: top.x + 26 * Math.sin(r), y: top.y - 26 * Math.cos(r) };
        return (
          <g>
            <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="transparent" stroke="#fff" strokeWidth="1.5"
              style={{ cursor: 'move' }} onPointerDown={(e) => beginGesture(e, 'move', clip, box)} />
            <line x1={top.x} y1={top.y} x2={rh.x} y2={rh.y} stroke="#fff" strokeWidth="1.2" />
            {sides.map((s, i) => (
              <rect key={`s${i}`} x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h} rx="3" fill="#fff" stroke="#0006"
                transform={`translate(${s.p.x},${s.p.y}) rotate(${box.rot || 0})`}
                style={{ cursor: s.cursor }} onPointerDown={(e) => beginGesture(e, s.mode, clip, box)}>
                <title>{s.title}</title>
              </rect>
            ))}
            {pts.map((p, i) => (
              <rect key={i} x={p.x - 5} y={p.y - 5} width="10" height="10" rx="2" fill="#fff" stroke="#0006"
                style={{ cursor: i % 2 ? 'nesw-resize' : 'nwse-resize' }} onPointerDown={(e) => beginGesture(e, 'scale', clip, box)} />
            ))}
            <circle cx={rh.x} cy={rh.y} r="6" fill="#fff" stroke="#0006" style={{ cursor: 'grab' }} onPointerDown={(e) => beginGesture(e, 'rotate', clip, box)} />
            {guides.angle !== null && <text x={rh.x + 12} y={rh.y - 8} fill="#fff" fontSize="12" style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: 3 }}>{guides.angle}°</text>}
          </g>
        );
      })()}
    </svg>
  );
}

// Controles da tela cheia (aparecem ao mexer o mouse; somem sozinhos durante a reprodução).
function FullscreenBar({ visible, onExit }) {
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  const project = useStore((s) => s.project);
  const muted = useStore((s) => s.previewMuted);
  const d = projectDuration(project);
  const fps = project.fps || 30;
  const s = useStore.getState;
  return (
    <div className={`fs-bar ${visible ? '' : 'hidden'}`} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <button className="icon-btn" title="Voltar 5 s" onClick={() => s().setTime(Math.max(0, s().time - 5))}><Rewind size={16} /></button>
      <button className="play-btn" title="Reproduzir / pausar (Espaço)" onClick={() => s().togglePlay()}>
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
      <button className="icon-btn" title="Avançar 5 s" onClick={() => s().setTime(s().time + 5)}><FastForward size={16} /></button>
      <input type="range" min={0} max={Math.max(d, 0.01)} step={1 / fps} value={Math.min(time, d)}
        style={{ '--p': `${d ? (Math.min(time, d) / d) * 100 : 0}%` }}
        onPointerDown={() => s().pause()} onChange={(e) => s().setTime(parseFloat(e.target.value))} />
      <span className="tc">{fmtTime(time, fps, false)} / {fmtTime(d, fps, false)}</span>
      <button className="icon-btn" title={muted ? 'Ativar som' : 'Silenciar'} onClick={() => useStore.setState({ previewMuted: !muted })}>
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <button className="icon-btn" title="Sair da tela cheia (Esc)" onClick={onExit}><Minimize size={16} /></button>
    </div>
  );
}

// Conta-gotas do chroma key: o próximo clique no vídeo escolhe a cor a remover.
function ColorPicker({ canvasRef, clipId }) {
  const [hover, setHover] = useState(null);
  const read = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * c.width), y = Math.floor(((e.clientY - r.top) / r.height) * c.height);
    if (x < 0 || y < 0 || x >= c.width || y >= c.height) return null;
    // média 5×5 ao redor do ponto (evita pegar um pixel de ruído)
    const d = c.getContext('2d').getImageData(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5).data;
    let rr = 0, gg = 0, bb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
    const hx = (v) => Math.round(v / n).toString(16).padStart(2, '0');
    return { hex: `#${hx(rr)}${hx(gg)}${hx(bb)}`, x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const cancel = () => useStore.setState({ pickColor: null });
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 15, cursor: 'crosshair' }}
      onMouseMove={(e) => setHover(read(e))} onMouseLeave={() => setHover(null)}
      onPointerDown={(e) => {
        e.stopPropagation();
        const p = read(e);
        if (!p) return;
        useStore.getState().updateClip(clipId, (c) => { c.chroma = { ...(c.chroma || {}), on: true, color: p.hex }; });
        cancel();
      }}>
      <div className="pick-tip">Clique na cor do fundo para remover · Esc cancela</div>
      {hover && <div className="pick-swatch" style={{ left: hover.x + 14, top: hover.y + 14, background: hover.hex }} />}
    </div>
  );
}

function Timecode() {
  const time = useStore((s) => s.time);
  const project = useStore((s) => s.project);
  const fps = project.fps || 30;
  return (
    <div className="timecode"><b>{fmtTime(time, fps, true)}</b> / {fmtTime(projectDuration(project), fps, true)}</div>
  );
}

export default function Player() {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const project = useStore((s) => s.project);
  const playing = useStore((s) => s.playing);
  const hasClips = project.tracks.some((t) => t.clips.length);
  const aspect = project.width / project.height;
  const pickColor = useStore((st) => st.pickColor);
  const libPreview = useStore((st) => st.libPreview);
  const [isFs, setIsFs] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef(null);

  useEffect(() => {
    const onFs = () => { setIsFs(document.fullscreenElement === stageRef.current); setIdle(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2500);
  };
  const toggleFs = () => {
    const el = stageRef.current;
    if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.();
  };

  useLayoutEffect(() => {
    const el = stageRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const pad = document.fullscreenElement === el ? 0 : 20;
      const aw = Math.max(50, r.width - pad * 2), ah = Math.max(50, r.height - pad * 2);
      let w = aw, h = aw / aspect;
      if (h > ah) { h = ah; w = ah * aspect; }
      setSize({ w: Math.floor(w), h: Math.floor(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  useEffect(() => {
    const c = canvasRef.current;
    engine.attach(c);
    return () => engine.detach(c);
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!size.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.min(project.width, Math.round(size.w * dpr));
    c.width = Math.max(2, pw);
    c.height = Math.max(2, Math.round(pw / aspect));
    engine.invalidate();
  }, [size, project.width, aspect]);

  const setRatio = (r) => {
    const s = useStore.getState();
    s.commit((p) => {
      p.ratio = r.id;
      if (r.id === 'original') {
        const first = mainTrack(p)?.clips[0];
        const m = first && p.media.find((x) => x.id === first.mediaId);
        const sz = m?.width ? sizeFromMedia(m.width, m.height) : { w: 1920, h: 1080 };
        p.width = sz.w; p.height = sz.h;
      } else { p.width = r.w; p.height = r.h; }
    }, { keepTracks: true });
  };

  const s = useStore.getState;
  return (
    <div className="panel">
      <div className="panel-head">Reprodutor <span style={{ marginLeft: 'auto', color: 'var(--faint)', fontWeight: 400 }}>{project.width}×{project.height} · {project.fps} fps</span></div>
      <div className="player-stage" ref={stageRef} onMouseMove={isFs ? wake : undefined}>
        <div style={{ position: 'relative', width: size.w, height: size.h }}>
          <canvas ref={canvasRef} style={{ width: size.w, height: size.h }} />
          {size.w > 0 && !isFs && <TransformOverlay W={size.w} H={size.h} />}
          {!hasClips && (
            <div className="empty-stage" style={{ position: 'absolute', inset: 0, justifyContent: 'center', pointerEvents: 'none' }}>
              <Clapperboard size={34} />
              <div>Importe mídias e arraste para a linha do tempo</div>
            </div>
          )}
        </div>
        {isFs && <>
          <div className={`fs-click ${idle && playing ? 'idle' : ''}`} onClick={() => s().togglePlay()} onDoubleClick={toggleFs} />
          <FullscreenBar visible={!idle || !playing} onExit={toggleFs} />
        </>}
        {pickColor && !isFs && <ColorPicker canvasRef={canvasRef} clipId={pickColor.clipId} />}
        {libPreview && !isFs && <LibPreview key={libPreview.mediaId} mediaId={libPreview.mediaId} />}
      </div>
      <div className="player-foot">
        <Timecode />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="icon-btn" title="Início (Home)" onClick={() => s().setTime(0)}><SkipBack size={15} /></button>
          <button className="play-btn" title="Reproduzir (Espaço)" onClick={() => s().togglePlay()}>
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <button className="icon-btn" title="Fim (End)" onClick={() => s().setTime(projectDuration(s().project))}><SkipForward size={15} /></button>
        </div>
        <div className="right">
          <Dropdown align="right" up width={210} button={({ toggle }) => (
            <button className="btn small ghost" onClick={toggle}>Proporção: {RATIOS.find((r) => r.id === project.ratio)?.name || 'Original'} <ChevronDown size={12} /></button>
          )}>
            {RATIOS.map((r) => (
              <MenuItem key={r.id} on={project.ratio === r.id} label={`${r.name}${r.hint ? ` · ${r.hint}` : ''}`} onClick={() => setRatio(r)} />
            ))}
          </Dropdown>
          <button className="icon-btn" title="Tela cheia" onClick={toggleFs}><Maximize size={15} /></button>
        </div>
      </div>
    </div>
  );
}
