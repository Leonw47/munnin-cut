# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versões no padrão
[SemVer](https://semver.org/lang/pt-BR/): MAJOR.MINOR.PATCH — correções sobem o PATCH, recursos novos o MINOR.

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

[1.2.0]: https://github.com/Leonw47/munnin-cut/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Leonw47/munnin-cut/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Leonw47/munnin-cut/releases/tag/v1.0.0
