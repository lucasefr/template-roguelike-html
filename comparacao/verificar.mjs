/**
 * Checks the comparison package without npm.
 *
 * File checks always run: PNG contract sizes, known SHA-256 of the ten
 * processed sprites, and the hashes of the default game files so this
 * folder cannot silently replace them.
 *
 * When Chrome is available, a local HTTP server (the same python -m
 * http.server the page is meant to use) loads both sets, toggles them
 * and asserts that hero, enemy, zoom and camera offsets stay put.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createNetServer } from "node:net";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ARTIFACT_DIR = process.env.COMPARACAO_ARTEFATOS || "";
const VIEWPORT = { width: 1360, height: 1040, deviceScaleFactor: 1, mobile: false };

const EXPECTED_SIZE = {
  floor_base: [16, 16],
  wall_n: [16, 16],
  hero_heavy: [16, 24],
  enemy_sample: [16, 24],
  pact_mark: [16, 32],
};

const EXPECTED_SHA256 = {
  "comparacao/assets/pixel/enemy_sample.png": "2b9d67737c41eee977477ba10122051cf24004811e0693be027f4c943dda31fc",
  "comparacao/assets/pixel/floor_base.png": "44996faa42931d6b07bcd3cee0dd51fa93f1f16bb74186704bb1b74cbc730fb5",
  "comparacao/assets/pixel/hero_heavy.png": "865f92517f83f756811e449cadf94dbaaadd116a9e5e1e79911d6faa4cd15e83",
  "comparacao/assets/pixel/pact_mark.png": "ca9528dbbf2792b4cfa2d045ca9a7ddc2647423432301d815024f4a1228b53c5",
  "comparacao/assets/pixel/wall_n.png": "7f897bcdaef3ce6ee4018ea2958ee8e826b4f1f0b8b355dce2cae246c5448d7c",
  "comparacao/assets/voidless/enemy_sample.png": "c1be2e92008bc9fd5cf8c0d200b36f89c0efca44cf53859d967a9f48d14ca3c3",
  "comparacao/assets/voidless/floor_base.png": "d716ffe6a4b77a47f42546b17350ea7309b99a8996edbdd33b9ece3207c37aaa",
  "comparacao/assets/voidless/hero_heavy.png": "7054e41e393600cc07d90312ad9e5b51b2cf8938a2b32cd61f43be739e62289a",
  "comparacao/assets/voidless/pact_mark.png": "47941cc08228d9f319c0a1d39f2e64d4df45b26786b4edc3181a07324c19b77f",
  "comparacao/assets/voidless/wall_n.png": "1d4c5b881859b537977ede21da240fdc8aedcd7c07327a0bd7021f630afda340",
};

const UNTOUCHED_GAME_SHA256 = {
  "index.html": "a6502b0c5315155e8ed91778c82a0f26743670dc86888a046a8764f1fc072c06",
  "game.js": "ac95adc4d5b878effba0359c04010f23e8f03b4cf1ad9efa419735b94803cd32",
  "styles.css": "bc707528a1493bbfe67d453557a693e6d9f18f409bca24bb672b5ac9274de178",
  "assets/sprites.js": "9560421507e7a24c3d1e297a4e87969a809fdba2bffd178f676e95a24798ed44",
  "assets/portrait-hero.jpg": "9d2512cbfbb94aef1a73966941661d5eada598cbcf4e7901fdef0ed68f1bdeaa",
  "assets/sprite-goblin.jpg": "73c171db484854ecbc22199a74a910dd077025a86020434abf52989285bfaaaa",
  "assets/tileset-preview.jpg": "6f94a4ecad065d52b4f46ef1e38cd691801bfd38c08c56ae11d108eba7da7127",
  "assets/ui-banner.jpg": "1cbd5f00f4b66be2227c970787f3b4528778bb122c7c05fe96956c58a557e54d",
};

const failures = [];

/**
 * Records one failed check without stopping the rest of the file checks.
 * @param {string} message - What failed.
 * @returns {void}
 */
function fail(message) {
  failures.push(message);
  console.error("FALHA: " + message);
}

