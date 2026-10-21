// "Voz": limpeza e realce da fala de um clipe (vídeo ou áudio). A mesma cadeia do Web Audio toca na prévia
// em tempo real e é renderizada (OfflineAudioContext) na exportação — o que se ouve é o que sai no arquivo.

export const VOZ_PADRAO = { ruido: 0, realce: 0, clareza: 0, ambiente: 'none', ambMix: 35 };

export const AMBIENTES = [
  { id: 'none', name: 'Nenhum' },
  { id: 'sala', name: 'Sala' },
  { id: 'auditorio', name: 'Auditório' },
  { id: 'igreja', name: 'Igreja' },
  { id: 'chorus', name: 'Chorus' },
  { id: 'dobra', name: 'Voz dupla' },
];

export const PRESETS_VOZ = [
  { id: 'limpa', name: 'Voz limpa', v: { ruido: 55, realce: 45, clareza: 45, ambiente: 'none' } },
  { id: 'podcast', name: 'Podcast', v: { ruido: 45, realce: 70, clareza: 60, ambiente: 'none' } },
  { id: 'barulho', name: 'Lugar barulhento', v: { ruido: 85, realce: 55, clareza: 50, ambiente: 'none' } },
  { id: 'culto', name: 'Pregação / culto', v: { ruido: 50, realce: 60, clareza: 40, ambiente: 'auditorio', ambMix: 18 } },
  { id: 'locutor', name: 'Locutor', v: { ruido: 40, realce: 85, clareza: 70, ambiente: 'none' } },
];

// Projetos antigos: o "Reduzir ruído" (só na exportação) vira a redução em tempo real.
export function vozDoClipe(clip) {
  const v = { ...VOZ_PADRAO, ...(clip?.voz || {}) };
  if (!clip?.voz && clip?.audioFx?.denoise) v.ruido = 50;
  return v;
}

export function temVoz(clip) {
  const v = vozDoClipe(clip);
  return v.ruido > 0.5 || v.realce > 0.5 || v.clareza > 0.5 || (v.ambiente !== 'none' && v.ambMix > 0.5);
}

const db = (x) => Math.pow(10, x / 20);

/**
 * Parâmetros de cada estágio (0–100 → valores físicos). `nivel`: nível da fala da mídia em dBFS
 * (percentil 90 do RMS de 50 ms), usado pelo realce para levar a voz a um volume padrão.
 */
export function vozPlano(voz, nivel = null) {
  const v = { ...VOZ_PADRAO, ...(voz || {}) };
  const r = v.realce / 100, c = v.clareza / 100, a = v.ambMix / 100;
  const p = { ruido: v.ruido > 0.5 ? v.ruido / 100 : 0 };
  if (c > 0.005 || r > 0.005) p.passaAltas = 70 + 50 * Math.max(c, r * 0.6);      // corta zumbido e "pancada" do microfone
  if (c > 0.005) {
    p.eq = [
      { tipo: 'peaking', f: 280, q: 1.0, g: -4 * c },        // tira o "abafado"
      { tipo: 'peaking', f: 3200, q: 0.9, g: 6 * c },        // presença: a voz "na frente"
      { tipo: 'highshelf', f: 9000, q: 0.7, g: 4 * c },      // brilho
    ];
  }
  if (r > 0.005) {
    // normaliza a fala para −20 dBFS (proporcional ao realce), comprime e compensa
    const alvo = -20;
    const pre = nivel == null ? 0 : Math.max(-6, Math.min(18, alvo - nivel));
    p.preGanho = db(pre * r);
    p.comp = { limiar: -18 - 10 * r, razao: 1.5 + 4 * r, joelho: 10, ataque: 0.004, solta: 0.2 };
    p.posGanho = db(5 * r);
  }
  if (v.ambiente !== 'none' && a > 0.005) p.ambiente = { id: v.ambiente, mix: a };
  p.limitador = !!(p.comp || p.eq || p.ambiente);
  return p;
}

export const VOZ_VERSAO = 2;   // mude quando o processamento mudar (invalida o cache das exportações)
