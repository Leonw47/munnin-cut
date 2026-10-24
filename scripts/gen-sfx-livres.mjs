// Gera a biblioteca de sons LIVRES (CC0) embutida no app, a partir da curadoria em scripts/sfx/livres.mjs:
//   resources/sfx-livres/<id>.ogg   — cortado (silêncio e excesso), volume nivelado, OGG Vorbis
//   resources/sfx-livres/index.json — duração e canais
//   resources/sfx-livres/CREDITOS.txt
//   src/shared/sfxLivres.js        — catálogo (id, nome, categoria, fonte) usado pela interface
// As fontes são baixadas uma vez para %TEMP%\munnin-sfx-livres-fontes. Uso: node scripts/gen-sfx-livres.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { BSB, KENNEY_ZIPS, KENNEY_GRUPOS, KENNEY_VOZES, ALVO, ALVO_PADRAO, MAX_DUR, MAX_PADRAO } from './sfx/livres.mjs';

const FF = path.resolve('resources/bin/ffmpeg.exe');
const FP = path.resolve('resources/bin/ffprobe.exe');
const CACHE = path.join(os.tmpdir(), 'munnin-sfx-livres-fontes');
const OUT = path.resolve('resources/sfx-livres');
const SR = 44100;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function baixar(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'MunninCut-gerador-de-sons (github.com/Leonw47/munnin-cut)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.writeFileSync(`${dest}.part`, Buffer.from(await r.arrayBuffer()));
      fs.renameSync(`${dest}.part`, dest);
      return true;
    } catch (e) {
      if (t === 2) throw new Error(`${url}: ${e.message}`);
      await sleep(1500);
    }
  }
  return false;
}

function arquivos(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...arquivos(p));
    else out.push(p);
  }
  return out;
}

// ---------- lista do que gerar: { id, name, cat, fonte, src, max } ----------
const itens = [];
const vistos = new Set();
const add = (it) => {
  if (vistos.has(it.id)) throw new Error(`id repetido: ${it.id}`);
  vistos.add(it.id);
  itens.push(it);
};

