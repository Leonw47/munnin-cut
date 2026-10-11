// Mistura com peso que varia no tempo, sem expressão por pixel (que é lenta no FFmpeg):
// usa vários "blend" com opacidade fixa, cada um ligado só numa janela curta de tempo.
const n4 = (x) => String(Math.round(x * 10000) / 10000);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * aL: entrada principal (A) · bL: entrada a misturar (B) · outL: saída
 * mode: 'screen' → A + K·B·(1 − A)  |  'mix' → A·(1 − K) + B·K
 * Kfn(t): peso (0..1) no tempo t do fluxo · [t0, t1): intervalo · rate: janelas por segundo
 */
export function steppedBlend({ aL, bL, outL, mode, Kfn, t0, t1, rate, L }) {
  const dt = 1 / rate;
  const steps = [];
  for (let t = t0; t < t1 - 1e-6; t += dt) {
    const e = Math.min(t1, t + dt);
    const k = clamp01(Kfn((t + e) / 2));
    const last = steps[steps.length - 1];
    if (last && Math.abs(last.k - k) < 0.01 && Math.abs(last.e - t) < 1e-6) last.e = e;
    else steps.push({ s: t, e, k });
  }
  const active = steps.filter((x) => x.k > 0.005);
  if (!active.length) return [`[${aL}]null[${outL}]`, `[${bL}]nullsink`];
  const copies = active.map(() => L('kc'));
  const parts = [`[${bL}]split=${copies.length}${copies.map((c) => `[${c}]`).join('')}`];
  let cur = aL;
  active.forEach((st, i) => {
    const o = i === active.length - 1 ? outL : L('kb');
    // no "normal", a opacidade vale para a 1ª entrada (A): A·op + B·(1 − op)
    const op = mode === 'mix' ? 1 - st.k : st.k;
    const m = mode === 'mix' ? 'normal' : 'screen';
    parts.push(`[${cur}][${copies[i]}]blend=all_mode=${m}:all_opacity=${n4(op)}:enable='between(t,${n4(st.s)},${n4(st.e - 0.0005)})'[${o}]`);
    cur = o;
  });
  return parts;
}