/**
 * Reads a SHA-256 hex digest of a file relative to the repository root.
 * @param {string} relativePath - Path from the repository root.
 * @returns {Promise<string>} Lowercase hex digest.
 */
async function sha256(relativePath) {
  const bytes = await readFile(join(ROOT, relativePath));
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Reads width and height from a PNG IHDR chunk.
 * @param {Buffer} bytes - Full PNG file.
 * @returns {{width:number, height:number}} Pixel size.
 */
function pngSize(bytes) {
  const signature = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("não é PNG");
  }
  const chunkType = bytes.subarray(12, 16).toString("ascii");
  if (chunkType !== "IHDR") {
    throw new Error("IHDR ausente");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Checks sprite bytes, dimensions and that the default game files are intact.
 * @returns {Promise<void>}
 */
async function checkFiles() {
  const seen = new Set();
  for (const [relativePath, expectedHash] of Object.entries(EXPECTED_SHA256)) {
    seen.add(relativePath);
    const bytes = await readFile(join(ROOT, relativePath));
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== expectedHash) {
      fail(relativePath + " hash " + actualHash + " ≠ " + expectedHash);
    }
    const name = relativePath.split("/").pop().replace(".png", "");
    const expected = EXPECTED_SIZE[name];
    let size;
    try {
      size = pngSize(bytes);
    } catch (error) {
      fail(relativePath + " " + error.message);
      continue;
    }
    if (size.width !== expected[0] || size.height !== expected[1]) {
      fail(relativePath + " tamanho " + size.width + "×" + size.height);
    }
  }

  for (const name of Object.keys(EXPECTED_SIZE)) {
    const pixelPath = "comparacao/assets/pixel/" + name + ".png";
    const voidlessPath = "comparacao/assets/voidless/" + name + ".png";
    if (EXPECTED_SHA256[pixelPath] === EXPECTED_SHA256[voidlessPath]) {
      fail(name + " está idêntico nos dois conjuntos");
    }
  }

  if (seen.size !== 10) {
    fail("eram esperados 10 PNG, há " + seen.size);
  }

  for (const [relativePath, expectedHash] of Object.entries(UNTOUCHED_GAME_SHA256)) {
    const actualHash = await sha256(relativePath);
    if (actualHash !== expectedHash) {
      fail("arquivo do jogo alterado: " + relativePath);
    }
  }

  const page = await readFile(join(ROOT, "comparacao/comparacao.js"), "utf8");
  if (!page.includes("LIGHT_EDGE_ALPHA = 0.28") || !page.includes("FOV_RADIUS = 8")) {
    fail("a luz da comparação não conserva os números de game.js");
  }
  if (!page.includes("footY: 24") || !page.includes("footY: 32")) {
    fail("âncoras dos pés ausentes");
  }
}

/**
 * Finds a Chrome/Chromium binary, or returns null when this machine has none.
 * @returns {string|null} Executable path.
 */
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/local/bin/google-chrome",
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || null;
}

/**
 * Reserves a free TCP port and releases it immediately.
 * @returns {Promise<number>} Port number.
 */
function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Starts `python3 -m http.server` from the repository root.
 * This is the same command documented for the local Windows folder,
 * with python3 because that is the interpreter on this machine.
 * @returns {Promise<{port:number, close:function():Promise<void>}>} Server handle.
 */
async function startPythonServer() {
  const port = await reservePort();
  const child = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: ROOT,
    stdio: "ignore",
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/comparacao/index.html");
      if (response.ok) {
        return {
          port: port,
          close: () => {
            child.kill("SIGKILL");
            return new Promise((resolve) => child.once("exit", resolve));
          },
        };
      }
    } catch (error) {
      void error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill("SIGKILL");
  throw new Error("python3 -m http.server não respondeu na porta " + port);
}

/**
 * Minimal Chrome DevTools Protocol client over a WebSocket.
 */
