# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versões no padrão
[SemVer](https://semver.org/lang/pt-BR/): MAJOR.MINOR.PATCH — correções sobem o PATCH, recursos novos o MINOR.

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

[1.1.0]: https://github.com/Leonw47/munnin-cut/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Leonw47/munnin-cut/releases/tag/v1.0.0
