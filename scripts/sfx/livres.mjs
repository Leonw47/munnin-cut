// Sons de terceiros em DOMÍNIO PÚBLICO (CC0) que vão embutidos no app — curadoria + nomes em português.
// O gerador (scripts/gen-sfx-livres.mjs) baixa as fontes, corta, nivela o volume e grava em resources/sfx-livres.
//
// Fontes (licença conferida em 23/10/2026):
//  - Kenney (www.kenney.nl) — pacotes de áudio, "Creative Commons Zero, CC0" no License.txt de cada pacote.
//  - BigSoundBank / Joseph Sardin (bigsoundbank.com) — "Creative Commons CC0 1.0 Universal / domínio público".
// Ficaram de fora sons que imitam ou reproduzem obras com dono, mesmo marcados como livres no site
// (toques do iPhone, voz sintética do Google, "Star Wars", "White Christmas", grito Wilhelm, jogos de marca).

// Categorias que só existem por causa dos sons livres (as outras já existem no catálogo sintetizado).
export const CATS_LIVRES = [
  { id: 'people', name: 'Pessoas e público', depois: 'funny' },
  { id: 'animals', name: 'Animais', depois: 'people' },
  { id: 'ambience', name: 'Ambientes', depois: 'nature' },
  { id: 'city', name: 'Cidade e veículos', depois: 'ambience' },
  { id: 'home', name: 'Casa, objetos e passos', depois: 'city' },
  { id: 'scifi', name: 'Ficção científica', depois: 'game' },
  { id: 'sports', name: 'Esportes', depois: 'scifi' },
  { id: 'weapons', name: 'Armas e explosões', depois: 'sports' },
  { id: 'voice', name: 'Locução (inglês)', depois: 'weapons' },
];

// Volume alvo (dB, mesma medida do gerador dos sons sintetizados) e duração máxima por categoria.
export const ALVO = { ambience: -24, nature: -21, animals: -17 };
export const ALVO_PADRAO = -16;
export const MAX_DUR = { ambience: 30 };
export const MAX_PADRAO = 12;

