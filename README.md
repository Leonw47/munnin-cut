# Munnin Cut

Editor de vídeo para Windows com interface no estilo CapCut, sem recursos pagos e sem marca d'água.

## Instalar
Baixe o instalador da versão mais recente em **Releases** (`MunninCut-Setup-<versão>.exe`) e execute. O Windows pode avisar que o app não é assinado:
clique em **Mais informações → Executar assim mesmo**.

## O que tem
- Linha do tempo com faixa principal magnética, sobreposições, textos, stickers, efeitos e áudios;
  dividir (Ctrl+B), aparar, mover, duplicar, copiar/colar, desfazer/refazer, ímã e zoom.
- Transições (24, via `xfade`), animações de entrada/saída, filtros de cor, ajustes (brilho, contraste,
  saturação, temperatura, matiz, nitidez, vinheta, desfoque) e efeitos (VHS, granulado, flash, barras de cinema…).
- 94 efeitos no estilo CapCut, em categorias: Básico (fades, abrir/fechar, desfoque pulsante…), Luz suave,
  Câmera (zoom lento, zoom rápido, pulsar, tremor, terremoto, balanço, girar, panorâmica, estroboscópio, REC),
  Retrô (VHS, filme antigo, Super 8…), Glitch (RGB, blocos, pixel, onda), Luz e cor (brilho suave, sonho,
  vazamento de luz, arco-íris, duotones), Divisão (2/3/4/9 telas, espelhos, caleidoscópio) e Partículas
  (corações, estrelas, confete, neve, chuva, bolhas, contagem 3-2-1), Iluminação (raios, holofote,
  lens flare, bokeh, borda neon…), Aura e Transição criativa (giro de câmera, chicote, impacto…).
- 34 transições, incluindo as de câmera (giro, zoom, chicote, rolar, impacto) com desfoque de movimento.
- Cortar áudio direto no bloco da linha do tempo (com a duração à vista) ou antes de inserir (teclas I e O).
- Legendas automáticas offline (whisper.cpp) com estilos e revisão do texto.
- Resiliência: arquivos trocados com o mesmo nome são relidos mantendo os efeitos; arquivos movidos são
  reencontrados pelo nome; ausentes aparecem com Localizar/Substituir. Projetos podem ser duplicados como modelo.
- Texto com fontes embutidas, contorno, sombra e fundo; stickers de emoji.
- Velocidade (0,1x a 10x, com o som acompanhando), volume, entrada/saída suave, separar áudio, gravar narração.
- Fundo desfocado para vídeos que não preenchem o quadro (ex.: vídeo deitado em 9:16).
- Importa praticamente qualquer formato (o que o Chromium não toca ganha um proxy só para a prévia).
- Exporta MP4 e MOV (H.264/H.265/ProRes), WebM, MKV, AVI, GIF, MP3, WAV, M4A e FLAC, de 480p a 4K,
  com qualidade por taxa de bits e tamanho estimado antes de exportar.
- Projetos salvos automaticamente em `Documentos\Munnin Cut\Projetos`; cópia em arquivo `.mcut`.

## Como funciona
- `electron/` — processo principal: janela, protocolo `media://` (leitura com Range), FFmpeg/FFprobe, rascunhos.
- `src/shared/effects.js` — catálogo de efeitos: cada um tem a versão de prévia (canvas) e a de exportação
  (FFmpeg aplicado só no trecho do clipe, via split/trim/concat); as camadas desenhadas (partículas, REC…)
  usam a mesma função nos dois lados e viram uma sequência de PNGs na exportação.
- `src/shared/` — regras puras usadas na prévia **e** na exportação: `ops.js` (matrizes de cor iguais às do CSS),
  `anim.js`, `timeline.js`, `graph.js` (monta o `filter_complex` do FFmpeg), `camtrans.js` (transições de câmera)
  e `expr.js` (avalia na prévia as mesmas expressões que vão para o FFmpeg).
- `src/engine/` — prévia em canvas: compositor, transições, texto, sincronização dos `<video>`/`<audio>`.
- `src/components/` e `src/panels/` — interface (React + zustand).

## Desenvolvimento
```bash
npm install
npm run ffmpeg            # baixa ffmpeg.exe/ffprobe.exe para resources/bin (não versionados: >100 MB)
npm run whisper           # baixa o whisper.cpp (legendas) para resources/whisper
npm start                 # compila a interface e abre o app
npm run dist              # gera o instalador em release/
node scripts/test-graph.mjs mp4 webm gif mp3 prores   # testa o montador de exportação
node scripts/test-effects.mjs                         # exporta cada efeito animado e gera uma folha de amostras
node scripts/test-transitions.mjs                     # exporta cada transição de câmera
node scripts/test-size.mjs                            # compara o tamanho estimado com o real
```
Testes de interface: `MC_AUTOTEST=scripts/autotest-ui.js npx electron .` (também `autotest-interact.js`, `autotest-fx.js`, `autotest-v12.js`, `autotest-v13.js` e `autotest-scroll.js`).
O FFmpeg fica em `resources/bin/` (não versionado). Histórico de versões em [CHANGELOG.md](CHANGELOG.md).
