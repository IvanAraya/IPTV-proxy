const puppeteer = require('puppeteer');

let browserInstance = null;

// Reutilizar el mismo browser para no crear uno nuevo por request
async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  console.log('[Puppeteer] Iniciando browser...');
  browserInstance = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // Necesario en algunos entornos Docker/free tier
      '--disable-extensions',
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
 * @param {string} pageUrl - URL de la página del canal (ej. https://www.mega.cl/senal-en-vivo/)
 * @param {string} mdstrmId - ID conocido del stream en mdstrm (opcional, para filtrar)
 * @returns {Promise<string|null>} URL del m3u8 con token, o null si no se encontró
 */
async function extractStreamUrl(pageUrl, mdstrmId = null) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  // Resultado capturado por interceptación de red
  let capturedUrl = null;

  try {
    // Bloquear recursos innecesarios para acelerar la carga
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      const url = req.url();

      // Dejar pasar scripts (necesarios para el player) y XHR/fetch
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
        return;
      }

      // Capturar URLs de mdstrm que sean playlists m3u8
      if (url.includes('mdstrm.com') && url.includes('.m3u8')) {
        // Si tenemos un ID específico, filtrar por él
        if (!mdstrmId || url.includes(mdstrmId)) {
          if (!capturedUrl) {
            console.log(`[Scraper] ✅ URL capturada: ${url.substring(0, 80)}...`);
            capturedUrl = url;
          }
        }
      }

      req.continue();
    });

    // También capturar de las respuestas (algunos players usan fetch interno)
    page.on('response', async (res) => {
      const url = res.url();
      if (
        url.includes('mdstrm.com') &&
        url.includes('.m3u8') &&
        !capturedUrl
      ) {
        if (!mdstrmId || url.includes(mdstrmId)) {
          console.log(`[Scraper] ✅ URL en response: ${url.substring(0, 80)}...`);
          capturedUrl = url;
        }
      }
    });

    console.log(`[Scraper] Cargando página: ${pageUrl}`);

    // Simular un navegador real
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(pageUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Esperar hasta 15 segundos adicionales para que el player inicie
    if (!capturedUrl) {
      console.log('[Scraper] Esperando que el player inicie el stream...');
      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (capturedUrl) {
            clearInterval(interval);
            resolve();
          }
        }, 500);
        setTimeout(() => {
          clearInterval(interval);
          resolve();
        }, 15000);
      });
    }

    return capturedUrl;
  } catch (err) {
    console.error(`[Scraper] Error scrapeando ${pageUrl}:`, err.message);
    return null;
  } finally {
    await page.close();
  }
}

/**
 * Construye una URL de fallback usando el ID de mdstrm sin token.
 * Algunos streams de mdstrm funcionan sin token (depende del canal).
 */
function buildFallbackUrl(mdstrmId) {
  if (!mdstrmId) return null;
  return `https://mdstrm.com/live-stream-playlist/${mdstrmId}.m3u8`;
}

module.exports = { extractStreamUrl, buildFallbackUrl };
