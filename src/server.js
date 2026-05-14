const express = require('express');
const path = require('path');
const CHANNELS = require('./channels');
const { extractStreamUrl, buildFallbackUrl } = require('./scraper');
const {
  getCachedUrl,
  setCachedUrl,
  isRefreshing,
  setRefreshing,
  waitForRefresh,
  getStats,
} = require('./cache');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(express.static(path.join(__dirname, '../public')));

// ─────────────────────────────────────────────
// HELPER: obtener URL del stream (caché → scraping → fallback)
// ─────────────────────────────────────────────
async function getStreamUrl(channelId) {
  const channel = CHANNELS[channelId];
  if (!channel) return null;

  // Canales con URL directa (no mdstrm)
  if (channel.directUrl) return channel.directUrl;

  // Verificar caché
  const cached = getCachedUrl(channelId);
  if (cached) {
    console.log(`[${channelId}] ✅ Desde caché`);
    return cached;
  }

  // Si hay un refresh en curso, esperar
  if (isRefreshing(channelId)) {
    console.log(`[${channelId}] ⏳ Esperando refresh en curso...`);
    await waitForRefresh(channelId);
    return getCachedUrl(channelId) || buildFallbackUrl(channel.mdstrmId);
  }

  // Iniciar scraping
  console.log(`[${channelId}] 🔄 Iniciando scraping...`);
  const refreshPromise = (async () => {
    try {
      const url = await extractStreamUrl(channel.sourceUrl, channel.mdstrmId);
      if (url) {
        setCachedUrl(channelId, url);
        return url;
      }
      console.warn(`[${channelId}] ⚠️ Scraping falló, usando fallback`);
      return buildFallbackUrl(channel.mdstrmId);
    } catch (err) {
      console.error(`[${channelId}] Error:`, err.message);
      return buildFallbackUrl(channel.mdstrmId);
    }
  })();

  setRefreshing(channelId, refreshPromise);
  return await refreshPromise;
}

// ─────────────────────────────────────────────
// RUTA: /stream/:channelId — redirige al stream real
// ─────────────────────────────────────────────
app.get('/stream/:channelId', async (req, res) => {
  const { channelId } = req.params;

  if (!CHANNELS[channelId]) {
    return res.status(404).json({ error: `Canal '${channelId}' no encontrado` });
  }

  try {
    const url = await getStreamUrl(channelId);
    if (!url) {
      return res.status(503).json({ error: 'No se pudo obtener el stream' });
    }
    console.log(`[${channelId}] → Redirect a: ${url.substring(0, 80)}...`);
    res.redirect(302, url);
  } catch (err) {
    console.error(`[${channelId}] Error inesperado:`, err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────
// RUTA: /playlist.m3u8 — genera la lista M3U completa
// ─────────────────────────────────────────────
app.get('/playlist.m3u8', (req, res) => {
  const lines = ['#EXTM3U x-tvg-url="https://iptv-org.github.io/epg/guides/cl/programas.cl.epg.xml"', ''];

  for (const [id, ch] of Object.entries(CHANNELS)) {
    const streamUrl = `${BASE_URL}/stream/${id}`;
    lines.push(
      `#EXTINF:-1 tvg-id="${id}" tvg-name="${ch.name}" tvg-logo="${ch.logo || ''}" tvg-country="CL" tvg-language="Spanish" group-title="${ch.group}",${ch.name}`
    );
    lines.push(`#EXTVLCOPT:network-caching=1000`);
    lines.push(streamUrl);
    lines.push('');
  }

  res.setHeader('Content-Type', 'application/x-mpegurl');
  res.setHeader('Content-Disposition', 'attachment; filename="chile-tv.m3u8"');
  res.send(lines.join('\n'));
});

// ─────────────────────────────────────────────
// RUTA: /api/status — estado del caché (JSON)
// ─────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  const stats = getStats();
  const channels = Object.entries(CHANNELS).map(([id, ch]) => {
    const cacheInfo = stats.find((s) => s.channel === id);
    const ttlMs = cacheInfo?.ttl ? cacheInfo.ttl - Date.now() : null;
    return {
      id,
      name: ch.name,
      group: ch.group,
      type: ch.directUrl ? 'direct' : 'mdstrm',
      cached: cacheInfo?.hasUrl || !!ch.directUrl,
      ttlSeconds: ttlMs ? Math.round(ttlMs / 1000) : ch.directUrl ? null : 0,
      streamUrl: `${BASE_URL}/stream/${id}`,
    };
  });
  res.json({ baseUrl: BASE_URL, channels });
});

// ─────────────────────────────────────────────
// RUTA: /api/refresh/:channelId — forzar renovación de token
// ─────────────────────────────────────────────
app.post('/api/refresh/:channelId', async (req, res) => {
  const { channelId } = req.params;
  const channel = CHANNELS[channelId];

  if (!channel) {
    return res.status(404).json({ error: 'Canal no encontrado' });
  }
  if (channel.directUrl) {
    return res.json({ ok: true, message: 'Canal directo, no requiere token' });
  }

  try {
    const url = await extractStreamUrl(channel.sourceUrl, channel.mdstrmId);
    if (url) {
      setCachedUrl(channelId, url);
      res.json({ ok: true, url: url.substring(0, 100) + '...' });
    } else {
      res.status(503).json({ ok: false, error: 'No se pudo obtener el token' });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// RUTA: / — panel web
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─────────────────────────────────────────────
// INICIO
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 mdstrm-proxy corriendo en ${BASE_URL}`);
  console.log(`📺 Lista M3U: ${BASE_URL}/playlist.m3u8`);
  console.log(`📊 Estado:   ${BASE_URL}/api/status\n`);
});

module.exports = app;
