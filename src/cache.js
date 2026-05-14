const NodeCache = require('node-cache');

// Caché con TTL de 45 minutos (los tokens de mdstrm duran ~60 min)
// Se renueva automáticamente antes de que expire
const cache = new NodeCache({ stdTTL: 2700, checkperiod: 300 });

// Estado de los refreshes en curso (evita scraping paralelo del mismo canal)
const pendingRefreshes = new Map();

/**
 * Obtiene la URL cacheada para un canal.
 * @param {string} channelId
 * @returns {string|null}
 */
function getCachedUrl(channelId) {
  return cache.get(channelId) || null;
}

/**
 * Guarda la URL de un canal en caché.
 * @param {string} channelId
 * @param {string} url
 * @param {number} ttl - segundos (default: 45 min)
 */
function setCachedUrl(channelId, url, ttl = 2700) {
  cache.set(channelId, url, ttl);
  console.log(`[Cache] Guardado ${channelId} (TTL: ${ttl}s)`);
}

/**
 * Verifica si hay un refresh en curso para el canal.
 */
function isRefreshing(channelId) {
  return pendingRefreshes.has(channelId);
}

/**
 * Registra que un refresh está en curso y devuelve una promesa
 * que se resuelve cuando termina.
 */
function setRefreshing(channelId, promise) {
  pendingRefreshes.set(channelId, promise);
  promise.finally(() => pendingRefreshes.delete(channelId));
  return promise;
}

/**
 * Si hay un refresh en curso, espera a que termine.
 */
function waitForRefresh(channelId) {
  return pendingRefreshes.get(channelId) || Promise.resolve(null);
}

/**
 * Tiempo restante de la caché en segundos.
 */
function getTtl(channelId) {
  return cache.getTtl(channelId);
}

/**
 * Estadísticas del caché (para el panel web).
 */
function getStats() {
  const keys = cache.keys();
  return keys.map((key) => ({
    channel: key,
    ttl: cache.getTtl(key),
    hasUrl: !!cache.get(key),
  }));
}

module.exports = {
  getCachedUrl,
  setCachedUrl,
  isRefreshing,
  setRefreshing,
  waitForRefresh,
  getTtl,
  getStats,
};