// Kenney
for (const [pack, url] of Object.entries(KENNEY_ZIPS)) {
  const zip = path.join(CACHE, 'kenney', `${pack}.zip`);
  const dir = path.join(CACHE, 'kenney', pack);
  await baixar(url, zip);
  if (!fs.existsSync(dir)) {
    // tar do Windows (bsdtar lê zip); o do Git Bash confunde "C:" com servidor remoto
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    const tmp = `${dir}.part`;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const r = spawnSync(fs.existsSync(tar) ? tar : 'tar', ['-xf', zip, '-C', tmp]);
    if (r.status !== 0) throw new Error(`não descompactou ${zip}: ${r.stderr}`);
    fs.renameSync(tmp, dir);
  }
}
const kOgg = (pack) => arquivos(path.join(CACHE, 'kenney', pack)).filter((f) => /\.ogg$/i.test(f) && !/preview/i.test(path.basename(f))).sort();
const semNumero = (f) => path.basename(f, path.extname(f)).replace(/[-_]?\d+$/, '');
const limpaId = (s) => s.replace(/[^A-Za-z0-9]+/g, '_');
for (const [pack, re, nome, cat, max] of KENNEY_GRUPOS) {
  const fs_ = kOgg(pack).filter((f) => re.test(semNumero(f)));
  if (!fs_.length) throw new Error(`Kenney ${pack}: nada casou ${re}`);
  const usados = fs_.slice(0, max || fs_.length);
  usados.forEach((f, i) => add({
    id: `k_${pack}_${limpaId(path.basename(f, '.ogg'))}`,
    name: usados.length > 1 ? `${nome} ${i + 1}` : nome,
    cat, fonte: 'Kenney', src: f,
  }));
}
// locuções em inglês
const fala = (stem) => {
  const n = /^(\d+)$/.exec(stem);
  if (n) return KENNEY_VOZES.numeros[Number(n[1]) - 1] || stem;
  const t = stem.replace(/_/g, ' ').replace(/\bits\b/, "it's");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
for (const f of kOgg('fighter')) {
  const stem = path.basename(f, '.ogg');
  if (KENNEY_VOZES.fora.test(stem)) continue;
  add({ id: `k_fighter_${limpaId(stem)}`, name: `“${fala(stem)}” (locutor)`, cat: 'voice', fonte: 'Kenney', src: f });
}
for (const f of kOgg('voice')) {
  const stem = path.basename(f, '.ogg');
  if (KENNEY_VOZES.fora.test(stem)) continue;
  const fem = /[\\/]Female[\\/]/i.test(f);
  add({ id: `k_voice_${fem ? 'f' : 'm'}_${limpaId(stem)}`, name: `“${fala(stem)}” (voz ${fem ? 'feminina' : 'masculina'})`, cat: 'voice', fonte: 'Kenney', src: f });
}

// BigSoundBank (FLAC, sem perdas)
let baixados = 0;
for (const [num, nome, cat, max] of BSB) {
  // nem todo som tem FLAC no site: tenta FLAC, depois MP3 e OGG
  let dest = ['flac', 'mp3', 'ogg'].map((e) => path.join(CACHE, 'bsb', `${num}.${e}`)).find((p) => fs.existsSync(p) && fs.statSync(p).size > 0);
  for (const e of ['flac', 'mp3', 'ogg']) {
    if (dest) break;
    const d = path.join(CACHE, 'bsb', `${num}.${e}`);
    try { await baixar(`https://bigsoundbank.com/UPLOAD/${e}/${num}.${e}`, d); dest = d; baixados++; await sleep(250); } catch { /* tenta o próximo formato */ }
  }
  if (!dest) throw new Error(`BigSoundBank #${num}: nenhum formato disponível`);
  add({ id: `b${num}`, name: nome, cat, fonte: 'BigSoundBank', src: dest, max, num });
}
console.log(`${itens.length} sons na lista (${baixados} baixados agora do BigSoundBank)`);

// ---------- processamento ----------
function canais(f) {
  const r = spawnSync(FP, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', f]);
  return Math.min(2, Math.max(1, parseInt(String(r.stdout).trim(), 10) || 1));
}
function decodifica(f, ch) {
  const r = spawnSync(FF, ['-v', 'error', '-i', f, '-map', '0:a:0', '-ac', String(ch), '-ar', String(SR), '-f', 'f32le', 'pipe:1'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`decodificar ${f}: ${String(r.stderr).slice(-300)}`);
  const b = r.stdout;
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
}
// volume percebido (mesma medida de scripts/gen-sfx.mjs): RMS em janelas de 400 ms, só das janelas com som
function loudness(x, ch) {
  const n = x.length / ch, win = Math.round(0.4 * SR), hop = win / 2;
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  if (!p) return { db: -120, peak: 0 };
  const rs = [];
  for (let i = 0; i + win <= Math.max(n, win); i += hop) {
    let acc = 0, k = 0;
    for (let j = i; j < Math.min(n, i + win); j++) for (let c = 0; c < ch; c++) { const v = x[j * ch + c] / p; acc += v * v; k++; }
    rs.push(Math.sqrt(acc / Math.max(1, k)));
  }
  const at = rs.filter((r) => r > 10 ** (-50 / 20));
  const rms = at.length ? Math.sqrt(at.reduce((a, r) => a + r * r, 0) / at.length) : 1e-4;
  return { db: 20 * Math.log10(rms * p), peak: p };
}

const index = {};
const t0 = Date.now();
let i = 0;
for (const it of itens) {
  i++;
  const ch = canais(it.src);
  let x = decodifica(it.src, ch);
  let n = x.length / ch;
  let pk = 0;
  for (const v of x) pk = Math.max(pk, Math.abs(v));
  const amb = it.cat === 'ambience';
  // tira o silêncio do começo e do fim (menos nos ambientes)
  let a = 0, b = n;
  if (!amb && pk > 0) {
    const lim = pk * 10 ** (-45 / 20);
    const alto = (j) => { for (let c = 0; c < ch; c++) if (Math.abs(x[j * ch + c]) > lim) return true; return false; };
    while (a < n && !alto(a)) a++;
    while (b > a && !alto(b - 1)) b--;
    a = Math.max(0, a - Math.round(0.01 * SR));
    b = Math.min(n, b + Math.round(0.08 * SR));
  }
  const max = it.max || MAX_DUR[it.cat] || MAX_PADRAO;
  const cortado = b - a > max * SR;
  if (cortado) b = a + Math.round(max * SR);
  x = x.slice(a * ch, b * ch);
  n = b - a;
  // entradas/saídas suaves (no corte, saída longa)
  // (sons curtíssimos, como cliques de 10 ms, só levam fades proporcionais ao tamanho)
  const fin = Math.min(Math.floor(n / 8), Math.round(0.004 * SR));
  const fout = Math.min(Math.floor(n / 4), Math.round((cortado ? (amb ? 1.5 : 0.6) : 0.02) * SR));
  for (let j = 0; j < fin; j++) for (let c = 0; c < ch; c++) x[j * ch + c] *= j / fin;
  for (let j = 0; j < fout; j++) for (let c = 0; c < ch; c++) x[(n - 1 - j) * ch + c] *= j / fout;
  // volume alvo, sem passar de −1 dB de pico
  const L = loudness(x, ch);
  const ganho = L.peak ? Math.min(10 ** (((ALVO[it.cat] ?? ALVO_PADRAO) - L.db) / 20), 0.89 / L.peak) : 1;
  for (let j = 0; j < x.length; j++) x[j] *= ganho;
  const out = path.join(OUT, `${it.id}.ogg`);
  const r = spawnSync(FF, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', String(ch), '-i', 'pipe:0', '-c:a', 'libvorbis', '-q:a', '4', out],
    { input: Buffer.from(x.buffer, x.byteOffset, x.byteLength), maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`codificar ${it.id}: ${String(r.stderr).slice(-300)}`);
  index[it.id] = { dur: Math.round((n / SR) * 100) / 100, ch };
  if (i % 50 === 0) console.log(`${i}/${itens.length}…`);
}
// apaga arquivos que saíram da curadoria
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.ogg') && !index[f.slice(0, -4)]) fs.rmSync(path.join(OUT, f));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));

// catálogo para a interface
const lista = itens.map(({ id, name, cat, fonte }) => ({ id, name, cat, fonte }));
fs.writeFileSync(path.resolve('src/shared/sfxLivres.js'),
  '// GERADO por scripts/gen-sfx-livres.mjs a partir de scripts/sfx/livres.mjs — não editar à mão.\n' +
  '// Sons de domínio público (CC0): Kenney (kenney.nl) e BigSoundBank / Joseph Sardin (bigsoundbank.com).\n' +
  `export const SFX_LIVRES = [\n${lista.map((s) => `  ${JSON.stringify(s)},`).join('\n')}\n];\n`);

// créditos (CC0 não exige, mas é justo)
const bsb = itens.filter((x) => x.fonte === 'BigSoundBank');
fs.writeFileSync(path.join(OUT, 'CREDITOS.txt'), [
  'Sons de domínio público (Creative Commons Zero, CC0) incluídos no Munnin Cut',
  '',
  `Kenney — www.kenney.nl (${itens.length - bsb.length} sons): pacotes Casino Audio, Sci-fi Sounds, Interface Sounds, Impact Sounds,`,
  '  Voiceover Pack, Voiceover Pack (Fighter), Music Jingles, RPG Audio, Digital Audio e UI Audio.',
  '  Licença: Creative Commons Zero (CC0) — http://creativecommons.org/publicdomain/zero/1.0/',
  '',
  `BigSoundBank — Joseph SARDIN — https://bigsoundbank.com (${bsb.length} sons).`,
  '  Licença: Creative Commons CC0 1.0 Universal / domínio público — https://bigsoundbank.com/licenses.html',
  '  Sons usados (número no site → nome no app):',
  ...bsb.map((x) => `    #${x.num}  ${x.name}`),
  '',
  'Os arquivos foram cortados (silêncio e excesso), tiveram o volume nivelado e foram convertidos para OGG.',
].join('\n'));

const total = fs.readdirSync(OUT).filter((f) => f.endsWith('.ogg')).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`${itens.length} sons em ${OUT} — ${(total / 1048576).toFixed(1)} MB (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
