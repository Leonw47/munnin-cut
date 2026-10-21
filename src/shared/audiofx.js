// Efeitos de áudio. Um único "plano" por efeito gera tanto os filtros do FFmpeg (exportação)
// quanto a cadeia do Web Audio (prévia) — as mesmas frequências, ecos e curvas nos dois lados.

export const AUDIO_FX = [
  { id: 'none', name: 'Nenhum' },
  { id: 'echo', name: 'Eco' },
  { id: 'hall', name: 'Igreja / salão' },
  { id: 'robot', name: 'Robô' },
  { id: 'phone', name: 'Telefone' },
  { id: 'radio', name: 'Rádio antigo' },
  { id: 'megaphone', name: 'Megafone' },
  { id: 'underwater', name: 'Debaixo d’água' },
  { id: 'chipmunk', name: 'Voz fina' },
  { id: 'deep', name: 'Voz grossa' },
];

export const DEFAULT_AUDIO_FX = { id: 'none', mix: 100, bass: 0, treble: 0, denoise: false };

export function hasAudioFx(fx) {
  if (!fx) return false;
  // (o antigo "denoise" virou a limpeza da Voz, em tempo real — src/shared/voz.js)
  return (fx.id && fx.id !== 'none') || Math.abs(fx.bass || 0) > 0.05 || Math.abs(fx.treble || 0) > 0.05;
}

// corte que "fecha" de 20 kHz até f conforme a intensidade m (escala logarítmica)
const closeLp = (f, m) => 20000 * Math.pow(f / 20000, m);
const closeHp = (f, m) => 20 * Math.pow(f / 20, m);

export function audioFxPlan(fx) {
  const c = { ...DEFAULT_AUDIO_FX, ...(fx || {}) };
  const m = Math.max(0, Math.min(1, (c.mix ?? 100) / 100));
  const p = { pitch: null, taps: null, ring: null, hp: null, lp: null, drive: null, bass: c.bass || 0, treble: c.treble || 0, denoise: !!c.denoise };
  switch (c.id) {
    case 'echo':
      p.taps = { delays: [0.35, 0.7, 1.05, 1.4], decays: [0.45, 0.2, 0.09, 0.04].map((d) => d * m), out: 0.85 };
      break;
    case 'hall':
      p.taps = { delays: [0.041, 0.067, 0.091, 0.129, 0.183, 0.241, 0.317], decays: [0.5, 0.43, 0.37, 0.3, 0.22, 0.15, 0.09].map((d) => d * m), out: 0.62 };
      break;
    case 'robot': p.ring = { freq: 55, m }; break;
    case 'phone': p.hp = closeHp(420, m); p.lp = closeLp(3000, m); break;
    case 'radio': p.hp = closeHp(650, m); p.lp = closeLp(2600, m); p.drive = 1 + 2.2 * m; break;
    case 'megaphone': p.hp = closeHp(750, m); p.lp = closeLp(3600, m); p.drive = 1 + 4 * m; break;
    case 'underwater': p.lp = closeLp(520, m); break;
    case 'chipmunk': p.pitch = Math.pow(2, (7 * m) / 12); break;
    case 'deep': p.pitch = Math.pow(2, (-6 * m) / 12); break;
    default: break;
  }
  if (p.pitch !== null && Math.abs(p.pitch - 1) < 0.003) p.pitch = null;
  if (p.drive !== null && p.drive < 1.02) p.drive = null;
  return p;
}

const n4 = (x) => String(Math.round(x * 10000) / 10000);

// Filtros do FFmpeg (o áudio já chega em 48 kHz estéreo).
export function audioFxFilters(fx) {
  if (!hasAudioFx(fx)) return [];
  const p = audioFxPlan(fx);
  const f = [];
  if (p.pitch) f.push(`rubberband=pitch=${n4(p.pitch)}`);
  if (p.hp) f.push(`highpass=f=${Math.round(p.hp)}`);
  if (p.lp) f.push(`lowpass=f=${Math.round(p.lp)}`);
  if (p.drive) {
    const k = n4(p.drive), d = n4(Math.tanh(p.drive));
    f.push(`aeval=exprs='tanh(${k}*val(0))/${d}|tanh(${k}*val(1))/${d}':c=same`);
  }
  if (p.ring) {
    const g = `(${n4(1 - p.ring.m)}+${n4(p.ring.m)}*sin(2*PI*${p.ring.freq}*t))`;
    f.push(`aeval=exprs='val(0)*${g}|val(1)*${g}':c=same`);
  }
  if (p.taps) {
    const active = p.taps.delays.map((d, i) => [d, p.taps.decays[i]]).filter(([, k]) => k > 0.001);
    if (active.length) f.push(`aecho=1:${n4(p.taps.out)}:${active.map(([d]) => Math.round(d * 1000)).join('|')}:${active.map(([, k]) => n4(k)).join('|')}`);
  }
  if (Math.abs(p.bass) > 0.05) f.push(`lowshelf=f=150:g=${n4(p.bass)}:t=s:w=1`);
  if (Math.abs(p.treble) > 0.05) f.push(`highshelf=f=4000:g=${n4(p.treble)}:t=s:w=1`);
  return f;
}
