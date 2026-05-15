const axios = require('axios');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

const http = axios.create({
  timeout: 15000,
  headers: { 'User-Agent': UA },
});

async function getTokenFromHtml(url, referer, pattern) {
  const res = await http.get(url, { headers: { Referer: referer } });
  const m = res.data.match(pattern);
  return m ? m[1] : null;
}

async function getTokenMegaApi(pageUrl, mdstrmId) {
  const pageRes = await http.get(pageUrl);
  const keyMatch = pageRes.data.match(/serverKey\s*:\s*'([^']+)'/);
  if (!keyMatch) throw new Error(`[Scraper] serverKey no encontrado en ${pageUrl}`);
  const serverKey = keyMatch[1];

  const origin = new URL(pageUrl).origin;
  const apiHost = origin.replace('www.', '').replace('https://', '');
  const apiUrl = `https://api.${apiHost}/api/v1/mdstrm`;

  const res = await http.get(apiUrl, {
    params: { id: mdstrmId, type: 'live', process: 'access_token', key: serverKey, ua: UA },
    headers: { Referer: pageUrl, Origin: origin },
  });

  if (!res.data || !res.data.access_token) {
    throw new Error(`[Scraper] API no devolvió access_token para ${mdstrmId}`);
  }
  return res.data.access_token;
}

async function extractStreamUrl(pageUrl, mdstrmId, tokenConfig) {
  if (!tokenConfig) {
    console.log(`[Scraper] Canal libre: ${mdstrmId}`);
    return buildFallbackUrl(mdstrmId);
  }

  const { type, referer, pattern, player } = tokenConfig;
  let token = null;

  try {
    if (type === 'html-regex') {
      console.log(`[Scraper] Obteniendo token HTML de ${pageUrl}`);
      token = await getTokenFromHtml(pageUrl, referer, pattern);
    } else if (type === 'mega-api') {
      console.log(`[Scraper] Obteniendo token Mega de ${pageUrl}`);
      token = await getTokenMegaApi(pageUrl, mdstrmId);
    }
  } catch (err) {
    console.error(`[Scraper] Error obteniendo token: ${err.message}`);
  }

  if (!token) {
    console.warn(`[Scraper] Sin token, usando fallback para ${mdstrmId}`);
    return buildFallbackUrl(mdstrmId);
  }

  const url = `https://mdstrm.com/live-stream-playlist/${mdstrmId}.m3u8?access_token=${token}${player ? `&player=${player}` : ''}`;
  console.log(`[Scraper] ✅ URL construida para ${mdstrmId}`);
  return url;
}

function buildFallbackUrl(mdstrmId) {
  if (!mdstrmId) return null;
  return `https://mdstrm.com/live-stream-playlist/${mdstrmId}.m3u8`;
}

module.exports = { extractStreamUrl, buildFallbackUrl };
