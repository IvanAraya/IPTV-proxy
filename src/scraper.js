const puppeteer = require('puppeteer-core');
const { computeExecutablePath, resolveBuildId } = require('@puppeteer/browsers');
const path = require('path');
const os = require('os');

const CHROME_VERSION = '127';

// Mismo directorio que usa install-browser.js
const CACHE_DIR =
  process.env.PUPPETEER_CACHE_DIR ||
  (process.env.RENDER
    ? '/opt/render/.cache/puppeteer'
    : path.join(os.homedir(), '.cache', 'puppeteer'));

let browserInstance = null;
let executablePath = null;

// Resuelve la ruta al ejecutable de Chrome descargado
async function getExecutablePath() {
  if (executablePath) return executablePath;

  try {
    const buildId = await resolveBuildId('chrome', process.platform, CHROME_VERSION);
    executablePath = computeExecutablePath({
      browser: 'chrome',
      buildId,
      cacheDir: CACHE_DIR,
    });
    console.log(`[Puppeteer] Chrome en: ${executablePath}`);
    return executablePath;
  } catch (err) {
    console.error('[Puppeteer] No se pudo resolver la ruta de Chrome:', err.message);
    return null;
  }
}

// Reutilizar el mismo browser para no crear uno nuevo por request
async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  const chromePath = await getExecutablePath();
  if (!chromePath) {
    throw new Error('Chrome no disponible. Verifica que el postinstall se ejecutó correctamente.');
  }

  console.log('[Puppeteer] Iniciando browser...');
  browserInstance = await puppeteer.launch({
    executablePath: chromePath,
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
    console.log('[Puppeteer] Browser desconectado, se reiniciará en la próxima petición');
    browserInstance = null;
  });

  return browserInstance;
}

/**
 * Extrae la URL m3u8 con token de una página que use el player de mdstrm.
 * Intercepta las peticiones de red para capturar la URL del playlist.
 *
 * @param {string} pageUrl - URL de la página del canal
 * @param {string|null} mdstrmId - ID conocido del stream en mdstrm (para filtrar)
 * @returns {Promise<string|null>} URL del m3u8 con token, o null si no se encontró
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

      // Bloquear recursos innecesarios
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
        return;
      }

      // Capturar URLs de mdstrm que sean playlists m3u8
      if (url.includes('mdstrm.com') && url.includes('.m3u8')) {
        if (!mdstrmId || url.includes(mdstrmId)) {
          if (!capturedUrl) {
            console.log(`[Scraper] ✅ URL capturada: ${url.substring(0, 80)}...`);
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
          console.log(`[Scraper] ✅ URL en response: ${url.substring(0, 80)}...`);
          capturedUrl = url;
        }
      }
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
    );

    console.log(`[Scraper] Cargando: ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Esperar hasta 15 segundos adicionales para que el player inicie
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

/**
 * URL de fallback usando el ID de mdstrm sin token.
 * Algunos streams de mdstrm funcionan sin token.
 */
function buildFallbackUrl(mdstrmId) {
  if (!mdstrmId) return null;
  return `https://mdstrm.com/live-stream-playlist/${mdstrmId}.m3u8`;
}

module.exports = { extractStreamUrl, buildFallbackUrl };