// BigSoundBank: [número, nome, categoria, duração máxima (s, opcional)]
export const BSB = [
  // Transições
  ['1796', 'Whoosh de corda 1', 'trans'], ['1795', 'Whoosh de corda 2', 'trans'],
  ['1801', 'Whoosh de tubo de metal 1', 'trans'], ['1800', 'Whoosh de tubo de metal 2', 'trans'],
  ['1798', 'Whoosh de bambu', 'trans'], ['1797', 'Whoosh de vara de madeira', 'trans'],
  ['1799', 'Whoosh de chapa de madeira 1', 'trans'], ['1802', 'Whoosh de chapa de madeira 2', 'trans'],
  ['0128', 'Espada cortando o ar', 'trans'], ['0573', 'Whoosh de flecha', 'trans', 6],
  ['2032', 'Bumerangue passando', 'trans'], ['2961', 'Chicote', 'trans'],
  // Interface
  ['1399', 'Ideia! (desenho animado) 1', 'ui'], ['1398', 'Ideia! (desenho animado) 2', 'ui'],
  ['2063', 'Notificação 1', 'ui'], ['2064', 'Notificação 2', 'ui'], ['2065', 'Notificação 3', 'ui'],
  ['2066', 'Notificação 4', 'ui'], ['2067', 'Notificação 5', 'ui'], ['2059', 'Notificação 6', 'ui'], ['2060', 'Notificação 7', 'ui'],
  ['1616', 'Bipe de secretária eletrônica', 'ui'], ['2645', 'Ligação encerrada', 'ui'], ['2394', 'Clique de câmera fotográfica', 'ui'],
  ['0253', 'Telefone fixo tocando', 'ui'], ['0375', 'Telefone sem fio tocando', 'ui'], ['0001', 'Telefone antigo tocando', 'ui', 15],
  ['1035', 'Celular vibrando na mão', 'ui', 8], ['0312', 'Chiado de rádio 1', 'ui'], ['0313', 'Chiado de rádio 2', 'ui'],
  ['2174', 'Fita cassete rebobinando', 'ui'], ['2547', 'Disco de vinil chiando', 'ui', 10], ['0158', 'Internet discada', 'ui', 18],
  ['2841', 'Máquina de escrever (gravação)', 'ui'], ['0229', 'Teclado de computador', 'ui', 10], ['1734', 'Digitação rápida', 'ui', 10],
  ['1735', 'Clique de mouse', 'ui'], ['0029', 'Mouse: clique duplo', 'ui'], ['0026', 'Interruptor de luz', 'ui'], ['0036', 'Interruptor de abajur', 'ui'],
  ['1311', 'Bipe de censura longo', 'ui'], ['2943', 'Bipe de censura curto', 'ui'],
  ['1417', 'Bipe de caixa de supermercado 1', 'ui'], ['3527', 'Bipe de caixa de supermercado 2', 'ui'], ['1631', 'Ding do micro-ondas', 'ui'],
  // Impactos
  ['2460', 'Soco 1', 'impact'], ['2461', 'Soco 2', 'impact'], ['2465', 'Soco 3', 'impact'], ['2468', 'Soco 4', 'impact'],
  ['0444', 'Sequência de socos', 'impact'], ['0806', 'Socos (foley)', 'impact'], ['0597', 'Tapas', 'impact'],
  ['2452', 'Corpo caindo no chão 1', 'impact'], ['2453', 'Corpo caindo no chão 2', 'impact'], ['2456', 'Corpo caindo no chão 3', 'impact'],
  ['1588', 'Martelo de juiz', 'impact'], ['1774', 'Barra de aço caindo', 'impact'], ['1776', 'Duas barras de aço caindo', 'impact'],
  ['0148', 'Copo estourando', 'impact'], ['0387', 'Espelho quebrando', 'impact'], ['1591', 'Taça de champanhe quebrando', 'impact'],
  ['1121', 'Bola de Natal quebrando', 'impact'], ['0771', 'Vidro quebrado', 'impact'], ['1643', 'Prato quebrando 1', 'impact'], ['1644', 'Prato quebrando 2', 'impact'],
  // Engraçados
  ['2277', 'Boing de desenho 1', 'funny'], ['2278', 'Boing de desenho 2', 'funny'], ['2281', 'Boing de desenho 3', 'funny'], ['2284', 'Boing de desenho 4', 'funny'],
  ['1827', 'Buzina de ar', 'funny'], ['1830', 'Buzina de ar dupla 1', 'funny'], ['1832', 'Buzina de ar dupla 2', 'funny'],
  ['1950', 'Flecha cravando (desenho) 1', 'funny'], ['1952', 'Flecha cravando (desenho) 2', 'funny'], ['1959', 'Flecha cravando (desenho) 3', 'funny'],
  ['2054', 'Fantasma na flauta 1', 'funny'], ['2055', 'Fantasma na flauta 2', 'funny'],
  ['1074', 'Bolhas estourando (boca)', 'funny', 8], ['1261', 'Ventosa no plástico', 'funny'], ['0928', 'Ventosa no espelho', 'funny'],
  ['0241', 'Pum 1', 'funny'], ['1031', 'Pum discreto', 'funny'], ['0240', 'Pum 2', 'funny'], ['0111', 'Pum 3', 'funny'], ['0866', 'Sequência de puns', 'funny'],
  ['1553', 'Língua de sogra 1', 'funny'], ['1554', 'Língua de sogra 2', 'funny'], ['1556', 'Língua de sogra 3', 'funny'],
  ['0364', 'Patinho de borracha', 'funny'], ['3338', 'Brinquedo apertado 1', 'funny'], ['3331', 'Brinquedo apertado 2', 'funny'],
  ['0879', 'Brinquedo de bebê', 'funny', 8], ['0633', 'Mola maluca', 'funny'], ['0433', 'Tu-dum-tss (piada)', 'funny'], ['0417', 'Pato de pelúcia', 'funny'],
  ['0551', 'Balões estourando', 'funny'], ['1709', 'Arroto', 'funny'], ['1086', 'Buzina de bicicleta (fom-fom)', 'funny', 6],
  ['0475', 'Risada horrível', 'funny'], ['0489', 'Risada de bruxa', 'funny'], ['0490', 'Risada de ogro', 'funny'], ['2093', 'Risada delirante', 'funny'],
  // Pessoas e público
  ['2363', 'Aplausos (gravação)', 'people'], ['2479', 'Aplausos de show', 'people'], ['0019', 'Aplausos de 150 pessoas', 'people', 20],
  ['0021', 'Aplausos de 600 pessoas', 'people', 20], ['3523', 'Aplausos de 40 pessoas', 'people', 16],
  ['0237', 'Adolescentes gritando e aplaudindo 1', 'people'], ['0236', 'Adolescentes gritando e aplaudindo 2', 'people'],
  ['1660', 'Crianças rindo', 'people'], ['0980', 'Bebê rindo', 'people'], ['1148', 'Crianças gritando', 'people'],
  ['0218', 'Coração batendo', 'people'], ['1930', 'Coração acelerado', 'people'], ['1929', 'Coração lento', 'people'], ['0243', 'Uma batida do coração', 'people'],
  ['1103', 'Homem ofegante', 'people'], ['0170', 'Homem roncando', 'people', 15], ['1405', 'Suspiro', 'people'], ['1406', 'Bocejo', 'people'],
  ['0178', 'Beijinhos', 'people'], ['2183', 'Tosse', 'people'], ['1603', 'Sopro forte', 'people'], ['0663', 'Esfregando as mãos', 'people', 8],
  ['1427', 'Dedos tamborilando', 'people'], ['0483', 'Estalar de dedos', 'people'], ['2190', 'Dentes batendo de frio', 'people'],
  ['1076', 'Shhh! (pedindo silêncio)', 'people'], ['1095', 'Fungando', 'people', 8],
  ['3591', 'Grito "Fah!"', 'people'], ['1662', 'Menina gritando', 'people'], ['1664', 'Menino gritando', 'people'],
  ['0233', 'Bebê chorando', 'people', 15], ['2552', 'Criança chorando', 'people'], ['2361', 'Grito de dor', 'people'],
  ['3534', 'Exclamação de surpresa', 'people'], ['2194', 'Parabéns pra você (cantado)', 'people', 16],
  ['1173', 'Assobio com a boca', 'people'], ['1170', 'Assobio para chamar', 'people'], ['2193', 'Parabéns pra você (assobiado)', 'people', 16],
  ['2047', 'Fantasma uivando', 'people'], ['2112', 'Rosnado de zumbi', 'people'], ['2106', 'Zumbi', 'people'],
  // Animais
  ['0283', 'Galo cantando', 'animals'], ['0440', 'Cocoricó', 'animals'], ['2954', 'Cachorro latindo', 'animals'], ['0288', 'Cachorros latindo', 'animals'],
  ['0112', 'Cachorro latindo dentro de casa', 'animals'], ['0546', 'Vaca mugindo', 'animals'], ['2386', 'Mugido', 'animals'],
  ['1890', 'Gato miando', 'animals'], ['0494', 'Miadinho', 'animals'], ['1010', 'Gato ronronando', 'animals'], ['0817', 'Gatos brigando', 'animals', 15],
  ['0863', 'Cavalo relinchando', 'animals'], ['0284', 'Relincho', 'animals'], ['0611', 'Cavalo galopando', 'animals'], ['1551', 'Burro zurrando', 'animals'],
  ['0276', 'Patos', 'animals'], ['0978', 'Galinhas cacarejando', 'animals'], ['0279', 'Bode berrando', 'animals'], ['2343', 'Ovelha', 'animals'], ['1659', 'Porco grunhindo', 'animals'],
  ['1020', 'Grilo', 'animals', 15], ['2397', 'Cigarra', 'animals', 15], ['3002', 'Cigarras', 'animals', 15],
  ['1764', 'Coruja piando 1', 'animals'], ['1763', 'Coruja piando 2', 'animals'], ['0956', 'Corvos', 'animals'], ['1670', 'Pisco cantando', 'animals'],
  ['3503', 'Melro cantando', 'animals'], ['3087', 'Rouxinol', 'animals'], ['1762', 'Pássaro gritador (piha)', 'animals'],
  ['1000', 'Abelhão', 'animals'], ['0101', 'Abelhas e moscas', 'animals'], ['0840', 'Pombo levantando voo', 'animals'], ['2891', 'Pássaro batendo asas', 'animals'],
  // Natureza e clima
  ['0266', 'Ondas do mar (gravação)', 'nature', 20], ['1354', 'Riacho (gravação)', 'nature', 20], ['0507', 'Pequena cachoeira', 'nature', 20], ['1386', 'Gotas de água', 'nature'],
  ['0183', 'Bolhas na água', 'nature', 10], ['1521', 'Splash grande 1', 'nature'], ['1519', 'Splash grande 2', 'nature'], ['1529', 'Splash pequeno', 'nature'],
  ['1019', 'Chuva de verão', 'nature', 20], ['1290', 'Chuva nas poças', 'nature', 20], ['2679', 'Chuva no guarda-chuva', 'nature', 20], ['1296', 'Trovão e chuva', 'nature', 20],
  ['0595', 'Vento (gravação)', 'nature', 20], ['0908', 'Vento no capim', 'nature', 20], ['0155', 'Vento assobiando', 'nature', 15], ['0146', 'Vento forte', 'nature', 20],
  ['0987', 'Fogueira grande', 'nature', 20], ['2857', 'Lareira', 'nature', 20], ['1341', 'Gasolina pegando fogo', 'nature', 15],
  ['2131', 'Acendendo um cigarro', 'nature'], ['0004', 'Fósforo', 'nature', 10], ['2127', 'Gelo no copo', 'nature'], ['2205', 'Gelo rachando', 'nature'], ['1299', 'Galhos quebrando', 'nature'],
  // Ambientes (30 s)
  ['0100', 'Floresta', 'ambience'], ['0267', 'Mar com gaivotas', 'ambience'], ['0097', 'Campo', 'ambience'], ['1880', 'Campo à noite', 'ambience'],
  ['2722', 'Rua com trânsito', 'ambience'], ['2573', 'Gaivotas no porto', 'ambience'], ['2136', 'Caverna', 'ambience'], ['0680', 'Cidade à noite', 'ambience'],
  ['0480', 'Bar', 'ambience'], ['1470', 'Insetos noturnos', 'ambience'], ['0998', 'Sapos', 'ambience'], ['2728', 'Feira livre', 'ambience'],
  ['0222', 'Pássaros ao amanhecer', 'ambience'], ['3515', 'Multidão conversando', 'ambience'], ['3542', 'Restaurante', 'ambience'],
  ['1072', 'Recreio da escola', 'ambience'], ['3543', 'Pista de skate', 'ambience', 20], ['2746', 'Pátio de creche', 'ambience'],
  ['2969', 'Conversa de multidão ao ar livre', 'ambience'], ['0684', 'Burburinho de grupo', 'ambience'],
  // Cidade e veículos
  ['2368', 'Pneus cantando 1', 'city'], ['2371', 'Pneus cantando 2', 'city'], ['1464', 'Sirene de ambulância', 'city'], ['0886', 'Sirene de polícia', 'city', 15],
  ['2731', 'Sirene de caminhão de bombeiros', 'city', 15], ['0189', 'Carro dando partida e saindo', 'city', 15], ['0600', 'Carro esportivo acelerando', 'city'],
  ['0258', 'Buzina de carro', 'city'], ['3594', 'Buzina de ônibus', 'city'], ['3593', 'Buzinadas de ônibus', 'city'], ['2721', 'Buzina de caminhão', 'city'],
  ['1526', 'Porta de carro', 'city'], ['0281', 'Moto', 'city', 14], ['2996', 'Carro passando', 'city'], ['1145', 'Motor de caminhão', 'city', 15],
  ['0228', 'Vapor de trem', 'city'], ['2847', 'Buzina de trem', 'city'], ['3596', 'Metrô passando', 'city'],
  ['0263', 'Helicóptero (por dentro)', 'city'], ['0264', 'Helicóptero (por fora)', 'city'], ['2478', 'Avião pequeno passando', 'city', 15], ['3552', 'Drone', 'city', 15],
  ['0261', 'Apito de navio', 'city'], ['1049', 'Buzina de neblina', 'city'], ['1298', 'Caminhão dando ré (bipe)', 'city'],
  // Casa, objetos e passos
  ['1703', 'Porta abrindo', 'home'], ['1704', 'Porta fechando', 'home'], ['3205', 'Porta rangendo ao abrir', 'home'], ['3211', 'Porta rangendo ao fechar', 'home'],
  ['1501', 'Porta batendo 1', 'home'], ['0103', 'Porta batendo 2', 'home'], ['0015', 'Batendo na porta', 'home'], ['0320', 'Batendo na porta de vidro', 'home'],
  ['0198', 'Toc-toc na janela', 'home', 8], ['0039', 'Janela abrindo e fechando', 'home'], ['0303', 'Portão rangendo', 'home'],
  ['1320', 'Chave abrindo a porta', 'home'], ['0445', 'Molho de chaves', 'home', 10], ['2425', 'Chaves e fechadura', 'home'],
  ['1499', 'Gaveta abrindo', 'home'], ['1500', 'Gaveta fechando', 'home'], ['0193', 'Moedas caindo no chão', 'home'], ['0339', 'Moeda no copo', 'home'],
  ['0164', 'Virar página', 'home'], ['0362', 'Virar página de livro grande', 'home'], ['0018', 'Rasgar papel', 'home'], ['1223', 'Amassar papel', 'home'], ['0221', 'Lápis escrevendo', 'home', 10],
  ['3312', 'Água quente na caneca', 'home'], ['1114', 'Mordida na maçã', 'home'], ['0211', 'Rolha de champanhe', 'home'], ['0143', 'Fritando na frigideira', 'home'],
  ['0410', 'Mexendo o café', 'home', 10], ['1431', 'Abrindo pacote de salgadinho', 'home'], ['3247', 'Bebendo da garrafa', 'home', 10],
  ['1335', 'Brinde com taças', 'home'], ['2888', 'Brinde (tim-tim)', 'home'],
  ['2376', 'Micro-ondas funcionando', 'home'], ['0722', 'Aspirador de pó', 'home'], ['1157', 'Geladeira', 'home'], ['1116', 'Máquina de costura', 'home'],
  ['0718', 'Escovando os dentes', 'home'], ['0024', 'Vassoura', 'home'], ['0005', 'Martelando prego', 'home', 10], ['0559', 'Serrote', 'home'],
  ['0454', 'Motosserra', 'home', 15], ['0008', 'Tesoura', 'home', 10], ['0184', 'Furadeira', 'home'], ['0629', 'Velcro', 'home', 8], ['0013', 'Rasgar pano', 'home'],
  ['0581', 'Dados na mesa', 'home', 10], ['1274', 'Pisando em peças de montar', 'home', 10], ['2118', 'Zumbido de lâmpada fluorescente', 'home'],
  ['0134', 'Choque elétrico', 'home', 10], ['0359', 'Corrente pesada', 'home'], ['1130', 'Enchendo balão', 'home'], ['1486', 'Vazamento de ar', 'home', 10],
  ['0166', 'Passos de salto alto', 'home'], ['0165', 'Passos no assoalho', 'home'], ['0514', 'Correndo de tênis', 'home', 10], ['0137', 'Passos em folhas secas', 'home'],
  ['0208', 'Passos na neve', 'home'], ['3447', 'Tênis rangendo', 'home'], ['0518', 'Assoalho rangendo', 'home', 10], ['1025', 'Três batidas (teatro)', 'home'],
  // Tempo e alertas
  ['0035', 'Alarme eletrônico 1', 'alert', 10], ['0173', 'Alarme eletrônico 2', 'alert'], ['3411', 'Alarme de evacuação', 'alert'], ['2814', 'Despertador mecânico', 'alert'],
  ['1153', 'Detector de fumaça', 'alert', 10], ['1592', 'Alarme piezo', 'alert'], ['3513', 'Pager', 'alert'],
  ['2365', 'Campainha de casa', 'alert'], ['2880', 'Campainha grande', 'alert'], ['3588', 'Sino de porta de loja', 'alert'], ['3046', 'Campainha mecânica', 'alert'],
  ['0135', 'Sino de igreja (gravação)', 'alert', 15], ['0292', 'Sininho', 'alert'], ['1102', 'Campainha de bicicleta', 'alert'], ['2531', 'Sino de balcão', 'alert'],
  ['2533', 'Sino de balcão duplo', 'alert'], ['1482', 'Gongo suave', 'alert'], ['2816', 'Tique-taque de despertador', 'alert', 15], ['0007', 'Relógio', 'alert'],
  ['1567', 'Relógio de pêndulo', 'alert'], ['3360', 'Badalada de relógio de pêndulo', 'alert'], ['0082', 'Timer de cozinha', 'alert'], ['2138', 'Cronômetro', 'alert'],
  ['0457', 'Monitor cardíaco', 'alert'], ['1309', 'Parada cardíaca (monitor)', 'alert', 15], ['2256', 'Alarme de relógio digital', 'alert'],
  ['1017', 'Apito de plástico', 'alert', 8], ['1105', 'Apitos', 'alert'],
  // Música e percussão / magia
  ['3263', 'Toque de alvorada (corneta)', 'music', 19], ['2402', 'Rufar de tambor (gravação)', 'music'], ['2406', 'Rufar curto', 'music'],
  ['1110', 'Tigela tibetana', 'music', 15], ['1109', 'Tigela tibetana cantando', 'music', 15], ['0920', 'Glockenspiel', 'music', 10],
  ['2338', 'Tom grave', 'music'], ['2314', 'Prato de bateria', 'music', 10], ['2310', 'Caixa de bateria', 'music'], ['1970', 'Baquetas', 'music'],
  ['0468', 'Metrônomo', 'music', 10], ['1674', 'Caixinha de música (dando corda)', 'music', 10], ['2524', 'Corneta 1', 'music'], ['2520', 'Corneta 2', 'music'],
  ['2086', 'Sininhos de sonho 1', 'magic'], ['2079', 'Sininhos de sonho 2', 'magic'], ['2687', 'Sinos de vento', 'magic', 15],
  // Ficção científica
  ['2036', 'Nave espacial passando 1', 'scifi'], ['2035', 'Nave espacial passando 2', 'scifi'], ['1971', 'Nave espacial passando 3', 'scifi'],
  ['1972', 'Disco voador passando', 'scifi', 15], ['2122', 'Disco voador girando', 'scifi'], ['0338', 'Veículo futurista 1', 'scifi'], ['0337', 'Veículo futurista 2', 'scifi'],
  ['0336', 'Porta automática', 'scifi'], ['1388', 'Zumbido no ouvido (depois da explosão)', 'scifi'], ['3569', 'Escala de Shepard (tensão)', 'scifi'],
  ['2911', 'Servomotor', 'scifi'], ['0950', 'Solda elétrica', 'scifi', 10], ['0335', 'Linguagem de máquina', 'scifi'], ['1975', 'Voz de robô', 'scifi'], ['1920', 'Sonar', 'scifi', 15],
  // Esportes
  ['1044', 'Chute na bola', 'sports', 10], ['1045', 'Bola quicando', 'sports'], ['0584', 'Bola de tênis quicando', 'sports', 10], ['2239', 'Bolinha de pingue-pongue', 'sports'],
  ['0537', 'Badminton', 'sports', 10], ['2445', 'Treino de boxe', 'sports', 15], ['0938', 'Tênis rangendo na quadra', 'sports', 10], ['1825', 'Bola na parede', 'sports'],
  // Armas e explosões
  ['1808', 'Explosão próxima', 'weapons'], ['1807', 'Explosão a média distância', 'weapons'], ['1023', 'Explosão distante 1', 'weapons'], ['1806', 'Explosão distante 2', 'weapons'],
  ['0437', 'Tiro de submetralhadora', 'weapons'], ['0438', 'Tiro de revólver', 'weapons'], ['0397', 'Tiro de rifle', 'weapons'],
  ['2854', 'Tiro de espingarda 1', 'weapons'], ['2853', 'Tiro de espingarda 2', 'weapons'], ['0532', 'Tiros de espingarda', 'weapons'],
  ['1987', 'Engatilhar pistola', 'weapons'], ['1989', 'Carregar pente', 'weapons'], ['1355', 'Cápsula caindo', 'weapons'],
  ['1140', 'Bombinha 1', 'weapons'], ['1137', 'Bombinha 2', 'weapons'], ['2672', 'Fogos de artifício', 'weapons', 20], ['1306', 'Pavio queimando', 'weapons', 10],
  ['1278', 'Vela de faísca', 'weapons', 15], ['0129', 'Espada deslizando', 'weapons'], ['0127', 'Espada cortando', 'weapons'], ['0549', 'Arco e flecha', 'weapons'],
  ['0548', 'Flecha no alvo', 'weapons'], ['0832', 'Afiando faca', 'weapons', 10],
];

