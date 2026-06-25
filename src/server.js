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

// Detecta la URL base automáticamente desde los headers del request.
// En Render, x-forwarded-proto = 'https' y host = 'tu-servicio.onrender.com'
// No requiere ninguna variable de entorno.
function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || `localhost:${PORT}`;
  // x-forwarded-proto puede venir como "https,http" — tomar solo el primero
  const cleanProto = proto.split(',')[0].trim();
  return `${cleanProto}://${host}`;
}

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

  // Iniciar fetch de token
  console.log(`[${channelId}] 🔄 Obteniendo token...`);
  const refreshPromise = (async () => {
    try {
      const url = await extractStreamUrl(
        channel.tokenConfig?.url,
        channel.mdstrmId,
        channel.tokenConfig
      );
      if (url) {
        setCachedUrl(channelId, url);
        return url;
      }
      console.warn(`[${channelId}] ⚠️ Sin URL, usando fallback`);
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
// RUTA: /stream/:channelId
// ─────────────────────────────────────────────
app.get('/stream/:channelId', async (req, res) => {
  const { channelId } = req.params;
  const channel = CHANNELS[channelId];

  if (!channel) {
    return res.status(404).json({ error: `Canal '${channelId}' no encontrado` });
  }
  if (channel.enabled === false) {
    return res.status(404).json({ error: `Canal '${channelId}' deshabilitado` });
  }

  try {
    const url = await getStreamUrl(channelId);
    if (!url) {
      return res.status(503).json({ error: 'No se pudo obtener el stream' });
    }

    // Redirigir al player directo a la URL del stream.
    // El player sigue la cadena de redirecciones desde su propia IP (Chile),
    // evitando el geo-bloqueo que mdstrm aplica a las IPs de Render.com (EE.UU.).
    console.log(`[${channelId}] → ${url}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.redirect(302, url);
  } catch (err) {
    console.error(`[${channelId}] Error:`, err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────
// RUTA: /playlist.m3u8 — genera la lista M3U completa
// ─────────────────────────────────────────────
app.get('/playlist.m3u8', (req, res) => {
  const baseUrl = getBaseUrl(req);
  const lines = ['#EXTM3U x-tvg-url="https://iptv-org.github.io/epg/guides/cl/programas.cl.epg.xml"', ''];

  for (const [id, ch] of Object.entries(CHANNELS)) {
    if (ch.enabled === false) continue;
    const streamUrl = ch.directUrl || `${baseUrl}/stream/${id}`;
    lines.push(
      //`#EXTINF:-1 tvg-id="${id}" tvg-name="${ch.name}" tvg-logo="${ch.logo || ''}" tvg-country="CL" tvg-language="Spanish" ,${ch.name}`
      `#EXTINF:0, ${ch.name}`
    );
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
  const baseUrl = getBaseUrl(req);
  const stats = getStats();
  const channels = Object.entries(CHANNELS).map(([id, ch]) => {
    const cacheInfo = stats.find((s) => s.channel === id);
    const ttlMs = cacheInfo?.ttl ? cacheInfo.ttl - Date.now() : null;
    return {
      id,
      name: ch.name,
      logo: ch.logo || '',
      enabled: ch.enabled !== false,
      type: ch.directUrl ? 'direct' : 'mdstrm',
      cached: cacheInfo?.hasUrl || !!ch.directUrl,
      ttlSeconds: ttlMs ? Math.round(ttlMs / 1000) : ch.directUrl ? null : 0,
      streamUrl: `${baseUrl}/stream/${id}`,
    };
  });
  res.json({ baseUrl, playlistUrl: `${baseUrl}/playlist.m3u8`, channels });
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
    const url = await extractStreamUrl(
      channel.tokenConfig?.url,
      channel.mdstrmId,
      channel.tokenConfig
    );
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
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─────────────────────────────────────────────
// INICIO
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 iptv-proxy corriendo en el puerto ${PORT}`);
  console.log(`   La URL pública se detecta automáticamente desde los headers HTTP\n`);
});

module.exports = app;
