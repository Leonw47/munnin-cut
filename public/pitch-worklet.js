// Processador de áudio da prévia (AudioWorklet): muda o tom sem mudar a velocidade.
// Fica num arquivo próprio porque a política de segurança da página não deixa carregar scripts criados em memória.
class MCPitch extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4 }]; }
  constructor() {
    super();
    this.N = 16384;
    this.buf = [new Float32Array(this.N), new Float32Array(this.N)];
    this.w = 0;
    this.phase = 0;
    this.win = Math.round(0.07 * sampleRate);
    this.vivo = true;
    this.port.onmessage = (e) => { if (e.data && e.data.fim) this.vivo = false; };   // cadeia desmontada
  }
  read(b, pos) {
    const N = this.N;
    pos = ((pos % N) + N) % N;
    const i = Math.floor(pos), f = pos - i;
    return b[i] * (1 - f) + b[(i + 1) % N] * f;
  }
  process(inputs, outputs, params) {
    if (!this.vivo) return false;
    const inp = inputs[0], out = outputs[0];
    const ratio = params.ratio[0];
    const win = this.win;
    const frames = out[0].length;
    for (let s = 0; s < frames; s++) {
      for (let ch = 0; ch < 2; ch++) {
        const src = inp[ch] || inp[0];
        this.buf[ch][this.w] = src ? src[s] : 0;
      }
      this.phase += (1 - ratio) / win;
      this.phase -= Math.floor(this.phase);
      const p2 = (this.phase + 0.5) % 1;
      const g1 = 0.5 - 0.5 * Math.cos(2 * Math.PI * this.phase);
      const g2 = 0.5 - 0.5 * Math.cos(2 * Math.PI * p2);
      for (let ch = 0; ch < out.length; ch++) {
        const b = this.buf[Math.min(ch, 1)];
        out[ch][s] = g1 * this.read(b, this.w - this.phase * win) + g2 * this.read(b, this.w - p2 * win);
      }
      this.w = (this.w + 1) % this.N;
    }
    return true;
  }
}
registerProcessor('mc-pitch', MCPitch);
