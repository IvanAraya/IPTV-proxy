const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR =
  process.env.PUPPETEER_CACHE_DIR ||
  (process.env.RENDER
    ? '/opt/render/project/src/.cache/puppeteer'
    : path.join(os.homedir(), '.cache', 'puppeteer'));

let browserInstance = null;

/**
 * Busca el ejecutable de Chrome en el cache dir recursivamente.
 * Evita depender de resolveBuildId que puede calcular un path distinto al real.
 */
function findChromeExecutable() {
  // 1. Variable de entorno explícita
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    console.log(`[Puppeteer] Usando PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // 2. puppeteer.executablePath() — sabe exactamente dónde instaló Chrome
  try {
    const execPath = puppeteer.executablePath();
    if (execPath && fs.existsSync(execPath)) {
      console.log(`[Puppeteer] Chrome via executablePath(): ${execPath}`);
      return execPath;
    }
    console.warn(`[Puppeteer] executablePath() devolvió ${execPath} pero no existe`);
  } catch (e) {
    console.warn(`[Puppeteer] executablePath() falló: ${e.message}`);
  }

  // 3. Búsqueda recursiva en el filesystem
  console.log(`[Puppeteer] Buscando Chrome en: ${CACHE_DIR}`);
  const candidates = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name === 'chrome' || entry.name === 'chromium' || entry.name === 'chrome-headless-shell') {
          try { fs.accessSync(full, fs.constants.X_OK); candidates.push(full); } catch (_) {}
        }
      }
    } catch (_) {}
  }
  walk(CACHE_DIR);

  if (candidates.length > 0) {
    candidates.sort().reverse();
    console.log(`[Puppeteer] Chrome encontrado: ${candidates[0]}`);
    return candidates[0];
  }

  return null;
}

async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;

  const executablePath = findChromeExecutable();
  if (!executablePath) {
    throw new Error(
      `Chrome no encontrado en ${CACHE_DIR}.\n` +
      `El buildCommand debe incluir: npx puppeteer browsers install chrome`
    );
  }

  console.log(`[Puppeteer] Lanzando browser...`);
  browserInstance = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-extensions',
      '--mute-audio',
    ],
  });

  browserInstance.on('disconnected', () => {
    console.log('[Puppeteer] Browser desconectado');
    browserInstance = null;
  });

  return browserInstance;
}

async function extractStreamUrl(pageUrl, mdstrmId = null) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  let capturedUrl = null;

  try {
    await page.setRequestInterception(true);

    page.on('request', (req) => {
      const type = req.resourceType();
      const url = req.url();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) { req.abort(); return; }
      if (url.includes('mdstrm.com') && url.includes('.m3u8')) {
        if (!mdstrmId || url.includes(mdstrmId)) {
          if (!capturedUrl) {
            console.log(`[Scraper] ✅ Capturada: ${url.substring(0, 80)}...`);
            capturedUrl = url;
          }
        }
      }
      req.continue();
    });

    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('mdstrm.com') && url.includes('.m3u8') && !capturedUrl) {
        if (!mdstrmId || url.includes(mdstrmId)) {
          console.log(`[Scraper] ✅ Response: ${url.substring(0, 80)}...`);
          capturedUrl = url;
        }
      }
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
    );

    console.log(`[Scraper] Cargando: ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    if (!capturedUrl) {
      console.log('[Scraper] Esperando player...');
      await new Promise((resolve) => {
        const interval = setInterval(() => { if (capturedUrl) { clearInterval(interval); resolve(); } }, 500);
        setTimeout(() => { clearInterval(interval); resolve(); }, 15000);
      });
    }

    return capturedUrl;
  } catch (err) {
    console.error(`[Scraper] Error en ${pageUrl}:`, err.message);
    return null;
  } finally {
    await page.close();
  }
}

function buildFallbackUrl(mdstrmId) {
  if (!mdstrmId) return null;
  return `https://mdstrm.com/live-stream-playlist/${mdstrmId}.m3u8`;
}

module.exports = { extractStreamUrl, buildFallbackUrl };
