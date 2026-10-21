// Cadeia "Voz" no Web Audio: redução de ruído (AudioWorklet) → passa-altas → equalização de clareza →
// realce (ganho + compressor) → ambiente (reverb por convolução / chorus / voz dupla) → limitador.
// A prévia usa num AudioContext; a exportação usa a MESMA função num OfflineAudioContext.
import { vozPlano } from '../shared/voz.js';

const carregando = new WeakMap();
export const vozPronta = new WeakSet();
export function carregarVoz(ac) {
  if (!carregando.has(ac)) {
    carregando.set(ac, ac.audioWorklet.addModule(new URL('voz-worklet.js', document.baseURI).href)
      .then(() => { vozPronta.add(ac); return true; }).catch(() => false));
  }
  return carregando.get(ac);
}

// Resposta ao impulso sintética e determinística (mesma na prévia e na exportação).
const IRS = { sala: { dur: 0.7, decai: 0.18, pre: 0.006 }, auditorio: { dur: 1.9, decai: 0.55, pre: 0.018 }, igreja: { dur: 4.2, decai: 1.25, pre: 0.03 } };
function respostaImpulso(ac, id) {
  const cfg = IRS[id];
  const sr = ac.sampleRate, n = Math.round(cfg.dur * sr), pre = Math.round(cfg.pre * sr);
  const buf = ac.createBuffer(2, n + pre, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let s = (0x9e3779b9 ^ (ch + 1) * 0x85ebca6b ^ id.length * 0xc2b2ae35) >>> 0;
    let lp = 0;
    for (let i = 0; i < n; i++) {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      const r = (s / 4294967296) * 2 - 1;
      lp += 0.35 * (r - lp);                                    // um pouco mais escuro que ruído branco
      const t = i / sr;
      d[pre + i] = lp * Math.exp(-t / cfg.decai) * Math.min(1, t / 0.004);
    }
  }
  return buf;
}

/** Formato da cadeia: só muda quando um estágio liga/desliga ou o ambiente troca (aí precisa remontar). */
export function estruturaVoz(ac, voz) {
  const p = vozPlano(voz);
  return JSON.stringify([p.ruido > 0 && vozPronta.has(ac), !!p.passaAltas, !!p.eq, !!p.comp, p.ambiente?.id || null, p.limitador]);
}

/**
 * Monta a cadeia. analise: { perfil: number[]|null, nivel: dBFS|null }.
 * Devolve { input, output, latencia, atualizar(voz, analise), dispose }. Mexer num controle chama `atualizar`
 * (muda os valores na hora, sem remontar); remontar a cada movimento empilhava processadores e o som sumia.
 * Sem o worklet carregado, a redução de ruído fica de fora (a prévia remonta quando ele carregar).
 */
