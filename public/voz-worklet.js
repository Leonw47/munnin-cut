// Redução de ruído da voz (prévia em tempo real e exportação pelo OfflineAudioContext — o mesmo código).
// Espectral: STFT de 1024 pontos com 75% de sobreposição (janelas raiz de Hann), ganho de Wiener com
// estimativa "decision-directed" (menos ruído musical) e piso de ganho para a voz não ficar "aquática".
// O perfil do ruído (potência por faixa) vem da análise da mídia inteira (mesmo cálculo, no processo
// principal) e é ajustado aos poucos enquanto toca. Latência fixa de N amostras (compensada na exportação).
/* global sampleRate, registerProcessor, AudioWorkletProcessor */

const N = 1024, HOP = 256, NB = N / 2 + 1;

function janela() {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  return w;
}
const W = janela();

// FFT radix-2 complexa, in-place
const REV = new Uint32Array(N), COS = new Float32Array(N / 2), SIN = new Float32Array(N / 2);
(() => {
  const bits = Math.log2(N);
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); REV[i] = r; }
  for (let i = 0; i < N / 2; i++) { COS[i] = Math.cos((2 * Math.PI * i) / N); SIN[i] = -Math.sin((2 * Math.PI * i) / N); }
})();
function fft(re, im, inv) {
  for (let i = 0; i < N; i++) {
    const j = REV[i];
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let s = 0; s < N; s += size) {
      for (let k = 0; k < half; k++) {
        const c = COS[k * step], sn = inv ? -SIN[k * step] : SIN[k * step];
        const a = s + k, b = a + half;
        const tr = re[b] * c - im[b] * sn, ti = re[b] * sn + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}

// Potência por faixa de um quadro (janela já aplicada) — usada pela análise e pelo processador.
function espectro(quadro, re, im, P) {
  for (let i = 0; i < N; i++) { re[i] = quadro[i] * W[i]; im[i] = 0; }
  fft(re, im, false);
  for (let k = 0; k < NB; k++) P[k] = re[k] * re[k] + im[k] * im[k];
}

/**
 * Perfil do ruído de um sinal mono inteiro: para cada faixa, o percentil 15 da potência (média de 4
 * quadros seguidos, para tirar a variação), corrigido para a média do ruído. Mesma janela e escala do
 * processador. `amostras`: Float32Array (48 kHz).
 */
function perfilRuido(amostras) {
  const re = new Float32Array(N), im = new Float32Array(N), P = new Float32Array(NB);
  const HOPA = 512;
  const nq = Math.max(0, Math.floor((amostras.length - N) / HOPA) + 1);
  if (nq < 8) return null;
  const MED = 4;
  const ng = Math.floor(nq / MED);
  const pot = new Float32Array(ng * NB);
  const acc = new Float64Array(NB);
  let g = 0, m = 0;
  for (let q = 0; q < nq && g < ng; q++) {
    espectro(amostras.subarray(q * HOPA, q * HOPA + N), re, im, P);
    for (let k = 0; k < NB; k++) acc[k] += P[k];
    if (++m === MED) {
      for (let k = 0; k < NB; k++) { pot[g * NB + k] = acc[k] / MED; acc[k] = 0; }
      m = 0; g++;
    }
  }
  const out = new Float32Array(NB), col = new Float32Array(ng);
  const idx = Math.max(0, Math.floor(ng * 0.15));
  for (let k = 0; k < NB; k++) {
    for (let i = 0; i < ng; i++) col[i] = pot[i * NB + k];
    col.sort();
    out[k] = col[idx] * 1.35;
  }
  // suaviza entre faixas vizinhas
  const s = new Float32Array(NB);
  for (let k = 0; k < NB; k++) s[k] = (out[Math.max(0, k - 1)] + 2 * out[k] + out[Math.min(NB - 1, k + 1)]) / 4;
  return s;
}

class Canal {
  constructor() {
    this.anel = new Float32Array(N);      // últimas N amostras de entrada (buffer circular)
    this.pos = 0;
    this.acum = new Float32Array(N);      // soma das janelas sobrepostas (saída)
    this.saida = new Float32Array(N * 2); // fila de saída pronta
    this.nSaida = HOP;                    // HOP zeros + (N − HOP) do próprio método = latência fixa de N amostras
    this.nova = 0;                        // amostras novas desde o último quadro
    this.re = new Float32Array(N); this.im = new Float32Array(N);
    this.gAnt = new Float32Array(NB).fill(1); this.postAnt = new Float32Array(NB).fill(1);
    this.ruido = null; this.suave = new Float32Array(NB); this.G = new Float32Array(NB);
  }
}

class Reducao {
  constructor(forca, perfil) {
    this.canais = [];
    this.perfil = perfil || null;
    this.ajustar(forca);
  }

  ajustar(forca) {
    const s = Math.max(0, Math.min(1, forca));
    this.s = s;
    this.excesso = 1 + 2.2 * s;                          // quanto do ruído estimado tirar
    this.piso = Math.pow(10, -(5 + 20 * s) / 20);        // ganho mínimo (−5 dB a −25 dB)
  }

  quadro(c) {
    const { re, im, G } = c;
    for (let i = 0, j = c.pos; i < N; i++, j = (j + 1) & (N - 1)) { re[i] = c.anel[j] * W[i]; im[i] = 0; }
    fft(re, im, false);
    if (!c.ruido) {
      c.ruido = this.perfil ? Float32Array.from(this.perfil) : new Float32Array(NB);
      c.semPerfil = !this.perfil;
      c.quadros = 0;
    }
    const A = 0.97;
    c.quadros++;
    for (let k = 0; k < NB; k++) {
      const P = re[k] * re[k] + im[k] * im[k];
      // acompanha o ruído: desce rápido, sobe devagar (~0,5 dB/s); sem perfil, aprende nos primeiros quadros
      c.suave[k] = c.quadros === 1 ? P : 0.8 * c.suave[k] + 0.2 * P;
      if (c.semPerfil && c.quadros <= 20) c.ruido[k] = c.quadros === 1 ? c.suave[k] : Math.min(c.ruido[k] * 1.05, c.suave[k]);
      else if (c.suave[k] < c.ruido[k]) c.ruido[k] = 0.9 * c.ruido[k] + 0.1 * c.suave[k];
      else c.ruido[k] *= 1.0006;
      if (this.perfil) c.ruido[k] = Math.min(Math.max(c.ruido[k], this.perfil[k] * 0.25), this.perfil[k] * 4);
      const n = Math.max(c.ruido[k] * this.excesso, 1e-12);
      const post = P / n;
      const prio = A * c.gAnt[k] * c.gAnt[k] * c.postAnt[k] + (1 - A) * Math.max(post - 1, 0);
      let g = prio / (1 + prio);
      if (g < this.piso) g = this.piso;
      c.gAnt[k] = g; c.postAnt[k] = post;
      G[k] = g;
    }
    // suaviza o ganho entre faixas vizinhas (menos "ruído musical")
    let ant = G[0];
    for (let k = 1; k < NB - 1; k++) { const g = 0.25 * ant + 0.5 * G[k] + 0.25 * G[k + 1]; ant = G[k]; G[k] = g; }
    for (let k = 0; k < NB; k++) {
      const g = G[k];
      re[k] *= g; im[k] *= g;
      if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    }
    fft(re, im, true);
    // janela de síntese; raiz-Hann × raiz-Hann = Hann, que somada a cada N/4 dá 2 → ×0,5; IFFT sem 1/N → ÷N
    const esc = 0.5 / N;
    for (let i = 0; i < N; i++) c.acum[i] += re[i] * W[i] * esc;
    c.saida.set(c.acum.subarray(0, HOP), c.nSaida);
    c.nSaida += HOP;
    c.acum.copyWithin(0, HOP);
    c.acum.fill(0, N - HOP);
  }

  // processa um bloco de um canal (in → out, mesmo tamanho)
  bloco(ch, inp, out) {
    let c = this.canais[ch];
    if (!c) c = this.canais[ch] = new Canal();
    const n = inp.length;
    for (let i = 0; i < n; i++) {
      c.anel[c.pos] = inp[i];
      c.pos = (c.pos + 1) & (N - 1);
      if (++c.nova === HOP) { c.nova = 0; this.quadro(c); }
    }
    out.set(c.saida.subarray(0, n));
    c.saida.copyWithin(0, n, c.nSaida);
    c.nSaida -= n;
  }
}

if (typeof AudioWorkletProcessor !== 'undefined') {
  class MCRuido extends AudioWorkletProcessor {
    constructor(opts) {
      super();
      const o = (opts && opts.processorOptions) || {};
      this.red = new Reducao(o.forca ?? 0.5, o.perfil ? new Float32Array(o.perfil) : null);
      this.vivo = true;
      this.port.onmessage = (e) => {
        const d = e.data || {};
        if (d.forca !== undefined) this.red.ajustar(d.forca);
        if (d.perfil) { this.red.perfil = new Float32Array(d.perfil); this.red.canais = []; }
        if (d.fim) this.vivo = false;          // cadeia desmontada: para de processar e deixa o nó ser liberado
      };
    }

    process(inputs, outputs) {
      if (!this.vivo) return false;
      const inp = inputs[0], out = outputs[0];
      if (!out || !out.length) return true;
      for (let ch = 0; ch < out.length; ch++) {
        const src = inp && inp.length ? inp[Math.min(ch, inp.length - 1)] : null;
        if (src) this.red.bloco(ch, src, out[ch]);
        else this.red.bloco(ch, new Float32Array(out[ch].length), out[ch]);
      }
      return true;
    }
  }
  registerProcessor('mc-ruido', MCRuido);
}

// uso fora do navegador (processo principal / testes): mesmas funções
if (typeof globalThis !== 'undefined') globalThis.__mcVoz = { N, HOP, NB, perfilRuido, Reducao, LATENCIA: N };
