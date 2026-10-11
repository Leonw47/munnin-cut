// Definições compartilhadas entre a prévia (renderer) e a exportação (FFmpeg).
// Tudo aqui precisa ser puro (sem DOM), porque também roda nos testes em Node.

export const RATIOS = [
  { id: 'original', name: 'Original', w: 0, h: 0 },
  { id: '16:9', name: '16:9', w: 1920, h: 1080, hint: 'YouTube' },
  { id: '9:16', name: '9:16', w: 1080, h: 1920, hint: 'Reels / TikTok / Shorts' },
  { id: '1:1', name: '1:1', w: 1080, h: 1080, hint: 'Feed quadrado' },
  { id: '4:5', name: '4:5', w: 1080, h: 1350, hint: 'Feed Instagram' },
  { id: '4:3', name: '4:3', w: 1440, h: 1080 },
  { id: '3:4', name: '3:4', w: 1080, h: 1440 },
  { id: '21:9', name: '21:9', w: 2520, h: 1080, hint: 'Cinema' },
];

// Tamanho-base de um projeto a partir de uma mídia (lado menor = 1080).
export function sizeFromMedia(w, h) {
  if (!w || !h) return { w: 1920, h: 1080 };
  const s = 1080 / Math.min(w, h);
  const ev = (x) => Math.max(2, Math.round((x * s) / 2) * 2);
  return { w: ev(w), h: ev(h) };
}

export const FPS_LIST = [24, 25, 30, 50, 60];

export const FONTS = [
  { family: 'Montserrat', weights: [400, 700, 900] },
  { family: 'Poppins', weights: [400, 700] },
  { family: 'Roboto', weights: [400, 700] },
  { family: 'Oswald', weights: [400, 700] },
  { family: 'Bebas Neue', weights: [400] },
  { family: 'Anton', weights: [400] },
  { family: 'Bangers', weights: [400] },
  { family: 'Playfair Display', weights: [400, 700] },
  { family: 'Lobster', weights: [400] },
  { family: 'Pacifico', weights: [400] },
  { family: 'Dancing Script', weights: [400, 700] },
  { family: 'Permanent Marker', weights: [400] },
  { family: 'Arial', weights: [400, 700], system: true },
  { family: 'Segoe UI', weights: [400, 700], system: true },
  { family: 'Impact', weights: [400], system: true },
  { family: 'Georgia', weights: [400, 700], system: true },
  { family: 'Times New Roman', weights: [400, 700], system: true },
  { family: 'Courier New', weights: [400, 700], system: true },
  { family: 'Verdana', weights: [400, 700], system: true },
  { family: 'Trebuchet MS', weights: [400, 700], system: true },
  { family: 'Comic Sans MS', weights: [400, 700], system: true },
];

export const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

export const DEFAULT_TEXT = {
  content: 'Digite seu texto',
  font: 'Montserrat',
  weight: 700,
  italic: false,
  size: 84,
  color: '#ffffff',
  align: 'center',
  letterSpacing: 0,
  lineHeight: 1.2,
  uppercase: false,
  stroke: { enabled: false, color: '#000000', width: 6 },
  shadow: { enabled: false, color: '#000000', blur: 14, x: 0, y: 5, opacity: 0.6 },
  background: { enabled: false, color: '#000000', opacity: 0.75, padding: 22, radius: 16 },
};