// Kenney: pacotes (zip) e como cada grupo de arquivos vira nome/categoria. Grupos numerados (… 1, 2, 3).
export const KENNEY_ZIPS = {
  casino: 'https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip',
  scifi: 'https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip',
  interface: 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
  impact: 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
  fighter: 'https://kenney.nl/media/pages/assets/voiceover-pack-fighter/6ceb77c6f1-1677589837/kenney_voiceover-pack-fighter.zip',
  voice: 'https://kenney.nl/media/pages/assets/voiceover-pack/3f7f168698-1677589897/kenney_voiceover-pack.zip',
  jingles: 'https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip',
  rpg: 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip',
  digital: 'https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip',
  ui: 'https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip',
};

// [pacote, regex do nome do arquivo (sem número/extensão), nome, categoria, máximo de arquivos do grupo]
export const KENNEY_GRUPOS = [
  ['casino', /^card-fan$/, 'Cartas em leque', 'home'], ['casino', /^card-place$/, 'Carta na mesa', 'home'],
  ['casino', /^card-shove$/, 'Empurrar carta', 'home'], ['casino', /^card-shuffle$/, 'Embaralhar cartas', 'home'],
  ['casino', /^card-slide$/, 'Deslizar carta', 'home', 4], ['casino', /^cards-pack-open$/, 'Abrir baralho', 'home'],
  ['casino', /^cards-pack-take-out$/, 'Tirar cartas do baralho', 'home'], ['casino', /^chip-lay$/, 'Ficha na mesa', 'home'],
  ['casino', /^chips-collide$/, 'Fichas batendo', 'home'], ['casino', /^chips-handle$/, 'Mexendo nas fichas', 'home', 3],
  ['casino', /^chips-stack$/, 'Empilhando fichas', 'home', 3], ['casino', /^dice-grab$/, 'Pegando dados', 'home'],
  ['casino', /^dice-shake$/, 'Sacudindo dados', 'home'], ['casino', /^dice-throw$/, 'Jogando dados', 'home'], ['casino', /^die-throw$/, 'Jogando um dado', 'home'],

  ['digital', /^highDown$/, 'Agudo descendo', 'game'], ['digital', /^highUp$/, 'Agudo subindo', 'game'], ['digital', /^laser$/, 'Laser 8-bit', 'game'],
  ['digital', /^lowDown$/, 'Grave descendo', 'game'], ['digital', /^lowRandom$/, 'Grave aleatório', 'game'], ['digital', /^lowThreeTone$/, 'Três tons graves', 'game'],
  ['digital', /^pepSound$/, 'Pep', 'game'], ['digital', /^phaseJump$/, 'Salto de fase', 'game'], ['digital', /^phaserDown$/, 'Phaser descendo', 'game'],
  ['digital', /^phaserUp$/, 'Phaser subindo', 'game'], ['digital', /^powerUp$/, 'Power-up', 'game'], ['digital', /^spaceTrash$/, 'Lixo espacial', 'game'],
  ['digital', /^threeTone$/, 'Três tons', 'game'], ['digital', /^tone$/, 'Tom', 'game'], ['digital', /^twoTone$/, 'Dois tons', 'game'],
  ['digital', /^zap$/, 'Zap digital', 'game'], ['digital', /^zapThreeToneDown$/, 'Zap descendo', 'game'], ['digital', /^zapThreeToneUp$/, 'Zap subindo', 'game'],
  ['digital', /^zapTwoTone$/, 'Zap de dois tons', 'game'],

  ['impact', /^footstep_carpet$/, 'Passo no carpete', 'home'], ['impact', /^footstep_concrete$/, 'Passo no concreto', 'home'],
  ['impact', /^footstep_grass$/, 'Passo na grama', 'home'], ['impact', /^footstep_snow$/, 'Passo na neve', 'home'], ['impact', /^footstep_wood$/, 'Passo na madeira', 'home'],
  ['impact', /^impactBell_heavy$/, 'Pancada em sino', 'impact'], ['impact', /^impactGeneric_light$/, 'Pancada leve', 'impact'],
  ['impact', /^impactGlass_heavy$/, 'Vidro (pancada forte)', 'impact'], ['impact', /^impactGlass_light$/, 'Vidro (pancada leve)', 'impact'],
  ['impact', /^impactGlass_medium$/, 'Vidro (pancada média)', 'impact'], ['impact', /^impactMetal_heavy$/, 'Metal (pancada forte)', 'impact'],
  ['impact', /^impactMetal_light$/, 'Metal (pancada leve)', 'impact'], ['impact', /^impactMetal_medium$/, 'Metal (pancada média)', 'impact'],
  ['impact', /^impactMining$/, 'Picareta', 'impact'], ['impact', /^impactPlank_medium$/, 'Tábua', 'impact'],
  ['impact', /^impactPlate_heavy$/, 'Chapa (pancada forte)', 'impact'], ['impact', /^impactPlate_light$/, 'Chapa (pancada leve)', 'impact'],
  ['impact', /^impactPlate_medium$/, 'Chapa (pancada média)', 'impact'], ['impact', /^impactPunch_heavy$/, 'Soco forte', 'impact'],
  ['impact', /^impactPunch_medium$/, 'Soco médio', 'impact'], ['impact', /^impactSoft_heavy$/, 'Pancada abafada forte', 'impact'],
  ['impact', /^impactSoft_medium$/, 'Pancada abafada', 'impact'], ['impact', /^impactTin_medium$/, 'Lata', 'impact'],
  ['impact', /^impactWood_heavy$/, 'Madeira (pancada forte)', 'impact'], ['impact', /^impactWood_light$/, 'Madeira (pancada leve)', 'impact'],
  ['impact', /^impactWood_medium$/, 'Madeira (pancada média)', 'impact'],

  ['interface', /^back$/, 'Voltar', 'ui'], ['interface', /^bong$/, 'Bong', 'ui'], ['interface', /^click$/, 'Clique', 'ui'],
  ['interface', /^close$/, 'Fechar', 'ui'], ['interface', /^confirmation$/, 'Confirmação', 'ui'], ['interface', /^drop$/, 'Soltar', 'ui'],
  ['interface', /^error$/, 'Erro', 'ui', 5], ['interface', /^glass$/, 'Toque de vidro', 'ui'], ['interface', /^glitch$/, 'Glitch curto', 'ui'],
  ['interface', /^maximize$/, 'Maximizar', 'ui', 4], ['interface', /^minimize$/, 'Minimizar', 'ui', 4], ['interface', /^open$/, 'Abrir', 'ui'],
  ['interface', /^pluck$/, 'Beliscar', 'ui'], ['interface', /^question$/, 'Pergunta', 'ui'], ['interface', /^scratch$/, 'Arranhado', 'ui'],
  ['interface', /^scroll$/, 'Rolagem', 'ui'], ['interface', /^select$/, 'Selecionar', 'ui', 5], ['interface', /^switch$/, 'Chave', 'ui', 4],
  ['interface', /^tick$/, 'Tique', 'ui'], ['interface', /^toggle$/, 'Alternar', 'ui'],

  ['jingles', /^jingles_HIT$/, 'Vinheta de impacto', 'music'], ['jingles', /^jingles_NES$/, 'Vinheta 8-bit', 'music'],
  ['jingles', /^jingles_PIZZI$/, 'Vinheta pizzicato', 'music'], ['jingles', /^jingles_SAX$/, 'Vinheta de sax', 'music'],
  ['jingles', /^jingles_STEEL$/, 'Vinheta de steel drum', 'music'],

  ['rpg', /^beltHandle$/, 'Cinto', 'home'], ['rpg', /^bookClose$/, 'Fechar livro', 'home'], ['rpg', /^bookFlip$/, 'Folhear livro', 'home'],
  ['rpg', /^bookOpen$/, 'Abrir livro', 'home'], ['rpg', /^bookPlace$/, 'Pôr livro na mesa', 'home'], ['rpg', /^chop$/, 'Machadada', 'home'],
  ['rpg', /^cloth$/, 'Pano', 'home'], ['rpg', /^clothBelt$/, 'Roupa e cinto', 'home'], ['rpg', /^creak$/, 'Rangido', 'home'],
  ['rpg', /^doorClose$/, 'Porta de madeira fechando', 'home'], ['rpg', /^doorOpen$/, 'Porta de madeira abrindo', 'home'],
  ['rpg', /^drawKnife$/, 'Sacar faca', 'weapons'], ['rpg', /^dropLeather$/, 'Couro caindo', 'home'], ['rpg', /^footstep$/, 'Passo na terra', 'home', 4],
  ['rpg', /^handleCoins$/, 'Moedas na mão', 'home'], ['rpg', /^handleSmallLeather$/, 'Bolsinha de couro', 'home'],
  ['rpg', /^knifeSlice$/, 'Faca cortando', 'weapons'], ['rpg', /^metalClick$/, 'Clique metálico', 'home'], ['rpg', /^metalLatch$/, 'Trava metálica', 'home'],
  ['rpg', /^metalPot$/, 'Panela de metal', 'home'],

  ['scifi', /^computerNoise$/, 'Ruído de computador', 'scifi'], ['scifi', /^doorClose$/, 'Porta futurista fechando', 'scifi'],
  ['scifi', /^doorOpen$/, 'Porta futurista abrindo', 'scifi'], ['scifi', /^engineCircular$/, 'Motor circular', 'scifi', 3],
  ['scifi', /^explosionCrunch$/, 'Explosão seca', 'weapons'], ['scifi', /^forceField$/, 'Campo de força', 'scifi'],
  ['scifi', /^impactMetal$/, 'Impacto metálico', 'scifi'], ['scifi', /^laserLarge$/, 'Laser grande', 'scifi'],
  ['scifi', /^laserRetro$/, 'Laser retrô', 'scifi'], ['scifi', /^laserSmall$/, 'Laser pequeno', 'scifi'],
  ['scifi', /^lowFrequency_explosion$/, 'Explosão grave', 'weapons'], ['scifi', /^slime$/, 'Gosma', 'scifi'],
  ['scifi', /^spaceEngine$/, 'Motor de nave', 'scifi', 2], ['scifi', /^spaceEngineLarge$/, 'Motor de nave grande', 'scifi', 2],
  ['scifi', /^spaceEngineLow$/, 'Motor de nave grave', 'scifi', 2], ['scifi', /^spaceEngineSmall$/, 'Motor de nave pequena', 'scifi', 2],
  ['scifi', /^thrusterFire$/, 'Propulsor', 'scifi', 3],

  ['ui', /^click$/, 'Clique suave', 'ui'], ['ui', /^mouseclick$/, 'Clique de mouse (UI)', 'ui'], ['ui', /^mouserelease$/, 'Soltar o mouse', 'ui'],
  ['ui', /^rollover$/, 'Passar o mouse', 'ui', 4], ['ui', /^switch$/, 'Interruptor (UI)', 'ui', 8],
];

// Locuções em inglês (Kenney): arquivo → texto falado. Voz feminina/masculina e locutor de luta.
export const KENNEY_VOZES = {
  numeros: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
  fora: /^(kill_.*|war_.*)$/,   // fica de fora: "kill her/him/it" e as falas de guerra
};