class Cdp {
  /**
   * @param {WebSocket} socket - Connected debugger socket.
   */
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) {
        return;
      }
      const waiter = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        waiter.reject(new Error(JSON.stringify(message.error)));
        return;
      }
      waiter.resolve(message.result);
    });
  }

  /**
   * Sends one CDP command.
   * @param {string} method - Protocol method.
   * @param {object} [params] - Method params.
   * @returns {Promise<object>} Result payload.
   */
  send(method, params) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params: params || {} });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(payload);
    });
  }
}

/**
 * Waits until a predicate returns a truthy value or the timeout elapses.
 * @param {function(): Promise<*>} read - Probe.
 * @param {number} timeoutMs - Maximum wait.
 * @returns {Promise<*>} Last truthy probe value.
 */
async function waitFor(read, timeoutMs) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await read();
    if (last) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("tempo esgotado: " + JSON.stringify(last));
}

/**
 * Opens the comparison page, toggles both sets and saves screenshots.
 * @param {string} chromePath - Chrome executable.
 * @param {number} port - Static server port.
 * @returns {Promise<void>}
 */
async function smokeInBrowser(chromePath, port) {
  const profile = join("/tmp", "limbo-chrome-" + process.pid);
  await mkdir(profile, { recursive: true });
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  let debugPort = 0;
  const stderr = [];
  chrome.stderr.on("data", (chunk) => {
    const text = String(chunk);
    stderr.push(text);
    const match = text.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (match) {
      debugPort = Number(match[1]);
    }
  });

  try {
    await waitFor(async () => debugPort > 0, 10000);
    const version = await fetch("http://127.0.0.1:" + debugPort + "/json/version").then((response) => response.json());
    const browser = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      browser.addEventListener("open", resolve);
      browser.addEventListener("error", reject);
    });
    const browserCdp = new Cdp(browser);
    const { targetId } = await browserCdp.send("Target.createTarget", { url: "about:blank" });
    const { webSocketDebuggerUrl } = (await fetch("http://127.0.0.1:" + debugPort + "/json/list").then((response) => response.json())).find(
      (target) => target.id === targetId
    );
    const pageSocket = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      pageSocket.addEventListener("open", resolve);
      pageSocket.addEventListener("error", reject);
    });
    const page = new Cdp(pageSocket);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", VIEWPORT);

    const pageUrl = "http://127.0.0.1:" + port + "/comparacao/index.html?conjunto=pixel";
    await page.send("Page.navigate", { url: pageUrl });
    const initial = await readProbe(page);
    assertProbe(initial, {
      conjunto: "pixel",
      heroi: "5,3",
      inimigo: "9,6",
      heroiOrigem: "80,40",
      inimigoOrigem: "144,88",
      pactoOrigem: "80,32",
      pacto: "1",
      grade: "0",
      luz: "2,8,0.28",
      imagens: "10",
    });
    if (!/^[1-9]\d*$/.test(initial.escala)) {
      fail("zoom não é inteiro positivo: " + initial.escala);
    }

    await saveShot(page, "sala-pixel.png");
    await dispatchKey(page, "v");
    const voidless = await readProbe(page);
    assertSameCamera(initial, voidless);
    if (voidless.conjunto !== "voidless" || voidless.heroi !== "5,3" || voidless.inimigo !== "9,6") {
      fail("alternar para Voidless moveu a sala ou não trocou o conjunto: " + JSON.stringify(voidless));
    }
    await saveShot(page, "sala-voidless.png");

    await dispatchKey(page, "ArrowRight");
    const moved = await readProbe(page);
    if (moved.heroi !== "6,3" || moved.conjunto !== "voidless") {
      fail("o herói não andou uma célula para a direita em Voidless: " + moved.heroi);
    }
    await dispatchKey(page, "p");
    const back = await readProbe(page);
    if (back.conjunto !== "pixel" || back.heroi !== "6,3" || back.inimigo !== moved.inimigo) {
      fail("voltar a Pixel não preservou a célula do herói: " + JSON.stringify(back));
    }
    if (back.escala !== moved.escala || back.offsetX !== moved.offsetX || back.offsetY !== moved.offsetY) {
      fail("a câmera mudou ao voltar para Pixel");
    }
    await saveShot(page, "sala-pixel-apos-mover.png");

    await dispatchKey(page, "r");
    const reset = await readProbe(page);
    if (reset.heroi !== "5,3" || reset.inimigo !== "9,6" || reset.conjunto !== "pixel") {
      fail("R não repôs as posições sem trocar o conjunto: " + JSON.stringify(reset));
    }

    await page.send("Page.navigate", {
      url: "http://127.0.0.1:" + port + "/comparacao/index.html?conjunto=voidless",
    });
    const direct = await readProbe(page);
    if (direct.conjunto !== "voidless" || direct.heroi !== "5,3") {
      fail("a URL ?conjunto=voidless não abriu o conjunto certo");
    }

    pageSocket.close();
    browser.close();
  } finally {
    chrome.kill("SIGKILL");
    await new Promise((resolve) => chrome.once("exit", resolve));
  }
}

