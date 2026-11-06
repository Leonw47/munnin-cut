// Padrão de legenda: tudo o que define a aparência de uma legenda (texto sem o conteúdo, posição/tamanho/giro,
// opacidade e animações). Tirado de uma legenda já personalizada e aplicado às outras — cada uma mantém o próprio texto.
import { DEFAULT_TEXT } from './defs.js';

const TF = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation'];
const ANIMS = ['animIn', 'animOut', 'animLoop'];

export function padraoDe(clip) {
  const { content, ...text } = clip.text || {};
  const tf = clip.transform || {};
  const pd = { text: structuredClone(text), transform: {}, opacity: clip.opacity ?? 1 };
  for (const k of TF) if (tf[k] !== undefined) pd.transform[k] = tf[k];
  for (const k of ANIMS) if (clip[k]) pd[k] = structuredClone(clip[k]);
  return pd;
}

export function aplicaPadrao(clip, pd) {
  clip.text = { ...structuredClone(DEFAULT_TEXT), ...structuredClone(pd.text), content: clip.text?.content ?? '' };
  clip.transform = { ...(clip.transform || {}), ...pd.transform };
  clip.opacity = pd.opacity ?? 1;
  for (const k of ANIMS) { if (pd[k]) clip[k] = structuredClone(pd[k]); else delete clip[k]; }
  // pontos de modificação do que o padrão define deixariam a legenda diferente das outras
  if (clip.kf) {
    for (const k of [...TF, 'opacity']) delete clip.kf[k];
    if (!Object.keys(clip.kf).length) delete clip.kf;
  }
  return clip;
}

// "Meus estilos" de legenda: guardados no computador (valem para todos os projetos)
const CHAVE = 'mc.legendasMinhas';
export function meusEstilos() {
  try { const v = JSON.parse(localStorage.getItem(CHAVE) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function gravar(lista) { try { localStorage.setItem(CHAVE, JSON.stringify(lista)); } catch { /* sem armazenamento */ } }
export function salvarEstilo(nome, padrao) {
  const item = { id: `meu_${Date.now().toString(36)}`, name: nome.trim() || 'Meu estilo', padrao };
  gravar([...meusEstilos(), item]);
  return item;
}
export function apagarEstilo(id) { gravar(meusEstilos().filter((e) => e.id !== id)); }
export const meuEstilo = (id) => meusEstilos().find((e) => e.id === id) || null;
