// Cadeia de efeitos de áudio da prévia (Web Audio), montada a partir do mesmo plano da exportação.
import { audioFxPlan } from '../shared/audiofx.js';

// Mudança de tom sem mudar a velocidade: duas leituras de um atraso que varia (dente de serra),
// cruzadas com janelas de Hann. É o método clássico; serve para ouvir na prévia
// (a exportação usa o rubberband do FFmpeg, de qualidade maior). O processador fica em public/pitch-worklet.js.

const loading = new WeakMap();
export const workletReady = new WeakSet();
export function loadPitchWorklet(ac) {
  if (!loading.has(ac)) {
    loading.set(ac, ac.audioWorklet.addModule(new URL('pitch-worklet.js', document.baseURI).href).then(() => { workletReady.add(ac); return true; }).catch(() => false));
  }
  return loading.get(ac);
}

export function buildAudioFx(ac, fx) {
  const p = audioFxPlan(fx);
  const nodes = [];
  const stops = [];
  const input = ac.createGain();
  let cur = input;
  const chain = (n) => { cur.connect(n); cur = n; nodes.push(n); };
  const biquad = (type, freq, extra = {}) => {
    const b = ac.createBiquadFilter();
    b.type = type;
    b.frequency.value = freq;
    if (extra.q !== undefined) b.Q.value = extra.q;
    if (extra.gain !== undefined) b.gain.value = extra.gain;
    chain(b);
  };
  if (p.pitch && workletReady.has(ac)) {
    chain(new AudioWorkletNode(ac, 'mc-pitch', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], parameterData: { ratio: p.pitch } }));
  }
  // Q em dB no Web Audio: −3,01 dB = 0,707 (o padrão do highpass/lowpass do FFmpeg)
  if (p.hp) biquad('highpass', p.hp, { q: -3.0103 });
  if (p.lp) biquad('lowpass', p.lp, { q: -3.0103 });
  if (p.drive) {
    const ws = ac.createWaveShaper();
    const N = 4096, d = Math.tanh(p.drive);
    const curve = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1; curve[i] = Math.tanh(p.drive * x) / d; }
    ws.curve = curve;
    ws.oversample = '2x';
    chain(ws);
  }
  if (p.ring) {
    const g = ac.createGain();
    g.gain.value = 1 - p.ring.m;
    const osc = ac.createOscillator();
    osc.frequency.value = p.ring.freq;
    const og = ac.createGain();
    og.gain.value = p.ring.m;
    osc.connect(og).connect(g.gain);
    osc.start();
    stops.push(() => { try { osc.stop(); } catch { /* já parado */ } osc.disconnect(); og.disconnect(); });
    chain(g);
  }
  if (p.taps) {
    // igual ao aecho: saída = out · (entrada + Σ decaimento·entrada atrasada)
    const out = ac.createGain();
    const dry = ac.createGain();
    dry.gain.value = p.taps.out;
    cur.connect(dry).connect(out);
    nodes.push(dry);
    p.taps.delays.forEach((d, i) => {
      const k = p.taps.decays[i];
      if (k <= 0.001) return;
      const dl = ac.createDelay(2);
      dl.delayTime.value = d;
      const g = ac.createGain();
      g.gain.value = k * p.taps.out;
      cur.connect(dl).connect(g).connect(out);
      nodes.push(dl, g);
    });
    nodes.push(out);
    cur = out;
  }
  // prateleiras com inclinação 1 (como o Web Audio); na exportação: lowshelf/highshelf t=s:w=1
  if (Math.abs(p.bass) > 0.05) biquad('lowshelf', 150, { gain: p.bass });
  if (Math.abs(p.treble) > 0.05) biquad('highshelf', 4000, { gain: p.treble });
  return {
    input,
    output: cur,
    dispose() {
      for (const f of stops) f();
      for (const n of [input, ...nodes]) { try { n.disconnect(); } catch { /* ignore */ } }
    },
  };
}