// Estilos prontos de texto (aba Texto).
export const TEXT_PRESETS = [
  { id: 'classic', name: 'Clássico', style: {} },
  { id: 'outline', name: 'Contorno', style: { stroke: { enabled: true, color: '#000000', width: 8 } } },
  { id: 'yellow', name: 'Destaque', style: { color: '#FFD60A', weight: 900, stroke: { enabled: true, color: '#000000', width: 9 } } },
  { id: 'boxBlack', name: 'Caixa preta', style: { background: { enabled: true, color: '#000000', opacity: 0.8, padding: 24, radius: 14 } } },
  { id: 'boxWhite', name: 'Caixa branca', style: { color: '#111111', background: { enabled: true, color: '#ffffff', opacity: 1, padding: 24, radius: 14 } } },
  { id: 'subtitle', name: 'Legenda', style: { size: 58, weight: 700, background: { enabled: true, color: '#000000', opacity: 0.55, padding: 16, radius: 10 } } },
  { id: 'shadow', name: 'Sombra', style: { shadow: { enabled: true, color: '#000000', blur: 18, x: 0, y: 6, opacity: 0.8 } } },
  { id: 'neon', name: 'Neon', style: { color: '#7DF9FF', font: 'Poppins', weight: 700, shadow: { enabled: true, color: '#00E5FF', blur: 30, x: 0, y: 0, opacity: 1 } } },
  { id: 'meme', name: 'Meme', style: { font: 'Anton', weight: 400, uppercase: true, size: 96, stroke: { enabled: true, color: '#000000', width: 10 } } },
  { id: 'cinema', name: 'Cinema', style: { font: 'Bebas Neue', weight: 400, size: 110, letterSpacing: 10 } },
  { id: 'elegant', name: 'Elegante', style: { font: 'Playfair Display', weight: 700, italic: true, shadow: { enabled: true, color: '#000000', blur: 12, x: 0, y: 3, opacity: 0.5 } } },
  { id: 'script', name: 'Manuscrito', style: { font: 'Dancing Script', weight: 700, size: 100 } },
  { id: 'red', name: 'Alerta', style: { weight: 900, background: { enabled: true, color: '#E53935', opacity: 1, padding: 22, radius: 12 } } },
  { id: 'pink', name: 'Pop rosa', style: { font: 'Bangers', weight: 400, color: '#FF4D9D', size: 100, letterSpacing: 2, stroke: { enabled: true, color: '#ffffff', width: 8 } } },
  { id: 'marker', name: 'Marcador', style: { font: 'Permanent Marker', weight: 400, color: '#111111', background: { enabled: true, color: '#FFE45E', opacity: 1, padding: 18, radius: 4 } } },
  { id: 'lobster', name: 'Retrô', style: { font: 'Lobster', weight: 400, color: '#FFB703', size: 96, shadow: { enabled: true, color: '#8B2E00', blur: 0, x: 5, y: 5, opacity: 1 } } },
];

export const STICKERS = [
  { name: 'Reações', items: ['😂', '😍', '🔥', '👏', '👍', '❤️', '😮', '😢', '😡', '🤯', '🥳', '😎', '🤔', '😱', '🙌', '💪'] },
  { name: 'Sinais', items: ['➡️', '⬅️', '⬆️', '⬇️', '✅', '❌', '⭐', '💯', '⚠️', '❗', '❓', '📌', '🔔', '🆕', '🔴', '🟢'] },
  { name: 'Objetos', items: ['🎉', '🎵', '🎬', '📷', '💡', '📣', '🏆', '💰', '🎁', '⏰', '📍', '✨', '🎤', '📱', '💻', '📅'] },
  { name: 'Natureza', items: ['🌟', '☀️', '🌙', '🌈', '🌸', '🍀', '🌊', '⚡', '❄️', '🌻', '🦋', '🌿', '🍂', '🌺', '🐦', '🌎'] },
  { name: 'Fé', items: ['✝️', '🙏', '🕊️', '📖', '⛪', '💒', '🛐', '👑', '🕯️', '💖', '🎶', '🔥'] },
];

