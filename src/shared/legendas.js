// Tempos das legendas automáticas: cada legenda aparece junto com a voz e some na pausa.
// Regras puras (testadas em Node); a transcrição em si fica no processo principal (whisper.cpp).

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];

/**
 * Trechos com fala, a partir do volume em janelas curtas (db: dB por janela de `passo` segundos).
 * O limiar se adapta à gravação (ruído de fundo × voz). Silêncio digital (clipe mudo, sem som) nunca conta
 * como fala. Sem contraste suficiente (música ou ruído o tempo todo), só o silêncio de verdade separa os trechos.
 * Devolve [[início, fim], …] em segundos, ou null se não houver som.
 */
export function regioesDeFala(db, passo = 0.01, { pausaMin = 0.2, falaMin = 0.08, folga = 0.04 } = {}) {
  if (!db?.length) return null;
  const vals = Array.from(db).filter((v) => v > -90).sort((a, b) => a - b);
  if (vals.length < 10) return null;
  const ruido = pct(vals, 0.1), forte = pct(vals, 0.95);
  const lim = forte - ruido >= 15 ? Math.max(ruido + 8, forte - 32) : -70;
  const brutas = [];
  let ini = -1;
  for (let i = 0; i <= db.length; i++) {
    const fala = i < db.length && db[i] > lim;
    if (fala && ini < 0) ini = i;
    else if (!fala && ini >= 0) { brutas.push([ini, i]); ini = -1; }
  }
  // junta pausas curtas (consoantes, respiração) e descarta estalos
  const juntas = [];
  for (const r of brutas) {
    const u = juntas[juntas.length - 1];
    if (u && (r[0] - u[1]) * passo < pausaMin) u[1] = r[1];
    else juntas.push([...r]);
  }
  const fim = db.length * passo;
  return juntas.filter((r) => (r[1] - r[0]) * passo >= falaMin)
    .map(([a, b]) => [Math.max(0, a * passo - folga), Math.min(fim, b * passo + folga)]);
}

// Quanto uma palavra dura no máximo (evita esticar a última palavra antes de uma música, por exemplo).
const duracaoMax = (text) => Math.min(2, 0.35 + 0.075 * String(text).trim().length);

/**
 * Tempos de cada palavra: começa pela DTW (td) quando houver, senão pelo tempo normal (t0); termina onde a
 * próxima começa. Com os trechos de fala, cada palavra fica dentro do seu trecho: a primeira de um trecho
 * começa quando a voz entra e a última termina quando a voz para — nada de legenda na pausa ou no silêncio.
 * palavras: [{ text, t0, t1, td? }] → [{ text, t0, t1 }]
 */
export function temposDasPalavras(palavras, regioes = null) {
  const ws = [];
  for (const w of palavras || []) {
    const text = String(w.text || '').trim();
    if (!text) continue;
    const s = Number.isFinite(w.td) && w.td >= 0 ? w.td : w.t0;
    ws.push({ text, s: Math.max(s, ws.length ? ws[ws.length - 1].s : 0), t1: w.t1 });
  }
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    const prox = ws[i + 1];
    w.e = Math.min(prox ? prox.s : Math.max(w.s + 0.25, w.t1), w.s + duracaoMax(w.text));
  }
  if (regioes?.length) {
    // trecho de cada palavra: o que contém o início dela ou, numa pausa, o mais perto (a DTW às vezes atrasa um pouco)
    let k = 0;
    for (const w of ws) {
      while (k < regioes.length - 1 && regioes[k][1] < w.s) k++;
      const r = regioes[k];
      if (w.s >= r[0] && w.s <= r[1]) { w.k = k; continue; }
      const ant = w.s > r[1] ? k : k - 1;
      const dAnt = ant >= 0 ? w.s - regioes[ant][1] : Infinity;
      const prox = w.s < r[0] ? k : k + 1;
      const dProx = prox < regioes.length ? regioes[prox][0] - w.s : Infinity;
      if (dAnt <= 0.25 && dAnt <= dProx * 1.5) w.k = ant;
      else if (dProx <= 0.6) w.k = prox;
      else if (dAnt <= 0.6) w.k = ant;
      // longe de qualquer voz: o whisper costuma adiantar a fala (a 1ª palavra no começo do trecho, no silêncio)
      else w.k = prox < regioes.length ? prox : -1;
    }
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (w.k < 0) continue;
      const [a, b] = regioes[w.k];
      const primeira = !(i > 0 && ws[i - 1].k === w.k);
      const ultima = !(i < ws.length - 1 && ws[i + 1].k === w.k);
      w.s = primeira ? Math.max(a, Math.min(w.s, b) - 0.6) : Math.min(Math.max(w.s, a), b);
      w.e = ultima ? Math.min(b, w.s + duracaoMax(w.text)) : Math.min(Math.max(w.e, w.s), b);
    }
  }
  const out = [];
  for (const w of ws) {
    const t0 = Math.max(w.s, out.length ? out[out.length - 1].t0 : 0);
    out.push({ text: w.text, t0, t1: Math.max(w.e, t0 + 0.08) });
  }
  return out;
}

function wrap(text, maxChars, lines) {
  if (lines < 2 || text.length <= maxChars) return text;
  const mid = text.length / 2;
  let best = -1, bd = Infinity;
  for (let i = 0; i < text.length; i++) if (text[i] === ' ') { const d = Math.abs(i - mid); if (d < bd) { bd = d; best = i; } }
  return best > 0 ? `${text.slice(0, best)}\n${text.slice(best + 1)}` : text;
}

// Agrupa palavras (com tempos) em legendas curtas e legíveis. Uma pausa na fala começa outra legenda; a
// legenda fica um instante depois da última palavra, mas não invade a próxima nem a pausa longa.
export function groupWords(words, { maxChars = 30, lines = 2, maxDur = 3.5, gap = 0.5, sobra = 0.15, limite = Infinity } = {}) {
  const caps = [];
  let cur = null;
  const lim = maxChars * lines;
  for (const w of words) {
    const text = String(w.text || '').trim();
    if (!text || /^\[.*\]$/.test(text) || /^\(.*\)$/.test(text)) continue; // ignora marcas como [música]
    if (/^[.,!?;:…)»"']+$/.test(text) && cur) { cur.text += text; cur.end = Math.max(cur.end, w.t1); continue; }
    const startNew = !cur || cur.text.length + 1 + text.length > lim || w.t1 - cur.start > maxDur || w.t0 - cur.end > gap || /[.!?…]$/.test(cur.text);
    if (startNew) { if (cur) caps.push(cur); cur = { start: w.t0, end: w.t1, text }; }
    else { cur.text += ` ${text}`; cur.end = w.t1; }
  }
  if (cur) caps.push(cur);
  for (let i = 0; i < caps.length; i++) {
    const c = caps[i], prox = caps[i + 1];
    c.text = wrap(c.text, maxChars, lines);
    const teto = Math.min(prox ? prox.start : Infinity, limite);
    // emenda na próxima se a pausa for curta (não pisca); senão fica só um instante a mais
    c.end = prox && prox.start - c.end < 0.3 ? prox.start : Math.min(teto, Math.max(c.end + sobra, c.start + 0.4));
  }
  return caps.filter((c) => c.end - c.start > 0.05);
}
