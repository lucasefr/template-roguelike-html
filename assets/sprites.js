/**
 * Procedural 16x16 pixel-art spritesheet for the roguelike map.
 * Builds ImageBitmaps at runtime so tiles stay crisp and packagable without binary PNGs.
 */
(function (global) {
  "use strict";

  const SPRITE_SIZE = 16;

  /** Palette keys used by sprite pixel maps. */
  const P = {
    _: null,
    k: "#1a120b",
    K: "#0d0a07",
    s: "#6b5a4a",
    S: "#8a7560",
    t: "#4a3f35",
    f: "#3a342c",
    F: "#4a4338",
    m: "#3d5a3a",
    M: "#2f4630",
    w: "#c9b896",
    W: "#e8d9b8",
    b: "#5b7cfa",
    B: "#3d5fd4",
    h: "#f0c8a0",
    H: "#d4a574",
    n: "#2a1f18",
    g: "#5aad4a",
    G: "#3d8534",
    e: "#8fd47a",
    r: "#c44a3a",
    R: "#8a2f24",
    y: "#e8c84a",
    Y: "#c9a22e",
    p: "#9b6bdb",
    P: "#6e45a8",
    u: "#d8e6f0",
    o: "#d4893a",
    O: "#a86420",
    a: "#7a8a9a",
    A: "#9aabba",
    c: "#5ec8c0",
    C: "#2f8f88",
    i: "#c8b8a0",
    I: "#9a8a70",
    v: "#d45ad4",
    V: "#8a2f8a",
    z: "#f0f0e8",
    Z: "#b8b8a8",
    q: "#6a4a2a",
    Q: "#4a3018",
  };

  /**
   * Parses a multiline sprite string into a 16x16 color grid.
   * @param {string} art - 16 rows of 16 palette characters.
   * @returns {(string|null)[][]} Color grid [y][x].
   */
  function parseArt(art) {
    const rows = art.trim().split("\n").map((line) => line.trim());
    const grid = [];
    for (let y = 0; y < SPRITE_SIZE; y++) {
      const row = [];
      const line = rows[y] || "";
      for (let x = 0; x < SPRITE_SIZE; x++) {
        const key = line[x] || "_";
        row.push(Object.prototype.hasOwnProperty.call(P, key) ? P[key] : null);
      }
      grid.push(row);
    }
    return grid;
  }

  /**
   * Draws a parsed color grid onto a canvas 2D context at an offset.
   * @param {CanvasRenderingContext2D} ctx - Target context.
   * @param {(string|null)[][]} grid - Sprite color grid.
   * @param {number} ox - Pixel offset X on the sheet.
   * @param {number} oy - Pixel offset Y on the sheet.
   * @returns {void}
   */
  function blitGrid(ctx, grid, ox, oy) {
    for (let y = 0; y < SPRITE_SIZE; y++) {
      for (let x = 0; x < SPRITE_SIZE; x++) {
        const color = grid[y][x];
        if (!color) {
          continue;
        }
        ctx.fillStyle = color;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  const ART = {
    floor: `
ffffffffffffFFFF
fFFFFFFFFFFFFFFF
FfFfFfFfFfFfFfFf
FFFFFFFFFFFFFFFF
FFFFFFmFFFFFFFFF
FfFfFfFfFfFfFfFf
FFFFFFFFFFFFFFFF
FFFFFFFmmFFFFFFF
FfFfFfFfFfFfFfFf
FFFFFFFFFFFFFFFF
FFmFFFFFFFFFFFFF
FfFfFfFfFfFfFfFf
FFFFFFFFFFFFFFFF
FFFFFFFFFmFFFFFF
FfFfFfFfFfFfFfFf
FFFFFFFFFFFFFFFF
`,
    wall: `
KKKKKKKKKKKKKKKK
KssSssSssSssSssK
KtTtTtTtTtTtTttK
KssSssSssSssSssK
KtTtTtTtTtTtTttK
KssSssSssSssSssK
KtTtTtTtTtTtTttK
KssSssSssSssSssK
KtTtTtTtTtTtTttK
KssSssSssSssSssK
KtTtTtTtTtTtTttK
KssSssSssSssSssK
KtTtTtTtTtTtTttK
KssSssSssSssSssK
KtTtTtTtTtTtTttK
KKKKKKKKKKKKKKKK
`,
    wallTop: `
aaaaaaaaaaaaaaaa
AAssSssSssSssSaA
aSsSsSsSsSsSsSsa
AssSssSssSssSssA
aTtTtTtTtTtTtTta
AssSssSssSssSssA
aTtTtTtTtTtTtTta
AssSssSssSssSssA
aTtTtTtTtTtTtTta
AssSssSssSssSssA
aTtTtTtTtTtTtTta
AssSssSssSssSssA
aTtTtTtTtTtTtTta
AssSssSssSssSssA
aKKKKKKKKKKKKKKa
aaaaaaaaaaaaaaaa
`,
    stairs: `
ffffffffffffFFFF
fFFFyyyyyyyyFFFF
FfFfyPPPPpyyFfFf
FFFFyPuuupyFFFFF
FFFFyPuuupyFFFFF
FfFfyPuuupyfFfFf
FFFFyPuuupyFFFFF
FFFFyPuuupyFFFFF
FfFfyPuuupyfFfFf
FFFFyPuuupyFFFFF
FFFFyPuuupyFFFFF
FfFfyPPPPpyfFfFf
FFFFyyyyyyyyFFFF
FFFFFFFFFFFFFFFF
FfFfFfFfFfFfFfFf
FFFFFFFFFFFFFFFF
`,
    player: `
________________
_______nn_______
______nhhn______
_____nhWWhn_____
_____nHHHHHn____
______nHHh______
_____nBBBBbn____
____nbBBBBbBn___
____nBbBBbBbn___
_____nBBBBn_____
______nBBn______
_____nhhhn______
____nh___hn_____
____n_____n_____
___nn_____nn____
________________
`,
    goblin: `
________________
______nGGn______
_____nGeGeGn____
_____nGGGGGn____
______nGGn______
_____nGGGGn_____
____nGrrrrGn____
____nGGGGGn_____
_____nGGGGn_____
______nGGn______
_____neeeen_____
____ne___en_____
____n_____n_____
___nn_____nn____
________________
________________
`,
    heart: `
________________
________________
___rr__rr_______
__rRRrrRRr______
__rRRRRRRr______
__rRRRRRRr______
___rRRRRr_______
____rRRr________
_____rr_________
________________
________________
________________
________________
________________
________________
________________
`,
    sword: `
_____________y__
____________yY__
___________yYa__
__________yYa___
_________yYa____
________yYa_____
_______yYa______
__aa__yYa_______
_aAAaYa_________
__aaYa__________
___Ya___________
__aAa___________
_a__a___________
________________
________________
________________
`,
    potion: `
________________
_______nn_______
______nuun______
______nuun______
______nrrn______
_____nrRRrn_____
_____nrRRrn_____
_____nrRRrn_____
_____nrRRrn_____
______nrrn______
_______nn_______
________________
________________
________________
________________
________________
`,
    armor: `
________________
______aaaa______
_____aAAAAa_____
____aAAssAAa____
____aAssssAa____
____aAssssAa____
____aAssssAa____
____aAssssAa____
____aAAAAAAa____
_____aaaaaa_____
________________
________________
________________
________________
________________
________________
`,
    orc: `
________________
______nnnn______
_____nOoOon_____
_____nOOOOn_____
______nOOn______
_____nOOOOn_____
____nOrrrrOn____
____nOOOOOn_____
_____nOOOOn_____
______nOOn______
_____nOOOOOn____
____nO___On_____
____n_____n_____
___nn_____nn____
________________
________________
`,
    rat: `
________________
________________
________________
______nn________
_____nIIi_______
____nIiZin______
___nIIZIin______
____nIIInn______
_____nn_n_______
______n__nn_____
_____________nn_
________________
________________
________________
________________
________________
`,
    skeleton: `
________________
_______nn_______
______nzzzn_____
_____nzZZzn_____
______nZZn______
_____nZZZZn_____
____nZ___Zn_____
_____nZZZn______
______nZZn______
_____nZ__Zn_____
____nZ____Zn____
________________
________________
________________
________________
________________
`,
    bat: `
________________
________________
_pp________pp___
_pPp______pPp___
__pPPnnnnPPp____
___nPvPPvPn_____
____nPPPPn______
_____nPPn_______
______nn________
________________
________________
________________
________________
________________
________________
________________
`,
    slime: `
________________
________________
________________
______cccc______
_____cCCCCc_____
____cCccCCc_____
____cCuuCCc_____
____cCCCCCc_____
_____cCCCCc_____
______cccc______
_____c____c_____
________________
________________
________________
________________
________________
`,
    spider: `
________________
________________
_n__n____n__n___
__n_nPPPn_n_____
___nPPPPPn______
____nPvPvn______
____nPPPPn______
___n_nPPn_n_____
__n___nn___n____
_n___________n__
________________
________________
________________
________________
________________
________________
`,
    brute: `
________________
_____nnnnnn_____
____nQQQQqn_____
___nQqQqQqn_____
___nQQQQQQn_____
____nQQQQn______
___nQrrrrQn_____
___nQQQQQQn_____
____nQQQQn______
_____nQQn_______
____nQQQQn______
___nQ____Qn_____
___n______n_____
__nn______nn____
________________
________________
`,
    wraith: `
________________
______nppn______
_____npPPpn_____
____npPuupn_____
____npPPPpn_____
_____npPpn______
____npPPPpn_____
___npPPPPPpn____
____npPPPpn_____
_____npppn______
______n__n______
_______nn_______
________________
________________
________________
________________
`,
  };

  /**
   * Builds the spritesheet canvas and returns draw helpers.
   * @returns {{
   *   size: number,
   *   sheet: HTMLCanvasElement,
   *   frames: Object.<string,{sx:number,sy:number}>,
   *   draw: function(CanvasRenderingContext2D,string,number,number,number=,number=,number=):void
   * }}
   */
  function createSprites() {
    const names = Object.keys(ART);
    const sheet = document.createElement("canvas");
    sheet.width = names.length * SPRITE_SIZE;
    sheet.height = SPRITE_SIZE;
    const ctx = sheet.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    /** @type {Object.<string,{sx:number,sy:number}>} */
    const frames = {};
    names.forEach((name, index) => {
      frames[name] = { sx: index * SPRITE_SIZE, sy: 0 };
      blitGrid(ctx, parseArt(ART[name]), index * SPRITE_SIZE, 0);
    });

    /**
     * Draws a named sprite scaled onto a destination context.
     * @param {CanvasRenderingContext2D} dest - Destination canvas context.
     * @param {string} name - Sprite frame name.
     * @param {number} dx - Destination X in pixels.
     * @param {number} dy - Destination Y in pixels.
     * @param {number} [dw=SPRITE_SIZE] - Destination width.
     * @param {number} [dh=SPRITE_SIZE] - Destination height.
     * @param {number} [alpha=1] - Opacity from 0 to 1.
     * @returns {void}
     */
    function draw(dest, name, dx, dy, dw, dh, alpha) {
      const frame = frames[name];
      if (!frame) {
        return;
      }
      const width = dw == null ? SPRITE_SIZE : dw;
      const height = dh == null ? SPRITE_SIZE : dh;
      const previous = dest.globalAlpha;
      dest.imageSmoothingEnabled = false;
      dest.globalAlpha = alpha == null ? 1 : alpha;
      dest.drawImage(
        sheet,
        frame.sx,
        frame.sy,
        SPRITE_SIZE,
        SPRITE_SIZE,
        dx,
        dy,
        width,
        height
      );
      dest.globalAlpha = previous;
    }

    return { size: SPRITE_SIZE, sheet, frames, draw };
  }

  global.RoguelikeSprites = { SPRITE_SIZE, createSprites };
})(window);
