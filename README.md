# Munnin Cut

Editor de vídeo para Windows com interface no estilo CapCut, sem recursos pagos e sem marca d'água.

## Instalar
Baixe o instalador da versão mais recente em **Releases** (`MunninCut-Setup-<versão>.exe`) e execute. O Windows pode avisar que o app não é assinado:
clique em **Mais informações → Executar assim mesmo**.

## O que tem
- Linha do tempo com faixa principal magnética, sobreposições, textos, stickers, formas, efeitos e áudios;
  dividir (Ctrl+B), aparar, mover, duplicar, copiar/colar, desfazer/refazer, ímã e zoom;
  seleção de vários clipes (Ctrl+clique, Ctrl+A ou retângulo) para mover, copiar e excluir juntos — e, se forem do
  mesmo tipo, editar todos de uma vez pelo painel completo (filtro, ajustes, animação, voz, velocidade…).
- Pontos de modificação (keyframes, tecla K): posição, escala, largura (X), altura (Y), rotação, opacidade, volume, ajustes de cor e
  intensidade do filtro mudam suavemente entre os pontos — na prévia e no arquivo exportado.
- Remover fundo verde, azul ou de uma cor só (como o branco de foto de produto) com conta-gotas; em fotos, só o fundo
  que encosta nas bordas some; reverter clipes (imagem e som); efeitos de voz
  (eco, igreja, robô, telefone, rádio, megafone, debaixo d'água, voz fina/grossa), graves, agudos e redução de ruído.
- Largura (X) e altura (Y) independentes, com alças laterais no reprodutor (contribuição do Douglas Zanetti).
- Voz — limpar e realçar, em tempo real: reduzir ruído, realçar a voz, clareza e ambientes (sala, auditório, igreja,
  chorus, voz dupla), com atalhos prontos e "comparar com o original"; a exportação usa a mesma cadeia.
- Formas padrão (quadrado, círculo, estrela, coração, seta, balão…) com cor, contorno, cantos e sombra.
- Prévia de filtros e efeitos ao passar o mouse; tela cheia com controles; zoom para fora no reprodutor (Ctrl + roda) para
  mexer no que está fora da tela, com a cor do fundo em volta configurável.
- Efeito aplicado só numa área (oval/retângulo, bordas suaves, inverter), mexida no reprodutor como uma imagem.
- Cortar silêncios automaticamente; biblioteca em páginas para muitas mídias; escala/largura/altura até 2000%.
- Transições (24, via `xfade`), animações de entrada/saída, filtros de cor, ajustes (brilho, contraste,
  saturação, temperatura, matiz, nitidez, vinheta, desfoque) e efeitos (VHS, granulado, flash, barras de cinema…).
- 115 efeitos no estilo CapCut, em categorias: Elementos (fogo, explosão, impacto, raios, faíscas, fumaça, debaixo
  d'água, gotas na lente…), Distorção (ondulação, redemoinho, calor, olho de peixe, derreter…), Básico (fades, abrir/fechar, desfoque pulsante…), Luz suave,
  Câmera (zoom lento, zoom rápido, pulsar, tremor, terremoto, balanço, girar, panorâmica, estroboscópio, REC),
  Retrô (VHS, filme antigo, Super 8…), Glitch (RGB, blocos, pixel, onda), Luz e cor (brilho suave, sonho,
  vazamento de luz, arco-íris, duotones), Divisão (2/3/4/9 telas, espelhos, caleidoscópio) e Partículas
  (corações, estrelas, confete, neve, chuva, bolhas, contagem 3-2-1), Iluminação (raios, holofote,
  lens flare, bokeh, borda neon…), Aura e Transição criativa (giro de câmera, chicote, impacto…).
- 34 transições, incluindo as de câmera (giro, zoom, chicote, rolar, impacto) com desfoque de movimento;
  as de mistura também valem entre clipes encostados nas faixas de cima.
- Cortar áudio direto no bloco da linha do tempo (com a duração à vista) ou antes de inserir: direto no cartão
  da biblioteca (clique e arraste as alças; Shift = ajuste fino) ou na janela de corte (botão direito; teclas I e O).
- Biblioteca de mídia com seleção de vários itens (clique, Ctrl+clique, Shift+clique, Ctrl+A): Delete remove do
  projeto; arrastar leva todos para a linha do tempo.
- 1124 efeitos sonoros em 18 categorias (transições, interface, impactos, engraçados, pessoas, animais, natureza,
  ambientes, cidade, casa, alertas, música e vinhetas, games, ficção científica, esportes, armas, locução…): 97
  sintetizados pelo próprio app e 1027 de domínio público (CC0) da Kenney e do BigSoundBank — créditos em
  `resources/sfx-livres/CREDITOS.txt` — e "Meus sons", a biblioteca pessoal com categorias suas (pastas em
  Documentos\Munnin Cut\Meus sons).
- YouTube e Instagram: pesquisa no YouTube, prévia com o player oficial para conferir e marcar o trecho, e download do
  áudio ou do vídeo (inteiro ou só o trecho) direto para o projeto; links de posts/reels do Instagram. Usa o yt-dlp oficial,
  instalado na primeira vez (com conferência SHA-256) e atualizado sozinho: confere todo dia e, se o YouTube
  mudar algo e o download falhar, atualiza e tenta de novo (inclusive na versão noturna).
- Legendas automáticas offline (whisper.cpp) com estilos e revisão do texto, presas à voz: entram quando a fala
  começa e saem na pausa (alinhamento palavra a palavra + volume do áudio), nada sobre silêncio ou clipe mudo.
- Resiliência: arquivos trocados com o mesmo nome são relidos mantendo os efeitos; arquivos movidos são
  reencontrados pelo nome; ausentes aparecem com Localizar/Substituir. Projetos podem ser duplicados como modelo.
- Texto com fontes embutidas, contorno, sombra e fundo; stickers de emoji.
- Velocidade (0,1x a 10x, com o som acompanhando), volume, entrada/saída suave, separar áudio, gravar narração.
- Animações de entrada/saída (quicar, elástico, balançar…) e contínuas (pulsar, flutuar, tremer, zoom lento…).
- Prévia das mídias da biblioteca no reprodutor, repetir um trecho em loop, mover pontos de modificação, ajustar
  vários clipes e legendas de uma vez, capa do vídeo (1º quadro).
- Fotos HEIC do iPhone (inteiras, com giro e cores certas) e vídeos HDR do iPhone convertidos para cores normais.
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
  `anim.js`, `timeline.js`, `graph.js` (monta o `filter_complex` do FFmpeg), `camtrans.js` (transições de câmera),
  `expr.js` (avalia na prévia as mesmas expressões que vão para o FFmpeg), `keyframes.js` (pontos de modificação),
  `chroma.js` (mesmas contas do chromakey/despill do FFmpeg) e `audiofx.js` (efeitos de voz: um plano só para
  o Web Audio da prévia e os filtros do FFmpeg).
- `public/voz-worklet.js` + `src/engine/voz.js` + `electron/voz.js` — limpeza da voz: o mesmo processador roda
  no AudioWorklet da prévia, no OfflineAudioContext da exportação e (perfil do ruído) no processo principal.
- `electron/ytdlp.js` — áudio do YouTube: instala/atualiza o yt-dlp e usa o próprio Electron como runtime de
  JavaScript (`ELECTRON_RUN_AS_NODE`), que o YouTube exige.
- `scripts/sfx/` — síntese dos efeitos sonoros (osciladores, ruídos, filtros, reverb, Karplus-Strong);
  `npm run sfx` gera `resources/sfx` (o `npm run dist` gera sozinho).
- `src/engine/` — prévia em canvas: compositor, transições, texto, sincronização dos `<video>`/`<audio>`.
- `src/components/` e `src/panels/` — interface (React + zustand).

## Desenvolvimento
```bash
npm install
npm run ffmpeg            # baixa ffmpeg.exe/ffprobe.exe para resources/bin (não versionados: >100 MB)
npm run whisper           # baixa o whisper.cpp (legendas) para resources/whisper
npm start                 # compila a interface e abre o app
npm run dist              # gera o instalador em release/
node scripts/gen-sfx-livres.mjs                      # refaz os sons livres (CC0) a partir da curadoria em scripts/sfx/livres.mjs
node scripts/test-graph.mjs mp4 webm gif mp3 prores   # testa o montador de exportação
node scripts/test-effects.mjs                         # exporta cada efeito animado e gera uma folha de amostras
node scripts/test-transitions.mjs                     # exporta cada transição de câmera
node scripts/test-size.mjs                            # compara o tamanho estimado com o real
node scripts/test-bordas.mjs                          # confere que nada deixa barra preta na lateral (1080 de largura)
node scripts/test-youtube.mjs                         # baixador do YouTube: instalação, atualização, trecho, erros
node scripts/test-legendas-grupo.mjs                  # tempos das legendas (voz × silêncio) e edição em grupo
node scripts/test-cadeia.mjs                          # sequência longa de fotos com transição: exporta até o fim, mistura certa
```
Testes de interface: `MC_AUTOTEST=scripts/autotest-ui.js npx electron .` (também `autotest-interact.js`, `autotest-fx.js`, `autotest-v12.js`, `autotest-v13.js`, `autotest-v14.js`, `autotest-v15.js`, `autotest-v16.js`, `autotest-v17.js`, `autotest-v18.js`, `autotest-fx18.js`, `autotest-v110.js`, `autotest-v111.js` e `autotest-scroll.js`).
O FFmpeg fica em `resources/bin/` (não versionado). Histórico de versões em [CHANGELOG.md](CHANGELOG.md).
