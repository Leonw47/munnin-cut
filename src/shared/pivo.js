// Ponto pivô de uma camada (foto, vídeo, texto, forma): escala, largura/altura e giro acontecem em volta dele.
// transform.pivoX/pivoY: posição do pivô dentro da camada, em frações do tamanho dela (0,0 = centro; −0,5 = borda
// esquerda/de cima; 0,5 = direita/de baixo). Com pivô, a posição X/Y da camada é a do pivô na tela.
export const pivoDe = (tf) => ({ px: tf?.pivoX || 0, py: tf?.pivoY || 0 });
export const temPivo = (tf) => Math.abs(tf?.pivoX || 0) > 1e-6 || Math.abs(tf?.pivoY || 0) > 1e-6;

// Centro da camada a partir do pivô na tela (qx, qy), do tamanho exibido antes do giro (w, h) e do giro (graus).
export function centroDoPivo(qx, qy, w, h, rotDeg, px, py) {
  const r = ((rotDeg || 0) * Math.PI) / 180;
  const ox = px * w, oy = py * h;
  return { cx: qx - (ox * Math.cos(r) - oy * Math.sin(r)), cy: qy - (ox * Math.sin(r) + oy * Math.cos(r)) };
}

// Exportação: margem transparente (em px da camada w0×h0, já com espelhar) que põe o pivô no centro do quadro —
// daí em diante escala e giro do FFmpeg (em volta do centro) giram em volta do pivô.
export function padPivo(px, py, w0, h0) {
  const dW = 2 * Math.round(Math.abs(px) * w0), dH = 2 * Math.round(Math.abs(py) * h0);
  return { dW, dH, x: px < 0 ? dW : 0, y: py < 0 ? dH : 0 };
}
export const filtroPivo = (pp) => (pp.dW || pp.dH ? [`pad=w=iw+${pp.dW}:h=ih+${pp.dH}:x=${pp.x}:y=${pp.y}:color=black@0`] : []);

// Os 9 pontos prontos (cantos, meios das bordas e centro).
export const PIVOS = [-0.5, 0, 0.5].flatMap((py) => [-0.5, 0, 0.5].map((px) => ({ px, py })));
