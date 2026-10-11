# Munnin Cut

Editor de vídeo para Windows com interface no estilo CapCut, sem recursos pagos e sem marca d'água.

## Instalar
Rode `release/MunninCut-Setup-<versão>.exe`. O Windows pode avisar que o app não é assinado:
clique em **Mais informações → Executar assim mesmo**.

## O que tem
- Linha do tempo com faixa principal magnética, sobreposições, textos, stickers, efeitos e áudios;
  dividir (Ctrl+B), aparar, mover, duplicar, copiar/colar, desfazer/refazer, ímã e zoom.
- Transições (24, via `xfade`), animações de entrada/saída, filtros de cor, ajustes (brilho, contraste,
  saturação, temperatura, matiz, nitidez, vinheta, desfoque) e efeitos (VHS, granulado, flash, barras de cinema…).
- 50 efeitos no estilo CapCut, em categorias: Básico (abrir/fechar, escurecer, desfoque pulsante…),
  Câmera (zoom lento, zoom rápido, pulsar, tremor, terremoto, balanço, girar, panorâmica, estroboscópio, REC),
  Retrô (VHS, filme antigo, Super 8…), Glitch (RGB, blocos, pixel, onda), Luz e cor (brilho suave, sonho,
  vazamento de luz, arco-íris, duotones), Divisão (2/3/4/9 telas, espelhos, caleidoscópio) e Partículas
  (corações, estrelas, confete, neve, chuva, bolhas, contagem 3-2-1).
- Texto com fontes embutidas, contorno, sombra e fundo; stickers de emoji.
- Velocidade (0,1x a 10x, com o som acompanhando), volume, entrada/saída suave, separar áudio, gravar narração.
- Fundo desfocado para vídeos que não preenchem o quadro (ex.: vídeo deitado em 9:16).
- Importa praticamente qualquer formato (o que o Chromium não toca ganha um proxy só para a prévia).
- Exporta MP4 (H.264/H.265), MOV (H.264/ProRes), WebM, MKV, AVI, GIF, MP3, WAV, M4A e FLAC, de 480p a 4K.
- Projetos salvos automaticamente em `Documentos\Munnin Cut\Projetos`; cópia em arquivo `.mcut`.

## Como funciona
- `electron/` — processo principal: janela, protocolo `media://` (leitura com Range), FFmpeg/FFprobe, rascunhos.
- `src/shared/effects.js` — catálogo de efeitos: cada um tem a versão de prévia (canvas) e a de exportação
  (FFmpeg aplicado só no trecho do clipe, via split/trim/concat); as camadas desenhadas (partículas, REC…)
  usam a mesma função nos dois lados e viram uma sequência de PNGs na exportação.
- `src/shared/` — regras puras usadas na prévia **e** na exportação: `ops.js` (matrizes de cor iguais às do CSS),
  `anim.js`, `timeline.js` e `graph.js` (monta o `filter_complex` do FFmpeg).
- `src/engine/` — prévia em canvas: compositor, transições, texto, sincronização dos `<video>`/`<audio>`.
- `src/components/` e `src/panels/` — interface (React + zustand).

## Desenvolvimento
```bash
npm install
npm start                 # compila a interface e abre o app
npm run dist              # gera o instalador em release/
node scripts/test-graph.mjs mp4 webm gif mp3 prores   # testa o montador de exportação
node scripts/test-effects.mjs                         # exporta cada efeito animado e gera uma folha de amostras
```
Testes de interface: `MC_AUTOTEST=scripts/autotest-ui.js npx electron .` (também `autotest-interact.js` e `autotest-fx.js`).
O FFmpeg usado fica em `resources/bin/` (não versionado).
