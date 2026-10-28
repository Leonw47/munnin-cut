// Edição em grupo: vários clipes do mesmo tipo selecionados e ajustados juntos pelo painel da direita
// (ex.: os pedaços de um vídeo depois de cortar os silêncios).
import { findClip } from './timeline.js';

// Tipos que dividem o mesmo painel: vídeo com vídeo, foto com foto, texto com texto (sticker à parte)…
export const tipoGrupo = (c) => (c.type === 'text' ? (c.sticker ? 'sticker' : 'text') : c.type === 'effect' ? `effect:${c.effect?.kind}` : c.type);

export const NOME_GRUPO = {
  video: ['vídeo', 'vídeos'], image: ['foto', 'fotos'], audio: ['áudio', 'áudios'], text: ['texto', 'textos'],
  sticker: ['sticker', 'stickers'], shape: ['forma', 'formas'], 'effect:effect': ['efeito', 'efeitos'], 'effect:filter': ['filtro', 'filtros'],
};

/**
 * Grupo da seleção: { tipo, lider, ids (o líder primeiro), resto (quantos da seleção são de outro tipo) } ou null.
 * Uma seleção de um tipo só já é um grupo; numa seleção mista, vale o tipo escolhido (sel.grupo).
 */
export function grupoDaSelecao(project, sel) {
  if (!project || sel?.type !== 'clip' || !(sel.ids?.length > 1)) return null;
  const clips = sel.ids.map((id) => findClip(project, id)?.clip).filter(Boolean);
  const tipos = new Set(clips.map(tipoGrupo));
  const tipo = sel.grupo && tipos.has(sel.grupo) ? sel.grupo : tipos.size === 1 ? [...tipos][0] : null;
  if (!tipo) return null;
  const doTipo = clips.filter((c) => tipoGrupo(c) === tipo);
  if (doTipo.length < 2) return null;
  const lider = doTipo.find((c) => c.id === sel.id) || doTipo[0];
  return { tipo, lider: lider.id, ids: [lider.id, ...doTipo.filter((c) => c !== lider).map((c) => c.id)], resto: clips.length - doTipo.length };
}

// O que é de cada clipe e nunca passa de um para o outro: lugar no tempo, trecho do arquivo, pontos de
// modificação, velocidade e reverso (estes dois têm conta própria por clipe), o texto escrito.
const DE_CADA_UM = new Set(['id', 'type', 'mediaId', 'start', 'duration', 'in', 'speed', 'reverse', 'kf', 'caption', 'sticker', 'transition']);
const plano = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const igual = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Leva para `alvo` só o que mudou de `antes` para `depois` (o clipe principal), com o valor final: quem mexeu
 * na escala muda só a escala dos outros; posição, cor, texto e o resto de cada um continuam como estavam.
 */
export function espelhar(antes, depois, alvo, caminho = '') {
  const chaves = new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})]);
  for (const k of chaves) {
    if (!caminho && DE_CADA_UM.has(k)) continue;
    if (caminho === 'text' && k === 'content') continue;
    const a = antes?.[k], d = depois?.[k];
    if (igual(a, d)) continue;
    if (d === undefined) delete alvo[k];
    else if (plano(a) && plano(d) && plano(alvo[k])) espelhar(a, d, alvo[k], caminho ? `${caminho}.${k}` : k);
    else if (!caminho && k === 'text' && plano(alvo.text)) alvo.text = { ...structuredClone(d), content: alvo.text.content };
    else alvo[k] = structuredClone(d);
  }
}
