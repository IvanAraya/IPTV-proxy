const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR =
  process.env.PUPPETEER_CACHE_DIR ||
  (process.env.RENDER
    ? '/opt/render/.cache/puppeteer'
    : path.join(os.homedir(), '.cache', 'puppeteer'));

let browserInstance = null;

/**
 * Busca el ejecutable de Chrome escaneando el directorio de caché.
 * Esto evita depender de que resolveBuildId devuelva el build ID exacto.
 */
function findChromeExecutable() {
  // 1. Variable de entorno explícita (máxima prioridad)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // 2. Ruta que puppeteer mismo conoce
  try {
    const execPath = puppeteer.executablePath();
    if (execPath && fs.existsSync(execPath)) {
      console.log(`[Puppeteer] Chrome encontrado via puppeteer.executablePath(): ${execPath}`);
      return execPath;
    }
  } catch (_) {}

  // 3. Buscar recursivamente en el cache dir
  console.log(`[Puppeteer] Buscando Chrome en: ${CACHE_DIR}`);
  const candidates = findFiles(CACHE_DIR, (f) =>
    (f === 'chrome' || f === 'chrome.exe' || f === 'chromium' || f === 'chromium.exe') &&
    !f.endsWith('.lock')
  );

  if (candidates.length > 0) {
    // Ordenar descendente para preferir versiones más nuevas
    candidates.sort().reverse();
    const found = candidates[0];
    console.log(`[Puppeteer] Chrome encontrado en filesystem: ${found}`);
    return found;
  }

  return null;
}

/**
 * Recorre un directorio recursivamente buscando archivos que cumplan el predicado.
 */
function findFiles(dir, predicate, results = []) {
  if (!fs.existsSync(dir)) return results;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findFiles(full, predicate, results);
      } else if (predicate(entry.name)) {
        // Verificar que sea ejecutable
        try {
          fs.accessSync(full, fs.constants.X_OK);
          results.push(full);
        } catch (_) {}
      }
    }
  } catch (_) {}
  return results;
}

async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  const executablePath = findChromeExecutable();
  if (!executablePath) {
    throw new Error(
      `Chrome no encontrado en ${CACHE_DIR}. ` +
      `Asegúrate de que el buildCommand incluye: node scripts/install-browser.js`
    );
  }

  console.log(`[Puppeteer] Lanzando Chrome: ${executablePath}`);
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
      '--disable-background-networking',
      '--disable-default-apps',
      '--mute-audio',
    ],
  });

  browserInstance.on('disconnected', () => {
    console.log('[Puppeteer] Browser desconectado');
    browserInstance = null;
  });

  return browserInstance;
}

/**
 * Extrae la URL m3u8 con token de una página que use el player de mdstrm.
 */
async function extractStreamUrl(pageUrl, mdstrmId = null) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  let capturedUrl = null;

  try {
    await page.setRequestInterception(true);

    page.on('request', (req) => {
      const type = req.resourceType();
      const url = req.url();

      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
        return;
      }

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
          console.log(`[Scraper] ✅ En response: ${url.substring(0, 80)}...`);
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
      console.log('[Scraper] Esperando que el player inicie...');
      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (capturedUrl) { clearInterval(interval); resolve(); }
        }, 500);
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