/**
 * Reads the comparison probe from the page. Returns null until the first draw.
 * @param {Cdp} page - Page session.
 * @returns {Promise<object|null>} Dataset snapshot.
 */
async function readProbe(page) {
  return waitFor(async () => {
    const result = await page.send("Runtime.evaluate", {
      expression: "document.documentElement.dataset.pronto==='1' ? JSON.stringify(document.documentElement.dataset) : ''",
      returnByValue: true,
    });
    if (!result.result || !result.result.value) {
      return null;
    }
    return JSON.parse(result.result.value);
  }, 8000);
}

/**
 * Compares probe fields that describe the contract.
 * @param {object} probe - Live dataset.
 * @param {object} expected - Expected string fields.
 * @returns {void}
 */
function assertProbe(probe, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (probe[key] !== value) {
      fail(key + " = " + probe[key] + ", esperado " + value);
    }
  }
}

/**
 * Asserts a toggle kept zoom and camera offsets.
 * @param {object} before - Probe before the toggle.
 * @param {object} after - Probe after the toggle.
 * @returns {void}
 */
function assertSameCamera(before, after) {
  if (before.escala !== after.escala || before.offsetX !== after.offsetX || before.offsetY !== after.offsetY) {
    fail(
      "câmera mudou ao alternar: " +
        before.escala +
        "@" +
        before.offsetX +
        "," +
        before.offsetY +
        " → " +
        after.escala +
        "@" +
        after.offsetX +
        "," +
        after.offsetY
    );
  }
}

/**
 * Dispatches a keydown that the comparison page listens for.
 * @param {Cdp} page - Page session.
 * @param {string} key - KeyboardEvent.key.
 * @returns {Promise<void>}
 */
async function dispatchKey(page, key) {
  await page.send("Runtime.evaluate", {
    expression: "window.dispatchEvent(new KeyboardEvent('keydown',{key:" + JSON.stringify(key) + ",bubbles:true}))",
    returnByValue: true,
  });
}

/**
 * Saves a viewport screenshot when an artifact directory was requested.
 * @param {Cdp} page - Page session.
 * @param {string} name - File name.
 * @returns {Promise<void>}
 */
async function saveShot(page, name) {
  if (!ARTIFACT_DIR) {
    return;
  }
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const shot = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(ARTIFACT_DIR, name), Buffer.from(shot.data, "base64"));
  console.log("screenshot " + join(ARTIFACT_DIR, name));
}

/**
 * Runs file checks and, when Chrome exists, the in-game smoke test.
 * @returns {Promise<void>}
 */
async function main() {
  await checkFiles();
  console.log("arquivos dos dois conjuntos e do jogo padrão conferidos");

  const chromePath = findChrome();
  if (!chromePath) {
    console.log("Chrome ausente: smoke visual não executado");
  } else {
    const server = await startPythonServer();
    try {
      await smokeInBrowser(chromePath, server.port);
      console.log("smoke no navegador: Pixel e Voidless carregaram e a sala não se moveu ao alternar");
    } finally {
      await server.close();
    }
  }

  if (failures.length > 0) {
    console.error(failures.length + " falha(s)");
    process.exit(1);
  }
  console.log("ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
