const https = require('https');
const axios = require('axios');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

const MEGA_API = 'https://api.mega.cl/api/v1/mdstrm';

const http = axios.create({
  timeout: 15000,
  headers: { 'User-Agent': UA },
});

const httpInsecure = axios.create({
  timeout: 15000,
  headers: { 'User-Agent': UA },
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
});

async function getTokenFromHtml(url, referer, pattern) {
  const res = await http.get(url, { headers: { Referer: referer } });
  const m = res.data.match(pattern);
  return m ? m[1] : null;
}

async function getTokenMegaApi(pageUrl, mdstrmId, insecure = false) {
  const client = insecure ? httpInsecure : http;
  const pageRes = await client.get(pageUrl);
  const keyMatch = pageRes.data.match(/serverKey\s*:\s*'([^']+)'/);
  if (!keyMatch) throw new Error(`serverKey no encontrado en ${pageUrl}`);
  const serverKey = keyMatch[1];

  const origin = new URL(pageUrl).origin;
  const res = await http.get(MEGA_API, {
    params: { id: mdstrmId, type: 'live', process: 'access_token', key: serverKey, ua: UA },
    headers: { Referer: pageUrl, Origin: origin },
  });

  if (!res.data || !res.data.access_token) {
    throw new Error(`API no devolvió access_token para ${mdstrmId}`);
  }
  return res.data.access_token;
}

async function validateMegaToken(mdstrmId, token, player) {
  const url = `https://mdstrm.com/live-stream-playlist/${mdstrmId}.m3u8?access_token=${token}${player ? `&player=${player}` : ''}`;
  const res = await http.get(url, { maxRedirects: 0, validateStatus: () => true, timeout: 8000 });
  return res.status === 302;
}

async function extractStreamUrl(pageUrl, mdstrmId, tokenConfig) {
  if (!tokenConfig) {
    console.log(`[Scraper] Canal libre: ${mdstrmId}`);
    return buildFallbackUrl(mdstrmId);
  }

  const { type, referer, pattern, player, insecure } = tokenConfig;
  let token = null;

  try {
    if (type === 'html-regex') {
      console.log(`[Scraper] Token HTML: ${pageUrl}`);
      token = await getTokenFromHtml(pageUrl, referer, pattern);
    } else if (type === 'mega-api') {
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`[Scraper] Token Mega API: ${pageUrl} (intento ${attempt}/${MAX_ATTEMPTS})`);
        try {
          token = await getTokenMegaApi(pageUrl, mdstrmId, insecure);
          const valid = await validateMegaToken(mdstrmId, token, player);
          if (valid) {
            console.log(`[Scraper] Token válido en intento ${attempt}`);
            break;
          }
          console.warn(`[Scraper] Token CLOSED_ACCESS (intento ${attempt}), reintentando...`);
          token = null;
        } catch (err) {
          console.error(`[Scraper] Error intento ${attempt}: ${err.message}`);
          if (attempt === MAX_ATTEMPTS) token = null;
        }
      }
    }
  } catch (err) {
    console.error(`[Scraper] Error obteniendo token (${mdstrmId}): ${err.message}`);
  }

  if (!token) {
    console.warn(`[Scraper] Sin token válido para ${mdstrmId}`);
    return null;
  }

  const url = `https://mdstrm.com/live-stream-playlist/${mdstrmId}.m3u8?access_token=${token}${player ? `&player=${player}` : ''}`;
  console.log(`[Scraper] ✅ ${mdstrmId}`);
  return url;
}

function buildFallbackUrl(mdstrmId) {
  if (!mdstrmId) return null;
  return `https://mdstrm.com/live-stream-playlist/${mdstrmId}.m3u8`;
}

module.exports = { extractStreamUrl, buildFallbackUrl };