// Transições: o id é o nome da transição no xfade do FFmpeg.
export const TRANSITIONS = [
  { id: 'fade', name: 'Dissolver' },
  { id: 'fadeblack', name: 'Escurecer' },
  { id: 'fadewhite', name: 'Clarão' },
  { id: 'dissolve', name: 'Granulado' },
  { id: 'wipeleft', name: 'Limpar ←' },
  { id: 'wiperight', name: 'Limpar →' },
  { id: 'wipeup', name: 'Limpar ↑' },
  { id: 'wipedown', name: 'Limpar ↓' },
  { id: 'slideleft', name: 'Deslizar ←' },
  { id: 'slideright', name: 'Deslizar →' },
  { id: 'slideup', name: 'Deslizar ↑' },
  { id: 'slidedown', name: 'Deslizar ↓' },
  { id: 'coverleft', name: 'Cobrir ←' },
  { id: 'coverright', name: 'Cobrir →' },
  { id: 'smoothleft', name: 'Suave ←' },
  { id: 'smoothright', name: 'Suave →' },
  { id: 'circleopen', name: 'Abrir círculo' },
  { id: 'circleclose', name: 'Fechar círculo' },
  { id: 'horzopen', name: 'Abrir horizontal' },
  { id: 'vertopen', name: 'Abrir vertical' },
  { id: 'radial', name: 'Relógio' },
  { id: 'pixelize', name: 'Pixelizar' },
  { id: 'zoomin', name: 'Zoom' },
  { id: 'hblur', name: 'Desfoque' },
  // Câmera / criativas (camtrans.js)
  { id: 'mc_spin', name: 'Giro', cat: 'camera' },
  { id: 'mc_spinccw', name: 'Giro anti-horário', cat: 'camera' },
  { id: 'mc_spinzoom', name: 'Giro com zoom', cat: 'camera' },
  { id: 'mc_zoom', name: 'Zoom rápido', cat: 'camera' },
  { id: 'mc_whipl', name: 'Chicote ←', cat: 'camera' },
  { id: 'mc_whipr', name: 'Chicote →', cat: 'camera' },
  { id: 'mc_whipu', name: 'Chicote ↑', cat: 'camera' },
  { id: 'mc_whipd', name: 'Chicote ↓', cat: 'camera' },
  { id: 'mc_roll', name: 'Rolar', cat: 'camera' },
  { id: 'mc_impact', name: 'Impacto', cat: 'camera' },
];
export const TRANSITION_CATS = [
  { id: 'basic', name: 'Básicas' },
  { id: 'camera', name: 'Câmera e criativas' },
];

export const ANIMS_IN = [
  { id: 'none', name: 'Nenhuma' },
  { id: 'fade', name: 'Surgir' },
  { id: 'zoomIn', name: 'Zoom in' },
  { id: 'zoomOut', name: 'Zoom out' },
  { id: 'pop', name: 'Pop' },
  { id: 'slideLeft', name: 'Entrar ←' },
  { id: 'slideRight', name: 'Entrar →' },
  { id: 'slideUp', name: 'Entrar ↑' },
  { id: 'slideDown', name: 'Entrar ↓' },
  { id: 'spin', name: 'Girar' },
  { id: 'flip', name: 'Virar' },
];

export const ANIMS_OUT = [
  { id: 'none', name: 'Nenhuma' },
  { id: 'fade', name: 'Sumir' },
  { id: 'zoomIn', name: 'Zoom in' },
  { id: 'zoomOut', name: 'Zoom out' },
  { id: 'pop', name: 'Encolher' },
  { id: 'slideLeft', name: 'Sair ←' },
  { id: 'slideRight', name: 'Sair →' },
  { id: 'slideUp', name: 'Sair ↑' },
  { id: 'slideDown', name: 'Sair ↓' },
  { id: 'spin', name: 'Girar' },
  { id: 'flip', name: 'Virar' },
];

export const EXPORT_FORMATS = [
  { id: 'mp4', name: 'MP4 (H.264)', ext: 'mp4', kind: 'video', desc: 'Funciona em qualquer lugar' },
  { id: 'mp4_hevc', name: 'MP4 (H.265)', ext: 'mp4', kind: 'video', desc: 'Arquivo menor, mesma qualidade' },
  { id: 'mov', name: 'MOV (H.264)', ext: 'mov', kind: 'video', desc: 'Padrão Apple' },
  { id: 'mov_hevc', name: 'MOV (H.265)', ext: 'mov', kind: 'video', desc: 'Padrão Apple, arquivo menor' },
  { id: 'prores', name: 'MOV (ProRes 422)', ext: 'mov', kind: 'video', desc: 'Para pós-produção (arquivo grande)' },
  { id: 'webm', name: 'WebM (VP9)', ext: 'webm', kind: 'video', desc: 'Para sites' },
  { id: 'mkv', name: 'MKV (H.264)', ext: 'mkv', kind: 'video', desc: 'Contêiner aberto' },
  { id: 'avi', name: 'AVI (MPEG-4)', ext: 'avi', kind: 'video', desc: 'Players antigos' },
  { id: 'gif', name: 'GIF animado', ext: 'gif', kind: 'gif', desc: 'Sem som, até 15 fps' },
  { id: 'mp3', name: 'MP3', ext: 'mp3', kind: 'audio', desc: 'Só o áudio' },
  { id: 'wav', name: 'WAV', ext: 'wav', kind: 'audio', desc: 'Só o áudio, sem compressão' },
  { id: 'm4a', name: 'M4A (AAC)', ext: 'm4a', kind: 'audio', desc: 'Só o áudio' },
  { id: 'flac', name: 'FLAC', ext: 'flac', kind: 'audio', desc: 'Só o áudio, sem perdas' },
];

