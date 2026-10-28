// Testes das regras puras da 1.11: tempos das legendas (voz × silêncio) e edição em grupo.
// node scripts/test-legendas-grupo.mjs
import { regioesDeFala, temposDasPalavras, groupWords } from '../src/shared/legendas.js';
import { espelhar, grupoDaSelecao, tipoGrupo } from '../src/shared/grupo.js';

let falhas = 0;
const ok = (cond, nome, extra = '') => { console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ` — ${extra}` : ''}`); if (!cond) falhas++; };
const perto = (a, b, tol = 0.06) => Math.abs(a - b) <= tol;

// --- volume sintético: silêncio digital 0–3 s (clipe mudo), fala 3–6 s, pausa com ruído 6–7 s, fala 7–9 s
const passo = 0.01;
const db = new Float32Array(1000);
for (let i = 0; i < db.length; i++) {
  const t = i * passo;
  db[i] = t < 3 ? -120 : (t < 6 || (t >= 7 && t < 9)) ? -18 + 4 * Math.sin(i) : -55 + Math.sin(i);
}
const reg = regioesDeFala(db, passo);
ok(reg?.length === 2, 'dois trechos de fala', JSON.stringify(reg?.map((r) => r.map((x) => +x.toFixed(2)))));
ok(reg && perto(reg[0][0], 3, 0.05) && perto(reg[0][1], 6, 0.05) && perto(reg[1][0], 7, 0.05) && perto(reg[1][1], 9, 0.05), 'trechos nos lugares certos');

// --- o defeito de antes: o whisper põe a 1ª palavra no começo do trecho (0 s) e a DTW sabe o certo
const palavras = [
  { text: ' Olá', t0: 0, t1: 1, td: 3.3 },
  { text: ' meus', t0: 1, t1: 3.4, td: 3.55 },
  { text: ' amigos,', t0: 3.4, t1: 4.2, td: 3.8 },
  { text: ' tudo', t0: 4.2, t1: 4.6, td: 4.3 },
  { text: ' bem.', t0: 4.6, t1: 7.3, td: 4.7 },      // última antes da pausa: o tempo normal estica até 7,3 s
  { text: ' Vamos', t0: 7.3, t1: 7.6, td: 7.25 },    // a DTW atrasada um pouco em relação à voz (7 s)
  { text: ' lá.', t0: 7.6, t1: 9.5, td: 7.6 },
];
const tp = temposDasPalavras(palavras, reg);
ok(perto(tp[0].t0, 3, 0.06), '"Olá" começa quando a voz entra (≈3 s), não em 0 s', tp[0].t0.toFixed(2));
ok(tp[4].t1 <= 6.05, '"bem." termina na pausa, não estica até 7,3 s', tp[4].t1.toFixed(2));
ok(perto(tp[5].t0, 7, 0.06), '"Vamos" começa quando a voz volta (≈7 s)', tp[5].t0.toFixed(2));
ok(tp[6].t1 <= 9.05, 'a última palavra não passa do fim da fala', tp[6].t1.toFixed(2));
ok(tp.every((w, i) => i === 0 || w.t0 >= tp[i - 1].t0), 'tempos em ordem');

const caps = groupWords(tp, { maxChars: 30, lines: 2 });
ok(caps.length === 2, 'a pausa separa as legendas', caps.map((c) => `${c.start.toFixed(2)}-${c.end.toFixed(2)} ${c.text}`).join(' | '));
ok(caps[0].start >= 2.9 && caps[0].end <= 6.3, '1ª legenda só durante a 1ª fala');
ok(caps[1].start >= 6.9 && caps[1].end <= 9.3, '2ª legenda só durante a 2ª fala');
const lim = groupWords(tp, { limite: 8.5 });
ok(lim[lim.length - 1].end <= 8.5, 'não passa do fim do clipe/projeto');

// sem dados de volume: continua funcionando (só a DTW)
const sem = temposDasPalavras(palavras, null);
ok(sem.length === 7 && perto(sem[0].t0, 3.3), 'sem volume, usa a DTW');
// sem DTW (td nulo): usa os tempos normais e a voz corrige o começo
const semDtw = temposDasPalavras(palavras.map((w) => ({ ...w, td: null })), reg);
ok(semDtw.every((w) => w.t0 >= 2.95), 'sem DTW, a voz ainda tira a legenda do silêncio', semDtw.slice(0, 3).map((w) => w.t0.toFixed(2)).join(','));
ok(groupWords(semDtw)[0].start >= 2.95, 'sem DTW, a 1ª legenda começa com a voz');
// música o tempo todo (sem contraste): só o silêncio digital separa
const musica = new Float32Array(500).map((_, i) => (i < 100 ? -120 : -20 + Math.sin(i)));
const rm = regioesDeFala(musica, passo);
ok(rm?.length === 1 && perto(rm[0][0], 1, 0.05), 'com música o tempo todo, só o trecho mudo fica de fora', JSON.stringify(rm));

// --- edição em grupo
const base = () => ({
  id: 'a', type: 'video', mediaId: 'm', start: 0, duration: 3, in: 0, speed: 1, volume: 1,
  transform: { x: 0, y: 0, scale: 1, rotation: 0 }, adjust: {}, animIn: null, text: undefined,
});
const lider0 = base();
const lider1 = structuredClone(lider0);
lider1.transform.scale = 1.4; lider1.adjust.brightness = 20; lider1.volume = 0.5; lider1.animIn = { id: 'fade', duration: 0.5 };
lider1.duration = 2; lider1.start = 9; // nunca passam
const outro = { ...base(), id: 'b', start: 3, duration: 5, in: 7, transform: { x: 0.3, y: -0.1, scale: 1, rotation: 0 }, kf: { x: [{ t: 0, v: 0.3 }] } };
espelhar(lider0, lider1, outro);
ok(outro.transform.scale === 1.4 && outro.transform.x === 0.3 && outro.transform.y === -0.1, 'escala vai; a posição do outro fica');
ok(outro.adjust.brightness === 20 && outro.volume === 0.5 && outro.animIn?.id === 'fade', 'ajuste, volume e animação vão');
ok(outro.start === 3 && outro.duration === 5 && outro.in === 7 && outro.kf.x.length === 1, 'tempo, trecho e pontos de cada um ficam');
// texto: o conteúdo é de cada um
const t0 = { id: 't1', type: 'text', text: { content: 'Olá', font: 'A', color: '#fff', stroke: { enabled: false, color: '#000', width: 4 } } };
const t1 = structuredClone(t0); t1.text.font = 'B'; t1.text.stroke.enabled = true;
const t2 = { id: 't2', type: 'text', text: { content: 'Tchau', font: 'A', color: '#f00', stroke: { enabled: false, color: '#123', width: 9 } } };
espelhar(t0, t1, t2);
ok(t2.text.content === 'Tchau' && t2.text.font === 'B' && t2.text.color === '#f00' && t2.text.stroke.enabled && t2.text.stroke.width === 9, 'texto: muda a fonte e o contorno, mantém o texto e a cor do outro');
// estilo pronto (troca o objeto text inteiro): ainda mantém o conteúdo
const t3 = structuredClone(t0); t3.text = { content: 'Olá', font: 'C', color: '#0f0' };
espelhar(t0, t3, t2);
ok(t2.text.content === 'Tchau' && t2.text.font === 'C' && t2.text.color === '#0f0' && t2.text.stroke === undefined, 'estilo pronto vai inteiro, menos o texto');
// campo que some (ex.: tirar a animação contínua)
const l0 = { id: 'x', type: 'video', animLoop: { id: 'pulse', speed: 1 } }, l1 = { id: 'x', type: 'video', animLoop: null };
const o = { id: 'y', type: 'video', animLoop: { id: 'float', speed: 2 } };
espelhar(l0, l1, o);
ok(o.animLoop === null, 'tirar a animação tira dos outros');
// objeto que o outro não tem: vai inteiro
const c0 = { id: 'x', type: 'video' }, c1 = { id: 'x', type: 'video', chroma: { on: true, color: '#00ff00', similarity: 40 } };
const oc = { id: 'y', type: 'video' };
espelhar(c0, c1, oc);
ok(oc.chroma?.on && oc.chroma.similarity === 40, 'chroma novo vai inteiro');

// grupo da seleção
const proj = { tracks: [
  { id: 'm', main: true, clips: [{ id: 'v1', type: 'video' }, { id: 'v2', type: 'video' }, { id: 'v3', type: 'video' }] },
  { id: 't', clips: [{ id: 'x1', type: 'text', text: {} }, { id: 'x2', type: 'text', text: {} }, { id: 's1', type: 'text', sticker: true, text: {} }] },
] };
ok(grupoDaSelecao(proj, { type: 'clip', id: 'v2', ids: ['v1', 'v2', 'v3'] })?.lider === 'v2', 'seleção de um tipo só vira grupo (líder = o clicado)');
ok(grupoDaSelecao(proj, { type: 'clip', id: 'v1', ids: ['v1', 'x1'] }) === null, 'seleção mista sem escolha: painel de seleção');
const gm = grupoDaSelecao(proj, { type: 'clip', id: 'v1', ids: ['v1', 'v2', 'x1', 'x2'], grupo: 'text' });
ok(gm?.tipo === 'text' && gm.lider === 'x1' && gm.ids.length === 2 && gm.resto === 2, 'seleção mista com tipo escolhido', JSON.stringify(gm));
ok(tipoGrupo({ type: 'text', sticker: true }) === 'sticker' && grupoDaSelecao(proj, { type: 'clip', id: 'x1', ids: ['x1', 's1'] }) === null, 'texto e sticker não se misturam');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
