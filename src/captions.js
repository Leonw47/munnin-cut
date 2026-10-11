// Legendas automáticas: mistura o áudio, transcreve com whisper.cpp (offline) e cria clipes de texto.
import { useStore } from './store.js';
import { startExport } from './exporter.js';
import { DEFAULT_TEXT } from './shared/defs.js';

export const CAPTION_STYLES = [
  { id: 'clean', name: 'Clássica', style: { font: 'Montserrat', weight: 700, size: 62, color: '#ffffff', stroke: { enabled: true, color: '#000000', width: 6 } } },
  { id: 'box', name: 'Caixa', style: { font: 'Montserrat', weight: 700, size: 56, color: '#ffffff', background: { enabled: true, color: '#000000', opacity: 0.65, padding: 16, radius: 10 } } },
  { id: 'yellow', name: 'Amarela', style: { font: 'Montserrat', weight: 900, size: 64, color: '#FFD60A', stroke: { enabled: true, color: '#000000', width: 7 } } },
  { id: 'bold', name: 'Impacto', style: { font: 'Anton', weight: 400, size: 84, uppercase: true, color: '#ffffff', stroke: { enabled: true, color: '#000000', width: 8 } } },
  { id: 'soft', name: 'Suave', style: { font: 'Poppins', weight: 700, size: 58, color: '#ffffff', shadow: { enabled: true, color: '#000000', blur: 16, x: 0, y: 4, opacity: 0.85 } } },
];

export const CAPTION_LANGS = [
  { id: 'pt', name: 'Português' },
  { id: 'auto', name: 'Detectar' },
  { id: 'en', name: 'Inglês' },
  { id: 'es', name: 'Espanhol' },
];

export const captionStyle = (id) => ({ ...structuredClone(DEFAULT_TEXT), ...structuredClone((CAPTION_STYLES.find((s) => s.id === id) || CAPTION_STYLES[0]).style) });

function wrap(text, maxChars, lines) {
  if (lines < 2 || text.length <= maxChars) return text;
  const mid = text.length / 2;
  let best = -1, bd = Infinity;
  for (let i = 0; i < text.length; i++) if (text[i] === ' ') { const d = Math.abs(i - mid); if (d < bd) { bd = d; best = i; } }
  return best > 0 ? `${text.slice(0, best)}\n${text.slice(best + 1)}` : text;
}

// Agrupa palavras (com tempos) em legendas curtas e legíveis.
export function groupWords(words, { maxChars = 30, lines = 2, maxDur = 3.5, gap = 0.6 } = {}) {
  const caps = [];
  let cur = null;
  const limit = maxChars * lines;
  for (const w of words) {
    const text = String(w.text || '').trim();
    if (!text || /^\[.*\]$/.test(text)) continue; // ignora marcas como [música]
    if (/^[.,!?;:…)»"']+$/.test(text) && cur) { cur.text += text; cur.end = Math.max(cur.end, w.t1); continue; }
    const startNew = !cur || cur.text.length + 1 + text.length > limit || w.t1 - cur.start > maxDur || w.t0 - cur.end > gap || /[.!?…]$/.test(cur.text);
    if (startNew) { if (cur) caps.push(cur); cur = { start: w.t0, end: w.t1, text }; }
    else { cur.text += ` ${text}`; cur.end = w.t1; }
  }
  if (cur) caps.push(cur);
  for (const c of caps) { c.text = wrap(c.text, maxChars, lines); c.end = Math.max(c.end, c.start + 0.4); }
  for (let i = 0; i < caps.length - 1; i++) if (caps[i + 1].start - caps[i].end < 0.25) caps[i].end = caps[i + 1].start;
  return caps;
}

/**
 * opts: { source: 'project' | 'clip', clipId, language, model, styleId, lines, replace, prompt, onStage(stage, pct) }
 * Retorna o número de legendas criadas.
 */
export async function generateCaptions(opts) {
  const api = window.api;
  const S = () => useStore.getState();
  const { source, clipId, language, model, styleId, lines, replace, prompt, onStage } = opts;
  const stage = (s, p = 0) => onStage && onStage(s, p);

  const models = await api.captionModels();
  const md = models.find((m) => m.id === model);
  if (!md?.available) throw new Error('O componente de legendas não foi encontrado nesta instalação.');
  if (!md.downloaded) { stage('download', 0); await api.captionDownload(model); }

  // 1) áudio a transcrever (o projeto inteiro mixado ou só um clipe)
  stage('audio', 0);
  let project = S().project;
  let offset = 0;
  if (source === 'clip') {
    const found = project.tracks.flatMap((t) => t.clips.map((c) => ({ c, t }))).find((x) => x.c.id === clipId);
    if (!found || (found.c.type !== 'video' && found.c.type !== 'audio')) throw new Error('Selecione um clipe de vídeo ou áudio.');
    const clip = { ...structuredClone(found.c), start: 0, muted: false, volume: 1, fadeIn: 0, fadeOut: 0 };
    offset = found.c.start;
    const tr = clip.type === 'video' ? { id: 'm', kind: 'video', main: true, clips: [clip] } : { id: 'a', kind: 'audio', clips: [clip] };
    project = { ...project, tracks: clip.type === 'video' ? [tr] : [{ id: 'm', kind: 'video', main: true, clips: [] }, tr] };
  }
  const info = await api.info();
  const outPath = `${info.tempDir}\\legendas_${Date.now()}.wav`;
  const r = await startExport({ project, meta: S().meta, format: 'wav', res: 720, fps: 30, quality: 'standard', outPath, onProgress: (p) => stage('audio', p) }).promise;
  if (!r.ok) throw new Error(r.error || 'não foi possível preparar o áudio');

  // 2) transcrição
  stage('transcribe', 0);
  const words = await api.captionTranscribe({ audioPath: outPath, model, language, prompt });
  const caps = groupWords(words.map((w) => ({ ...w, t0: w.t0 + offset, t1: w.t1 + offset })), { maxChars: lines === 1 ? 26 : 30, lines });

  // 3) clipes de texto
  stage('apply', 1);
  const n = S().applyCaptions(caps, captionStyle(styleId), { replace });
  return n;
}
