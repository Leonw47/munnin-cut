// Análise da voz no processo principal: perfil do ruído e nível da fala de uma mídia (com cache) e
// extração de um trecho do áudio para a exportação. O perfil usa o MESMO código do processador da prévia
// (public/voz-worklet.js, carregado aqui numa caixa de areia), então prévia e exportação batem.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const SR = 48000;

export function createVoz({ ffmpeg, cacheDir, workletPath }) {
  const dir = path.join(cacheDir, 'voz');
  fs.mkdirSync(dir, { recursive: true });
  let dsp = null;
  const carregar = () => {
    if (!dsp) {
      const ctx = { Math, Float32Array, Float64Array, Uint32Array };
      ctx.globalThis = ctx;
      vm.runInNewContext(fs.readFileSync(workletPath, 'utf8'), ctx);
      dsp = ctx.__mcVoz;
    }
    return dsp;
  };
  const emAndamento = new Map();

  function decodificar(p, ss, t) {
    return new Promise((resolve, reject) => {
      const args = ['-hide_banner', '-nostdin', '-v', 'error', '-ss', String(ss), '-t', String(t), '-i', p,
        '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'];
      const pr = spawn(ffmpeg, args, { windowsHide: true });
      const partes = [];
      let err = '';
      pr.stdout.on('data', (b) => partes.push(b));
      pr.stderr.on('data', (b) => { err += b; });
      pr.on('error', reject);
      pr.on('close', (code) => {
        if (code !== 0 && !partes.length) { reject(new Error(err.trim() || `ffmpeg saiu com código ${code}`)); return; }
        const b = Buffer.concat(partes);
        const a = new Float32Array(b.length >> 2);
        new Uint8Array(a.buffer).set(b.subarray(0, a.length * 4));
        resolve(a);
      });
    });
  }

  /** { perfil: number[] | null, nivel: dBFS | null } — até 5 min analisados (10 trechos espalhados). */
  async function analisar(p, duracao) {
    const st = fs.statSync(p);
    const chave = crypto.createHash('sha1').update(`${p}|${st.size}|${Math.round(st.mtimeMs)}|v1`).digest('hex').slice(0, 20);
    const arq = path.join(dir, `perfil_${chave}.json`);
    if (fs.existsSync(arq)) return JSON.parse(fs.readFileSync(arq, 'utf8'));
    if (emAndamento.has(arq)) return emAndamento.get(arq);
    const job = (async () => {
      const D = Math.max(0, duracao || 0);
      const trechos = D <= 300 ? [[0, D || 300]] : Array.from({ length: 10 }, (_, i) => [((D - 30) * i) / 9, 30]);
      const pedacos = [];
      for (const [ss, t] of trechos) pedacos.push(await decodificar(p, ss.toFixed(3), t.toFixed(3)));
      const total = pedacos.reduce((s, a) => s + a.length, 0);
      const x = new Float32Array(total);
      let o = 0;
      for (const a of pedacos) { x.set(a, o); o += a.length; }
      const perfil = carregar().perfilRuido(x);
      // nível da fala: percentil 90 do RMS em janelas de 50 ms
      const w = Math.round(0.05 * SR), rms = [];
      for (let i = 0; i + w <= x.length; i += w) {
        let s = 0;
        for (let j = i; j < i + w; j++) s += x[j] * x[j];
        rms.push(Math.sqrt(s / w));
      }
      rms.sort((a, b) => a - b);
      const p90 = rms.length ? rms[Math.floor(rms.length * 0.9)] : 0;
      const res = { perfil: perfil ? Array.from(perfil) : null, nivel: p90 > 1e-6 ? 20 * Math.log10(p90) : null };
      await fsp.writeFile(arq, JSON.stringify(res));
      return res;
    })();
    emAndamento.set(arq, job);
    try { return await job; } finally { emAndamento.delete(arq); }
  }

  /** Extrai [ss, ss+t] do áudio como WAV estéreo 48 kHz (float) em `destino`. */
  function extrair(p, ss, t, destino) {
    return new Promise((resolve, reject) => {
      const args = ['-hide_banner', '-nostdin', '-v', 'error', '-y', '-ss', String(ss), '-t', String(t), '-i', p,
        '-vn', '-ac', '2', '-ar', String(SR), '-c:a', 'pcm_f32le', destino];
      const pr = spawn(ffmpeg, args, { windowsHide: true });
      let err = '';
      pr.stderr.on('data', (b) => { err += b; });
      pr.on('error', reject);
      pr.on('close', (code) => (code === 0 ? resolve(destino) : reject(new Error(err.trim() || `ffmpeg saiu com código ${code}`))));
    });
  }

  return { analisar, extrair, dir };
}
