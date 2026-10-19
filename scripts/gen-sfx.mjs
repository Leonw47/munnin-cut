// Gera a biblioteca de efeitos sonoros (resources/sfx/<id>.wav + index.json) a partir das receitas.
// Uso: node scripts/gen-sfx.mjs [ids separados por vírgula]
import fs from 'node:fs';
import path from 'node:path';
import { SFX } from '../src/shared/sfx.js';
import { RECIPES, LOUDNESS, LOUDNESS_DEFAULT, KEEP_TAIL } from './sfx/recipes.mjs';
import { SR, dcBlock, trimTail, fade, peak, mul } from './sfx/dsp.mjs';

const OUT = path.resolve('resources/sfx');
fs.mkdirSync(OUT, { recursive: true });
const only = (process.argv[2] || '').split(',').filter(Boolean);

const faltando = SFX.filter((s) => !RECIPES[s.id]).map((s) => s.id);
const sobrando = Object.keys(RECIPES).filter((id) => !SFX.some((s) => s.id === id));
if (faltando.length || sobrando.length) {
  console.error('catálogo e receitas não batem:', { faltando, sobrando });
  process.exit(1);
}

function wav(chans) {
  const n = chans[0].length, ch = chans.length, bytes = n * ch * 2;
  const b = Buffer.alloc(44 + bytes);
  b.write('RIFF', 0); b.writeUInt32LE(36 + bytes, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * ch * 2, 28); b.writeUInt16LE(ch * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(bytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(chans[c][i] * 32767))), o); o += 2; }
  return b;
}

// volume percebido: RMS em janelas de 400 ms, só das janelas com som (acima de −50 dB do pico)
function loudness(chans) {
  const n = chans[0].length, win = Math.round(0.4 * SR), hop = win / 2, p = Math.max(...chans.map(peak)) || 1, rs = [];
  for (let i = 0; i + win <= Math.max(n, win); i += hop) {
    let acc = 0, k = 0;
    for (let j = i; j < Math.min(n, i + win); j++) for (const c of chans) { acc += (c[j] / p) ** 2; k++; }
    rs.push(Math.sqrt(acc / Math.max(1, k)));
  }
  const ativos = rs.filter((r) => r > 10 ** (-50 / 20));
  const rms = ativos.length ? Math.sqrt(ativos.reduce((a, r) => a + r * r, 0) / ativos.length) : 1e-4;
  return 20 * Math.log10(rms * p);
}

const idxPath = path.join(OUT, 'index.json');
const index = fs.existsSync(idxPath) && only.length ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : {};
const t0 = Date.now();
let problemas = 0;
for (const s of SFX) {
  if (only.length && !only.includes(s.id)) continue;
  const t1 = Date.now();
  let chans = RECIPES[s.id]();
  if (!Array.isArray(chans)) chans = [chans];
  chans = chans.map(dcBlock);
  const n = Math.min(...chans.map((c) => c.length));
  chans = chans.map((c) => c.slice(0, n));
  if (!KEEP_TAIL.has(s.id)) {
    const mix = chans[0].map((v, i) => Math.max(Math.abs(v), Math.abs(chans[chans.length - 1][i])));
    const end = trimTail(mix, 0.0015 * peak(mix), 0.04).length;
    chans = chans.map((c) => c.slice(0, end));
  }
  chans = chans.map((c) => fade(c, 0.001, Math.min(0.03, c.length / SR / 4)));
  const ganho = Math.min(10 ** (((LOUDNESS[s.id] ?? LOUDNESS_DEFAULT) - loudness(chans)) / 20), 0.89 / Math.max(...chans.map(peak)));
  chans = chans.map((c) => mul(c, ganho));
  if (chans.some((c) => c.some((v) => !Number.isFinite(v)))) { console.log('NaN em', s.id); problemas++; continue; }
  fs.writeFileSync(path.join(OUT, `${s.id}.wav`), wav(chans));
  const dur = chans[0].length / SR;
  index[s.id] = { dur: Math.round(dur * 100) / 100, ch: chans.length };
  console.log(`${s.id.padEnd(16)} ${dur.toFixed(2).padStart(5)} s  ${chans.length === 2 ? 'estéreo' : 'mono   '}  ${Date.now() - t1} ms`);
}
fs.writeFileSync(idxPath, JSON.stringify(index));
console.log(`${Object.keys(index).length} sons em ${OUT} (${((Date.now() - t0) / 1000).toFixed(1)} s)${problemas ? ` — ${problemas} com problema` : ''}`);
process.exitCode = problemas ? 1 : 0;
