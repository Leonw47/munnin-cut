// Prévia × exportação em camadas com pontos de modificação de movimento (posição/escala) e escala parada grande.
// Bug da 1.10–1.11.1: na exportação os pontos ficam em __dyn (splitKf tira o kf) e o atalho "só a parte visível"
// (clipVisivel) achava que a camada estava parada — recortava e reposicionava pela escala parada e o logo saía
// maior e fora do lugar. Aqui o quadro exportado tem de bater com o tamanho/posição que a prévia calcula.
// node scripts/test-paridade.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildExport } from '../src/shared/graph.js';
import { clipVisivel } from '../src/shared/visivel.js';
import { resolveAt, splitKf } from '../src/shared/keyframes.js';
import { mediaLayerSize } from '../src/shared/timeline.js';

const FF = path.resolve('resources/bin/ffmpeg.exe');
const DIR = path.join(os.tmpdir(), 'munnin-cut-test', 'paridade');
fs.mkdirSync(DIR, { recursive: true });
const p = (n) => path.join(DIR, n);
let falhas = 0;
const ok = (cond, nome, extra = '') => { console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ` — ${extra}` : ''}`); if (!cond) falhas++; };
if (!fs.existsSync(p('vermelho.png'))) execFileSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=400x400', '-frames:v', '1', p('vermelho.png')]);

const W = 640, H = 360;
const media = { id: 'r', type: 'image', path: p('vermelho.png'), width: 400, height: 400, duration: 0 };
// escala parada 2,0 (720 px de altura, maior que 1,5 tela) — mas os pontos levam a 0,5→0,6 e x 0→0,5
const clip = {
  id: 'L', type: 'image', mediaId: 'r', start: 0, duration: 3, in: 0, speed: 1, opacity: 1,
  transform: { x: 0, y: 0, scale: 2, scaleX: 1, scaleY: 1, rotation: 0 },
  kf: { scale: [{ t: 0, v: 0.5 }, { t: 2, v: 0.6 }], x: [{ t: 0, v: 0 }, { t: 2, v: 0.5 }] },
};

// 1) a regra: com movimento em __dyn, nada de recorte
const { base, dyn } = splitKf(clip);
ok(!clipVisivel({ ...base, __dyn: dyn }, media, W, H).__visivel, 'com pontos de movimento (em __dyn) a camada não é recortada');
ok(clipVisivel(base, media, W, H).__visivel === true, 'parada e grande: continua recortando só a parte visível');

// 2) exporta e mede o quadrado vermelho em t = 1 s
// 2) exporta e mede o quadrado vermelho (caixa no quadro) contra a conta da prévia, em vários instantes
function conferir(nome, c, tempos, md = media) {
  const project = { width: W, height: H, fps: 30, background: { type: 'color', color: '#000000' }, media: [md],
    tracks: [{ id: 'ov', kind: 'overlay', clips: [c] }, { id: 'main', kind: 'video', main: true, clips: [] }] };
  const outPath = p(`paridade_${nome}.mp4`);
  const r = buildExport({ project, mediaMap: { [md.id]: md }, out: { format: 'mp4', width: W, height: H, fps: 30, quality: 'high', vKbps: 4000, aKbps: 128 }, outPath, graphPath: '__GRAPH__' });
  fs.writeFileSync(p(`grafo_${nome}.txt`), r.graph);
  execFileSync(FF, r.args.map((a) => (a === '__GRAPH__' ? p(`grafo_${nome}.txt`) : a === 'pipe:1' ? p('prog.txt') : a)), { stdio: ['ignore', 'pipe', 'pipe'] });
  for (const t of tempos) {
    const fr = resolveAt(c, t - c.start);
    const { w, h } = mediaLayerSize(fr, md, W, H);
    const giro90 = Math.abs(Math.round((fr.transform.rotation || 0) / 90)) % 2 === 1;
    const bw = giro90 ? h : w, bh = giro90 ? w : h;
    const cx = W / 2 + fr.transform.x * W, cy = H / 2 + fr.transform.y * H;
    const bytes = execFileSync(FF, ['-v', 'error', '-i', outPath, '-vf', `select=eq(n\\,${Math.round(t * 30)}),format=rgb24`, '-frames:v', '1', '-f', 'rawvideo', '-']);
    const red = (x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 3; return bytes[i] > 120 && bytes[i + 1] < 90; };
    // borda medida nas linhas do centro: primeiro e último pixel vermelho
    let x0 = -1, x1 = -1, y0 = -1, y1 = -1;
    for (let x = 0; x < W; x++) if (red(x, cy)) { if (x0 < 0) x0 = x; x1 = x; }
    for (let y = 0; y < H; y++) if (red(cx, y)) { if (y0 < 0) y0 = y; y1 = y; }
    const esp = { x0: cx - bw / 2, x1: cx + bw / 2, y0: cy - bh / 2, y1: cy + bh / 2 };
    const perto = (a, b) => Math.abs(a - b) <= 3;
    ok(perto(x0, esp.x0) && perto(x1 + 1, esp.x1) && perto(y0, esp.y0) && perto(y1 + 1, esp.y1), `${nome}, t=${t}: tamanho e posição iguais à prévia`,
      `exportado x ${x0}–${x1 + 1} y ${y0}–${y1 + 1} · prévia x ${esp.x0.toFixed(0)}–${esp.x1.toFixed(0)} y ${esp.y0.toFixed(0)}–${esp.y1.toFixed(0)}`);
  }
  return r;
}
const r = conferir('movimento', clip, [1]);
ok(!/crop=/.test(r.graph), 'o grafo não recorta a camada animada');

// 3) zoom nos pontos + opacidade que esmaece na entrada (bug do FFmpeg: colorchannelmixer/fade depois de um
//    scale que muda de tamanho a cada quadro prendiam a camada no tamanho do 1º quadro — o zoom "parava")
const zoomOpac = {
  ...clip, id: 'Z', transform: { x: 0.1, y: 0, scale: 0.8, scaleX: 1, scaleY: 1, rotation: 0 },
  kf: { scale: [{ t: 0, v: 0.8 }, { t: 2, v: 0.35 }], opacity: [{ t: 0, v: 0 }, { t: 0.3, v: 1 }] },
};
conferir('zoom_opacidade', zoomOpac, [0.6, 1.2, 2]);
// 4) o mesmo com giro fixo de 180° (vira espelhar, uma vez só) e 90° (transpor)
conferir('zoom_giro180', { ...zoomOpac, id: 'Z2', transform: { ...zoomOpac.transform, rotation: 180 } }, [1.2, 2]);
conferir('zoom_giro90', { ...zoomOpac, id: 'Z3', transform: { ...zoomOpac.transform, rotation: 90 } }, [1.2, 2]);
// 5) animação de entrada que esmaece (fade) junto com o zoom dos pontos
conferir('zoom_entrada', { ...zoomOpac, id: 'Z4', kf: { scale: zoomOpac.kf.scale }, animIn: { id: 'fade', duration: 0.5 } }, [1, 2]);
const g180 = fs.readFileSync(p('grafo_zoom_giro180.txt'), 'utf8');
ok(/hflip,vflip,loop=/.test(g180) && !/rotate=/.test(g180), 'giro fixo de 180° numa foto: espelhar uma vez, antes do laço (sem rotate a cada quadro)');

// 6) mídia pequena com zoom grande: preparada no tamanho original (100 px) e ampliada só em cada quadro
if (!fs.existsSync(p('pequeno.png'))) execFileSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=100x100', '-frames:v', '1', p('pequeno.png')]);
const pequeno = { id: 'q', type: 'image', path: p('pequeno.png'), width: 100, height: 100, duration: 0 };
const zoomGrande = { id: 'G', type: 'image', mediaId: 'q', start: 0, duration: 3, in: 0, speed: 1, opacity: 1,
  transform: { x: 0, y: 0, scale: 0.2, scaleX: 1, scaleY: 1, rotation: 90 },
  kf: { scale: [{ t: 0, v: 0.2 }, { t: 2, v: 0.6 }], opacity: [{ t: 0, v: 0 }, { t: 0.3, v: 1 }] } };
const rg = conferir('zoom_pequeno', zoomGrande, [0.6, 1.4, 2], pequeno);
ok(/\[0:v\]scale=100:100,/.test(rg.graph), 'mídia pequena com zoom: preparada no tamanho original, sem ampliar antes', (rg.graph.match(/\[0:v\]scale=\d+:\d+/) || [''])[0]);
// 7) giro e esticar animados (o caminho do logo: caixa fixa + rotate) com mídia pequena
conferir('giro_esticar', { ...zoomGrande, id: 'G2', transform: { ...zoomGrande.transform, rotation: 0 },
  kf: { ...zoomGrande.kf, rotation: [{ t: 0, v: 0 }, { t: 2, v: 0 }, { t: 2.5, v: 0 }], scaleY: [{ t: 0, v: 1 }, { t: 2, v: 1.5 }] } }, [1, 2], pequeno);

// 8) giro animado: o quadro do rotate tem de ser limpo a cada quadro (com c=none ficavam rastros dos giros anteriores)
{
  const giro = { ...clip, id: 'R', transform: { x: 0, y: 0, scale: 0.5, scaleX: 1, scaleY: 1, rotation: 0 },
    kf: { rotation: [{ t: 0, v: 0 }, { t: 2, v: 120 }] } };
  const largo = { ...media, id: 'w', path: p('largo.png'), width: 400, height: 160 };
  if (!fs.existsSync(largo.path)) execFileSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=400x160', '-frames:v', '1', largo.path]);
  giro.mediaId = 'w';
  conferir('giro_animado', giro, [], largo);
  const t = 1.5;
  const fr = resolveAt(giro, t);
  const { w, h } = mediaLayerSize(fr, largo, W, H);
  const bytes = execFileSync(FF, ['-v', 'error', '-i', p('paridade_giro_animado.mp4'), '-vf', `select=eq(n\\,${t * 30}),format=rgb24`, '-frames:v', '1', '-f', 'rawvideo', '-']);
  let n = 0;
  for (let i = 0; i < bytes.length; i += 3) if (bytes[i] > 120 && bytes[i + 1] < 90) n++;
  ok(Math.abs(n - w * h) / (w * h) < 0.05, 'giro animado sem rastro: só a área da camada fica vermelha', `${n} px vermelhos, esperado ${Math.round(w * h)}`);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
