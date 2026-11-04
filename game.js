/**
 * Template Roguelike HTML — XP progression, items/equipment, floor difficulty.
 */
(function () {
  "use strict";

  const TILE = {
    WALL: 0,
    FLOOR: 1,
    STAIRS: 2,
  };

  const MAP_WIDTH = 40;
  const MAP_HEIGHT = 30;
  const CELL_SIZE = 20;
  const FOV_RADIUS = 8;
  const MAX_LOG_LINES = 60;
  const MAX_VISIBLE_LOG = 5;
  const MAX_INVENTORY = 6;
  const BASE_PLAYER_MAX_HP = 12;
  const BASE_PLAYER_ATK = 3;
  const BASE_PLAYER_DEF = 0;

  const KEY_TO_DELTA = {
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

  /**
   * Item catalog. Equipment modifies stats; potions are consumable heals.
   * @type {Object.<string, {
   *   id:string, name:string, kind:"potion"|"weapon"|"armor",
   *   sprite:string, heal?:number, atk?:number, def?:number, maxHp?:number, tier:number
   * }>}
   */
  const ITEM_DEFS = {
    potion_minor: {
      id: "potion_minor",
      name: "Poção menor",
      kind: "potion",
      sprite: "potion",
      heal: 6,
      tier: 1,
    },
    potion_major: {
      id: "potion_major",
      name: "Poção maior",
      kind: "potion",
      sprite: "potion",
      heal: 14,
      tier: 3,
    },
    rusty_sword: {
      id: "rusty_sword",
      name: "Espada enferrujada",
      kind: "weapon",
      sprite: "sword",
      atk: 1,
      tier: 1,
    },
    iron_sword: {
      id: "iron_sword",
      name: "Espada de ferro",
      kind: "weapon",
      sprite: "sword",
      atk: 3,
      tier: 2,
    },
    steel_sword: {
      id: "steel_sword",
      name: "Espada de aço",
      kind: "weapon",
      sprite: "sword",
      atk: 5,
      tier: 4,
    },
    leather_armor: {
      id: "leather_armor",
      name: "Armadura de couro",
      kind: "armor",
      sprite: "armor",
      def: 1,
      maxHp: 2,
      tier: 1,
    },
    chain_armor: {
      id: "chain_armor",
      name: "Cota de malha",
      kind: "armor",
      sprite: "armor",
      def: 2,
      maxHp: 4,
      tier: 3,
    },
    plate_armor: {
      id: "plate_armor",
      name: "Armadura de placas",
      kind: "armor",
      sprite: "armor",
      def: 3,
      maxHp: 7,
      tier: 5,
    },
  };

  /**
   * Enemy archetypes unlocked by floor depth.
   * behavior:
   * - chase: closes distance every turn
   * - swarm: chase, then a second step when healthy
   * - erratic: 50% random step, 50% chase
   * - skittish: flees below half HP, otherwise chase
   * - ranged: keeps distance and attacks from afar
   * - ambush: idle until the player is close
   * - haunt: ignores walls of fog sooner and always chases
   * @type {Array<{
   *   id:string, name:string, sprite:string, minFloor:number,
   *   baseHp:number, baseAtk:number, xp:number, weight:number,
   *   behavior:string, attackRange?:number
   * }>}
   */
  const ENEMY_TYPES = [
    { id: "rat", name: "Rato", sprite: "rat", minFloor: 1, baseHp: 2, baseAtk: 1, xp: 3, weight: 9, behavior: "swarm" },
    { id: "goblin", name: "Goblin", sprite: "goblin", minFloor: 1, baseHp: 4, baseAtk: 1, xp: 5, weight: 10, behavior: "chase" },
    { id: "slime", name: "Slime", sprite: "slime", minFloor: 2, baseHp: 7, baseAtk: 1, xp: 6, weight: 7, behavior: "erratic" },
    { id: "bat", name: "Morcego", sprite: "bat", minFloor: 2, baseHp: 3, baseAtk: 2, xp: 6, weight: 7, behavior: "skittish" },
    { id: "skeleton", name: "Esqueleto", sprite: "skeleton", minFloor: 3, baseHp: 6, baseAtk: 2, xp: 9, weight: 7, behavior: "ranged", attackRange: 3 },
    { id: "orc", name: "Orc", sprite: "orc", minFloor: 3, baseHp: 9, baseAtk: 3, xp: 11, weight: 6, behavior: "chase" },
    { id: "spider", name: "Aranha", sprite: "spider", minFloor: 4, baseHp: 5, baseAtk: 3, xp: 10, weight: 6, behavior: "ambush" },
    { id: "brute", name: "Bruto", sprite: "brute", minFloor: 6, baseHp: 16, baseAtk: 5, xp: 18, weight: 4, behavior: "chase" },
    { id: "wraith", name: "Espectro", sprite: "wraith", minFloor: 7, baseHp: 10, baseAtk: 4, xp: 20, weight: 3, behavior: "haunt", attackRange: 2 },
  ];

  const sprites = window.RoguelikeSprites.createSprites();

  /**
   * Returns a random integer in the inclusive range [min, max].
   * @param {number} min - Lower bound (inclusive).
   * @param {number} max - Upper bound (inclusive).
   * @returns {number} Random integer between min and max.
   */
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Returns true with the given probability.
   * @param {number} chance - Probability from 0 to 1.
   * @returns {boolean} Whether the roll succeeded.
   */
  function chance(chance) {
    return Math.random() < chance;
  }

  /**
   * Chebyshev distance between two grid points.
   * @param {{x:number,y:number}} a - First point.
   * @param {{x:number,y:number}} b - Second point.
   * @returns {number} Distance in tiles.
   */
  function chebyshevDistance(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  /**
   * Creates a filled 2D grid.
   * @param {number} width - Columns.
   * @param {number} height - Rows.
   * @param {*} fill - Initial value.
   * @returns {*[][]} Grid [y][x].
   */
  function createEmptyMap(width, height, fill) {
    const map = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        row.push(fill);
      }
      map.push(row);
    }
    return map;
  }

  /**
   * Digs a rectangular floor room.
   * @param {number[][]} map - Tile map.
   * @param {{x:number,y:number,w:number,h:number}} room - Room bounds.
   * @returns {void}
   */
  function carveRoom(map, room) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        map[y][x] = TILE.FLOOR;
      }
    }
  }

  /**
   * Digs an L-shaped corridor between two points.
   * @param {number[][]} map - Tile map.
   * @param {{x:number,y:number}} from - Start.
   * @param {{x:number,y:number}} to - End.
   * @returns {void}
   */
  function carveCorridor(map, from, to) {
    let x = from.x;
    let y = from.y;
    while (x !== to.x) {
      map[y][x] = TILE.FLOOR;
      x += x < to.x ? 1 : -1;
    }
    while (y !== to.y) {
      map[y][x] = TILE.FLOOR;
      y += y < to.y ? 1 : -1;
    }
    map[to.y][to.x] = TILE.FLOOR;
  }

  /**
   * Returns the center of a room.
   * @param {{x:number,y:number,w:number,h:number}} room - Room.
   * @returns {{x:number,y:number}} Center tile.
   */
  function roomCenter(room) {
    return {
      x: Math.floor(room.x + room.w / 2),
      y: Math.floor(room.y + room.h / 2),
    };
  }

  /**
   * Checks room overlap with 1-tile padding.
   * @param {{x:number,y:number,w:number,h:number}} a - First room.
   * @param {{x:number,y:number,w:number,h:number}} b - Second room.
   * @returns {boolean} True when overlapping.
   */
  function roomsOverlap(a, b) {
    return (
      a.x <= b.x + b.w + 1 &&
      a.x + a.w + 1 >= b.x &&
      a.y <= b.y + b.h + 1 &&
      a.y + a.h + 1 >= b.y
    );
  }

  /**
   * Generates a room-and-corridor dungeon.
   * @param {number} width - Map width.
   * @param {number} height - Map height.
   * @param {number} roomCount - Desired room count.
   * @returns {{map:number[][], rooms:Array<{x:number,y:number,w:number,h:number}>}}
   */
  function generateDungeon(width, height, roomCount) {
    const map = createEmptyMap(width, height, TILE.WALL);
    const rooms = [];

    for (let attempt = 0; attempt < roomCount * 12 && rooms.length < roomCount; attempt++) {
      const w = randomInt(4, 8);
      const h = randomInt(4, 7);
      const x = randomInt(1, width - w - 2);
      const y = randomInt(1, height - h - 2);
      const room = { x, y, w, h };
      if (rooms.some((other) => roomsOverlap(room, other))) {
        continue;
      }
      carveRoom(map, room);
      if (rooms.length > 0) {
        carveCorridor(map, roomCenter(rooms[rooms.length - 1]), roomCenter(room));
      }
      rooms.push(room);
    }

    return { map, rooms };
  }

  /**
   * Returns XP required to go from the given level to the next.
   * @param {number} level - Current character level.
   * @returns {number} XP threshold for the next level-up.
   */
  function xpRequiredForLevel(level) {
    return 10 + level * 8;
  }

  /**
   * Numeric difficulty rating derived from floor depth.
   * @param {number} floor - Current dungeon floor (1-based).
   * @returns {number} Difficulty score shown in the HUD.
   */
  function getDifficultyRating(floor) {
    return floor + Math.floor((floor - 1) / 2);
  }

  /**
   * Builds a short threat description for the current floor.
   * @param {number} floor - Current dungeon floor.
   * @returns {string} Localized threat blurb.
   */
  function getThreatText(floor) {
    const names = ENEMY_TYPES.filter((type) => type.minFloor <= floor).map((type) => type.name);
    const preview = names.slice(-3).join(", ");
    if (floor >= 7) {
      return "Andar " + floor + ": Espectros e brutos rondam. Inimigos ativos: " + preview + ".";
    }
    if (floor >= 4) {
      return "Andar " + floor + ": Aranhas de emboscada e esqueletos à distância. Veja: " + preview + ".";
    }
    if (floor >= 2) {
      return "Andar " + floor + ": Slimes erráticos e morcegos. Inimigos: " + preview + ".";
    }
    return "Andar " + floor + ": Ratos e goblins. Mate para XP e procure itens no chão.";
  }

  /**
   * Creates a fresh player at the given spawn tile.
   * @param {number} x - Spawn X.
   * @param {number} y - Spawn Y.
   * @returns {object} Player entity with progression fields.
   */
  function createPlayer(x, y) {
    return {
      id: "player",
      name: "You",
      sprite: "player",
      x,
      y,
      hp: BASE_PLAYER_MAX_HP,
      level: 1,
      xp: 0,
      xpToNext: xpRequiredForLevel(1),
      baseMaxHp: BASE_PLAYER_MAX_HP,
      baseAtk: BASE_PLAYER_ATK,
      baseDef: BASE_PLAYER_DEF,
      equipment: {
        weapon: null,
        armor: null,
      },
      inventory: [],
      isPlayer: true,
    };
  }

  /**
   * Computes effective combat stats from base values + equipment.
   * @param {object} player - Player entity.
   * @returns {{maxHp:number, atk:number, def:number}} Effective stats.
   */
  function getPlayerStats(player) {
    const weapon = player.equipment.weapon ? ITEM_DEFS[player.equipment.weapon] : null;
    const armor = player.equipment.armor ? ITEM_DEFS[player.equipment.armor] : null;
    return {
      maxHp: player.baseMaxHp + (armor && armor.maxHp ? armor.maxHp : 0),
      atk: player.baseAtk + (weapon && weapon.atk ? weapon.atk : 0),
      def: player.baseDef + (armor && armor.def ? armor.def : 0),
    };
  }

  /**
   * Formats an equipment item for the gear panel.
   * @param {string|null} itemId - Equipped item id or null.
   * @returns {string} Display label.
   */
  function formatEquipmentLabel(itemId) {
    if (!itemId) {
      return "—";
    }
    const def = ITEM_DEFS[itemId];
    if (!def) {
      return "—";
    }
    if (def.kind === "weapon") {
      return def.name + " (+" + def.atk + " ATK)";
    }
    return def.name + " (+" + def.def + " DEF)";
  }

  /**
   * Picks a weighted enemy archetype available on this floor.
   * @param {number} floor - Current floor.
   * @returns {object} Enemy type definition.
   */
  function pickEnemyType(floor) {
    const pool = ENEMY_TYPES.filter((type) => type.minFloor <= floor);
    const totalWeight = pool.reduce((sum, type) => sum + type.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const type of pool) {
      roll -= type.weight;
      if (roll <= 0) {
        return type;
      }
    }
    return pool[0];
  }

  /**
   * Creates an enemy scaled by floor difficulty.
   * @param {string} id - Unique entity id.
   * @param {number} x - Spawn X.
   * @param {number} y - Spawn Y.
   * @param {number} floor - Current floor depth.
   * @returns {object} Enemy entity.
   */
  function createEnemy(id, x, y, floor) {
    const type = pickEnemyType(floor);
    const hpScale = floor - 1;
    const atkScale = Math.floor((floor - 1) * 0.75);
    const hp = type.baseHp + hpScale * 2;
    const atk = type.baseAtk + atkScale;
    const xp = type.xp + floor * 2;

    return {
      id,
      name: type.name,
      sprite: type.sprite,
      x,
      y,
      hp,
      maxHp: hp,
      atk,
      xpReward: xp,
      behavior: type.behavior,
      attackRange: type.attackRange || 1,
      isPlayer: false,
    };
  }

  /**
   * Returns cardinal step deltas toward a target (primary then secondary axis).
   * @param {{x:number,y:number}} from - Origin position.
   * @param {{x:number,y:number}} to - Target position.
   * @returns {{primary:{x:number,y:number}, secondary:{x:number,y:number}}} Step options.
   */
  function getApproachSteps(from, to) {
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    const primary =
      Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
        ? { x: dx, y: 0 }
        : { x: 0, y: dy };
    const secondary = primary.x !== 0 ? { x: 0, y: dy } : { x: dx, y: 0 };
    return { primary, secondary };
  }

  /**
   * Returns cardinal step deltas away from a target.
   * @param {{x:number,y:number}} from - Origin position.
   * @param {{x:number,y:number}} awayFrom - Position to flee from.
   * @returns {{primary:{x:number,y:number}, secondary:{x:number,y:number}}} Step options.
   */
  function getFleeSteps(from, awayFrom) {
    return getApproachSteps(from, {
      x: from.x - (awayFrom.x - from.x),
      y: from.y - (awayFrom.y - from.y),
    });
  }

  /**
   * Attempts primary then secondary step for an enemy.
   * @param {object} enemy - Enemy entity.
   * @param {{x:number,y:number}} primary - Preferred delta.
   * @param {{x:number,y:number}} secondary - Fallback delta.
   * @returns {boolean} True when a step/attack occurred.
   */
  function stepWithFallback(enemy, primary, secondary) {
    if (tryMove(enemy, primary.x, primary.y)) {
      return true;
    }
    return tryMove(enemy, secondary.x, secondary.y);
  }

  /**
   * Performs a non-adjacent ranged attack when the target is in range and visible.
   * @param {object} enemy - Attacking enemy.
   * @returns {boolean} True when a ranged attack was performed.
   */
  function tryRangedAttack(enemy) {
    const distance = chebyshevDistance(enemy, state.player);
    if (distance <= 1 || distance > enemy.attackRange) {
      return false;
    }
    if (!state.visible[enemy.y][enemy.x]) {
      return false;
    }
    attack(enemy, state.player);
    return true;
  }

  /**
   * Builds a loot table filtered by floor tier.
   * @param {number} floor - Current floor.
   * @returns {string[]} Item ids that can drop.
   */
  function getLootPool(floor) {
    return Object.keys(ITEM_DEFS).filter((id) => ITEM_DEFS[id].tier <= floor + 1);
  }

  /**
   * Creates a ground item instance from a definition id.
   * @param {string} defId - Item definition id.
   * @param {number} x - Tile X.
   * @param {number} y - Tile Y.
   * @returns {object} Ground item entity.
   */
  function createGroundItem(defId, x, y) {
    const def = ITEM_DEFS[defId];
    return {
      id: "item-" + defId + "-" + x + "-" + y + "-" + Math.random().toString(16).slice(2, 6),
      defId: def.id,
      name: def.name,
      kind: def.kind,
      sprite: def.sprite,
      x,
      y,
    };
  }

  /**
   * Rolls a random loot drop for the current floor.
   * @param {number} floor - Current floor.
   * @param {number} x - Drop X.
   * @param {number} y - Drop Y.
   * @returns {object|null} Ground item or null when nothing drops.
   */
  function rollLootDrop(floor, x, y) {
    const dropChance = Math.min(0.22 + floor * 0.04, 0.55);
    if (!chance(dropChance)) {
      return null;
    }
    const pool = getLootPool(floor);
    if (pool.length === 0) {
      return null;
    }
    const defId = pool[randomInt(0, pool.length - 1)];
    return createGroundItem(defId, x, y);
  }

  /**
   * Computes FOV with Bresenham rays and Chebyshev radius.
   * @param {number[][]} map - Tile map.
   * @param {{x:number,y:number}} origin - Viewer.
   * @param {number} radius - Sight radius.
   * @returns {boolean[][]} Visibility grid.
   */
  function computeFov(map, origin, radius) {
    const height = map.length;
    const width = map[0].length;
    const visible = createEmptyMap(width, height, false);

    /**
     * Casts a LOS ray and marks visible tiles until a wall.
     * @param {number} tx - Target X.
     * @param {number} ty - Target Y.
     * @returns {void}
     */
    function castRay(tx, ty) {
      let x0 = origin.x;
      let y0 = origin.y;
      const dx = Math.abs(tx - x0);
      const dy = Math.abs(ty - y0);
      const sx = x0 < tx ? 1 : -1;
      const sy = y0 < ty ? 1 : -1;
      let err = dx - dy;

      while (true) {
        if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) {
          break;
        }
        visible[y0][x0] = true;
        if (map[y0][x0] === TILE.WALL && !(x0 === origin.x && y0 === origin.y)) {
          break;
        }
        if (x0 === tx && y0 === ty) {
          break;
        }
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x0 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y0 += sy;
        }
      }
    }

    for (let y = origin.y - radius; y <= origin.y + radius; y++) {
      for (let x = origin.x - radius; x <= origin.x + radius; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) {
          continue;
        }
        if (chebyshevDistance(origin, { x, y }) > radius) {
          continue;
        }
        castRay(x, y);
      }
    }

    return visible;
  }

  /** @type {object} */
  let state;

  /** @type {{scale:number, offsetX:number, offsetY:number}} */
  const view = { scale: 1, offsetX: 0, offsetY: 0 };

  let isGameStarted = false;

  const gameShell = document.getElementById("gameShell");
  const hudElement = document.getElementById("hud");
  const bootScreen = document.getElementById("bootScreen");
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const logElement = document.getElementById("log");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const inventoryElement = document.getElementById("inventory");

  /**
   * Fits the pixel map into the current window while keeping integer-ish scale.
   * @returns {void}
   */
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(window.innerWidth * dpr));
    const height = Math.max(1, Math.floor(window.innerHeight * dpr));
    canvas.width = width;
    canvas.height = height;

    const mapW = MAP_WIDTH * CELL_SIZE;
    const mapH = MAP_HEIGHT * CELL_SIZE;
    const scale = Math.min(width / mapW, height / mapH);
    view.scale = scale;
    view.offsetX = (width - mapW * scale) / 2;
    view.offsetY = (height - mapH * scale) / 2;
  }

  /**
   * Requests browser fullscreen on the game shell element.
   * @returns {Promise<void>}
   */
  async function enterFullscreen() {
    if (document.fullscreenElement) {
      return;
    }
    try {
      if (gameShell.requestFullscreen) {
        await gameShell.requestFullscreen();
      } else if (gameShell.webkitRequestFullscreen) {
        await gameShell.webkitRequestFullscreen();
      }
    } catch (error) {
      // Fullscreen can be blocked by the browser; windowed mode still works.
    }
    resizeCanvas();
  }

  /**
   * Toggles browser fullscreen for the game shell.
   * @returns {Promise<void>}
   */
  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await enterFullscreen();
    }
    resizeCanvas();
  }

  /**
   * Starts the run and optionally enters fullscreen from the boot screen.
   * @param {object} [options]
   * @param {boolean} [options.fullscreen=false] - Request fullscreen when true.
   * @returns {Promise<void>}
   */
  async function beginGame(options) {
    const wantFullscreen = options && options.fullscreen;
    bootScreen.classList.add("is-hidden");
    if (wantFullscreen) {
      await enterFullscreen();
    }
    if (!isGameStarted) {
      isGameStarted = true;
      startFloor({ resetRun: true });
      requestAnimationFrame(tickAnimation);
    }
    resizeCanvas();
    canvas.focus();
  }

  /**
   * Appends a styled message to the adventure log.
   * @param {string} text - Message body.
   * @param {"info"|"good"|"bad"|"warn"} [kind="info"] - Visual category.
   * @returns {void}
   */
  function logMessage(text, kind) {
    const type = kind || "info";
    state.messages.push({ text, kind: type });
    if (state.messages.length > MAX_LOG_LINES) {
      state.messages.shift();
    }
    const li = document.createElement("li");
    li.className = type;
    li.textContent = text;
    logElement.appendChild(li);
    while (logElement.children.length > MAX_VISIBLE_LOG) {
      logElement.removeChild(logElement.firstChild);
    }
  }

  /**
   * Rebuilds the inventory list UI from player.inventory.
   * @returns {void}
   */
  function renderInventory() {
    inventoryElement.innerHTML = "";
    for (let i = 0; i < MAX_INVENTORY; i++) {
      const li = document.createElement("li");
      const itemId = state.player.inventory[i];
      if (!itemId) {
        li.className = "empty";
        li.textContent = "Slot " + (i + 1) + " vazio";
        inventoryElement.appendChild(li);
        continue;
      }
      const def = ITEM_DEFS[itemId];
      li.innerHTML =
        '<span class="slot-key">' +
        (i + 1) +
        "</span><span>" +
        def.name +
        '</span><span>+' +
        def.heal +
        " HP</span>";
      inventoryElement.appendChild(li);
    }
  }

  /**
   * Syncs HUD meters, chips, gear labels, inventory and threat text.
   * @returns {void}
   */
  function updateHud() {
    const stats = getPlayerStats(state.player);
    const hpRatio = stats.maxHp <= 0 ? 0 : state.player.hp / stats.maxHp;
    const xpRatio = state.player.xpToNext <= 0 ? 0 : state.player.xp / state.player.xpToNext;

    document.getElementById("hp").textContent = String(state.player.hp);
    document.getElementById("maxHp").textContent = String(stats.maxHp);
    document.getElementById("atk").textContent = String(stats.atk);
    document.getElementById("def").textContent = String(stats.def);
    document.getElementById("floor").textContent = String(state.floor);
    document.getElementById("difficulty").textContent = String(getDifficultyRating(state.floor));
    document.getElementById("turn").textContent = String(state.turn);
    document.getElementById("level").textContent = String(state.player.level);
    document.getElementById("xp").textContent = String(state.player.xp);
    document.getElementById("xpNext").textContent = String(state.player.xpToNext);
    document.getElementById("hpBar").style.width = Math.round(hpRatio * 100) + "%";
    document.getElementById("xpBar").style.width = Math.round(xpRatio * 100) + "%";
    document.getElementById("weaponSlot").textContent = formatEquipmentLabel(state.player.equipment.weapon);
    document.getElementById("armorSlot").textContent = formatEquipmentLabel(state.player.equipment.armor);
    document.getElementById("threatText").textContent = getThreatText(state.floor);
    renderInventory();
  }

  /**
   * Shows or hides the end-of-run overlay.
   * @param {boolean} isVisible - Whether overlay should appear.
   * @param {string} [title] - Overlay heading.
   * @param {string} [text] - Overlay body text.
   * @returns {void}
   */
  function setOverlay(isVisible, title, text) {
    if (!isVisible) {
      overlay.classList.add("is-hidden");
      return;
    }
    overlayTitle.textContent = title || "Fim de jogo";
    overlayText.textContent = text || "Pressione R para reiniciar.";
    overlay.classList.remove("is-hidden");
  }

  /**
   * Returns whether a tile can be walked on.
   * @param {number} x - Tile X.
   * @param {number} y - Tile Y.
   * @returns {boolean} Walkability.
   */
  function isWalkable(x, y) {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) {
      return false;
    }
    const tile = state.map[y][x];
    return tile === TILE.FLOOR || tile === TILE.STAIRS;
  }

  /**
   * Finds a living enemy on a tile.
   * @param {number} x - Tile X.
   * @param {number} y - Tile Y.
   * @returns {object|null} Enemy or null.
   */
  function getEnemyAt(x, y) {
    return state.enemies.find((enemy) => enemy.hp > 0 && enemy.x === x && enemy.y === y) || null;
  }

  /**
   * Finds a ground item on a tile.
   * @param {number} x - Tile X.
   * @param {number} y - Tile Y.
   * @returns {object|null} Item or null.
   */
  function getItemAt(x, y) {
    return state.items.find((item) => item.x === x && item.y === y) || null;
  }

  /**
   * Refreshes FOV and explored fog-of-war.
   * @returns {void}
   */
  function refreshVision() {
    state.visible = computeFov(state.map, state.player, FOV_RADIUS);
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (state.visible[y][x]) {
          state.explored[y][x] = true;
        }
      }
    }
  }

  /**
   * Spawns enemies with count and power scaled by floor.
   * @param {Array<{x:number,y:number,w:number,h:number}>} rooms - Rooms.
   * @param {number} floor - Floor depth.
   * @returns {object[]} Enemies.
   */
  function spawnEnemies(rooms, floor) {
    const enemies = [];
    let enemyIndex = 0;
    const maxPerRoom = 1 + Math.min(3, Math.floor(floor / 2));

    for (let i = 1; i < rooms.length; i++) {
      const room = rooms[i];
      const count = randomInt(1, maxPerRoom);
      for (let n = 0; n < count; n++) {
        const x = randomInt(room.x, room.x + room.w - 1);
        const y = randomInt(room.y, room.y + room.h - 1);
        if (getEnemyAt(x, y) || (x === state.player.x && y === state.player.y)) {
          continue;
        }
        enemies.push(createEnemy("enemy-" + enemyIndex++, x, y, floor));
      }
    }
    return enemies;
  }

  /**
   * Spawns guaranteed and random ground loot across rooms.
   * @param {Array<{x:number,y:number,w:number,h:number}>} rooms - Rooms.
   * @param {number} floor - Floor depth.
   * @returns {object[]} Ground items.
   */
  function spawnItems(rooms, floor) {
    const items = [];
    const pool = getLootPool(floor);

    // Guaranteed potion somewhere past the first room.
    if (rooms.length > 1 && pool.length > 0) {
      const room = rooms[randomInt(1, rooms.length - 1)];
      const x = randomInt(room.x, room.x + room.w - 1);
      const y = randomInt(room.y, room.y + room.h - 1);
      const potionId = floor >= 4 && chance(0.45) ? "potion_major" : "potion_minor";
      items.push(createGroundItem(potionId, x, y));
    }

    const extraDrops = Math.min(rooms.length - 1, 1 + Math.floor(floor / 2));
    for (let i = 0; i < extraDrops; i++) {
      const room = rooms[randomInt(1, rooms.length - 1)];
      const x = randomInt(room.x, room.x + room.w - 1);
      const y = randomInt(room.y, room.y + room.h - 1);
      if (items.some((item) => item.x === x && item.y === y)) {
        continue;
      }
      const drop = rollLootDrop(floor, x, y);
      if (drop) {
        items.push(drop);
      }
    }

    return items;
  }

  /**
   * Starts a new floor or a full new run.
   * @param {object} [options]
   * @param {boolean} [options.resetRun=false] - Reset progression when true.
   * @returns {void}
   */
  function startFloor(options) {
    const resetRun = options && options.resetRun;
    const nextFloor = resetRun ? 1 : state ? state.floor + 1 : 1;
    const roomCount = Math.min(12, 7 + Math.floor(nextFloor / 2));
    const { map, rooms } = generateDungeon(MAP_WIDTH, MAP_HEIGHT, roomCount);

    if (rooms.length === 0) {
      throw new Error("Dungeon generation failed: no rooms carved.");
    }

    const start = roomCenter(rooms[0]);
    const exit = roomCenter(rooms[rooms.length - 1]);
    map[exit.y][exit.x] = TILE.STAIRS;

    const previousPlayer = state && state.player && !resetRun ? state.player : null;
    const player = previousPlayer
      ? {
          ...previousPlayer,
          x: start.x,
          y: start.y,
        }
      : createPlayer(start.x, start.y);

    if (previousPlayer) {
      const stats = getPlayerStats(player);
      player.hp = Math.min(stats.maxHp, player.hp + 2 + Math.floor(nextFloor / 3));
    }

    state = {
      map,
      explored: createEmptyMap(MAP_WIDTH, MAP_HEIGHT, false),
      visible: createEmptyMap(MAP_WIDTH, MAP_HEIGHT, false),
      player,
      enemies: [],
      items: [],
      floor: nextFloor,
      turn: resetRun || !state ? 0 : state.turn,
      isGameOver: false,
      messages: [],
      floaters: [],
    };

    state.enemies = spawnEnemies(rooms, state.floor);
    state.items = spawnItems(rooms, state.floor);
    logElement.innerHTML = "";
    setOverlay(false);
    refreshVision();
    updateHud();

    if (resetRun || nextFloor === 1) {
      logMessage("Nova run. Mate inimigos para XP e equipe o que encontrar.", "info");
    } else {
      logMessage(
        "Andar " + state.floor + " — dificuldade " + getDifficultyRating(state.floor) + ". Você recupera um pouco de vida.",
        "good"
      );
    }
  }

  /**
   * Spawns a floating combat/status number above a tile.
   * @param {number} x - Tile X.
   * @param {number} y - Tile Y.
   * @param {string} text - Floater text.
   * @param {string} color - CSS color.
   * @returns {void}
   */
  function spawnFloater(x, y, text, color) {
    state.floaters.push({
      x,
      y,
      text,
      color,
      life: 1,
    });
  }

  /**
   * Applies level-ups while the player has enough XP.
   * @returns {void}
   */
  function processLevelUps() {
    while (state.player.xp >= state.player.xpToNext) {
      state.player.xp -= state.player.xpToNext;
      state.player.level += 1;
      state.player.xpToNext = xpRequiredForLevel(state.player.level);
      state.player.baseMaxHp += 2;
      state.player.baseAtk += 1;
      if (state.player.level % 3 === 0) {
        state.player.baseDef += 1;
      }
      const stats = getPlayerStats(state.player);
      state.player.hp = Math.min(stats.maxHp, state.player.hp + 4);
      spawnFloater(state.player.x, state.player.y, "LEVEL UP!", "#ffd27a");
      logMessage(
        "Nível " + state.player.level + "! +2 HP máx, +1 ATK" + (state.player.level % 3 === 0 ? ", +1 DEF" : "") + ".",
        "warn"
      );
    }
  }

  /**
   * Grants XP for a defeated enemy and checks for level-ups.
   * @param {object} enemy - Defeated enemy.
   * @returns {void}
   */
  function grantXp(enemy) {
    state.player.xp += enemy.xpReward;
    spawnFloater(enemy.x, enemy.y, "+" + enemy.xpReward + " XP", "#c4b0ff");
    logMessage("+" + enemy.xpReward + " XP (" + enemy.name + ").", "info");
    processLevelUps();
  }

  /**
   * Equips a weapon/armor, replacing a weaker piece when needed.
   * @param {string} defId - Item definition id.
   * @returns {boolean} True when the item was equipped (or kept as upgrade).
   */
  function equipItem(defId) {
    const def = ITEM_DEFS[defId];
    const slot = def.kind === "weapon" ? "weapon" : "armor";
    const currentId = state.player.equipment[slot];
    const current = currentId ? ITEM_DEFS[currentId] : null;

    const newScore = (def.atk || 0) + (def.def || 0) + (def.maxHp || 0);
    const oldScore = current ? (current.atk || 0) + (current.def || 0) + (current.maxHp || 0) : -1;

    if (current && newScore <= oldScore) {
      logMessage("Você ignora " + def.name + " (já tem algo melhor).", "info");
      return false;
    }

    const oldHp = state.player.hp;
    const oldStats = getPlayerStats(state.player);
    state.player.equipment[slot] = defId;
    const newStats = getPlayerStats(state.player);

    // Preserve HP ratio-ish when maxHp changes from armor swaps.
    if (newStats.maxHp !== oldStats.maxHp) {
      const ratio = oldStats.maxHp > 0 ? oldHp / oldStats.maxHp : 1;
      state.player.hp = Math.max(1, Math.min(newStats.maxHp, Math.round(ratio * newStats.maxHp)));
    }

    logMessage("Equipou: " + formatEquipmentLabel(defId) + ".", "good");
    return true;
  }

  /**
   * Adds a potion to inventory if there is free space.
   * @param {string} defId - Potion definition id.
   * @returns {boolean} True when stored.
   */
  function storePotion(defId) {
    if (state.player.inventory.length >= MAX_INVENTORY) {
      logMessage("Inventário cheio! Não foi possível guardar a poção.", "bad");
      return false;
    }
    state.player.inventory.push(defId);
    logMessage("Guardou " + ITEM_DEFS[defId].name + " no inventário.", "good");
    return true;
  }

  /**
   * Picks up a ground item under/at the player (equip or store).
   * @param {object} item - Ground item entity.
   * @returns {boolean} True when the item was consumed from the floor.
   */
  function pickupItem(item) {
    const def = ITEM_DEFS[item.defId];
    let accepted = false;

    if (def.kind === "potion") {
      accepted = storePotion(def.id);
    } else {
      accepted = equipItem(def.id);
      // Even if weaker, remove from floor only when equipped; otherwise leave it.
    }

    if (accepted) {
      state.items = state.items.filter((entry) => entry.id !== item.id);
      spawnFloater(item.x, item.y, def.name, "#ffd27a");
    }
    return accepted;
  }

  /**
   * Uses a potion from an inventory slot (0-based index).
   * @param {number} slotIndex - Inventory index.
   * @returns {boolean} True when a turn was spent.
   */
  function useInventorySlot(slotIndex) {
    if (state.isGameOver) {
      return false;
    }
    const defId = state.player.inventory[slotIndex];
    if (!defId) {
      logMessage("Slot " + (slotIndex + 1) + " está vazio.", "info");
      return false;
    }

    const def = ITEM_DEFS[defId];
    const stats = getPlayerStats(state.player);
    if (state.player.hp >= stats.maxHp) {
      logMessage("Vida já está cheia.", "info");
      return false;
    }

    const heal = Math.min(def.heal, stats.maxHp - state.player.hp);
    state.player.hp += heal;
    state.player.inventory.splice(slotIndex, 1);
    spawnFloater(state.player.x, state.player.y, "+" + heal + " HP", "#9ad67a");
    logMessage("Você bebe " + def.name + " e recupera " + heal + " HP.", "good");
    return true;
  }

  /**
   * Applies attack damage (DEF reduces incoming hits) and handles death/loot/XP.
   * @param {object} attacker - Attacking entity.
   * @param {object} defender - Defending entity.
   * @returns {void}
   */
  function attack(attacker, defender) {
    let damage = attacker.isPlayer ? getPlayerStats(attacker).atk : attacker.atk;

    if (defender.isPlayer) {
      const def = getPlayerStats(defender).def;
      damage = Math.max(1, damage - def);
    }

    defender.hp = Math.max(0, defender.hp - damage);
    spawnFloater(defender.x, defender.y, "-" + damage, attacker.isPlayer ? "#9ad67a" : "#ff8f7a");

    if (attacker.isPlayer) {
      logMessage("Você acerta o " + defender.name + " (" + damage + ").", "good");
    } else {
      const isRanged = chebyshevDistance(attacker, defender) > 1;
      logMessage(
        isRanged
          ? "O " + attacker.name + " ataca à distância (" + damage + ")."
          : "O " + attacker.name + " te acerta (" + damage + ").",
        "bad"
      );
    }

    if (defender.hp > 0) {
      return;
    }

    if (defender.isPlayer) {
      state.isGameOver = true;
      logMessage("Você caiu na dungeon...", "bad");
      setOverlay(
        true,
        "Você caiu",
        "Chegou ao andar " + state.floor + " como nível " + state.player.level + ". Pressione R para reiniciar."
      );
      return;
    }

    logMessage("O " + defender.name + " é derrotado!", "warn");
    grantXp(defender);

    const drop = rollLootDrop(state.floor, defender.x, defender.y);
    if (drop && !getItemAt(drop.x, drop.y)) {
      state.items.push(drop);
      logMessage("O " + defender.name + " deixou " + drop.name + ".", "info");
    }

    state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  }

  /**
   * Tries to move an entity, fight, or pick up items (player only).
   * @param {object} entity - Moving entity.
   * @param {number} dx - Delta X.
   * @param {number} dy - Delta Y.
   * @returns {boolean} True when the action spends a turn.
   */
  function tryMove(entity, dx, dy) {
    const nx = entity.x + dx;
    const ny = entity.y + dy;
    if (!isWalkable(nx, ny)) {
      return false;
    }

    if (entity.isPlayer) {
      const enemy = getEnemyAt(nx, ny);
      if (enemy) {
        attack(entity, enemy);
        return true;
      }
    } else {
      if (state.player.x === nx && state.player.y === ny) {
        attack(entity, state.player);
        return true;
      }
      if (getEnemyAt(nx, ny)) {
        return false;
      }
    }

    entity.x = nx;
    entity.y = ny;

    if (entity.isPlayer) {
      const item = getItemAt(nx, ny);
      if (item) {
        pickupItem(item);
      }
    }

    return true;
  }

  /**
   * Moves/attacks according to the enemy behavior archetype.
   * @param {object} enemy - Enemy entity.
   * @returns {void}
   */
  function updateEnemy(enemy) {
    const distance = chebyshevDistance(enemy, state.player);
    const awareness = enemy.behavior === "haunt" ? FOV_RADIUS + 3 : FOV_RADIUS;

    if (enemy.behavior !== "haunt" && !state.visible[enemy.y][enemy.x] && distance > awareness) {
      return;
    }
    if (enemy.behavior === "haunt" && distance > awareness) {
      return;
    }

    if (enemy.behavior === "ambush" && distance > 3) {
      return;
    }

    if (enemy.behavior === "skittish" && enemy.hp <= enemy.maxHp / 2 && distance <= 4) {
      const flee = getFleeSteps(enemy, state.player);
      stepWithFallback(enemy, flee.primary, flee.secondary);
      return;
    }

    if (enemy.behavior === "ranged" || (enemy.behavior === "haunt" && enemy.attackRange > 1)) {
      if (distance <= 1) {
        const flee = getFleeSteps(enemy, state.player);
        if (stepWithFallback(enemy, flee.primary, flee.secondary)) {
          return;
        }
      }
      if (tryRangedAttack(enemy)) {
        return;
      }
      if (distance > enemy.attackRange) {
        const approach = getApproachSteps(enemy, state.player);
        stepWithFallback(enemy, approach.primary, approach.secondary);
      } else if (distance < enemy.attackRange) {
        const flee = getFleeSteps(enemy, state.player);
        stepWithFallback(enemy, flee.primary, flee.secondary);
      }
      return;
    }

    if (enemy.behavior === "erratic" && chance(0.45)) {
      const dirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ];
      const pick = dirs[randomInt(0, dirs.length - 1)];
      tryMove(enemy, pick.x, pick.y);
      return;
    }

    const approach = getApproachSteps(enemy, state.player);
    stepWithFallback(enemy, approach.primary, approach.secondary);

    // Swarm enemies dash a second tile only while still closing distance.
    if (
      enemy.behavior === "swarm" &&
      enemy.hp > enemy.maxHp / 2 &&
      !state.isGameOver &&
      chebyshevDistance(enemy, state.player) > 1
    ) {
      const again = getApproachSteps(enemy, state.player);
      stepWithFallback(enemy, again.primary, again.secondary);
    }
  }

  /**
   * Runs every living enemy turn.
   * @returns {void}
   */
  function processEnemyTurns() {
    for (const enemy of [...state.enemies]) {
      if (enemy.hp <= 0 || state.isGameOver) {
        continue;
      }
      updateEnemy(enemy);
    }
  }

  /**
   * Advances to the next floor when standing on stairs.
   * @returns {void}
   */
  function checkStairs() {
    if (state.map[state.player.y][state.player.x] !== TILE.STAIRS) {
      return;
    }
    startFloor({ resetRun: false });
  }

  /**
   * Ends the player action phase and runs enemies when needed.
   * @returns {void}
   */
  function afterPlayerAction() {
    state.turn += 1;
    checkStairs();
    if (state.isGameOver) {
      updateHud();
      return;
    }
    processEnemyTurns();
    refreshVision();
    updateHud();
  }

  /**
   * Resolves one player action and the following enemy phase.
   * @param {number} dx - Move delta X.
   * @param {number} dy - Move delta Y.
   * @param {boolean} [isWait=false] - Wait instead of moving.
   * @returns {void}
   */
  function playerAct(dx, dy, isWait) {
    if (state.isGameOver) {
      return;
    }

    let acted = false;
    if (isWait) {
      acted = true;
      logMessage("Você observa o corredor.", "info");
    } else {
      const beforeX = state.player.x;
      const beforeY = state.player.y;
      acted = tryMove(state.player, dx, dy);
      if (!acted && beforeX === state.player.x && beforeY === state.player.y) {
        return;
      }
    }

    if (!acted) {
      return;
    }

    afterPlayerAction();
  }

  /**
   * Picks the wall/floor/stairs sprite for a map tile.
   * @param {number} tile - Tile id.
   * @param {number} x - Tile X.
   * @param {number} y - Tile Y.
   * @returns {string} Sprite name.
   */
  function tileSpriteName(tile, x, y) {
    if (tile === TILE.STAIRS) {
      return "stairs";
    }
    if (tile === TILE.FLOOR) {
      return "floor";
    }
    const below = y + 1 < MAP_HEIGHT ? state.map[y + 1][x] : TILE.WALL;
    if (below !== TILE.WALL) {
      return "wallTop";
    }
    return "wall";
  }

  /**
   * Renders the dungeon, items, entities, fog, and floaters scaled to the window.
   * @returns {void}
   */
  function draw() {
    if (!state) {
      return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#050302";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);

    const mapPixelW = MAP_WIDTH * CELL_SIZE;
    const mapPixelH = MAP_HEIGHT * CELL_SIZE;
    ctx.fillStyle = "#070504";
    ctx.fillRect(0, 0, mapPixelW, mapPixelH);

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (!state.explored[y][x]) {
          continue;
        }
        const visible = state.visible[y][x];
        const tile = state.map[y][x];
        const name = tileSpriteName(tile, x, y);
        const alpha = visible ? 1 : 0.35;
        sprites.draw(ctx, name, x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE, alpha);
      }
    }

    for (const item of state.items) {
      if (!state.explored[item.y][item.x]) {
        continue;
      }
      const alpha = state.visible[item.y][item.x] ? 1 : 0.4;
      sprites.draw(ctx, item.sprite, item.x * CELL_SIZE, item.y * CELL_SIZE, CELL_SIZE, CELL_SIZE, alpha);
    }

    for (const enemy of state.enemies) {
      if (!state.visible[enemy.y][enemy.x]) {
        continue;
      }
      sprites.draw(ctx, enemy.sprite, enemy.x * CELL_SIZE, enemy.y * CELL_SIZE, CELL_SIZE, CELL_SIZE, 1);

      const hpRatio = enemy.hp / enemy.maxHp;
      const barW = CELL_SIZE - 4;
      const barX = enemy.x * CELL_SIZE + 2;
      const barY = enemy.y * CELL_SIZE + 1;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(barX, barY, barW, 3);
      ctx.fillStyle = "#c44a3a";
      ctx.fillRect(barX, barY, Math.max(1, barW * hpRatio), 3);
    }

    sprites.draw(
      ctx,
      state.player.sprite,
      state.player.x * CELL_SIZE,
      state.player.y * CELL_SIZE,
      CELL_SIZE,
      CELL_SIZE,
      1
    );

    const gradient = ctx.createRadialGradient(
      state.player.x * CELL_SIZE + CELL_SIZE / 2,
      state.player.y * CELL_SIZE + CELL_SIZE / 2,
      CELL_SIZE * 2,
      state.player.x * CELL_SIZE + CELL_SIZE / 2,
      state.player.y * CELL_SIZE + CELL_SIZE / 2,
      CELL_SIZE * FOV_RADIUS
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, mapPixelW, mapPixelH);

    for (const floater of state.floaters) {
      ctx.globalAlpha = Math.max(0, floater.life);
      ctx.fillStyle = floater.color;
      ctx.font = "bold 14px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        floater.text,
        floater.x * CELL_SIZE + CELL_SIZE / 2,
        floater.y * CELL_SIZE - (1 - floater.life) * 18
      );
      ctx.globalAlpha = 1;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Advances floater lifetimes and keeps the render loop alive.
   * @returns {void}
   */
  function tickAnimation() {
    if (!isGameStarted) {
      return;
    }
    if (state && state.floaters) {
      state.floaters = state.floaters
        .map((floater) => ({ ...floater, life: floater.life - 0.03 }))
        .filter((floater) => floater.life > 0);
    }
    draw();
    requestAnimationFrame(tickAnimation);
  }

  /**
   * Handles movement, wait, potion hotkeys, HUD/fullscreen toggles, and restart.
   * @param {KeyboardEvent} event - Keydown event.
   * @returns {void}
   */
  function onKeyDown(event) {
    if (!isGameStarted) {
      return;
    }

    if (event.key === "f" || event.key === "F") {
      toggleFullscreen();
      event.preventDefault();
      return;
    }

    if (event.key === "h" || event.key === "H") {
      hudElement.classList.toggle("is-hidden");
      event.preventDefault();
      return;
    }

    if (event.key === "r" || event.key === "R") {
      startFloor({ resetRun: true });
      event.preventDefault();
      return;
    }

    if (state.isGameOver) {
      return;
    }

    if (/^[1-6]$/.test(event.key)) {
      const used = useInventorySlot(Number(event.key) - 1);
      if (used) {
        afterPlayerAction();
      } else {
        updateHud();
      }
      event.preventDefault();
      return;
    }

    if (event.key === "." || event.key === " " || event.key === "Numpad5") {
      playerAct(0, 0, true);
      event.preventDefault();
      return;
    }

    const delta = KEY_TO_DELTA[event.key];
    if (!delta) {
      return;
    }
    playerAct(delta.x, delta.y, false);
    event.preventDefault();
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("orientationchange", resizeCanvas);
  document.addEventListener("fullscreenchange", resizeCanvas);
  window.addEventListener("keydown", onKeyDown);

  document.getElementById("btnStart").addEventListener("click", function () {
    beginGame({ fullscreen: true });
  });
  document.getElementById("btnStartWindowed").addEventListener("click", function () {
    beginGame({ fullscreen: false });
  });
  document.getElementById("btnFullscreen").addEventListener("click", function () {
    toggleFullscreen();
    canvas.focus();
  });
  document.getElementById("btnRestart").addEventListener("click", function () {
    startFloor({ resetRun: true });
    canvas.focus();
  });

  document.querySelectorAll(".pad-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!isGameStarted || state.isGameOver) {
        return;
      }
      if (button.getAttribute("data-wait") === "1") {
        playerAct(0, 0, true);
        return;
      }
      const dx = Number(button.getAttribute("data-dx") || 0);
      const dy = Number(button.getAttribute("data-dy") || 0);
      playerAct(dx, dy, false);
    });
  });
})();

