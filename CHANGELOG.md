# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versões no padrão
[SemVer](https://semver.org/lang/pt-BR/): MAJOR.MINOR.PATCH — correções sobem o PATCH, recursos novos o MINOR.

## [1.10.0] — 2026-10-28

### Adicionado
- **Zoom para fora no reprodutor** (botão de zoom no rodapé ou **Ctrl + roda do mouse**: 75%, 50%, 33%, 25%):
  sobra espaço em volta da tela para pegar e mexer no que está fora dela. A parte das camadas que passa da
  borda aparece meio transparente, as alças funcionam fora da tela e as outras camadas ganham um contorno.
- **Cor do fundo em volta da tela** (botão de balde no rodapé do reprodutor): Escuro, Grafite, Cinza, Cinza claro,
  Claro ou qualquer outra cor. Fica guardada.
- **Efeito só numa área** (aba do efeito → "Onde aplicar" → "Só uma área"): oval ou retângulo, com bordas suaves e
  opção de inverter (efeito em tudo, menos na área). A área se mexe e se redimensiona no reprodutor como uma
  imagem. O efeito é calculado dentro da área — uma torção ou um zoom ficam centrados nela (ex.: só no rosto) —
  e o resto do quadro fica intacto, na prévia e no vídeo exportado.
- **Cortar silêncios** (botão direito no clipe, ou aba Áudio): tira as pausas automaticamente. Ajuste a
  sensibilidade, o silêncio mínimo e a margem e veja na barra o que sai; "Ouvir o resultado" toca só o que fica.
  Na faixa principal os pedaços se juntam sozinhos; nas outras, o que vem depois na mesma faixa anda para trás.
  Um passo só de desfazer.
- **Biblioteca em páginas:** com muitas mídias (ex.: 1000 importadas) a biblioteca e a lista de áudios mostram
  uma página por vez (30, 60, 120 ou 240 por página), sem travar; ao importar, vai para a página dos novos.
  Ctrl+A, Shift+clique e arrastar continuam valendo para a lista inteira.

### Mudado
- **Escala, largura e altura até 2000%** (antes 500%) e posição até ±300%. Para não travar com escalas grandes,
  quando a camada fica bem maior que a tela (e não está girando nem animada), só a parte visível é desenhada e
  exportada — o resultado é o mesmo e a exportação continua rápida.

### Testes
- `autotest-v110` (24 checagens): zoom para fora, alças fora da tela, cor do fundo, Ctrl+roda, escala 2000%
  (prévia = exportação, rápida), páginas da biblioteca e Ctrl+A, efeito numa área (fora intacto, dentro muda, na
  prévia e na exportação; camada de fogo numa área), cortar silêncios (análise, corte, ímã, desfazer, exportação
  e faixa de áudio).

## [1.9.0] — 2026-10-24

### Adicionado
- **Biblioteca de sons livres (domínio público, CC0) embutida no app:** 1027 sons novos na aba Sons, somando
  1124 com os sintetizados. Pode usar à vontade, inclusive em vídeos monetizados, sem crédito obrigatório.
  - **BigSoundBank** (Joseph Sardin, bigsoundbank.com): 397 gravações reais escolhidas para vídeo — aplausos,
    risadas, crianças, gritos, coração batendo, animais (galo, cachorro, gato, vaca, cavalo, pássaros…), chuva,
    trovão, vento, mar, fogo, ambientes de 30 s (floresta, cidade, bar, feira, escola…), portas, passos, cozinha,
    sirenes, buzinas, carros, trem, helicóptero, alarmes, sinos, relógios, bipe de censura, boings e buzinas de
    desenho, pum, língua de sogra, "tu-dum-tss", socos, tiros, explosões, fogos e mais.
  - **Kenney** (kenney.nl): 630 sons — cliques e avisos de interface, impactos (vidro, metal, madeira, socos),
    passos em vários pisos, cartas e dados, ficção científica (lasers, naves, campo de força), sons 8-bit,
    85 vinhetas musicais curtas e locuções em inglês ("Fight!", "You win!", "Game over", contagem 1–10…).
  - Categorias novas: Pessoas e público, Animais, Ambientes, Cidade e veículos, Casa/objetos/passos, Ficção
    científica, Esportes, Armas e explosões e Locução (inglês).
  - Todos foram cortados (sem silêncio sobrando; ambientes com 30 s e final suave), nivelados no mesmo volume
    dos sons do app e convertidos para OGG. A curadoria fica em `scripts/sfx/livres.mjs` e o gerador
    (`node scripts/gen-sfx-livres.mjs`) refaz tudo a partir das fontes; créditos em `resources/sfx-livres/CREDITOS.txt`.
  - Ficaram de fora sons que, mesmo marcados como livres no site, reproduzem obras com dono (toques do iPhone,
    voz do Google, "Star Wars", "White Christmas", grito Wilhelm, jogos de marca).

### Testes
- `autotest-v18` ganhou a parte "sons livres" (prévia, pôr no cursor como OGG em Documentos, categorias); `autotest-v15` atualizado.

## [1.8.0] — 2026-10-23

### Adicionado
- **Efeitos novos (115 no total):**
  - **Elementos:** Fogo, Moldura de fogo, Explosão (bola de fogo, fumaça, fagulhas, onda de choque e tremor),
    Impacto (clarão, anéis e linhas de mangá), Raios, Faíscas, Fumaça, Linhas de velocidade, Debaixo d'água,
    Gotas na lente e Respingo.
  - **Distorção:** Ondulação, Redemoinho, Calor, Olho de peixe, Derreter, Gelatina e Respirar.
  - **Câmera:** Câmera na mão, Pulo e Zoom dramático.
- **Animações:** entradas novas (Cair e quicar, Quicar, Elástico, Balançar, Quicar ←/→, Subir com mola, Rodopiar),
  saídas novas (Cair, Elástico, Balançar, Sugar, Subir e sumir, Quicar) e **animação contínua** durante o clipe
  todo (Pulsar, Batida, Flutuar, Balançar, Mexer, Tremer, Girar sem parar, Zoom lento), com velocidade e
  intensidade — combina com a entrada e a saída.
- **YouTube: pesquisa e prévia.** Escreva o que procura (ou cole o link) e escolha nos resultados; o vídeo abre
  numa janela com o player do YouTube para conferir se é o certo, marcar início e fim enquanto assiste (ou
  arrastando as alças) e baixar **só o áudio ou o vídeo** (até 1080p), inteiro ou só o trecho.
- **Instagram:** cole o link de um post ou reel para baixar o vídeo (ou só o áudio) direto para o projeto.
- **Meus sons:** biblioteca pessoal na aba Sons, com categorias criadas por você (uma pasta para cada, em
  Documentos\Munnin Cut\Meus sons). Adicione arquivos pelo botão ou arrastando; ouça, ponha no cursor ou arraste
  para a linha do tempo.
- **Prévia na biblioteca:** passar o mouse num vídeo mostra os quadros; o botão 👁 abre a mídia no reprodutor
  (com som, barra de tempo e o corte marcado) sem pôr na linha do tempo. Espaço toca/pausa, Esc volta.
- **Repetir trecho (loop):** botão 🔁 na barra da linha do tempo (usa os clipes selecionados) ou Shift+arrastar
  na régua; a faixa amarela na régua pode ser movida e ajustada, clique duplo apaga.
- **Mover pontos de modificação:** arraste o ◆ no clipe para outro momento (encaixa nos quadros; Shift = livre);
  botão direito no ◆ apaga o ponto.
- **Vários clipes de uma vez:** com vários selecionados, ajuste volume, escala e opacidade de todos juntos; com
  textos, mude fonte, tamanho, cor, negrito, maiúsculas, contorno, fundo e sombra de todos.
- **Legendas:** "Personalizar todas as legendas" muda o estilo de todas de uma vez.
- **Capa do vídeo** (janela Exportar): o quadro da agulha ou uma imagem vira o 1º quadro do arquivo — a miniatura
  que Instagram, WhatsApp e o Windows mostram.

### Corrigido
- **Fotos HEIC do iPhone** apareciam com um pedaço só (512×512) e saíam diferentes na exportação: a foto vem em
  ladrilhos que o FFmpeg não junta sozinho. Agora a foto é montada inteira, com o giro/espelho guardado no arquivo
  e as cores convertidas de Display P3 para sRGB; a mesma cópia vale para a prévia e a exportação. Mídias antigas
  são relidas sozinhas.
- **Vídeos .mov/.mp4 do iPhone em HDR** (HLG/Dolby Vision) saíam com cores lavadas na exportação: agora são
  convertidos para cores normais (SDR) na exportação, nas miniaturas e na cópia de prévia.
- **Remover fundo branco apagava quase tudo:** com fundo neutro (branco, cinza, preto, bege) a comparação agora
  inclui o claro/escuro (como o filtro colorkey), e não só a cor — antes tudo que era neutro na imagem sumia, e o
  branco ainda tirava o verde da foto ("reflexo"). Em fotos, **"Só o fundo das bordas"** (ligado por padrão)
  apaga só o fundo que encosta nas bordas: a mesma cor dentro do objeto fica. Botão "Branco" pronto.
- **Ondas esticadas** em áudios longos (como os baixados): a onda era desenhada num quadro de no máximo 4000 px
  esticado até o tamanho do bloco; agora é desenhada só na parte visível, na resolução da tela, e com zoom grande
  a curva é suavizada.
- **Fundo (Cor/Desfoque) "não funcionava":** ele só aparece onde o vídeo não cobre a tela; quando cobre tudo, o
  painel agora explica e diz como fazer aparecer.
- Na prévia do YouTube, digitar o trecho antes do player carregar não perde mais o início/fim.

### Testes
- `autotest-v18` (36 checagens): HEIC (tamanho, giro, prévia = exportação), HDR, fundo branco (prévia e arquivo),
  Fundo Cor/Desfoque pela interface, pesquisa e player do YouTube, Meus sons, prévia da biblioteca, arrastar ◆,
  loop, edição em lote, capa e animação contínua.
- `autotest-fx18`: folha de quadros dos efeitos novos + exportação comparada.
- `autotest-v15` atualizado para o fluxo novo do YouTube.

## [1.7.1] — 2026-10-21

### Corrigido
- **O som sumia depois de mexer nos controles da Voz** (e só voltava reabrindo). Cada movimento de um controle
  remontava a cadeia inteira e o processador antigo de redução de ruído continuava rodando escondido; depois de
  algumas centenas de movimentos, o áudio da prévia parava. Agora mexer num controle só muda os valores da cadeia
  que já está tocando (com transição suave, sem estalo) e, quando a cadeia precisa ser remontada, o processador
  antigo é desligado. O mesmo cuidado vale para o processador de "voz fina / voz grossa".

### Testes
- `autotest-v17` ganhou a checagem "arrastar os controles mantém o som" (200 mudanças tocando).

## [1.7.0] — 2026-10-21

### Adicionado
- **Voz — limpar e realçar** (aba Áudio de vídeos e áudios), tudo **em tempo real na prévia**:
  - **Reduzir ruído:** redução espectral (STFT, Wiener com estimativa "decision-directed" e piso de ganho) feita
    num AudioWorklet; o perfil do ruído é calculado uma vez por mídia (até 5 min analisados, com cache) e
    ajustado enquanto toca.
  - **Realçar a voz:** leva a fala a um volume padrão (pelo nível medido da mídia), comprime os picos e compensa.
  - **Clareza:** corta zumbido grave, tira o som abafado (280 Hz) e dá presença (3,2 kHz) e brilho (9 kHz).
  - **Ambiente:** Sala, Auditório e Igreja (reverb por convolução), Chorus e Voz dupla, com quantidade.
  - Atalhos prontos: Voz limpa, Podcast, Lugar barulhento, Pregação / culto e Locutor.
  - **Comparar com o original:** desliga a limpeza só na prévia, para ouvir antes e depois.
- Na exportação, cada trecho passa pela **mesma cadeia** num OfflineAudioContext (o que se ouve é o que sai),
  com a latência da redução de ruído e dos compressores compensada (som casado com a imagem) e cache entre
  exportações.

### Alterado
- O antigo "Reduzir ruído" (que só valia no arquivo exportado) virou a redução em tempo real; projetos antigos
  com ele ligado abrem com "Reduzir ruído" em 50.
- Os testes automáticos rodam mesmo com o app aberto (não disputam a instância única).

### Testes
- `MC_AUTOTEST=scripts/autotest-v17.js`: análise, cadeia na prévia com som passando, comparar com o original,
  exportação, cache e os quatro ambientes. Num vídeo real gravado no celular, a distância entre fala e ruído
  passou de 9,3 dB para 14,5 dB com a fala 4,6 dB mais alta, sem estourar e sem atraso em relação à imagem.

## [1.6.0] — 2026-10-19
Contribuição do Douglas Zanetti (PR #1).

### Adicionado
- **Largura (X) e altura (Y) independentes:** controles "Largura X" e "Altura Y" no painel Transformar e alças
  laterais no reprodutor (as dos cantos continuam mudando a escala proporcional) para esticar ou achatar vídeos,
  fotos, textos e formas. Valem com pontos de modificação (◆ / K), na prévia e na exportação, e respeitam o giro:
  o clipe estica nos próprios eixos antes de girar. Projetos antigos abrem iguais (largura e altura começam em 100%).
- Mexer num controle com pontos de modificação cria o ponto naquele instante; o clique seguinte no ◆ não o apaga
  mais por engano.

### Corrigido (na integração)
- Texto e forma com largura/altura animadas **e** girados saíam cortados na exportação (o `rotate` do FFmpeg
  fixa o tamanho no primeiro quadro): agora recebem a mesma caixa fixa das mídias, com tamanho par — uma largura
  ímpar fazia a exportação falhar.

## [1.5.0] — 2026-10-19

### Adicionado
- **Efeitos sonoros (aba Sons):** 97 sons em 9 categorias — Transições (whoosh, riser, boom, braam…), Interface,
  Impactos, Engraçados (boing, trombone triste, ba-dum-tss, grilos…), Games 8-bit, Magia e brilhos, Natureza
  (vento, chuva, trovão, ondas, fogueira, passarinhos…), Música e percussão (sino de igreja, gongo, tadá,
  aplausos…) e Tempo e alertas. Clique ouve, **+** ou clique duplo põe no cursor, ou arraste até a linha do
  tempo; pesquisa por nome. Todos são sintetizados pelo próprio app (`scripts/sfx`), com volume equilibrado
  entre eles — sem direitos de terceiros. O som usado vai para `Documentos\Munnin Cut\Efeitos sonoros`.
- **Áudio do YouTube** (aba Áudio e botão "YouTube" na aba Mídia): cole o link e o áudio entra na biblioteca e na
  linha do tempo, no cursor; opção de baixar só um trecho. Usa o yt-dlp oficial, instalado na primeira vez com
  conferência do SHA-256, atualizado sozinho uma vez por dia e — se o YouTube mudar algo e o download falhar —
  atualizado na hora e tentado de novo (e, se ainda falhar, com a versão noturna). Botão "Atualizar" e versão à
  vista. O próprio app serve de runtime de JavaScript que o YouTube exige: nada precisa ser instalado.
- **Seleção de vários itens na biblioteca:** clique, Ctrl+clique (um a um), Shift+clique (de um item a outro) e
  Ctrl+A; **Delete** remove do projeto (pergunta antes se algum estiver na linha do tempo); arrastar um item
  selecionado leva todos para a linha do tempo, um depois do outro.
- **Corte direto no cartão:** clicar num vídeo ou áudio da biblioteca mostra as alças de início e fim no próprio
  cartão (com a onda sonora), sem abrir janela. Shift deixa o ajuste 10× mais fino, o meio arrasta o trecho
  inteiro, clique duplo volta para a mídia inteira; enquanto arrasta, toca o ponto do corte e o vídeo mostra o
  quadro. A janela de corte continua no botão direito ("Cortar antes de inserir…").

### Alterado
- Abas do painel esquerdo mais compactas para caber a nova aba Sons.

## [1.4.1] — 2026-10-19

### Corrigido
- **Barra preta na lateral direita do vídeo exportado** em larguras como 1080 (Instagram 4:5 e 1:1, Stories/Reels
  9:16) e 1350. Era um defeito do FFmpeg 8.0.1 na conversão de cor usada pelas transições de câmera (Chicote,
  Giro, Zoom, Rolar, Impacto), pelos efeitos de brilho/glitch/duotone, pelas camadas de luz e pelos filtros
  aplicados na faixa de efeitos: as últimas 8 colunas de cada linha saíam pretas — e, depois de uma transição
  de câmera, o defeito ficava no vídeo inteiro. A conversão agora usa o caminho preciso do FFmpeg (~5% mais
  lenta só nesses trechos).

### Testes
- `node scripts/test-bordas.mjs` exporta 119 casos em 1080×1350, 1080×1920 e 1080×1080 (cada efeito, filtro e
  transição) e mede a borda direita; com `--sem-correcao` acusa as barras (36 casos), provando que o teste pega
  o defeito.

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
