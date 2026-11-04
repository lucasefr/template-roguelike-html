# Template Roguelike HTML

Roguelike clássico em **HTML/CSS/JavaScript puro**: grid 2D, turnos, progressão com XP, itens, equipamentos e dificuldade por andar. Roda no navegador — sem build, sem servidor obrigatório, sem dependências de npm.

## Jogar online

GitHub Pages: [https://lucasefr.github.io/template-roguelike-html/](https://lucasefr.github.io/template-roguelike-html/)

## Como jogar offline

### Opção 1 — abrir o arquivo

1. Baixe o ZIP (`Code` → `Download ZIP`) ou clone o repositório
2. Abra `index.html` no Chrome, Edge ou Firefox (duplo clique ou arraste para o navegador)
3. Clique em **Jogar em tela cheia** (ou “Jogar na janela”)

### Opção 2 — clonar

```bash
git clone https://github.com/lucasefr/template-roguelike-html.git
cd template-roguelike-html
```

Depois abra `index.html`, ou suba um servidor local:

```bash
# Python 3
python -m http.server 8080

# ou Node
npx --yes serve .
```

Abra: [http://localhost:8080](http://localhost:8080)

## Controles

| Tecla | Ação |
|--------|------|
| Setas / WASD | Mover, atacar ou pegar item |
| `1`–`6` | Usar poção do inventário |
| `.` / Espaço | Esperar um turno |
| `R` | Reiniciar a run |
| `F` | Alternar tela cheia |
| `H` | Mostrar / esconder a HUD |

No celular há um D-pad na tela.

## O que tem no jogo

- Geração procedural de dungeon (salas + corredores)
- FOV e névoa de guerra
- 9 inimigos com comportamentos diferentes (rato, goblin, slime, morcego, esqueleto, orc, aranha, bruto, espectro)
- XP e níveis
- Poções e equipamentos (arma / armadura)
- Dificuldade e loot escalando com o andar
- UI overlay em tela cheia

## Estrutura

```
├── index.html          # Página do jogo
├── styles.css          # UI overlay / fullscreen
├── game.js             # Lógica do roguelike
└── assets/
    ├── sprites.js      # Tiles e sprites pixel art
    ├── portrait-hero.jpg
    ├── sprite-goblin.jpg
    ├── ui-banner.jpg
    └── tileset-preview.jpg
```

## Requisitos

- Navegador moderno com suporte a Canvas e Fullscreen API
- Conexão à internet só para as fontes do Google Fonts (o jogo funciona offline se as fontes falharem, com fallback do sistema)

## Licença

MIT — use, modifique e compartilhe à vontade.