export function montarVoz(ac, voz, analise = null) {
  const p = vozPlano(voz, analise?.nivel ?? null);
  const nodes = [], stops = [];
  const input = ac.createGain();
  let cur = input;
  const chain = (n) => { cur.connect(n); cur = n; nodes.push(n); return n; };
  const ref = { eq: [] };
  let latencia = 0;
  let perfilEnviado = !!analise?.perfil;
  if (p.ruido > 0 && vozPronta.has(ac)) {
    ref.wk = chain(new AudioWorkletNode(ac, 'mc-ruido', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { forca: p.ruido, perfil: analise?.perfil || null },
    }));
    stops.push(() => ref.wk.port.postMessage({ fim: true }));   // o processador para de rodar e pode ser liberado
    latencia = 1024 / ac.sampleRate;
  }
  if (p.passaAltas) {
    const b = ref.hp = chain(ac.createBiquadFilter());
    b.type = 'highpass'; b.frequency.value = p.passaAltas; b.Q.value = 0.707;
  }
  for (const e of p.eq || []) {
    const b = chain(ac.createBiquadFilter());
    b.type = e.tipo; b.frequency.value = e.f; b.Q.value = e.q; b.gain.value = e.g;
    ref.eq.push(b);
  }
  if (p.comp) { ref.pre = chain(ac.createGain()); ref.pre.gain.value = p.preGanho; }
  // o compressor do Web Audio olha 6 ms à frente (atraso fixo); somado na latência para a exportação compensar
  const OLHA = 0.006;
  if (p.comp) {
    latencia += OLHA;
    const c = ref.comp = chain(ac.createDynamicsCompressor());
    c.threshold.value = p.comp.limiar; c.ratio.value = p.comp.razao; c.knee.value = p.comp.joelho;
    c.attack.value = p.comp.ataque; c.release.value = p.comp.solta;
    ref.pos = chain(ac.createGain()); ref.pos.gain.value = p.posGanho;
  }
  if (p.ambiente) {
    const { id, mix } = p.ambiente;
    const seco = ac.createGain(), molhado = ac.createGain(), soma = ac.createGain();
    seco.gain.value = 1 - mix * 0.5;
    molhado.gain.value = mix;
    ref.seco = seco; ref.molhado = molhado;
    cur.connect(seco).connect(soma);
    nodes.push(seco, molhado, soma);
    if (IRS[id]) {
      const cv = ac.createConvolver();
      cv.normalize = true;
      cv.buffer = respostaImpulso(ac, id);
      cur.connect(cv).connect(molhado).connect(soma);
      nodes.push(cv);
    } else {
      // chorus: duas vozes com atraso oscilando; voz dupla: uma cópia atrasada, levemente desafinada, aberta no estéreo
      const vozes = id === 'chorus' ? [{ d: 0.018, prof: 0.0025, f: 0.8, pan: -0.5 }, { d: 0.024, prof: 0.003, f: 1.25, pan: 0.5 }]
        : [{ d: 0.028, prof: 0.0012, f: 0.35, pan: -0.8 }, { d: 0.041, prof: 0.0015, f: 0.27, pan: 0.8 }];
      for (const v of vozes) {
        const dl = ac.createDelay(0.1); dl.delayTime.value = v.d;
        const lfo = ac.createOscillator(); lfo.frequency.value = v.f;
        const lg = ac.createGain(); lg.gain.value = v.prof;
        lfo.connect(lg).connect(dl.delayTime);
        lfo.start(0);
        stops.push(() => { try { lfo.stop(); } catch { /* já parado */ } lfo.disconnect(); lg.disconnect(); });
        const pn = ac.createStereoPanner(); pn.pan.value = v.pan;
        const g = ac.createGain(); g.gain.value = 0.7;
        cur.connect(dl).connect(g).connect(pn).connect(molhado);
        nodes.push(dl, g, pn);
      }
      molhado.connect(soma);
    }
    cur = soma;
  }
  if (p.limitador) {
    latencia += OLHA;
    const l = chain(ac.createDynamicsCompressor());
    l.threshold.value = -1.5; l.knee.value = 0; l.ratio.value = 20; l.attack.value = 0.001; l.release.value = 0.08;
  }
  return {
    input, output: cur, latencia,
    // mesmos estágios, valores novos (transição de 30 ms, sem estalo)
    atualizar(v2, an2 = analise) {
      const q = vozPlano(v2, an2?.nivel ?? null);
      const t = ac.currentTime, T = 0.03;
      if (ref.wk) {
        ref.wk.port.postMessage({ forca: q.ruido });
        if (an2?.perfil && !perfilEnviado) { ref.wk.port.postMessage({ perfil: an2.perfil }); perfilEnviado = true; }
      }
      if (ref.hp && q.passaAltas) ref.hp.frequency.setTargetAtTime(q.passaAltas, t, T);
      ref.eq.forEach((b, i) => { if (q.eq?.[i]) b.gain.setTargetAtTime(q.eq[i].g, t, T); });
      if (ref.pre && q.comp) {
        ref.pre.gain.setTargetAtTime(q.preGanho, t, T);
        ref.comp.threshold.setTargetAtTime(q.comp.limiar, t, T);
        ref.comp.ratio.setTargetAtTime(q.comp.razao, t, T);
        ref.pos.gain.setTargetAtTime(q.posGanho, t, T);
      }
      if (ref.seco && q.ambiente) {
        ref.seco.gain.setTargetAtTime(1 - q.ambiente.mix * 0.5, t, T);
        ref.molhado.gain.setTargetAtTime(q.ambiente.mix, t, T);
      }
    },
    dispose() {
      for (const f of stops) { try { f(); } catch { /* ignore */ } }
      for (const n of [input, ...nodes]) { try { n.disconnect(); } catch { /* ignore */ } }
    },
  };
}

// ---------- exportação ----------
function wavFloat(buffer) {
  const ch = buffer.numberOfChannels, n = buffer.length, sr = buffer.sampleRate;
  const dados = n * ch * 4;
  const ab = new ArrayBuffer(44 + dados), v = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dados, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 4, true); v.setUint16(32, ch * 4, true); v.setUint16(34, 32, true);
  str(36, 'data'); v.setUint32(40, dados, true);
  const out = new Float32Array(ab, 44);
  const cs = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  for (let i = 0, k = 0; i < n; i++) for (let c = 0; c < ch; c++) out[k++] = cs[c][i];
  return new Uint8Array(ab);
}

/** Processa um arquivo WAV (já recortado) com a cadeia "Voz"; devolve os bytes do WAV processado. */
export async function renderizarVoz(url, voz, analise) {
  const bytes = await (await fetch(url)).arrayBuffer();
  const tmp = new OfflineAudioContext(2, 48000, 48000);
  const src = await tmp.decodeAudioData(bytes);
  const SR = 48000;
  const lat = 1024;
  const ctx = new OfflineAudioContext(2, src.length + lat + Math.round(0.02 * SR), SR);
  await carregarVoz(ctx);
  const s = ctx.createBufferSource();
  s.buffer = src;
  const cadeia = montarVoz(ctx, voz, analise);
  s.connect(cadeia.input);
  cadeia.output.connect(ctx.destination);
  s.start(0);
  const res = await ctx.startRendering();
  const atraso = Math.round(cadeia.latencia * SR);
  // tira a latência fixa da redução de ruído (o som volta a casar com a imagem)
  const out = new AudioBuffer({ numberOfChannels: 2, length: src.length, sampleRate: SR });
  for (let c = 0; c < 2; c++) out.copyToChannel(res.getChannelData(c).subarray(atraso, atraso + src.length), c);
  return wavFloat(out);
}