export const RESOLUTIONS = [
  { id: 480, name: '480p' },
  { id: 720, name: '720p' },
  { id: 1080, name: '1080p' },
  { id: 1440, name: '2K' },
  { id: 2160, name: '4K' },
];

export const QUALITIES = [
  { id: 'small', name: 'Mais baixa' },
  { id: 'standard', name: 'Recomendada' },
  { id: 'high', name: 'Mais alta' },
  { id: 'custom', name: 'Personalizada' },
];

// Contêiner + codec → formato de exportação
export const CONTAINERS = {
  mp4: { name: 'MP4', codecs: [{ id: 'h264', name: 'H.264', format: 'mp4' }, { id: 'hevc', name: 'H.265 (HEVC)', format: 'mp4_hevc' }] },
  mov: { name: 'MOV', codecs: [{ id: 'h264', name: 'H.264', format: 'mov' }, { id: 'hevc', name: 'H.265 (HEVC)', format: 'mov_hevc' }, { id: 'prores', name: 'ProRes 422', format: 'prores' }] },
};

// Taxa de bits de vídeo (kbps) para H.264 a 30 fps, por resolução (lado menor) e qualidade.
const H264_KBPS = { 480: [1500, 2500, 4000], 720: [3000, 5000, 8000], 1080: [5000, 8000, 14000], 1440: [10000, 16000, 24000], 2160: [20000, 35000, 50000] };
const QIDX = { small: 0, standard: 1, high: 2 };

export function videoKbps({ format, res, fps, width, height, quality, customMbps }) {
  if (format === 'prores') return Math.round(147000 * ((width * height) / (1920 * 1080)) * (fps / 29.97));
  if (quality === 'custom') return Math.round((customMbps || 8) * 1000);
  const row = H264_KBPS[res] || H264_KBPS[1080];
  let v = row[QIDX[quality] ?? 1] * (fps > 30 ? 1.5 : 1);
  if (format === 'mp4_hevc' || format === 'mov_hevc') v *= 0.6;
  if (format === 'webm') v *= 0.7;
  if (format === 'avi') v *= 1.5;
  return Math.round(v);
}

export function audioKbps(format, quality) {
  switch (format) {
    case 'prores': case 'wav': return 1536;
    case 'flac': return 900;
    case 'mp3': return { small: 128, standard: 192, high: 320, custom: 320 }[quality] || 192;
    case 'm4a': return { small: 128, standard: 192, high: 256, custom: 256 }[quality] || 192;
    case 'webm': return 160;
    case 'gif': return 0;
    default: return 192;
  }
}

// Estimativa de tamanho do arquivo (bytes).
export function estimateBytes({ kind, width, height, fps, duration, vKbps, aKbps }) {
  if (kind === 'gif') return Math.round(Math.min(width, 540) * Math.min(height, 960) * Math.min(fps, 15) * duration * 0.06);
  const kbps = (kind === 'audio' ? 0 : vKbps) + aKbps;
  return Math.round(((kbps * 1000) / 8) * duration * 1.01);
}

export function fmtBytes(b) {
  if (!b && b !== 0) return '—';
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(b < 100 * 1024 * 1024 ? 1 : 0).replace('.', ',')} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} GB`;
}

export const MEDIA_EXTS = {
  video: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts', '3gp', 'ogv', 'gif'],
  image: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif', 'svg'],
  audio: ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'oga', 'opus', 'flac', 'wma', 'aiff', 'aif', 'amr', 'ac3'],
};

export const TRACK_LABEL = { video: 'Principal', overlay: 'Sobreposição', text: 'Texto', effect: 'Efeitos', audio: 'Áudio' };
