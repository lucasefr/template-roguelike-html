/**
 * Opt-in room that shows the five static Limbo sprites from Pixel or Voidless.
 *
 * game.js keeps its renderer private inside an IIFE, so this page does not
 * import or replace it. Camera fit, radial light and Bresenham vision follow
 * the same rules as game.js (resizeCanvas, draw and computeFov) with the
 * proposed 16px cell instead of the default game's 20px cell.
 *
 * Switching sets changes only the image source. Tile positions, camera and
 * light stay on the same numbers. No pixel of the PNG files is rewritten.
 */
(function () {
  "use strict";

  var TILE_SIZE = 16;
  var FOV_RADIUS = 8;
  var LIGHT_INNER_TILES = 2;
  var LIGHT_EDGE_ALPHA = 0.28;
  var EXPLORED_DIM_ALPHA = 0.35;
  var PAGE_BACKDROP = "#050302";
  var MAP_BACKDROP = "#070504";
  var GRID_COLOR = "rgba(0, 229, 255, 0.55)";
  var TILE_WALL = 0;
  var TILE_FLOOR = 1;
  var HERO_FRAME = { width: 16, height: 24, footX: 8, footY: 24 };
  var ENEMY_FRAME = { width: 16, height: 24, footX: 8, footY: 24 };
  var PACT_FRAME = { width: 16, height: 32, footX: 8, footY: 32 };
  var ASSET_NAMES = ["floor_base", "wall_n", "hero_heavy", "enemy_sample", "pact_mark"];
  var SET_IDS = ["pixel", "voidless"];
  var ROOM_ROWS = [
    "#############",
    "#...........#",
    "#...........#",
    "#....H......#",
    "#...........#",
    "#..##.......#",
    "#..#.....E..#",
    "#...........#",
    "#############",
  ];
  var MOVE_KEYS = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    W: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    S: { x: 0, y: 1 },
    a: { x: -1, y: 0 },
    A: { x: -1, y: 0 },
    d: { x: 1, y: 0 },
    D: { x: 1, y: 0 },
  };

  var canvas = document.getElementById("sala");
  var context = canvas.getContext("2d");
  var setLabel = document.getElementById("conjuntoAtivo");
  var statusLine = document.getElementById("estado");
  var errorLine = document.getElementById("erro");
  var pixelButton = document.getElementById("btnPixel");
  var voidlessButton = document.getElementById("btnVoidless");

  var room = buildRoom(ROOM_ROWS);
  var view = { scale: 1, offsetX: 0, offsetY: 0 };
  var state = {
    setId: readRequestedSet(),
    hero: { x: room.hero.x, y: room.hero.y },
    enemy: { x: room.enemy.x, y: room.enemy.y },
    showGrid: false,
    showPact: true,
    images: null,
    failed: false,
  };

  /**
   * Reads the optional conjunto query. Unknown values fall back to Pixel.
   * Falling back does not rank the sets; Pixel is only the first column.
   * @returns {"pixel"|"voidless"} Active set id.
   */
  function readRequestedSet() {
    var params = new URLSearchParams(window.location.search);
    var requested = params.get("conjunto");
    if (requested === "voidless") {
      return "voidless";
    }
    return "pixel";
  }

  /**
   * Builds the fixed room from ASCII rows.
   * '#' is wall_n, '.' is floor_base, 'H' and 'E' are floor plus actors.
   * @param {string[]} rows - Equal-length room rows.
   * @returns {{
   *   width: number,
   *   height: number,
   *   tiles: number[][],
   *   hero: {x:number,y:number},
   *   enemy: {x:number,y:number}
   * }} Parsed room.
   */
  function buildRoom(rows) {
    var width = rows[0].length;
    var height = rows.length;
    var tiles = [];
    var hero = null;
    var enemy = null;

    for (var y = 0; y < height; y++) {
      if (rows[y].length !== width) {
        throw new Error("Room row " + y + " has a different length.");
      }
      var line = [];
      for (var x = 0; x < width; x++) {
        var symbol = rows[y].charAt(x);
        if (symbol === "#") {
          line.push(TILE_WALL);
          continue;
        }
        line.push(TILE_FLOOR);
        if (symbol === "H") {
          hero = { x: x, y: y };
        } else if (symbol === "E") {
          enemy = { x: x, y: y };
        } else if (symbol !== ".") {
          throw new Error("Unknown room symbol: " + symbol);
        }
      }
      tiles.push(line);
    }

    if (!hero || !enemy) {
      throw new Error("The room needs both a hero and an enemy.");
    }

    return { width: width, height: height, tiles: tiles, hero: hero, enemy: enemy };
  }

  /**
   * Creates a boolean grid filled with one value.
   * @param {number} width - Grid width in tiles.
   * @param {number} height - Grid height in tiles.
   * @param {boolean} fill - Value stored in every cell.
   * @returns {boolean[][]} Filled grid.
   */
  function createBooleanGrid(width, height, fill) {
    var grid = [];
    for (var y = 0; y < height; y++) {
      var row = [];
      for (var x = 0; x < width; x++) {
        row.push(fill);
      }
      grid.push(row);
    }
    return grid;
  }

  /**
   * Returns the Chebyshev distance between two tiles.
   * @param {number} fromX - Origin tile X.
   * @param {number} fromY - Origin tile Y.
   * @param {number} toX - Target tile X.
   * @param {number} toY - Target tile Y.
   * @returns {number} max(|dx|, |dy|).
   */
  function chebyshevDistance(fromX, fromY, toX, toY) {
    return Math.max(Math.abs(fromX - toX), Math.abs(fromY - toY));
  }

  /**
   * Marks tiles visible from the hero using the game's ray rules.
   * Same Bresenham walk and Chebyshev radius as game.js computeFov.
   * Walls stop the ray after the wall tile itself is marked.
   * @param {{x:number,y:number}} origin - Viewer tile.
   * @returns {boolean[][]} Visibility grid.
   */
  function computeFov(origin) {
    var width = room.width;
    var height = room.height;
    var visible = createBooleanGrid(width, height, false);

    /**
     * Casts one line of sight and stops on the first wall.
     * @param {number} targetX - Ray target tile X.
     * @param {number} targetY - Ray target tile Y.
     * @returns {void}
     */
    function castRay(targetX, targetY) {
      var x0 = origin.x;
      var y0 = origin.y;
      var deltaX = Math.abs(targetX - x0);
      var deltaY = Math.abs(targetY - y0);
      var stepX = x0 < targetX ? 1 : -1;
      var stepY = y0 < targetY ? 1 : -1;
      var error = deltaX - deltaY;

      while (true) {
        if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) {
          break;
        }
        visible[y0][x0] = true;
        if (room.tiles[y0][x0] === TILE_WALL && !(x0 === origin.x && y0 === origin.y)) {
          break;
        }
        if (x0 === targetX && y0 === targetY) {
          break;
        }
        var doubled = 2 * error;
        if (doubled > -deltaY) {
          error -= deltaY;
          x0 += stepX;
        }
        if (doubled < deltaX) {
          error += deltaX;
          y0 += stepY;
        }
      }
    }

    for (var y = origin.y - FOV_RADIUS; y <= origin.y + FOV_RADIUS; y++) {
      for (var x = origin.x - FOV_RADIUS; x <= origin.x + FOV_RADIUS; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) {
          continue;
        }
        if (chebyshevDistance(origin.x, origin.y, x, y) > FOV_RADIUS) {
          continue;
        }
        castRay(x, y);
      }
    }

    return visible;
  }

  /**
   * Loads one PNG and resolves only after the browser can decode it.
   * @param {string} url - Relative URL of the PNG.
   * @returns {Promise<HTMLImageElement>} Decoded image.
   */
  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () {
        resolve(image);
      };
      image.onerror = function () {
        reject(new Error("Falha ao carregar " + url));
      };
      image.src = url;
    });
  }

  /**
   * Loads both processed sets. Files are used at their native size.
   * @returns {Promise<{pixel: Object.<string, HTMLImageElement>, voidless: Object.<string, HTMLImageElement>}>}
   *   Images keyed by asset name.
   */
  function loadBothSets() {
    var sets = { pixel: {}, voidless: {} };
    var pending = [];

    SET_IDS.forEach(function (setId) {
      ASSET_NAMES.forEach(function (name) {
        var url = "assets/" + setId + "/" + name + ".png";
        pending.push(
          loadImage(url).then(function (image) {
            sets[setId][name] = image;
          })
        );
      });
    });

    return Promise.all(pending).then(function () {
      return sets;
    });
  }

  /**
   * Checks that a decoded sprite still has the contract size.
   * A mismatch is reported and the image is not stretched.
   * @param {HTMLImageElement} image - Decoded sprite.
   * @param {number} width - Expected width in pixels.
   * @param {number} height - Expected height in pixels.
   * @param {string} label - Asset label used in the error.
   * @returns {void}
   */
  function assertFrameSize(image, width, height, label) {
    if (image.naturalWidth !== width || image.naturalHeight !== height) {
      throw new Error(
        label +
          " veio " +
          image.naturalWidth +
          "×" +
          image.naturalHeight +
          " e o contrato pede " +
          width +
          "×" +
          height +
          ". A imagem não foi esticada."
      );
    }
  }

  /**
   * Validates every loaded sprite against the proposed frames.
   * @param {{pixel: Object.<string, HTMLImageElement>, voidless: Object.<string, HTMLImageElement>}} images
   *   Both decoded sets.
   * @returns {void}
   */
  function assertAllFrames(images) {
    SET_IDS.forEach(function (setId) {
      var set = images[setId];
      assertFrameSize(set.floor_base, TILE_SIZE, TILE_SIZE, setId + " floor_base");
      assertFrameSize(set.wall_n, TILE_SIZE, TILE_SIZE, setId + " wall_n");
      assertFrameSize(set.hero_heavy, HERO_FRAME.width, HERO_FRAME.height, setId + " hero_heavy");
      assertFrameSize(set.enemy_sample, ENEMY_FRAME.width, ENEMY_FRAME.height, setId + " enemy_sample");
      assertFrameSize(set.pact_mark, PACT_FRAME.width, PACT_FRAME.height, setId + " pact_mark");
    });
  }

  /**
   * Returns the top-left world pixel of a sprite whose foot point
   * rests on the bottom edge of a tile, horizontally at footX.
   * Hero and enemy use (8, 24). The pact uses (8, 32) on the same foot point,
   * which places the hero 8px below the pact's top, as in the 16×32 composite.
   * @param {number} tileX - Tile column.
   * @param {number} tileY - Tile row.
   * @param {{footX:number, footY:number}} frame - Anchor inside the sprite.
   * @returns {{x:number,y:number}} Top-left in world pixels.
   */
  function spriteOrigin(tileX, tileY, frame) {
    var footX = tileX * TILE_SIZE + frame.footX;
    var footY = (tileY + 1) * TILE_SIZE;
    return {
      x: footX - frame.footX,
      y: footY - frame.footY,
    };
  }

  /**
   * Fits the whole room with an integer zoom, the same centering idea as
   * game.js resizeCanvas. Fractional scale is refused so the pixels stay square.
   * @returns {void}
   */
  function resizeView() {
    var width = Math.max(1, canvas.clientWidth);
    var height = Math.max(1, canvas.clientHeight);
    canvas.width = width;
    canvas.height = height;

    var mapWidth = room.width * TILE_SIZE;
    var mapHeight = room.height * TILE_SIZE;
    var fitted = Math.floor(Math.min(width / mapWidth, height / mapHeight));
    view.scale = Math.max(1, fitted);
    view.offsetX = Math.floor((width - mapWidth * view.scale) / 2);
    view.offsetY = Math.floor((height - mapHeight * view.scale) / 2);
  }

  /**
   * Draws one native-size image at an integer world position.
   * Destination size is omitted on purpose: the PNG is never resampled
   * before the integer camera zoom.
   * @param {HTMLImageElement} image - Sprite to draw.
   * @param {number} x - World X.
   * @param {number} y - World Y.
   * @param {number} alpha - Opacity from 0 to 1.
   * @returns {void}
   */
  function drawNative(image, x, y, alpha) {
    context.globalAlpha = alpha;
    context.drawImage(image, x, y);
    context.globalAlpha = 1;
  }

  /**
   * Draws floor and wall cells. Walls use only wall_n.
   * @param {Object.<string, HTMLImageElement>} sprites - Active set.
   * @param {boolean[][]} visible - Current vision grid.
   * @returns {void}
   */
  function drawTerrain(sprites, visible) {
    for (var y = 0; y < room.height; y++) {
      for (var x = 0; x < room.width; x++) {
        var alpha = visible[y][x] ? 1 : EXPLORED_DIM_ALPHA;
        var image = room.tiles[y][x] === TILE_WALL ? sprites.wall_n : sprites.floor_base;
        drawNative(image, x * TILE_SIZE, y * TILE_SIZE, alpha);
      }
    }
  }

  /**
   * Draws the enemy, the hero and the separate pact layer.
   * @param {Object.<string, HTMLImageElement>} sprites - Active set.
   * @param {boolean[][]} visible - Current vision grid.
   * @returns {void}
   */
  function drawActors(sprites, visible) {
    var enemyAlpha = visible[state.enemy.y][state.enemy.x] ? 1 : EXPLORED_DIM_ALPHA;
    var heroAlpha = visible[state.hero.y][state.hero.x] ? 1 : EXPLORED_DIM_ALPHA;
    var enemyOrigin = spriteOrigin(state.enemy.x, state.enemy.y, ENEMY_FRAME);
    var heroOrigin = spriteOrigin(state.hero.x, state.hero.y, HERO_FRAME);
    var pactOrigin = spriteOrigin(state.hero.x, state.hero.y, PACT_FRAME);

    drawNative(sprites.enemy_sample, enemyOrigin.x, enemyOrigin.y, enemyAlpha);
    drawNative(sprites.hero_heavy, heroOrigin.x, heroOrigin.y, heroAlpha);
    if (state.showPact) {
      drawNative(sprites.pact_mark, pactOrigin.x, pactOrigin.y, heroAlpha);
    }
  }

  /**
   * Darkens the map with the same radial veil as game.js draw.
   * The center is the hero cell center. Inner radius is 2 cells and the
   * outer radius is the vision radius. The edge stop is black at 0.28.
   * @returns {void}
   */
  function drawLight() {
    var centerX = state.hero.x * TILE_SIZE + TILE_SIZE / 2;
    var centerY = state.hero.y * TILE_SIZE + TILE_SIZE / 2;
    var gradient = context.createRadialGradient(
      centerX,
      centerY,
      TILE_SIZE * LIGHT_INNER_TILES,
      centerX,
      centerY,
      TILE_SIZE * FOV_RADIUS
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0," + LIGHT_EDGE_ALPHA + ")");
    context.fillStyle = gradient;
    context.fillRect(0, 0, room.width * TILE_SIZE, room.height * TILE_SIZE);
  }

  /**
   * Draws a cyan reference grid above the art. It is off by default and
   * uses a color outside the sprite palette so it cannot be read as a tile.
   * @returns {void}
   */
  function drawReferenceGrid() {
    context.strokeStyle = GRID_COLOR;
    context.lineWidth = 1;
    context.beginPath();
    for (var x = 0; x <= room.width; x++) {
      context.moveTo(x * TILE_SIZE + 0.5, 0);
      context.lineTo(x * TILE_SIZE + 0.5, room.height * TILE_SIZE);
    }
    for (var y = 0; y <= room.height; y++) {
      context.moveTo(0, y * TILE_SIZE + 0.5);
      context.lineTo(room.width * TILE_SIZE, y * TILE_SIZE + 0.5);
    }
    context.stroke();
  }

  /**
   * Paints the room for the active set. Positions and camera are read from
   * state and view, never from the set id.
   * @returns {void}
   */
  function drawRoom() {
    if (!state.images) {
      return;
    }

    var sprites = state.images[state.setId];
    var visible = computeFov(state.hero);

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = false;
    context.fillStyle = PAGE_BACKDROP;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);
    context.imageSmoothingEnabled = false;
    context.fillStyle = MAP_BACKDROP;
    context.fillRect(0, 0, room.width * TILE_SIZE, room.height * TILE_SIZE);

    drawTerrain(sprites, visible);
    drawActors(sprites, visible);
    drawLight();
    if (state.showGrid) {
      drawReferenceGrid();
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    publishProbe();
  }

  /**
   * Writes the live comparison numbers where the smoke check can read them.
   * @returns {void}
   */
  function publishProbe() {
    var heroOrigin = spriteOrigin(state.hero.x, state.hero.y, HERO_FRAME);
    var enemyOrigin = spriteOrigin(state.enemy.x, state.enemy.y, ENEMY_FRAME);
    var pactOrigin = spriteOrigin(state.hero.x, state.hero.y, PACT_FRAME);
    var root = document.documentElement;
    root.dataset.pronto = "1";
    root.dataset.conjunto = state.setId;
    root.dataset.heroi = state.hero.x + "," + state.hero.y;
    root.dataset.inimigo = state.enemy.x + "," + state.enemy.y;
    root.dataset.heroiOrigem = heroOrigin.x + "," + heroOrigin.y;
    root.dataset.inimigoOrigem = enemyOrigin.x + "," + enemyOrigin.y;
    root.dataset.pactoOrigem = pactOrigin.x + "," + pactOrigin.y;
    root.dataset.escala = String(view.scale);
    root.dataset.offsetX = String(view.offsetX);
    root.dataset.offsetY = String(view.offsetY);
    root.dataset.grade = state.showGrid ? "1" : "0";
    root.dataset.pacto = state.showPact ? "1" : "0";
    root.dataset.luz = LIGHT_INNER_TILES + "," + FOV_RADIUS + "," + LIGHT_EDGE_ALPHA;
  }

  /**
   * Refreshes the Portuguese status line and the pressed set button.
   * @returns {void}
   */
  function updateStatus() {
    if (state.failed) {
      return;
    }
    var label = state.setId === "voidless" ? "Voidless" : "Pixel";
    setLabel.textContent = label;
    pixelButton.setAttribute("aria-pressed", state.setId === "pixel" ? "true" : "false");
    voidlessButton.setAttribute("aria-pressed", state.setId === "voidless" ? "true" : "false");
    statusLine.textContent =
      "Zoom inteiro " +
      view.scale +
      "× · herói (" +
      state.hero.x +
      "," +
      state.hero.y +
      ") · inimigo (" +
      state.enemy.x +
      "," +
      state.enemy.y +
      ") · pacto " +
      (state.showPact ? "visível, camada separada" : "oculto") +
      " · grade " +
      (state.showGrid ? "ligada" : "desligada") +
      " · alternar o conjunto não move a câmera nem as peças.";
  }

  /**
   * Shows a load or contract error in Portuguese and stops the room.
   * @param {Error|string} error - Failure to show.
   * @returns {void}
   */
  function showError(error) {
    state.failed = true;
    var message = error && error.message ? error.message : String(error);
    errorLine.hidden = false;
    errorLine.textContent = message;
    setLabel.textContent = "falha ao carregar";
    document.documentElement.dataset.pronto = "0";
    document.documentElement.dataset.erro = message;
  }

  /**
   * Selects a set without moving actors or refitting the camera.
   * @param {"pixel"|"voidless"} setId - Set to show.
   * @returns {void}
   */
  function selectSet(setId) {
    if (SET_IDS.indexOf(setId) === -1 || !state.images) {
      return;
    }
    state.setId = setId;
    var url = new URL(window.location.href);
    url.searchParams.set("conjunto", setId);
    window.history.replaceState(null, "", url);
    updateStatus();
    drawRoom();
  }

  /**
   * Moves the hero by one orthogonal step when the destination is floor
   * and is not the enemy tile. Walls and the enemy block the step.
   * @param {number} deltaX - Tile step X, -1, 0 or 1.
   * @param {number} deltaY - Tile step Y, -1, 0 or 1.
   * @returns {void}
   */
  function moveHero(deltaX, deltaY) {
    var nextX = state.hero.x + deltaX;
    var nextY = state.hero.y + deltaY;
    if (nextX < 0 || nextY < 0 || nextX >= room.width || nextY >= room.height) {
      return;
    }
    if (room.tiles[nextY][nextX] !== TILE_FLOOR) {
      return;
    }
    if (nextX === state.enemy.x && nextY === state.enemy.y) {
      return;
    }
    state.hero.x = nextX;
    state.hero.y = nextY;
    updateStatus();
    drawRoom();
  }

  /**
   * Restores the authored actor tiles. The active set, pact and grid stay
   * as they are so a reset cannot be mistaken for an art change.
   * @returns {void}
   */
  function resetPositions() {
    state.hero.x = room.hero.x;
    state.hero.y = room.hero.y;
    state.enemy.x = room.enemy.x;
    state.enemy.y = room.enemy.y;
    updateStatus();
    drawRoom();
  }

  /**
   * Toggles browser fullscreen. Failure leaves the windowed room usable.
   * @returns {Promise<void>}
   */
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      return document.exitFullscreen().then(function () {});
    }
    var request = document.documentElement.requestFullscreen;
    if (!request) {
      return Promise.resolve();
    }
    return request.call(document.documentElement).catch(function () {});
  }

  /**
   * Handles the comparison keys. Unrelated keys are ignored.
   * @param {KeyboardEvent} event - Keydown event.
   * @returns {void}
   */
  function onKeyDown(event) {
    if (!state.images) {
      return;
    }
    if (event.key === "Tab") {
      selectSet(state.setId === "pixel" ? "voidless" : "pixel");
      event.preventDefault();
      return;
    }
    if (event.key === "p" || event.key === "P") {
      selectSet("pixel");
      event.preventDefault();
      return;
    }
    if (event.key === "v" || event.key === "V") {
      selectSet("voidless");
      event.preventDefault();
      return;
    }
    if (event.key === "r" || event.key === "R") {
      resetPositions();
      event.preventDefault();
      return;
    }
    if (event.key === "g" || event.key === "G") {
      state.showGrid = !state.showGrid;
      updateStatus();
      drawRoom();
      event.preventDefault();
      return;
    }
    if (event.key === "c" || event.key === "C") {
      state.showPact = !state.showPact;
      updateStatus();
      drawRoom();
      event.preventDefault();
      return;
    }
    if (event.key === "f" || event.key === "F") {
      toggleFullscreen();
      event.preventDefault();
      return;
    }

    var step = MOVE_KEYS[event.key];
    if (!step) {
      return;
    }
    moveHero(step.x, step.y);
    event.preventDefault();
  }

  /**
   * Redraws after the stage size changes. Actor tiles are not touched.
   * @returns {void}
   */
  function onResize() {
    resizeView();
    updateStatus();
    drawRoom();
  }

  pixelButton.addEventListener("click", function () {
    selectSet("pixel");
  });
  voidlessButton.addEventListener("click", function () {
    selectSet("voidless");
  });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", onResize);

  if (typeof ResizeObserver === "function") {
    var observer = new ResizeObserver(onResize);
    observer.observe(canvas.parentElement);
  }

  loadBothSets()
    .then(function (images) {
      assertAllFrames(images);
      state.images = images;
      document.documentElement.dataset.imagens = String(SET_IDS.length * ASSET_NAMES.length);
      resizeView();
      updateStatus();
      drawRoom();
      canvas.focus();
    })
    .catch(showError);
})();
