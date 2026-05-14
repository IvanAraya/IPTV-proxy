/**
 * Descarga Chrome durante el build (postinstall).
 * Se ejecuta automáticamente después de `npm install`.
 * Usa la misma versión que puppeteer-core 22.15.0 espera.
 */
const { install, resolveBuildId } = require('@puppeteer/browsers');
const path = require('path');
const os = require('os');

const CHROME_VERSION = '127'; // Versión compatible con puppeteer-core 22.15.0

// En Render el cache va en /opt/render/.cache/puppeteer
// En local va en ~/.cache/puppeteer
const CACHE_DIR =
  process.env.PUPPETEER_CACHE_DIR ||
  (process.env.RENDER
    ? '/opt/render/.cache/puppeteer'
    : path.join(os.homedir(), '.cache', 'puppeteer'));

async function main() {
  console.log(`[install-browser] Instalando Chrome ${CHROME_VERSION} en: ${CACHE_DIR}`);

  try {
    const buildId = await resolveBuildId('chrome', process.platform, CHROME_VERSION);
    console.log(`[install-browser] Build ID resuelto: ${buildId}`);

    const result = await install({
      browser: 'chrome',
      buildId,
      cacheDir: CACHE_DIR,
      downloadProgressCallback: (downloadedBytes, totalBytes) => {
        if (totalBytes > 0) {
          const pct = Math.round((downloadedBytes / totalBytes) * 100);
          if (pct % 20 === 0) process.stdout.write(`\r[install-browser] Descargando... ${pct}%`);
        }
      },
    });

    console.log(`\n[install-browser] ✅ Chrome instalado en: ${result.executablePath}`);
  } catch (err) {
    console.error('[install-browser] ❌ Error instalando Chrome:', err.message);
    // No fallar el build — el scraper tiene fallback sin browser
    process.exit(0);
  }
}

main();
