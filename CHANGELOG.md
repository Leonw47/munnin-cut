# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versões no padrão
[SemVer](https://semver.org/lang/pt-BR/): MAJOR.MINOR.PATCH — correções sobem o PATCH, recursos novos o MINOR.

## [1.4.0] — 2026-10-14
Feedback de teste do Douglas Zanetti.

### Adicionado
- **Pontos de modificação (keyframes):** marque um ponto (◆ ou tecla K), leve a agulha a outro momento e mude
  posição, escala, rotação, opacidade, ajustes de cor (brilho, contraste, saturação…), intensidade do filtro ou
  volume — o app cria outro ponto e faz a passagem suave entre eles. Losangos no inspetor e na linha do tempo
  (clique para ir até o ponto), botões de ponto anterior/próximo; mexer no reprodutor também cria pontos.
  Dividir, aparar o começo e mudar a velocidade preservam os pontos. A exportação reproduz a mesma curva.
- **Seleção de vários clipes:** Ctrl+clique, Ctrl+A ou arrastar um retângulo na área vazia da linha do tempo.
  Mover em grupo, duplicar, copiar/colar, silenciar e excluir de uma vez; filtro aplicado em todos.
- **Remover fundo (chroma key)** para vídeo e foto: cor do fundo com conta-gotas no reprodutor, intensidade,
  bordas suaves e remoção do reflexo verde/azul (mesmas contas do chromakey/despill do FFmpeg).
- **Formas padrão:** quadrado, arredondado, círculo, anel, triângulo, losango, hexágono, estrela, coração, seta,
  linha, balão e moldura, com cor, contorno, cantos, sombra e espelhamento.
- **Prévia ao passar o mouse:** filtros e efeitos aparecem no reprodutor sem aplicar (no clipe selecionado ou
  no quadro inteiro).
- **Transições nas faixas de cima:** entre dois clipes encostados de uma sobreposição/texto/forma, com as
  transições de mistura (dissolver, limpar, círculo, relógio, abrir).
- **Reverter** clipes de vídeo e áudio (imagem e som de trás para frente), com cópia invertida em cache.
- **Efeitos de voz:** eco, igreja/salão, robô, telefone, rádio antigo, megafone, debaixo d'água, voz fina e voz
  grossa, com intensidade; equalizador de graves e agudos; redução de ruído na exportação.
- **Tela cheia com controles:** reproduzir/pausar, voltar/avançar 5 s, barra de tempo, silenciar e sair;
  clique no vídeo pausa, clique duplo sai.

### Corrigido
- Puxar a borda de um clipe sobre o vizinho na mesma faixa não sobrepõe mais (a borda para no vizinho).
- Arrastar a agulha não faz mais a prévia piscar entre camadas: enquanto o vídeo busca o quadro, a camada de cima
  continua com o último quadro.
- Exportação falhava com ajustes de cor fortes combinados (coeficiente fora do limite do colorchannelmixer).

### Alterado
- Clique na área vazia da linha do tempo leva a agulha; arrastar ali desenha a seleção (a régua continua
  arrastando a agulha).

## [1.3.0] — 2026-10-11
### Adicionado
- **Resiliência das mídias:** cada mídia guarda o caminho e uma "impressão" do arquivo (tamanho e data).
  - Se o arquivo for trocado por outro **com o mesmo nome**, o projeto relê e mantém efeitos, filtros e transições
    (ideal para posts rotineiros: baixe o arquivo novo com o mesmo nome e reabra o projeto).
  - Se o arquivo sumir, o app procura um com o mesmo nome perto da pasta original e em Downloads (com subpastas),
    Área de Trabalho, Documentos, Vídeos, Imagens e Músicas, e religa sozinho.
  - O que não for encontrado aparece numa barra de aviso, com **Localizar…** e **Substituir por outro…**.
  - A conferência se repete ao voltar para a janela do app (ex.: depois de baixar um arquivo).
  - **Substituir por outro arquivo…** no menu da mídia; **Duplicar projeto** na tela inicial (usar como modelo).
- **Legendas automáticas** (aba Legendas): transcrição offline com whisper.cpp, em português ou outros idiomas,
  para o projeto inteiro ou só o clipe selecionado; 5 estilos; 1 ou 2 linhas; palavras-chave para nomes próprios;
  lista para revisar o texto de cada legenda. O modelo (57 MB a 548 MB) é baixado na primeira vez.
- **Luz suave** (11 efeitos discretos): brilho difuso, respiração de luz, luz dourada, luz celestial, luz de janela,
  vazamento suave, bokeh suave, névoa luminosa, luz nas bordas, amanhecer e brilhos suaves (94 efeitos no total).
- Exportação: opção de **terminar no fim das imagens** quando só o áudio continua depois.

### Alterado
- **Cortar o áudio direto no bloco:** o clique na biblioteca não abre mais a janela de corte (ela continua no menu do
  botão direito). Na linha do tempo, ao puxar as bordas aparece a duração e o ponto do arquivo; clicar num bloco de
  áudio leva o cursor ao início dele e o **play toca do início ao fim do bloco**. O painel do áudio mostra o trecho usado.

### Desempenho
- Exportação muito mais rápida: camadas de luz geradas em resolução reduzida, codificação dos quadros em paralelo e
  **cache entre exportações** (trocar só as fotos não refaz os efeitos); fotos e textos decodificados uma única vez;
  desfoque de fundo calculado em tamanho reduzido; misturas de brilho/desfoque de movimento sem cálculo por pixel;
  presets mais ágeis do x264. Ex.: projeto de 30 s com "Luz de festa" contínua passou de 40 s para 8 s
  (5 s ao reexportar).

## [1.2.0] — 2026-10-11
### Corrigido
- **Tela preta durante a edição:** a rolagem automática da linha do tempo (ao tocar além da área visível)
  derrubava a interface. Corrigido e coberto por teste (`autotest-scroll.js`).

### Adicionado
- Proteção contra falhas: se alguma parte da interface der erro, aparece uma tela de recuperação
  ("Continuar editando") em vez de a janela ficar preta; se o processo da janela cair, o app recarrega
  e reabre o projeto. Erros ficam registrados em `%APPDATA%\Munnin Cut\logs\erros.txt`.
- **Cortar antes de inserir** (como no CapCut): clique num áudio ou vídeo da biblioteca para ouvir/ver,
  marcar início e fim (alças, campos ou teclas I/O) e inserir só o trecho. O corte fica lembrado.
- **Transições de câmera:** Giro, Giro anti-horário, Giro com zoom, Zoom rápido, Chicote (4 direções),
  Rolar e Impacto, com desfoque de movimento — nova categoria "Câmera e criativas".
- **Efeitos novos (83 no total):** Fade in/out (preto e branco) e Fade in + out; Iluminação (raios de luz,
  holofote, lens flare, bokeh, borda neon, luz de festa, luz do sol, varredura de luz, brilho pulsante);
  Aura (aura circular, aura neon, ondas de aura, halo); Transição criativa (giro de câmera e afins para
  colocar sobre um corte ou elemento).
- Animações de elemento **Girar** e **Virar** (entrada e saída) para textos, stickers e sobreposições.
- **Exportação:** MP4 e MOV em destaque (H.264, H.265 e ProRes 422), qualidade por taxa de bits
  (Mais baixa, Recomendada, Mais alta, Personalizada em Mbps), **tamanho estimado** antes de exportar
  e tamanho real ao terminar.

## [1.1.0] — 2026-10-11
### Adicionado
- 50 efeitos no estilo CapCut em 7 categorias (Básico, Câmera, Retrô, Glitch, Luz e cor, Divisão, Partículas),
  com miniaturas animadas no painel e intensidade ajustável.
- Efeitos animados processados só no trecho do clipe na exportação (split/trim/concat), com prévia idêntica.
- Camadas desenhadas por código (corações, confete, neve, chuva, bolhas, estrelas, REC, VHS, vazamento de luz,
  contagem 3-2-1), exportadas como sequência de imagens.

### Corrigido
- Emojis herdavam a opacidade da camada anterior e saíam translúcidos na exportação.
- Efeitos "Abrir" e "Fechar" ficavam pretos na exportação.

## [1.0.0] — 2026-10-10
### Adicionado
- Editor com interface no estilo CapCut: biblioteca de mídia, reprodutor com caixa de transformação,
  painel de propriedades e linha do tempo com faixa principal magnética.
- Sobreposições, textos (12 fontes embutidas, 16 estilos), stickers, áudio, narração pelo microfone.
- 24 transições, 18 filtros, ajustes de cor, animações de entrada/saída, velocidade, fundo desfocado.
- Importação de praticamente qualquer formato (proxy automático para a prévia).
- Exportação em MP4 (H.264/H.265), MOV (H.264/ProRes), WebM, MKV, AVI, GIF, MP3, WAV, M4A e FLAC, de 480p a 4K.
- Rascunhos salvos automaticamente e arquivo de projeto `.mcut`; instalador NSIS.

[1.3.0]: https://github.com/Leonw47/munnin-cut/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Leonw47/munnin-cut/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Leonw47/munnin-cut/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Leonw47/munnin-cut/releases/tag/v1.0.0
