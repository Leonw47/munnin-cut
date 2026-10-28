// Efeito aplicado só numa ÁREA da tela (ex.: uma torção só no rosto). O efeito roda num recorte do quadro do
// tamanho da área — então distorções, zoom e camadas ficam centrados nela — e volta com bordas suaves.
// clip.area = { on, forma: 'ellipse' | 'rect', x, y (centro, fração da tela a partir do meio), w, h (fração da
// tela), suave (0–100), inverter (aplica fora da área) }. Mesmas contas na prévia e na exportação.

export const AREA_PADRAO = { on: true, forma: 'ellipse', x: 0, y: -0.1, w: 0.4, h: 0.45, suave: 30, inverter: false };

const par = (v) => Math.max(2, Math.round(v / 2) * 2);

// largura da borda suave em pixels (fração do menor lado da forma)
export function suavePx(area, W, H) {
  const a = { ...AREA_PADRAO, ...area };
  return (Math.max(0, Math.min(100, a.suave)) / 100) * 0.25 * Math.min(a.w * W, a.h * H);
}

// Caixa (pixels pares, dentro da tela) onde o efeito é calculado: a forma + a borda suave. "Inverter" usa a tela inteira.
export function areaCaixa(area, W, H) {
  const a = { ...AREA_PADRAO, ...area };
  if (a.inverter) return { x: 0, y: 0, w: par(W), h: par(H) };
  const f = suavePx(a, W, H);
  const cx = W / 2 + a.x * W, cy = H / 2 + a.y * H;
  let x0 = Math.floor((cx - (a.w * W) / 2 - f) / 2) * 2, y0 = Math.floor((cy - (a.h * H) / 2 - f) / 2) * 2;
  let x1 = Math.ceil(cx + (a.w * W) / 2 + f), y1 = Math.ceil(cy + (a.h * H) / 2 + f);
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  x1 = Math.min(W, x1); y1 = Math.min(H, y1);
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  const w = Math.min(par(x1 - x0), Math.floor((W - x0) / 2) * 2), h = Math.min(par(y1 - y0), Math.floor((H - y0) / 2) * 2);
  return { x: x0, y: y0, w, h };
}

// Desenha a máscara (branco opaco = onde o efeito vale) num contexto do tamanho da caixa.
export function desenhaMascara(ctx, area, bb, W, H) {
  const a = { ...AREA_PADRAO, ...area };
  const f = suavePx(a, W, H);
  const cx = W / 2 + a.x * W - bb.x, cy = H / 2 + a.y * H - bb.y;
  // a borda suave fica para dentro da forma (o tamanho visível continua o da caixa no reprodutor)
  const rw = Math.max(1, (a.w * W) / 2 - f / 2), rh = Math.max(1, (a.h * H) / 2 - f / 2);
  ctx.save();
  ctx.clearRect(0, 0, bb.w, bb.h);
  const forma = () => {
    ctx.beginPath();
    if (a.forma === 'rect') ctx.rect(cx - rw, cy - rh, rw * 2, rh * 2);
    else ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
  };
  if (a.inverter) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, bb.w, bb.h);
    ctx.globalCompositeOperation = 'destination-out';
  }
  ctx.filter = f > 0.5 ? `blur(${(f / 2).toFixed(1)}px)` : 'none';
  ctx.fillStyle = '#fff';
  forma();
  ctx.fill();
  ctx.restore();
}
